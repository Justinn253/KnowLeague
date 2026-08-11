'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AchievementToasts } from '@/components/achievement-toasts';
import { CumulativeAchievementTracker } from '@/components/cumulative-achievement-tracker';
import { AppHeader } from '@/components/app-header';
import { PlayerGameStatsSync } from '@/components/player-game-stats-sync';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { getSessionScopedRequest, subscribeToAuthSession } from '@/lib/auth-session-client';
import { forfeitStoredMultiplayerSessions, reconcileStoredMultiplayerSessionsAwayFromGame } from '@/lib/multiplayer-client-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole } from '@/lib/moderation';

export function GlobalActions() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileAway, setProfileAway] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [moderationRole, setModerationRole] = useState<Extract<AppRole, 'moderator' | 'admin'> | null>(null);
  const firstLoginSubmittedRef = useRef<Set<string>>(new Set());
  const activeSessionRef = useRef<Session | null>(null);
  const profileAppRoleRef = useRef<string | null>(null);

  useEffect(() => {
    const handleOwnPresence = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; away?: boolean }>).detail;
      if (detail.userId && activeSessionRef.current?.user.id === detail.userId) {
        setProfileAway(detail.away === true);
      }
    };

    window.addEventListener('knowleague:own-presence', handleOwnPresence);
    return () => window.removeEventListener('knowleague:own-presence', handleOwnPresence);
  }, []);

  const logOut = async () => {
    await forfeitStoredMultiplayerSessions();
    const supabase = getOptionalSupabaseClient();
    await supabase?.auth.signOut({ scope: 'local' });
    router.push('/login');
  };

  useEffect(() => {
    void reconcileStoredMultiplayerSessionsAwayFromGame(pathname);
  }, [pathname]);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }
    let sessionValidationInterval: number | null = null;
    let sessionValidationInFlight = false;
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let subscribedProfileId: string | null = null;

    const validateSession = async (session: Session) => {
      if (sessionValidationInFlight) return;
      sessionValidationInFlight = true;
      try {
        const response = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (response.ok || activeSessionRef.current?.access_token !== session.access_token) {
          return;
        }

        await forfeitStoredMultiplayerSessions();
        await supabase.auth.signOut({ scope: 'local' });
        router.push('/login');
      } catch {
        // A transient network failure should not sign the user out locally.
      } finally {
        sessionValidationInFlight = false;
      }
    };

    const updateSessionValidation = (session: Session | null) => {
      if (sessionValidationInterval) {
        window.clearInterval(sessionValidationInterval);
        sessionValidationInterval = null;
      }
      if (!session) return;

      void validateSession(session);
      sessionValidationInterval = window.setInterval(() => {
        const activeSession = activeSessionRef.current;
        if (activeSession) void validateSession(activeSession);
      }, 60_000);
    };

    const updateModerationRole = async (session: Session, force = false) => {
      try {
        const response = await fetch('/api/moderation/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: force ? 'no-store' : 'default',
        });
        const data = await response.json() as { role?: AppRole | null };
        if (!response.ok) {
          throw new Error('Unable to load moderation role.');
        }
        const role = data.role;
        setModerationRole(role === 'moderator' || role === 'admin' ? role : null);
      } catch {
        setModerationRole(null);
      }
    };

    const updateProfileAction = async (
      session?: Session | null,
      forceProfile = false,
      forceModeration = false,
    ) => {
      activeSessionRef.current = session ?? null;
      if (!session) {
        profileAppRoleRef.current = null;
        setProfileAway(false);
        setProfileAvatarUrl(null);
        setProfileUsername(null);
        setIsLoggedIn(false);
        setPendingFriendRequests(0);
        setModerationRole(null);
        return;
      }
      const userId = session.user.id;

      setIsLoggedIn(true);
      void updateModerationRole(session, forceModeration);
      const firstLoginStorageKey = `knowleague:v1:achievement:first-login:${userId}`;
      if (!firstLoginSubmittedRef.current.has(userId) && window.localStorage.getItem(firstLoginStorageKey) !== 'synced') {
        firstLoginSubmittedRef.current.add(userId);
        void submitAchievementEvent('first_login').then((result) => {
          if (result) {
            window.localStorage.setItem(firstLoginStorageKey, 'synced');
          } else {
            firstLoginSubmittedRef.current.delete(userId);
          }
        });
      }
      const profileResult = await getSessionScopedRequest('global-profile', session, async () => supabase
        .from('profiles')
        .select('username, display_name, avatar_url, app_role')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string; avatar_url: string | null; app_role: string | null }>(), { force: forceProfile || forceModeration });
      const { data } = profileResult;
      profileAppRoleRef.current = data?.app_role ?? null;
      setProfileUsername(data?.username?.trim() || null);
      setProfileAvatarUrl(data?.avatar_url ?? null);
    };

    const replaceProfileSubscription = (session: Session | null) => {
      const userId = session?.user.id ?? null;
      if (subscribedProfileId === userId) {
        return;
      }

      if (profileChannel) {
        void supabase.removeChannel(profileChannel);
        profileChannel = null;
      }

      subscribedProfileId = userId;
      if (!userId) {
        return;
      }

      profileChannel = supabase
        .channel(`profile-action:${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        }, (payload) => {
          const nextProfile = payload.new as { app_role?: string };
          const activeSession = activeSessionRef.current;
          if (!activeSession || activeSession.user.id !== userId) {
            return;
          }

          const roleChanged = typeof nextProfile.app_role === 'string'
            && profileAppRoleRef.current !== null
            && profileAppRoleRef.current !== nextProfile.app_role;
          profileAppRoleRef.current = nextProfile.app_role ?? profileAppRoleRef.current;
          void updateProfileAction(activeSession, true, roleChanged);
        })
        .subscribe();
    };

    const unsubscribeFromAuthSession = subscribeToAuthSession((session, event) => {
      activeSessionRef.current = session;
      updateSessionValidation(session);
      replaceProfileSubscription(session);
      if (event === 'SIGNED_IN' && session) {
        setProfileAway(false);
        void updateProfileAction(session);
        return;
      }
      void updateProfileAction(session);
    });

    return () => {
      if (sessionValidationInterval) {
        window.clearInterval(sessionValidationInterval);
      }
      unsubscribeFromAuthSession();
      if (profileChannel) {
        void supabase.removeChannel(profileChannel);
      }
    };
  }, [router]);

  return (
    <>
      <PlayerGameStatsSync />
      <CumulativeAchievementTracker />

      <AppHeader
        isLoggedIn={isLoggedIn}
        profileAvatarUrl={profileAvatarUrl}
        profileUsername={profileUsername}
        profileAway={profileAway}
        pendingFriendRequests={pendingFriendRequests}
        moderationRole={moderationRole}
        onPendingFriendRequestsChange={setPendingFriendRequests}
        onLogOut={() => void logOut()}
      />

      <div className="fixed bottom-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-end gap-2 sm:bottom-5 sm:right-5 sm:gap-3">
        <AchievementToasts profileUsername={profileUsername} />
      </div>
    </>
  );
}
