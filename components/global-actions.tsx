'use client';

import { useEffect, useState } from 'react';
import { UserCircle, X } from 'lucide-react';
import Link from 'next/link';
import { ContactUsWidget } from '@/components/contact-us-widget';
import { FriendsWidget } from '@/components/friends-widget';
import { ProfileScreen } from '@/components/profile-screen';
import { PublicProfileScreen } from '@/components/public-profile-screen';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

export function GlobalActions() {
  const [profileHref, setProfileHref] = useState('/login');
  const [profileLabel, setProfileLabel] = useState('Profile');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [publicProfileUsername, setPublicProfileUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const updateProfileAction = async (userId?: string | null) => {
      if (!userId) {
        setProfileHref('/login');
        setProfileLabel('Profile');
        setIsLoggedIn(false);
        setPendingFriendRequests(0);
        return;
      }

      setIsLoggedIn(true);
      setProfileHref('/profile');
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string }>();

      setProfileLabel(data?.display_name || data?.username || 'Profile');
    };

    supabase.auth.getSession().then(({ data }) => {
      void updateProfileAction(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void updateProfileAction(session?.user.id ?? null);
    });

    const profileChannel = supabase
      .channel('global-profile-action')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const profileId = (payload.new as { id?: string }).id;
        supabase.auth.getSession().then(({ data }) => {
          if (profileId && profileId === data.session?.user.id) {
            void updateProfileAction(profileId);
          }
        });
      })
      .subscribe();

    return () => {
      listener.subscription.unsubscribe();
      void supabase.removeChannel(profileChannel);
    };
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
    <div className="fixed bottom-5 right-5 z-50 flex items-end gap-3">
      {isLoggedIn ? <FriendsWidget onPendingRequestCountChange={setPendingFriendRequests} /> : null}
      {isLoggedIn ? (
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
        >
          <UserCircle size={18} />
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
      {profileOpen ? (
        <div
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
              className="absolute right-4 top-8 z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <ProfileScreen presentation="overlay" onClose={() => setProfileOpen(false)} />
          </div>
        </div>
      ) : null}
      {publicProfileUsername ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={() => setPublicProfileUsername(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPublicProfileUsername(null)}
              aria-label="Close public profile"
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <PublicProfileScreen
              username={publicProfileUsername}
              presentation="overlay"
              onClose={() => setPublicProfileUsername(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
