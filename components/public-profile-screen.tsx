'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type PublicProfileRecord = {
  id: string;
  username: string;
  display_name: string;
  about_me: string;
  friends_count: number;
  friend_requests_open: boolean;
  created_at: string;
};

type FriendCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  relationship: 'friend' | 'pending' | 'none';
};

type PublicProfileScreenProps = {
  username: string;
  presentation?: 'page' | 'overlay';
  onClose?: () => void;
};

async function getAuthHeaders() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
}

function formatProfileDate(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function PublicProfileScreen({ username, presentation = 'page' }: PublicProfileScreenProps) {
  const [profile, setProfile] = useState<PublicProfileRecord | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<FriendCandidate['relationship']>('none');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setMessage('Supabase is not configured.');
      setBusy(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });

    supabase
      .from('profiles')
      .select('id, username, display_name, about_me, friends_count, friend_requests_open, created_at')
      .eq('username', username.toLowerCase())
      .maybeSingle<PublicProfileRecord>()
      .then(({ data, error }) => {
        if (error) {
          setMessage(error.message);
        } else if (!data) {
          setMessage('Profile not found.');
        } else {
          setProfile(data);
        }

        setBusy(false);
      });
  }, [username]);

  useEffect(() => {
    if (!profile) {
      return undefined;
    }

    let cancelled = false;
    const loadRelationship = async () => {
      const headers = await getAuthHeaders();
      if (!headers) {
        return;
      }

      fetch(`/api/friends/search?q=${encodeURIComponent(profile.username)}`, { headers })
        .then((response) => response.json())
        .then((data) => {
          if (cancelled) {
            return;
          }

          const match = (data.results ?? []).find((candidate: FriendCandidate) => candidate.id === profile.id);
          setRelationship(match?.relationship ?? 'none');
        })
        .catch(() => undefined);
    };

    void loadRelationship();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const sendFriendRequest = async (targetUserId: string) => {
    const headers = await getAuthHeaders();
    if (!headers) {
      setMessage('Login required to send friend requests.');
      return;
    }

    const response = await fetch('/api/friends/requests', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUserId }),
    });
    const data = await response.json();
    setMessage(response.ok ? 'Friend request sent.' : data.error ?? 'Unable to send friend request.');
    if (response.ok) {
      setRelationship('pending');
    }
  };

  return (
    <main className={presentation === 'overlay' ? 'text-slate-100' : 'min-h-screen bg-slate-950 text-slate-100'}>
      <section className={presentation === 'overlay'
        ? 'mx-auto flex w-full max-w-4xl flex-col px-6 py-8'
        : 'mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-10'}
      >
        <header className={`mb-5 flex min-h-12 items-center gap-3 ${presentation === 'overlay' ? 'pr-14' : ''}`}>
          <Link
            href="/"
            aria-label="Back to game hub"
            className={`${presentation === 'overlay' ? 'hidden' : 'inline-flex'} h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900`}
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-white">Profile</h1>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          {busy ? <p className="text-sm font-semibold text-slate-300">Loading profile...</p> : null}

          {!busy && profile ? (
            <>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Username</p>
                  <h2 className="mt-2 text-4xl font-bold text-white">{profile.display_name || profile.username}</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2 text-sm font-semibold text-slate-300">
                      <Users size={16} className="text-amber-300" />
                      {profile.friends_count} friends
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2 text-sm font-semibold text-slate-300">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Created</span>
                      {formatProfileDate(profile.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {!currentUserId || currentUserId === profile.id ? null : relationship === 'friend' ? (
                    <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-100">
                      <Users size={17} />
                      Friend
                    </span>
                  ) : relationship === 'pending' ? (
                    <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-300">
                      Pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!profile.friend_requests_open}
                      onClick={() => sendFriendRequest(profile.id)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <UserPlus size={17} />
                      {profile.friend_requests_open ? 'Add Friend' : 'Requests Closed'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About Me</p>
                  <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {profile.about_me || 'This player has not added an about me section yet.'}
                  </p>
                </section>
              </div>
            </>
          ) : null}

          {message.trim() ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
              {message}
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
