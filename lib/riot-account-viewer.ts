import { gzipSync, gunzipSync } from 'node:zlib';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';
import { logServerEvent } from '@/lib/server-log';

const DATA_DRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const RIOT_API_KEY_HEADER = 'X-Riot-Token';
const MATCH_COUNT = process.env.NODE_ENV === 'production' ? 20 : 8;
const MATCH_DETAIL_BATCH_SIZE = 4;
const MATCH_DETAIL_BATCH_DELAY_MS = 350;
const PARTICIPANT_RANK_CACHE_TTL_MS = Number(process.env.RIOT_PARTICIPANT_RANK_CACHE_TTL_MS ?? 5 * 60_000);
const RIOT_ACCOUNT_SEARCH_DEDUPE_TTL_MS = 30_000;

export const RIOT_PLATFORM_ROUTES = [
  'BR1',
  'EUN1',
  'EUW1',
  'JP1',
  'KR',
  'LA1',
  'LA2',
  'NA1',
  'OC1',
  'TR1',
  'RU',
  'PH2',
  'SG2',
  'TH2',
  'TW2',
  'VN2',
] as const;

export type RiotPlatformRoute = (typeof RIOT_PLATFORM_ROUTES)[number];
type RiotRegionalRoute = 'americas' | 'asia' | 'europe' | 'sea';
type RankedQueueKey = 'solo' | 'flex';
type ParticipantRank = { tier: string; rank: string; queueType: string };
type CachedParticipantRank = { rank: ParticipantRank | null };

type RiotAccountDto = {
  puuid: string;
  gameName?: string;
  tagLine?: string;
};

type RiotSummonerDto = {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
};

type RiotChampionMasteryDto = {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  chestGranted: boolean;
  tokensEarned?: number;
  markRequiredForNextLevel?: number;
};

type RiotLeagueEntryDto = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
};

type RiotChallengesDto = {
  totalPoints?: {
    level?: string;
    current?: number;
    max?: number;
    percentile?: number;
  };
  categoryPoints?: Record<string, {
    level?: string;
    current?: number;
    max?: number;
    percentile?: number;
  }>;
  challenges?: Array<{
    challengeId: number;
    percentile?: number;
    level?: string;
    value?: number;
    achievedTime?: number;
  }>;
};

type RiotChallengeConfigDto = {
  id?: number;
  challengeId?: number;
  localizedNames?: Record<string, string | {
    name?: string;
    description?: string;
    shortDescription?: string;
  }>;
  localizedDescriptions?: Record<string, string | {
    name?: string;
    description?: string;
    shortDescription?: string;
  }>;
};

type RiotMatchDto = {
  metadata: {
    matchId: string;
  };
  info: {
    gameCreation: number;
    gameStartTimestamp?: number;
    gameEndTimestamp?: number;
    gameDuration: number;
    gameMode: string;
    gameType: string;
    gameVersion: string;
    mapId: number;
    queueId: number;
    participants: RiotParticipantDto[];
    teams: RiotTeamDto[];
  };
};

type RiotObjectiveDto = {
  first: boolean;
  kills: number;
};

type RiotTeamDto = {
  teamId: number;
  win: boolean;
  objectives: {
    baron?: RiotObjectiveDto;
    champion?: RiotObjectiveDto;
    dragon?: RiotObjectiveDto;
    horde?: RiotObjectiveDto;
    inhibitor?: RiotObjectiveDto;
    riftHerald?: RiotObjectiveDto;
    tower?: RiotObjectiveDto;
  };
};

type RiotParticipantDto = {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  individualPosition: string;
  win: boolean;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  goldSpent: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  perks?: {
    styles?: Array<{
      style: number;
      selections?: Array<{
        perk: number;
      }>;
    }>;
  };
};

type RiotCurrentGameDto = {
  gameId: number;
  gameStartTime: number;
  gameLength: number;
  gameMode: string;
  gameType: string;
  mapId: number;
  gameQueueConfigId: number;
  participants: Array<{
    puuid?: string;
    summonerId?: string;
    riotId?: string;
    championId: number;
    teamId: number;
    spell1Id: number;
    spell2Id: number;
  }>;
};

type DataDragonChampion = {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  image: {
    full: string;
  };
};

type DataDragonChampionResponse = {
  data: Record<string, DataDragonChampion>;
};

type DataDragonSummonerSpell = {
  key: string;
  name: string;
  image: {
    full: string;
  };
};

type DataDragonSummonerSpellResponse = {
  data: Record<string, DataDragonSummonerSpell>;
};

type DataDragonRune = {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: Array<{
    runes: Array<{
      id: number;
      key: string;
      icon: string;
      name: string;
    }>;
  }>;
};

type DataDragonItem = {
  name: string;
  description?: string;
  plaintext?: string;
  image: {
    full: string;
  };
};

type DataDragonItemResponse = {
  data: Record<string, DataDragonItem>;
};

function stripRichText(value: string | undefined) {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

export type RiotChampionSummary = {
  id: number;
  key: string;
  name: string;
  title: string;
  tags: string[];
  imageUrl: string;
};

export type RiotAccountViewerMastery = {
  champion: RiotChampionSummary;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  chestGranted: boolean;
  tokensEarned: number | null;
  markRequiredForNextLevel: number | null;
};

export type RiotAccountViewerMatch = {
  matchId: string;
  gameCreation: number;
  gameStartTimestamp: number | null;
  gameEndTimestamp: number | null;
  gameDuration: number;
  gameMode: string;
  gameType: string;
  gameVersion: string;
  mapId: number;
  queueId: number;
  champion: RiotChampionSummary;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  creepScore: number;
  damageToChampions: number;
  visionScore: number;
  items: number[];
  summonerSpells: number[];
  teams: RiotAccountViewerMatchTeam[];
};

export type RiotAccountViewerMatchParticipant = {
  puuid: string;
  riotId: string;
  champion: RiotChampionSummary;
  teamId: number;
  position: string;
  win: boolean;
  championLevel: number;
  rank: {
    tier: string;
    rank: string;
    queueType: string;
  } | null;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  goldSpent: number;
  creepScore: number;
  damageDealt: number;
  damageToChampions: number;
  damageTaken: number;
  damageToObjectives: number;
  damageToTurrets: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWardsPlaced: number;
  items: Array<{
    id: number;
    slot: number;
    name: string;
    description: string;
    plaintext: string | null;
    imageUrl: string;
  }>;
  summonerSpells: Array<{
    id: number;
    name: string;
    imageUrl: string;
  }>;
  runes: Array<{
    id: number;
    name: string;
    imageUrl: string;
  }>;
  multikills: {
    double: number;
    triple: number;
    quadra: number;
    penta: number;
  };
  isSearchedPlayer: boolean;
};

export type RiotAccountViewerMatchTeam = {
  teamId: number;
  win: boolean;
  kills: number;
  goldEarned: number;
  damageToChampions: number;
  creepScore: number;
  visionScore: number;
  objectives: {
    baron: number;
    champion: number;
    dragon: number;
    horde: number;
    inhibitor: number;
    riftHerald: number;
    tower: number;
  };
  participants: RiotAccountViewerMatchParticipant[];
};

export type RiotAccountViewerResponse = {
  updatedAt: string;
  searchedRiotId: string;
  platform: RiotPlatformRoute;
  regionalRoute: RiotRegionalRoute;
  account: {
    puuid: string;
    gameName: string;
    tagLine: string;
  };
  summoner: {
    id: string;
    profileIconId: number;
    profileIconUrl: string;
    summonerLevel: number;
    revisionDate: number;
  };
  ranked: Array<RiotLeagueEntryDto & { winRate: number }>;
  masteries: RiotAccountViewerMastery[];
  matches: RiotAccountViewerMatch[];
  currentGame: {
    gameId: number;
    gameStartTime: number;
    gameLength: number;
    gameMode: string;
    gameType: string;
    mapId: number;
    queueId: number;
    playerChampion: RiotChampionSummary | null;
    participants: Array<{
      champion: RiotChampionSummary;
      teamId: number;
      isSearchedPlayer: boolean;
    }>;
  } | null;
  challenges: {
    totalPoints: RiotChallengesDto['totalPoints'] | null;
    categoryPoints: Array<{
      category: string;
      level: string | null;
      current: number | null;
      max: number | null;
      percentile: number | null;
    }>;
    topChallenges: Array<{
      challengeId: number;
      name: string | null;
      description: string | null;
      level: string | null;
      value: number | null;
      percentile: number | null;
      achievedTime: number | null;
    }>;
  } | null;
  summary: {
    totalMasteryPoints: number;
    topChampion: RiotChampionSummary | null;
    recentWinRate: number | null;
    matchSampleSize: number;
  };
  analytics: {
    sampleSize: number;
    totalMasteryTopPercent: number | null;
    challengePointsTopPercent: number | null;
    rankedPlacements: {
      solo: {
        regionalRank: number;
        topPercent: number;
        sampleSize: number;
      } | null;
      flex: {
        regionalRank: number;
        topPercent: number;
        sampleSize: number;
      } | null;
    };
  };
};

export type RiotAccountSearchSuggestion = {
  riotId: string;
  platform: RiotPlatformRoute;
  searchCount: number;
};

export type RiotAccountPopularityPeriod = 'day' | 'week' | 'month' | 'all_time';

export type RiotAccountPopularSearch = {
  riotId: string;
  platform: RiotPlatformRoute;
  searchCount: number;
  lastSearchedAt: string;
};

export type RiotPatchNoteSummary = {
  patchNumber: string;
  publishedAt: string;
  title: string;
  description: string | null;
  href: string;
  slug: string;
};

export type RiotPatchNoteContentBlock = {
  kind: 'heading' | 'paragraph' | 'list';
  level?: number;
  text: string;
};

export type RiotPatchNoteDetail = RiotPatchNoteSummary & {
  subtitle: string | null;
  intro: string[];
  blocks: RiotPatchNoteContentBlock[];
};

export type RiotPatchNoteSearchMatch = {
  heading: string;
  excerpts: string[];
};

export type RiotPatchNoteSearchResult = {
  note: RiotPatchNoteSummary;
  matches: RiotPatchNoteSearchMatch[];
};

export type MasteryMasterChampion = {
  id: number;
  key: string;
  name: string;
  title: string;
  imageUrl: string;
  splashUrl: string;
  championLevel: number;
  championPoints: number;
};

export type MasteryMasterProfile = {
  riotId: string;
  platform: RiotPlatformRoute;
  champions: MasteryMasterChampion[];
};

export type RiotLiveGameStatus = {
  riotId: string;
  platform: RiotPlatformRoute;
  inGame: boolean;
  gameId: number | null;
  gameStartTime: number | null;
  gameLength: number | null;
  champion: RiotChampionSummary | null;
  currentGame: RiotAccountViewerResponse['currentGame'];
  updatedAt: string;
};

export type RiotAccountProfileSnapshot = {
  data: RiotAccountViewerResponse;
  puuid: string;
  platform: RiotPlatformRoute;
  fetchedAt: string;
  expiresAt: string;
  lastAccessedAt: string;
  currentGameFetchedAt: string | null;
};

type RiotAccountProfileSnapshotRow = {
  puuid: string;
  platform: RiotPlatformRoute;
  riot_id: string;
  riot_id_normalized: string;
  profile_payload: string;
  current_game_payload: string | null;
  payload_encoding: string;
  fetched_at: string;
  current_game_fetched_at: string | null;
  expires_at: string;
  last_accessed_at: string;
};

let cachedChampionLookup: Promise<Map<number, RiotChampionSummary>> | null = null;
let cachedDataDragonVersion: Promise<string> | null = null;
let cachedSummonerSpellLookup: Promise<Map<number, { name: string; imageUrl: string }>> | null = null;
let cachedRuneLookup: Promise<Map<number, { name: string; imageUrl: string }>> | null = null;
let cachedItemLookup: Promise<Map<number, { name: string; description: string; plaintext: string | null; imageUrl: string }>> | null = null;
const inFlightParticipantRanks = new Map<string, Promise<ParticipantRank | null>>();

export function isRiotPlatformRoute(value: string): value is RiotPlatformRoute {
  return RIOT_PLATFORM_ROUTES.includes(value.toUpperCase() as RiotPlatformRoute);
}

export function parseRiotId(riotId: string) {
  const normalized = riotId.trim();
  const separatorIndex = normalized.lastIndexOf('#');
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    throw new Error('Enter a Riot ID in the format GameName#TagLine.');
  }

  const gameName = normalized.slice(0, separatorIndex).trim();
  const tagLine = normalized.slice(separatorIndex + 1).trim();
  if (!gameName || !tagLine) {
    throw new Error('Enter a Riot ID in the format GameName#TagLine.');
  }

  return { gameName, tagLine, normalized: `${gameName}#${tagLine}` };
}

function compressJson(value: unknown) {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8')).toString('base64');
}

function decompressJson<T>(value: string) {
  return JSON.parse(gunzipSync(Buffer.from(value, 'base64')).toString('utf8')) as T;
}

function snapshotProfilePayload(data: RiotAccountViewerResponse) {
  return { ...data, currentGame: null } satisfies RiotAccountViewerResponse;
}

export function hasRiotAccountViewerItemDetails(data: RiotAccountViewerResponse) {
  const items = data.matches.flatMap((match) => match.teams.flatMap((team) => team.participants.flatMap((participant) => participant.items)));
  return items.every((item) => (
    Object.prototype.hasOwnProperty.call(item, 'description')
    && Object.prototype.hasOwnProperty.call(item, 'plaintext')
  ));
}

export function isRiotAccountProfileSnapshotFresh(snapshot: RiotAccountProfileSnapshot) {
  return Date.parse(snapshot.expiresAt) > Date.now();
}

export async function getRiotAccountProfileSnapshot(riotId: string, platform: RiotPlatformRoute) {
  try {
    const normalizedRiotId = parseRiotId(riotId).normalized.toLowerCase();
    const { data, error } = await getSupabaseServiceClient()
      .from('riot_account_profile_snapshots')
      .select('puuid, platform, riot_id, riot_id_normalized, profile_payload, current_game_payload, payload_encoding, fetched_at, current_game_fetched_at, expires_at, last_accessed_at')
      .eq('platform', platform)
      .eq('riot_id_normalized', normalizedRiotId)
      .maybeSingle<RiotAccountProfileSnapshotRow>();

    if (error || !data || data.payload_encoding !== 'gzip+base64') return null;

    const profile = decompressJson<RiotAccountViewerResponse>(data.profile_payload);
    const currentGame = data.current_game_payload
      ? decompressJson<RiotAccountViewerResponse['currentGame']>(data.current_game_payload)
      : null;

    return {
      data: { ...profile, currentGame },
      puuid: data.puuid,
      platform: data.platform,
      fetchedAt: data.fetched_at,
      expiresAt: data.expires_at,
      lastAccessedAt: data.last_accessed_at,
      currentGameFetchedAt: data.current_game_fetched_at,
    } satisfies RiotAccountProfileSnapshot;
  } catch {
    return null;
  }
}

export async function getRiotAccountProfileSnapshotByPuuid(puuid: string, platform: RiotPlatformRoute) {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from('riot_account_profile_snapshots')
      .select('puuid, platform, riot_id, riot_id_normalized, profile_payload, current_game_payload, payload_encoding, fetched_at, current_game_fetched_at, expires_at, last_accessed_at')
      .eq('puuid', puuid)
      .eq('platform', platform)
      .maybeSingle<RiotAccountProfileSnapshotRow>();

    if (error || !data || data.payload_encoding !== 'gzip+base64') return null;

    const profile = decompressJson<RiotAccountViewerResponse>(data.profile_payload);
    const currentGame = data.current_game_payload
      ? decompressJson<RiotAccountViewerResponse['currentGame']>(data.current_game_payload)
      : null;

    return {
      data: { ...profile, currentGame },
      puuid: data.puuid,
      platform: data.platform,
      fetchedAt: data.fetched_at,
      expiresAt: data.expires_at,
      lastAccessedAt: data.last_accessed_at,
      currentGameFetchedAt: data.current_game_fetched_at,
    } satisfies RiotAccountProfileSnapshot;
  } catch {
    return null;
  }
}

export async function saveRiotAccountProfileSnapshot(data: RiotAccountViewerResponse, ttlMs: number) {
  try {
    const fetchedAt = data.updatedAt || new Date().toISOString();
    const currentGameFetchedAt = new Date().toISOString();
    await getSupabaseServiceClient()
      .from('riot_account_profile_snapshots')
      .upsert({
        puuid: data.account.puuid,
        platform: data.platform,
        riot_id: `${data.account.gameName}#${data.account.tagLine}`,
        riot_id_normalized: `${data.account.gameName}#${data.account.tagLine}`.toLowerCase(),
        profile_payload: compressJson(snapshotProfilePayload(data)),
        current_game_payload: data.currentGame ? compressJson(data.currentGame) : null,
        payload_encoding: 'gzip+base64',
        fetched_at: fetchedAt,
        current_game_fetched_at: currentGameFetchedAt,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        last_accessed_at: new Date().toISOString(),
      }, { onConflict: 'puuid,platform' });
  } catch {
    // The durable cache is an optimization and must not block a successful Riot response.
  }
}

export async function touchRiotAccountProfileSnapshot(snapshot: RiotAccountProfileSnapshot) {
  try {
    await getSupabaseServiceClient()
      .from('riot_account_profile_snapshots')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('puuid', snapshot.puuid)
      .eq('platform', snapshot.platform);
  } catch {
    // Cache access bookkeeping is best-effort.
  }
}

export async function updateRiotAccountProfileSnapshotLiveGame(
  snapshot: RiotAccountProfileSnapshot,
  currentGame: RiotAccountViewerResponse['currentGame'],
  fetchedAt: string,
) {
  try {
    await getSupabaseServiceClient()
      .from('riot_account_profile_snapshots')
      .update({
        current_game_payload: currentGame ? compressJson(currentGame) : null,
        current_game_fetched_at: fetchedAt,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('puuid', snapshot.puuid)
      .eq('platform', snapshot.platform);
  } catch {
    // The durable live-game cache is best-effort.
  }
}

export function getRegionalRoute(platform: RiotPlatformRoute): RiotRegionalRoute {
  if (platform === 'KR' || platform === 'JP1') return 'asia';
  if (platform === 'EUN1' || platform === 'EUW1' || platform === 'TR1' || platform === 'RU') return 'europe';
  if (platform === 'PH2' || platform === 'SG2' || platform === 'TH2' || platform === 'TW2' || platform === 'VN2') {
    return 'sea';
  }
  return 'americas';
}

export async function recordRiotAccountSearch(input: {
  riotId: string;
  gameName: string;
  tagLine: string;
  platform: RiotPlatformRoute;
}, dedupeKey?: string) {
  const normalizedDedupeKey = dedupeKey?.trim();
  const cacheKey = normalizedDedupeKey
    ? `riot-account-search-dedupe:${normalizedDedupeKey}:${input.platform}:${input.riotId.toLowerCase()}`
    : null;
  if (cacheKey && getServerCache<boolean>(cacheKey)) return false;

  try {
    const { error } = await getSupabaseServiceClient().rpc('record_riot_account_search', {
      search_riot_id: input.riotId,
      search_game_name: input.gameName,
      search_tag_line: input.tagLine,
      search_platform: input.platform,
    });
    if (error) return false;
    if (cacheKey) setServerCache(cacheKey, true, RIOT_ACCOUNT_SEARCH_DEDUPE_TTL_MS);
    return true;
  } catch {
    // Search suggestions are best-effort and should not block a successful Riot lookup.
    return false;
  }
}

export async function getRiotAccountPopularSearches(
  period: RiotAccountPopularityPeriod,
  limit: number,
) {
  try {
    const { data, error } = await getSupabaseServiceClient().rpc('get_riot_account_popularity', {
      search_period: period,
      search_limit: Math.min(50, Math.max(1, limit)),
    });
    if (error) return null;

    const rows = (data ?? []) as unknown[];
    return rows
      .filter((row: unknown): row is { riot_id: string; platform: RiotPlatformRoute; search_count: number | string; last_searched_at: string } => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as Record<string, unknown>;
        const searchCount = typeof candidate.search_count === 'number'
          ? candidate.search_count
          : typeof candidate.search_count === 'string'
            ? Number(candidate.search_count)
            : NaN;
        return typeof candidate.riot_id === 'string'
          && typeof candidate.platform === 'string'
          && isRiotPlatformRoute(candidate.platform)
          && Number.isFinite(searchCount)
          && typeof candidate.last_searched_at === 'string';
      })
      .map((row): RiotAccountPopularSearch => ({
        riotId: row.riot_id,
        platform: row.platform,
        searchCount: Number(row.search_count),
        lastSearchedAt: row.last_searched_at,
      }));
  } catch {
    return null;
  }
}

const PATCH_NOTES_URL = 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/';
const PATCH_NOTES_ORIGIN = 'https://www.leagueoflegends.com';
const PATCH_NOTE_REVALIDATE_SECONDS = 6 * 60 * 60;
const PATCH_NOTE_SUMMARY_CACHE_TTL_MS = 15 * 60_000;
const PATCH_NOTE_DETAIL_CACHE_TTL_MS = 15 * 60_000;
const PATCH_NOTE_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const patchNoteSummaryCacheKey = 'riot-account-viewer:patch-notes:summaries';
const patchNoteDetailCachePrefix = 'riot-account-viewer:patch-notes:detail:';
const patchNoteSearchCachePrefix = 'riot-account-viewer:patch-notes:search:';
const inFlightPatchNoteSummaryRequest = { current: null as Promise<RiotPatchNoteSummary[]> | null };
const inFlightPatchNoteDetailRequests = new Map<string, Promise<RiotPatchNoteDetail | null>>();
const inFlightPatchNoteSearchRequests = new Map<string, Promise<RiotPatchNoteSearchResult[]>>();

function decodeHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const numericCode = Number(code);
      try {
        return Number.isInteger(numericCode) && numericCode > 0 ? String.fromCodePoint(numericCode) : '';
      } catch {
        return '';
      }
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => {
      const numericCode = Number.parseInt(code, 16);
      try {
        return Number.isInteger(numericCode) && numericCode > 0 ? String.fromCodePoint(numericCode) : '';
      } catch {
        return '';
      }
    })
    .replace(/\u00e2\u20ac\u2122/g, '\u2019')
    .replace(/\u00e2\u20ac\u0153/g, '\u201c')
    .replace(/\u00e2\u20ac\u009d/g, '\u201d')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u00a6/g, '\u2026')
    .replace(/\u00e2\u0080\u0099/g, '\u2019')
    .replace(/\u00e2\u0080\u009c/g, '\u201c')
    .replace(/\u00e2\u0080\u009d/g, '\u201d')
    .replace(/\u00e2\u0080\u0093/g, '\u2013')
    .replace(/\u00e2\u0080\u0094/g, '\u2014')
    .replace(/\u00e2\u0080\u00a6/g, '\u2026')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0x99), 'g'), '\u2019')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0x9c), 'g'), '\u201c')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0x9d), 'g'), '\u201d')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0x93), 'g'), '\u2013')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0x94), 'g'), '\u2014')
    .replace(new RegExp(String.fromCharCode(0xe2, 0x80, 0xa6), 'g'), '\u2026')
    .replace(/\s+/g, ' ')
    .trim();
}

function patchNoteSlugFromPath(path: string) {
  return path.split('/').filter(Boolean).pop() ?? '';
}

function parsePatchNoteSummary(path: string, rawTitle: string): RiotPatchNoteSummary {
  const titleText = decodeHtmlText(rawTitle);
  const publishedAt = titleText.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/i)?.[0] ?? '';
  const patchNumber = titleText.match(/\bPatch\s+(\d+(?:\.\d+)+)\s+Notes\b/i)?.[1] ?? 'Unknown';
  const titleMatch = titleText.match(/(?:League of Legends\s+)?Patch\s+\d+(?:\.\d+)+\s+Notes\b/i);
  const title = titleMatch?.[0]
    ?? titleText.replace(/^Game Updates\s*/i, '').replace(publishedAt, '').trim();
  const description = titleMatch
    ? titleText.slice((titleMatch.index ?? 0) + titleMatch[0].length).trim() || null
    : null;
  const href = `${PATCH_NOTES_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

  return {
    patchNumber,
    publishedAt,
    title,
    description,
    href,
    slug: patchNoteSlugFromPath(path),
  };
}

type ParsedHtmlBlock = RiotPatchNoteContentBlock & { tag: string };

function extractPatchNoteBlocks(html: string): ParsedHtmlBlock[] {
  const articleHtml = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ?? html;
  const contentHtml = articleHtml.replace(/<(script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const blocks: ParsedHtmlBlock[] = [];
  const blockPattern = /<(h[1-6]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of contentHtml.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase();
    const text = decodeHtmlText(match[2]);
    if (!text) continue;
    if (tag.startsWith('h')) {
      blocks.push({ kind: 'heading', level: Number(tag.slice(1)), text, tag });
    } else if (tag === 'li') {
      blocks.push({ kind: 'list', text, tag });
    } else {
      blocks.push({ kind: 'paragraph', text, tag });
    }
  }

  return blocks;
}

function isPatchNoteMetadataBlock(block: ParsedHtmlBlock, summary: RiotPatchNoteSummary) {
  return block.text === summary.title
    || block.text === summary.publishedAt
    || block.text === 'Game Updates'
    || /^Riot\s/i.test(block.text);
}

function parsePatchNoteDetail(html: string, summary: RiotPatchNoteSummary): RiotPatchNoteDetail {
  const blocks = extractPatchNoteBlocks(html);
  const titleIndex = blocks.findIndex((block) => block.tag === 'h1' || block.text === summary.title);
  const firstSectionIndex = blocks.findIndex((block, index) => index > titleIndex && block.kind === 'heading' && (block.level ?? 0) <= 2);
  const headerEndIndex = firstSectionIndex >= 0 ? firstSectionIndex : blocks.length;
  const headerBlocks = blocks.slice(Math.max(titleIndex + 1, 0), headerEndIndex).filter((block) => !isPatchNoteMetadataBlock(block, summary));
  const subtitleCandidate = headerBlocks.find((block) => block.kind === 'paragraph')?.text ?? null;
  const subtitle = subtitleCandidate && subtitleCandidate.length <= 220 ? subtitleCandidate : null;
  const intro = headerBlocks
    .filter((block) => block.kind === 'paragraph' && block.text !== subtitle)
    .map((block) => block.text);
  const contentBlocks = blocks
    .slice(firstSectionIndex >= 0 ? firstSectionIndex : Math.max(titleIndex + 1, 0))
    .filter((block) => !isPatchNoteMetadataBlock(block, summary))
    .map(({ tag: _tag, ...block }) => block);

  return {
    ...summary,
    subtitle,
    intro,
    blocks: contentBlocks,
  };
}

export async function getRiotPatchNotes(): Promise<RiotPatchNoteSummary[]> {
  const cached = getServerCache<RiotPatchNoteSummary[]>(patchNoteSummaryCacheKey);
  if (cached) return cached;
  if (inFlightPatchNoteSummaryRequest.current) return inFlightPatchNoteSummaryRequest.current;

  const request = (async () => {
    try {
      const response = await fetch(PATCH_NOTES_URL, { next: { revalidate: PATCH_NOTE_REVALIDATE_SECONDS } });
      if (!response.ok) return [];
      const html = await response.text();
      const notes: RiotPatchNoteSummary[] = [];
      const seen = new Set<string>();
      const linkPattern = /href=["'](\/en-us\/news\/game-updates\/[^"']*patch[^"']*-notes\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
      for (const match of html.matchAll(linkPattern)) {
        const path = match[1];
        if (!path || seen.has(path)) continue;
        seen.add(path);
        notes.push(parsePatchNoteSummary(path, match[2]));
        if (notes.length >= 12) break;
      }
      setServerCache(patchNoteSummaryCacheKey, notes, PATCH_NOTE_SUMMARY_CACHE_TTL_MS);
      return notes;
    } catch {
      return [];
    }
  })();

  inFlightPatchNoteSummaryRequest.current = request;
  const clearRequest = () => {
    if (inFlightPatchNoteSummaryRequest.current === request) inFlightPatchNoteSummaryRequest.current = null;
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function normalizePatchNoteSlug(value: string) {
  try {
    const decoded = decodeURIComponent(value).trim().replace(/^\/+|\/+$/g, '');
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export async function getRiotPatchNoteDetail(slug: string): Promise<RiotPatchNoteDetail | null> {
  const normalizedSlug = normalizePatchNoteSlug(slug);
  if (!normalizedSlug) return null;
  const cacheKey = `${patchNoteDetailCachePrefix}${normalizedSlug}`;
  const cached = getServerCache<RiotPatchNoteDetail>(cacheKey);
  if (cached) return cached;
  const existingRequest = inFlightPatchNoteDetailRequests.get(normalizedSlug);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    try {
      const href = `${PATCH_NOTES_ORIGIN}/en-us/news/game-updates/${normalizedSlug}/`;
      const response = await fetch(href, { next: { revalidate: PATCH_NOTE_REVALIDATE_SECONDS } });
      if (!response.ok) return null;
      const html = await response.text();
      const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? `League of Legends Patch ${normalizedSlug}`;
      const publishedAt = html.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/i)?.[0] ?? '';
      const summary = parsePatchNoteSummary(`/en-us/news/game-updates/${normalizedSlug}/`, `${publishedAt} ${decodeHtmlText(h1)}`);
      const detail = parsePatchNoteDetail(html, summary);
      setServerCache(cacheKey, detail, PATCH_NOTE_DETAIL_CACHE_TTL_MS);
      return detail;
    } catch {
      return null;
    }
  })();

  inFlightPatchNoteDetailRequests.set(normalizedSlug, request);
  const clearRequest = () => {
    if (inFlightPatchNoteDetailRequests.get(normalizedSlug) === request) inFlightPatchNoteDetailRequests.delete(normalizedSlug);
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function getPatchNoteSearchMatches(detail: RiotPatchNoteDetail, query: string): RiotPatchNoteSearchMatch[] {
  const normalizedQuery = query.toLowerCase();
  const matches: RiotPatchNoteSearchMatch[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  const seen = new Set<string>();

  detail.blocks.forEach((block, index) => {
    if (block.kind === 'heading') {
      const level = block.level ?? 6;
      while (headingStack.length > 0 && (headingStack[headingStack.length - 1]?.level ?? 6) >= level) headingStack.pop();
      headingStack.push({ level, text: block.text });

      if (!block.text.toLowerCase().includes(normalizedQuery)) return;
      const nextSectionIndex = detail.blocks.findIndex((candidate, candidateIndex) => (
        candidateIndex > index
        && candidate.kind === 'heading'
        && (candidate.level ?? 6) <= level
      ));
      const endIndex = nextSectionIndex >= 0 ? nextSectionIndex : detail.blocks.length;
      const excerpts = detail.blocks
        .slice(index + 1, endIndex)
        .filter((candidate) => candidate.kind !== 'heading')
        .map((candidate) => candidate.text)
        .slice(0, 8);
      const heading = headingStack.map((item) => item.text).join(' / ');
      if (!seen.has(heading)) {
        seen.add(heading);
        matches.push({ heading, excerpts });
      }
      return;
    }

    if (!block.text.toLowerCase().includes(normalizedQuery)) return;
    const heading = headingStack.length > 0
      ? headingStack.map((item) => item.text).join(' / ')
      : 'Patch overview';
    const existing = matches.find((match) => match.heading === heading);
    if (existing) {
      if (!existing.excerpts.includes(block.text) && existing.excerpts.length < 8) existing.excerpts.push(block.text);
    } else {
      matches.push({ heading, excerpts: [block.text] });
      seen.add(heading);
    }
  });

  return matches.slice(0, 8);
}

export async function searchRiotPatchNotes(query: string): Promise<RiotPatchNoteSearchResult[]> {
  const normalizedQuery = query.trim().slice(0, 80).toLowerCase();
  if (normalizedQuery.length < 2) return [];
  const cacheKey = `${patchNoteSearchCachePrefix}${normalizedQuery}`;
  const cached = getServerCache<RiotPatchNoteSearchResult[]>(cacheKey);
  if (cached) return cached;
  const existingRequest = inFlightPatchNoteSearchRequests.get(normalizedQuery);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const notes = await getRiotPatchNotes();
    const details = await Promise.all(notes.map((note) => getRiotPatchNoteDetail(note.slug)));
    const results = details
      .map((detail, index) => {
        if (!detail) return null;
        const matches = getPatchNoteSearchMatches(detail, normalizedQuery);
        return matches.length > 0 ? { note: notes[index], matches } : null;
      })
      .filter((result): result is RiotPatchNoteSearchResult => result !== null);
    setServerCache(cacheKey, results, PATCH_NOTE_SEARCH_CACHE_TTL_MS);
    return results;
  })();

  inFlightPatchNoteSearchRequests.set(normalizedQuery, request);
  const clearRequest = () => {
    if (inFlightPatchNoteSearchRequests.get(normalizedQuery) === request) inFlightPatchNoteSearchRequests.delete(normalizedQuery);
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

export async function getRiotAccountSearchSuggestions(query: string, platform?: RiotPlatformRoute) {
  try {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) return [];

    let request = getSupabaseServiceClient()
      .from('riot_account_searches')
      .select('riot_id, platform, search_count')
      .ilike('riot_id_normalized', `${normalizedQuery}%`)
      .order('search_count', { ascending: false })
      .order('last_searched_at', { ascending: false })
      .limit(8);

    if (platform) {
      request = request.eq('platform', platform);
    }

    const { data, error } = await request;
    if (error) return [];

    return (data ?? [])
      .filter((row): row is { riot_id: string; platform: RiotPlatformRoute; search_count: number } => (
        typeof row.riot_id === 'string'
        && isRiotPlatformRoute(row.platform)
        && typeof row.search_count === 'number'
      ))
      .map<RiotAccountSearchSuggestion>((row) => ({
        riotId: row.riot_id,
        platform: row.platform,
        searchCount: row.search_count,
      }));
  } catch {
    return [];
  }
}

async function recordRiotAccountProfileMetrics(input: {
  puuid: string;
  riotId: string;
  platform: RiotPlatformRoute;
  summonerLevel: number;
  totalMasteryPoints: number;
  challengePoints: number;
  soloRankScore: number | null;
  flexRankScore: number | null;
}) {
  try {
    await getSupabaseServiceClient()
      .from('riot_account_profile_metrics')
      .upsert({
        puuid: input.puuid,
        platform: input.platform,
        riot_id: input.riotId,
        riot_id_normalized: input.riotId.toLowerCase(),
        summoner_level: input.summonerLevel,
        total_mastery_points: input.totalMasteryPoints,
        challenge_points: input.challengePoints,
        solo_rank_score: input.soloRankScore,
        flex_rank_score: input.flexRankScore,
        last_searched_at: new Date().toISOString(),
      }, {
        onConflict: 'puuid,platform',
      });
  } catch {
    // KnowLeague analytics are best-effort and should not block Riot data.
  }
}

async function getCountWhere(column: string, operator: 'gte' | 'not.is', value: number | null, platform?: RiotPlatformRoute) {
  let request = getSupabaseServiceClient()
    .from('riot_account_profile_metrics')
    .select('puuid', { count: 'exact', head: true });

  if (platform) request = request.eq('platform', platform);
  if (operator === 'gte') request = request.gte(column, value ?? 0);
  if (operator === 'not.is') request = request.not(column, 'is', null);

  const { count, error } = await request;
  if (error) return null;
  return count ?? 0;
}

function toTopPercent(rank: number, sampleSize: number) {
  if (sampleSize <= 0) return null;
  return Math.max(0.1, Math.round((rank / sampleSize) * 1000) / 10);
}

async function getMetricTopPercent(column: 'total_mastery_points' | 'challenge_points', value: number) {
  try {
    const [sampleSize, aheadOrTied] = await Promise.all([
      getCountWhere(column, 'gte', 0),
      getCountWhere(column, 'gte', value),
    ]);
    if (!sampleSize || aheadOrTied === null) return { sampleSize: sampleSize ?? 0, topPercent: null };
    return { sampleSize, topPercent: toTopPercent(aheadOrTied, sampleSize) };
  } catch {
    return { sampleSize: 0, topPercent: null };
  }
}

async function getRankedPlacement(platform: RiotPlatformRoute, queue: RankedQueueKey, rankScore: number | null) {
  if (rankScore === null) return null;

  const column = queue === 'solo' ? 'solo_rank_score' : 'flex_rank_score';
  try {
    const [sampleSize, aheadOrTied] = await Promise.all([
      getCountWhere(column, 'not.is', null, platform),
      getCountWhere(column, 'gte', rankScore, platform),
    ]);
    if (!sampleSize || aheadOrTied === null) return null;
    return {
      regionalRank: aheadOrTied,
      topPercent: toTopPercent(aheadOrTied, sampleSize) ?? 0,
      sampleSize,
    };
  } catch {
    return null;
  }
}

function getRiotApiKey() {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error('Riot API key is not configured. Add RIOT_API_KEY to the server environment.');
  }
  return apiKey;
}

export async function riotFetch<T>(url: string): Promise<T>;
export async function riotFetch<T>(url: string, options: { optional404: true }): Promise<T | null>;
export async function riotFetch<T>(url: string, options?: { optional404?: boolean }): Promise<T | null> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      [RIOT_API_KEY_HEADER]: getRiotApiKey(),
    },
  });

  if (response.status === 404 && options?.optional404) {
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Riot account data not found for that Riot ID and region.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Riot API rejected the configured API key.');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new Error(retryAfter
        ? `Riot API rate limit reached. Try again in ${retryAfter} seconds.`
        : 'Riot API rate limit reached. Try again in a moment.');
    }
    throw new Error(`Riot API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchDataDragonJson<T>(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) {
    throw new Error(`Data Dragon request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function getDataDragonVersion() {
  cachedDataDragonVersion ??= fetchDataDragonJson<string[]>(DATA_DRAGON_VERSIONS_URL).then((versions) => versions[0] ?? '14.24.1');
  return cachedDataDragonVersion;
}

async function getChampionLookup() {
  cachedChampionLookup ??= (async () => {
    const version = await getDataDragonVersion();
    const json = await fetchDataDragonJson<DataDragonChampionResponse>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    );
    return new Map(
      Object.values(json.data).map((champion) => {
        const numericId = Number(champion.key);
        return [
          numericId,
          {
            id: numericId,
            key: champion.id,
            name: champion.name,
            title: champion.title,
            tags: champion.tags,
            imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
          },
        ];
      }),
    );
  })();
  return cachedChampionLookup;
}

async function getSummonerSpellLookup() {
  cachedSummonerSpellLookup ??= (async () => {
    const version = await getDataDragonVersion();
    const json = await fetchDataDragonJson<DataDragonSummonerSpellResponse>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
    );
    return new Map(
      Object.values(json.data).map((spell) => [
        Number(spell.key),
        {
          name: spell.name,
          imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image.full}`,
        },
      ]),
    );
  })();
  return cachedSummonerSpellLookup;
}

async function getRuneLookup() {
  cachedRuneLookup ??= (async () => {
    const version = await getDataDragonVersion();
    const json = await fetchDataDragonJson<DataDragonRune[]>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
    );
    const runes = new Map<number, { name: string; imageUrl: string }>();
    json.forEach((style) => {
      runes.set(style.id, {
        name: style.name,
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`,
      });
      style.slots.forEach((slot) => {
        slot.runes.forEach((rune) => {
          runes.set(rune.id, {
            name: rune.name,
            imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`,
          });
        });
      });
    });
    return runes;
  })();
  return cachedRuneLookup;
}

async function getItemLookup() {
  cachedItemLookup ??= (async () => {
    const version = await getDataDragonVersion();
    const json = await fetchDataDragonJson<DataDragonItemResponse>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    );
    return new Map(
      Object.entries(json.data).map(([itemId, item]) => [
        Number(itemId),
        {
          name: item.name,
          description: stripRichText(item.description),
          plaintext: item.plaintext?.trim() || null,
          imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image.full}`,
        },
      ]),
    );
  })();
  return cachedItemLookup;
}

function getChampion(champions: Map<number, RiotChampionSummary>, championId: number): RiotChampionSummary {
  return champions.get(championId) ?? {
    id: championId,
    key: String(championId),
    name: `Champion ${championId}`,
    title: 'Unknown champion',
    tags: [],
    imageUrl: '',
  };
}

function profileIconUrl(profileIconId: number, version: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}

function itemIconUrl(itemId: number, version: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

function withWinRate(entry: RiotLeagueEntryDto) {
  const games = entry.wins + entry.losses;
  return {
    ...entry,
    winRate: games > 0 ? Math.round((entry.wins / games) * 1000) / 10 : 0,
  };
}

const tierScores: Record<string, number> = {
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 3200,
  CHALLENGER: 3600,
};

const divisionScores: Record<string, number> = {
  IV: 0,
  III: 100,
  II: 200,
  I: 300,
};

function getRankScore(entry: RiotLeagueEntryDto | undefined) {
  if (!entry) return null;
  const tierScore = tierScores[entry.tier] ?? null;
  if (tierScore === null) return null;
  const divisionScore = entry.tier === 'MASTER' || entry.tier === 'GRANDMASTER' || entry.tier === 'CHALLENGER'
    ? 0
    : divisionScores[entry.rank] ?? 0;
  return tierScore + divisionScore + entry.leaguePoints;
}

function normalizeMastery(mastery: RiotChampionMasteryDto, champions: Map<number, RiotChampionSummary>): RiotAccountViewerMastery {
  return {
    champion: getChampion(champions, mastery.championId),
    championLevel: mastery.championLevel,
    championPoints: mastery.championPoints,
    lastPlayTime: mastery.lastPlayTime,
    championPointsSinceLastLevel: mastery.championPointsSinceLastLevel,
    championPointsUntilNextLevel: mastery.championPointsUntilNextLevel,
    chestGranted: mastery.chestGranted,
    tokensEarned: mastery.tokensEarned ?? null,
    markRequiredForNextLevel: mastery.markRequiredForNextLevel ?? null,
  };
}

function normalizeParticipant(
  participant: RiotParticipantDto,
  puuid: string,
  champions: Map<number, RiotChampionSummary>,
  summonerSpells: Map<number, { name: string; imageUrl: string }>,
  runes: Map<number, { name: string; imageUrl: string }>,
  items: Map<number, { name: string; description: string; plaintext: string | null; imageUrl: string }>,
  ranks: Map<string, { tier: string; rank: string; queueType: string }>,
  version: string,
): RiotAccountViewerMatchParticipant {
  const spellIds = [participant.summoner1Id, participant.summoner2Id];
  const runeIds = [
    participant.perks?.styles?.[0]?.selections?.[0]?.perk,
    participant.perks?.styles?.[1]?.style,
  ].filter((runeId): runeId is number => typeof runeId === 'number');
  const position = normalizeParticipantPosition(participant.teamPosition || participant.individualPosition);

  return {
    puuid: participant.puuid,
    riotId: participant.riotIdGameName && participant.riotIdTagline
      ? `${participant.riotIdGameName}#${participant.riotIdTagline}`
      : participant.riotIdGameName ?? 'Unknown player',
    champion: getChampion(champions, participant.championId),
    teamId: participant.teamId,
    position,
    win: participant.win,
    championLevel: participant.champLevel,
    rank: ranks.get(participant.puuid) ?? null,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    goldEarned: participant.goldEarned,
    goldSpent: participant.goldSpent,
    creepScore: participant.totalMinionsKilled + participant.neutralMinionsKilled,
    damageDealt: participant.totalDamageDealt,
    damageToChampions: participant.totalDamageDealtToChampions,
    damageTaken: participant.totalDamageTaken,
    damageToObjectives: participant.damageDealtToObjectives,
    damageToTurrets: participant.damageDealtToTurrets,
    visionScore: participant.visionScore,
    wardsPlaced: participant.wardsPlaced,
    wardsKilled: participant.wardsKilled,
    controlWardsPlaced: participant.detectorWardsPlaced,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ].map((itemId, slot) => ({ itemId, slot })).filter(({ itemId }) => itemId > 0).map(({ itemId, slot }) => {
      const item = items.get(itemId);
      return {
        id: itemId,
        slot,
        name: item?.name ?? `Item ${itemId}`,
        description: item?.description ?? '',
        plaintext: item?.plaintext ?? null,
        imageUrl: item?.imageUrl ?? itemIconUrl(itemId, version),
      };
    }),
    summonerSpells: spellIds.map((spellId) => {
      const spell = summonerSpells.get(spellId);
      return {
        id: spellId,
        name: spell?.name ?? `Spell ${spellId}`,
        imageUrl: spell?.imageUrl ?? '',
      };
    }),
    runes: runeIds.map((runeId) => {
      const rune = runes.get(runeId);
      return {
        id: runeId,
        name: rune?.name ?? `Rune ${runeId}`,
        imageUrl: rune?.imageUrl ?? '',
      };
    }),
    multikills: {
      double: participant.doubleKills,
      triple: participant.tripleKills,
      quadra: participant.quadraKills,
      penta: participant.pentaKills,
    },
    isSearchedPlayer: participant.puuid === puuid,
  };
}

function normalizeTeam(team: RiotTeamDto, participants: RiotAccountViewerMatchParticipant[]): RiotAccountViewerMatchTeam {
  const teamParticipants = participants.filter((participant) => participant.teamId === team.teamId);
  return {
    teamId: team.teamId,
    win: team.win,
    kills: teamParticipants.reduce((sum, participant) => sum + participant.kills, 0),
    goldEarned: teamParticipants.reduce((sum, participant) => sum + participant.goldEarned, 0),
    damageToChampions: teamParticipants.reduce((sum, participant) => sum + participant.damageToChampions, 0),
    creepScore: teamParticipants.reduce((sum, participant) => sum + participant.creepScore, 0),
    visionScore: teamParticipants.reduce((sum, participant) => sum + participant.visionScore, 0),
    objectives: {
      baron: team.objectives.baron?.kills ?? 0,
      champion: team.objectives.champion?.kills ?? 0,
      dragon: team.objectives.dragon?.kills ?? 0,
      horde: team.objectives.horde?.kills ?? 0,
      inhibitor: team.objectives.inhibitor?.kills ?? 0,
      riftHerald: team.objectives.riftHerald?.kills ?? 0,
      tower: team.objectives.tower?.kills ?? 0,
    },
    participants: teamParticipants,
  };
}

function normalizeParticipantPosition(position: string | null | undefined) {
  const normalized = (position ?? '').trim().toUpperCase();
  if (!normalized || normalized === 'INVALID' || normalized === 'UNKNOWN' || normalized === 'NONE') return '';
  return normalized === 'UTILITY' ? 'SUPPORT' : normalized;
}

function normalizeFallbackTeam(teamId: number, participants: RiotAccountViewerMatchParticipant[]): RiotAccountViewerMatchTeam {
  const teamParticipants = participants.filter((participant) => participant.teamId === teamId);
  return {
    teamId,
    win: teamParticipants.some((participant) => participant.win),
    kills: teamParticipants.reduce((sum, participant) => sum + participant.kills, 0),
    goldEarned: teamParticipants.reduce((sum, participant) => sum + participant.goldEarned, 0),
    damageToChampions: teamParticipants.reduce((sum, participant) => sum + participant.damageToChampions, 0),
    creepScore: teamParticipants.reduce((sum, participant) => sum + participant.creepScore, 0),
    visionScore: teamParticipants.reduce((sum, participant) => sum + participant.visionScore, 0),
    objectives: {
      baron: 0,
      champion: 0,
      dragon: 0,
      horde: 0,
      inhibitor: 0,
      riftHerald: 0,
      tower: 0,
    },
    participants: teamParticipants,
  };
}

function normalizeMatch(
  match: RiotMatchDto,
  puuid: string,
  champions: Map<number, RiotChampionSummary>,
  summonerSpells: Map<number, { name: string; imageUrl: string }>,
  runes: Map<number, { name: string; imageUrl: string }>,
  items: Map<number, { name: string; description: string; plaintext: string | null; imageUrl: string }>,
  ranks: Map<string, { tier: string; rank: string; queueType: string }>,
  version: string,
) {
  const participant = match.info.participants.find((candidate) => candidate.puuid === puuid);
  if (!participant) return null;
  const participants = match.info.participants.map((candidate) => normalizeParticipant(candidate, puuid, champions, summonerSpells, runes, items, ranks, version));
  const teams = match.info.teams.map((team) => normalizeTeam(team, participants));
  const representedTeamIds = new Set(teams.map((team) => team.teamId));
  const fallbackTeams = Array.from(new Set(participants.map((candidate) => candidate.teamId)))
    .filter((teamId) => !representedTeamIds.has(teamId))
    .map((teamId) => normalizeFallbackTeam(teamId, participants));

  return {
    matchId: match.metadata.matchId,
    gameCreation: match.info.gameCreation,
    gameStartTimestamp: match.info.gameStartTimestamp ?? null,
    gameEndTimestamp: match.info.gameEndTimestamp ?? null,
    gameDuration: match.info.gameDuration,
    gameMode: match.info.gameMode,
    gameType: match.info.gameType,
    gameVersion: match.info.gameVersion,
    mapId: match.info.mapId,
    queueId: match.info.queueId,
    champion: getChampion(champions, participant.championId),
    position: normalizeParticipantPosition(participant.teamPosition || participant.individualPosition),
    win: participant.win,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    goldEarned: participant.goldEarned,
    creepScore: participant.totalMinionsKilled + participant.neutralMinionsKilled,
    damageToChampions: participant.totalDamageDealtToChampions,
    visionScore: participant.visionScore,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ].filter((itemId) => itemId > 0),
    summonerSpells: [participant.summoner1Id, participant.summoner2Id],
    teams: [...teams, ...fallbackTeams],
  };
}

function isPubliclyDisplayableMatch(match: RiotMatchDto) {
  return match.info.gameType !== 'CUSTOM_GAME' && match.info.queueId !== 0;
}

function getLocalizedChallengeField(
  values: RiotChallengeConfigDto['localizedNames'],
  field: 'name' | 'description' | 'shortDescription',
) {
  if (!values) {
    return null;
  }

  const localizedValue = values.en_US ?? values['en-US'] ?? Object.values(values)[0];
  if (!localizedValue) {
    return null;
  }
  if (typeof localizedValue === 'string') {
    return localizedValue;
  }

  return localizedValue[field] ?? null;
}

async function getChallengeConfigLookup(platform: RiotPlatformRoute) {
  try {
    const configs = await riotFetch<RiotChallengeConfigDto[]>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/challenges/v1/challenges/config`,
    );
    return new Map(configs.flatMap((config) => {
      const id = config.id ?? config.challengeId;
      if (!id) {
        return [];
      }

      return [[id, {
        name: getLocalizedChallengeField(config.localizedNames, 'name'),
        description: getLocalizedChallengeField(config.localizedDescriptions, 'description')
          ?? getLocalizedChallengeField(config.localizedNames, 'description')
          ?? getLocalizedChallengeField(config.localizedNames, 'shortDescription'),
      }]];
    }));
  } catch {
    return new Map<number, { name: string | null; description: string | null }>();
  }
}

function normalizeChallenges(
  challenges: RiotChallengesDto | null,
  challengeConfigLookup: Map<number, { name: string | null; description: string | null }>,
): RiotAccountViewerResponse['challenges'] {
  if (!challenges) return null;

  const categoryPoints = Object.entries(challenges.categoryPoints ?? {}).map(([category, points]) => ({
    category,
    level: points.level ?? null,
    current: points.current ?? null,
    max: points.max ?? null,
    percentile: points.percentile ?? null,
  }));

  const topChallenges = [...(challenges.challenges ?? [])]
    .sort((left, right) => {
      const leftPercentile = left.percentile ?? Number.POSITIVE_INFINITY;
      const rightPercentile = right.percentile ?? Number.POSITIVE_INFINITY;
      return leftPercentile - rightPercentile;
    })
    .slice(0, 20)
    .map((challenge) => {
      const config = challengeConfigLookup.get(challenge.challengeId);
      return {
        challengeId: challenge.challengeId,
        name: config?.name ?? null,
        description: config?.description ?? null,
        level: challenge.level ?? null,
        value: challenge.value ?? null,
        percentile: challenge.percentile ?? null,
        achievedTime: challenge.achievedTime ?? null,
      };
    });

  return {
    totalPoints: challenges.totalPoints ?? null,
    categoryPoints,
    topChallenges,
  };
}

function normalizeCurrentGame(
  currentGame: RiotCurrentGameDto | null,
  puuid: string,
  champions: Map<number, RiotChampionSummary>,
): RiotAccountViewerResponse['currentGame'] {
  if (!currentGame) return null;

  const participants = currentGame.participants.map((participant) => ({
    champion: getChampion(champions, participant.championId),
    teamId: participant.teamId,
    isSearchedPlayer: participant.puuid === puuid,
  }));

  return {
    gameId: currentGame.gameId,
    gameStartTime: currentGame.gameStartTime,
    gameLength: currentGame.gameLength,
    gameMode: currentGame.gameMode,
    gameType: currentGame.gameType,
    mapId: currentGame.mapId,
    queueId: currentGame.gameQueueConfigId,
    playerChampion: participants.find((participant) => participant.isSearchedPlayer)?.champion ?? null,
    participants,
  };
}

export async function getRiotLiveGameStatus(riotId: string, platform: RiotPlatformRoute): Promise<RiotLiveGameStatus> {
  const parsed = parseRiotId(riotId);
  const regionalRoute = getRegionalRoute(platform);
  const encodedGameName = encodeURIComponent(parsed.gameName);
  const encodedTagLine = encodeURIComponent(parsed.tagLine);

  const account = await riotFetch<RiotAccountDto>(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedGameName}/${encodedTagLine}`,
  );
  const canonicalRiotId = `${account.gameName ?? parsed.gameName}#${account.tagLine ?? parsed.tagLine}`;
  const currentGame = await riotFetch<RiotCurrentGameDto>(
    `https://${platform.toLowerCase()}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(account.puuid)}`,
    { optional404: true },
  );

  if (!currentGame) {
    return {
      riotId: canonicalRiotId,
      platform,
      inGame: false,
      gameId: null,
      gameStartTime: null,
      gameLength: null,
      champion: null,
      currentGame: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const champions = await getChampionLookup();
  const participant = currentGame.participants.find((currentParticipant) => currentParticipant.puuid === account.puuid);
  const normalizedCurrentGame = normalizeCurrentGame(currentGame, account.puuid, champions);

  return {
    riotId: canonicalRiotId,
    platform,
    inGame: true,
    gameId: currentGame.gameId,
    gameStartTime: currentGame.gameStartTime,
    gameLength: currentGame.gameLength,
    champion: participant ? getChampion(champions, participant.championId) : null,
    currentGame: normalizedCurrentGame,
    updatedAt: new Date().toISOString(),
  };
}

export async function getMasteryMasterProfile(riotId: string, platform: RiotPlatformRoute): Promise<MasteryMasterProfile> {
  const parsed = parseRiotId(riotId);
  const regionalRoute = getRegionalRoute(platform);
  const encodedGameName = encodeURIComponent(parsed.gameName);
  const encodedTagLine = encodeURIComponent(parsed.tagLine);
  const account = await riotFetch<RiotAccountDto>(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedGameName}/${encodedTagLine}`,
  );
  const [champions, masteries] = await Promise.all([
    getChampionLookup(),
    riotFetch<RiotChampionMasteryDto[]>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(account.puuid)}`,
    ),
  ]);

  return {
    riotId: `${account.gameName ?? parsed.gameName}#${account.tagLine ?? parsed.tagLine}`,
    platform,
    champions: masteries
      .map((mastery) => {
        const champion = getChampion(champions, mastery.championId);
        return {
          id: champion.id,
          key: champion.key,
          name: champion.name,
          title: champion.title,
          imageUrl: champion.imageUrl,
          splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.key}_0.jpg`,
          championLevel: mastery.championLevel,
          championPoints: mastery.championPoints,
        };
      })
      .filter((champion) => champion.id > 0)
      .sort((left, right) => right.championPoints - left.championPoints),
  };
}

async function getMatchDetails(matchIds: string[], regionalRoute: RiotRegionalRoute) {
  const matches: RiotMatchDto[] = [];

  for (let index = 0; index < matchIds.length; index += MATCH_DETAIL_BATCH_SIZE) {
    const batch = matchIds.slice(index, index + MATCH_DETAIL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((matchId) => riotFetch<RiotMatchDto>(
        `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      )),
    );
    matches.push(...results);

    if (index + MATCH_DETAIL_BATCH_SIZE < matchIds.length) {
      await delay(MATCH_DETAIL_BATCH_DELAY_MS);
    }
  }

  return matches;
}

function preferredParticipantRank(entries: RiotLeagueEntryDto[] | null | undefined): ParticipantRank | null {
  const soloQueue = entries?.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
  const flexQueue = entries?.find((entry) => entry.queueType === 'RANKED_FLEX_SR');
  const entry = soloQueue ?? flexQueue;
  return entry ? { tier: entry.tier, rank: entry.rank, queueType: entry.queueType } : null;
}

async function getParticipantRank(puuid: string, platform: RiotPlatformRoute) {
  const cacheKey = `riot-participant-rank:${platform}:${puuid}`;
  const cached = getServerCache<CachedParticipantRank>(cacheKey);
  if (cached) return cached.rank;

  const existingRequest = inFlightParticipantRanks.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = riotFetch<RiotLeagueEntryDto[]>(
    `https://${platform.toLowerCase()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    { optional404: true },
  )
    .then(preferredParticipantRank)
    .catch(() => null);

  inFlightParticipantRanks.set(cacheKey, request);
  void request.then((rank) => {
    setServerCache<CachedParticipantRank>(cacheKey, { rank }, PARTICIPANT_RANK_CACHE_TTL_MS);
  }).finally(() => {
    if (inFlightParticipantRanks.get(cacheKey) === request) {
      inFlightParticipantRanks.delete(cacheKey);
    }
  });
  return request;
}

async function getParticipantRankLookup(
  matches: RiotMatchDto[],
  platform: RiotPlatformRoute,
  searchedPuuid: string,
  searchedPlayerEntries: RiotLeagueEntryDto[],
) {
  const ranks = new Map<string, ParticipantRank>();
  const searchedPlayerRank = preferredParticipantRank(searchedPlayerEntries);
  if (searchedPlayerRank) ranks.set(searchedPuuid, searchedPlayerRank);

  const puuids = Array.from(new Set(matches.flatMap((match) => match.info.participants.map((participant) => participant.puuid))))
    .filter((puuid) => puuid !== searchedPuuid);

  for (let index = 0; index < puuids.length; index += MATCH_DETAIL_BATCH_SIZE) {
    const batch = puuids.slice(index, index + MATCH_DETAIL_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (puuid) => {
      const rank = await getParticipantRank(puuid, platform);
      return { puuid, rank };
    }));

    results.forEach(({ puuid, rank }) => {
      if (rank) ranks.set(puuid, rank);
    });

    if (index + MATCH_DETAIL_BATCH_SIZE < puuids.length) {
      await delay(MATCH_DETAIL_BATCH_DELAY_MS);
    }
  }

  return ranks;
}

export async function getRiotAccountViewerData(riotId: string, platform: RiotPlatformRoute): Promise<RiotAccountViewerResponse> {
  const parsed = parseRiotId(riotId);
  const account = await getRiotAccountByRiotId(parsed.gameName, parsed.tagLine, platform);

  return getRiotAccountViewerDataFromAccount(account, platform, parsed.gameName, parsed.tagLine);
}

async function getRiotAccountByRiotId(gameName: string, tagLine: string, platform: RiotPlatformRoute) {
  const regionalRoute = getRegionalRoute(platform);
  return riotFetch<RiotAccountDto>(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

async function getRiotAccountByPuuid(puuid: string, platform: RiotPlatformRoute) {
  const regionalRoute = getRegionalRoute(platform);
  return riotFetch<RiotAccountDto>(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`,
  );
}

function isRiotIdLookupNotFound(error: unknown) {
  return error instanceof Error && error.message === 'Riot account data not found for that Riot ID and region.';
}

type StoredRiotTokenPlayerName = {
  puuid: string;
  platform: RiotPlatformRoute;
  riot_id: string;
  game_name: string;
  tag_line: string;
};

async function getStoredRiotTokenPlayerName(puuid: string, platform: RiotPlatformRoute): Promise<StoredRiotTokenPlayerName | null> {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from('riot_token_player_names')
      .select('puuid, platform, riot_id, game_name, tag_line')
      .eq('puuid', puuid)
      .eq('platform', platform)
      .maybeSingle<StoredRiotTokenPlayerName>();

    return error ? null : data;
  } catch {
    return null;
  }
}

export async function getRiotAccountViewerDataByPuuid(puuid: string, platform: RiotPlatformRoute): Promise<RiotAccountViewerResponse> {
  const normalizedPuuid = puuid.trim();
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(normalizedPuuid)) {
    throw new Error('The PUUID is invalid.');
  }

  const storedName = await getStoredRiotTokenPlayerName(normalizedPuuid, platform);
  const loadByPuuid = async () => {
    const account = await getRiotAccountByPuuid(normalizedPuuid, platform);
    if (!account.gameName?.trim() || !account.tagLine?.trim()) {
      throw new Error('Riot did not return a Riot ID for that PUUID.');
    }

    return getRiotAccountViewerDataFromAccount(account, platform, account.gameName.trim(), account.tagLine.trim());
  };

  if (!storedName) {
    return loadByPuuid();
  }

  try {
    const account = await getRiotAccountByRiotId(storedName.game_name, storedName.tag_line, platform);
    if (account.puuid !== normalizedPuuid) {
      return loadByPuuid();
    }

    return getRiotAccountViewerDataFromAccount(account, platform, storedName.game_name, storedName.tag_line);
  } catch (error) {
    if (!isRiotIdLookupNotFound(error)) throw error;
    return loadByPuuid();
  }
}

async function getRiotAccountViewerDataFromAccount(account: RiotAccountDto, platform: RiotPlatformRoute, fallbackGameName: string, fallbackTagLine: string): Promise<RiotAccountViewerResponse> {
  const regionalRoute = getRegionalRoute(platform);

  const summoner = await riotFetch<RiotSummonerDto>(
    `https://${platform.toLowerCase()}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(account.puuid)}`,
  );

  const [version, champions, summonerSpells, runes, items, masteries, ranked, challengeData, challengeConfigLookup, currentGame, matchIds] = await Promise.all([
    getDataDragonVersion(),
    getChampionLookup(),
    getSummonerSpellLookup(),
    getRuneLookup(),
    getItemLookup(),
    riotFetch<RiotChampionMasteryDto[]>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(account.puuid)}`,
    ),
    riotFetch<RiotLeagueEntryDto[]>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(account.puuid)}`,
    ),
    riotFetch<RiotChallengesDto>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/challenges/v1/player-data/${encodeURIComponent(account.puuid)}`,
      { optional404: true },
    ),
    getChallengeConfigLookup(platform),
    riotFetch<RiotCurrentGameDto>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(account.puuid)}`,
      { optional404: true },
    ),
    riotFetch<string[]>(
      `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?start=0&count=${MATCH_COUNT}`,
    ),
  ]);

  const matches = (await getMatchDetails(matchIds, regionalRoute)).filter(isPubliclyDisplayableMatch);
  const participantRanks = await getParticipantRankLookup(matches, platform, account.puuid, ranked);

  const normalizedMatches = matches
    .map((match) => normalizeMatch(match, account.puuid, champions, summonerSpells, runes, items, participantRanks, version))
    .filter((match): match is RiotAccountViewerMatch => Boolean(match));
  const normalizedMasteries = masteries.map((mastery) => normalizeMastery(mastery, champions));
  const normalizedRanked = ranked.map(withWinRate);
  const soloQueue = normalizedRanked.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
  const flexQueue = normalizedRanked.find((entry) => entry.queueType === 'RANKED_FLEX_SR');
  const soloRankScore = getRankScore(soloQueue);
  const flexRankScore = getRankScore(flexQueue);
  const recentWins = normalizedMatches.filter((match) => match.win).length;
  const totalMasteryPoints = normalizedMasteries.reduce((sum, mastery) => sum + mastery.championPoints, 0);
  const challengePoints = challengeData?.totalPoints?.current ?? 0;
  const canonicalRiotId = `${account.gameName ?? fallbackGameName}#${account.tagLine ?? fallbackTagLine}`;

  void recordRiotAccountProfileMetrics({
    puuid: account.puuid,
    riotId: canonicalRiotId,
    platform,
    summonerLevel: summoner.summonerLevel,
    totalMasteryPoints,
    challengePoints,
    soloRankScore,
    flexRankScore,
  });

  const [masteryPercentile, challengePercentile, soloPlacement, flexPlacement] = await Promise.all([
    getMetricTopPercent('total_mastery_points', totalMasteryPoints),
    getMetricTopPercent('challenge_points', challengePoints),
    getRankedPlacement(platform, 'solo', soloRankScore),
    getRankedPlacement(platform, 'flex', flexRankScore),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    searchedRiotId: canonicalRiotId,
    platform,
    regionalRoute,
    account: {
      puuid: account.puuid,
      gameName: account.gameName ?? fallbackGameName,
      tagLine: account.tagLine ?? fallbackTagLine,
    },
    summoner: {
      id: summoner.id,
      profileIconId: summoner.profileIconId,
      profileIconUrl: profileIconUrl(summoner.profileIconId, version),
      summonerLevel: summoner.summonerLevel,
      revisionDate: summoner.revisionDate,
    },
    ranked: normalizedRanked,
    masteries: normalizedMasteries,
    matches: normalizedMatches,
    currentGame: normalizeCurrentGame(currentGame, account.puuid, champions),
    challenges: normalizeChallenges(challengeData, challengeConfigLookup),
    summary: {
      totalMasteryPoints,
      topChampion: normalizedMasteries[0]?.champion ?? null,
      recentWinRate: normalizedMatches.length > 0 ? Math.round((recentWins / normalizedMatches.length) * 1000) / 10 : null,
      matchSampleSize: normalizedMatches.length,
    },
    analytics: {
      sampleSize: Math.max(masteryPercentile.sampleSize, challengePercentile.sampleSize),
      totalMasteryTopPercent: masteryPercentile.topPercent,
      challengePointsTopPercent: challengePercentile.topPercent,
      rankedPlacements: {
        solo: soloPlacement,
        flex: flexPlacement,
      },
    },
  };
}

export async function cacheRiotTokenPlayerName(
  account: { puuid: string; gameName?: string; tagLine?: string },
  platform: RiotPlatformRoute,
) {
  const gameName = account.gameName?.trim();
  const tagLine = account.tagLine?.trim();
  if (!gameName || !tagLine) return;
  const riotId = `${gameName}#${tagLine}`;
  try {
    const { error } = await getSupabaseServiceClient().from('riot_token_player_names').upsert({
      puuid: account.puuid,
      platform,
      riot_id: riotId,
      game_name: gameName,
      tag_line: tagLine,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'puuid,platform' });
    if (error) throw error;
  } catch (error) {
    logServerEvent('warn', 'riot_token_player_name_cache_failed', {
      operation: 'upsert',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }

  try {
    const { error } = await getSupabaseServiceClient()
      .from('riot_token_leaderboard_entries')
      .update({ riot_id: riotId })
      .eq('puuid', account.puuid)
      .eq('platform', platform);
    if (error) throw error;
  } catch (error) {
    logServerEvent('warn', 'riot_token_player_name_cache_failed', {
      operation: 'leaderboard_update',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
