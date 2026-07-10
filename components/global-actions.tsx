'use client';

import { useEffect, useRef, useState } from 'react';
import { UserCircle, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AchievementToasts } from '@/components/achievement-toasts';
import { ContactUsWidget } from '@/components/contact-us-widget';
import { FriendsWidget } from '@/components/friends-widget';
import { ModerationWidget } from '@/components/moderation-widget';
import { PlayerGameStatsSync } from '@/components/player-game-stats-sync';
import { ProfileScreen } from '@/components/profile-screen';
import { PublicProfileScreen } from '@/components/public-profile-screen';
import { SoundSettingsMenu } from '@/components/sound-settings-menu';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { getAuthSessionId } from '@/lib/auth-session';
import { forfeitStoredMultiplayerSessions, reconcileStoredMultiplayerSessionsAwayFromGame } from '@/lib/multiplayer-client-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole } from '@/lib/moderation';

type ProfileOverlayTab = 'profile' | 'stats' | 'achievements' | 'account';

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

  useEffect(() => {
    void reconcileStoredMultiplayerSessionsAwayFromGame(pathname);
  }, [pathname]);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }
    let signInCheckTimeout: number | null = null;

    const updateModerationRole = async (session: Session | null) => {
      if (!session) {
        setModerationRole(null);
        return;
      }

      try {
        const response = await fetch('/api/moderation/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await response.json() as { role?: AppRole };
        if (!response.ok || (data.role !== 'moderator' && data.role !== 'admin')) {
          setModerationRole(null);
          return;
        }
        setModerationRole(data.role);
      } catch {
        setModerationRole(null);
      }
    };

    const updateProfileAction = async (session?: Session | null, mismatchRetries = 0) => {
      if (!session) {
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
      void updateModerationRole(session);
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
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, active_session_id, avatar_url')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string; active_session_id: string | null; avatar_url: string | null }>();

      const sessionId = getAuthSessionId(session.access_token);
      if (data?.active_session_id && sessionId && data.active_session_id !== sessionId) {
        if (mismatchRetries > 0) {
          signInCheckTimeout = window.setTimeout(() => {
            signInCheckTimeout = null;
            void updateProfileAction(session, mismatchRetries - 1);
          }, 500);
          return;
        }
        await forfeitStoredMultiplayerSessions();
        await supabase.auth.signOut({ scope: 'local' });
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

    supabase.auth.getSession().then(({ data }) => {
      void updateProfileAction(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
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

    const profileChannel = supabase
      .channel('global-profile-action')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const profileId = (payload.new as { id?: string }).id;
        supabase.auth.getSession().then(({ data }) => {
          if (profileId && profileId === data.session?.user.id) {
            void updateProfileAction(data.session);
          }
        });
      })
      .subscribe();

    return () => {
      if (signInCheckTimeout) {
        window.clearTimeout(signInCheckTimeout);
      }
      listener.subscription.unsubscribe();
      void supabase.removeChannel(profileChannel);
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
        <SoundSettingsMenu />
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex items-end gap-3">
        {moderationRole ? <ModerationWidget role={moderationRole} /> : null}
        {isLoggedIn ? <FriendsWidget onPendingRequestCountChange={setPendingFriendRequests} /> : null}
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => {
              setProfileInitialTab('profile');
              setProfileOpen(true);
            }}
            className="relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
          >
            {profileAvatarUrl ? (
              <span
                className="h-5 w-5 rounded-full border border-white/10 bg-slate-900 bg-cover bg-center"
                style={{ backgroundImage: `url(${profileAvatarUrl})` }}
              />
            ) : (
              <UserCircle size={18} />
            )}
            <span className="max-w-32 truncate">{profileLabel}</span>
            {pendingFriendRequests > 0 ? (
              <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
              </span>
            ) : null}
          </button>
        ) : (
          <Link
            href={profileHref}
            className="relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
          >
            <UserCircle size={18} />
            <span className="max-w-32 truncate">{profileLabel}</span>
          </Link>
        )}
        <ContactUsWidget />
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
