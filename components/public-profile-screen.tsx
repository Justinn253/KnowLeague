'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Award, BadgeCheck, Ellipsis, ExternalLink, Eye, Filter, Flag, Loader2, MessageCircle, Pencil, Save, Search, ShieldBan, Trophy, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { ACHIEVEMENT_GAME_OPTIONS, getAchievementGameLabel, getEarnedRewards, getRewardDescription, isUnachievedHiddenAchievement, maskAchievement, type AchievementListItem } from '@/lib/achievements';
import { AppSelectMenu } from '@/components/app-select-menu';
import { getChatBorderSwatchStyle, getChatNameStyle, getChatSwatchStyle } from '@/lib/chat-colors';
import { requestOpenUserReport } from '@/lib/contact-navigation';
import { requestOpenFriendMessages } from '@/lib/friends-navigation';
import { getCachedOwnerProfileResponse, invalidateCachedOwnerProfileResponse, setCachedOwnerProfileResponse } from '@/lib/profile-response-cache';
import { getLiveGameNote, type LiveGameStatusView } from '@/lib/riot-live-game-ui';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { ProfileScreen } from '@/components/profile-screen';
import { ProfileFriendsMenu } from '@/components/profile-friends-menu';
import { getProfileTabFromUrl, pushProfileTabToUrl } from '@/lib/profile-tabs';

type PublicProfileRecord = {
  id: string;
  username: string;
  display_name: string;
  about_me: string;
  avatar_url: string | null;
  chat_color: string | null;
  chat_border: string | null;
  profile_visibility: 'public' | 'private';
  friends_count: number;
  friend_requests_open: boolean;
  profile_status: string;
  friends_list_public: boolean;
  discord_username: string | null;
  discord_avatar_url: string | null;
  discord_banner_url: string | null;
  riot_account_name: string | null;
  selected_title_reward_id: string | null;
  displayed_badge_reward_ids: string[];
  achievements: AchievementListItem[];
  created_at: string;
  relationship: FriendCandidate['relationship'];
  friend_note: string;
  blocked: boolean;
  blockedByViewer: boolean;
  is_banned?: boolean;
};

type FriendCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  relationship: 'friend' | 'pending' | 'none';
};

type PublicProfileTab = 'profile' | 'stats' | 'achievements';
const PUBLIC_PROFILE_TABS: readonly PublicProfileTab[] = ['profile', 'stats', 'achievements'];
type AchievementSortKey = 'completedAt' | 'globalRanking' | 'completionPercent' | 'alphabetical';
type AchievementSortDirection = 'asc' | 'desc';

type PublicProfileScreenProps = {
  username: string;
};

type PublicProfileResponse = {
  profile?: PublicProfileRecord;
  viewer?: {
    isOwner?: boolean;
    isAdmin?: boolean;
  };
  error?: string;
};

type AdminStatsTarget = 'ability-blitz' | 'skin-champion' | 'skindle' | 'splash-scramble' | 'skincognito' | 'all';

async function getAuthHeaders() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
}

function formatProfileDate(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatAchievementDate(value?: string | null) {
  if (!value) {
    return 'Not completed';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function PublicQuizStatsSection({ title, statsTarget, isAdmin, onResetStats, resetBusy, resetConfirming }: { title: string; statsTarget: AdminStatsTarget; isAdmin: boolean; onResetStats: (target: AdminStatsTarget) => void; resetBusy: boolean; resetConfirming: boolean }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-base font-black text-amber-300">{title}</h3>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => onResetStats(statsTarget)}
              disabled={resetBusy}
              className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-slate-900 px-2.5 text-[0.68rem] font-bold text-slate-200 transition hover:border-red-300/35 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetBusy ? 'Resetting...' : resetConfirming ? 'Confirm Reset' : 'Reset Stats'}
            </button>
          ) : null}
        </div>
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

function PublicSmallStatsPanels({ isAdmin, onResetStats, resetBusy, resetConfirmTarget }: { isAdmin: boolean; onResetStats: (target: AdminStatsTarget) => void; resetBusy: boolean; resetConfirmTarget: AdminStatsTarget | null }) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-base font-black text-amber-300">Skindle</h3>
            {isAdmin ? (
              <button type="button" onClick={() => onResetStats('skindle')} disabled={resetBusy} className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-slate-900 px-2.5 text-[0.68rem] font-bold text-slate-200 transition hover:border-red-300/35 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {resetBusy ? 'Resetting...' : resetConfirmTarget === 'skindle' ? 'Confirm Reset' : 'Reset Stats'}
              </button>
            ) : null}
          </div>
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
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-base font-black text-amber-300">Skincognito</h3>
            {isAdmin ? (
              <button type="button" onClick={() => onResetStats('skincognito')} disabled={resetBusy} className="inline-flex min-h-8 items-center rounded-lg border border-white/10 bg-slate-900 px-2.5 text-[0.68rem] font-bold text-slate-200 transition hover:border-red-300/35 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {resetBusy ? 'Resetting...' : resetConfirmTarget === 'skincognito' ? 'Confirm Reset' : 'Reset Stats'}
              </button>
            ) : null}
          </div>
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

function DiscordPublicCard({ profile, isAdmin, onUnlink, unlinkBusy }: { profile: PublicProfileRecord; isAdmin: boolean; onUnlink: () => void; unlinkBusy: boolean }) {
  const isLinked = Boolean(profile.discord_username);
  const discordName = getLinkedValue(profile.discord_username);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#5865F2]/40 bg-[#111a3a]/80">
      <div
        className="flex min-h-12 items-center bg-gradient-to-r from-[#5865F2] via-[#4752C4] to-[#2b2d63] bg-cover bg-center px-4"
        style={profile.discord_banner_url ? { backgroundImage: `url(${profile.discord_banner_url})` } : undefined}
      >
        <div className="flex items-center gap-2">
          <DiscordMark className="h-4 w-4 text-white" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">Discord Account</p>
        </div>
      </div>
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#111a3a] bg-[#232946] bg-cover bg-center text-lg font-black text-white"
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
            {isAdmin && isLinked ? (
              <button
                type="button"
                onClick={onUnlink}
                disabled={unlinkBusy}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#5865F2] px-3 text-xs font-bold text-white transition hover:bg-[#4752C4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {unlinkBusy ? 'Unlinking...' : 'Unlink Discord'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function RiotPublicCard({ profile, isAdmin, onUnlink, unlinkBusy }: { profile: PublicProfileRecord; isAdmin: boolean; onUnlink: () => void; unlinkBusy: boolean }) {
  const riotAccount = getLinkedValue(profile.riot_account_name);
  const isLinked = riotAccount !== 'Not linked';
  const card = (
    <article className="overflow-hidden rounded-2xl border border-[#d13639]/35 bg-[#17121b]/90">
      <div className="flex min-h-12 items-center bg-gradient-to-r from-[#d13639] via-[#7f2635] to-[#25131d] px-4">
        <div className="flex items-center gap-2">
          <img src="/Icons/riot_icon.png" alt="" className="h-4 w-4 rounded-sm object-cover" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">Riot Account</p>
        </div>
      </div>
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#17121b] bg-[#2b1821] text-[#f0d178]">
            <img src="/Icons/riot_icon.png" alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            {isLinked ? (
              <Link
                href={`/riot-account-viewer?riotId=${encodeURIComponent(riotAccount)}`}
                className="truncate text-lg font-bold text-white transition hover:text-amber-200"
              >
                {riotAccount}
              </Link>
            ) : (
              <p className="truncate text-lg font-bold text-white">{riotAccount}</p>
            )}
            <p className="mt-1 text-xs font-semibold text-slate-300">
              {isLinked ? 'Riot account linked' : 'Riot linking not implemented yet'}
            </p>
            {isAdmin && isLinked ? (
              <button
                type="button"
                onClick={onUnlink}
                disabled={unlinkBusy}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300/30 bg-red-400/10 px-3 text-xs font-bold text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {unlinkBusy ? 'Unlinking...' : 'Unlink Riot'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );

  return card;
}

type AchievementAdminAction = 'grant_achievement' | 'revoke_achievement';

function PublicAchievementGrid({
  achievements,
  emptyMessage = 'No achievements match the current filters.',
  columns = true,
  isAdmin = false,
  onAchievementAction,
  achievementBusy = '',
}: {
  achievements: AchievementListItem[];
  emptyMessage?: string;
  columns?: boolean;
  isAdmin?: boolean;
  onAchievementAction?: (action: AchievementAdminAction, achievementId: string) => void;
  achievementBusy?: string;
}) {
  const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);
  const achievementMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openAchievementId) return undefined;

    const closeWhenOutside = (event: PointerEvent) => {
      if (achievementMenuRef.current && !achievementMenuRef.current.contains(event.target as Node)) {
        setOpenAchievementId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenAchievementId(null);
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openAchievementId]);

  if (achievements.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`grid min-w-0 gap-4 ${columns ? 'md:grid-cols-2' : ''}`}>
      {achievements.map((achievement) => {
        const complete = Boolean(achievement.completedAt);
        const progressPercent = Math.min(100, Math.round((achievement.progressCurrent / achievement.progressTarget) * 100));
        return (
          <article key={achievement.id} className={`relative grid min-w-0 grid-cols-1 items-stretch gap-3 rounded-3xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 ${complete ? 'border-emerald-300/35 bg-emerald-400/10' : 'border-white/10 bg-slate-950/80'}`}>
            <div className="min-w-0 pr-10">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${complete ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400'}`}>
                      {complete ? <Trophy size={18} /> : isUnachievedHiddenAchievement(achievement) ? <Eye size={18} /> : <Award size={18} />}
                    </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="truncate text-base font-black text-white">{achievement.titleVisible}</h3>
                    {achievement.rewards.map((reward) => (
                      <span key={`${achievement.id}:${reward.kind}:${reward.name}`} className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${complete ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-slate-900 text-slate-300'}`}>
                        {reward.kind === 'title' ? 'Title' : 'Badge'}: {reward.name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-col items-start gap-1 text-xs font-semibold text-slate-500">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="uppercase tracking-[0.14em]">{getAchievementGameLabel(achievement.game)}</span>
                      <span>{formatAchievementDate(achievement.completedAt)}</span>
                    </div>
                    {achievement.completionPercent !== null ? <span>{achievement.completionPercent}% of players have completed this</span> : null}
                  </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">{achievement.descriptionVisible}</p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <div ref={openAchievementId === achievement.id ? achievementMenuRef : undefined} className="absolute right-4 top-4 z-10">
                      <button
                        type="button"
                        onClick={() => setOpenAchievementId((current) => current === achievement.id ? null : achievement.id)}
                        aria-label={`Manage ${achievement.titleVisible}`}
                        aria-expanded={openAchievementId === achievement.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 transition hover:border-white/20 hover:bg-slate-800 hover:text-white"
                      >
                        <Ellipsis size={16} />
                      </button>
                      {openAchievementId === achievement.id ? (
                        <div className="absolute right-0 top-full z-30 mt-2 grid w-48 gap-1 rounded-xl border border-white/10 bg-slate-950 p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenAchievementId(null);
                              onAchievementAction?.('grant_achievement', achievement.id);
                            }}
                            disabled={Boolean(achievementBusy)}
                            className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {achievementBusy === 'grant_achievement' ? 'Giving...' : 'Give Achievement'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenAchievementId(null);
                              onAchievementAction?.('revoke_achievement', achievement.id);
                            }}
                            disabled={Boolean(achievementBusy)}
                            className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {achievementBusy === 'revoke_achievement' ? 'Removing...' : 'Remove Achievement'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
            <div className="flex w-full shrink-0 items-center gap-3 sm:w-12 sm:flex-col sm:items-center sm:justify-between sm:gap-2">
              <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800 sm:h-auto sm:w-2 sm:flex-none sm:self-stretch">
                <div className={`absolute bottom-0 left-0 h-full rounded-full sm:hidden ${complete ? 'bg-emerald-300' : 'bg-amber-300'}`} style={{ width: `${progressPercent}%` }} />
                <div className={`absolute bottom-0 left-0 hidden w-full rounded-full sm:block ${complete ? 'bg-emerald-300' : 'bg-amber-300'}`} style={{ height: `${progressPercent}%` }} />
              </div>
              <span className="text-[0.68rem] font-black text-slate-400">{achievement.progressCurrent}/{achievement.progressTarget}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function filterAndSortAchievements(
  achievements: AchievementListItem[],
  gameFilters: Set<string>,
  cleanSearch: string,
  sortKey: AchievementSortKey,
  sortDirection: AchievementSortDirection,
) {
  return achievements
    .filter((achievement) => gameFilters.has(achievement.game))
    .filter((achievement) => !cleanSearch || achievement.titleVisible.toLowerCase().includes(cleanSearch) || achievement.descriptionVisible.toLowerCase().includes(cleanSearch))
    .sort((left, right) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey !== 'globalRanking') {
        const leftHidden = isUnachievedHiddenAchievement(left);
        const rightHidden = isUnachievedHiddenAchievement(right);
        if (leftHidden !== rightHidden) return leftHidden ? 1 : -1;
      }
      if (sortKey === 'completedAt') {
        if (!left.completedAt && !right.completedAt) return left.titleVisible.localeCompare(right.titleVisible);
        if (!left.completedAt) return 1;
        if (!right.completedAt) return -1;
        return (new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime()) * direction;
      }
      if (sortKey === 'alphabetical') {
        return left.titleVisible.localeCompare(right.titleVisible, undefined, { sensitivity: 'base' }) * direction;
      }
      if (sortKey === 'completionPercent') {
        const leftPercent = left.completionPercent ?? -1;
        const rightPercent = right.completionPercent ?? -1;
        if (leftPercent === rightPercent) return left.titleVisible.localeCompare(right.titleVisible);
        return (leftPercent - rightPercent) * direction;
      }
      if (left.completionRank === null && right.completionRank === null) return left.titleVisible.localeCompare(right.titleVisible);
      if (left.completionRank === null) return 1;
      if (right.completionRank === null) return -1;
      return (left.completionRank - right.completionRank) * direction;
    });
}

function PublicAchievementsTab({
  achievements,
  profileName,
  isAdmin = false,
  onAchievementAction,
  onResetAllAchievements,
  achievementBusy = '',
  resetAllBusy = false,
  resetAllConfirming = false,
}: {
  achievements: AchievementListItem[];
  profileName: string;
  isAdmin?: boolean;
  onAchievementAction?: (action: AchievementAdminAction, achievementId: string) => void;
  onResetAllAchievements?: () => void;
  achievementBusy?: string;
  resetAllBusy?: boolean;
  resetAllConfirming?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<AchievementSortKey>('completedAt');
  const [sortDirection, setSortDirection] = useState<AchievementSortDirection>('desc');
  const [gameFilters, setGameFilters] = useState<Set<string>>(() => new Set(ACHIEVEMENT_GAME_OPTIONS.map((option) => option.value)));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [viewerAchievements, setViewerAchievements] = useState<AchievementListItem[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const cleanSearch = searchQuery.trim().toLowerCase();
  const visibleAchievements = useMemo(() => filterAndSortAchievements(achievements, gameFilters, cleanSearch, sortKey, sortDirection), [achievements, cleanSearch, gameFilters, sortDirection, sortKey]);
  const visibleViewerAchievements = useMemo(() => filterAndSortAchievements(viewerAchievements ?? [], gameFilters, cleanSearch, sortKey, sortDirection), [cleanSearch, gameFilters, sortDirection, sortKey, viewerAchievements]);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  const loadComparison = async () => {
    if (viewerAchievements || compareLoading) {
      setCompareMode(true);
      return;
    }

    setCompareLoading(true);
    setCompareError('');
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        throw new Error('Login required to compare achievements.');
      }
      const response = await fetch('/api/achievements', { headers });
      const data = await response.json() as { achievements?: AchievementListItem[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to load your achievements.');
      }
      setViewerAchievements(data.achievements ?? []);
      setCompareMode(true);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : 'Unable to load your achievements.');
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div className="mt-3 grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-white">{profileName}&apos;s Achievement progress</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={onResetAllAchievements}
            disabled={resetAllBusy || Boolean(achievementBusy)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:border-red-300/35 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetAllBusy ? 'Resetting...' : resetAllConfirming ? 'Confirm Reset' : 'Reset All Achievements'}
          </button>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-3 sm:p-4">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)_auto_auto_auto] lg:items-end">
          <div className="relative min-w-0">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search achievements"
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30"
            />
          </div>
          <AppSelectMenu
            label="Sort by"
            value={sortKey}
            options={[
              { value: 'completedAt' as const, label: 'Date completed' },
              { value: 'globalRanking' as const, label: 'Global ranking' },
              { value: 'completionPercent' as const, label: '% of players completed' },
              { value: 'alphabetical' as const, label: 'Alphabetical' },
            ]}
            onChange={setSortKey}
            triggerClassName="h-12 min-h-12"
            menuClassName="min-w-[14rem] max-w-[calc(100vw-2rem)]"
          />
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:border-amber-300/40 hover:bg-slate-800"
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
          <div ref={filtersRef} className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:border-amber-300/40 hover:bg-slate-800"
            >
              <Filter size={16} />
              Filter
            </button>
            {filtersOpen ? (
              <div className="absolute right-0 top-12 z-30 grid w-[min(13rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-2 rounded-2xl border border-white/10 bg-slate-950 p-3">
                {ACHIEVEMENT_GAME_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-900">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={gameFilters.has(value)}
                      onChange={(event) => {
                        setGameFilters((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(value);
                          else next.delete(value);
                          return next;
                        });
                      }}
                      className="h-4 w-4 accent-amber-300"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-100">
            {achievements.filter((achievement) => achievement.completedAt).length} completed
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (compareMode) {
              setCompareMode(false);
            } else {
              void loadComparison();
            }
          }}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-300/10 px-5 text-sm font-bold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/20 sm:w-auto"
          disabled={compareLoading}
        >
          {compareLoading ? 'Loading...' : compareMode ? 'Hide Compare' : 'Compare'}
        </button>
      </div>

      {compareError ? <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100">{compareError}</p> : null}

      {compareMode && viewerAchievements ? (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <section className="min-w-0 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-3 sm:p-4">
            <h2 className="truncate text-base font-black text-white">{profileName}</h2>
            <PublicAchievementGrid achievements={visibleAchievements} columns={false} />
          </section>
          <section className="min-w-0 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-3 sm:p-4">
            <h2 className="truncate text-base font-black text-white">You</h2>
            <PublicAchievementGrid achievements={visibleViewerAchievements} columns={false} emptyMessage="You have no achievements matching the current filters." />
          </section>
        </div>
      ) : (
        <PublicAchievementGrid
          achievements={visibleAchievements}
          isAdmin={isAdmin}
          onAchievementAction={onAchievementAction}
          achievementBusy={achievementBusy}
        />
      )}
    </div>
  );
}

export function PublicProfileScreen({ username }: PublicProfileScreenProps) {
  const profileRouteKey = username.trim().toLowerCase();
  const [activeTab, setActiveTab] = useState<PublicProfileTab>('profile');
  const [profile, setProfile] = useState<PublicProfileRecord | null>(null);
  const [ownerView, setOwnerView] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [resolvedRouteKey, setResolvedRouteKey] = useState<string | null>(null);
  const [liveGameStatus, setLiveGameStatus] = useState<LiveGameStatusView | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<FriendCandidate['relationship']>('none');
  const [friendNote, setFriendNote] = useState('');
  const [friendNoteDraft, setFriendNoteDraft] = useState('');
  const [friendNoteEditing, setFriendNoteEditing] = useState(false);
  const [friendNoteSaving, setFriendNoteSaving] = useState(false);
  const [busy, setBusy] = useState(true);
  const [friendRequestBusy, setFriendRequestBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockedByViewer, setBlockedByViewer] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [adminBusy, setAdminBusy] = useState('');
  const [adminBanReason, setAdminBanReason] = useState('');
  const [adminConfirmAction, setAdminConfirmAction] = useState('');
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getProfileTabFromUrl(PUBLIC_PROFILE_TABS, 'profile'));
    };

    handlePopState();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen && !banDialogOpen) {
      return undefined;
    }

    const closeWhenOutside = (event: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
        setBanDialogOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
        setBanDialogOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [banDialogOpen, profileMenuOpen]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (userId) invalidateCachedOwnerProfileResponse(userId);
    };

    window.addEventListener('knowleague:profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('knowleague:profile-updated', handleProfileUpdated);
  }, []);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    let cancelled = false;
    void supabase?.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setCurrentUserId(data.session?.user.id ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setActiveTab(getProfileTabFromUrl(PUBLIC_PROFILE_TABS, 'profile'));
    setBusy(true);
    setMessage('');
    setProfile(null);
    setOwnerView(null);
    setIsAdmin(false);
    setResolvedRouteKey(null);
    setRelationship('none');
    setFriendNote('');
    setFriendNoteDraft('');
    setFriendNoteEditing(false);
    setFriendNoteSaving(false);
    setFriendRequestBusy(false);
    setBlocked(false);
    setBlockedByViewer(false);
    setBlockBusy(false);
    setProfileMenuOpen(false);
    setBanDialogOpen(false);
    setAdminBusy('');
    setAdminBanReason('');
    setAdminConfirmAction('');
    setLiveGameStatus(null);

    const loadProfile = async () => {
      try {
        const supabase = getOptionalSupabaseClient();
        const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } };
        const session = sessionData.session;
        const headers = session ? { Authorization: `Bearer ${session.access_token}` } : null;
        if (cancelled) return;

        const cachedResponse = session ? getCachedOwnerProfileResponse<PublicProfileResponse>(session.user.id, profileRouteKey) : null;
        if (cachedResponse?.profile) {
          setProfile(cachedResponse.profile);
          setOwnerView(cachedResponse.viewer?.isOwner === true);
          setIsAdmin(cachedResponse.viewer?.isAdmin === true);
          setResolvedRouteKey(profileRouteKey);
          setRelationship(cachedResponse.profile.relationship ?? 'none');
          setFriendNote(cachedResponse.profile.friend_note ?? '');
          setFriendNoteDraft(cachedResponse.profile.friend_note ?? '');
          setBlocked(cachedResponse.profile.blocked === true);
          setBlockedByViewer(cachedResponse.profile.blockedByViewer === true);
          setBusy(false);
          return;
        }

        const response = await fetch(`/api/profile/public/${encodeURIComponent(username.trim())}`, {
          headers: headers ?? undefined,
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json() as PublicProfileResponse;
        if (!response.ok || !data.profile) {
          throw new Error(data.error ?? 'Unable to load profile.');
        }

        if (!cancelled) {
          setProfile(data.profile);
          setOwnerView(data.viewer?.isOwner === true);
          setIsAdmin(data.viewer?.isAdmin === true);
          setResolvedRouteKey(profileRouteKey);
          setRelationship(data.profile.relationship ?? 'none');
          setFriendNote(data.profile.friend_note ?? '');
          setFriendNoteDraft(data.profile.friend_note ?? '');
          setBlocked(data.profile.blocked === true);
          setBlockedByViewer(data.profile.blockedByViewer === true);
          if (data.viewer?.isOwner === true && session?.user.id === data.profile.id) {
            setCachedOwnerProfileResponse(data.profile.id, profileRouteKey, data);
          }
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setMessage(error instanceof Error ? error.message : 'Unable to load profile.');
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profileRouteKey, username]);

  useEffect(() => {
    if (ownerView !== false) {
      setLiveGameStatus(null);
      return undefined;
    }

    const riotAccount = profile?.riot_account_name?.trim();
    if (!riotAccount) {
      setLiveGameStatus(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLiveGameStatus(null);
    const requestUrl = new URL('/api/riot-account/live-game', window.location.origin);
    requestUrl.searchParams.set('riotId', riotAccount);

    fetch(requestUrl, { signal: controller.signal })
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
      .catch((error) => {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setLiveGameStatus(null);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ownerView, profile?.riot_account_name]);

  useEffect(() => {
    if (!liveGameStatus?.inGame) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [liveGameStatus?.inGame]);

  const sendFriendRequest = async (targetUserId: string) => {
    if (friendRequestBusy) {
      return;
    }

    setFriendRequestBusy(true);
    try {
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
      const data = await response.json() as { error?: string };
      if (response.ok) {
        setRelationship('pending');
        setMessage('');
      } else {
        setMessage(data.error ?? 'Unable to send friend request.');
      }
    } catch {
      setMessage('Unable to send friend request. Please try again.');
    } finally {
      setFriendRequestBusy(false);
    }
  };

  const saveFriendNote = async () => {
    if (!profile || relationship !== 'friend' || friendNoteSaving) {
      return;
    }

    setFriendNoteSaving(true);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        throw new Error('Login required.');
      }
      const response = await fetch(`/api/friends/${profile.id}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: friendNoteDraft.trim().slice(0, 30) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to save friend note.');
      }
      setFriendNote(friendNoteDraft.trim().slice(0, 30));
      setFriendNoteEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save friend note.');
    } finally {
      setFriendNoteSaving(false);
    }
  };

  const blockProfile = async () => {
    if (!profile || !currentUserId || currentUserId === profile.id || blockBusy) {
      if (!currentUserId) {
        setMessage('Login required to block users.');
      }
      return;
    }

    setBlockBusy(true);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        throw new Error('Login required to block users.');
      }
      const response = await fetch(`/api/users/${profile.id}/block`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to block this user.');
      }

      setBlocked(true);
      setBlockedByViewer(true);
      setRelationship('none');
      setFriendNote('');
      setFriendNoteDraft('');
      setFriendNoteEditing(false);
      setProfileMenuOpen(false);
      setMessage('User blocked.');
      window.dispatchEvent(new Event('knowleague:friends-refresh'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to block this user.');
    } finally {
      setBlockBusy(false);
    }
  };

  const unblockProfile = async () => {
    if (!profile || !currentUserId || currentUserId === profile.id || blockBusy || !blockedByViewer) {
      if (!currentUserId) {
        setMessage('Login required to unblock users.');
      }
      return;
    }

    setBlockBusy(true);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        throw new Error('Login required to unblock users.');
      }
      const response = await fetch(`/api/users/${profile.id}/block`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to unblock this user.');
      }

      setBlocked(false);
      setBlockedByViewer(false);
      setRelationship('none');
      setProfileMenuOpen(false);
      setMessage('User unblocked.');
      window.dispatchEvent(new Event('knowleague:friends-refresh'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to unblock this user.');
    } finally {
      setBlockBusy(false);
    }
  };

  const runAdminAction = async (
    action: string,
    payload: Record<string, unknown> = {},
    successMessage = 'Administrative action completed.',
  ) => {
    if (!profile || !isAdmin || adminBusy) return;

    setAdminBusy(action);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) throw new Error('Admin authentication is required.');
      const response = await fetch(`/api/admin/users/${profile.id}/profile`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to complete administrative action.');

      if (action === 'unlink_discord' || action === 'unlink_riot' || action === 'ban' || action === 'unban') {
        setProfile((current) => current ? {
          ...current,
          ...(action === 'unlink_discord' ? { discord_username: null, discord_avatar_url: null, discord_banner_url: null } : {}),
          ...(action === 'unlink_riot' ? { riot_account_name: null } : {}),
          ...(action === 'ban' ? { is_banned: true } : {}),
          ...(action === 'unban' ? { is_banned: false } : {}),
        } : current);
      } else if (action === 'grant_achievement' || action === 'revoke_achievement') {
        const achievementId = typeof payload.achievementId === 'string' ? payload.achievementId : '';
        const completed = action === 'grant_achievement';
        const updatedAt = new Date().toISOString();
        setProfile((current) => current ? {
          ...current,
          achievements: current.achievements.map((achievement) => {
            if (achievement.id !== achievementId) {
              return achievement;
            }

            const completedAt = completed ? (achievement.completedAt ?? updatedAt) : null;
            return {
              ...achievement,
              progressCurrent: completed ? achievement.progressTarget : 0,
              completedAt,
              updatedAt,
              ...maskAchievement(achievement, completedAt),
              ...(completed ? {} : { completionRank: null }),
            };
          }),
        } : current);
      } else if (action === 'reset_achievements') {
        const updatedAt = new Date().toISOString();
        setProfile((current) => current ? {
          ...current,
          achievements: current.achievements.map((achievement) => ({
            ...achievement,
            progressCurrent: 0,
            completedAt: null,
            updatedAt,
            completionRank: null,
            ...maskAchievement(achievement, null),
          })),
        } : current);
      }
      if (action === 'ban' || action === 'unban') {
        setBanDialogOpen(false);
        setAdminBanReason('');
      }
      setAdminConfirmAction('');
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete administrative action.');
    } finally {
      setAdminBusy('');
    }
  };

  const requestAdminConfirmation = (key: string, action: string, payload: Record<string, unknown>, successMessage: string) => {
    if (adminConfirmAction !== key) {
      setAdminConfirmAction(key);
      return;
    }
    void runAdminAction(action, payload, successMessage);
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

  if (ownerView === true && resolvedRouteKey === profileRouteKey && profile) {
    return (
      <ProfileScreen
        expectedUserId={profile.id}
        expectedUsername={profile.username}
        initialProfileData={{ ...profile, chat_color: profile.chat_color ?? 'amber', chat_border: profile.chat_border ?? 'black' }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-12 lg:py-8">
        <header className="relative z-30 flex min-w-0 flex-col items-stretch gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid min-w-0 gap-1">
              <h1 className="min-w-0 truncate text-lg font-semibold text-white sm:text-xl">
                Profile{profile?.username ? (
                  <> - <span style={getChatNameStyle(profile.chat_color)}>{profile.username}</span></>
                ) : ''}
              </h1>
            </div>
          </div>
          {!busy && profile ? (
            <div className="flex min-h-11 w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
               <ProfileFriendsMenu
                 username={profile.username}
                 count={profile.friends_count}
                 isOwner={false}
                 initialListPublic={profile.friends_list_public}
               />
              {currentUserId && currentUserId !== profile.id && !blocked ? (
                relationship === 'friend' ? (
                  <>
                    <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-sm font-bold text-emerald-100 sm:flex-none sm:px-4">
                      <Users size={17} />
                      Friend
                    </span>
                    <button
                      type="button"
                      onClick={() => requestOpenFriendMessages(profile.id)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-slate-100 transition hover:bg-slate-900 sm:flex-none sm:px-4"
                    >
                      <MessageCircle size={17} />
                      Messages
                    </button>
                  </>
                ) : relationship === 'pending' ? (
                  <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-slate-300 sm:flex-none sm:px-4">
                    Pending
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!profile.friend_requests_open || friendRequestBusy}
                    onClick={() => void sendFriendRequest(profile.id)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none sm:px-4"
                  >
                    <UserPlus size={17} />
                    {friendRequestBusy ? 'Sending...' : profile.friend_requests_open ? 'Add Friend' : 'Requests Closed'}
                  </button>
                )
              ) : blocked ? (
                <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-400/10 px-3 text-sm font-bold text-red-100 sm:flex-none sm:px-4">
                  <ShieldBan size={17} />
                  Blocked
                </span>
              ) : null}
              <div ref={profileMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setBanDialogOpen(false);
                    setProfileMenuOpen((open) => !open);
                  }}
                  aria-label="Profile actions"
                  aria-expanded={profileMenuOpen}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-300 transition hover:bg-slate-900 hover:text-white"
                >
                  <Ellipsis size={20} />
                </button>
                {profileMenuOpen ? (
                  <div className="absolute right-0 top-full z-40 mt-2 grid w-52 gap-1 rounded-2xl border border-white/10 bg-slate-950 p-2">
                    <button
                      type="button"
                      onClick={() => void (blockedByViewer ? unblockProfile() : blockProfile())}
                      disabled={blockBusy || (blocked && !blockedByViewer)}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShieldBan size={16} />
                      {blockBusy ? (blockedByViewer ? 'Unblocking...' : 'Blocking...') : blockedByViewer ? 'Unblock User' : blocked ? 'User Blocked' : 'Block User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        requestOpenUserReport(profile.username);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-900 hover:text-red-100"
                    >
                      <Flag size={16} />
                      Report User
                    </button>
                    {isAdmin && ownerView === false ? (
                      profile.is_banned ? (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            void runAdminAction('unban', {}, 'User unbanned.');
                          }}
                          disabled={Boolean(adminBusy)}
                          className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldBan size={16} />
                          {adminBusy === 'unban' ? 'Unbanning...' : 'Unban User'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setAdminConfirmAction('');
                            setBanDialogOpen(true);
                          }}
                          disabled={Boolean(adminBusy)}
                          className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldBan size={16} />
                          Ban User
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
                {banDialogOpen && isAdmin && ownerView === false && !profile.is_banned ? (
                  <div className="absolute right-0 top-full z-40 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-3 rounded-2xl border border-red-300/25 bg-slate-950 p-4">
                    <div>
                      <p className="text-sm font-bold text-white">Ban User</p>
                      <p className="mt-1 text-xs text-slate-500">This prevents multiplayer play, friend requests, and messages.</p>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Username</span>
                      <input value={profile.username} readOnly className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-slate-300 outline-none" />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ban Reason</span>
                      <textarea
                        value={adminBanReason}
                        onChange={(event) => setAdminBanReason(event.target.value.slice(0, 500))}
                        rows={3}
                        maxLength={500}
                        autoFocus
                        placeholder="Required reason"
                        className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-red-300/40 focus:ring-1 focus:ring-red-300/20"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!adminBanReason.trim()) {
                          setMessage('Enter a reason before banning this user.');
                          return;
                        }
                        requestAdminConfirmation('ban', 'ban', { reason: adminBanReason.trim() }, 'User banned.');
                      }}
                      disabled={Boolean(adminBusy)}
                      className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${adminConfirmAction === 'ban' ? 'border-red-300/50 bg-red-400/20 text-red-100' : 'border-red-300/30 bg-red-400/10 text-red-100 hover:bg-red-400/20'}`}
                    >
                      {adminBusy === 'ban' ? 'Banning...' : adminConfirmAction === 'ban' ? 'Click again to confirm' : 'Confirm Ban'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </header>

        <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl sm:p-5 lg:p-6">
          {busy ? (
            <div className="flex min-h-[30rem] items-center justify-center gap-3 text-sm font-semibold text-slate-300">
              <Loader2 size={18} className="animate-spin text-amber-300" />
              Loading profile...
            </div>
          ) : null}

          {!busy && profile ? (
            <>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-slate-950/70 p-1 sm:gap-2">
                {[
                  ['profile', 'Profile'],
                  ['stats', 'Stats'],
                  ['achievements', 'Achievements'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      const nextTab = tab as PublicProfileTab;
                      setActiveTab(nextTab);
                      pushProfileTabToUrl(nextTab);
                    }}
                    className={`min-h-10 rounded-xl px-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                      activeTab === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'profile' ? (
                <div className="mt-6 flex min-w-0 flex-col items-start gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5 md:flex-row">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex w-20 shrink-0 flex-col items-center">
                    <span
                      className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-2xl font-black text-amber-200"
                      style={profile.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined}
                      aria-hidden="true"
                    >
                      {profile.avatar_url ? null : profileInitial}
                    </span>
                    {selectedTitleReward ? (
                      <span className="group relative mt-2 inline-flex max-w-32">
                        <span className="inline-flex max-w-32 cursor-help items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-center text-[0.68rem] font-black uppercase tracking-[0.1em] text-amber-100">
                          <span className="truncate">{selectedTitleReward.name}</span>
                        </span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left opacity-0 shadow-xl transition group-hover:opacity-100">
                          <span className="block text-xs font-bold text-white">{selectedTitleReward.name}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">{getRewardDescription(selectedTitleReward.id, 'title') || 'Earned profile title.'}</span>
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {riotViewerHref ? (
                        <Link
                          href={riotViewerHref}
                          className="min-w-0 truncate text-3xl font-bold text-white transition hover:text-amber-200"
                          style={getChatNameStyle(profile.chat_color)}
                          title="Open linked Riot account in League Account Viewer"
                        >
                          {profile.display_name || profile.username}
                        </Link>
                      ) : (
                        <h2 className="truncate text-3xl font-bold text-white" style={getChatNameStyle(profile.chat_color)}>{profile.display_name || profile.username}</h2>
                      )}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                      <span className="truncate">Joined {formatProfileDate(profile.created_at)}</span>
                    </div>
                    {profile.profile_status ? <p className="mt-2 max-w-xl text-sm leading-5 text-slate-300">{profile.profile_status}</p> : null}
                    {liveGameNote ? (
                      <p className="mt-1 text-sm font-semibold text-emerald-300">{liveGameNote}</p>
                    ) : null}
                    {relationship === 'friend' ? (
                      <div className="mt-2 flex min-w-0 items-center gap-2">
                        {friendNoteEditing ? (
                          <input
                            value={friendNoteDraft}
                            onChange={(event) => setFriendNoteDraft(event.target.value.slice(0, 30))}
                            maxLength={30}
                            autoFocus
                            placeholder="Add note"
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setFriendNoteDraft(friendNote);
                              setFriendNoteEditing(true);
                            }}
                            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-left text-xs italic text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                          >
                            <Pencil size={13} className="shrink-0 text-slate-500" />
                            <span className="truncate">{friendNote ? `Note: ${friendNote}` : 'Add note'}</span>
                          </button>
                        )}
                        {friendNoteEditing ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFriendNoteDraft(friendNote);
                                setFriendNoteEditing(false);
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900 hover:text-white"
                              aria-label="Cancel note editing"
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveFriendNote()}
                              disabled={friendNoteSaving}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-300 text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
                              aria-label="Save friend note"
                            >
                              {friendNoteSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="hidden self-stretch min-h-28 w-px shrink-0 bg-white/10 md:block" />
                <div className="min-w-0 flex-1 self-stretch">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Profile Cosmetics</p>
                  <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                    Chat Cosmetics
                    <span className="h-5 w-5 rounded-full" style={getChatSwatchStyle(profile.chat_color)} />
                    <span className="h-5 w-5 rounded-full border-2" style={getChatBorderSwatchStyle(profile.chat_border)} />
                  </div>
                </div>
                <div className="hidden self-stretch min-h-28 w-px shrink-0 bg-white/10 md:block" />
                <div className="min-w-0 self-stretch md:w-52">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Badges</p>
                  <div className="grid w-fit grid-cols-4 gap-1.5">
                    {displayedBadgeRewards.slice(0, 8).map((badge) => (
                      <div key={badge.id} className="group relative flex h-8 w-8 cursor-help items-center justify-center rounded-lg border border-amber-300/35 bg-amber-300/10 text-amber-100">
                        <BadgeCheck size={16} />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left opacity-0 shadow-xl transition group-hover:opacity-100">
                          <span className="block text-xs font-bold text-white">{badge.name}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">{getRewardDescription(badge.id, 'badge') || 'Earned profile badge.'}</span>
                        </span>
                      </div>
                    ))}
                    {!displayedBadgeRewards.length ? <p className="whitespace-nowrap text-sm text-slate-500">No badges selected.</p> : null}
                  </div>
                </div>
                </div>
              ) : null}

              {activeTab === 'profile' ? (
                <div className="mt-6 grid gap-4">
                  <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About Me</p>
                    <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {profile.about_me || 'This player has not added an about me section yet.'}
                    </p>
                  </section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DiscordPublicCard
                      profile={profile}
                      isAdmin={isAdmin && ownerView === false}
                      onUnlink={() => void runAdminAction('unlink_discord', {}, 'Discord unlinked.')}
                      unlinkBusy={adminBusy === 'unlink_discord'}
                    />
                    <RiotPublicCard
                      profile={profile}
                      isAdmin={isAdmin && ownerView === false}
                      onUnlink={() => void runAdminAction('unlink_riot', {}, 'Riot account unlinked.')}
                      unlinkBusy={adminBusy === 'unlink_riot'}
                    />
                  </div>
                  <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Linked Profiles</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Link
                        href={`/riftbound/profile/${encodeURIComponent(profile.username)}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 transition hover:border-amber-300/40 hover:bg-slate-900"
                      >
                        <span className="min-w-0">
                          <p className="text-sm font-bold text-white">Riftbound Profile</p>
                          <span className="mt-1 block text-xs text-slate-500">View their public Riftbound profile.</span>
                        </span>
                        <ExternalLink size={16} className="shrink-0 text-slate-500" />
                      </Link>
                      {riotViewerHref ? (
                        <Link
                          href={riotViewerHref}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 transition hover:border-amber-300/40 hover:bg-slate-900"
                        >
                          <span className="min-w-0">
                            <p className="text-sm font-bold text-white">League Account Viewer</p>
                            <span className="mt-1 block truncate text-xs text-slate-500">Open {profile.riot_account_name} in LAV.</span>
                          </span>
                          <ExternalLink size={16} className="shrink-0 text-slate-500" />
                        </Link>
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 opacity-70">
                          <span>
                            <p className="text-sm font-bold text-slate-300">League Account Viewer</p>
                            <span className="mt-1 block text-xs text-slate-500">No linked League account.</span>
                          </span>
                          <ExternalLink size={16} className="shrink-0 text-slate-600" />
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTab === 'stats' ? (
                <div className="mt-5 grid gap-3">
                  {isAdmin && ownerView === false ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => requestAdminConfirmation('reset-stats-all', 'reset_stats', { statsTarget: 'all' }, 'All game stats reset.')}
                        disabled={Boolean(adminBusy)}
                        className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${adminConfirmAction === 'reset-stats-all' ? 'border-red-300/50 bg-red-400/15 text-red-100' : 'border-white/10 bg-slate-950 text-slate-200 hover:border-red-300/35'}`}
                      >
                        {adminBusy === 'reset_stats' ? 'Resetting...' : adminConfirmAction === 'reset-stats-all' ? 'Click again to confirm reset' : 'Reset All Stats'}
                      </button>
                    </div>
                  ) : null}
                  <PublicQuizStatsSection
                    title="Ability Blitz"
                    statsTarget="ability-blitz"
                    isAdmin={isAdmin && ownerView === false}
                    onResetStats={(target) => requestAdminConfirmation(`reset-stats-${target}`, 'reset_stats', { statsTarget: target }, 'Game stats reset.')}
                    resetBusy={adminBusy === 'reset_stats'}
                    resetConfirming={adminConfirmAction === 'reset-stats-ability-blitz'}
                  />
                  <PublicQuizStatsSection
                    title="Skin Champion"
                    statsTarget="skin-champion"
                    isAdmin={isAdmin && ownerView === false}
                    onResetStats={(target) => requestAdminConfirmation(`reset-stats-${target}`, 'reset_stats', { statsTarget: target }, 'Game stats reset.')}
                    resetBusy={adminBusy === 'reset_stats'}
                    resetConfirming={adminConfirmAction === 'reset-stats-skin-champion'}
                  />
                  <PublicSmallStatsPanels
                    isAdmin={isAdmin && ownerView === false}
                    onResetStats={(target) => requestAdminConfirmation(`reset-stats-${target}`, 'reset_stats', { statsTarget: target }, 'Game stats reset.')}
                    resetBusy={adminBusy === 'reset_stats'}
                    resetConfirmTarget={adminConfirmAction.startsWith('reset-stats-') ? adminConfirmAction.replace('reset-stats-', '') as AdminStatsTarget : null}
                  />
                </div>
              ) : null}

              {activeTab === 'achievements' ? (
                <PublicAchievementsTab
                  achievements={profile.achievements}
                  profileName={profile.display_name || profile.username}
                  isAdmin={isAdmin && ownerView === false}
                  onAchievementAction={(action, achievementId) => {
                    const achievementName = profile.achievements.find((achievement) => achievement.id === achievementId)?.titleVisible ?? achievementId;
                    void runAdminAction(
                      action,
                      { achievementId },
                      `${action === 'grant_achievement' ? 'Achievement granted' : 'Achievement removed'}: ${achievementName}.`,
                    );
                  }}
                  onResetAllAchievements={() => requestAdminConfirmation('reset-achievements', 'reset_achievements', {}, 'All achievements reset.')}
                  achievementBusy={adminBusy === 'grant_achievement' || adminBusy === 'revoke_achievement' ? adminBusy : ''}
                  resetAllBusy={adminBusy === 'reset_achievements'}
                  resetAllConfirming={adminConfirmAction === 'reset-achievements'}
                />
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
