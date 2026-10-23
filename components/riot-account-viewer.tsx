'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ChevronUp, CircleDot, Coins, Copy, Crown, Eye, FileText, Loader2, Medal, Package, Play, RefreshCw, Search, Share2, Shield, Swords, Trophy, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { AppSelectMenu } from '@/components/app-select-menu';
import { GameIconImage } from '@/components/game-asset-image';
import { getLeagueRankIconUrl, getLeagueRankStyle, type LeagueRankTier } from '@/components/difficulty-style';
import type { RiotAccountViewerResponse, RiotLiveGameStatus, RiotPatchNoteDetail, RiotPatchNoteSearchResult, RiotPatchNoteSummary } from '@/lib/riot-account-viewer';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';

const platformRoutes = ['NA1', 'BR1', 'LA1', 'LA2', 'EUW1', 'EUN1', 'KR', 'JP1', 'OC1', 'TR1', 'RU', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2'] as const;
type ViewerTab = 'overview' | 'mastery' | 'matches' | 'challenges';
type PlatformRoute = (typeof platformRoutes)[number];
type RiotAccountViewerRenderMode = 'interactive' | 'discord-snapshot';
type SharedRiotIdSuggestion = {
  riotId: string;
  platform: PlatformRoute;
  searchCount: number;
};

type PopularAccount = {
  riotId: string;
  platform: PlatformRoute;
  searchCount: number;
  lastSearchedAt: string;
};

const lastSearchStorageKey = 'knowleague:riot-account-viewer:last-search';
const recentSearchesStorageKey = 'knowleague:riot-account-viewer:recent-searches';
const sessionProfileCachePrefix = 'knowleague:riot-account-viewer:profile-cache:';
const riotTokenMappingUpdatedStorageKey = 'knowleague:riot-token-mapping-updated';
const riotTokenMappingUpdatedEvent = 'knowleague:riot-token-mapping-updated';
const searchSessionStorageKey = 'knowleague:riot-account-viewer:search-session-id';
const maxRecentSearches = 5;
const profileClientCacheTtlMs = 30 * 24 * 60 * 60_000;
const globalRankingSampleThreshold = 1000;
const globalRankingTooltip = 'Global ranking is based on our own data from searched accounts and does not reflect the true League of Legends data.';
const showPlaceholderRankings = process.env.NODE_ENV !== 'production';

function notifyRiotTokenMappingUpdated() {
  try {
    window.localStorage.setItem(riotTokenMappingUpdatedStorageKey, String(Date.now()));
  } catch {
    // Cross-tab invalidation is best-effort and should never block the Account Viewer.
  }

  window.dispatchEvent(new Event(riotTokenMappingUpdatedEvent));
}

const platformLabels: Record<PlatformRoute, string> = {
  BR1: 'BR - Brazil',
  EUN1: 'EUNE - Europe Nordic & East',
  EUW1: 'EUW - Europe West',
  JP1: 'JP - Japan',
  KR: 'KR - Korea',
  LA1: 'LAN - Latin America North',
  LA2: 'LAS - Latin America South',
  NA1: 'NA - North America',
  OC1: 'OCE - Oceania',
  TR1: 'TR - Turkey',
  RU: 'RU - Russia',
  PH2: 'PH - Philippines',
  SG2: 'SG - Singapore',
  TH2: 'TH - Thailand',
  TW2: 'TW - Taiwan',
  VN2: 'VN - Vietnam',
};

const tabs: Array<{ id: ViewerTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'overview', label: 'Overview', icon: UserRound },
  { id: 'mastery', label: 'Mastery Viewer', icon: BarChart3 },
  { id: 'matches', label: 'Match History', icon: Swords },
  { id: 'challenges', label: 'Challenges', icon: Trophy },
];

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unavailable';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDateTime(timestamp: number | null | undefined) {
  if (!timestamp) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function formatProfileUpdatedAt(value?: string | null) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatTopPercent(value: number) {
  return `Top ${value}%`;
}

function formatGlobalTopPercent(value: number | null | undefined, sampleSize: number, placeholder: number) {
  if (sampleSize >= globalRankingSampleThreshold && value !== null && value !== undefined) return formatTopPercent(value);
  return showPlaceholderRankings ? formatTopPercent(placeholder) : undefined;
}

function formatRankedDivision(tier: string, rank: string) {
  return tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER'
    ? tier
    : `${tier} ${rank}`;
}

function formatChallengeLevel(level: string | null | undefined) {
  return level?.trim().toUpperCase() || 'UNKNOWN';
}

function challengeLevelStyle(level: string | null | undefined) {
  return getLeagueRankStyle(formatChallengeLevel(level));
}

function ChallengeLevelText({ level }: { level: string | null | undefined }) {
  const label = formatChallengeLevel(level);
  const style = challengeLevelStyle(level);

  return (
    <span>
      Level <span className={`font-black ${style.text}`}>{label}</span>
    </span>
  );
}

function rankTierKey(tier: string): LeagueRankTier {
  const normalized = tier.toLowerCase();
  if (
    normalized === 'iron'
    || normalized === 'bronze'
    || normalized === 'silver'
    || normalized === 'gold'
    || normalized === 'platinum'
    || normalized === 'emerald'
    || normalized === 'diamond'
    || normalized === 'master'
    || normalized === 'grandmaster'
    || normalized === 'challenger'
  ) {
    return normalized;
  }
  return 'iron';
}

function masteryPointsRankTier(championLevel: number): LeagueRankTier | 'rainbow' {
  if (championLevel >= 100) return 'rainbow';
  if (championLevel >= 66) return 'challenger';
  if (championLevel >= 51) return 'grandmaster';
  if (championLevel >= 36) return 'master';
  if (championLevel >= 26) return 'diamond';
  if (championLevel >= 16) return 'platinum';
  if (championLevel >= 11) return 'gold';
  if (championLevel >= 6) return 'silver';
  if (championLevel >= 3) return 'bronze';
  return 'iron';
}

function masteryTextClass(championLevel: number) {
  const tier = masteryPointsRankTier(championLevel);
  if (tier === 'rainbow') {
    return 'animate-rainbow-text bg-gradient-to-r from-rose-300 via-amber-200 via-emerald-300 via-cyan-200 to-rose-300 bg-clip-text text-transparent';
  }
  return getLeagueRankStyle(tier).text;
}

function masteryBarClass(championLevel: number) {
  const tier = masteryPointsRankTier(championLevel);
  if (tier === 'rainbow') {
    return 'border-white/30 bg-white/10';
  }
  const style = getLeagueRankStyle(tier);
  return `${style.border} ${style.bg}`;
}

function masteryBarFillClass(championLevel: number) {
  const tier = masteryPointsRankTier(championLevel);
  if (tier === 'rainbow') {
    return 'rainbow-flow-bg';
  }
  const gradients: Record<LeagueRankTier, string> = {
    iron: 'from-[#7a4f3f] via-[#c9825b] to-[#f0c2a8]',
    bronze: 'from-[#8f4f42] via-[#cd8b73] to-[#ffd1bd]',
    silver: 'from-[#64748b] via-[#c8d6f1] to-white',
    gold: 'from-amber-500 via-amber-300 to-yellow-100',
    platinum: 'from-cyan-600 via-cyan-300 to-cyan-100',
    emerald: 'from-emerald-700 via-emerald-300 to-emerald-100',
    diamond: 'from-blue-700 via-blue-300 to-cyan-100',
    master: 'from-fuchsia-800 via-fuchsia-300 to-pink-100',
    grandmaster: 'from-orange-800 via-orange-300 to-red-100',
    challenger: 'from-cyan-700 via-cyan-200 to-amber-100',
  };
  return `bg-gradient-to-t ${gradients[tier]}`;
}

function statToneClass(value: number, threshold: number) {
  if (value < threshold) return 'text-rose-300';
  if (value === threshold) return 'text-yellow-300';
  return 'text-emerald-300';
}

function getChampionKda(stats: { kills: number; deaths: number; assists: number }) {
  return Math.round(((stats.kills + stats.assists) / Math.max(1, stats.deaths)) * 100) / 100;
}

type AverageRankSummary = {
  label: string;
  tier: LeagueRankTier | null;
};

const rankAbbreviations: Record<string, string> = {
  Iron: 'I',
  Bronze: 'B',
  Silver: 'S',
  Gold: 'G',
  Platinum: 'P',
  Emerald: 'E',
  Diamond: 'D',
  Master: 'M',
  Grandmaster: 'G',
  Challenger: 'C',
};

function rankValue(rank: MatchParticipant['rank'] | null) {
  if (!rank) return null;
  const tier = rank.tier.toUpperCase();
  const tierOffset: Record<string, number> = {
    IRON: 0,
    BRONZE: 4,
    SILVER: 8,
    GOLD: 12,
    PLATINUM: 16,
    EMERALD: 20,
    DIAMOND: 24,
    MASTER: 29,
    GRANDMASTER: 30,
    CHALLENGER: 31,
  };
  if (tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER') return tierOffset[tier] ?? null;
  const divisionValue: Record<string, number> = {
    IV: 1,
    III: 2,
    II: 3,
    I: 4,
  };
  const offset = tierOffset[tier];
  const division = divisionValue[rank.rank.toUpperCase()];
  if (offset === undefined || division === undefined) return null;
  return offset + division;
}

function formatRankValue(value: number): AverageRankSummary {
  const rounded = Math.round(value);
  if (rounded <= 0) return { label: 'Unranked', tier: null };
  const highTierLabels: Record<number, AverageRankSummary> = {
    29: { label: 'Master', tier: 'master' },
    30: { label: 'Grandmaster', tier: 'grandmaster' },
    31: { label: 'Challenger', tier: 'challenger' },
  };
  if (highTierLabels[rounded]) return highTierLabels[rounded];

  const tiers: Array<{ label: string; tier: LeagueRankTier }> = [
    { label: 'Iron', tier: 'iron' },
    { label: 'Bronze', tier: 'bronze' },
    { label: 'Silver', tier: 'silver' },
    { label: 'Gold', tier: 'gold' },
    { label: 'Platinum', tier: 'platinum' },
    { label: 'Emerald', tier: 'emerald' },
    { label: 'Diamond', tier: 'diamond' },
  ];
  const divisions = ['IV', 'III', 'II', 'I'];
  const tierIndex = Math.floor((rounded - 1) / 4);
  const divisionIndex = (rounded - 1) % 4;
  const tier = tiers[tierIndex];
  if (!tier) return { label: 'Unranked', tier: null };
  return { label: `${tier.label} ${divisions[divisionIndex] ?? ''}`.trim(), tier: tier.tier };
}

function averageRankFromValues(values: number[]): AverageRankSummary {
  if (values.length === 0) return { label: 'Unavailable', tier: null };
  return formatRankValue(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getEnemyParticipants(match: RiotAccountViewerResponse['matches'][number]) {
  const searchedPlayer = match.teams
    .flatMap((team) => team.participants)
    .find((participant) => participant.isSearchedPlayer);
  if (!searchedPlayer) return [];

  return match.teams
    .flatMap((team) => team.participants)
    .filter((participant) => participant.teamId !== searchedPlayer.teamId && !participant.isSearchedPlayer);
}

function getAverageEnemyRank(match: RiotAccountViewerResponse['matches'][number]) {
  const enemyRankValues = getEnemyParticipants(match)
    .map((participant) => rankValue(participant.rank))
    .filter((value): value is number => value !== null);
  return averageRankFromValues(enemyRankValues);
}

function getAverageEnemyRankForMatches(matches: RiotAccountViewerResponse['matches']) {
  return averageRankFromValues(
    matches.flatMap((match) => getEnemyParticipants(match)
      .map((participant) => rankValue(participant.rank))
      .filter((value): value is number => value !== null)),
  );
}

function AverageEnemyRankBadge({ averageRank }: { averageRank: AverageRankSummary }) {
  const rankParts = averageRank.label.split(' ');
  const abbreviatedRank = rankParts[0] && rankAbbreviations[rankParts[0]]
    ? [rankAbbreviations[rankParts[0]], ...rankParts.slice(1)].join('')
    : averageRank.label;

  return (
    <span
      className="group relative inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300"
    >
      <span>AER: {abbreviatedRank}</span>
      {averageRank.tier ? <GameIconImage src={getLeagueRankIconUrl(averageRank.tier)} alt="" width={18} height={18} className="h-4 w-4 object-contain" /> : null}
      <LavHoverNote text={`Average Enemy Rank: ${averageRank.label}`} />
    </span>
  );
}

function AverageEnemyRankSummary({ averageRank }: { averageRank: AverageRankSummary }) {
  return (
    <span className="group relative inline-flex items-center gap-1.5 text-sm font-bold text-slate-300">
      <span>Average Enemy Rank: {averageRank.label}</span>
      {averageRank.tier ? <GameIconImage src={getLeagueRankIconUrl(averageRank.tier)} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : null}
      <LavHoverNote text={`Average Enemy Rank: ${averageRank.label}`} />
    </span>
  );
}

function isRemakeMatch(gameDuration: number) {
  return gameDuration > 0 && gameDuration < 240;
}

function formatRole(position: string) {
  const normalized = position.trim().toLowerCase();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function roleIconPath(position: string) {
  const normalized = position.trim().toLowerCase();
  if (!normalized) return null;
  const iconRole = normalized === 'support' ? 'utility' : normalized;
  return `/role-icons/roleicon_${iconRole}.png`;
}

function MatchRole({ position }: { position: string }) {
  const label = formatRole(position);
  const icon = roleIconPath(position);
  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {icon ? <GameIconImage src={icon} alt="" width={16} height={16} className="h-4 w-4 object-contain" /> : null}
    </span>
  );
}

function getTeamStatus(team: MatchTeam, gameDuration: number) {
  if (isRemakeMatch(gameDuration)) return 'Remake';
  return team.win ? 'Victory' : 'Defeat';
}

function rankedLabel(queueType: string) {
  return queueType
    .replace('RANKED_', '')
    .replace('_5x5', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const queueLabels: Record<number, { label: string; map: string }> = {
  400: { label: 'Draft Pick', map: "Summoner's Rift" },
  420: { label: 'Ranked Solo/Duo', map: "Summoner's Rift" },
  430: { label: 'Blind Pick', map: "Summoner's Rift" },
  440: { label: 'Ranked Flex', map: "Summoner's Rift" },
  450: { label: 'ARAM', map: 'Howling Abyss' },
  480: { label: 'Swiftplay', map: "Summoner's Rift" },
  490: { label: 'Quickplay', map: "Summoner's Rift" },
  700: { label: 'Clash', map: "Summoner's Rift" },
  720: { label: 'ARAM Clash', map: 'Howling Abyss' },
  830: { label: 'Intro Bots', map: "Summoner's Rift" },
  840: { label: 'Beginner Bots', map: "Summoner's Rift" },
  850: { label: 'Intermediate Bots', map: "Summoner's Rift" },
  870: { label: 'Intro Bots', map: "Summoner's Rift" },
  880: { label: 'Beginner Bots', map: "Summoner's Rift" },
  890: { label: 'Intermediate Bots', map: "Summoner's Rift" },
  900: { label: 'ARURF', map: "Summoner's Rift" },
  1020: { label: 'One For All', map: "Summoner's Rift" },
  1300: { label: 'Nexus Blitz', map: 'Nexus Blitz' },
  1400: { label: 'Ultimate Spellbook', map: "Summoner's Rift" },
  1700: { label: 'Arena', map: 'Rings of Wrath' },
  1710: { label: 'Arena', map: 'Rings of Wrath' },
  1810: { label: 'Swarm', map: 'Swarm' },
  1820: { label: 'Swarm', map: 'Swarm' },
  1830: { label: 'Swarm', map: 'Swarm' },
  1840: { label: 'Swarm', map: 'Swarm' },
  1900: { label: 'Pick URF', map: "Summoner's Rift" },
  2300: { label: 'Brawl', map: 'The Bandlewood' },
  2400: { label: 'ARAM: Mayhem', map: 'Howling Abyss' },
};

function formatQueueLabel(queueId: number) {
  const queue = queueLabels[queueId];
  return queue ? queue.label : 'Unknown';
}

function formatQueueTitle(queueId: number) {
  const queue = queueLabels[queueId];
  return queue ? `${queue.label} - ${queue.map}` : 'Unknown';
}

function isKnownQueue(queueId: number) {
  return Boolean(queueLabels[queueId]);
}

function isViewerTab(value: string | null): value is ViewerTab {
  return Boolean(value && tabs.some((tab) => tab.id === value));
}

function buildRiotViewerUrl(input: { riotId: string; platform: PlatformRoute; tab?: ViewerTab; matchId?: string | null }) {
  const url = new URL('/riot-account-viewer', window.location.origin);
  url.searchParams.set('riotId', input.riotId);
  url.searchParams.set('platform', input.platform);
  if (input.tab) url.searchParams.set('tab', input.tab);
  if (input.matchId) url.searchParams.set('matchId', input.matchId);
  return url.toString();
}

function buildMasteryMasterUrl(data: RiotAccountViewerResponse) {
  const params = new URLSearchParams({
    riotId: `${data.account.gameName}#${data.account.tagLine}`,
    platform: data.platform,
  });
  return `/mastery-master?${params.toString()}`;
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

async function shareLink(value: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url: value });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }

  await copyTextToClipboard(value);
  return true;
}

function isPlatformRoute(value: string | null): value is PlatformRoute {
  return Boolean(value && platformRoutes.includes(value as PlatformRoute));
}

function looksLikeRiotPuuid(value: string) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(value.trim());
}

function readStoredLastSearch() {
  try {
    const raw = window.localStorage.getItem(lastSearchStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { riotId?: unknown; platform?: unknown };
    if (typeof parsed.riotId !== 'string' || !parsed.riotId.trim()) return null;
    return {
      riotId: parsed.riotId.trim(),
      platform: isPlatformRoute(typeof parsed.platform === 'string' ? parsed.platform.toUpperCase() : null)
        ? typeof parsed.platform === 'string' ? parsed.platform.toUpperCase() as PlatformRoute : 'NA1'
        : 'NA1',
    };
  } catch {
    return null;
  }
}

function readStoredRecentSearches() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentSearchesStorageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().includes('#')).slice(0, maxRecentSearches);
  } catch {
    return [];
  }
}

function writeStoredSearch(riotId: string, platform: PlatformRoute) {
  const normalizedRiotId = riotId.trim();
  if (!normalizedRiotId) return;

  window.localStorage.setItem(lastSearchStorageKey, JSON.stringify({ riotId: normalizedRiotId, platform }));
  const recentSearches = [
    normalizedRiotId,
    ...readStoredRecentSearches().filter((recentRiotId) => recentRiotId.toLowerCase() !== normalizedRiotId.toLowerCase()),
  ].slice(0, maxRecentSearches);
  window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(recentSearches));
}

function readSearchSessionId() {
  try {
    const stored = window.localStorage.getItem(searchSessionStorageKey);
    if (stored && /^[a-zA-Z0-9-]{16,128}$/.test(stored)) return stored;
    const next = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(searchSessionStorageKey, next);
    return next;
  } catch {
    return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function profileCacheKey(riotId: string, platform: PlatformRoute) {
  return `${sessionProfileCachePrefix}${platform}:${riotId.trim().toLowerCase()}`;
}

function hasCachedItemDetails(data: RiotAccountViewerResponse) {
  const items = data.matches.flatMap((match) => match.teams.flatMap((team) => team.participants.flatMap((participant) => participant.items)));
  return items.every((item) => (
    Object.prototype.hasOwnProperty.call(item, 'description')
    && Object.prototype.hasOwnProperty.call(item, 'plaintext')
  ));
}

function readSessionProfileCache(riotId: string, platform: PlatformRoute) {
  try {
    const raw = window.sessionStorage.getItem(profileCacheKey(riotId, platform));
    if (!raw) return null;
    const data = JSON.parse(raw) as RiotAccountViewerResponse;
    if (!data.updatedAt || Date.now() - Date.parse(data.updatedAt) >= profileClientCacheTtlMs) {
      window.sessionStorage.removeItem(profileCacheKey(riotId, platform));
      return null;
    }
    if (!hasCachedItemDetails(data)) {
      window.sessionStorage.removeItem(profileCacheKey(riotId, platform));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function recordCachedProfileSearch(data: RiotAccountViewerResponse) {
  try {
    await fetch('/api/riot-account/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riotId: `${data.account.gameName}#${data.account.tagLine}`,
        platform: data.platform,
        searchSessionId: readSearchSessionId(),
      }),
    });
  } catch {
    // Search analytics are best-effort and must not block profile rendering.
  }
}

async function refreshCachedLiveGame(riotId: string, platform: PlatformRoute, data: RiotAccountViewerResponse) {
  try {
    const response = await fetch(`/api/riot-account/live-game?riotId=${encodeURIComponent(riotId)}&platform=${encodeURIComponent(platform)}`);
    const result = await response.json() as Partial<RiotLiveGameStatus>;
    if (!response.ok || !('currentGame' in result)) return data;
    return { ...data, currentGame: result.currentGame ?? null };
  } catch {
    return data;
  }
}

function writeSessionProfileCache(riotId: string, platform: PlatformRoute, data: RiotAccountViewerResponse) {
  try {
    window.sessionStorage.setItem(profileCacheKey(riotId, platform), JSON.stringify(data));
  } catch {
    // Cache is optional. Browsers can reject sessionStorage in private or restricted contexts.
  }
}

function StatTile({
  label,
  value,
  icon: Icon,
  topPercent,
  topPercentTitle,
  onClick,
}: {
  label: string;
  value: string;
  icon: typeof Trophy;
  topPercent?: string;
  topPercentTitle?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <Icon size={17} className="text-amber-300" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      {topPercent ? (
        <p className="group relative mt-2 w-fit text-xs font-bold uppercase tracking-[0.14em] text-amber-300" tabIndex={0}>
          {topPercent}
          {topPercentTitle ? (
            <LavHoverNote text={topPercentTitle} wide />
          ) : null}
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-full min-h-28 flex-col items-start rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-28 flex-col items-start rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      {content}
    </div>
  );
}

function ChampionIcon({ src, name, size = 'md' }: { src: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dimension = size === 'sm' ? 34 : size === 'lg' ? 56 : 44;
  const className = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl';

  if (!src) {
    return (
      <div className={`${className} flex shrink-0 items-center justify-center border border-white/10 bg-slate-900 text-xs font-black text-amber-300`}>
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return <GameIconImage src={src} alt="" width={dimension} height={dimension} className={`${className} shrink-0 object-cover ring-1 ring-white/10`} />;
}

function RankIcon({ tier }: { tier: string }) {
  const rank = rankTierKey(tier);
  return (
    <GameIconImage
      src={getLeagueRankIconUrl(rank)}
      alt=""
      width={96}
      height={96}
      className="h-20 w-20 shrink-0 object-contain "
    />
  );
}

function MasteryCrest({ championLevel }: { championLevel: number }) {
  const crestLevel = championLevel >= 10 ? '10+' : String(Math.max(1, championLevel));
  const src = `/mastery-crests/120px-Mastery_Level_${crestLevel}_Crest.png`;

  return (
    <div className="animate-mastery-badge-reveal flex h-12 w-14 items-center justify-center">
      <Image
        src={src}
        alt=""
        width={56}
        height={48}
        className="h-12 w-14 object-contain "
      />
    </div>
  );
}

function MasteryLevelPlate({ championLevel }: { championLevel: number }) {
  return (
    <div className="relative mx-auto mt-1 flex min-h-5 w-14 items-center justify-center px-1 text-[0.68rem] font-black text-slate-950">
      <Image src="/mastery-crests/Mastery_Level_Plate.png" alt="" width={56} height={20} className="absolute inset-0 h-full w-full object-fill" />
      <span className="relative z-10">L{championLevel}</span>
    </div>
  );
}

function OverviewTab({
  data,
  onTabChange,
  snapshot = false,
}: {
  data: RiotAccountViewerResponse;
  onTabChange: (tab: ViewerTab) => void;
  snapshot?: boolean;
}) {
  const soloQueue = data.ranked.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
  const flexQueue = data.ranked.find((entry) => entry.queueType === 'RANKED_FLEX_SR');
  const topMasteries = data.masteries.slice(0, 5);
  const championStats = useMemo(() => {
    const stats = new Map<number, { games: number; wins: number; kills: number; deaths: number; assists: number }>();
    data.matches.forEach((match) => {
      const previous = stats.get(match.champion.id) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      previous.games += 1;
      previous.wins += match.win ? 1 : 0;
      previous.kills += match.kills;
      previous.deaths += match.deaths;
      previous.assists += match.assists;
      stats.set(match.champion.id, previous);
    });
    return stats;
  }, [data.matches]);

  return (
    <div className="grid gap-5" data-lav-discord-snapshot={snapshot ? 'overview' : undefined}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Summoner Level" value={formatNumber(data.summoner.summonerLevel)} icon={Shield} />
        <StatTile
          label="Total Mastery"
          value={formatNumber(data.summary.totalMasteryPoints)}
          icon={Medal}
          topPercent={formatGlobalTopPercent(data.analytics.totalMasteryTopPercent, data.analytics.sampleSize, 14.2)}
          topPercentTitle={globalRankingTooltip}
          onClick={snapshot ? undefined : () => onTabChange('mastery')}
        />
        <StatTile
          label="Recent Win Rate"
          value={data.summary.recentWinRate === null ? 'No matches' : `${data.summary.recentWinRate}%`}
          icon={Trophy}
          onClick={snapshot ? undefined : () => onTabChange('matches')}
        />
        <StatTile
          label="Challenge Points"
          value={formatNumber(data.challenges?.totalPoints?.current)}
          icon={Crown}
          topPercent={formatGlobalTopPercent(data.analytics.challengePointsTopPercent, data.analytics.sampleSize, 21.8)}
          topPercentTitle={globalRankingTooltip}
          onClick={snapshot ? undefined : () => onTabChange('challenges')}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Ranked Queues Placement</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[soloQueue, flexQueue].map((entry, index) => (
              <div key={entry?.queueType ?? index} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {entry ? rankedLabel(entry.queueType) : index === 0 ? 'Solo/Duo' : 'Flex'}
                </p>
                {entry ? (
                  <>
                    <div className="mt-3 flex items-center gap-4">
                      <RankIcon tier={entry.tier} />
                      <div>
                        <p className={`text-xl font-bold ${getLeagueRankStyle(rankTierKey(entry.tier)).text}`}>
                          {formatRankedDivision(entry.tier, entry.rank)}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">{entry.leaguePoints} LP - {entry.wins}W {entry.losses}L</p>
                        <p className={`text-sm font-bold ${statToneClass(entry.winRate, 50)}`}>{entry.winRate}% WR</p>
                      </div>
                    </div>
                    {(() => {
                      const placement = data.analytics.rankedPlacements[index === 0 ? 'solo' : 'flex'];
                      const useStoredPlacement = Boolean(placement && placement.sampleSize >= globalRankingSampleThreshold);
                      const regionalRank = useStoredPlacement ? placement?.regionalRank ?? null : showPlaceholderRankings ? index === 0 ? 11391 : 28422 : null;
                      const topPercent = useStoredPlacement ? placement?.topPercent ?? null : showPlaceholderRankings ? index === 0 ? 7.5 : 18.4 : null;
                      if (regionalRank === null || topPercent === null) return null;
                      return (
                        <div className="mt-3">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            KnowLeague Sample Placement
                          </p>
                          <p className="group relative mt-1 w-fit text-sm font-bold text-amber-300" tabIndex={0}>
                            #{formatNumber(regionalRank)} regional - {formatTopPercent(topPercent)}
                            <LavHoverNote text={globalRankingTooltip} wide />
                          </p>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-400">No ranked data returned for this queue.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Signature champions</p>
            {!snapshot ? (
              <a href={buildMasteryMasterUrl(data)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200/50 bg-gradient-to-r from-emerald-300 to-cyan-300 px-3 py-2 text-xs font-black text-slate-950   transition hover:-translate-y-0.5 hover:border-white hover:brightness-110">
                <Play size={14} fill="currentColor" />
                Play Mastery Master
              </a>
            ) : null}
          </div>
          <div className="mt-5 grid gap-3">
            {topMasteries.map((mastery) => {
              const stats = championStats.get(mastery.champion.id);
              const winRate = stats ? Math.round((stats.wins / stats.games) * 1000) / 10 : null;
              const kda = stats ? getChampionKda(stats) : null;
              return (
                <div key={mastery.champion.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                  <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-white">{mastery.champion.name}</p>
                    <p className={`text-sm font-semibold ${masteryTextClass(mastery.championLevel)}`}>
                      Level {mastery.championLevel} - {formatNumber(mastery.championPoints)} points
                    </p>
                    {stats && winRate !== null && kda !== null ? (
                      <p className="mt-1 text-xs font-semibold">
                        <span className={statToneClass(winRate, 50)}>{winRate}% WR</span>
                        <span className="text-slate-500"> - </span>
                        <span className={statToneClass(kda, 1)}>{kda} KDA</span>
                        <span className="text-slate-500"> in {stats.games} recent matches</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No recent matches played for this champion.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function MasteryTab({ data }: { data: RiotAccountViewerResponse }) {
  const [tag, setTag] = useState('All');
  const [championQuery, setChampionQuery] = useState('');
  const [selectedChampionIds, setSelectedChampionIds] = useState<Set<number>>(() => new Set(data.masteries.map((mastery) => mastery.champion.id)));
  const [championDropdownOpen, setChampionDropdownOpen] = useState(false);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleItemCount, setVisibleItemCount] = useState(12);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const championDropdownRef = useRef<HTMLDivElement | null>(null);
  const masteryItemWidth = 72;
  const allChampionIds = useMemo(() => data.masteries.map((mastery) => mastery.champion.id), [data.masteries]);

  const tags = useMemo(() => {
    const next = new Set<string>();
    data.masteries.forEach((mastery) => mastery.champion.tags.forEach((championTag) => next.add(championTag)));
    return ['All', ...Array.from(next).sort()];
  }, [data.masteries]);

  const championStats = useMemo(() => {
    const stats = new Map<number, { games: number; wins: number; kills: number; deaths: number; assists: number }>();
    data.matches.forEach((match) => {
      const previous = stats.get(match.champion.id) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      previous.games += 1;
      previous.wins += match.win ? 1 : 0;
      previous.kills += match.kills;
      previous.deaths += match.deaths;
      previous.assists += match.assists;
      stats.set(match.champion.id, previous);
    });
    return stats;
  }, [data.matches]);

  const masteries = useMemo(() => {
    return [...data.masteries]
      .filter((mastery) => tag === 'All' || mastery.champion.tags.includes(tag))
      .filter((mastery) => selectedChampionIds.has(mastery.champion.id))
      .sort((left, right) => right.championPoints - left.championPoints);
  }, [data.masteries, selectedChampionIds, tag]);

  const championOptions = useMemo(() => {
    const normalizedQuery = championQuery.trim().toLowerCase();
    return data.masteries
      .filter((mastery) => !normalizedQuery || mastery.champion.name.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.champion.name.localeCompare(right.champion.name));
  }, [championQuery, data.masteries]);

  const allSelected = selectedChampionIds.size === allChampionIds.length;

  const masteryRankByChampionId = useMemo(() => {
    return new Map(data.masteries.map((mastery, index) => [mastery.champion.id, index + 1]));
  }, [data.masteries]);

  const visibleMasteries = masteries.slice(visibleStartIndex, visibleStartIndex + visibleItemCount);
  const maxPoints = Math.max(...visibleMasteries.map((mastery) => mastery.championPoints), masteries[visibleStartIndex]?.championPoints ?? 1, 1);
  const markers = [1, 0.75, 0.5, 0.25, 0];

  const updateVisibleWindow = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setVisibleStartIndex(masteries.length > 0
      ? Math.min(masteries.length - 1, Math.max(0, Math.floor(container.scrollLeft / masteryItemWidth)))
      : 0);
    setVisibleItemCount(Math.max(1, Math.ceil(container.clientWidth / masteryItemWidth)));
  }, [masteries.length]);

  useEffect(() => {
    updateVisibleWindow();
    window.addEventListener('resize', updateVisibleWindow);
    return () => window.removeEventListener('resize', updateVisibleWindow);
  }, [updateVisibleWindow]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) container.scrollLeft = 0;
    setVisibleStartIndex(0);
  }, [selectedChampionIds, tag]);

  useEffect(() => {
    if (!championDropdownOpen) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!championDropdownRef.current?.contains(event.target as Node)) {
        setChampionDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [championDropdownOpen]);

  return (
    <section className="overflow-visible rounded-2xl border border-white/10 bg-slate-950/70 p-3 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Top Champion mastery</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div ref={championDropdownRef} className="relative w-full sm:w-72">
              <button
                type="button"
                onClick={() => setChampionDropdownOpen((current) => !current)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 text-left text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus:border-amber-300/60"
              >
                <span className="truncate">{allSelected ? 'All champions' : `${selectedChampionIds.size} champions selected`}</span>
                <ChevronDown size={16} className="shrink-0 text-slate-400" />
              </button>
              {championDropdownOpen ? (
                <div className="absolute left-0 top-full z-[95] mt-2 max-h-[calc(100dvh-5rem)] w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3">
                  <label className="relative block">
                    <span className="sr-only">Search champions</span>
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={championQuery}
                      onChange={(event) => setChampionQuery(event.target.value)}
                      placeholder="Search champions"
                      className="min-h-10 w-full rounded-xl border border-white/10 bg-slate-900 pl-9 pr-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60"
                    />
                  </label>
                  <div className="mt-3 max-h-64 overflow-y-auto pr-1">
                    {championOptions.map((mastery) => (
                      <label key={mastery.champion.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                        <input
                          type="checkbox"
                          checked={selectedChampionIds.has(mastery.champion.id)}
                          onChange={(event) => {
                            setSelectedChampionIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(mastery.champion.id);
                              else next.delete(mastery.champion.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 accent-amber-300"
                        />
                        <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} size="sm" />
                        <span className="truncate">{mastery.champion.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedChampionIds(allSelected ? new Set() : new Set(allChampionIds));
              }}
              className={`min-h-11 rounded-xl border px-4 text-sm font-bold transition ${
                allSelected ? 'border-amber-300/60 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-white/10'
              }`}
            >
              {allSelected ? 'Hide All' : 'Show All'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <a href={buildMasteryMasterUrl(data)} className="inline-flex h-11 shrink-0 self-end items-center justify-center gap-2 rounded-xl border border-emerald-200/50 bg-gradient-to-r from-emerald-300 to-cyan-300 px-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:border-white hover:brightness-110">
            <Play size={15} fill="currentColor" />
            Play Mastery Master
          </a>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Champion Role</span>
            <select value={tag} onChange={(event) => setTag(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              {tags.map((championTag) => <option key={championTag} value={championTag}>{championTag}</option>)}
            </select>
          </label>
        </div>
      </div>

      {masteries.length === 0 ? (
        <div className="mt-6 flex min-h-[24rem] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-900/30 p-8 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300">
              <Search size={20} />
            </div>
            <p className="mt-4 text-lg font-bold text-white">No champions selected</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              Choose champions from the dropdown or use Show All to restore the full mastery chart.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative mt-6 overflow-visible pl-14">
          <div className="pointer-events-none absolute left-0 right-0 top-16 z-20 h-[300px]">
            {markers.map((marker) => (
              <div
                key={marker}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${(1 - marker) * 300}px` }}
              >
                <div className="flex w-12 items-center justify-end gap-2 text-[0.65rem] font-semibold text-slate-500">
                  <span>{formatNumber(Math.round(maxPoints * marker))}</span>
                  <span className="h-px w-2 bg-white/15" />
                </div>
                <span className="ml-2 h-px flex-1 bg-white/10" />
              </div>
            ))}
          </div>

          <div ref={scrollContainerRef} onScroll={updateVisibleWindow} className={`overflow-x-auto overflow-y-visible pb-3 ${THEMED_SCROLLBAR_CLASS}`}>
            <div className="flex w-max items-start gap-2 pr-4">
              {masteries.map((mastery, index) => {
                const stats = championStats.get(mastery.champion.id);
                const winRate = stats ? Math.round((stats.wins / stats.games) * 1000) / 10 : null;
                const kda = stats ? getChampionKda(stats) : null;
                const height = Math.max(28, Math.round((mastery.championPoints / maxPoints) * 300));
                const masteryRank = masteryRankByChampionId.get(mastery.champion.id) ?? index + 1;
                const hoverPositionClass = index <= visibleStartIndex + 1
                  ? 'left-0'
                  : index >= visibleStartIndex + visibleItemCount - 2
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2';
                return (
                  <div key={mastery.champion.id} className="relative flex w-16 shrink-0 flex-col items-center gap-3 hover:z-[140]">
                    <div className="flex h-16 items-end justify-center">
                      <MasteryCrest championLevel={mastery.championLevel} />
                    </div>
                    <div className="flex h-[300px] items-end justify-center">
                      <div
                        className={`animate-mastery-bar-rise group relative z-30 w-10 rounded-t-xl border   hover:z-[140] ${masteryBarClass(mastery.championLevel)}`}
                        style={{ height }}
                        aria-label={`${mastery.champion.name}: ${mastery.championPoints} mastery points`}
                      >
                        <div className={`h-full rounded-t-xl ${masteryBarFillClass(mastery.championLevel)}`} />
                        <div className={`absolute top-4 z-[150] hidden w-52 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-center text-xs text-slate-200  group-hover:block ${hoverPositionClass}`}>
                          <span className="font-bold text-white">{mastery.champion.name}</span>
                          <br />
                          Level {mastery.championLevel} - {formatNumber(mastery.championPoints)} points
                          {stats && winRate !== null && kda !== null ? (
                            <>
                              <br />
                              <span className={statToneClass(winRate, 50)}>{winRate}% WR</span>
                              <span className="text-slate-500"> - </span>
                              <span className={statToneClass(kda, 1)}>{kda} KDA</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} />
                    <div className="min-h-16 text-center">
                      <p className="w-16 truncate text-sm font-bold text-white">{mastery.champion.name}</p>
                      <MasteryLevelPlate championLevel={mastery.championLevel} />
                      <p className="text-[0.68rem] font-bold text-amber-300">#{masteryRank}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DiscordMasterySnapshot({ data }: { data: RiotAccountViewerResponse }) {
  const masteries = useMemo(() => [...data.masteries]
    .sort((left, right) => right.championPoints - left.championPoints)
    .slice(0, 15), [data.masteries]);
  const maxPoints = Math.max(...masteries.map((mastery) => mastery.championPoints), 1);
  const markers = [1, 0.75, 0.5, 0.25, 0];

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-5" data-lav-discord-snapshot="mastery">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Top Champion Mastery</p>
      {masteries.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/30 p-8 text-center text-sm text-slate-400">No champion mastery data was returned for this player.</p>
      ) : (
        <div className="relative mt-6 pl-14">
          <div className="pointer-events-none absolute left-0 right-0 top-16 z-20 h-[300px]">
            {markers.map((marker) => (
              <div
                key={marker}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${(1 - marker) * 300}px` }}
              >
                <div className="flex w-12 items-center justify-end gap-2 text-[0.65rem] font-semibold text-slate-500">
                  <span>{formatNumber(Math.round(maxPoints * marker))}</span>
                  <span className="h-px w-2 bg-white/15" />
                </div>
                <span className="ml-2 h-px flex-1 bg-white/10" />
              </div>
            ))}
          </div>

          <div className="flex min-w-[67rem] items-start gap-2 pr-4">
            {masteries.map((mastery, index) => {
              const height = Math.max(28, Math.round((mastery.championPoints / maxPoints) * 300));
              return (
                <div key={mastery.champion.id} className="relative flex w-16 shrink-0 flex-col items-center gap-3">
                  <div className="flex h-16 items-end justify-center">
                    <MasteryCrest championLevel={mastery.championLevel} />
                  </div>
                  <div className="flex h-[300px] items-end justify-center">
                    <div
                      className={`w-10 rounded-t-xl border ${masteryBarClass(mastery.championLevel)}`}
                      style={{ height }}
                      aria-label={`${mastery.champion.name}: ${mastery.championPoints} mastery points`}
                    >
                      <div className={`h-full rounded-t-xl ${masteryBarFillClass(mastery.championLevel)}`} />
                    </div>
                  </div>
                  <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} />
                  <div className="min-h-16 text-center">
                    <p className="w-16 truncate text-sm font-bold text-white">{mastery.champion.name}</p>
                    <MasteryLevelPlate championLevel={mastery.championLevel} />
                    <p className="text-[0.68rem] font-bold text-amber-300">#{index + 1}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function CurrentGameSection({ data }: { data: RiotAccountViewerResponse }) {
  if (!data.currentGame) return null;
  const knownQueue = isKnownQueue(data.currentGame.queueId);

  return (
    <section className="rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Game in progress</p>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {data.currentGame.playerChampion ? `Currently playing ${data.currentGame.playerChampion.name}` : 'Active game detected'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{formatQueueTitle(data.currentGame.queueId)} - Started {formatDateTime(data.currentGame.gameStartTime)}</p>
        </div>
        {data.currentGame.playerChampion ? <ChampionIcon src={data.currentGame.playerChampion.imageUrl} name={data.currentGame.playerChampion.name} size="lg" /> : null}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {data.currentGame.participants.map((participant, index) => (
          <div key={`${participant.teamId}-${participant.champion.id}-${index}`} className={`flex items-center gap-3 rounded-2xl border p-3 ${participant.isSearchedPlayer ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-950/50'}`}>
            <ChampionIcon src={participant.champion.imageUrl} name={participant.champion.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{participant.champion.name}</p>
              <p className="text-xs text-slate-400">
                {knownQueue && participant.teamId === 100 ? 'Blue Team' : knownQueue && participant.teamId === 200 ? 'Red Team' : `Team ${participant.teamId}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LavHoverNote({ text, wide = false }: { text: string; wide?: boolean }) {
  return (
    <span role="tooltip" className={`pointer-events-none absolute bottom-full left-1/2 z-[240] mb-2 hidden -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-200 group-hover:block group-focus-within:block ${wide ? 'w-64 max-w-[calc(100vw-2rem)]' : 'w-max max-w-[calc(100vw-2rem)]'}`}>
      {text}
    </span>
  );
}

function SmallGameIcon({ src, label, size = 'sm' }: { src: string; label: string; size?: 'xs' | 'sm' }) {
  const className = size === 'xs' ? 'h-5 w-5 rounded' : 'h-6 w-6 rounded-md';
  const pixels = size === 'xs' ? 20 : 24;

  if (!src) {
    return <span className={`group relative inline-flex ${className} border border-white/10 bg-slate-800`} aria-label={label} tabIndex={0}><LavHoverNote text={label} /></span>;
  }

  return <span className={`group relative inline-flex ${className}`} aria-label={label} tabIndex={0}><GameIconImage src={src} alt={label} width={pixels} height={pixels} className={`${className} object-cover ring-1 ring-white/10`} /><LavHoverNote text={label} /></span>;
}

function MatchItemTooltip({ item }: { item: MatchParticipantItem }) {
  const details = item.description || item.plaintext || 'No item description is available.';
  return (
    <span className="group relative inline-flex h-6 w-6 shrink-0 rounded-md outline-none focus-within:z-[220]" tabIndex={0} aria-label={`${item.name}: ${details}`}>
      <GameIconImage src={item.imageUrl} alt={item.name} width={24} height={24} className="h-6 w-6 rounded-md object-cover ring-1 ring-white/10" />
      <LavHoverNote text={`${item.name}: ${details}`} wide />
    </span>
  );
}

function MatchMetricLabel({ icon: Icon, label }: { icon: typeof Swords; label: string }) {
  return (
    <p className="flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-slate-500">
      <Icon size={12} aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

function MatchHeaderMetric({ icon: Icon, label, value }: { icon: typeof Swords; label: string; value: string }) {
  return (
    <div className="group relative">
      <MatchMetricLabel icon={Icon} label={label} />
      <p className="font-bold text-white">{value}</p>
      <LavHoverNote text={label} />
    </div>
  );
}

type MatchTeam = RiotAccountViewerResponse['matches'][number]['teams'][number];
type MatchParticipant = MatchTeam['participants'][number];
type MatchParticipantItem = MatchParticipant['items'][number];

const trinketItemIds = new Set([3340, 3363, 3364, 3330]);
const laneQuestItemIds = new Set([
  3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864,
  3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877,
]);

function arrangeMatchItems(items: MatchParticipantItem[]) {
  const slots: Array<MatchParticipantItem | null> = Array.from({ length: 8 }, () => null);
  const trinket = items.find((item) => item.slot === 6 || trinketItemIds.has(item.id)) ?? null;
  const questItem = items.find((item) => laneQuestItemIds.has(item.id)) ?? null;

  if (questItem) slots[3] = questItem;
  if (trinket) slots[4] = trinket;

  const pinnedItems = new Set([questItem, trinket].filter((item): item is MatchParticipantItem => Boolean(item)));
  const fillOrder = [0, 1, 2, 3, 5, 6, 7, 4];
  const regularItems = items.filter((item) => !pinnedItems.has(item));
  let regularIndex = 0;

  fillOrder.forEach((slotIndex) => {
    if (slots[slotIndex] || regularIndex >= regularItems.length) return;
    slots[slotIndex] = regularItems[regularIndex];
    regularIndex += 1;
  });

  return slots;
}

function TeamObjectiveSummary({ team }: { team: MatchTeam }) {
  const objectives = [
    { label: 'Kills', value: team.kills, icon: Swords },
    { label: 'Gold', value: `${Math.round(team.goldEarned / 100) / 10}k`, icon: Coins },
    { label: 'Damage', value: `${Math.round(team.damageToChampions / 100) / 10}k`, icon: Swords },
    { label: 'CS', value: team.creepScore, icon: CircleDot },
    { label: 'Vision', value: team.visionScore, icon: Eye },
    { label: 'Towers', value: team.objectives.tower, icon: Shield },
    { label: 'Dragons', value: team.objectives.dragon, icon: Crown },
    { label: 'Barons', value: team.objectives.baron, icon: Medal },
    { label: 'Heralds', value: team.objectives.riftHerald, icon: Trophy },
    { label: 'Inhibs', value: team.objectives.inhibitor, icon: Package },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {objectives.map(({ label, value, icon: Icon }) => (
        <span key={label} className="group relative inline-flex items-center gap-1.5 font-bold text-white">
          <Icon size={14} className="text-slate-400" aria-hidden="true" />
          <span>{value}</span>
          <LavHoverNote text={label} />
        </span>
      ))}
    </div>
  );
}

const MatchParticipantRow = memo(function MatchParticipantRow({ participant, maxDamage, gameDuration, platform }: { participant: MatchParticipant; maxDamage: number; gameDuration: number; platform: PlatformRoute }) {
  const damageWidth = maxDamage > 0 ? Math.max(8, Math.round((participant.damageToChampions / maxDamage) * 100)) : 0;
  const adjustedSeconds = Math.max(1, gameDuration - 60);
  const goldPerSecond = Math.round((participant.goldEarned / adjustedSeconds) * 10) / 10;
  const csPerMinute = Math.round((participant.creepScore / (adjustedSeconds / 60)) * 10) / 10;
  const rankTier = participant.rank ? rankTierKey(participant.rank.tier) : null;
  const viewerHref = `/riot-account-viewer?riotId=${encodeURIComponent(participant.riotId)}&platform=${platform}`;
  const arrangedItems = arrangeMatchItems(participant.items);
  const multikills = [
    ['D', 'Double kills', participant.multikills.double, 'iron'],
    ['T', 'Triple kills', participant.multikills.triple, 'gold'],
    ['Q', 'Quadra kills', participant.multikills.quadra, 'master'],
    ['P', 'Penta kills', participant.multikills.penta, 'challenger'],
  ].filter(([ count]) => Number(count) > 0);

  return (
    <div className={`grid grid-cols-2 gap-3 rounded-xl border p-2.5 text-sm sm:grid-cols-3 lg:grid-cols-[minmax(15rem,1.45fr)_0.55fr_0.8fr_0.8fr_0.7fr_0.9fr_7rem_2.75rem] lg:items-center ${
      participant.isSearchedPlayer ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-900/70'
    }`}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-3 lg:col-span-1">
        <div className="group relative shrink-0">
          <ChampionIcon src={participant.champion.imageUrl} name={participant.champion.name} />
          <span className="group absolute -bottom-1 -right-1 min-w-5 rounded-full border border-white/20 bg-black px-1 text-center text-[0.65rem] font-black leading-4 text-white" tabIndex={0}>
            {participant.championLevel}
            <LavHoverNote text="Champion level at game end" />
          </span>
          <LavHoverNote text={participant.champion.name} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {[...participant.summonerSpells.map((spell) => ({ id: `spell-${spell.id}`, src: spell.imageUrl, label: `Summoner spell: ${spell.name}` })),
            ...participant.runes.map((rune) => ({ id: `rune-${rune.id}`, src: rune.imageUrl, label: `Rune: ${rune.name}` }))].map((icon) => (
            <SmallGameIcon key={icon.id} src={icon.src} label={icon.label} size="xs" />
          ))}
        </div>
        <div className="min-w-0">
          <a
            href={viewerHref}
            target="_blank"
            rel="noreferrer"
            className="group relative block truncate font-bold text-white transition hover:text-amber-200"
          >
            {participant.riotId}
            <LavHoverNote text={`Open ${participant.riotId} in League Account Viewer`} />
          </a>
          <div className="mt-1 flex items-center gap-2">
            {participant.rank && rankTier ? (
              <>
                <span className="group relative inline-flex" tabIndex={0} aria-label={`${participant.rank.tier} ${participant.rank.rank}`}>
                  <GameIconImage src={getLeagueRankIconUrl(rankTier)} alt="" width={22} height={22} className="h-5 w-5 object-contain" />
                  <LavHoverNote text={`${participant.rank.tier} ${participant.rank.rank}`} />
                </span>
                <span className={`truncate text-xs font-bold ${getLeagueRankStyle(rankTier).text}`}>
                  {formatRankedDivision(participant.rank.tier, participant.rank.rank)}
                </span>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-500">Unranked</span>
            )}
          </div>
        </div>
      </div>
      <div className="group relative">
        <MatchMetricLabel icon={Swords} label="KDA" />
        <p className="font-bold text-white">{participant.kills}/{participant.deaths}/{participant.assists}</p>
        <LavHoverNote text="Kills / Deaths / Assists" />
      </div>
      <div className="group relative">
        <MatchMetricLabel icon={Coins} label="Gold" />
        <p className="font-bold text-white">{formatNumber(participant.goldEarned)} <span className="text-xs font-semibold text-slate-500">{goldPerSecond}/s</span></p>
        <LavHoverNote text="Gold earned" />
      </div>
      <div className="group relative">
        <MatchMetricLabel icon={CircleDot} label="CS" />
        <p className="font-bold text-white">{formatNumber(participant.creepScore)} <span className="text-xs font-semibold text-slate-500">{csPerMinute}/min</span></p>
        <LavHoverNote text="Creep score: lane minions plus neutral monsters killed" wide />
      </div>
      <div className="group relative">
        <MatchMetricLabel icon={Eye} label="Vision" />
        <p className="font-bold text-white">{participant.visionScore} - {participant.wardsPlaced} - {participant.wardsKilled}</p>
        <LavHoverNote text="Vision score, wards placed, and wards killed" wide />
      </div>
      <div className="group relative">
        <MatchMetricLabel icon={Swords} label="Damage" />
        <div className="relative mt-1 h-5 overflow-hidden rounded-full bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full bg-rose-400" style={{ width: `${damageWidth}%` }} />
          <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">{formatNumber(participant.damageToChampions)}</span>
        </div>
        <LavHoverNote text="Damage dealt to enemy champions" wide />
      </div>
      <div className="col-span-2 sm:col-span-1 lg:col-span-1">
        <div className="grid grid-cols-4 gap-1">
          {arrangedItems.map((item, index) => (
            item
              ? <MatchItemTooltip key={`${participant.puuid}-${item.slot}-${item.id}-${index}`} item={item} />
              : <span key={`${participant.puuid}-empty-item-${index}`} className="group relative inline-flex h-6 w-6 rounded-md border border-white/10 bg-slate-800/70" tabIndex={0}><LavHoverNote text="Empty item slot" /></span>
          ))}
        </div>
      </div>
      <div className="group relative">
        {multikills.length > 0 ? (
          <div className="grid w-10 grid-cols-1 gap-1">
            {multikills.map(([label, title, count, tier]) => (
              <span key={label} className={`group relative whitespace-nowrap rounded-md border px-1 py-0.5 text-center text-[0.56rem] font-black leading-none ${getLeagueRankStyle(String(tier)).selected} ${getLeagueRankStyle(String(tier)).text}`} tabIndex={0}>
                {label} x{count}
                <LavHoverNote text={`${title} in this match`} />
              </span>
            ))}
          </div>
        ) : (
          <span className="block h-1 w-1" aria-hidden="true" />
        )}
        <LavHoverNote text="Double, triple, quadra, and penta kills" />
      </div>
    </div>
  );
});

const MatchTeamSection = memo(function MatchTeamSection({ team, maxDamage, gameDuration, platform }: { team: MatchTeam; maxDamage: number; gameDuration: number; platform: PlatformRoute }) {
  const teamName = team.teamId === 100 ? 'Blue' : team.teamId === 200 ? 'Red' : `Team ${team.teamId}`;
  const status = getTeamStatus(team, gameDuration);
  const sectionClass = status === 'Remake'
    ? 'border-slate-300/20 bg-slate-800/30'
    : team.win
      ? 'border-blue-300/30 bg-blue-950/30'
      : 'border-rose-300/20 bg-rose-950/20';
  const titleClass = status === 'Remake'
    ? 'text-slate-300'
    : team.win
      ? 'text-blue-200'
      : 'text-rose-200';

  return (
    <section className={`rounded-2xl border p-3 ${sectionClass}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className={`text-lg font-black ${titleClass}`}>
          {status} - {teamName} Team
        </p>
        <TeamObjectiveSummary team={team} />
      </div>
      <div className="mt-3 grid gap-2">
        {team.participants.map((participant) => (
          <MatchParticipantRow key={`${participant.puuid}-${participant.teamId}`} participant={participant} maxDamage={maxDamage} gameDuration={gameDuration} platform={platform} />
        ))}
      </div>
    </section>
  );
});

function MatchUnknownQueuePlayers({ participants, maxDamage, gameDuration, platform }: { participants: MatchParticipant[]; maxDamage: number; gameDuration: number; platform: PlatformRoute }) {
  return (
    <section className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      {participants.map((participant) => (
        <MatchParticipantRow key={`${participant.puuid}-${participant.teamId}`} participant={participant} maxDamage={maxDamage} gameDuration={gameDuration} platform={platform} />
      ))}
    </section>
  );
}

function MatchHistoryTab({ data, focusedMatchId, onFocusedMatchConsumed }: { data: RiotAccountViewerResponse; focusedMatchId: string | null; onFocusedMatchConsumed: () => void }) {
  const [resultFilter, setResultFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');
  const [expandedMatchIds, setExpandedMatchIds] = useState<Set<string>>(new Set());
  const [sharedMatchId, setSharedMatchId] = useState<string | null>(null);
  const [pendingScrollMatchId, setPendingScrollMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedMatchId) return;
    setExpandedMatchIds((current) => new Set([...current, focusedMatchId]));
    setPendingScrollMatchId(focusedMatchId);
    onFocusedMatchConsumed();
  }, [focusedMatchId, onFocusedMatchConsumed]);

  useEffect(() => {
    if (!pendingScrollMatchId || !expandedMatchIds.has(pendingScrollMatchId)) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`riot-match-${pendingScrollMatchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollMatchId(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [expandedMatchIds, pendingScrollMatchId]);

  const queues = useMemo(() => ['all', ...Array.from(new Set(data.matches.map((match) => String(match.queueId))))], [data.matches]);
  const matches = useMemo(() => data.matches.filter((match) => {
    const remake = isRemakeMatch(match.gameDuration);
    if (remake && resultFilter !== 'all') return false;
    if (resultFilter === 'wins' && !match.win) return false;
    if (resultFilter === 'losses' && match.win) return false;
    if (queueFilter !== 'all' && String(match.queueId) !== queueFilter) return false;
    return true;
  }), [data.matches, queueFilter, resultFilter]);
  const matchDetailsById = useMemo(() => new Map(data.matches.map((match) => {
    const allParticipants = Array.from(
      new Map(match.teams.flatMap((team) => team.participants).map((participant) => [`${participant.puuid}-${participant.teamId}`, participant])).values(),
    );
    return [match.matchId, {
      allParticipants,
      averageEnemyRank: getAverageEnemyRank(match),
      maxDamage: Math.max(...allParticipants.map((participant) => participant.damageToChampions), 1),
    }] as const;
  })), [data.matches]);
  const pulledAverageEnemyRank = useMemo(() => getAverageEnemyRankForMatches(matches), [matches]);

  return (
    <div className="grid gap-5">
      <CurrentGameSection data={data} />

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Recent matches</p>
            <div className="mt-2">
              <AverageEnemyRankSummary averageRank={pulledAverageEnemyRank} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppSelectMenu
              label="Result"
              hideLabel
              value={resultFilter}
              options={[{ value: 'all', label: 'All results' }, { value: 'wins', label: 'Victory' }, { value: 'losses', label: 'Defeat' }]}
              onChange={setResultFilter}
            />
            <AppSelectMenu
              label="Game mode"
              hideLabel
              value={queueFilter}
              options={queues.map((queueId) => ({ value: queueId, label: queueId === 'all' ? 'All game modes' : formatQueueLabel(Number(queueId)) }))}
              onChange={setQueueFilter}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {matches.map((match) => {
            const expanded = expandedMatchIds.has(match.matchId);
            const matchDetails = matchDetailsById.get(match.matchId);
            const allParticipants = matchDetails?.allParticipants ?? [];
            const maxDamage = matchDetails?.maxDamage ?? 1;
            const knownQueue = isKnownQueue(match.queueId);
            const matchMeta = [formatDateTime(match.gameStartTimestamp ?? match.gameCreation), formatDuration(match.gameDuration)].join(' - ');
            const averageEnemyRank = matchDetails?.averageEnemyRank ?? formatRankValue(0);
            const remake = isRemakeMatch(match.gameDuration);
            const resultCardClass = remake
              ? 'border-slate-400/20 bg-slate-800/50'
              : match.win
                ? 'border-emerald-300/30 bg-emerald-950/20'
                : 'border-rose-300/30 bg-rose-950/20';
            const matchLink = buildRiotViewerUrl({
              riotId: `${data.account.gameName}#${data.account.tagLine}`,
              platform: data.platform,
              tab: 'matches',
              matchId: match.matchId,
            });
            return (
              <article id={`riot-match-${match.matchId}`} key={match.matchId} className={`scroll-mt-24 overflow-visible rounded-2xl border ${resultCardClass}`}>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedMatchIds((current) => {
                      const next = new Set(current);
                      if (next.has(match.matchId)) next.delete(match.matchId);
                      else next.add(match.matchId);
                      return next;
                    });
                  }}
                  className="grid w-full gap-4 p-4 text-left transition hover:bg-white/[0.03] lg:grid-cols-[1fr_auto_auto] lg:items-center"
                  aria-expanded={expanded}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <ChampionIcon src={match.champion.imageUrl} name={match.champion.name} size="lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">{match.champion.name}</p>
                        <span className="group relative rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300" tabIndex={0}>
                          {formatQueueLabel(match.queueId)}
                          <LavHoverNote text={`Queue ${match.queueId}`} />
                        </span>
                        <AverageEnemyRankBadge averageRank={averageEnemyRank} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                        <span>{matchMeta}</span>
                        {knownQueue && match.position ? (
                          <>
                            <span aria-hidden="true">-</span>
                            <MatchRole position={match.position} />
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:min-w-[34rem] lg:grid-cols-5">
                    <MatchHeaderMetric icon={Swords} label="KDA" value={`${match.kills}/${match.deaths}/${match.assists}`} />
                    <MatchHeaderMetric icon={Coins} label="Gold" value={formatNumber(match.goldEarned)} />
                    <MatchHeaderMetric icon={CircleDot} label="CS" value={formatNumber(match.creepScore)} />
                    <MatchHeaderMetric icon={Swords} label="Damage" value={formatNumber(match.damageToChampions)} />
                    <MatchHeaderMetric icon={Eye} label="Vision" value={formatNumber(match.visionScore)} />
                  </div>

                  <div className="flex items-center justify-end gap-2 text-slate-300">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void shareLink(matchLink, `${data.account.gameName} match`).then((shared) => {
                          if (!shared) return;
                          setSharedMatchId(match.matchId);
                          window.setTimeout(() => setSharedMatchId((current) => current === match.matchId ? null : current), 1400);
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        event.stopPropagation();
                        void shareLink(matchLink, `${data.account.gameName} match`).then((shared) => {
                          if (!shared) return;
                          setSharedMatchId(match.matchId);
                          window.setTimeout(() => setSharedMatchId((current) => current === match.matchId ? null : current), 1400);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 transition hover:border-amber-300/50 hover:text-amber-200"
                      aria-label="Share a link to this game"
                    >
                      <Share2 size={14} />
                      {sharedMatchId === match.matchId ? 'Shared' : 'Share'}
                      <LavHoverNote text="Share a link to this game" />
                    </span>
                    {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {expanded ? (
                  <div className="grid gap-4 border-t border-white/10 p-4">
                    {knownQueue ? (
                      match.teams.map((team) => <MatchTeamSection key={team.teamId} team={team} maxDamage={maxDamage} gameDuration={match.gameDuration} platform={data.platform} />)
                    ) : (
                      <MatchUnknownQueuePlayers participants={allParticipants} maxDamage={maxDamage} gameDuration={match.gameDuration} platform={data.platform} />
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
          {matches.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">No matches match the current filters.</p> : null}
        </div>
      </section>
    </div>
  );
}

function DiscordMatchHistorySnapshot({ data }: { data: RiotAccountViewerResponse }) {
  const matches = useMemo(() => [...data.matches]
    .sort((left, right) => (right.gameStartTimestamp ?? right.gameCreation) - (left.gameStartTimestamp ?? left.gameCreation))
    .slice(0, 6), [data.matches]);
  const averageEnemyRank = useMemo(() => getAverageEnemyRankForMatches(matches), [matches]);

  return (
    <div className="grid gap-5" data-lav-discord-snapshot="matches">
      <CurrentGameSection data={data} />

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Recent Matches</p>
          <div className="mt-2">
            <AverageEnemyRankSummary averageRank={averageEnemyRank} />
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {matches.map((match) => {
            const matchAverageEnemyRank = getAverageEnemyRank(match);
            const knownQueue = isKnownQueue(match.queueId);
            const matchMeta = [formatDateTime(match.gameStartTimestamp ?? match.gameCreation), formatDuration(match.gameDuration)].join(' - ');
            const remake = isRemakeMatch(match.gameDuration);
            const resultCardClass = remake
              ? 'border-slate-400/20 bg-slate-800/50'
              : match.win
                ? 'border-emerald-300/30 bg-emerald-950/20'
                : 'border-rose-300/30 bg-rose-950/20';

            return (
              <article key={match.matchId} className={`rounded-2xl border ${resultCardClass}`}>
                <div className="grid gap-4 p-4 text-left lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <ChampionIcon src={match.champion.imageUrl} name={match.champion.name} size="lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-white">{match.champion.name}</p>
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {formatQueueLabel(match.queueId)}
                        </span>
                        <AverageEnemyRankBadge averageRank={matchAverageEnemyRank} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                        <span>{matchMeta}</span>
                        {knownQueue && match.position ? (
                          <>
                            <span aria-hidden="true">-</span>
                            <MatchRole position={match.position} />
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3 text-sm lg:min-w-[34rem]">
                    <MatchHeaderMetric icon={Swords} label="KDA" value={`${match.kills}/${match.deaths}/${match.assists}`} />
                    <MatchHeaderMetric icon={Coins} label="Gold" value={formatNumber(match.goldEarned)} />
                    <MatchHeaderMetric icon={CircleDot} label="CS" value={formatNumber(match.creepScore)} />
                    <MatchHeaderMetric icon={Swords} label="Damage" value={formatNumber(match.damageToChampions)} />
                    <MatchHeaderMetric icon={Eye} label="Vision" value={formatNumber(match.visionScore)} />
                  </div>
                </div>
              </article>
            );
          })}
          {matches.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">No recent matches were returned for this player.</p> : null}
        </div>
      </section>
    </div>
  );
}

function ChallengesTab({ data }: { data: RiotAccountViewerResponse }) {
  if (!data.challenges) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-sm text-slate-400">No challenge data was returned for this player.</p>
      </section>
    );
  }

  const totalPointsStyle = challengeLevelStyle(data.challenges.totalPoints?.level);

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Challenges</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Progress summary</h2>
        <div className={`mt-5 rounded-2xl border p-4 ${totalPointsStyle.selected}`}>
          <p className="text-sm text-slate-400">Total points</p>
          <p className="mt-2 text-3xl font-black text-white">{formatNumber(data.challenges.totalPoints?.current)}</p>
          <p className="mt-1 text-sm text-slate-300"><ChallengeLevelText level={data.challenges.totalPoints?.level} /></p>
        </div>
        <div className="mt-4 grid gap-3">
          {data.challenges.categoryPoints.map((category) => {
            const style = challengeLevelStyle(category.level);
            return (
              <div key={category.category} className={`rounded-2xl border p-4 ${style.selected}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold capitalize text-white">{category.category.toLowerCase()}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${style.border} ${style.bg} ${style.text}`}>
                    {formatChallengeLevel(category.level)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{formatNumber(category.current)} points</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Top challenge values</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Current rankings</h2>
        <div className="mt-5 grid gap-3">
          {data.challenges.topChallenges.map((challenge) => {
            const style = challengeLevelStyle(challenge.level);
            const challengeTitle = challenge.description
              ? `${challenge.name ?? `Challenge #${challenge.challengeId}`}: ${challenge.description}`
              : challenge.name ?? `Challenge #${challenge.challengeId}`;
            return (
              <div
                key={challenge.challengeId}
                className={`group relative grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center ${style.selected} ${challenge.description ? 'cursor-help' : ''}`}
              >
                <div>
                  <p className="font-bold text-white">{challenge.name ?? `Challenge #${challenge.challengeId}`}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    <ChallengeLevelText level={challenge.level} /> <span className="text-slate-500">-</span> Value {formatNumber(challenge.value)}
                  </p>
                </div>
                <p className={`text-sm font-black ${style.text}`}>
                  {challenge.percentile === null ? 'No percentile' : `${Math.round(challenge.percentile * 1000) / 10} percentile`}
                </p>
                <LavHoverNote text={challengeTitle} wide />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const popularityPeriodOptions = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all_time', label: 'All time' },
] as const;

const popularityLimitOptions = [
  { value: 10, label: 'Top 10' },
  { value: 25, label: 'Top 25' },
  { value: 50, label: 'Top 50' },
] as const;

export function PopularAccountsSection() {
  const [period, setPeriod] = useState<(typeof popularityPeriodOptions)[number]['value']>('day');
  const [limit, setLimit] = useState<(typeof popularityLimitOptions)[number]['value']>(10);
  const [accounts, setAccounts] = useState<PopularAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/riot-account/popular?period=${encodeURIComponent(period)}&limit=${limit}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { accounts?: PopularAccount[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Unable to load popular accounts.');
        setAccounts(Array.isArray(result.accounts) ? result.accounts : []);
      })
      .catch((nextError) => {
        if ((nextError as Error).name !== 'AbortError') {
          setAccounts([]);
          setError(nextError instanceof Error ? nextError.message : 'Unable to load popular accounts.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [limit, period]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">League Account Viewer</p>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Most Popular Accounts</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">View the most searched League of Legends accounts on KnowLeague</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[22rem]">
          <AppSelectMenu label="Time period" value={period} options={popularityPeriodOptions.map((option) => ({ ...option }))} onChange={setPeriod} />
          <AppSelectMenu label="Number of accounts" value={limit} options={popularityLimitOptions.map((option) => ({ ...option }))} onChange={setLimit} />
        </div>
      </div>

      {loading ? <p className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Loading popular accounts…</p> : null}
      {error ? <p className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-5 text-sm text-rose-100">{error}</p> : null}
      {!loading && !error && accounts.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-sm text-slate-400">No searches have been recorded for this period yet.</p>
      ) : null}
      {!loading && !error && accounts.length > 0 ? (
        <div className="mt-6 grid gap-2">
          {accounts.map((account, index) => (
            <a
              key={`${account.platform}-${account.riotId}`}
              href={`/riot-account-viewer?riotId=${encodeURIComponent(account.riotId)}&platform=${encodeURIComponent(account.platform)}`}
              className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3 transition hover:border-cyan-300/50 hover:bg-slate-900 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:p-4"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-lg font-black text-cyan-200">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-black text-white">{account.riotId}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{account.platform} · Last searched {formatProfileUpdatedAt(account.lastSearchedAt)}</span>
              </span>
              <span className="text-sm font-black text-amber-200">{formatNumber(account.searchCount)} searches</span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const patchNotesSessionCacheKey = 'knowleague:riot-account-viewer:patch-notes-cache:v2';
const patchNotesClientCacheTtlMs = 6 * 60 * 60_000;
const patchNotesSourceUrl = 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/';

type PatchNotesClientCache = {
  notes: RiotPatchNoteSummary[];
  sourceUrl: string;
  cachedAt: number;
};

function readPatchNotesClientCache(): PatchNotesClientCache | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(patchNotesSessionCacheKey) ?? 'null') as Partial<PatchNotesClientCache> | null;
    if (!parsed || !Array.isArray(parsed.notes) || typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > patchNotesClientCacheTtlMs) return null;
    return {
      notes: parsed.notes as RiotPatchNoteSummary[],
      sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : patchNotesSourceUrl,
      cachedAt: parsed.cachedAt,
    };
  } catch {
    return null;
  }
}

function writePatchNotesClientCache(notes: RiotPatchNoteSummary[], sourceUrl: string) {
  try {
    window.sessionStorage.setItem(patchNotesSessionCacheKey, JSON.stringify({ notes, sourceUrl, cachedAt: Date.now() } satisfies PatchNotesClientCache));
  } catch {
    // Session storage is an optimization; the server cache remains authoritative.
  }
}

function formatPatchNoteDate(value: string) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatPatchNoteHeading(note: RiotPatchNoteSummary) {
  return `League of Legends Patch ${note.patchNumber} Notes - ${formatPatchNoteDate(note.publishedAt)}`;
}

function getPatchNoteDetailHref(note: RiotPatchNoteSummary) {
  return `/riot-account-viewer/patch-notes/${encodeURIComponent(note.slug)}`;
}

export function PatchNotesSection() {
  const [notes, setNotes] = useState<RiotPatchNoteSummary[]>([]);
  const [sourceUrl, setSourceUrl] = useState(patchNotesSourceUrl);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RiotPatchNoteSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = readPatchNotesClientCache();
    if (cached) {
      setNotes(cached.notes);
      setSourceUrl(cached.sourceUrl);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    fetch('/api/riot-account/patch-notes', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { notes?: RiotPatchNoteSummary[]; sourceUrl?: string };
        if (!response.ok) throw new Error('Unable to load patch notes.');
        const nextNotes = Array.isArray(result.notes) ? result.notes : [];
        const nextSourceUrl = result.sourceUrl ?? patchNotesSourceUrl;
        setNotes(nextNotes);
        setSourceUrl(nextSourceUrl);
        writePatchNotesClientCache(nextNotes, nextSourceUrl);
      })
      .catch((nextError) => {
        if ((nextError as Error).name !== 'AbortError') setNotes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      searchControllerRef.current?.abort();
    };
  }, []);

  async function searchPatchNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setSearchError('Search for at least two characters.');
      return;
    }

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/riot-account/patch-notes/search?q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal });
      const result = await response.json() as { results?: RiotPatchNoteSearchResult[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to search patch notes.');
      if (searchControllerRef.current !== controller) return;
      setSearchResults(Array.isArray(result.results) ? result.results : []);
      setSearchedQuery(normalizedQuery);
    } catch (nextError) {
      if ((nextError as Error).name === 'AbortError') return;
      if (searchControllerRef.current !== controller) return;
      setSearchError(nextError instanceof Error ? nextError.message : 'Unable to search patch notes.');
      setSearchResults([]);
      setSearchedQuery(normalizedQuery);
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
        setSearchLoading(false);
      }
    }
  }

  function clearPatchNoteSearch() {
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setQuery('');
    setSearchedQuery('');
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
  }

  const showingSearchResults = searchedQuery.length > 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">League Account Viewer</p>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Official League Patch Notes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Recent official patch-note releases, fetched from Riot’s League of Legends news site.</p>
        </div>
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 px-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10">
          <FileText size={16} />
          View on Riot
        </a>
      </div>

      {loading ? <p className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Fetching the latest releases…</p> : null}
      <form onSubmit={searchPatchNotes} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search patch changes</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by champion, item, rune, system, or game mode" className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/60" />
        </label>
        <button type="submit" disabled={searchLoading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
          <Search size={17} />
          {searchLoading ? 'Searching' : 'Search'}
        </button>
        {showingSearchResults || query ? (
          <button type="button" onClick={clearPatchNoteSearch} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 text-sm font-black text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200">
            <X size={17} />
            Clear search
          </button>
        ) : null}
      </form>

      {searchError ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-4 text-sm font-semibold text-rose-100">{searchError}</p> : null}
      {!loading && notes.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-sm text-slate-400">The official release list is temporarily unavailable. Use the official patch notes link above.</p> : null}
      {!loading && !showingSearchResults && notes.length > 0 ? (
        <div className="mt-6 grid gap-2">
          {notes.map((note) => (
            <Link key={note.href} href={getPatchNoteDetailHref(note)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 font-bold text-white transition hover:border-cyan-300/50 hover:bg-slate-900">
              <span className="min-w-0 truncate">{formatPatchNoteHeading(note)}</span>
              <FileText size={17} className="shrink-0 text-cyan-200" />
            </Link>
          ))}
        </div>
      ) : null}
      {!loading && showingSearchResults && searchResults.length === 0 && !searchError ? <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-sm text-slate-400">No matching changes were found in the recent releases.</p> : null}
      {!loading && showingSearchResults && searchResults.length > 0 ? (
        <div className="mt-6 grid gap-4">
          <p className="text-sm font-semibold text-slate-400">Results for <span className="text-white">{searchedQuery}</span></p>
          {searchResults.map((result) => (
            <div key={result.note.href} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <Link href={getPatchNoteDetailHref(result.note)} className="font-black text-cyan-100 transition hover:text-cyan-200">{formatPatchNoteHeading(result.note)}</Link>
              <div className="mt-4 grid gap-4">
                {result.matches.map((match) => (
                  <div key={match.heading}>
                    <h3 className="text-sm font-black text-amber-200">{match.heading}</h3>
                    <div className="mt-2 grid gap-2">
                      {match.excerpts.map((excerpt, index) => <p key={`${match.heading}-${index}`} className="border-l-2 border-white/10 pl-3 text-sm leading-6 text-slate-300">{excerpt}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function PatchNoteDetailSection({ slug }: { slug: string }) {
  const [detail, setDetail] = useState<RiotPatchNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/riot-account/patch-notes/detail?slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { detail?: RiotPatchNoteDetail; error?: string };
        if (!response.ok || !result.detail) throw new Error(result.error ?? 'Unable to load this patch note.');
        setDetail(result.detail);
      })
      .catch((nextError) => {
        if ((nextError as Error).name !== 'AbortError') setDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/riot-account-viewer/patch-notes" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-bold text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200">
          <ArrowLeft size={16} />
          Back to patch notes
        </Link>
        {detail ? <a href={detail.href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/30 px-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"><FileText size={16} />Official patch notes</a> : null}
      </div>

      {loading ? <p className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Fetching detailed patch changes...</p> : null}
      {!loading && !detail ? <p className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-5 text-sm font-semibold text-rose-100">This patch note could not be loaded. Use the back button to choose another release.</p> : null}
      {detail ? (
        <article className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Patch {detail.patchNumber} · {formatPatchNoteDate(detail.publishedAt)}</p>
          <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">{detail.title}</h1>
          {detail.subtitle ? <p className="mt-3 text-lg font-semibold leading-7 text-slate-300">{detail.subtitle}</p> : null}
          {detail.intro.map((paragraph, index) => <p key={`intro-${index}`} className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{paragraph}</p>)}
          <div className="mt-8 grid gap-5 [content-visibility:auto] [contain-intrinsic-size:1000px]">
            {detail.blocks.map((block, index) => {
              if (block.kind === 'heading') {
                return block.level && block.level <= 2
                  ? <h2 key={`block-${index}`} className="border-b border-white/10 pb-2 pt-3 text-2xl font-black text-white">{block.text}</h2>
                  : <h3 key={`block-${index}`} className="pt-2 text-lg font-black text-cyan-100">{block.text}</h3>;
              }
              if (block.kind === 'list') return <p key={`block-${index}`} className="border-l-2 border-cyan-300/30 pl-4 text-sm leading-7 text-slate-300">{block.text}</p>;
              return <p key={`block-${index}`} className="text-sm leading-7 text-slate-300">{block.text}</p>;
            })}
          </div>
        </article>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300">
        <Search size={28} />
      </div>
      <h2 className="mt-5 text-2xl font-bold text-white">Search a League account</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Check your League account stats by searching your League ID and region above. If you have a KnowLeague account with a saved League account, your data will be automatically populated here.
      </p>
    </section>
  );
}

export function RiotAccountViewer({ renderMode = 'interactive' }: { renderMode?: RiotAccountViewerRenderMode }) {
  const [riotId, setRiotId] = useState('');
  const [platform, setPlatform] = useState<PlatformRoute>('NA1');
  const [activeTab, setActiveTab] = useState<ViewerTab>('overview');
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [data, setData] = useState<RiotAccountViewerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAccountLink, setCopiedAccountLink] = useState(false);
  const [autoLoadMessage, setAutoLoadMessage] = useState<string | null>(null);
  const [riotIdSuggestions, setRiotIdSuggestions] = useState<string[]>([]);
  const [sharedSuggestions, setSharedSuggestions] = useState<SharedRiotIdSuggestion[]>([]);
  const [suggestionsActive, setSuggestionsActive] = useState(false);
  const autoLoadedRef = useRef(false);

  const updateViewerUrl = useCallback((nextData: RiotAccountViewerResponse, nextTab: ViewerTab, nextMatchId: string | null = null) => {
    const nextUrl = buildRiotViewerUrl({
      riotId: `${nextData.account.gameName}#${nextData.account.tagLine}`,
      platform: nextData.platform,
      tab: nextTab,
      matchId: nextMatchId,
    });
    window.history.replaceState(null, '', nextUrl);
  }, []);

  const loadAccount = useCallback(async (nextRiotId = riotId, nextPlatform = platform, options: { tab?: ViewerTab; matchId?: string | null; refresh?: boolean } = {}, lookupPuuid?: string) => {
    const trimmedRiotId = nextRiotId.trim();
    const trimmedPuuid = lookupPuuid?.trim() || (looksLikeRiotPuuid(trimmedRiotId) ? trimmedRiotId : '');
    const searchRiotId = trimmedPuuid ? '' : trimmedRiotId;
    if (!searchRiotId && !trimmedPuuid) {
      setError('Enter a Riot ID in the format GameName#TagLine, or a PUUID.');
      return;
    }

    setLoading(true);
    setError(null);
    setAutoLoadMessage(null);
    try {
      const applyLoadedData = (nextData: RiotAccountViewerResponse) => {
        const nextTab = options.tab ?? 'overview';
        const nextMatchId = options.matchId ?? null;
        const canonicalRiotId = `${nextData.account.gameName}#${nextData.account.tagLine}`;
        setData(nextData);
        notifyRiotTokenMappingUpdated();
        setRiotId(canonicalRiotId);
        writeStoredSearch(canonicalRiotId, nextPlatform);
        setRiotIdSuggestions(readStoredRecentSearches());
        setActiveTab(nextTab);
        setFocusedMatchId(nextMatchId);
        updateViewerUrl(nextData, nextTab, nextMatchId);
      };
      const cachedData = trimmedPuuid || options.refresh ? null : readSessionProfileCache(searchRiotId, nextPlatform);
      if (cachedData) {
        const dataWithLiveGame = await refreshCachedLiveGame(trimmedRiotId, nextPlatform, cachedData);
        await recordCachedProfileSearch(dataWithLiveGame);
        applyLoadedData(dataWithLiveGame);
        return;
      }

      const requestUrl = new URL('/api/riot-account/viewer', window.location.origin);
      if (trimmedPuuid) requestUrl.searchParams.set('puuid', trimmedPuuid);
      else requestUrl.searchParams.set('riotId', searchRiotId);
      requestUrl.searchParams.set('platform', nextPlatform);
      requestUrl.searchParams.set('searchSessionId', readSearchSessionId());
      if (options.refresh) {
        requestUrl.searchParams.set('refresh', 'true');
      }
      const response = await fetch(requestUrl.toString());
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load League account data.');
      }
      const nextData = result as RiotAccountViewerResponse;
      writeSessionProfileCache(trimmedRiotId, nextPlatform, nextData);
      applyLoadedData(nextData);
    } catch (nextError) {
      setData(null);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load League account data.');
    } finally {
      setLoading(false);
    }
  }, [platform, riotId, updateViewerUrl]);

  const handleTabChange = useCallback((nextTab: ViewerTab) => {
    setActiveTab(nextTab);
    setFocusedMatchId(null);
    if (data) updateViewerUrl(data, nextTab);
  }, [data, updateViewerUrl]);

  useEffect(() => {
    const query = riotId.trim();
    if (!suggestionsActive || query.length < 2) {
      setSharedSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch(`/api/riot-account/suggestions?q=${encodeURIComponent(query)}&platform=${encodeURIComponent(platform)}`, {
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : { suggestions: [] })
        .then((result: { suggestions?: SharedRiotIdSuggestion[] }) => {
          setSharedSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
        })
        .catch((nextError) => {
          if ((nextError as Error).name !== 'AbortError') {
            setSharedSuggestions([]);
          }
        });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [platform, riotId, suggestionsActive]);

  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const queryRiotId = params.get('riotId');
    const queryPuuid = params.get('puuid')?.trim() ?? '';
    const queryPlatform = params.get('platform')?.toUpperCase() ?? null;
    const queryTab = params.get('tab');
    const queryMatchId = params.get('matchId');
    const safeQueryTab = isViewerTab(queryTab) ? queryTab : queryMatchId ? 'matches' : 'overview';
    const storedLastSearch = readStoredLastSearch();
    setRiotIdSuggestions(readStoredRecentSearches());
    setActiveTab(safeQueryTab);
    if (queryPuuid) {
      const safePlatform = isPlatformRoute(queryPlatform)
        ? queryPlatform
        : 'NA1';
      setRiotId('');
      setPlatform(safePlatform);
      void loadAccount('', safePlatform, {
        tab: safeQueryTab,
        matchId: queryMatchId,
      }, queryPuuid);
      return;
    }

    if (queryRiotId) {
      const safePlatform = isPlatformRoute(queryPlatform)
        ? queryPlatform
        : 'NA1';
      setRiotId(queryRiotId);
      setPlatform(safePlatform);
      void loadAccount(queryRiotId, safePlatform, {
        tab: safeQueryTab,
        matchId: queryMatchId,
      });
      return;
    }

    if (storedLastSearch) {
      setRiotId(storedLastSearch.riotId);
      setPlatform(storedLastSearch.platform);
    }

    const supabase = getOptionalSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from('profile_private_details')
        .select('riot_account_name')
        .eq('user_id', userId)
        .maybeSingle<{ riot_account_name: string | null }>();

      const savedRiotId = profile?.riot_account_name?.trim();
      if (savedRiotId) {
        setRiotIdSuggestions(Array.from(new Set([savedRiotId, ...readStoredRecentSearches()])));
        setAutoLoadMessage('Loading the League account saved to your KnowLeague profile.');
        setRiotId(savedRiotId);
        void loadAccount(savedRiotId, storedLastSearch?.platform ?? 'NA1');
      }
    });
  }, [loadAccount]);

  const mergedRiotIdSuggestions = useMemo(() => {
    const suggestions = new Map<string, string>();
    [...riotIdSuggestions, ...sharedSuggestions.map((suggestion) => suggestion.riotId)].forEach((suggestion) => {
      suggestions.set(suggestion.toLowerCase(), suggestion);
    });
    return Array.from(suggestions.values()).slice(0, maxRecentSearches + 8);
  }, [riotIdSuggestions, sharedSuggestions]);

  const title = data ? `${data.account.gameName}#${data.account.tagLine}` : 'KnowLeague - League Account Viewer';

  if (renderMode === 'discord-snapshot') {
    return (
      <main className="min-h-[100dvh] bg-slate-950 text-slate-100" data-lav-capture-ready={data ? 'true' : undefined}>
        <section className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:px-10">
          {data ? (
            <>
              <OverviewTab data={data} onTabChange={handleTabChange} snapshot />
              <DiscordMasterySnapshot data={data} />
              <DiscordMatchHistorySnapshot data={data} />
            </>
          ) : error ? (
            <p data-lav-capture-error="true" className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p>
          ) : (
            <EmptyState />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100" data-lav-capture-ready={data ? 'true' : undefined}>
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:px-10">
        <header className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">League Account Viewer</p>
              </div>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">{title}</h1>
            </div>

      {data ? (
              <div className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 lg:w-auto lg:shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                  <GameIconImage src={data.summoner.profileIconUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
                  <div>
                    <p className="font-bold text-white">Level {formatNumber(data.summoner.summonerLevel)}</p>
                    <p className="text-sm text-slate-400">{data.platform} - {data.regionalRoute.toUpperCase()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const accountLink = buildRiotViewerUrl({
                        riotId: `${data.account.gameName}#${data.account.tagLine}`,
                        platform: data.platform,
                        tab: activeTab,
                      });
                      void copyTextToClipboard(accountLink).then(() => {
                        setCopiedAccountLink(true);
                        window.setTimeout(() => setCopiedAccountLink(false), 1400);
                      });
                    }}
                    className="group relative inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"
                    aria-label="Copy link to this account"
                  >
                    <Copy size={14} />
                    {copiedAccountLink ? 'Copied' : 'Copy'}
                    <LavHoverNote text="Copy link to this account" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadAccount();
            }}
            className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto]"
          >
            <label className="block min-w-0">
              <span className="sr-only">Riot ID or PUUID</span>
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={riotId}
                  onChange={(event) => setRiotId(event.target.value)}
                  onFocus={() => setSuggestionsActive(true)}
                  onBlur={() => setSuggestionsActive(false)}
                  list="riot-account-viewer-suggestions"
                  autoComplete="username"
                  placeholder="Riot ID or PUUID"
                  className={`block min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 pl-11 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-1 focus:ring-amber-300/40 ${
                    data ? 'pr-28' : 'pr-4'
                  }`}
                />
                {data ? (
                  <div className="group absolute right-2 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => void loadAccount(riotId, platform, { tab: activeTab, matchId: focusedMatchId, refresh: true })}
                      disabled={loading}
                      aria-label="Refresh this account from the live Riot API"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-300 transition hover:border-amber-300/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                      Update
                    </button>
                    <LavHoverNote text="Refresh this account from the live Riot API" wide />
                  </div>
                ) : null}
              </div>
              <datalist id="riot-account-viewer-suggestions">
                {mergedRiotIdSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
              {loading ? (
                <span role="status" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <Loader2 size={16} className="animate-spin" />
                  Loading League account…
                </span>
              ) : null}
            </label>
            <AppSelectMenu
              label="League platform"
              hideLabel
              className="min-w-0 lg:w-48"
              triggerClassName="min-w-0"
              value={platform}
              options={platformRoutes.map((route) => ({ value: route, label: platformLabels[route] }))}
              onChange={(value) => setPlatform(value as PlatformRoute)}
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              {loading ? 'Loading' : 'Search'}
            </button>
          </form>

          {data ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Profile last updated: <span className="text-slate-300">{formatProfileUpdatedAt(data.updatedAt)}</span>
            </p>
          ) : null}
          {autoLoadMessage ? <p className="mt-3 text-sm text-amber-200">{autoLoadMessage}</p> : null}
          {error ? <p data-lav-capture-error="true" className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
        </header>

        {data ? (
          <>
            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 p-2" aria-label="League account viewer tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                      active ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon size={17} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {activeTab === 'overview' ? <OverviewTab data={data} onTabChange={handleTabChange} /> : null}
            {activeTab === 'mastery' ? <MasteryTab data={data} /> : null}
            {activeTab === 'matches' ? (
              <MatchHistoryTab
                data={data}
                focusedMatchId={focusedMatchId}
                onFocusedMatchConsumed={() => setFocusedMatchId(null)}
              />
            ) : null}
            {activeTab === 'challenges' ? <ChallengesTab data={data} /> : null}
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  );
}
