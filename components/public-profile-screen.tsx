'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Link as LinkIcon, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { GameId } from '@/lib/game-storage';

type PublicProfileRecord = {
  id: string;
  username: string;
  display_name: string;
  about_me: string;
  avatar_url: string | null;
  friends_count: number;
  friend_requests_open: boolean;
  discord_username: string | null;
  discord_avatar_url: string | null;
  discord_banner_url: string | null;
  riot_account_name: string | null;
  created_at: string;
};

type FriendCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  relationship: 'friend' | 'pending' | 'none';
};

type PublicProfileTab = 'profile' | 'stats';

type PublicProfileScreenProps = {
  username: string;
  presentation?: 'page' | 'overlay';
  onClose?: () => void;
};

const PUBLIC_PROFILE_GAMES: Array<{ id: GameId; title: string; note: string }> = [
  { id: 'ability-blitz', title: 'Ability Blitz', note: 'Solo completions' },
  { id: 'skin-champion', title: 'Skin Champion', note: 'Solo completions' },
  { id: 'skindle', title: 'Skindle', note: 'Daily solves' },
  { id: 'skincognito', title: 'Skincognito', note: 'Multiplayer stats' },
];

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

function getLinkedValue(value?: string | null) {
  return value?.trim() || 'Not linked';
}

function DiscordMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M19.5 5.2A16.3 16.3 0 0 0 15.5 4l-.2.4c1.4.4 2.1 1 2.1 1s-1.8-1-5.4-1-5.4 1-5.4 1 .8-.6 2.1-1L8.5 4a16.3 16.3 0 0 0-4 1.2C2 8.9 1.5 12.5 1.8 16.1A16 16 0 0 0 6.7 18.6l.9-1.5c-.5-.2-1-.5-1.5-.8l.4-.3c2.9 1.3 6.1 1.3 9 0l.4.3c-.5.3-1 .6-1.5.8l.9 1.5a16 16 0 0 0 4.9-2.5c.4-4.2-.6-7.8-2.7-10.9ZM8.7 14.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"
      />
    </svg>
  );
}

function DiscordPublicCard({ profile }: { profile: PublicProfileRecord }) {
  const isLinked = Boolean(profile.discord_username);
  const discordName = getLinkedValue(profile.discord_username);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#5865F2]/40 bg-[#111a3a]/80 shadow-[0_0_28px_rgba(88,101,242,0.14)]">
      <div
        className="h-20 bg-gradient-to-r from-[#5865F2] via-[#4752C4] to-[#2b2d63] bg-cover bg-center"
        style={profile.discord_banner_url ? { backgroundImage: `url(${profile.discord_banner_url})` } : undefined}
      />
      <div className="relative p-4 pt-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 pt-3">
              <DiscordMark className="h-4 w-4 text-[#5865F2]" />
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8EA1E1]">Discord</p>
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-[#111a3a] bg-[#232946] bg-cover bg-center text-lg font-black text-white"
                style={profile.discord_avatar_url ? { backgroundImage: `url(${profile.discord_avatar_url})` } : undefined}
                aria-hidden="true"
              >
                {profile.discord_avatar_url ? null : discordName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-white">{discordName}</p>
                <p className="mt-1 text-xs font-semibold text-[#b8c1ff]">
                  {isLinked ? 'Discord account linked' : 'No Discord account linked'}
                </p>
              </div>
            </div>
          </div>
          <span
            className={`mt-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
              isLinked ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200' : 'border-[#5865F2]/35 bg-[#5865F2]/15 text-[#b8c1ff]'
            }`}
          >
            {isLinked ? <Check size={17} /> : <LinkIcon size={17} />}
          </span>
        </div>
      </div>
    </article>
  );
}

function RiotPublicCard({ profile }: { profile: PublicProfileRecord }) {
  const riotAccount = getLinkedValue(profile.riot_account_name);
  const isLinked = riotAccount !== 'Not linked';
  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#d13639]/40 bg-[#d13639]/15 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#f87171]">
              Riot
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c89b3c]">Riot Account</p>
          </div>
          <p className="mt-2 text-lg font-bold text-white">{riotAccount}</p>
        </div>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
            isLinked ? 'border-[#c89b3c]/40 bg-[#c89b3c]/15 text-[#f0d178]' : 'border-[#d13639]/30 bg-black/30 text-[#c89b3c]'
          }`}
        >
          {isLinked ? <Check size={17} /> : <LinkIcon size={17} />}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {isLinked ? 'Open this linked Riot ID in the League Account Viewer.' : 'No Riot account linked.'}
      </p>
    </>
  );

  if (isLinked) {
    return (
      <Link
        href={`/riot-account-viewer?riotId=${encodeURIComponent(riotAccount)}`}
        className="block rounded-2xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] p-4 shadow-[0_0_28px_rgba(209,54,57,0.12)] transition hover:border-[#c89b3c]/60"
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <article className="rounded-2xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] p-4 shadow-[0_0_28px_rgba(209,54,57,0.12)]">
      {cardContent}
    </article>
  );
}

export function PublicProfileScreen({ username, presentation = 'page' }: PublicProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<PublicProfileTab>('profile');
  const [profile, setProfile] = useState<PublicProfileRecord | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<FriendCandidate['relationship']>('none');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    supabase?.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });

    let cancelled = false;
    setBusy(true);
    setMessage('');
    fetch(`/api/profile/public/${encodeURIComponent(username.toLowerCase())}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load profile.');
        }
        return data as { profile: PublicProfileRecord };
      })
      .then((data) => {
        if (!cancelled) {
          setProfile(data.profile);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Unable to load profile.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
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

  const profileInitial = (profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase();

  return (
    <main className={presentation === 'overlay' ? 'text-slate-100' : 'min-h-screen bg-slate-950 text-slate-100'}>
      <section className={presentation === 'overlay'
        ? 'mx-auto flex w-full max-w-5xl flex-col px-6 py-8'
        : 'mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10'}
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
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-3xl font-black text-amber-200"
                    style={profile.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined}
                    aria-hidden="true"
                  >
                    {profile.avatar_url ? null : profileInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Username</p>
                    <h2 className="mt-2 truncate text-4xl font-bold text-white">{profile.display_name || profile.username}</h2>
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

              <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1">
                {[
                  ['profile', 'Profile'],
                  ['stats', 'Stats'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab as PublicProfileTab)}
                    className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
                      activeTab === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'profile' ? (
                <div className="mt-6 grid gap-4">
                  <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About Me</p>
                    <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {profile.about_me || 'This player has not added an about me section yet.'}
                    </p>
                  </section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DiscordPublicCard profile={profile} />
                    <RiotPublicCard profile={profile} />
                  </div>
                </div>
              ) : null}

              {activeTab === 'stats' ? (
                <div className="mt-6 grid gap-4">
                  <p className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                    Public game stats are not synced to accounts yet. These cards are ready for account-backed stats once we start storing completions server-side.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {PUBLIC_PROFILE_GAMES.map((game) => (
                      <article key={game.id} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">{game.note}</p>
                            <h3 className="mt-1 text-lg font-bold text-white">{game.title}</h3>
                          </div>
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-400">
                            Not public
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {['Current streak', 'Best streak', 'Avg guesses'].map((label) => (
                            <div key={label} className="rounded-xl bg-slate-900 p-3">
                              <p className="text-xs text-slate-500">{label}</p>
                              <p className="mt-1 text-lg font-bold text-white">-</p>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
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
