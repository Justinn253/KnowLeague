'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AchievementToasts } from '@/components/achievement-toasts';
import { CumulativeAchievementTracker } from '@/components/cumulative-achievement-tracker';
import { AppHeader } from '@/components/app-header';
import { PlayerGameStatsSync } from '@/components/player-game-stats-sync';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { getAuthSessionId } from '@/lib/auth-session';
import { getSessionScopedRequest, subscribeToAuthSession } from '@/lib/auth-session-client';
import { forfeitStoredMultiplayerSessions, reconcileStoredMultiplayerSessionsAwayFromGame } from '@/lib/multiplayer-client-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole } from '@/lib/moderation';

export function GlobalActions() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [moderationRole, setModerationRole] = useState<Extract<AppRole, 'moderator' | 'admin'> | null>(null);
  const firstLoginSubmittedRef = useRef<Set<string>>(new Set());
  const activeSessionRef = useRef<Session | null>(null);
  const profileAppRoleRef = useRef<string | null>(null);

  const logOut = async () => {
    await forfeitStoredMultiplayerSessions();
    const supabase = getOptionalSupabaseClient();
    await supabase?.auth.signOut();
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
    let signInCheckTimeout: number | null = null;
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let subscribedProfileId: string | null = null;

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
      mismatchRetries = 0,
      forceProfile = false,
      forceModeration = false,
    ) => {
      activeSessionRef.current = session ?? null;
      if (!session) {
        profileAppRoleRef.current = null;
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
        .select('username, display_name, active_session_id, avatar_url, app_role')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string; active_session_id: string | null; avatar_url: string | null; app_role: string | null }>(), { force: forceProfile || forceModeration });
      const { data } = profileResult;
      profileAppRoleRef.current = data?.app_role ?? null;
      setProfileUsername(data?.username?.trim() || null);

      const sessionId = getAuthSessionId(session.access_token);
      if (data?.active_session_id && sessionId && data.active_session_id !== sessionId) {
        if (mismatchRetries > 0) {
          signInCheckTimeout = window.setTimeout(() => {
            signInCheckTimeout = null;
            void updateProfileAction(session, mismatchRetries - 1, true);
          }, 500);
          return;
        }
        await forfeitStoredMultiplayerSessions();
        await supabase.auth.signOut({ scope: 'local' });
        activeSessionRef.current = null;
        setProfileAvatarUrl(null);
        setProfileUsername(null);
        setIsLoggedIn(false);
        setPendingFriendRequests(0);
        setModerationRole(null);
        router.push('/login');
        return;
      }

      if (signInCheckTimeout) {
        window.clearTimeout(signInCheckTimeout);
        signInCheckTimeout = null;
      }
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
          void updateProfileAction(activeSession, 0, true, roleChanged);
        })
        .subscribe();
    };

    const unsubscribeFromAuthSession = subscribeToAuthSession((session, event) => {
      activeSessionRef.current = session;
      replaceProfileSubscription(session);
      if (signInCheckTimeout) {
        window.clearTimeout(signInCheckTimeout);
        signInCheckTimeout = null;
      }
      if (event === 'SIGNED_IN' && session) {
        void updateProfileAction(session, 6);
        return;
      }
      void updateProfileAction(session);
    });

    return () => {
      if (signInCheckTimeout) {
        window.clearTimeout(signInCheckTimeout);
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
