'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Pencil,
  RotateCcw,
  Save,
  Trophy,
  UserPlus,
  Users,
  Search,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { getEarnedRewards, type AchievementListItem } from '@/lib/achievements';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { forfeitStoredMultiplayerSessions } from '@/lib/multiplayer-client-session';
import { loadDetailedGameStats, loadPlayerGameStats, type DetailedGameStats, type PlayerGameStats, type QuizGameDetailedStats, type QuizModeStats, type SkincognitoDetailedStats } from '@/lib/game-storage';
import {
  type ChatBorder,
  CHAT_COLOR_VALUES,
  DEFAULT_CHAT_BORDER,
  getChatBorderSwatchStyle,
  getChatBubbleStyle,
  getChatSwatchStyle,
  normalizeChatBorder,
  normalizeChatColor,
} from '@/lib/chat-colors';

type ProfileRecord = {
  username: string;
  display_name: string;
  about_me: string;
  friends_count: number;
  friend_requests_open: boolean;
  avatar_url: string | null;
  chat_color: string;
  chat_border: string;
  selected_title_reward_id: string | null;
  displayed_badge_reward_ids: string[];
  discord_username: string | null;
  discord_avatar_url: string | null;
  discord_banner_url: string | null;
  riot_account_name: string | null;
  created_at: string;
};

type ProfileTab = 'profile' | 'stats' | 'achievements' | 'account';
type AchievementSortKey = 'completedAt' | 'globalRanking';
type AchievementSortDirection = 'asc' | 'desc';
type IncomingRequest = {
  id: string;
  requester: {
    id: string;
    username: string;
    displayName: string;
    online: boolean;
  };
};
type CachedProfileScreenState = {
  userId: string;
  email: string;
  profile: ProfileRecord | null;
  usernameDraft: string;
  aboutDraft: string;
  chatColorDraft: string;
  chatBorderDraft: string;
  friendRequestsOpen: boolean;
  incomingRequests: IncomingRequest[];
};
type FriendCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  relationship: 'friend' | 'incoming' | 'outgoing' | 'none';
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
const AVATAR_BUCKET = 'profile-avatars';
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const CHAT_COLOR_OPTIONS = CHAT_COLOR_VALUES.map((value) => ({ value }));
const CHAT_BORDER_OPTIONS = CHAT_COLOR_VALUES.map((value) => ({ value }));
const PROFILE_COSMETICS_DATABASE_MESSAGE = 'Profile cosmetics cannot be saved because the database is missing the latest profile cosmetics columns. Apply the latest profile migrations, then save again.';
const ACHIEVEMENT_COSMETICS_DATABASE_MESSAGE = 'Achievement cosmetics cannot be saved because the database is missing the latest achievement cosmetics columns. Apply the latest profile achievement cosmetics migration, then save again.';
let cachedProfileScreenState: CachedProfileScreenState | null = null;

type ProfileScreenProps = {
  presentation?: 'page' | 'overlay';
  initialTab?: ProfileTab;
  onClose?: () => void;
};

function getLinkedValue(value?: string | null) {
  return value?.trim() || 'Not linked';
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

function openPublicProfileOverlay(username: string) {
  window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username } }));
}

function isMissingProfileColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (maybeError.code === '42703' || maybeError.code === 'PGRST204') && text.includes(column);
}

function getTopValue<TValue extends { count: number }>(values: Record<string, TValue>) {
  return Object.values(values).sort((left, right) => right.count - left.count)[0] ?? null;
}

function formatAverage(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return '-';
  }

  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function formatSecondsValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  return `${formatAverage(value)}s`;
}

function getTopValueStat(values: Record<string, { value: string; count: number }>) {
  return Object.values(values).sort((left, right) => right.count - left.count)[0] ?? null;
}

function CompactStat({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div title={title} className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-black text-white">{value}</p>
    </div>
  );
}

function QuizStatsRow({ label, stats, multiplayer = false }: { label: string; stats: QuizModeStats; multiplayer?: boolean }) {
  const averageTimePerItem = stats.completedItems > 0 ? stats.totalElapsedSeconds / stats.completedItems : 0;
  const winPercent = formatPercent(stats.matchesWon, stats.matchesPlayed);

  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/55 p-3 lg:grid-cols-[7rem_repeat(6,minmax(0,1fr))] lg:items-center">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white">{label}</p>
        {multiplayer ? <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{stats.matchesWon}W / {stats.matchesLost}L</p> : null}
      </div>
      <CompactStat label="Played" value={stats.totalPlayed} />
      <CompactStat label="Streak" value={`${stats.currentStreak} / ${stats.bestStreak}`} title="Current streak / best streak" />
      <CompactStat label="Guesses" value={stats.totalGuesses} />
      <CompactStat label="Correct" value={formatPercent(stats.correctGuesses, stats.totalGuesses)} />
      <CompactStat label="Avg/item" value={formatSecondsValue(averageTimePerItem)} />
      <CompactStat label={multiplayer ? 'Win %' : 'Record'} value={multiplayer ? winPercent : '-'} />
    </div>
  );
}

function QuizGameStatsSection({ title, stats }: { title: string; stats: QuizGameDetailedStats }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h3 className="text-base font-black text-amber-300">{title}</h3>
        <span className="text-xs font-semibold text-slate-300">Current / Best streak</span>
      </div>
      <div className="grid gap-2">
        <QuizStatsRow label="Solo" stats={stats.solo} />
        <QuizStatsRow label="Multiplayer" stats={stats.multiplayer} multiplayer />
      </div>
    </section>
  );
}

function SkindleStatsPanel({ stats }: { stats: PlayerGameStats }) {
  const averageGuesses = stats.gamesCompleted > 0 ? stats.totalGuesses / stats.gamesCompleted : 0;
  const topGuess = getTopValue(stats.guessStats);
  const topSkinLine = getTopValue(stats.skinLineStats);
  const topRarity = getTopValue(stats.rarityStats);

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-amber-300">Skindle</h3>
        </div>
        <span title="Current streak / best streak" className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">{stats.currentStreak} / {stats.highestStreak}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <CompactStat label="Played" value={stats.gamesCompleted} />
        <CompactStat label="Avg guesses" value={averageGuesses > 0 ? formatAverage(averageGuesses) : '-'} />
        <CompactStat label="Total guesses" value={stats.totalGuesses || '-'} />
      </div>
      <div className="mt-3 grid gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-2">
        <p className="truncate"><span className="text-slate-500">Common:</span> {topGuess?.answer ?? '-'}</p>
        <p className="truncate"><span className="text-slate-500">Last:</span> {stats.lastCorrectGuess?.answer ?? '-'}</p>
        <p className="truncate"><span className="text-slate-500">Skin line:</span> {topSkinLine?.value ?? '-'}</p>
        <p className="truncate"><span className="text-slate-500">Rarity:</span> {topRarity?.value ?? '-'}</p>
      </div>
    </article>
  );
}

function SkincognitoStatsPanel({ stats }: { stats: SkincognitoDetailedStats }) {
  const averageVictoryTurns = stats.victoriesWithTurnCount > 0 ? stats.totalVictoryTurns / stats.victoriesWithTurnCount : 0;
  const topSkinGuess = getTopValueStat(stats.guessedSkinStats);

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-amber-300">Skincognito</h3>
        </div>
        <span title="Current streak / best streak" className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">{stats.currentStreak} / {stats.bestStreak}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <CompactStat label="Played" value={stats.totalPlayed} />
        <CompactStat label="Record" value={`${stats.totalWins}W / ${stats.totalLosses}L`} />
        <CompactStat label="Win %" value={formatPercent(stats.totalWins, stats.totalPlayed)} />
        <CompactStat label="Guesses" value={stats.totalGuesses} />
        <CompactStat label="Correct" value={formatPercent(stats.correctGuesses, stats.totalGuesses)} />
        <CompactStat label="Avg turns" value={averageVictoryTurns > 0 ? formatAverage(averageVictoryTurns) : '-'} />
        <div className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 sm:col-span-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Most guessed skin</p>
          <p className="mt-0.5 truncate text-base font-black text-white">{topSkinGuess?.value ?? '-'}</p>
        </div>
      </div>
    </article>
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

function DiscordConnectionCard({
  profile,
  onConnect,
  onUnlink,
}: {
  profile: ProfileRecord | null;
  onConnect: () => void;
  onUnlink: () => void;
}) {
  const isLinked = Boolean(profile?.discord_username);
  const discordName = getLinkedValue(profile?.discord_username);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#5865F2]/40 bg-[#111a3a]/80 shadow-[0_0_28px_rgba(88,101,242,0.14)]">
      <div
        className="h-20 bg-gradient-to-r from-[#5865F2] via-[#4752C4] to-[#2b2d63] bg-cover bg-center"
        style={profile?.discord_banner_url ? { backgroundImage: `url(${profile.discord_banner_url})` } : undefined}
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
                style={profile?.discord_avatar_url ? { backgroundImage: `url(${profile.discord_avatar_url})` } : undefined}
                aria-hidden="true"
              >
                {profile?.discord_avatar_url ? null : discordName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-white">{discordName}</p>
                <p className="mt-1 text-xs font-semibold text-[#b8c1ff]">
                  {isLinked ? 'Discord account linked' : 'Link Discord to show your account here.'}
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
        <button
          type="button"
          onClick={isLinked ? onUnlink : onConnect}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#5865F2]/40 bg-[#5865F2] px-4 text-sm font-bold text-white transition hover:bg-[#4752C4]"
        >
          {isLinked ? 'Unlink Discord' : 'Connect Discord'}
        </button>
      </div>
    </article>
  );
}

function RiotConnectionCard({ value }: { value: string }) {
  const isLinked = value !== 'Not linked';

  return (
    <article className="rounded-2xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] p-4 shadow-[0_0_28px_rgba(209,54,57,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#d13639]/40 bg-[#d13639]/15 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#f87171]">
              Riot
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c89b3c]">Riot Account</p>
          </div>
          <p className="mt-2 text-lg font-bold text-white">{value}</p>
        </div>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
            isLinked ? 'border-[#c89b3c]/40 bg-[#c89b3c]/15 text-[#f0d178]' : 'border-[#d13639]/30 bg-black/30 text-[#c89b3c]'
          }`}
        >
          {isLinked ? <Check size={17} /> : <LinkIcon size={17} />}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">Riot linking will connect to the future masteries page and account-specific League data.</p>
      <button
        type="button"
        disabled
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d13639]/35 bg-[#d13639]/10 px-4 text-sm font-bold text-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-70"
      >
        Link Riot Soon
      </button>
    </article>
  );
}

export function ProfileScreen({ presentation = 'page', initialTab = 'profile', onClose }: ProfileScreenProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [aboutDraft, setAboutDraft] = useState('');
  const [chatColorDraft, setChatColorDraft] = useState('amber');
  const [chatBorderDraft, setChatBorderDraft] = useState(DEFAULT_CHAT_BORDER);
  const [selectedTitleRewardId, setSelectedTitleRewardId] = useState('');
  const [displayedBadgeRewardIds, setDisplayedBadgeRewardIds] = useState<string[]>([]);
  const [cosmeticsMenuOpen, setCosmeticsMenuOpen] = useState(false);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [badgeEditorOpen, setBadgeEditorOpen] = useState(false);
  const [pendingChatColor, setPendingChatColor] = useState('amber');
  const [pendingChatBorder, setPendingChatBorder] = useState<ChatBorder>(DEFAULT_CHAT_BORDER);
  const [cosmeticsPreviewColor, setCosmeticsPreviewColor] = useState<string | null>(null);
  const [cosmeticsPreviewBorder, setCosmeticsPreviewBorder] = useState<string | null>(null);
  const [friendRequestsOpen, setFriendRequestsOpen] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerGameStats[]>([]);
  const [detailedStats, setDetailedStats] = useState<DetailedGameStats>(() => loadDetailedGameStats());
  const [accountInfoVisible, setAccountInfoVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState<string | null>(null);
  const [avatarDraftBlob, setAvatarDraftBlob] = useState<Blob | null>(null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarAction, setAvatarAction] = useState<'unchanged' | 'replace' | 'remove'>('unchanged');
  const [avatarCropScale, setAvatarCropScale] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState({ x: 0, y: 0 });
  const [avatarCropNaturalSize, setAvatarCropNaturalSize] = useState({ width: 0, height: 0 });
  const [avatarDragStart, setAvatarDragStart] = useState<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<FriendCandidate[]>([]);
  const [friendSearchContext, setFriendSearchContext] = useState<{ candidate: FriendCandidate; x: number; y: number } | null>(null);
  const [achievements, setAchievements] = useState<AchievementListItem[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [achievementsLoadAttempted, setAchievementsLoadAttempted] = useState(false);
  const [achievementSearchQuery, setAchievementSearchQuery] = useState('');
  const [achievementSortKey, setAchievementSortKey] = useState<AchievementSortKey>('completedAt');
  const [achievementSortDirection, setAchievementSortDirection] = useState<AchievementSortDirection>('desc');
  const [achievementGameFilters, setAchievementGameFilters] = useState<Set<string>>(() => new Set(['general', 'skindle']));
  const [achievementFiltersOpen, setAchievementFiltersOpen] = useState(false);
  const addFriendPanelRef = useRef<HTMLDivElement | null>(null);
  const cosmeticsMenuRef = useRef<HTMLDivElement | null>(null);
  const achievementFiltersRef = useRef<HTMLDivElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarCropImageRef = useRef<HTMLImageElement | null>(null);
  const avatarDraftUrlRef = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const cleanUsernameDraft = usernameDraft.trim();
  const cleanAboutDraft = aboutDraft.trim();
  const hasAvatarChanges = avatarAction !== 'unchanged';
  const avatarPreviewUrl = avatarAction === 'replace'
    ? avatarDraftUrl
    : avatarAction === 'remove'
      ? null
      : profile?.avatar_url ?? null;
  const hasProfileChanges = profile ? (
    cleanUsernameDraft !== profile.username ||
    cleanAboutDraft !== profile.about_me ||
    chatColorDraft !== profile.chat_color ||
    chatBorderDraft !== profile.chat_border ||
    selectedTitleRewardId !== (profile.selected_title_reward_id ?? '') ||
    displayedBadgeRewardIds.join('|') !== (profile.displayed_badge_reward_ids ?? []).join('|')
  ) : false;
  const hasPreferenceChanges = profile ? friendRequestsOpen !== profile.friend_requests_open : false;
  const hasAnySaveChanges = hasProfileChanges || hasPreferenceChanges || hasAvatarChanges;
  const previewChatColor = normalizeChatColor(cosmeticsPreviewColor ?? pendingChatColor);
  const previewChatBorder = normalizeChatBorder(cosmeticsPreviewBorder ?? pendingChatBorder);
  const previewBubbleStyle = getChatBubbleStyle(previewChatColor, previewChatBorder);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const hydrateFromCache = useCallback((cachedState: CachedProfileScreenState) => {
    setUserId(cachedState.userId);
    setEmail(cachedState.email);
    setProfile(cachedState.profile);
    setUsernameDraft(cachedState.usernameDraft);
    setAboutDraft(cachedState.aboutDraft);
    setChatColorDraft(cachedState.chatColorDraft);
    setChatBorderDraft(normalizeChatBorder(cachedState.chatBorderDraft));
    setSelectedTitleRewardId(cachedState.profile?.selected_title_reward_id ?? '');
    setDisplayedBadgeRewardIds(cachedState.profile?.displayed_badge_reward_ids ?? []);
    setFriendRequestsOpen(cachedState.friendRequestsOpen);
    setIncomingRequests(cachedState.incomingRequests);
    setBusy(false);
  }, []);

  const refreshFriendDashboard = useCallback(async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return;
    }

    try {
      const response = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const friendData = await response.json();
      if (!response.ok) {
        return;
      }

      const nextIncomingRequests = friendData.incomingRequests ?? [];
      setIncomingRequests(nextIncomingRequests);
      const sessionUserId = data.session.user.id;
      setProfile((current) => {
        const nextProfile = current ? { ...current, friends_count: friendData.friends?.length ?? current.friends_count } : current;
        if (cachedProfileScreenState?.userId === sessionUserId) {
          cachedProfileScreenState = {
            ...cachedProfileScreenState,
            profile: nextProfile,
            incomingRequests: nextIncomingRequests,
          };
        }
        return nextProfile;
      });
      if ((friendData.incomingRequests ?? []).length === 0) {
        setRequestsOpen(false);
      }
    } catch {
      // The profile can still render if the social summary is temporarily unavailable.
    }
  }, []);

  const refreshAchievements = useCallback(async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setAchievements([]);
      setAchievementsLoadAttempted(true);
      return;
    }

    setAchievementsLoading(true);
    setAchievementsLoadAttempted(true);
    try {
      const response = await fetch('/api/achievements', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to load achievements.');
      }
      setAchievements(body.achievements ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load achievements.');
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      setBusy(false);
      return;
    }

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        if (presentation === 'overlay') {
          onClose?.();
        } else {
          router.replace('/login');
        }
        return;
      }

      if (cachedProfileScreenState?.userId === data.user.id) {
        hydrateFromCache(cachedProfileScreenState);
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? '');
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, chat_color, chat_border, selected_title_reward_id, displayed_badge_reward_ids, created_at')
        .eq('id', data.user.id)
        .maybeSingle<Omit<ProfileRecord, 'discord_username' | 'riot_account_name'>>();
      if (profileError && isMissingProfileColumnError(profileError, 'chat_color')) {
        const fallback = await supabase
          .from('profiles')
          .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, created_at')
          .eq('id', data.user.id)
          .maybeSingle<Omit<ProfileRecord, 'discord_username' | 'riot_account_name' | 'chat_color' | 'chat_border'>>();

        profileData = fallback.data ? { ...fallback.data, chat_color: 'amber', chat_border: DEFAULT_CHAT_BORDER, selected_title_reward_id: null, displayed_badge_reward_ids: [] } : null;
        profileError = fallback.error;
      }
      if (profileError && isMissingProfileColumnError(profileError, 'chat_border')) {
        const fallback = await supabase
          .from('profiles')
          .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, chat_color, created_at')
          .eq('id', data.user.id)
          .maybeSingle<Omit<ProfileRecord, 'discord_username' | 'riot_account_name' | 'chat_border'>>();

        profileData = fallback.data ? { ...fallback.data, chat_color: normalizeChatColor(fallback.data.chat_color), chat_border: DEFAULT_CHAT_BORDER, selected_title_reward_id: null, displayed_badge_reward_ids: [] } : null;
        profileError = fallback.error;
      }
      if (profileError && (isMissingProfileColumnError(profileError, 'selected_title_reward_id') || isMissingProfileColumnError(profileError, 'displayed_badge_reward_ids'))) {
        const fallback = await supabase
          .from('profiles')
          .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, chat_color, chat_border, created_at')
          .eq('id', data.user.id)
          .maybeSingle<Omit<ProfileRecord, 'discord_username' | 'riot_account_name' | 'selected_title_reward_id' | 'displayed_badge_reward_ids'>>();

        profileData = fallback.data ? { ...fallback.data, selected_title_reward_id: null, displayed_badge_reward_ids: [] } : null;
        profileError = fallback.error;
      }
      let { data: privateData, error: privateError } = await supabase
        .from('profile_private_details')
        .select('discord_username, discord_avatar_url, discord_banner_url, riot_account_name')
        .eq('user_id', data.user.id)
        .maybeSingle<{
          discord_username: string | null;
          discord_avatar_url: string | null;
          discord_banner_url: string | null;
          riot_account_name: string | null;
        }>();
      if (privateError && isMissingProfileColumnError(privateError, 'discord_banner_url')) {
        const fallback = await supabase
          .from('profile_private_details')
          .select('discord_username, discord_avatar_url, riot_account_name')
          .eq('user_id', data.user.id)
          .maybeSingle<{
            discord_username: string | null;
            discord_avatar_url: string | null;
            riot_account_name: string | null;
          }>();
        privateData = fallback.data ? { ...fallback.data, discord_banner_url: null } : null;
        privateError = fallback.error;
      }
      if (privateError && isMissingProfileColumnError(privateError, 'discord_avatar_url')) {
        const fallback = await supabase
          .from('profile_private_details')
          .select('discord_username, riot_account_name')
          .eq('user_id', data.user.id)
          .maybeSingle<{
            discord_username: string | null;
            riot_account_name: string | null;
          }>();
        privateData = fallback.data ? { ...fallback.data, discord_avatar_url: null, discord_banner_url: null } : null;
      }

      if (profileError) {
        setMessage(profileError.message);
      } else {
        const nextProfile = profileData ? {
          ...profileData,
          chat_color: normalizeChatColor(profileData.chat_color),
          chat_border: normalizeChatBorder(profileData.chat_border),
          discord_username: privateData?.discord_username ?? null,
          discord_avatar_url: privateData?.discord_avatar_url ?? null,
          discord_banner_url: privateData?.discord_banner_url ?? null,
          riot_account_name: privateData?.riot_account_name ?? null,
        } : null;
        setProfile(nextProfile);
        setUsernameDraft(profileData?.username ?? '');
        setAboutDraft(profileData?.about_me ?? '');
        setChatColorDraft(normalizeChatColor(profileData?.chat_color));
        setChatBorderDraft(normalizeChatBorder(profileData?.chat_border));
        setSelectedTitleRewardId(profileData?.selected_title_reward_id ?? '');
        setDisplayedBadgeRewardIds(profileData?.displayed_badge_reward_ids ?? []);
        setFriendRequestsOpen(profileData?.friend_requests_open ?? true);
        cachedProfileScreenState = {
          userId: data.user.id,
          email: data.user.email ?? '',
          profile: nextProfile,
          usernameDraft: profileData?.username ?? '',
          aboutDraft: profileData?.about_me ?? '',
          chatColorDraft: normalizeChatColor(profileData?.chat_color),
          chatBorderDraft: normalizeChatBorder(profileData?.chat_border),
          friendRequestsOpen: profileData?.friend_requests_open ?? true,
          incomingRequests: cachedProfileScreenState?.userId === data.user.id ? cachedProfileScreenState.incomingRequests : [],
        };
      }

      await Promise.all([refreshFriendDashboard(), refreshAchievements()]);

      setBusy(false);
    });
  }, [hydrateFromCache, onClose, presentation, refreshAchievements, refreshFriendDashboard, router]);

  useEffect(() => {
    if (
      profile?.discord_username &&
      achievementsLoadAttempted &&
      !achievementsLoading &&
      achievements.length > 0 &&
      !achievements.some((achievement) => achievement.id === 'discord_linked' && achievement.completedAt)
    ) {
      void submitAchievementEvent('discord_linked').then((result) => {
        if (result) {
          setAchievements(result.achievements);
        }
      });
    }
  }, [achievements, achievementsLoadAttempted, achievementsLoading, profile?.discord_username]);

  useEffect(() => {
    if (activeTab === 'achievements' && !achievementsLoadAttempted && !achievementsLoading) {
      void refreshAchievements();
    }
  }, [activeTab, achievementsLoadAttempted, achievementsLoading, refreshAchievements]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const channel = supabase.channel(`profile-friends:${userId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, (payload) => {
        const row = { ...(payload.old as Record<string, unknown>), ...(payload.new as Record<string, unknown>) };
        if (row.requester_id === userId || row.addressee_id === userId) {
          void refreshFriendDashboard();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload) => {
        const row = { ...(payload.old as Record<string, unknown>), ...(payload.new as Record<string, unknown>) };
        if (row.user_one_id === userId || row.user_two_id === userId) {
          void refreshFriendDashboard();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshFriendDashboard, userId]);

  const replaceAvatarDraft = (blob: Blob, objectUrl: string) => {
    if (avatarDraftUrlRef.current) {
      URL.revokeObjectURL(avatarDraftUrlRef.current);
    }
    avatarDraftUrlRef.current = objectUrl;
    setAvatarDraftBlob(blob);
    setAvatarDraftUrl(objectUrl);
    setAvatarAction('replace');
  };

  const resetAvatarDraft = () => {
    if (avatarDraftUrlRef.current) {
      URL.revokeObjectURL(avatarDraftUrlRef.current);
    }
    avatarDraftUrlRef.current = null;
    setAvatarDraftBlob(null);
    setAvatarDraftUrl(null);
    setAvatarAction('unchanged');
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getOptionalSupabaseClient();
    const cleanUsername = usernameDraft.trim();

    if (!supabase || !userId) {
      return;
    }

    if (!hasAnySaveChanges) {
      setMessage('');
      return;
    }

    if (!USERNAME_PATTERN.test(cleanUsername)) {
      setMessage('Username must be 3-16 characters and use only letters, numbers, or underscores.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { data: usernameMatch, error: usernameMatchError } = await supabase
      .rpc('find_profile_by_username_ci', { search_username: cleanUsername })
      .maybeSingle<{ id: string; username: string }>();
    if (usernameMatchError) {
      setSaving(false);
      setMessage(usernameMatchError.message);
      return;
    }
    if (usernameMatch && usernameMatch.id !== userId) {
      setSaving(false);
      setMessage('This username is already taken.');
      return;
    }

    let nextAvatarUrl = profile?.avatar_url ?? null;
    if (avatarAction === 'replace') {
      if (!avatarDraftBlob) {
        setSaving(false);
        setMessage('Choose a profile picture before saving.');
        return;
      }

      setAvatarUploading(true);
      const path = `${userId}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, avatarDraftBlob, { cacheControl: '3600', contentType: 'image/png', upsert: true });
      setAvatarUploading(false);

      if (uploadError) {
        setSaving(false);
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      nextAvatarUrl = publicUrlData.publicUrl;
    } else if (avatarAction === 'remove') {
      nextAvatarUrl = null;
    }

    const profileUpdate = {
      username: cleanUsername,
      display_name: cleanUsername,
      about_me: aboutDraft.trim().slice(0, 500),
      friend_requests_open: friendRequestsOpen,
      avatar_url: nextAvatarUrl,
      chat_color: normalizeChatColor(chatColorDraft),
      chat_border: normalizeChatBorder(chatBorderDraft),
      selected_title_reward_id: selectedTitleRewardId || null,
      displayed_badge_reward_ids: displayedBadgeRewardIds.slice(0, 8),
      updated_at: new Date().toISOString(),
    };
    let { data, error } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId)
      .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, chat_color, chat_border, selected_title_reward_id, displayed_badge_reward_ids, created_at')
      .single<Omit<ProfileRecord, 'discord_username' | 'riot_account_name'>>();
    if (
      error &&
      (isMissingProfileColumnError(error, 'chat_color') || isMissingProfileColumnError(error, 'chat_border'))
    ) {
      if (
        profileUpdate.chat_color !== normalizeChatColor(profile?.chat_color) ||
        profileUpdate.chat_border !== normalizeChatBorder(profile?.chat_border)
      ) {
        setSaving(false);
        setMessage(PROFILE_COSMETICS_DATABASE_MESSAGE);
        return;
      }

      const { chat_color: _chatColor, chat_border: _chatBorder, ...fallbackUpdate } = profileUpdate;
      const fallback = await supabase
        .from('profiles')
        .update(fallbackUpdate)
        .eq('id', userId)
        .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, created_at')
        .single<Omit<ProfileRecord, 'discord_username' | 'riot_account_name' | 'chat_color' | 'chat_border'>>();

      data = fallback.data ? {
        ...fallback.data,
        chat_color: profile?.chat_color ?? 'amber',
        chat_border: profile?.chat_border ?? DEFAULT_CHAT_BORDER,
      } : null;
      error = fallback.error;
    }
    if (
      error &&
      (isMissingProfileColumnError(error, 'selected_title_reward_id') || isMissingProfileColumnError(error, 'displayed_badge_reward_ids'))
    ) {
      if (
        profileUpdate.selected_title_reward_id !== (profile?.selected_title_reward_id ?? null) ||
        profileUpdate.displayed_badge_reward_ids.join('|') !== (profile?.displayed_badge_reward_ids ?? []).join('|')
      ) {
        setSaving(false);
        setMessage(ACHIEVEMENT_COSMETICS_DATABASE_MESSAGE);
        return;
      }

      const { selected_title_reward_id: _selectedTitle, displayed_badge_reward_ids: _displayedBadges, ...fallbackUpdate } = profileUpdate;
      const fallback = await supabase
        .from('profiles')
        .update(fallbackUpdate)
        .eq('id', userId)
        .select('username, display_name, about_me, friends_count, friend_requests_open, avatar_url, chat_color, chat_border, created_at')
        .single<Omit<ProfileRecord, 'discord_username' | 'riot_account_name' | 'selected_title_reward_id' | 'displayed_badge_reward_ids'>>();

      data = fallback.data ? {
        ...fallback.data,
        selected_title_reward_id: profile?.selected_title_reward_id ?? null,
        displayed_badge_reward_ids: profile?.displayed_badge_reward_ids ?? [],
      } : null;
      error = fallback.error;
    }

    setSaving(false);

    if (error) {
      setMessage(error.message.includes('duplicate') ? 'This username is already taken.' : error.message);
      return;
    }

    if (!data) {
      setMessage('Unable to update profile.');
      return;
    }

    const nextProfile = {
      ...data,
      chat_color: normalizeChatColor(data.chat_color),
      chat_border: normalizeChatBorder(data.chat_border),
      discord_username: profile?.discord_username ?? null,
      discord_avatar_url: profile?.discord_avatar_url ?? null,
      discord_banner_url: profile?.discord_banner_url ?? null,
      riot_account_name: profile?.riot_account_name ?? null,
    };
    setProfile(nextProfile);
    setUsernameDraft(data.username);
    setAboutDraft(data.about_me);
    setChatColorDraft(normalizeChatColor(data.chat_color));
    setChatBorderDraft(normalizeChatBorder(data.chat_border));
    setSelectedTitleRewardId(data.selected_title_reward_id ?? '');
    setDisplayedBadgeRewardIds(data.displayed_badge_reward_ids ?? []);
    setFriendRequestsOpen(data.friend_requests_open);
    resetAvatarDraft();
    cachedProfileScreenState = {
      userId,
      email,
      profile: nextProfile,
      usernameDraft: data.username,
      aboutDraft: data.about_me,
      chatColorDraft: normalizeChatColor(data.chat_color),
      chatBorderDraft: normalizeChatBorder(data.chat_border),
      friendRequestsOpen: data.friend_requests_open,
      incomingRequests,
    };
    setMessage('Profile updated.');
  };

  const closeAvatarCropper = () => {
    if (avatarCropSource) {
      URL.revokeObjectURL(avatarCropSource);
    }
    setAvatarCropSource(null);
    setAvatarCropScale(1);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarCropNaturalSize({ width: 0, height: 0 });
    setAvatarDragStart(null);
  };

  const openAvatarCropper = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage('Profile picture must be an image file.');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setMessage('Profile picture must be 2 MB or smaller.');
      return;
    }

    if (avatarCropSource) {
      URL.revokeObjectURL(avatarCropSource);
    }

    setMessage('');
    setAvatarCropSource(URL.createObjectURL(file));
    setAvatarCropScale(1);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarCropNaturalSize({ width: 0, height: 0 });
  };

  const clearAvatar = () => {
    if (!avatarPreviewUrl) {
      return;
    }

    const confirmed = window.confirm('Remove your profile picture? This change will not be saved until you click Save Profile.');
    if (!confirmed) {
      return;
    }

    if (avatarDraftUrlRef.current) {
      URL.revokeObjectURL(avatarDraftUrlRef.current);
    }
    avatarDraftUrlRef.current = null;
    setAvatarDraftBlob(null);
    setAvatarDraftUrl(null);
    setAvatarAction('remove');
    setMessage('Profile picture will be removed when you save.');
  };

  const saveCroppedAvatar = () => {
    const image = avatarCropImageRef.current;
    if (!image || avatarCropNaturalSize.width <= 0 || avatarCropNaturalSize.height <= 0) {
      setMessage('Unable to read the selected image.');
      return;
    }

    const previewSize = 288;
    const outputSize = 512;
    const coverScale = Math.max(previewSize / avatarCropNaturalSize.width, previewSize / avatarCropNaturalSize.height) * avatarCropScale;
    const displayWidth = avatarCropNaturalSize.width * coverScale;
    const displayHeight = avatarCropNaturalSize.height * coverScale;
    const outputScale = outputSize / previewSize;
    const drawX = (previewSize / 2 + avatarCropOffset.x - displayWidth / 2) * outputScale;
    const drawY = (previewSize / 2 + avatarCropOffset.y - displayHeight / 2) * outputScale;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) {
      setMessage('Unable to prepare the cropped image.');
      return;
    }

    context.fillStyle = '#020617';
    context.fillRect(0, 0, outputSize, outputSize);
    context.drawImage(image, drawX, drawY, displayWidth * outputScale, displayHeight * outputScale);
    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage('Unable to prepare the cropped image.');
        return;
      }

      replaceAvatarDraft(blob, URL.createObjectURL(blob));
      closeAvatarCropper();
      setMessage('Profile picture ready. Save Profile to apply it.');
    }, 'image/png');
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'decline') => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return;
    }

    setMessage('');
    const response = await fetch(`/api/friends/requests/${requestId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? 'Unable to respond to friend request.');
      return;
    }

    setIncomingRequests((requests) => {
      const nextRequests = requests.filter((request) => request.id !== requestId);
      if (cachedProfileScreenState?.userId === userId) {
        cachedProfileScreenState = { ...cachedProfileScreenState, incomingRequests: nextRequests };
      }
      return nextRequests;
    });
    setMessage('');
    if (incomingRequests.length <= 1) {
      setRequestsOpen(false);
    }
  };

  useEffect(() => {
    if (!addFriendOpen || friendSearchQuery.trim().length < 3) {
      setFriendSearchResults([]);
      setFriendSearchContext(null);
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!data.session) {
        return;
      }

      fetch(`/api/friends/search?q=${encodeURIComponent(friendSearchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
        .then((response) => response.json())
        .then((body) => setFriendSearchResults(body.results ?? []))
        .catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [addFriendOpen, friendSearchQuery]);

  useEffect(() => {
    const closeContext = () => setFriendSearchContext(null);
    document.addEventListener('click', closeContext);
    return () => document.removeEventListener('click', closeContext);
  }, []);

  useEffect(() => {
    if (!addFriendOpen) {
      return undefined;
    }

    const closeAddFriendPanel = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-add-friend-toggle="true"]') || addFriendPanelRef.current?.contains(target)) {
        return;
      }

      setAddFriendOpen(false);
      setFriendSearchContext(null);
    };

    document.addEventListener('pointerdown', closeAddFriendPanel);
    return () => document.removeEventListener('pointerdown', closeAddFriendPanel);
  }, [addFriendOpen]);

  useEffect(() => {
    if (!achievementFiltersOpen) {
      return undefined;
    }

    const closeAchievementFilters = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && achievementFiltersRef.current?.contains(target)) {
        return;
      }
      setAchievementFiltersOpen(false);
    };

    document.addEventListener('pointerdown', closeAchievementFilters);
    return () => document.removeEventListener('pointerdown', closeAchievementFilters);
  }, [achievementFiltersOpen]);

  useEffect(() => {
    setCosmeticsPreviewColor(null);
    setCosmeticsPreviewBorder(null);

    if (!cosmeticsMenuOpen && !titleMenuOpen) {
      return undefined;
    }

    const closeCosmeticsMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && cosmeticsMenuRef.current?.contains(target)) {
        return;
      }

      setCosmeticsMenuOpen(false);
      setTitleMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCosmeticsMenuOpen(false);
        setTitleMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeCosmeticsMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeCosmeticsMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [cosmeticsMenuOpen, titleMenuOpen]);

  useEffect(() => {
    if (activeTab !== 'stats') {
      return;
    }

    setPlayerStats([loadPlayerGameStats('skindle')]);
    setDetailedStats(loadDetailedGameStats());
  }, [activeTab]);

  useEffect(() => () => {
    if (avatarCropSource) {
      URL.revokeObjectURL(avatarCropSource);
    }
  }, [avatarCropSource]);

  useEffect(() => () => {
    if (avatarDraftUrlRef.current) {
      URL.revokeObjectURL(avatarDraftUrlRef.current);
    }
  }, []);

  const sendFriendRequest = async (targetUserId: string) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!supabase || !data.session) {
      setMessage('Login required.');
      return;
    }

    const response = await fetch('/api/friends/requests', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUserId }),
    });
    const body = await response.json();
    if (response.ok) {
      setMessage('');
      setFriendSearchResults((results) => results.map((candidate) => (
        candidate.id === targetUserId
          ? { ...candidate, relationship: body.status === 'accepted' ? 'friend' : 'outgoing' }
          : candidate
      )));
      void refreshFriendDashboard();
    } else {
      setMessage(body.error ?? 'Unable to send friend request.');
    }
  };

  const sendPasswordReset = async () => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase || !email) {
      return;
    }

    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setMessage(error ? error.message : 'Password reset email sent.');
  };

  const connectDiscord = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!supabase || !data.session) {
      setMessage('Login required.');
      return;
    }

    setMessage('');
    const response = await fetch('/api/profile/discord/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const body = await response.json();
    if (!response.ok || typeof body.url !== 'string') {
      setMessage(body.error ?? 'Unable to start Discord linking.');
      return;
    }

    window.location.href = body.url;
  };

  const resetAchievements = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!supabase || !data.session) {
      setMessage('Login required.');
      return;
    }

    setMessage('');
    const response = await fetch('/api/achievements', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? 'Unable to reset achievements.');
      return;
    }
    await supabase
      .from('profiles')
      .update({
        selected_title_reward_id: null,
        displayed_badge_reward_ids: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.session.user.id);
    setSelectedTitleRewardId('');
    setDisplayedBadgeRewardIds([]);
    window.localStorage.removeItem(`knowleague:v1:achievement:first-login:${data.session.user.id}`);
    const result = await submitAchievementEvent('first_login');
    if (result) {
      window.localStorage.setItem(`knowleague:v1:achievement:first-login:${data.session.user.id}`, 'synced');
      setAchievements(result.achievements);
    } else {
      setAchievements([]);
      await refreshAchievements();
    }
    setMessage('Achievements reset.');
  };

  const unlinkDiscord = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setMessage('Login required.');
      return;
    }

    setMessage('');
    const response = await fetch('/api/profile/discord/unlink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? 'Unable to unlink Discord.');
      return;
    }

    setProfile((current) => {
      const nextProfile = current ? {
        ...current,
        discord_username: null,
        discord_avatar_url: null,
        discord_banner_url: null,
      } : current;
      if (cachedProfileScreenState?.userId === userId) {
        cachedProfileScreenState = { ...cachedProfileScreenState, profile: nextProfile };
      }
      return nextProfile;
    });
    setMessage('Discord unlinked.');
  };

  const signOut = async () => {
    const supabase = getOptionalSupabaseClient();
    await forfeitStoredMultiplayerSessions();
    await supabase?.auth.signOut();
    router.push('/login');
  };

  const avatarPreviewSize = 288;
  const avatarCoverScale = avatarCropNaturalSize.width > 0 && avatarCropNaturalSize.height > 0
    ? Math.max(avatarPreviewSize / avatarCropNaturalSize.width, avatarPreviewSize / avatarCropNaturalSize.height) * avatarCropScale
    : 1;
  const avatarDisplayWidth = avatarCropNaturalSize.width * avatarCoverScale;
  const avatarDisplayHeight = avatarCropNaturalSize.height * avatarCoverScale;
  const earnedTitleRewards = useMemo(() => getEarnedRewards(achievements, 'title'), [achievements]);
  const earnedBadgeRewards = useMemo(() => getEarnedRewards(achievements, 'badge'), [achievements]);
  const selectedTitleReward = useMemo(() => earnedTitleRewards.find((reward) => reward.id === selectedTitleRewardId) ?? null, [earnedTitleRewards, selectedTitleRewardId]);
  const displayedBadgeRewards = useMemo(() => displayedBadgeRewardIds
    .map((rewardId) => earnedBadgeRewards.find((reward) => reward.id === rewardId))
    .filter((reward): reward is (typeof earnedBadgeRewards)[number] => Boolean(reward)), [displayedBadgeRewardIds, earnedBadgeRewards]);
  const cleanAchievementSearch = achievementSearchQuery.trim().toLowerCase();
  const visibleAchievements = useMemo(() => achievements
    .filter((achievement) => achievementGameFilters.has(achievement.game))
    .filter((achievement) => {
      if (!cleanAchievementSearch) return true;
      return (
        achievement.titleVisible.toLowerCase().includes(cleanAchievementSearch) ||
        achievement.descriptionVisible.toLowerCase().includes(cleanAchievementSearch)
      );
    })
    .sort((left, right) => {
      const direction = achievementSortDirection === 'asc' ? 1 : -1;
      if (achievementSortKey === 'completedAt') {
        if (!left.completedAt && !right.completedAt) return left.titleVisible.localeCompare(right.titleVisible);
        if (!left.completedAt) return 1;
        if (!right.completedAt) return -1;
        const leftTime = new Date(left.completedAt).getTime();
        const rightTime = new Date(right.completedAt).getTime();
        return (leftTime - rightTime) * direction;
      }

      if (left.topPercent === null && right.topPercent === null) return left.titleVisible.localeCompare(right.titleVisible);
      if (left.topPercent === null) return 1;
      if (right.topPercent === null) return -1;
      const leftRank = left.topPercent;
      const rightRank = right.topPercent;
      return (leftRank - rightRank) * direction;
    }), [achievementGameFilters, achievementSortDirection, achievementSortKey, achievements, cleanAchievementSearch]);

  return (
    <main className={presentation === 'overlay' ? 'text-slate-100' : 'min-h-screen bg-slate-950 text-slate-100'}>
      <section className={presentation === 'overlay'
        ? 'mx-auto flex w-full max-w-5xl flex-col px-6 py-8'
        : 'mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10'}
      >
        <header className={`mb-5 flex min-h-12 items-center justify-between gap-3 ${presentation === 'overlay' ? 'pr-16' : ''}`}>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to game hub"
              className={`${presentation === 'overlay' ? 'hidden' : 'inline-flex'} h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900`}
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-white">Profile</h1>
                {selectedTitleReward ? (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                    {selectedTitleReward.name}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {!busy ? (
            <div className="relative flex min-h-11 flex-wrap items-center justify-end gap-2">
              <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-300">
                <Users size={16} className="text-amber-300" />
                {profile?.friends_count ?? 0} friends
              </div>
              {incomingRequests.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRequestsOpen((value) => !value)}
                  className="relative inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20"
                >
                  Requests
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {incomingRequests.length > 99 ? '99+' : incomingRequests.length}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAddFriendOpen((value) => !value)}
                data-add-friend-toggle="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-900"
              >
                <UserPlus size={17} />
                Add Friend
              </button>
              {requestsOpen ? (
                <div className="absolute right-0 top-14 z-30 grid max-h-72 w-80 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3">
                  {incomingRequests.map((request) => (
                    <div key={request.id} className="grid gap-2 rounded-xl bg-slate-900 p-3">
                      <p className="text-sm font-semibold text-white">{request.requester.displayName}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openPublicProfileOverlay(request.requester.username)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 active:scale-[0.98]"
                        >
                          View
                        </button>
                        <button type="button" onClick={() => respondToRequest(request.id, 'accept')} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 active:scale-[0.98]">Accept</button>
                        <button type="button" onClick={() => respondToRequest(request.id, 'decline')} className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20 active:scale-[0.98]">Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {addFriendOpen ? (
                <div ref={addFriendPanelRef} className="absolute right-0 top-14 z-30 w-96 rounded-2xl border border-white/10 bg-slate-950 p-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={friendSearchQuery}
                      onChange={(event) => setFriendSearchQuery(event.target.value)}
                      placeholder="Search users"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 pr-11 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    {friendSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFriendSearchQuery('');
                          setFriendSearchResults([]);
                          setFriendSearchContext(null);
                        }}
                        aria-label="Clear friend search"
                        className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">
                    {friendSearchResults.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          const panelRect = addFriendPanelRef.current?.getBoundingClientRect();
                          setFriendSearchContext({
                            candidate,
                            x: event.clientX - (panelRect?.left ?? 0),
                            y: event.clientY - (panelRect?.top ?? 0),
                          });
                        }}
                        onClick={() => {
                          if (candidate.relationship === 'incoming' || (candidate.friendRequestsOpen && candidate.relationship === 'none')) {
                            void sendFriendRequest(candidate.id);
                          }
                        }}
                        className={`flex min-h-11 items-center justify-between rounded-xl bg-slate-900 px-3 text-left text-sm transition hover:bg-slate-800 ${
                          candidate.relationship === 'friend' || candidate.relationship === 'outgoing' || (candidate.relationship === 'none' && !candidate.friendRequestsOpen) ? 'cursor-default opacity-70' : ''
                        }`}
                      >
                        <span className="font-semibold text-white">{candidate.displayName}</span>
                        <span className="text-xs text-slate-400">
                          {!candidate.friendRequestsOpen && candidate.relationship === 'none'
                            ? 'Requests closed'
                            : candidate.relationship === 'outgoing'
                              ? 'Pending'
                              : candidate.relationship === 'incoming'
                                ? 'Accept'
                                : candidate.relationship === 'friend'
                                  ? 'Friend'
                                  : 'Add'}
                        </span>
                      </button>
                    ))}
                  </div>
                  {friendSearchContext ? (
                    <div
                      className="absolute z-[70] min-w-40 rounded-2xl border border-white/10 bg-slate-950 p-2"
                      style={{ left: friendSearchContext.x, top: friendSearchContext.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          openPublicProfileOverlay(friendSearchContext.candidate.username);
                          setFriendSearchContext(null);
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
                      >
                        View Profile
                      </button>
                      {friendSearchContext.candidate.relationship === 'incoming' || (friendSearchContext.candidate.relationship === 'none' && friendSearchContext.candidate.friendRequestsOpen) ? (
                        <button
                          type="button"
                          onClick={() => {
                            void sendFriendRequest(friendSearchContext.candidate.id);
                            setFriendSearchContext(null);
                          }}
                          className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
                        >
                          {friendSearchContext.candidate.relationship === 'incoming' ? 'Accept Friend' : 'Add Friend'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="min-h-[34rem] rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          {busy ? (
            <div className="flex min-h-[30rem] items-center justify-center gap-3 text-sm font-semibold text-slate-300">
              <Loader2 size={18} className="animate-spin text-amber-300" />
              Loading profile...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1">
                {[
                  ['profile', 'Profile'],
                  ['stats', 'Stats'],
                  ['achievements', 'Achievements'],
                  ['account', 'Account Info'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab as ProfileTab);
                      setMessage('');
                    }}
                    className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
                      activeTab === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>


              {activeTab === 'profile' ? (
                <form onSubmit={saveProfile} className="mt-6 grid gap-4">
                  <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <div className="relative shrink-0">
                      {avatarPreviewUrl ? (
                        <button
                          type="button"
                          onClick={clearAvatar}
                          disabled={avatarUploading || saving}
                          aria-label="Remove profile picture"
                          title="Remove your profile picture when you click Save Profile."
                          className="absolute -right-1 -top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-950 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                      <div
                        className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900 bg-cover bg-center text-3xl font-black text-amber-200"
                        style={avatarPreviewUrl ? { backgroundImage: `url(${avatarPreviewUrl})` } : undefined}
                      >
                        {avatarPreviewUrl ? null : (profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase()}
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading || saving}
                          aria-label="Upload profile picture"
                          className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                        >
                          <Upload size={24} />
                        </button>
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          openAvatarCropper(file);
                        }
                        event.target.value = '';
                      }}
                    />
                    <div className="h-28 w-px shrink-0 bg-white/10" />
                    <div ref={cosmeticsMenuRef} className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Profile Cosmetics</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setPendingChatColor(chatColorDraft);
                              setPendingChatBorder(chatBorderDraft);
                              setCosmeticsMenuOpen((current) => !current);
                            }}
                            className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-slate-800"
                            aria-label="Choose chat cosmetics"
                            aria-expanded={cosmeticsMenuOpen}
                          >
                            Chat Cosmetics
                            <span
                              className="h-5 w-5 rounded-full"
                              style={getChatSwatchStyle(chatColorDraft)}
                            />
                            <span
                              className={`h-5 w-5 rounded-full border ${
                                chatBorderDraft === DEFAULT_CHAT_BORDER ? 'border-slate-950' : 'border-white/20'
                              }`}
                              style={{
                                backgroundColor: '#0f172a',
                                borderColor: getChatBorderSwatchStyle(chatBorderDraft).backgroundColor,
                                borderWidth: '2px',
                              }}
                            />
                          </button>
                          {cosmeticsMenuOpen ? (
                            <div className="absolute left-0 top-11 z-30 grid w-[42rem] grid-cols-[12rem_1px_12rem_minmax(12rem,1fr)] gap-3 rounded-2xl border border-white/10 bg-slate-950 p-3">
                              <div>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Chat color</p>
                                <div className="grid grid-cols-5 gap-2">
                                  {CHAT_COLOR_OPTIONS.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onPointerEnter={() => setCosmeticsPreviewColor(option.value)}
                                      onFocus={() => setCosmeticsPreviewColor(option.value)}
                                      onClick={() => {
                                        setPendingChatColor(option.value);
                                        setCosmeticsPreviewColor(option.value);
                                      }}
                                      aria-label={`Select ${option.value} chat color`}
                                      className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                                        pendingChatColor === option.value ? 'border-white ring-2 ring-amber-300' : 'border-white/20'
                                      }`}
                                      style={getChatSwatchStyle(option.value)}
                                    />
                                  ))}
                                </div>
                              </div>

                              <div className="bg-white/10" />

                              <div>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Chat Border</p>
                                <div className="grid grid-cols-5 gap-2">
                                  {CHAT_BORDER_OPTIONS.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onPointerEnter={() => setCosmeticsPreviewBorder(option.value)}
                                      onFocus={() => setCosmeticsPreviewBorder(option.value)}
                                      onClick={() => {
                                        const nextBorder = pendingChatBorder === option.value ? DEFAULT_CHAT_BORDER : option.value;
                                        setPendingChatBorder(nextBorder);
                                        setCosmeticsPreviewBorder(nextBorder);
                                      }}
                                      aria-label={`Select ${option.value} chat border`}
                                      className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                                        pendingChatBorder === option.value ? 'border-white ring-2 ring-amber-300' : 'border-white/20'
                                      }`}
                                      style={getChatBorderSwatchStyle(option.value)}
                                    />
                                  ))}
                                </div>
                              </div>

                              <div className="grid min-w-0 gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChatColorDraft(pendingChatColor);
                                    setChatBorderDraft(pendingChatBorder);
                                    setCosmeticsMenuOpen(false);
                                  }}
                                  className="min-h-9 rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
                                >
                                  Apply
                                </button>
                                <div className="flex min-w-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900/70 p-3">
                                  <div
                                    className="w-full rounded-xl px-3 py-2 text-center text-sm font-medium"
                                    style={previewBubbleStyle}
                                  >
                                    Sample message
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="relative mt-3 w-fit">
                        <button
                          type="button"
                          onClick={() => setTitleMenuOpen((open) => !open)}
                          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-slate-800"
                          aria-expanded={titleMenuOpen}
                        >
                          Title
                          <span className="max-w-36 truncate font-bold normal-case tracking-normal text-white">{selectedTitleReward?.name ?? 'No title'}</span>
                          <ChevronDown size={14} className={`text-slate-400 transition ${titleMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {titleMenuOpen ? (
                          <div className="absolute left-0 top-11 z-30 grid min-w-52 gap-1 rounded-2xl border border-white/10 bg-slate-950 p-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTitleRewardId('');
                                setTitleMenuOpen(false);
                              }}
                              className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${selectedTitleRewardId ? 'text-slate-300 hover:bg-slate-900' : 'bg-amber-300 text-slate-950'}`}
                            >
                              No title
                            </button>
                            {earnedTitleRewards.map((reward) => (
                              <button
                                key={reward.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTitleRewardId(reward.id);
                                  setTitleMenuOpen(false);
                                }}
                                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${selectedTitleRewardId === reward.id ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'}`}
                              >
                                {reward.name}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="hidden min-h-28 w-px shrink-0 bg-white/10 lg:block" />
                    <div className="min-w-0 lg:w-40">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Badges</p>
                        <button
                          type="button"
                          onClick={() => setBadgeEditorOpen(true)}
                          aria-label="Edit displayed badges"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="grid w-fit grid-cols-4 gap-1.5">
                        {displayedBadgeRewards.slice(0, 8).map((badge) => (
                          <div
                            key={badge.id}
                            className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-300/10 text-amber-100"
                          >
                            <BadgeCheck size={16} />
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200 shadow-xl group-hover:block">
                              {badge.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Username</span>
                      <input
                        ref={usernameInputRef}
                        value={usernameDraft}
                        onChange={(event) => setUsernameDraft(event.target.value.slice(0, 16))}
                        autoComplete="username"
                        maxLength={16}
                        className="min-h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                      />
                      {usernameDraft.length >= 16 ? (
                        <span className="text-xs font-semibold text-amber-200">16/16</span>
                      ) : null}
                    </label>

                    <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Account Created</p>
                      <p className="flex min-h-11 items-center rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-slate-200">
                        {formatProfileDate(profile?.created_at)}
                      </p>
                    </div>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About Me</span>
                    <textarea
                      value={aboutDraft}
                      onChange={(event) => setAboutDraft(event.target.value.slice(0, 500))}
                      rows={6}
                      maxLength={500}
                      placeholder="Tell other players a little about yourself."
                      className="min-h-36 resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                    />
                    <span className="text-xs text-slate-500">{aboutDraft.length}/500</span>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DiscordConnectionCard
                      profile={profile}
                      onConnect={() => void connectDiscord()}
                      onUnlink={() => void unlinkDiscord()}
                    />
                    <RiotConnectionCard value={getLinkedValue(profile?.riot_account_name)} />
                  </div>

                  <button
                    type="submit"
                    disabled={saving || !hasAnySaveChanges}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={17} />
                    {saving ? 'Saving' : 'Save Profile'}
                  </button>
                </form>
              ) : null}

              {activeTab === 'stats' ? (
                <div className="mt-5 grid gap-3">
                  <QuizGameStatsSection title="Ability Blitz" stats={detailedStats.abilityBlitz} />
                  <QuizGameStatsSection title="Skin Champion" stats={detailedStats.skinChampion} />
                  <div className="grid gap-3 xl:grid-cols-2">
                    <SkindleStatsPanel stats={playerStats.find((entry) => entry.gameId === 'skindle') ?? loadPlayerGameStats('skindle')} />
                    <SkincognitoStatsPanel stats={detailedStats.skincognito} />
                  </div>
                </div>
              ) : null}

              {activeTab === 'achievements' ? (
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/80 p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
                    <div className="relative">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={achievementSearchQuery}
                        onChange={(event) => setAchievementSearchQuery(event.target.value)}
                        placeholder="Search achievements"
                        className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 text-sm text-white outline-none placeholder:text-slate-500"
                      />
                    </div>
                    <select
                      value={achievementSortKey}
                      onChange={(event) => setAchievementSortKey(event.target.value as AchievementSortKey)}
                      className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none"
                    >
                      <option value="completedAt">Date completed</option>
                      <option value="globalRanking">Global ranking</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setAchievementSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                    >
                      {achievementSortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    </button>
                    <div ref={achievementFiltersRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setAchievementFiltersOpen((open) => !open)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                      >
                        <Filter size={16} />
                        Filter
                      </button>
                      {achievementFiltersOpen ? (
                        <div className="absolute right-0 top-12 z-30 grid w-52 gap-2 rounded-2xl border border-white/10 bg-slate-950 p-3">
                          {[
                            ['general', 'General App'],
                            ['skindle', 'Skindle'],
                          ].map(([value, label]) => (
                            <label key={value} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-900">
                              <span>{label}</span>
                              <input
                                type="checkbox"
                                checked={achievementGameFilters.has(value)}
                                onChange={(event) => {
                                  setAchievementGameFilters((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) {
                                      next.add(value);
                                    } else {
                                      next.delete(value);
                                    }
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
                  </div>

                  {achievementsLoading ? (
                    <div className="flex min-h-44 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 text-sm font-semibold text-slate-300">
                      <Loader2 size={18} className="animate-spin text-amber-300" />
                      Loading achievements...
                    </div>
                  ) : visibleAchievements.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-center text-sm text-slate-500">
                      No achievements match the current filters.
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {visibleAchievements.map((achievement) => {
                        const complete = Boolean(achievement.completedAt);
                        const progressPercent = Math.min(100, Math.round((achievement.progressCurrent / achievement.progressTarget) * 100));
                        return (
                          <article key={achievement.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-4 rounded-2xl border p-3 ${complete ? 'border-emerald-300/35 bg-emerald-400/10' : 'border-white/10 bg-slate-950/80'}`}>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${complete ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400'}`}>
                                  {complete ? <Trophy size={18} /> : <Award size={18} />}
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
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                                    <span className="uppercase tracking-[0.14em]">{achievement.game === 'general' ? 'General App' : 'Skindle'}</span>
                                    <span>{formatAchievementDate(achievement.completedAt)}</span>
                                    {complete && achievement.topPercent ? <span>Top {achievement.topPercent}%</span> : null}
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">{achievement.descriptionVisible}</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex w-12 shrink-0 self-stretch flex-col items-center justify-between gap-2">
                              <div className="relative min-h-0 w-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`absolute bottom-0 left-0 w-full rounded-full ${complete ? 'bg-emerald-300' : 'bg-amber-300'}`}
                                  style={{ height: `${progressPercent}%` }}
                                />
                              </div>
                              <span className="text-[0.68rem] font-black text-slate-400">{achievement.progressCurrent}/{achievement.progressTarget}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === 'account' ? (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</p>
                      <button
                        type="button"
                        onClick={() => setAccountInfoVisible((value) => !value)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900 hover:text-white"
                        aria-label={accountInfoVisible ? 'Hide account details' : 'Show account details'}
                      >
                        {accountInfoVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-200">{accountInfoVisible ? email : 'Hidden'}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">User ID</p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-200">{accountInfoVisible ? userId : 'Hidden'}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Friend Request Preferences</p>
                    <form onSubmit={saveProfile} className="mt-3 grid gap-3">
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
                        <span className="text-sm font-semibold text-slate-200">
                          {friendRequestsOpen ? 'Open to friend requests' : 'Friend requests closed'}
                        </span>
                        <input
                          type="checkbox"
                          checked={friendRequestsOpen}
                          onChange={(event) => setFriendRequestsOpen(event.target.checked)}
                          className="h-5 w-5 accent-amber-300"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={saving || !hasPreferenceChanges}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? 'Saving' : 'Save Preference'}
                      </button>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Temporary Admin Control</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Reset all achievements for this account. Gate this behind admin permissions when admin users are implemented.
                    </p>
                    <button
                      type="button"
                      onClick={() => void resetAchievements()}
                      className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-slate-950 px-4 text-sm font-bold text-amber-100 transition hover:bg-slate-900"
                    >
                      <RotateCcw size={16} />
                      Reset Achievements
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={sendPasswordReset}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-900"
                    >
                      <KeyRound size={18} />
                      Reset Password
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 text-sm font-bold text-red-100 transition hover:bg-red-500/20"
                    >
                      <LogOut size={18} />
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {message.trim() ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
              {message}
            </p>
          ) : null}
        </section>
      </section>
      {avatarCropSource ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Profile Picture</p>
                <h2 className="mt-1 text-lg font-bold text-white">Crop image</h2>
              </div>
              <button
                type="button"
                onClick={closeAvatarCropper}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                aria-label="Close crop menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex justify-center">
              <div
                className="relative h-72 w-72 touch-none overflow-hidden rounded-full border border-white/10 bg-slate-900"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setAvatarDragStart({
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    x: avatarCropOffset.x,
                    y: avatarCropOffset.y,
                  });
                }}
                onPointerMove={(event) => {
                  if (!avatarDragStart) return;
                  setAvatarCropOffset({
                    x: avatarDragStart.x + event.clientX - avatarDragStart.pointerX,
                    y: avatarDragStart.y + event.clientY - avatarDragStart.pointerY,
                  });
                }}
                onPointerUp={() => setAvatarDragStart(null)}
                onPointerCancel={() => setAvatarDragStart(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={avatarCropImageRef}
                  src={avatarCropSource}
                  alt=""
                  draggable={false}
                  onLoad={(event) => {
                    setAvatarCropNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                  className="absolute max-w-none select-none"
                  style={{
                    width: avatarDisplayWidth || avatarPreviewSize,
                    height: avatarDisplayHeight || avatarPreviewSize,
                    left: avatarPreviewSize / 2 + avatarCropOffset.x - (avatarDisplayWidth || avatarPreviewSize) / 2,
                    top: avatarPreviewSize / 2 + avatarCropOffset.y - (avatarDisplayHeight || avatarPreviewSize) / 2,
                  }}
                />
              </div>
            </div>

            <label className="mt-5 grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={avatarCropScale}
                onChange={(event) => setAvatarCropScale(Number(event.target.value))}
                className="w-full accent-amber-300"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAvatarCropper}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCroppedAvatar}
                disabled={avatarUploading}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {avatarUploading ? 'Saving' : 'Use Picture'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {badgeEditorOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Displayed Badges</p>
                <h2 className="mt-1 text-lg font-bold text-white">Choose up to 8 badges</h2>
              </div>
              <button
                type="button"
                onClick={() => setBadgeEditorOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                aria-label="Close badge picker"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {earnedBadgeRewards.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-500 sm:col-span-2">No badge rewards earned yet.</p>
              ) : earnedBadgeRewards.map((badge) => {
                const selected = displayedBadgeRewardIds.includes(badge.id);
                const disabled = !selected && displayedBadgeRewardIds.length >= 8;
                return (
                  <button
                    key={badge.id}
                    type="button"
                    title={badge.name}
                    aria-label={badge.name}
                    disabled={disabled}
                    onClick={() => {
                      setDisplayedBadgeRewardIds((current) => (
                        current.includes(badge.id)
                          ? current.filter((id) => id !== badge.id)
                          : [...current, badge.id].slice(0, 8)
                      ));
                    }}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? 'border-amber-300/45 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <BadgeCheck size={18} className="shrink-0" />
                    <span className="truncate text-sm font-semibold">{badge.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setBadgeEditorOpen(false)}
              className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
