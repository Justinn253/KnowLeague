'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Loader2, Search, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

const TOKEN_LEADERBOARD_SESSION_CACHE_PREFIX = 'knowleague:token-leaderboards:v3:';
const RIOT_TOKEN_MAPPING_UPDATED_STORAGE_KEY = 'knowleague:riot-token-mapping-updated';
const RIOT_TOKEN_MAPPING_UPDATED_EVENT = 'knowleague:riot-token-mapping-updated';

function getTokenLeaderboardSessionCacheKey(kind: 'catalog' | 'leaderboard', suffix = '') {
  return `${TOKEN_LEADERBOARD_SESSION_CACHE_PREFIX}${kind}:${suffix}`;
}

function readTokenLeaderboardSessionCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeTokenLeaderboardSessionCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session storage is best-effort and should never prevent the page from loading.
  }
}

function invalidateTokenLeaderboardSessionCache() {
  if (typeof window === 'undefined') return;

  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(TOKEN_LEADERBOARD_SESSION_CACHE_PREFIX + 'leaderboard:'))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Session storage is best-effort and should never prevent the page from loading.
  }
}

function fetchTokenLeaderboardCatalog() {
  return fetch('/api/riot-account/token-leaderboards').then(response => {
    if (response.ok) {
      void response
        .clone()
        .json()
        .then(payload => {
          if (payload && Array.isArray(payload.tokens)) {
            writeTokenLeaderboardSessionCache(
              getTokenLeaderboardSessionCacheKey('catalog'),
              payload.tokens,
            );
          }
        })
        .catch(() => undefined);
    }

    return response;
  });
}
import { GameIconImage } from '@/components/game-asset-image';
import type { RiotTokenConfig, RiotTokenLeaderboardEntry, RiotTokenLeaderboardResponse } from '@/lib/riot-token-leaderboards';
import { playUiSound } from '@/lib/ui-sounds';

const platformRoutes = ['NA1', 'BR1', 'LA1', 'LA2', 'EUW1', 'EUN1', 'KR', 'JP1', 'OC1', 'TR1', 'RU', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2'] as const;
type PlatformRoute = (typeof platformRoutes)[number];
type LeaderboardPlatform = PlatformRoute | 'ALL';

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

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function shortRegion(platform: PlatformRoute) {
  return platformLabels[platform].split(' - ')[0];
}

function displayRegion(platform: LeaderboardPlatform) {
  return platform === 'ALL' ? 'All regions' : shortRegion(platform);
}

function Movement({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-xs font-black text-slate-500">=</span>;
  const rising = value > 0;
  const Icon = rising ? ArrowUp : ArrowDown;
  return <span className={rising ? 'inline-flex items-center gap-1 text-xs font-black text-emerald-300' : 'inline-flex items-center gap-1 text-xs font-black text-rose-300'}><Icon size={14} />{Math.abs(value)}</span>;
}

function formatRelativeRefresh(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return elapsedMinutes + ' minute' + (elapsedMinutes === 1 ? '' : 's') + ' ago';
  const elapsedHours = Math.max(1, Math.round(elapsedMinutes / 60));
  return elapsedHours + ' hour' + (elapsedHours === 1 ? '' : 's') + ' ago';
}

function rankTone(rank: number) {
  if (rank === 1) return 'border-amber-200/70 bg-gradient-to-r from-amber-300/25 via-amber-200/10 to-amber-300/5 shadow-[inset_4px_0_0_rgba(253,224,71,0.9)]';
  if (rank === 2) return 'border-slate-200/55 bg-gradient-to-r from-slate-200/15 via-slate-200/5 to-transparent shadow-[inset_4px_0_0_rgba(226,232,240,0.7)]';
  if (rank === 3) return 'border-orange-300/55 bg-gradient-to-r from-orange-300/15 via-orange-200/5 to-transparent shadow-[inset_4px_0_0_rgba(253,186,116,0.75)]';
  if (rank <= 10) return 'border-amber-200/35 bg-gradient-to-r from-amber-200/10 to-transparent shadow-[inset_4px_0_0_rgba(253,224,71,0.45)]';
  return 'border-white/5';
}

function rankTextTone(rank: number) {
  if (rank === 1) return 'text-amber-200';
  if (rank === 2) return 'text-slate-200';
  if (rank === 3) return 'text-orange-200';
  if (rank <= 10) return 'text-amber-100';
  return 'text-slate-500';
}

function rankBadgeTone(rank: number) {
  if (rank === 1) return 'border-amber-200 bg-amber-300 text-slate-950 shadow-[0_0_14px_rgba(253,224,71,0.45)]';
  if (rank === 2) return 'border-slate-200 bg-slate-200 text-slate-950 shadow-[0_0_12px_rgba(226,232,240,0.3)]';
  if (rank === 3) return 'border-orange-200 bg-orange-300 text-slate-950 shadow-[0_0_12px_rgba(253,186,116,0.35)]';
  if (rank <= 10) return 'border-amber-200/70 bg-amber-300/20 text-amber-100';
  return 'border-transparent bg-transparent';
}

function accountViewerHref(entry: RiotTokenLeaderboardEntry) {
  const query = entry.riotId
    ? 'riotId=' + encodeURIComponent(entry.riotId)
    : 'puuid=' + encodeURIComponent(entry.puuid);
  return '/riot-account-viewer?' + query + '&platform=' + encodeURIComponent(entry.platform);
}

function isHistoricalTokenGroup(groupName: string) {
  return /(?:^|\D)(?:2022|2023)(?:\D|$)/.test(groupName);
}

function compareTokenGroups(left: string, right: string) {
  const leftHistorical = isHistoricalTokenGroup(left);
  const rightHistorical = isHistoricalTokenGroup(right);
  if (leftHistorical !== rightHistorical) return leftHistorical ? 1 : -1;
  return left.localeCompare(right);
}

function TokenCard({ token }: { token: RiotTokenConfig }) {
  return (
    <Link href={'/riot-account-viewer/token-leaderboards/' + token.id} onMouseEnter={() => playUiSound('autocomplete-hover')} onFocus={() => playUiSound('autocomplete-hover')} onClick={() => playUiSound('autocomplete-select')} className="group grid min-h-24 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3 transition hover:border-amber-300/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/20 bg-slate-950/70"><GameIconImage src={token.iconUrl} alt="" width={48} height={48} className="h-12 w-12 object-contain" /></span>
      <span className="min-w-0">
        <span className="block text-lg font-black text-white group-hover:text-amber-100">{token.name}</span>
        <span className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400">{token.description}</span>
      </span>
      <ArrowRight size={18} className="game-card-arrow text-slate-600 group-hover:text-amber-200" />
    </Link>
  );
}

export function RiotTokenLeaderboardsIndex() {
  const [tokens, setTokens] = useState<RiotTokenConfig[]>([]);
  const [tokenQuery, setTokenQuery] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);

  const normalizedTokenQuery = tokenQuery.trim().toLocaleLowerCase();
  const tokenGroups = [...new Set(tokens.map((token) => token.groupName))].sort(compareTokenGroups);
  const filteredTokens = normalizedTokenQuery
    ? tokens.filter((token) => (token.name + ' ' + token.description + ' ' + token.groupName + ' ' + token.subgroupName).toLocaleLowerCase().includes(normalizedTokenQuery))
    : tokens;
  const visibleTokens = selectedGroups.length === 0 ? filteredTokens : filteredTokens.filter((token) => selectedGroups.includes(token.groupName));

  const groupedTokens = visibleTokens.reduce<Map<string, Map<string, RiotTokenConfig[]>>>((groups, token) => {
    const subgroups = groups.get(token.groupName) ?? new Map<string, RiotTokenConfig[]>();
    subgroups.set(token.subgroupName, [...(subgroups.get(token.subgroupName) ?? []), token]);
    groups.set(token.groupName, subgroups);
    return groups;
  }, new Map());

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;

    const cachedTokens = readTokenLeaderboardSessionCache<RiotTokenConfig[]>(
      getTokenLeaderboardSessionCacheKey('catalog'),
    );

    if (Array.isArray(cachedTokens) && cachedTokens.length > 0) {
      setTokens(cachedTokens);
      setLoading(false);
      return;
    }
    fetchTokenLeaderboardCatalog()
      .then(async (response) => {
        const result = await response.json() as { tokens?: RiotTokenConfig[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Unable to load token leaderboards.');
        setTokens(Array.isArray(result.tokens) ? result.tokens : []);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load token leaderboards.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <header className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-amber-300 text-slate-950"><Trophy size={24} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">League Tools</p>
              <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">Token Leaderboards</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Browse the top League Challenges players for each leaderboard-enabled token. Choose a token to view its regional top 250.</p>
            </div>
          </div>
        </header>
        <label className="relative mt-5 block">
          <span className="sr-only">Search token leaderboards</span>
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={tokenQuery} onChange={(event) => setTokenQuery(event.target.value)} type="search" autoComplete="off" placeholder="Search tokens" aria-label="Search token leaderboards" className="block min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-1 focus:ring-amber-300/40" />
        </label>
        {!loading && !error && tokenGroups.length > 0 ? <div className="mt-4"><p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Token groups</p><div className="flex flex-wrap gap-2" role="group" aria-label="Filter token groups"><button type="button" aria-pressed={selectedGroups.length === 0} onMouseEnter={() => playUiSound('autocomplete-hover')} onFocus={() => playUiSound('autocomplete-hover')} onClick={() => { playUiSound('autocomplete-select'); setSelectedGroups([]); }} className={'inline-flex min-h-9 items-center justify-center rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ' + (selectedGroups.length === 0 ? 'border-amber-200 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-amber-200/50 hover:text-white')}>All</button>{tokenGroups.map((groupName) => { const selected = selectedGroups.includes(groupName); return <button key={groupName} type="button" aria-pressed={selected} onMouseEnter={() => playUiSound('autocomplete-hover')} onFocus={() => playUiSound('autocomplete-hover')} onClick={() => { playUiSound('autocomplete-select'); setSelectedGroups((current) => selected ? current.filter((group) => group !== groupName) : [...current, groupName]); }} className={'inline-flex min-h-9 items-center justify-center rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ' + (selected ? 'border-amber-200 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-amber-200/50 hover:text-white')}>{groupName}</button>; })}</div></div> : null}
        {loading ? <div className="mt-6 flex min-h-48 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/50"><Loader2 className="animate-spin text-amber-200" size={28} /></div> : null}
        {error ? <p className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-5 text-sm font-semibold text-rose-100">{error}</p> : null}
        {!loading && !error && tokens.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-sm text-slate-400">No token leaderboards are currently available.</p> : null}
        {!loading && !error && tokens.length > 0 && visibleTokens.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-sm text-slate-400">No tokens match your selected filters.</p> : null}
        {!loading && !error && groupedTokens.size > 0 ? <div className="mt-7 space-y-8">{[...groupedTokens.entries()].sort(([left], [right]) => compareTokenGroups(left, right)).map(([groupName, subgroups]) => <section key={groupName} aria-labelledby={'token-group-' + groupName}><h2 id={'token-group-' + groupName} className="text-xl font-black text-white">{groupName}</h2><div className="mt-4 space-y-5">{[...subgroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([subgroupName, subgroupTokens]) => <div key={subgroupName}><h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">{subgroupName}</h3><div className="mt-3 grid gap-3 md:grid-cols-2 [content-visibility:auto] [contain-intrinsic-size:1000px]">{subgroupTokens.sort((left, right) => left.name.localeCompare(right.name)).map((token) => <TokenCard key={token.id} token={token} />)}</div></div>)}</div></section>)}</div> : null}
      </section>
    </main>
  );
}

function leaderboardRowId(entry: RiotTokenLeaderboardEntry) {
  return 'token-leaderboard-row-' + entry.platform + '-' + entry.puuid;
}

function LeaderboardRow({ entry }: { entry: RiotTokenLeaderboardEntry }) {
  const playerLabel = entry.riotId ?? entry.puuid;
  const content = (
    <>
      <span className={'w-12 shrink-0 text-center text-sm font-black ' + rankTextTone(entry.rank)}><span className={'inline-flex min-w-8 items-center justify-center rounded-lg border px-1.5 py-1 ' + rankBadgeTone(entry.rank)}>#{entry.rank}</span></span>
      <span className="min-w-0 flex-1 truncate font-bold text-white" title={playerLabel}>{playerLabel}</span>
      <span className="hidden w-16 text-right text-sm font-black text-amber-100 sm:block">{formatNumber(entry.points)}</span>
      <span className="flex w-16 shrink-0 justify-end"><Movement value={entry.movement} /></span>
      <span className="w-5 text-slate-600"><ArrowRight size={16} /></span>
    </>
  );
  const className = 'group flex min-h-14 items-center gap-3 border-b px-3 transition last:border-b-0 hover:bg-white/5 ' + rankTone(entry.rank);
  return <Link id={leaderboardRowId(entry)} href={accountViewerHref(entry)} target="_blank" rel="noopener noreferrer" className={className + ' focus:outline-none focus-visible:bg-white/10'} title="Open this player in the League Account Viewer">{content}</Link>;
}

export function RiotTokenLeaderboardDetail({ tokenId }: { tokenId: number }) {
  const [platform, setPlatform] = useState<LeaderboardPlatform>('NA1');
  const [data, setData] = useState<RiotTokenLeaderboardResponse | null>(null);
  const [riotId, setRiotId] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const initialLoadKey = useRef<string | null>(null);
  const localLeaderboardCache = useRef(new Map<string, RiotTokenLeaderboardResponse>());

  useEffect(() => {
    const handleMappingUpdated = () => {
      localLeaderboardCache.current.clear();
      invalidateTokenLeaderboardSessionCache();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RIOT_TOKEN_MAPPING_UPDATED_STORAGE_KEY) handleMappingUpdated();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(RIOT_TOKEN_MAPPING_UPDATED_EVENT, handleMappingUpdated);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(RIOT_TOKEN_MAPPING_UPDATED_EVENT, handleMappingUpdated);
    };
  }, []);

  const loadLeaderboard = useCallback(async (nextPlatform: LeaderboardPlatform, searchQuery?: string) => {
    const localCacheKey = String(tokenId) + ':' + nextPlatform;
    if (!searchQuery?.trim()) {
      const cached = localLeaderboardCache.current.get(localCacheKey);
      if (cached && Date.parse(cached.nextRefreshAt) > Date.now()) {
        setData(cached);
        return cached;
      }
      localLeaderboardCache.current.delete(localCacheKey);

        const sessionCached = readTokenLeaderboardSessionCache<RiotTokenLeaderboardResponse>(
          getTokenLeaderboardSessionCacheKey('leaderboard', localCacheKey),
        );

        if (
          sessionCached &&
          Array.isArray(sessionCached.entries) &&
          Date.parse(sessionCached.nextRefreshAt) > Date.now()
        ) {
          localLeaderboardCache.current.set(localCacheKey, sessionCached);
          setData(sessionCached);
          return sessionCached;
        }
    }

    const params = new URLSearchParams({ tokenId: String(tokenId), platform: nextPlatform });
    if (searchQuery?.trim()) params.set('riotId', searchQuery.trim());
    const response = await fetch('/api/riot-account/token-leaderboards?' + params.toString());
    const result = await response.json() as Partial<RiotTokenLeaderboardResponse> & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Unable to load this token leaderboard.');
    if (!Array.isArray(result.entries)) throw new Error(result.error ?? 'The leaderboard response was incomplete. Please try again.');
    const normalizedResult = result as RiotTokenLeaderboardResponse;
    setData(normalizedResult);
      if (!searchQuery?.trim()) {
        localLeaderboardCache.current.set(localCacheKey, normalizedResult);
        writeTokenLeaderboardSessionCache(
          getTokenLeaderboardSessionCacheKey('leaderboard', localCacheKey),
          normalizedResult,
        );
      }
    return normalizedResult;
  }, [tokenId]);

  useEffect(() => {
    const queryPlatform = new URLSearchParams(window.location.search).get('platform')?.toUpperCase();
    const initialPlatform: LeaderboardPlatform = queryPlatform === 'ALL' || platformRoutes.includes(queryPlatform as PlatformRoute) ? queryPlatform as LeaderboardPlatform : 'NA1';
    const loadKey = tokenId + ':' + initialPlatform;
    if (initialLoadKey.current === loadKey) return;
    initialLoadKey.current = loadKey;
    setPlatform(initialPlatform);
    void loadLeaderboard(initialPlatform).catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Unable to load this token leaderboard.')).finally(() => setLoading(false));
  }, [loadLeaderboard, tokenId]);

  const selectPlatform = (nextPlatform: LeaderboardPlatform) => {
    playUiSound('autocomplete-select');
    setPlatform(nextPlatform);
    setLoading(true);
    setError(null);
    setSearchMessage(null);
    window.history.replaceState(null, '', '/riot-account-viewer/token-leaderboards/' + tokenId + '?platform=' + nextPlatform);
    void loadLeaderboard(nextPlatform).catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Unable to load this token leaderboard.')).finally(() => setLoading(false));
  };

  const searchLeaderboard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = riotId.trim();
    if (!trimmed) {
      setSearchMessage('Enter a Riot ID in the format GameName#TagLine.');
      return;
    }
    setSearching(true);
    setError(null);
    setSearchMessage(null);
    try {
      const result = await loadLeaderboard(platform, trimmed);
      setSearchMessage(result.searchedPlayer ? null : 'That Riot ID was found, but no position was returned for this token in ' + displayRegion(platform) + '.');
    } catch (nextError) {
      setSearchMessage(nextError instanceof Error ? nextError.message : 'Unable to search this token leaderboard.');
    } finally {
      setSearching(false);
    }
  };

  const searchedPlayer = data?.searchedPlayer ?? null;
  const searchedPlayerInList = Boolean(searchedPlayer && data?.entries.some((entry) => entry.platform === searchedPlayer.platform && entry.puuid === searchedPlayer.puuid));
  const listLabel = data ? 'Top ' + data.entries.length + ' players  -  ' + displayRegion(data.platform) : 'Token leaderboard';
  const showSearchedPlayerInList = () => {
    if (!searchedPlayer) return;

    document.getElementById(leaderboardRowId(searchedPlayer))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <Link href="/riot-account-viewer/token-leaderboards" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-bold text-slate-300 transition hover:border-amber-300/50 hover:text-amber-200"><ArrowLeft size={16} />Back to all token leaderboards</Link>
        <header className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
          {data ? <div className="flex items-center gap-3"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-amber-200/20 bg-slate-950/70"><GameIconImage src={data.token.iconUrl} alt="" width={56} height={56} className="h-14 w-14 object-contain" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Token Leaderboard</p><span className={'rounded-full border px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] ' + (data.token.status === 'active' ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : 'border-slate-400/30 bg-slate-400/10 text-slate-300')}>{data.token.status === 'active' ? 'Active' : 'Inactive'}</span></div><h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">{data.token.name}</h1><p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">{data.token.description}</p></div></div> : <div className="h-20 animate-pulse rounded-xl bg-slate-950/50" />}
        </header>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="League regions">
          <button type="button" onMouseEnter={() => playUiSound('autocomplete-hover')} onFocus={() => playUiSound('autocomplete-hover')} onClick={() => selectPlatform('ALL')} className={'inline-flex min-h-9 items-center justify-center rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ' + (platform === 'ALL' ? 'border-amber-200 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-amber-200/50 hover:text-white')}>All</button>
          {platformRoutes.map((region) => <button key={region} type="button" onMouseEnter={() => playUiSound('autocomplete-hover')} onFocus={() => playUiSound('autocomplete-hover')} onClick={() => selectPlatform(region)} title={platformLabels[region]} className={'inline-flex min-h-9 items-center justify-center rounded-xl border px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ' + (platform === region ? 'border-amber-200 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-amber-200/50 hover:text-white')}>{shortRegion(region)}</button>)}
        </nav>

        <form onSubmit={searchLeaderboard} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block"><span className="sr-only">Riot ID</span><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input value={riotId} onChange={(event) => setRiotId(event.target.value)} autoComplete="username" placeholder="Riot ID" className="block min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-1 focus:ring-amber-300/40" /></label>
          <button type="submit" disabled={searching || loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">{searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}{searching ? 'Searching' : 'Search player'}</button>
        </form>

        {searchedPlayer ? <section className="mt-4 overflow-hidden rounded-2xl border border-emerald-300/40 bg-emerald-300/10">
          <Link href={accountViewerHref(searchedPlayer)} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-4 p-4 text-left focus:outline-none focus-visible:bg-emerald-300/15">
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Searched Player - {displayRegion(data?.platform ?? platform)}</span>
              <span className="mt-2 block truncate text-sm font-black text-white transition group-hover:text-emerald-100" title={searchedPlayer.riotId ?? searchedPlayer.puuid}>{searchedPlayer.riotId ?? searchedPlayer.puuid}</span>
              <span className="mt-1 block text-xs font-semibold text-emerald-100/75">#{searchedPlayer.rank}  -  {formatNumber(searchedPlayer.points)} points</span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-emerald-200 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
          {searchedPlayerInList ? <div className="border-t border-emerald-300/20 px-4 py-3">
            <button type="button" onClick={showSearchedPlayerInList} className="inline-flex min-h-9 items-center justify-center rounded-xl border border-emerald-200/40 bg-emerald-300/10 px-3 text-xs font-black text-emerald-100 transition hover:border-emerald-100/70 hover:bg-emerald-300/20">Show in list</button>
          </div> : null}
        </section> : null}
        <p role="note" className="mt-3 rounded-2xl border border-amber-300/50 bg-amber-300/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-100">
          Due to the current Riot API key limitations, only PUUIDs are shown until their respective Riot ID is stored in our backend. Sorry for the inconvenience.
        </p>
        {searchMessage ? <p className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">{searchMessage}</p> : null}
        {error ? <p className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/50 px-4 py-4"><div><h2 className="text-lg font-black text-white">{listLabel}</h2>{data?.platform === 'ALL' ? <p className="mt-1 text-xs font-semibold text-slate-500">Combined from {data.availablePlatforms.length} cached region{data.availablePlatforms.length === 1 ? '' : 's'}.</p> : null}</div>{data ? <p className="text-xs font-semibold text-slate-500">Last refreshed: {formatRelativeRefresh(data.generatedAt)}</p> : null}</div>
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-amber-200" size={28} /></div> : data?.entries.length ? <div><div className="flex min-h-10 items-center gap-3 border-b border-white/10 px-3 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500"><span className="w-12 shrink-0 text-center">Rank</span><span className="flex-1">Player</span><span className="hidden w-16 shrink-0 text-right sm:block">Points</span><span className="w-16 shrink-0 text-right">Change</span><span className="w-5 shrink-0" /></div>{data.entries.map((entry) => <LeaderboardRow key={entry.rank + '-' + entry.platform} entry={entry} />)}{data.unresolvedNameCount > 0 ? <p className="border-t border-white/10 px-4 py-3 text-xs font-semibold text-slate-500"></p> : null}</div> : <p className="p-5 text-sm text-slate-400">No leaderboard entries were returned for this region.</p>}
        </section>
      </section>
    </main>
  );
}
