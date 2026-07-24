'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AchievementToasts } from '@/components/achievement-toasts';
import { AppNavigationDrawer } from '@/components/app-navigation-drawer';
import { PlayerGameStatsSync } from '@/components/player-game-stats-sync';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { getAuthSessionId } from '@/lib/auth-session';
import { getSessionScopedRequest, subscribeToAuthSession } from '@/lib/auth-session-client';
import { forfeitStoredMultiplayerSessions, reconcileStoredMultiplayerSessionsAwayFromGame } from '@/lib/multiplayer-client-session';
import { getProfileBootstrap } from '@/lib/profile-bootstrap-client';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole } from '@/lib/moderation';

type ProfileOverlayTab = 'profile' | 'stats' | 'achievements' | 'account';

const FriendsWidget = dynamic(
  () => import('@/components/friends-widget').then((module) => module.FriendsWidget),
  { ssr: false },
);
const ProfileScreen = dynamic(
  () => import('@/components/profile-screen').then((module) => module.ProfileScreen),
  { ssr: false },
);
const PublicProfileScreen = dynamic(
  () => import('@/components/public-profile-screen').then((module) => module.PublicProfileScreen),
  { ssr: false },
);

export function GlobalActions() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileHref, setProfileHref] = useState('/login');
  const [profileLabel, setProfileLabel] = useState('Profile');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileOverlayTab>('profile');
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [moderationRole, setModerationRole] = useState<Extract<AppRole, 'moderator' | 'admin'> | null>(null);
  const [publicProfileUsername, setPublicProfileUsername] = useState<string | null>(null);
  const firstLoginSubmittedRef = useRef<Set<string>>(new Set());
  const activeSessionRef = useRef<Session | null>(null);
  const profileAppRoleRef = useRef<string | null>(null);

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
        const { role } = await getProfileBootstrap(session, { force });
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
        setProfileHref('/login');
        setProfileLabel('Profile');
        setProfileAvatarUrl(null);
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
      setProfileHref('/profile');
      const profileResult = await getSessionScopedRequest('global-profile', session, async () => supabase
        .from('profiles')
        .select('username, display_name, active_session_id, avatar_url, app_role')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string; active_session_id: string | null; avatar_url: string | null; app_role: string | null }>(), { force: forceProfile || forceModeration });
      const { data } = profileResult;
      profileAppRoleRef.current = data?.app_role ?? null;

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
        setProfileHref('/login');
        setProfileLabel('Profile');
        setProfileAvatarUrl(null);
        setIsLoggedIn(false);
        setPendingFriendRequests(0);
        setModerationRole(null);
        setProfileOpen(false);
        router.push('/login');
        return;
      }

      if (signInCheckTimeout) {
        window.clearTimeout(signInCheckTimeout);
        signInCheckTimeout = null;
      }
      setProfileLabel(data?.display_name || data?.username || 'Profile');
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

  useEffect(() => {
    const openProfileTab = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: ProfileOverlayTab }>).detail?.tab ?? 'profile';
      setProfileInitialTab(tab);
      setProfileOpen(true);
    };

    window.addEventListener('knowleague:open-profile-tab', openProfileTab);
    return () => window.removeEventListener('knowleague:open-profile-tab', openProfileTab);
  }, []);

  useEffect(() => {
    const openPublicProfile = (event: Event) => {
      const username = (event as CustomEvent<{ username?: string }>).detail?.username?.trim();
      if (username) {
        setPublicProfileUsername(username);
      }
    };

    window.addEventListener('knowleague:open-profile', openPublicProfile);
    return () => window.removeEventListener('knowleague:open-profile', openPublicProfile);
  }, []);

  return (
    <>
      <PlayerGameStatsSync />

      <div className="fixed right-5 top-5 z-[90]">
        <AppNavigationDrawer
          isLoggedIn={isLoggedIn}
          profileHref={profileHref}
          profileLabel={profileLabel}
          profileAvatarUrl={profileAvatarUrl}
          pendingFriendRequests={pendingFriendRequests}
          moderationRole={moderationRole}
          onOpenProfile={() => {
            setProfileInitialTab('profile');
            setProfileOpen(true);
          }}
        />
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex items-end gap-3">
        {isLoggedIn ? <FriendsWidget onPendingRequestCountChange={setPendingFriendRequests} /> : null}
        <AchievementToasts />
      </div>
      {profileOpen ? (
        <div
          data-profile-overlay="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={() => setProfileOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              aria-label="Close profile"
              className="absolute right-4 top-[2.125rem] z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <ProfileScreen presentation="overlay" initialTab={profileInitialTab} onClose={() => setProfileOpen(false)} />
          </div>
        </div>
      ) : null}
      {publicProfileUsername ? (
        <div
          data-profile-overlay="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={() => setPublicProfileUsername(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <PublicProfileScreen
              username={publicProfileUsername}
              presentation="overlay"
              onClose={() => setPublicProfileUsername(null)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
