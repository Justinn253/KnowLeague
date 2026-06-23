'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, Clock3, Crown, Loader2, Medal, Search, Shield, Swords, Trophy, UserRound } from 'lucide-react';
import Image from 'next/image';
import type { RiotAccountViewerResponse } from '@/lib/riot-account-viewer';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const platformRoutes = ['NA1', 'BR1', 'LA1', 'LA2', 'EUW1', 'EUN1', 'KR', 'JP1', 'OC1', 'TR1', 'RU', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2'] as const;
type ViewerTab = 'overview' | 'mastery' | 'matches' | 'challenges';
type MasterySort = 'points' | 'level' | 'recent';
type PlatformRoute = (typeof platformRoutes)[number];
type SharedRiotIdSuggestion = {
  riotId: string;
  platform: PlatformRoute;
  searchCount: number;
};

const lastSearchStorageKey = 'knowleague:riot-account-viewer:last-search';
const recentSearchesStorageKey = 'knowleague:riot-account-viewer:recent-searches';
const maxRecentSearches = 5;

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

function formatDate(timestamp: number | null | undefined) {
  if (!timestamp) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
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

function rankedLabel(queueType: string) {
  return queueType
    .replace('RANKED_', '')
    .replace('_5x5', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Trophy }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <Icon size={17} className="text-amber-300" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
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

function OverviewTab({ data }: { data: RiotAccountViewerResponse }) {
  const soloQueue = data.ranked.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
  const flexQueue = data.ranked.find((entry) => entry.queueType === 'RANKED_FLEX_SR');
  const topMasteries = data.masteries.slice(0, 5);

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Summoner Level" value={formatNumber(data.summoner.summonerLevel)} icon={Shield} />
        <StatTile label="Total Mastery" value={formatNumber(data.summary.totalMasteryPoints)} icon={Medal} />
        <StatTile label="Recent Win Rate" value={data.summary.recentWinRate === null ? 'No matches' : `${data.summary.recentWinRate}%`} icon={Trophy} />
        <StatTile label="Challenge Points" value={formatNumber(data.challenges?.totalPoints?.current)} icon={Crown} />
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
                    <p className="mt-3 text-xl font-bold text-white">{entry.tier} {entry.rank}</p>
                    <p className="mt-1 text-sm text-slate-400">{entry.leaguePoints} LP - {entry.wins}W {entry.losses}L - {entry.winRate}% WR</p>
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
            {topMasteries.map((mastery) => (
              <div key={mastery.champion.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white">{mastery.champion.name}</p>
                  <p className="text-sm text-slate-400">Level {mastery.championLevel} - {formatNumber(mastery.championPoints)} points</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MasteryTab({ data }: { data: RiotAccountViewerResponse }) {
  const [sort, setSort] = useState<MasterySort>('points');
  const [tag, setTag] = useState('All');

  const tags = useMemo(() => {
    const next = new Set<string>();
    data.masteries.forEach((mastery) => mastery.champion.tags.forEach((championTag) => next.add(championTag)));
    return ['All', ...Array.from(next).sort()];
  }, [data.masteries]);

  const masteries = useMemo(() => {
    return [...data.masteries]
      .filter((mastery) => tag === 'All' || mastery.champion.tags.includes(tag))
      .sort((left, right) => {
        if (sort === 'level') return right.championLevel - left.championLevel || right.championPoints - left.championPoints;
        if (sort === 'recent') return right.lastPlayTime - left.lastPlayTime;
        return right.championPoints - left.championPoints;
      });
  }, [data.masteries, sort, tag]);

  const maxPoints = Math.max(...masteries.map((mastery) => mastery.championPoints), 1);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Top Champion mastery</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Horizontally scrollable bar chart</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as MasterySort)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              <option value="points">Mastery total</option>
              <option value="level">Mastery level</option>
              <option value="recent">Recently played</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Champion Role</span>
            <select value={tag} onChange={(event) => setTag(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              {tags.map((championTag) => <option key={championTag} value={championTag}>{championTag}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-3">
        <div className="flex min-h-[28rem] w-max items-end gap-4 pr-2">
          {masteries.map((mastery) => {
            const height = Math.max(44, Math.round((mastery.championPoints / maxPoints) * 300));
            return (
              <div key={mastery.champion.id} className="flex w-24 shrink-0 flex-col items-center gap-3">
                <div className="flex h-[19rem] items-end">
                  <div
                    className="group relative w-16 rounded-t-2xl border border-amber-200/30 bg-gradient-to-t from-amber-500 via-amber-300 to-yellow-100 shadow-lg shadow-amber-950/30"
                    style={{ height }}
                    aria-label={`${mastery.champion.name}: ${mastery.championPoints} mastery points`}
                  >
                    <div className="absolute -top-16 left-1/2 hidden w-44 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-center text-xs text-slate-200 shadow-xl group-hover:block">
                      <span className="font-bold text-white">{mastery.champion.name}</span>
                      <br />
                      Level {mastery.championLevel} - {formatNumber(mastery.championPoints)} points
                    </div>
                  </div>
                </div>
                <ChampionIcon src={mastery.champion.imageUrl} name={mastery.champion.name} />
                <div className="min-h-16 text-center">
                  <p className="line-clamp-2 text-sm font-bold text-white">{mastery.champion.name}</p>
                  <p className="text-xs text-slate-400">L{mastery.championLevel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CurrentGameSection({ data }: { data: RiotAccountViewerResponse }) {
  if (!data.currentGame) return null;

  return (
    <section className="rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Game in progress</p>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {data.currentGame.playerChampion ? `Currently playing ${data.currentGame.playerChampion.name}` : 'Active game detected'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">Queue {data.currentGame.queueId} - {data.currentGame.gameMode} - Started {formatDateTime(data.currentGame.gameStartTime)}</p>
        </div>
        {data.currentGame.playerChampion ? <ChampionIcon src={data.currentGame.playerChampion.imageUrl} name={data.currentGame.playerChampion.name} size="lg" /> : null}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {data.currentGame.participants.map((participant, index) => (
          <div key={`${participant.teamId}-${participant.champion.id}-${index}`} className={`flex items-center gap-3 rounded-2xl border p-3 ${participant.isSearchedPlayer ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-slate-950/50'}`}>
            <ChampionIcon src={participant.champion.imageUrl} name={participant.champion.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{participant.champion.name}</p>
              <p className="text-xs text-slate-400">Team {participant.teamId}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchHistoryTab({ data }: { data: RiotAccountViewerResponse }) {
  const [resultFilter, setResultFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');

  const queues = useMemo(() => ['all', ...Array.from(new Set(data.matches.map((match) => String(match.queueId))))], [data.matches]);
  const matches = data.matches.filter((match) => {
    if (resultFilter === 'wins' && !match.win) return false;
    if (resultFilter === 'losses' && match.win) return false;
    if (queueFilter !== 'all' && String(match.queueId) !== queueFilter) return false;
    return true;
  });

  return (
    <div className="grid gap-5">
      <CurrentGameSection data={data} />

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Recent matches</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Match history</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Average enemy rank is not included in Match-V5 responses. We can add it with a cached opponent League-V4 expansion so searches do not make dozens of rank calls every time.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              <option value="all">All results</option>
              <option value="wins">Victory</option>
              <option value="losses">Defeat</option>
            </select>
            <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-300/60">
              {queues.map((queueId) => <option key={queueId} value={queueId}>{queueId === 'all' ? 'All game modes' : `Queue ${queueId}`}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {matches.map((match) => (
            <article key={match.matchId} className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <ChampionIcon src={match.champion.imageUrl} name={match.champion.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{match.champion.name}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] ${match.win ? 'bg-emerald-400 text-emerald-950' : 'bg-rose-400 text-rose-950'}`}>
                      {match.win ? 'Victory' : 'Defeat'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">Queue {match.queueId}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{formatDateTime(match.gameStartTimestamp ?? match.gameCreation)} - {formatDuration(match.gameDuration)} - {match.position}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5 lg:min-w-[34rem]">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">KDA</p>
                  <p className="font-bold text-white">{match.kills}/{match.deaths}/{match.assists}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Gold</p>
                  <p className="font-bold text-white">{formatNumber(match.goldEarned)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">CS</p>
                  <p className="font-bold text-white">{formatNumber(match.creepScore)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Damage</p>
                  <p className="font-bold text-white">{formatNumber(match.damageToChampions)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Vision</p>
                  <p className="font-bold text-white">{formatNumber(match.visionScore)}</p>
                </div>
              </div>
            </article>
          ))}
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
      <h2 className="mt-5 text-2xl font-bold text-white">Search a Riot account</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Check your Riot account stats by searching your Riot ID and region above. If you have a KnowLeague account with a saved Riot account, your data will be automatically populated here.
      </p>
    </section>
  );
}

export function RiotAccountViewer() {
  const [riotId, setRiotId] = useState('');
  const [platform, setPlatform] = useState<PlatformRoute>('NA1');
  const [activeTab, setActiveTab] = useState<ViewerTab>('overview');
  const [data, setData] = useState<RiotAccountViewerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoadMessage, setAutoLoadMessage] = useState<string | null>(null);
  const [riotIdSuggestions, setRiotIdSuggestions] = useState<string[]>([]);
  const [sharedSuggestions, setSharedSuggestions] = useState<SharedRiotIdSuggestion[]>([]);
  const autoLoadedRef = useRef(false);

  const loadAccount = useCallback(async (nextRiotId = riotId, nextPlatform = platform) => {
    const trimmedRiotId = nextRiotId.trim();
    if (!trimmedRiotId) {
      setError('Enter a Riot ID in the format GameName#TagLine.');
      return;
    }

    setLoading(true);
    setError(null);
    setAutoLoadMessage(null);
    try {
      const response = await fetch(`/api/riot-account/viewer?riotId=${encodeURIComponent(trimmedRiotId)}&platform=${encodeURIComponent(nextPlatform)}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load Riot account data.');
      }
      setData(result as RiotAccountViewerResponse);
      writeStoredSearch(trimmedRiotId, nextPlatform);
      setRiotIdSuggestions(readStoredRecentSearches());
      setActiveTab('overview');
    } catch (nextError) {
      setData(null);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load Riot account data.');
    } finally {
      setLoading(false);
    }
  }, [platform, riotId]);

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
    const storedLastSearch = readStoredLastSearch();
    setRiotIdSuggestions(readStoredRecentSearches());
    if (queryRiotId) {
      const safePlatform = isPlatformRoute(queryPlatform)
        ? queryPlatform
        : 'NA1';
      setRiotId(queryRiotId);
      setPlatform(safePlatform);
      void loadAccount(queryRiotId, safePlatform);
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
        .from('profiles')
        .select('riot_account_name')
        .eq('id', userId)
        .maybeSingle<{ riot_account_name: string | null }>();

      const savedRiotId = profile?.riot_account_name?.trim();
      if (savedRiotId) {
        setRiotIdSuggestions(Array.from(new Set([savedRiotId, ...readStoredRecentSearches()])));
        setAutoLoadMessage('Loading the Riot account saved to your KnowLeague profile.');
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

  const title = data ? `${data.account.gameName}#${data.account.tagLine}` : 'KnowLeague - Riot Account Viewer';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <header className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-glow sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">League account intelligence</p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">{title}</h1>
            </div>

            {data ? (
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <Image src={data.summoner.profileIconUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
                <div>
                  <p className="font-bold text-white">Level {formatNumber(data.summoner.summonerLevel)}</p>
                  <p className="text-sm text-slate-400">{data.platform} - {data.regionalRoute.toUpperCase()}</p>
                </div>
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
                {platformRoutes.map((route) => <option key={route} value={route}>{route}</option>)}
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
            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 p-2" aria-label="Riot account viewer tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
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

            {activeTab === 'overview' ? <OverviewTab data={data} /> : null}
            {activeTab === 'mastery' ? <MasteryTab data={data} /> : null}
            {activeTab === 'matches' ? <MatchHistoryTab data={data} /> : null}
            {activeTab === 'challenges' ? <ChallengesTab data={data} /> : null}
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  );
}
