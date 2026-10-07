import { unstable_cache } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getRegionalRoute, parseRiotId, riotFetch, RIOT_PLATFORM_ROUTES, type RiotPlatformRoute } from '@/lib/riot-account-viewer';

const EASTERN_TIME_ZONE = 'America/New_York';
const LEADERBOARD_LIMIT = 250;
const LEADERBOARD_LEVELS = ['CHALLENGER', 'GRANDMASTER', 'MASTER'] as const;
const PLAYER_NAME_BATCH_SIZE = 50;
const TOKEN_CONFIG_CACHE_TTL_MS = 60 * 60_000;
const LEADERBOARD_WAIT_MS = 500;
const TOKEN_ICON_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/challenges/config';

export const RIOT_TOKEN_PLATFORM_ROUTES = RIOT_PLATFORM_ROUTES;
export const RIOT_TOKEN_ALL_PLATFORM = 'ALL' as const;
export type RiotTokenLeaderboardPlatform = RiotPlatformRoute | typeof RIOT_TOKEN_ALL_PLATFORM;

type LocalizedChallengeName = string | { name?: string; description?: string; shortDescription?: string };
type RiotChallengeConfigDto = { id?: number; challengeId?: number; localizedNames?: Record<string, LocalizedChallengeName>; name?: string; description?: string; leaderboard?: boolean; state?: string };
type RiotChallengeLeaderboardEntryDto = { puuid?: string; value?: number };
type RiotPlayerChallengeDto = { challengeId?: number; position?: number; value?: number };
type RiotPlayerDataDto = { challenges?: RiotPlayerChallengeDto[] };
type RiotAccountDto = { puuid: string; gameName?: string; tagLine?: string };
type RiotTokenPlayerNameRow = { puuid: string; platform: RiotPlatformRoute; riot_id: string; game_name: string; tag_line: string };
type StoredLeaderboardEntry = { rank: number; puuid: string; riotId: string | null; points: number; capturedAt: string; platform: RiotPlatformRoute };
type LeaderboardGenerationRow = { rank: number; puuid: string; riot_id: string | null; points: number | string; captured_at: string };

export type RiotTokenStatus = 'active' | 'inactive';
export type RiotTokenConfig = { id: number; name: string; description: string; iconUrl: string; groupName: string; subgroupName: string; status: RiotTokenStatus };
export type RiotTokenLeaderboardEntry = { rank: number; puuid: string; riotId: string | null; points: number; movement: number | null; platform: RiotPlatformRoute };
export type RiotTokenLeaderboardResponse = { token: RiotTokenConfig; platform: RiotTokenLeaderboardPlatform; generatedAt: string; nextRefreshAt: string; entries: RiotTokenLeaderboardEntry[]; searchedPlayer: RiotTokenLeaderboardEntry | null; availablePlatforms: RiotPlatformRoute[]; unresolvedNameCount: number };

let tokenCatalogCache: { expiresAt: number; request: Promise<RiotTokenConfig[]> } | null = null;
const inFlightLeaderboardRequests = new Map<string, Promise<RiotTokenLeaderboardResponse>>();

function getLocalizedField(localizedNames: Record<string, LocalizedChallengeName> | undefined, field: 'name' | 'description') {
  const localized = localizedNames?.en_US ?? localizedNames?.en_us ?? Object.values(localizedNames ?? {})[0];
  if (typeof localized === 'string') return field === 'name' ? localized.trim() : '';
  return localized?.[field]?.trim() ?? '';
}

function getTokenIconUrl(tokenId: number) {
  return TOKEN_ICON_BASE_URL + '/' + tokenId + '/tokens/challenger.png';
}

function getChallengeId(config: RiotChallengeConfigDto) {
  const id = config.id ?? config.challengeId;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getChallengeName(config: RiotChallengeConfigDto | undefined) {
  if (!config) return '';
  return getLocalizedField(config.localizedNames, 'name') || config.name?.trim() || '';
}

function getTokenStatus(config: RiotChallengeConfigDto): RiotTokenStatus {
  return !config.state || config.state === 'ENABLED' || config.state === 'HIDDEN' ? 'active' : 'inactive';
}

async function loadTokenCatalog() {
  const configs = await riotFetch<RiotChallengeConfigDto[]>('https://na1.api.riotgames.com/lol/challenges/v1/challenges/config');
  const configById = new Map<number, RiotChallengeConfigDto>();
  configs.forEach((config) => {
    const id = getChallengeId(config);
    if (id !== null) configById.set(id, config);
  });
  return configs.map((config) => {
    const id = getChallengeId(config);
    if (id === null || config.leaderboard !== true) return null;
    const name = getChallengeName(config) || 'Challenge #' + id;
    const description = getLocalizedField(config.localizedNames, 'description') || config.description?.trim() || 'View the top players for this League Challenge.';
    const groupId = Math.floor(id / 1000) * 1000;
    const subgroupId = Math.floor(id / 100) * 100;
    return {
      id,
      name,
      description,
      iconUrl: getTokenIconUrl(id),
      groupName: getChallengeName(configById.get(groupId)) || 'Other challenges',
      subgroupName: getChallengeName(configById.get(subgroupId)) || 'Other challenges',
      status: getTokenStatus(config),
    };
  }).filter((token): token is RiotTokenConfig => token !== null).sort((left, right) => left.name.localeCompare(right.name));
}

const getPersistedTokenCatalog = unstable_cache(loadTokenCatalog, ['riot-token-catalog-v2'], {
  revalidate: TOKEN_CONFIG_CACHE_TTL_MS / 1000,
});

export async function getRiotTokenCatalog() {
  if (tokenCatalogCache && tokenCatalogCache.expiresAt > Date.now()) return tokenCatalogCache.request;
  const request = getPersistedTokenCatalog();
  tokenCatalogCache = { expiresAt: Date.now() + TOKEN_CONFIG_CACHE_TTL_MS, request };
  return request;
}

async function getRiotToken(tokenId: number) {
  const token = (await getRiotTokenCatalog()).find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('That token leaderboard was not found.');
  return token;
}

function getEasternParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') };
}

function getEasternOffsetMinutes(date: Date) {
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TIME_ZONE, timeZoneName: 'shortOffset' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';
  if (zone === 'GMT') return 0;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
  if (!match) return -300;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '+' ? minutes : -minutes;
}

function formatDateKey(year: number, month: number, day: number) {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function easternScheduleInstant(scheduleKey: string) {
  const [year, month, day] = scheduleKey.split('-').map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day, 17, 0, 0);
  return new Date(localTimestamp - getEasternOffsetMinutes(new Date(localTimestamp)) * 60_000);
}

export function getRiotTokenLeaderboardScheduleKey(date = new Date()) {
  const eastern = getEasternParts(date);
  const todayKey = formatDateKey(eastern.year, eastern.month, eastern.day);
  return date.getTime() >= easternScheduleInstant(todayKey).getTime() ? todayKey : shiftDateKey(todayKey, -1);
}

export function getRiotTokenLeaderboardNextRefreshAt(scheduleKey = getRiotTokenLeaderboardScheduleKey()) {
  return easternScheduleInstant(shiftDateKey(scheduleKey, 1)).toISOString();
}

export function calculateTokenRankMovement(currentRank: number, previousRank: number | null | undefined) {
  if (!previousRank) return null;
  return previousRank - currentRank;
}

function storedEntryFromRow(row: LeaderboardGenerationRow, platform: RiotPlatformRoute): StoredLeaderboardEntry {
  return { rank: row.rank, puuid: row.puuid, riotId: row.riot_id, points: Number(row.points), capturedAt: row.captured_at, platform };
}

async function getStoredEntries(refreshKey: string, tokenId: number, platform: RiotPlatformRoute) {
  const { data, error } = await getSupabaseServiceClient().from('riot_token_leaderboard_entries').select('rank, puuid, riot_id, points, captured_at').eq('refresh_key', refreshKey).eq('token_id', tokenId).eq('platform', platform).order('rank', { ascending: true }).limit(LEADERBOARD_LIMIT).returns<LeaderboardGenerationRow[]>();
  if (error) throw new Error('The token leaderboard cache is unavailable.');
  return (data ?? []).map((row) => storedEntryFromRow(row, platform));
}

async function waitForStoredEntries(refreshKey: string, tokenId: number, platform: RiotPlatformRoute) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const entries = await getStoredEntries(refreshKey, tokenId, platform);
    if (entries.length > 0) return entries;
    await new Promise((resolve) => setTimeout(resolve, LEADERBOARD_WAIT_MS));
  }
  return [];
}

async function claimLeaderboardRefresh(refreshKey: string, tokenId: number, platform: RiotPlatformRoute) {
  const { data, error } = await getSupabaseServiceClient().rpc('claim_riot_token_leaderboard_refresh', { p_refresh_key: refreshKey, p_token_id: tokenId, p_platform: platform });
  if (error) throw new Error('The token leaderboard refresh guard is unavailable.');
  return data === true;
}

async function finishLeaderboardRefresh(refreshKey: string, tokenId: number, platform: RiotPlatformRoute, status: 'complete' | 'error', errorMessage: string | null = null) {
  await getSupabaseServiceClient().from('riot_token_leaderboard_refreshes').update({ status, completed_at: new Date().toISOString(), error_message: errorMessage }).eq('refresh_key', refreshKey).eq('token_id', tokenId).eq('platform', platform);
}

async function fetchRawLeaderboard(tokenId: number, platform: RiotPlatformRoute) {
  const baseUrl = 'https://' + platform.toLowerCase() + '.api.riotgames.com';
  const responses = await Promise.all(LEADERBOARD_LEVELS.map((level) => riotFetch<RiotChallengeLeaderboardEntryDto[]>(baseUrl + '/lol/challenges/v1/challenges/' + tokenId + '/leaderboards/by-level/' + level + '?limit=' + LEADERBOARD_LIMIT)));
  const entries = new Map<string, { puuid: string; points: number }>();
  responses.flat().forEach((entry) => {
    if (!entry.puuid || !Number.isFinite(entry.value)) return;
    const current = entries.get(entry.puuid);
    if (!current || Number(entry.value) > current.points) entries.set(entry.puuid, { puuid: entry.puuid, points: Number(entry.value) });
  });
  return [...entries.values()].sort((left, right) => right.points - left.points || left.puuid.localeCompare(right.puuid)).slice(0, LEADERBOARD_LIMIT);
}

async function getCachedPlayerNames(puuids: string[], platform: RiotPlatformRoute) {
  if (puuids.length === 0) return new Map<string, RiotTokenPlayerNameRow>();
  const uniquePuuids = [...new Set(puuids)];
  const batches = Array.from({ length: Math.ceil(uniquePuuids.length / PLAYER_NAME_BATCH_SIZE) }, (_, index) => uniquePuuids.slice(index * PLAYER_NAME_BATCH_SIZE, (index + 1) * PLAYER_NAME_BATCH_SIZE));
  const results = await Promise.all(batches.map(async (batch) => {
    const { data, error } = await getSupabaseServiceClient()
      .from('riot_token_player_names')
      .select('puuid, platform, riot_id, game_name, tag_line')
      .eq('platform', platform)
      .in('puuid', batch)
      .returns<RiotTokenPlayerNameRow[]>();
    return error ? [] : data ?? [];
  }));
  return new Map(results.flat().map((row) => [row.puuid, row]));
}

async function hydrateCachedEntryNames(entries: StoredLeaderboardEntry[]) {
  const platformPuuids = new Map<RiotPlatformRoute, string[]>();
  for (const entry of entries) {
    if (entry.riotId) continue;
    platformPuuids.set(entry.platform, [...(platformPuuids.get(entry.platform) ?? []), entry.puuid]);
  }
  const cachedNames = await Promise.all([...platformPuuids.entries()].map(async ([platform, puuids]) => [platform, await getCachedPlayerNames(puuids, platform)] as const));
  const namesByPlatform = new Map(cachedNames);
  return entries.map((entry) => ({ ...entry, riotId: entry.riotId ?? namesByPlatform.get(entry.platform)?.get(entry.puuid)?.riot_id ?? null }));
}

async function persistLeaderboard(refreshKey: string, tokenId: number, platform: RiotPlatformRoute, rawEntries: Array<{ puuid: string; points: number }>) {
  const previousEntries = await getStoredEntries(shiftDateKey(refreshKey, -1), tokenId, platform);
  const previousRanks = new Map(previousEntries.map((entry) => [entry.puuid, entry.rank]));
  const names = await getCachedPlayerNames(rawEntries.map((entry) => entry.puuid), platform);
  const capturedAt = new Date().toISOString();
  const rows = rawEntries.map((entry, index) => ({ refresh_key: refreshKey, token_id: tokenId, platform, rank: index + 1, puuid: entry.puuid, riot_id: names.get(entry.puuid)?.riot_id ?? null, points: entry.points, captured_at: capturedAt }));
  const { error } = await getSupabaseServiceClient().from('riot_token_leaderboard_entries').upsert(rows, { onConflict: 'refresh_key,token_id,platform,rank' });
  if (error) throw new Error('The token leaderboard could not be saved.');
  return rows.map((row) => ({ rank: row.rank, puuid: row.puuid, riotId: row.riot_id, points: Number(row.points), movement: calculateTokenRankMovement(row.rank, previousRanks.get(row.puuid)), capturedAt: row.captured_at, platform }));
}

async function generateLeaderboard(refreshKey: string, tokenId: number, platform: RiotPlatformRoute) {
  if (!await claimLeaderboardRefresh(refreshKey, tokenId, platform)) {
    const existing = await waitForStoredEntries(refreshKey, tokenId, platform);
    if (existing.length > 0) return existing;
    throw new Error('This token leaderboard is being generated. Please try again in a moment.');
  }
  try {
    const entries = await persistLeaderboard(refreshKey, tokenId, platform, await fetchRawLeaderboard(tokenId, platform));
    await finishLeaderboardRefresh(refreshKey, tokenId, platform, 'complete');
    return entries;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate the token leaderboard.';
    await finishLeaderboardRefresh(refreshKey, tokenId, platform, 'error', message);
    throw error;
  }
}

function combineLeaderboardEntries(entries: StoredLeaderboardEntry[]) {
  const highestByPlayer = new Map<string, StoredLeaderboardEntry>();
  for (const entry of entries) {
    const existing = highestByPlayer.get(entry.puuid);
    if (!existing || entry.points > existing.points || (entry.points === existing.points && !existing.riotId && Boolean(entry.riotId))) {
      highestByPlayer.set(entry.puuid, entry);
    }
  }

  return [...highestByPlayer.values()]
    .sort((left, right) => right.points - left.points || left.puuid.localeCompare(right.puuid))
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function getAllCachedEntries(refreshKey: string, tokenId: number) {
  const regionalEntries = await Promise.all(
    RIOT_PLATFORM_ROUTES.map(async (regionalPlatform) => ({
      platform: regionalPlatform,
      entries: await getStoredEntries(refreshKey, tokenId, regionalPlatform),
    })),
  );

  return {
    entries: combineLeaderboardEntries(regionalEntries.flatMap(({ entries }) => entries)),
    availablePlatforms: regionalEntries.filter(({ entries }) => entries.length > 0).map(({ platform }) => platform),
  };
}

async function getSearchedPlayerTokenEntry(tokenId: number, platform: RiotPlatformRoute, account: RiotAccountDto, searchedRiotId: string) {
  const baseUrl = 'https://' + platform.toLowerCase() + '.api.riotgames.com';
  const playerData = await riotFetch<RiotPlayerDataDto>(baseUrl + '/lol/challenges/v1/player-data/' + encodeURIComponent(account.puuid), { optional404: true });
  const challenge = playerData?.challenges?.find((candidate) => candidate.challengeId === tokenId);
  const rank = challenge?.position;
  const points = challenge?.value;
  if (!challenge || typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || typeof points !== 'number' || !Number.isFinite(points)) return null;

  const riotId = account.gameName && account.tagLine ? account.gameName + '#' + account.tagLine : searchedRiotId;
  return {
    rank,
    puuid: account.puuid,
    riotId,
    points: Number(points),
    movement: null,
    platform,
  } satisfies RiotTokenLeaderboardEntry;
}

function getLeaderboardResponse(token: RiotTokenConfig, platform: RiotTokenLeaderboardPlatform, availablePlatforms: RiotPlatformRoute[], scheduleKey: string, current: StoredLeaderboardEntry[], previous: StoredLeaderboardEntry[]) {
  const previousRanks = new Map(previous.map((entry) => [entry.puuid, entry.rank]));
  const entries = current.map((entry) => ({
    rank: entry.rank,
    puuid: entry.puuid,
    riotId: entry.riotId,
    points: entry.points,
    movement: calculateTokenRankMovement(entry.rank, previousRanks.get(entry.puuid)),
    platform: entry.platform,
  }));
  return {
    token,
    platform,
    availablePlatforms,
    generatedAt: current.reduce((latest, entry) => entry.capturedAt > latest ? entry.capturedAt : latest, easternScheduleInstant(scheduleKey).toISOString()),
    nextRefreshAt: getRiotTokenLeaderboardNextRefreshAt(scheduleKey),
    entries,
    searchedPlayer: null as RiotTokenLeaderboardEntry | null,
    unresolvedNameCount: entries.filter((entry) => !entry.riotId).length,
  } satisfies RiotTokenLeaderboardResponse;
}

export async function getRiotTokenLeaderboard(tokenId: number, platform: RiotTokenLeaderboardPlatform, searchRiotId?: string) {
  const token = await getRiotToken(tokenId);
  const scheduleKey = getRiotTokenLeaderboardScheduleKey();
  const requestKey = scheduleKey + ':' + tokenId + ':' + platform + ':' + (searchRiotId?.trim().toLowerCase() ?? '');
  const load = async () => {
    let current: StoredLeaderboardEntry[];
    let availablePlatforms: RiotPlatformRoute[];

    if (platform === RIOT_TOKEN_ALL_PLATFORM) {
      const cached = await getAllCachedEntries(scheduleKey, tokenId);
      current = await hydrateCachedEntryNames(cached.entries);
      availablePlatforms = cached.availablePlatforms;
      if (current.length === 0) {
        current = await hydrateCachedEntryNames(combineLeaderboardEntries(await generateLeaderboard(scheduleKey, tokenId, 'NA1')));
        availablePlatforms = ['NA1'];
      }
    } else {
      current = await getStoredEntries(scheduleKey, tokenId, platform);
      if (current.length === 0) current = await generateLeaderboard(scheduleKey, tokenId, platform);
      current = await hydrateCachedEntryNames(current);
      availablePlatforms = [platform];
    }

    const previous = platform === RIOT_TOKEN_ALL_PLATFORM
      ? (await getAllCachedEntries(shiftDateKey(scheduleKey, -1), tokenId)).entries
      : await getStoredEntries(shiftDateKey(scheduleKey, -1), tokenId, platform);
    const response = getLeaderboardResponse(token, platform, availablePlatforms, scheduleKey, current, previous);

    if (searchRiotId?.trim()) {
      let found: StoredLeaderboardEntry | undefined;
      if (platform === RIOT_TOKEN_ALL_PLATFORM) {
        const normalizedSearch = searchRiotId.trim().toLowerCase();
        found = current.find((entry) => entry.riotId?.toLowerCase() === normalizedSearch);
      } else {
        const parsed = parseRiotId(searchRiotId);
        const account = await riotFetch<RiotAccountDto>('https://' + getRegionalRoute(platform) + '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + encodeURIComponent(parsed.gameName) + '/' + encodeURIComponent(parsed.tagLine));
        found = current.find((entry) => entry.puuid === account.puuid);
        if (!found) response.searchedPlayer = await getSearchedPlayerTokenEntry(tokenId, platform, account, searchRiotId);
      }
      if (found) response.searchedPlayer = response.entries.find((entry) => entry.platform === found.platform && entry.rank === found.rank) ?? null;
    }

    return response;
  };
  const existingRequest = inFlightLeaderboardRequests.get(requestKey);
  if (existingRequest) return existingRequest;
  const request = load();
  inFlightLeaderboardRequests.set(requestKey, request);
  const clearRequest = () => { if (inFlightLeaderboardRequests.get(requestKey) === request) inFlightLeaderboardRequests.delete(requestKey); };
  void request.then(clearRequest, clearRequest);
  return request;
}
