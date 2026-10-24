'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AchievementToasts } from '@/components/achievement-toasts';
import { CumulativeAchievementTracker } from '@/components/cumulative-achievement-tracker';
import { AppHeader } from '@/components/app-header';
import { PlayerGameStatsSync } from '@/components/player-game-stats-sync';
import { submitAchievementEvent, toAchievementNotification } from '@/lib/achievement-client';
import { subscribeToAppActivity, useAppActivity, type AppActivitySnapshot } from '@/lib/app-activity';
import { getSessionScopedRequest, subscribeToAuthSession } from '@/lib/auth-session-client';
import { consumeAuthReturnPath, isActiveGamePath, rememberAuthReturnPath } from '@/lib/auth-redirect';
import { forfeitStoredMultiplayerSessions, reconcileStoredMultiplayerSessionsAwayFromGame } from '@/lib/multiplayer-client-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole } from '@/lib/moderation';

const SESSION_VALIDATION_INTERVAL_MS = 5 * 60_000;
const DISCORD_SNAPSHOT_PATHS = new Set([
  '/riot-account-viewer/discord-snapshot',
  '/champions/discord-snapshot',
]);

function dispatchAchievementNotification(row: unknown) {
  const achievement = toAchievementNotification(row as Parameters<typeof toAchievementNotification>[0]);
  if (!achievement) {
    return;
  }

  window.dispatchEvent(new CustomEvent('knowleague:achievement-completed', {
    detail: { achievements: [achievement] },
  }));
}

export function GlobalActions({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDiscordSnapshotRoute = DISCORD_SNAPSHOT_PATHS.has(pathname);
  const router = useRouter();
  const appActivity = useAppActivity();
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileAway, setProfileAway] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [moderationRole, setModerationRole] = useState<Extract<AppRole, 'moderator' | 'admin'> | null>(null);
  const firstLoginSubmittedRef = useRef<Set<string>>(new Set());
  const activeSessionRef = useRef<Session | null>(null);
  const appActivityRef = useRef<AppActivitySnapshot>(appActivity);
  const pathnameRef = useRef(pathname);

  appActivityRef.current = appActivity;
  pathnameRef.current = pathname;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      rememberAuthReturnPath(pathname, window.location.search, window.location.hash);
    }
  }, [pathname]);

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
    let lastSessionValidationAt = 0;
    let lastValidatedAccessToken: string | null = null;
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let subscribedProfileId: string | null = null;

    const validateSession = async (session: Session, force = false) => {
      if (sessionValidationInFlight) return;
      if (!force
        && lastValidatedAccessToken === session.access_token
        && Date.now() - lastSessionValidationAt < SESSION_VALIDATION_INTERVAL_MS) {
        return;
      }
      sessionValidationInFlight = true;
      try {
        const response = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (response.ok || activeSessionRef.current?.access_token !== session.access_token) {
          if (response.ok) {
            lastSessionValidationAt = Date.now();
            lastValidatedAccessToken = session.access_token;
          }
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

    const shouldRunBackgroundValidation = () => (
      isActiveGamePath(pathnameRef.current) || appActivityRef.current.isActive
    );

    const updateSessionValidation = (session: Session | null) => {
      if (sessionValidationInterval) {
        window.clearInterval(sessionValidationInterval);
        sessionValidationInterval = null;
      }
      if (!session) return;

      void validateSession(session, true);
      sessionValidationInterval = window.setInterval(() => {
        const activeSession = activeSessionRef.current;
        if (activeSession && shouldRunBackgroundValidation()) void validateSession(activeSession);
      }, SESSION_VALIDATION_INTERVAL_MS);
    };

    const validateVisibleSession = () => {
      if (document.visibilityState !== 'visible') return;
      const activeSession = activeSessionRef.current;
      if (activeSession) void validateSession(activeSession);
    };
    document.addEventListener('visibilitychange', validateVisibleSession);

    const unsubscribeFromAppActivity = subscribeToAppActivity((activity: AppActivitySnapshot) => {
      if (!activity.isActive || isActiveGamePath(pathnameRef.current)) return;
      const activeSession = activeSessionRef.current;
      if (activeSession) void validateSession(activeSession);
    });

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
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string; avatar_url: string | null }>(), { force: forceProfile || forceModeration });
      const { data } = profileResult;
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
        }, () => {
          const activeSession = activeSessionRef.current;
          if (!activeSession || activeSession.user.id !== userId) {
            return;
          }

          void updateProfileAction(activeSession, true, true);
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          dispatchAchievementNotification(payload.new);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          dispatchAchievementNotification(payload.new);
        })
        .subscribe();
    };

    const unsubscribeFromAuthSession = subscribeToAuthSession((session, event) => {
      activeSessionRef.current = session;
      setAuthResolved(true);
      if (event === 'SIGNED_IN' && pathnameRef.current !== '/login') {
        // A direct OAuth callback can land on the requested page. Clear the
        // one-shot return path there; password flows consume it themselves.
        consumeAuthReturnPath();
      }
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
      document.removeEventListener('visibilitychange', validateVisibleSession);
      unsubscribeFromAppActivity();
      unsubscribeFromAuthSession();
      if (profileChannel) {
        void supabase.removeChannel(profileChannel);
      }
    };
  }, [router]);

  if (!authResolved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div role="status" className="rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-4 text-sm font-semibold text-slate-300">
          Loading KnowLeague...
        </div>
      </main>
    );
  }

  return (
    <>
      {!isDiscordSnapshotRoute && !pathname.startsWith('/riftbound') ? <PlayerGameStatsSync /> : null}
      {!isDiscordSnapshotRoute ? <CumulativeAchievementTracker /> : null}

      {!isDiscordSnapshotRoute ? (
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
      ) : null}

      {!isDiscordSnapshotRoute ? (
        <div className="fixed bottom-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-end gap-2 sm:bottom-5 sm:right-5 sm:gap-3">
          <AchievementToasts profileUsername={profileUsername} />
        </div>
      ) : null}
      {children}
    </>
  );
}
