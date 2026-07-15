import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';

const DATA_DRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const RIOT_API_KEY_HEADER = 'X-Riot-Token';
const MATCH_COUNT = process.env.NODE_ENV === 'production' ? 20 : 8;
const MATCH_DETAIL_BATCH_SIZE = 4;
const MATCH_DETAIL_BATCH_DELAY_MS = 350;
const PARTICIPANT_RANK_CACHE_TTL_MS = Number(process.env.RIOT_PARTICIPANT_RANK_CACHE_TTL_MS ?? 5 * 60_000);

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
  image: {
    full: string;
  };
};

type DataDragonItemResponse = {
  data: Record<string, DataDragonItem>;
};

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

export type RiotLiveGameStatus = {
  riotId: string;
  platform: RiotPlatformRoute;
  inGame: boolean;
  gameId: number | null;
  gameStartTime: number | null;
  gameLength: number | null;
  champion: RiotChampionSummary | null;
  updatedAt: string;
};

let cachedChampionLookup: Promise<Map<number, RiotChampionSummary>> | null = null;
let cachedDataDragonVersion: Promise<string> | null = null;
let cachedSummonerSpellLookup: Promise<Map<number, { name: string; imageUrl: string }>> | null = null;
let cachedRuneLookup: Promise<Map<number, { name: string; imageUrl: string }>> | null = null;
let cachedItemLookup: Promise<Map<number, { name: string; imageUrl: string }>> | null = null;
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
}) {
  try {
    await getSupabaseServiceClient().rpc('record_riot_account_search', {
      search_riot_id: input.riotId,
      search_game_name: input.gameName,
      search_tag_line: input.tagLine,
      search_platform: input.platform,
    });
  } catch {
    // Search suggestions are best-effort and should not block a successful Riot lookup.
  }
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

async function riotFetch<T>(url: string): Promise<T>;
async function riotFetch<T>(url: string, options: { optional404: true }): Promise<T | null>;
async function riotFetch<T>(url: string, options?: { optional404?: boolean }): Promise<T | null> {
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
    if (response.status === 403) {
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
  items: Map<number, { name: string; imageUrl: string }>,
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
  items: Map<number, { name: string; imageUrl: string }>,
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
      updatedAt: new Date().toISOString(),
    };
  }

  const champions = await getChampionLookup();
  const participant = currentGame.participants.find((currentParticipant) => currentParticipant.puuid === account.puuid);

  return {
    riotId: canonicalRiotId,
    platform,
    inGame: true,
    gameId: currentGame.gameId,
    gameStartTime: currentGame.gameStartTime,
    gameLength: currentGame.gameLength,
    champion: participant ? getChampion(champions, participant.championId) : null,
    updatedAt: new Date().toISOString(),
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
  const regionalRoute = getRegionalRoute(platform);
  const encodedGameName = encodeURIComponent(parsed.gameName);
  const encodedTagLine = encodeURIComponent(parsed.tagLine);

  const account = await riotFetch<RiotAccountDto>(
    `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedGameName}/${encodedTagLine}`,
  );

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

  const matches = await getMatchDetails(matchIds, regionalRoute);
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
  const canonicalRiotId = `${account.gameName ?? parsed.gameName}#${account.tagLine ?? parsed.tagLine}`;

  await recordRiotAccountProfileMetrics({
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
    searchedRiotId: parsed.normalized,
    platform,
    regionalRoute,
    account: {
      puuid: account.puuid,
      gameName: account.gameName ?? parsed.gameName,
      tagLine: account.tagLine ?? parsed.tagLine,
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
