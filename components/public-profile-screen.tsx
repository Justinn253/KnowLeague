'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, Link as LinkIcon, Loader2, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { getEarnedRewards, type AchievementListItem } from '@/lib/achievements';
import { getLiveGameNote, type LiveGameStatusView } from '@/lib/riot-live-game-ui';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

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
  selected_title_reward_id: string | null;
  displayed_badge_reward_ids: string[];
  achievements: AchievementListItem[];
  created_at: string;
  relationship: FriendCandidate['relationship'];
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

function PublicCompactStat({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div title={title} className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-black text-white">{value}</p>
    </div>
  );
}

function PublicQuizStatsSection({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h3 className="text-base font-black text-amber-300">{title}</h3>
        <span className="text-xs font-semibold text-slate-300">Current / Best streak</span>
      </div>
      <div className="grid gap-2">
        {['Solo', 'Multiplayer'].map((mode) => (
          <div key={mode} className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/55 p-3 lg:grid-cols-[7rem_repeat(6,minmax(0,1fr))] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white">{mode}</p>
              {mode === 'Multiplayer' ? <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">Not public</p> : null}
            </div>
            <PublicCompactStat label="Played" value="-" />
            <PublicCompactStat label="Streak" value="- / -" title="Current streak / best streak" />
            <PublicCompactStat label="Guesses" value="-" />
            <PublicCompactStat label="Correct" value="-" />
            <PublicCompactStat label="Avg/item" value="-" />
            <PublicCompactStat label={mode === 'Multiplayer' ? 'Win %' : 'Record'} value="-" />
          </div>
        ))}
      </div>
    </section>
  );
}

function PublicSmallStatsPanels() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-black text-amber-300">Skindle</h3>
          <span title="Current streak / best streak" className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">- / -</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <PublicCompactStat label="Played" value="-" />
          <PublicCompactStat label="Avg guesses" value="-" />
          <PublicCompactStat label="Total guesses" value="-" />
        </div>
        <p className="mt-3 text-xs text-slate-500">Public Skindle stats are not synced yet.</p>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-black text-amber-300">Skincognito</h3>
          <span title="Current streak / best streak" className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">- / -</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <PublicCompactStat label="Played" value="-" />
          <PublicCompactStat label="Record" value="-" />
          <PublicCompactStat label="Win %" value="-" />
          <PublicCompactStat label="Guesses" value="-" />
          <PublicCompactStat label="Correct" value="-" />
          <PublicCompactStat label="Avg turns" value="-" />
          <div className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 sm:col-span-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Most guessed skin</p>
            <p className="mt-0.5 truncate text-base font-black text-white">-</p>
          </div>
        </div>
      </article>
    </div>
  );
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
    <article className="overflow-hidden rounded-2xl border border-[#5865F2]/40 bg-[#111a3a]/80 ">
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
        className="block rounded-2xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] p-4  transition hover:border-[#c89b3c]/60"
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <article className="rounded-2xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] p-4 ">
      {cardContent}
    </article>
  );
}

export function PublicProfileScreen({ username, presentation = 'page', onClose }: PublicProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<PublicProfileTab>('profile');
  const [profile, setProfile] = useState<PublicProfileRecord | null>(null);
  const [liveGameStatus, setLiveGameStatus] = useState<LiveGameStatusView | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<FriendCandidate['relationship']>('none');
  const [allBadgesOpen, setAllBadgesOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    supabase?.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });

    let cancelled = false;
    setBusy(true);
    setMessage('');
    getAuthHeaders()
      .then((headers) => fetch(`/api/profile/public/${encodeURIComponent(username.trim())}`, {
        headers: headers ?? undefined,
      }))
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
          setRelationship(data.profile.relationship ?? 'none');
          setLiveGameStatus(null);
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
    const riotAccount = profile?.riot_account_name?.trim();
    if (!riotAccount) {
      setLiveGameStatus(null);
      return;
    }

    let cancelled = false;
    setLiveGameStatus(null);
    const requestUrl = new URL('/api/riot-account/live-game', window.location.origin);
    requestUrl.searchParams.set('riotId', riotAccount);

    fetch(requestUrl)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load live game status.');
        }
        return data as LiveGameStatusView;
      })
      .then((data) => {
        if (!cancelled) {
          setLiveGameStatus(data);
          setNow(Date.now());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveGameStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.riot_account_name]);

  useEffect(() => {
    if (!liveGameStatus?.inGame) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [liveGameStatus?.inGame]);

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
    if (response.ok) {
      setRelationship('pending');
      setMessage('');
    } else {
      setMessage(data.error ?? 'Unable to send friend request.');
    }
  };

  const profileInitial = (profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase();
  const profileAchievements = profile?.achievements;
  const earnedTitleRewards = useMemo(() => getEarnedRewards(profileAchievements ?? [], 'title'), [profileAchievements]);
  const earnedBadgeRewards = useMemo(() => getEarnedRewards(profileAchievements ?? [], 'badge'), [profileAchievements]);
  const selectedTitleReward = useMemo(() => earnedTitleRewards.find((reward) => reward.id === profile?.selected_title_reward_id) ?? null, [earnedTitleRewards, profile?.selected_title_reward_id]);
  const displayedBadgeRewards = useMemo(() => (profile?.displayed_badge_reward_ids ?? [])
    .map((rewardId) => earnedBadgeRewards.find((reward) => reward.id === rewardId))
    .filter((reward): reward is (typeof earnedBadgeRewards)[number] => Boolean(reward)), [earnedBadgeRewards, profile?.displayed_badge_reward_ids]);
  const liveGameNote = getLiveGameNote(liveGameStatus, now);
  const riotViewerHref = profile?.riot_account_name?.trim()
    ? `/riot-account-viewer?riotId=${encodeURIComponent(profile.riot_account_name.trim())}`
    : null;

  return (
    <main className={presentation === 'overlay' ? 'text-slate-100' : 'min-h-screen bg-slate-950 text-slate-100'}>
      <section className={presentation === 'overlay'
        ? 'mx-auto flex w-full max-w-5xl flex-col px-6 py-4'
        : 'mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10'}
      >
        {presentation === 'overlay' ? null : (
          <header className="mb-4 flex min-h-12 items-center gap-3">
            <Link
              href="/"
              aria-label="Back to game hub"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
            >
              <ArrowLeft size={20} />
            </Link>
          </header>
        )}

        <section className="min-h-[34rem] rounded-3xl border border-white/10 bg-slate-900/80 p-5  backdrop-blur-xl">
          {busy ? (
            <div className="flex min-h-[30rem] items-center justify-center gap-3 text-sm font-semibold text-slate-300">
              <Loader2 size={18} className="animate-spin text-amber-300" />
              Loading profile...
            </div>
          ) : null}

          {!busy && profile ? (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-2xl font-black text-amber-200"
                    style={profile.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined}
                    aria-hidden="true"
                  >
                    {profile.avatar_url ? null : profileInitial}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {riotViewerHref ? (
                        <Link
                          href={riotViewerHref}
                          className="min-w-0 truncate text-3xl font-bold text-white transition hover:text-amber-200"
                          title="Open linked Riot account in League Account Viewer"
                        >
                          {profile.display_name || profile.username}
                        </Link>
                      ) : (
                        <h2 className="truncate text-3xl font-bold text-white">{profile.display_name || profile.username}</h2>
                      )}
                      {selectedTitleReward ? (
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                          {selectedTitleReward.name}
                        </span>
                      ) : null}
                    </div>
                    {liveGameNote ? (
                      <p className="mt-1 text-sm font-semibold text-emerald-300">{liveGameNote}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-300">
                    <Users size={16} className="text-amber-300" />
                    {profile.friends_count} friends
                  </div>
                  <div
                    title="Created On"
                    className="inline-flex min-h-11 items-center rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-300"
                  >
                    {formatProfileDate(profile.created_at)}
                  </div>
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
                  {presentation === 'overlay' && onClose ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close public profile"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                    >
                      <X size={18} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1">
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
                  <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Badges</p>
                      <button
                        type="button"
                        onClick={() => setAllBadgesOpen(true)}
                        className="inline-flex min-h-8 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                      >
                        View
                      </button>
                    </div>
                    <div className="grid w-fit grid-cols-4 gap-1.5">
                      {displayedBadgeRewards.slice(0, 8).map((badge) => (
                        <div key={badge.id} className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-300/10 text-amber-100">
                          <BadgeCheck size={16} />
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200  group-hover:block">
                            {badge.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTab === 'stats' ? (
                <div className="mt-5 grid gap-3">
                  <PublicQuizStatsSection title="Ability Blitz" />
                  <PublicQuizStatsSection title="Skin Champion" />
                  <PublicSmallStatsPanels />
                  <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Achievements</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {profile.achievements.map((achievement) => {
                        const complete = Boolean(achievement.completedAt);
                        return (
                          <article key={achievement.id} className={`rounded-xl border px-3 py-2 ${complete ? 'border-emerald-300/30 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-bold text-white">{achievement.titleVisible}</p>
                              <span className={`text-xs font-black ${complete ? 'text-emerald-200' : 'text-slate-500'}`}>{complete ? 'Done' : `${achievement.progressCurrent}/${achievement.progressTarget}`}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{achievement.descriptionVisible}</p>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ) : null}
            </>
          ) : null}
          {allBadgesOpen ? (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" onMouseDown={() => setAllBadgesOpen(false)}>
              <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950 p-5 " onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Badges</p>
                    <h2 className="mt-1 text-lg font-bold text-white">All earned badges</h2>
                  </div>
                  <button type="button" onClick={() => setAllBadgesOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800" aria-label="Close badges">
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-9">
                  {earnedBadgeRewards.length ? earnedBadgeRewards.map((badge) => (
                    <div key={badge.id} title={badge.name} className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-300/10 text-amber-100">
                      <BadgeCheck size={18} />
                    </div>
                  )) : (
                    <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-500 sm:col-span-9">No badges earned yet.</p>
                  )}
                </div>
              </div>
            </div>
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