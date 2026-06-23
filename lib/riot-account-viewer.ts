const DATA_DRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const RIOT_API_KEY_HEADER = 'X-Riot-Token';
const DEFAULT_MATCH_COUNT = 10;

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
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
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
};

export type RiotAccountViewerResponse = {
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
};

let cachedChampionLookup: Promise<Map<number, RiotChampionSummary>> | null = null;
let cachedDataDragonVersion: Promise<string> | null = null;

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
      throw new Error('Riot API rate limit reached. Try again in a moment.');
    }
    throw new Error(`Riot API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
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

function withWinRate(entry: RiotLeagueEntryDto) {
  const games = entry.wins + entry.losses;
  return {
    ...entry,
    winRate: games > 0 ? Math.round((entry.wins / games) * 1000) / 10 : 0,
  };
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

function normalizeMatch(match: RiotMatchDto, puuid: string, champions: Map<number, RiotChampionSummary>) {
  const participant = match.info.participants.find((candidate) => candidate.puuid === puuid);
  if (!participant) return null;

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
    position: participant.teamPosition || participant.individualPosition || 'UNKNOWN',
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
  };
}

function normalizeChallenges(challenges: RiotChallengesDto | null): RiotAccountViewerResponse['challenges'] {
  if (!challenges) return null;

  const categoryPoints = Object.entries(challenges.categoryPoints ?? {}).map(([category, points]) => ({
    category,
    level: points.level ?? null,
    current: points.current ?? null,
    max: points.max ?? null,
    percentile: points.percentile ?? null,
  }));

  const topChallenges = [...(challenges.challenges ?? [])]
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
    .slice(0, 20)
    .map((challenge) => ({
      challengeId: challenge.challengeId,
      level: challenge.level ?? null,
      value: challenge.value ?? null,
      percentile: challenge.percentile ?? null,
      achievedTime: challenge.achievedTime ?? null,
    }));

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

  const [version, champions, masteries, ranked, challengeData, currentGame, matchIds] = await Promise.all([
    getDataDragonVersion(),
    getChampionLookup(),
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
    riotFetch<RiotCurrentGameDto>(
      `https://${platform.toLowerCase()}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(account.puuid)}`,
      { optional404: true },
    ),
    riotFetch<string[]>(
      `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?start=0&count=${DEFAULT_MATCH_COUNT}`,
    ),
  ]);

  const matches = await Promise.all(
    matchIds.map((matchId) => riotFetch<RiotMatchDto>(
      `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
    )),
  );

  const normalizedMatches = matches
    .map((match) => normalizeMatch(match, account.puuid, champions))
    .filter((match): match is RiotAccountViewerMatch => Boolean(match));
  const normalizedMasteries = masteries.map((mastery) => normalizeMastery(mastery, champions));
  const recentWins = normalizedMatches.filter((match) => match.win).length;

  return {
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
    ranked: ranked.map(withWinRate),
    masteries: normalizedMasteries,
    matches: normalizedMatches,
    currentGame: normalizeCurrentGame(currentGame, account.puuid, champions),
    challenges: normalizeChallenges(challengeData),
    summary: {
      totalMasteryPoints: normalizedMasteries.reduce((sum, mastery) => sum + mastery.championPoints, 0),
      topChampion: normalizedMasteries[0]?.champion ?? null,
      recentWinRate: normalizedMatches.length > 0 ? Math.round((recentWins / normalizedMatches.length) * 1000) / 10 : null,
      matchSampleSize: normalizedMatches.length,
    },
  };
}
