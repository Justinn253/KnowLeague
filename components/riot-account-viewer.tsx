'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, CircleDot, Coins, Copy, Crown, Eye, Home, Loader2, Medal, Package, Search, Shield, Swords, Trophy, UserRound } from 'lucide-react';
import Image from 'next/image';
import { getLeagueRankIconUrl, getLeagueRankStyle, type LeagueRankTier } from '@/components/difficulty-style';
import type { RiotAccountViewerResponse } from '@/lib/riot-account-viewer';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const platformRoutes = ['NA1', 'BR1', 'LA1', 'LA2', 'EUW1', 'EUN1', 'KR', 'JP1', 'OC1', 'TR1', 'RU', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2'] as const;
type ViewerTab = 'overview' | 'mastery' | 'matches' | 'challenges';
type PlatformRoute = (typeof platformRoutes)[number];
type SharedRiotIdSuggestion = {
  riotId: string;
  platform: PlatformRoute;
  searchCount: number;
};

const lastSearchStorageKey = 'knowleague:riot-account-viewer:last-search';
const recentSearchesStorageKey = 'knowleague:riot-account-viewer:recent-searches';
const sessionProfileCachePrefix = 'knowleague:riot-account-viewer:profile-cache:';
const maxRecentSearches = 5;
const globalRankingSampleThreshold = 1000;
const globalRankingTooltip = 'Global ranking is based on our own data from searched accounts and does not reflect the true League of Legends data.';
const showPlaceholderRankings = process.env.NODE_ENV !== 'production';

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

function getAverageEnemyRank(match: RiotAccountViewerResponse['matches'][number]) {
  const searchedPlayer = match.teams.flatMap((team) => team.participants).find((participant) => participant.isSearchedPlayer);
  if (!searchedPlayer) return { label: 'Unavailable', tier: null };
  const enemyRankValues = match.teams
    .flatMap((team) => team.participants)
    .filter((participant) => participant.teamId !== searchedPlayer.teamId)
    .map((participant) => rankValue(participant.rank))
    .filter((value): value is number => value !== null);
  return averageRankFromValues(enemyRankValues);
}

function getAverageEnemyRankForMatches(matches: RiotAccountViewerResponse['matches']) {
  return averageRankFromValues(
    matches.flatMap((match) => {
      const searchedPlayer = match.teams.flatMap((team) => team.participants).find((participant) => participant.isSearchedPlayer);
      if (!searchedPlayer) return [];
      return match.teams
        .flatMap((team) => team.participants)
        .filter((participant) => participant.teamId !== searchedPlayer.teamId)
        .map((participant) => rankValue(participant.rank))
        .filter((value): value is number => value !== null);
    }),
  );
}

function AverageEnemyRankBadge({ averageRank }: { averageRank: AverageRankSummary }) {
  const rankParts = averageRank.label.split(' ');
  const abbreviatedRank = rankParts[0] && rankAbbreviations[rankParts[0]]
    ? [rankAbbreviations[rankParts[0]], ...rankParts.slice(1)].join('')
    : averageRank.label;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300"
      title={`Average Enemy Rank: ${averageRank.label}`}
    >
      <span>AER: {abbreviatedRank}</span>
      {averageRank.tier ? <Image src={getLeagueRankIconUrl(averageRank.tier)} alt="" width={18} height={18} className="h-4 w-4 object-contain" /> : null}
    </span>
  );
}

function AverageEnemyRankSummary({ averageRank }: { averageRank: AverageRankSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-300" title={`Average Enemy Rank: ${averageRank.label}`}>
      <span>Average Enemy Rank: {averageRank.label}</span>
      {averageRank.tier ? <Image src={getLeagueRankIconUrl(averageRank.tier)} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : null}
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
      {icon ? <Image src={icon} alt="" width={16} height={16} className="h-4 w-4 object-contain" /> : null}
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

function isPlatformRoute(value: string | null): value is PlatformRoute {
  return Boolean(value && platformRoutes.includes(value as PlatformRoute));
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

function profileCacheKey(riotId: string, platform: PlatformRoute) {
  return `${sessionProfileCachePrefix}${platform}:${riotId.trim().toLowerCase()}`;
}

function readSessionProfileCache(riotId: string, platform: PlatformRoute) {
  try {
    const raw = window.sessionStorage.getItem(profileCacheKey(riotId, platform));
    if (!raw) return null;
    return JSON.parse(raw) as RiotAccountViewerResponse;
  } catch {
    return null;
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
        <p className="group relative mt-2 w-fit text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
          {topPercent}
          {topPercentTitle ? (
            <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-[0.7rem] normal-case leading-5 tracking-normal text-slate-200 shadow-xl group-hover:block">
              {topPercentTitle}
            </span>
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

  return <Image src={src} alt="" width={dimension} height={dimension} className={`${className} shrink-0 object-cover ring-1 ring-white/10`} />;
}

function RankIcon({ tier }: { tier: string }) {
  const rank = rankTierKey(tier);
  return (
    <Image
      src={getLeagueRankIconUrl(rank)}
      alt=""
      width={96}
      height={96}
      className="h-20 w-20 shrink-0 object-contain drop-shadow-[0_0_18px_rgba(251,191,36,0.18)]"
    />
  );
}

function MasteryCrest({ championLevel }: { championLevel: number }) {
  const crestLevel = championLevel >= 10 ? '10+' : String(Math.max(1, championLevel));
  const src = `/mastery-crests/120px-Mastery_Level_${crestLevel}_Crest.png`;

  return (
    <div className="animate-mastery-badge-reveal flex h-12 w-14 items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-12 w-14 object-contain drop-shadow-[0_0_14px_rgba(251,191,36,0.2)]"
      />
    </div>
  );
}

function MasteryLevelPlate({ championLevel }: { championLevel: number }) {
  return (
    <div className="relative mx-auto mt-1 flex min-h-5 w-14 items-center justify-center px-1 text-[0.68rem] font-black text-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mastery-crests/Mastery_Level_Plate.png" alt="" className="absolute inset-0 h-full w-full object-fill" />
      <span className="relative z-10">L{championLevel}</span>
    </div>
  );
}

function OverviewTab({ data, onTabChange }: { data: RiotAccountViewerResponse; onTabChange: (tab: ViewerTab) => void }) {
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
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Summoner Level" value={formatNumber(data.summoner.summonerLevel)} icon={Shield} />
        <StatTile
          label="Total Mastery"
          value={formatNumber(data.summary.totalMasteryPoints)}
          icon={Medal}
          topPercent={formatGlobalTopPercent(data.analytics.totalMasteryTopPercent, data.analytics.sampleSize, 14.2)}
          topPercentTitle={globalRankingTooltip}
          onClick={() => onTabChange('mastery')}
        />
        <StatTile
          label="Recent Win Rate"
          value={data.summary.recentWinRate === null ? 'No matches' : `${data.summary.recentWinRate}%`}
          icon={Trophy}
          onClick={() => onTabChange('matches')}
        />
        <StatTile
          label="Challenge Points"
          value={formatNumber(data.challenges?.totalPoints?.current)}
          icon={Crown}
          topPercent={formatGlobalTopPercent(data.analytics.challengePointsTopPercent, data.analytics.sampleSize, 21.8)}
          topPercentTitle={globalRankingTooltip}
          onClick={() => onTabChange('challenges')}
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
                        <p className="group relative mt-3 w-fit text-sm font-bold text-amber-300">
                          #{formatNumber(regionalRank)} regional - {formatTopPercent(topPercent)}
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-[0.7rem] font-semibold leading-5 text-slate-200 shadow-xl group-hover:block">
                            {globalRankingTooltip}
                          </span>
                        </p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Signature champions</p>
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
    <section className="overflow-visible rounded-2xl border border-white/10 bg-slate-950/70 p-5">
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
                <div className="absolute left-0 top-full z-[95] mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-2xl">
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
                      <label key={mastery.champion.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
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
        <div className="flex justify-end">
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

          <div ref={scrollContainerRef} onScroll={updateVisibleWindow} className="overflow-x-auto overflow-y-visible pb-3">
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
                        className={`animate-mastery-bar-rise group relative z-30 w-10 rounded-t-xl border shadow-lg shadow-amber-950/30 hover:z-[140] ${masteryBarClass(mastery.championLevel)}`}
                        style={{ height }}
                        aria-label={`${mastery.champion.name}: ${mastery.championPoints} mastery points`}
                      >
                        <div className={`h-full rounded-t-xl ${masteryBarFillClass(mastery.championLevel)}`} />
                        <div className={`absolute top-4 z-[150] hidden w-52 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-center text-xs text-slate-200 shadow-xl group-hover:block ${hoverPositionClass}`}>
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

function SmallGameIcon({ src, label, size = 'sm' }: { src: string; label: string; size?: 'xs' | 'sm' }) {
  const className = size === 'xs' ? 'h-5 w-5 rounded' : 'h-6 w-6 rounded-md';
  const pixels = size === 'xs' ? 20 : 24;

  if (!src) {
    return <span className={`${className} border border-white/10 bg-slate-800`} aria-label={label} title={label} />;
  }

  return <Image src={src} alt={label} title={label} width={pixels} height={pixels} className={`${className} object-cover ring-1 ring-white/10`} />;
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
    <div title={label}>
      <MatchMetricLabel icon={Icon} label={label} />
      <p className="font-bold text-white">{value}</p>
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
        <span key={label} className="inline-flex items-center gap-1.5 font-bold text-white" title={label}>
          <Icon size={14} className="text-slate-400" aria-hidden="true" />
          <span>{value}</span>
        </span>
      ))}
    </div>
  );
}

function MatchParticipantRow({ participant, maxDamage, gameDuration, platform }: { participant: MatchParticipant; maxDamage: number; gameDuration: number; platform: PlatformRoute }) {
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
  ].filter(([, , count]) => Number(count) > 0);

  return (
    <div className={`grid gap-3 rounded-xl border p-2.5 text-sm lg:grid-cols-[minmax(15rem,1.45fr)_0.55fr_0.8fr_0.8fr_0.7fr_0.9fr_7rem_2.75rem] lg:items-center ${
      participant.isSearchedPlayer ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-900/70'
    }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative shrink-0" title={participant.champion.name}>
          <ChampionIcon src={participant.champion.imageUrl} name={participant.champion.name} />
          <span className="absolute -bottom-1 -right-1 min-w-5 rounded-full border border-white/20 bg-black px-1 text-center text-[0.65rem] font-black leading-4 text-white" title="Champion level at game end">
            {participant.championLevel}
          </span>
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
            className="block truncate font-bold text-white transition hover:text-amber-200"
            title={`Open ${participant.riotId} in League Account Viewer`}
          >
            {participant.riotId}
          </a>
          <div className="mt-1 flex items-center gap-2">
            {participant.rank && rankTier ? (
              <>
                <Image src={getLeagueRankIconUrl(rankTier)} alt="" title={`${participant.rank.tier} ${participant.rank.rank}`} width={22} height={22} className="h-5 w-5 object-contain" />
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
      <div title="Kills / Deaths / Assists">
        <MatchMetricLabel icon={Swords} label="KDA" />
        <p className="font-bold text-white">{participant.kills}/{participant.deaths}/{participant.assists}</p>
      </div>
      <div title="Gold earned">
        <MatchMetricLabel icon={Coins} label="Gold" />
        <p className="font-bold text-white">{formatNumber(participant.goldEarned)} <span className="text-xs font-semibold text-slate-500">{goldPerSecond}/s</span></p>
      </div>
      <div title="Creep score: lane minions plus neutral monsters killed">
        <MatchMetricLabel icon={CircleDot} label="CS" />
        <p className="font-bold text-white">{formatNumber(participant.creepScore)} <span className="text-xs font-semibold text-slate-500">{csPerMinute}/min</span></p>
      </div>
      <div title="Vision score, wards placed, and wards killed">
        <MatchMetricLabel icon={Eye} label="Vision" />
        <p className="font-bold text-white">{participant.visionScore} - {participant.wardsPlaced} - {participant.wardsKilled}</p>
      </div>
      <div title="Damage dealt to enemy champions">
        <MatchMetricLabel icon={Swords} label="Damage" />
        <div className="relative mt-1 h-5 overflow-hidden rounded-full bg-slate-800">
          <div className="absolute inset-y-0 left-0 rounded-full bg-rose-400" style={{ width: `${damageWidth}%` }} />
          <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">{formatNumber(participant.damageToChampions)}</span>
        </div>
      </div>
      <div>
        <div className="grid grid-cols-4 gap-1">
          {arrangedItems.map((item, index) => (
            item
              ? <SmallGameIcon key={`${participant.puuid}-${item.slot}-${item.id}-${index}`} src={item.imageUrl} label={item.name} />
              : <span key={`${participant.puuid}-empty-item-${index}`} title="Empty item slot" className="h-6 w-6 rounded-md border border-white/10 bg-slate-800/70" />
          ))}
        </div>
      </div>
      <div title="Double, triple, quadra, and penta kills">
        {multikills.length > 0 ? (
          <div className="grid w-10 grid-cols-1 gap-1">
            {multikills.map(([label, title, count, tier]) => (
              <span key={label} className={`whitespace-nowrap rounded-md border px-1 py-0.5 text-center text-[0.56rem] font-black leading-none ${getLeagueRankStyle(String(tier)).selected} ${getLeagueRankStyle(String(tier)).text}`} title={`${title} in this match`}>
                {label} x{count}
              </span>
            ))}
          </div>
        ) : (
          <span className="block h-1 w-1" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function MatchTeamSection({ team, maxDamage, gameDuration, platform }: { team: MatchTeam; maxDamage: number; gameDuration: number; platform: PlatformRoute }) {
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
}

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
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedMatchId) return;
    setExpandedMatchIds((current) => new Set([...current, focusedMatchId]));
    onFocusedMatchConsumed();
  }, [focusedMatchId, onFocusedMatchConsumed]);

  const queues = useMemo(() => ['all', ...Array.from(new Set(data.matches.map((match) => String(match.queueId))))], [data.matches]);
  const matches = data.matches.filter((match) => {
    const remake = isRemakeMatch(match.gameDuration);
    if (remake && resultFilter !== 'all') return false;
    if (resultFilter === 'wins' && !match.win) return false;
    if (resultFilter === 'losses' && match.win) return false;
    if (queueFilter !== 'all' && String(match.queueId) !== queueFilter) return false;
    return true;
  });
  const pulledAverageEnemyRank = getAverageEnemyRankForMatches(matches);

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
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              <option value="all">All results</option>
              <option value="wins">Victory</option>
              <option value="losses">Defeat</option>
            </select>
            <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              {queues.map((queueId) => <option key={queueId} value={queueId}>{queueId === 'all' ? 'All game modes' : formatQueueLabel(Number(queueId))}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {matches.map((match) => {
            const expanded = expandedMatchIds.has(match.matchId);
            const allParticipants = Array.from(
              new Map(match.teams.flatMap((team) => team.participants).map((participant) => [`${participant.puuid}-${participant.teamId}`, participant])).values(),
            );
            const maxDamage = Math.max(...allParticipants.map((participant) => participant.damageToChampions), 1);
            const knownQueue = isKnownQueue(match.queueId);
            const matchMeta = [formatDateTime(match.gameStartTimestamp ?? match.gameCreation), formatDuration(match.gameDuration)].join(' - ');
            const averageEnemyRank = getAverageEnemyRank(match);
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
              <article key={match.matchId} className={`overflow-hidden rounded-2xl border ${resultCardClass}`}>
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
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300" title={`Queue ${match.queueId}`}>
                          {formatQueueLabel(match.queueId)}
                        </span>
                        <AverageEnemyRankBadge averageRank={averageEnemyRank} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                        <span>{matchMeta}</span>
                        {match.position ? (
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
                        void copyTextToClipboard(matchLink).then(() => {
                          setCopiedMatchId(match.matchId);
                          window.setTimeout(() => setCopiedMatchId((current) => current === match.matchId ? null : current), 1400);
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        event.stopPropagation();
                        void copyTextToClipboard(matchLink).then(() => {
                          setCopiedMatchId(match.matchId);
                          window.setTimeout(() => setCopiedMatchId((current) => current === match.matchId ? null : current), 1400);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 transition hover:border-amber-300/50 hover:text-amber-200"
                      title="Copy link to this game"
                    >
                      <Copy size={14} />
                      {copiedMatchId === match.matchId ? 'Copied' : 'Copy'}
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

function ChallengesTab({ data }: { data: RiotAccountViewerResponse }) {
  if (!data.challenges) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-sm text-slate-400">No challenge data was returned for this player.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Challenges</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Progress summary</h2>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Total points</p>
          <p className="mt-2 text-3xl font-black text-white">{formatNumber(data.challenges.totalPoints?.current)}</p>
          <p className="mt-1 text-sm text-slate-400">Level {data.challenges.totalPoints?.level ?? 'Unknown'}</p>
        </div>
        <div className="mt-4 grid gap-3">
          {data.challenges.categoryPoints.map((category) => (
            <div key={category.category} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold capitalize text-white">{category.category.toLowerCase()}</p>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">{category.level ?? 'Unknown'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{formatNumber(category.current)} points</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Top challenge values</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Current rankings</h2>
        <div className="mt-5 grid gap-3">
          {data.challenges.topChallenges.map((challenge) => (
            <div key={challenge.challengeId} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-bold text-white">Challenge #{challenge.challengeId}</p>
                <p className="mt-1 text-sm text-slate-400">Level {challenge.level ?? 'Unknown'} - Value {formatNumber(challenge.value)}</p>
              </div>
              <p className="text-sm font-semibold text-amber-300">
                {challenge.percentile === null ? 'No percentile' : `${Math.round(challenge.percentile * 1000) / 10} percentile`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
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

export function RiotAccountViewer() {
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

  const loadAccount = useCallback(async (nextRiotId = riotId, nextPlatform = platform, options: { tab?: ViewerTab; matchId?: string | null } = {}) => {
    const trimmedRiotId = nextRiotId.trim();
    if (!trimmedRiotId) {
      setError('Enter a Riot ID in the format GameName#TagLine.');
      return;
    }

    setLoading(true);
    setError(null);
    setAutoLoadMessage(null);
    try {
      const applyLoadedData = (nextData: RiotAccountViewerResponse) => {
        const nextTab = options.tab ?? 'overview';
        const nextMatchId = options.matchId ?? null;
        setData(nextData);
        writeStoredSearch(trimmedRiotId, nextPlatform);
        setRiotIdSuggestions(readStoredRecentSearches());
        setActiveTab(nextTab);
        setFocusedMatchId(nextMatchId);
        updateViewerUrl(nextData, nextTab, nextMatchId);
      };
      const cachedData = readSessionProfileCache(trimmedRiotId, nextPlatform);
      if (cachedData) {
        applyLoadedData(cachedData);
        return;
      }

      const response = await fetch(`/api/riot-account/viewer?riotId=${encodeURIComponent(trimmedRiotId)}&platform=${encodeURIComponent(nextPlatform)}`);
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
    if (query.length < 2) {
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
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [platform, riotId]);

  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const queryRiotId = params.get('riotId');
    const queryPlatform = params.get('platform')?.toUpperCase() ?? null;
    const queryTab = params.get('tab');
    const queryMatchId = params.get('matchId');
    const storedLastSearch = readStoredLastSearch();
    setRiotIdSuggestions(readStoredRecentSearches());
    if (queryRiotId) {
      const safePlatform = isPlatformRoute(queryPlatform)
        ? queryPlatform
        : 'NA1';
      setRiotId(queryRiotId);
      setPlatform(safePlatform);
      void loadAccount(queryRiotId, safePlatform, {
        tab: isViewerTab(queryTab) ? queryTab : queryMatchId ? 'matches' : 'overview',
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <header className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-glow sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/"
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"
                >
                  <Home size={14} />
                  Home
                </a>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">League Account Viewer</p>
              </div>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">{title}</h1>
            </div>

            {data ? (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <Image src={data.summoner.profileIconUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
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
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"
                  title="Copy link to this account"
                >
                  <Copy size={14} />
                  {copiedAccountLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadAccount();
            }}
            className="mt-6 grid gap-3 lg:grid-cols-[1fr_10rem_auto]"
          >
            <label className="relative">
              <span className="sr-only">Riot ID</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={riotId}
                onChange={(event) => setRiotId(event.target.value)}
                list="riot-account-viewer-suggestions"
                autoComplete="username"
                placeholder="Riot ID"
                className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-1 focus:ring-amber-300/40"
              />
              <datalist id="riot-account-viewer-suggestions">
                {mergedRiotIdSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
            </label>
            <label className="relative">
              <span className="sr-only">League platform</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as PlatformRoute)}
                className="min-h-12 w-full appearance-none rounded-2xl border border-white/10 bg-slate-950 py-2 pl-4 pr-14 text-sm font-bold text-white outline-none transition focus:border-amber-300/70 focus:ring-1 focus:ring-amber-300/40"
              >
                {platformRoutes.map((route) => <option key={route} value={route}>{platformLabels[route]}</option>)}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white" />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              {loading ? 'Loading' : 'Search'}
            </button>
          </form>

          {autoLoadMessage ? <p className="mt-3 text-sm text-amber-200">{autoLoadMessage}</p> : null}
          {error ? <p className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
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
