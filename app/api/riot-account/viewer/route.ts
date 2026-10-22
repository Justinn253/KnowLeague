import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import {
  getRiotAccountProfileSnapshot,
  getRiotAccountProfileSnapshotByPuuid,
  getRiotAccountViewerData,
  getRiotAccountViewerDataByPuuid,
  cacheRiotTokenPlayerName,
  getRiotLiveGameStatus,
  hasRiotAccountViewerItemDetails,
  isRiotAccountProfileSnapshotFresh,
  isRiotPlatformRoute,
  recordRiotAccountSearch,
  saveRiotAccountProfileSnapshot,
  touchRiotAccountProfileSnapshot,
  updateRiotAccountProfileSnapshotLiveGame,
} from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';
import { logServerEvent } from '@/lib/server-log';
import { getRiotAccountViewerErrorStatus } from '@/lib/riot-account-viewer-error-status';

export const runtime = 'nodejs';

const rateLimitWindowMs = Number(process.env.RIOT_VIEWER_RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitRequests = Number(process.env.RIOT_VIEWER_RATE_LIMIT_REQUESTS ?? 12);
const cacheTtlMs = Number(process.env.RIOT_VIEWER_CACHE_TTL_MS ?? 5 * 60_000);
const profileSnapshotTtlMs = Number(process.env.RIOT_VIEWER_PROFILE_SNAPSHOT_TTL_MS ?? 30 * 24 * 60 * 60_000);
const liveGameCacheTtlMs = Number(process.env.RIOT_VIEWER_LIVE_GAME_CACHE_TTL_MS ?? 90_000);
const viewerMemoryCacheTtlMs = Math.min(cacheTtlMs, liveGameCacheTtlMs);
type ViewerData = Awaited<ReturnType<typeof getRiotAccountViewerData>>;
type LiveGameData = Awaited<ReturnType<typeof getRiotLiveGameStatus>>;

const inFlightViewerRequests = new Map<string, Promise<ViewerData>>();
const inFlightLiveGameRequests = new Map<string, Promise<LiveGameData>>();

function loadAndCacheLiveGame(cacheKey: string, riotId: string, platform: Parameters<typeof getRiotLiveGameStatus>[1]) {
  const cached = getServerCache<LiveGameData>(cacheKey);
  if (cached) return Promise.resolve(cached);

  const existingRequest = inFlightLiveGameRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = getRiotLiveGameStatus(riotId, platform).then((data) => {
    setServerCache(cacheKey, data, liveGameCacheTtlMs);
    return data;
  });
  inFlightLiveGameRequests.set(cacheKey, request);
  const clearRequest = () => {
    if (inFlightLiveGameRequests.get(cacheKey) === request) {
      inFlightLiveGameRequests.delete(cacheKey);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function loadAndCacheAccount(cacheKey: string, riotId: string, platform: Parameters<typeof getRiotAccountViewerData>[1]) {
  const existingRequest = inFlightViewerRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const data = await getRiotAccountViewerData(riotId, platform);
    setServerCache(cacheKey, data, viewerMemoryCacheTtlMs);
    await saveRiotAccountProfileSnapshot(data, profileSnapshotTtlMs);
    return data;
  })();

  inFlightViewerRequests.set(cacheKey, request);
  const clearRequest = () => {
    if (inFlightViewerRequests.get(cacheKey) === request) {
      inFlightViewerRequests.delete(cacheKey);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function loadAndCacheAccountByPuuid(cacheKey: string, puuid: string, platform: Parameters<typeof getRiotAccountViewerDataByPuuid>[1]) {
  const existingRequest = inFlightViewerRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const data = await getRiotAccountViewerDataByPuuid(puuid, platform);
    setServerCache(cacheKey, data, viewerMemoryCacheTtlMs);
    await saveRiotAccountProfileSnapshot(data, profileSnapshotTtlMs);
    return data;
  })();

  inFlightViewerRequests.set(cacheKey, request);
  const clearRequest = () => {
    if (inFlightViewerRequests.get(cacheKey) === request) {
      inFlightViewerRequests.delete(cacheKey);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function getSearchDedupeKey(value: string | null, clientIp: string) {
  return value && /^[a-zA-Z0-9-]{16,128}$/.test(value) ? `session:${value}` : `ip:${clientIp}`;
}

async function recordViewerSearch(data: ViewerData, dedupeKey: string) {
  await cacheRiotTokenPlayerName({
    puuid: data.account.puuid,
    gameName: data.account.gameName,
    tagLine: data.account.tagLine,
  }, data.platform);
  await recordRiotAccountSearch({
    riotId: `${data.account.gameName}#${data.account.tagLine}`,
    gameName: data.account.gameName,
    tagLine: data.account.tagLine,
    platform: data.platform,
  }, dedupeKey);
}

export const GET = withApiMetrics('/api/riot-account/viewer', async function GET(request: Request) {
  const clientIp = getClientIp(request);
  try {
    const url = new URL(request.url);
    const riotId = url.searchParams.get('riotId')?.trim() ?? '';
    const puuid = url.searchParams.get('puuid')?.trim() ?? '';
    const platform = (url.searchParams.get('platform') ?? 'NA1').trim().toUpperCase();
    const shouldRefresh = url.searchParams.get('refresh') === 'true';
    const searchDedupeKey = getSearchDedupeKey(url.searchParams.get('searchSessionId'), clientIp);

    if (!riotId && !puuid) {
      return NextResponse.json({ error: 'riotId or puuid is required.' }, { status: 400 });
    }

    if (puuid && !/^[A-Za-z0-9_-]{20,128}$/.test(puuid)) {
      return NextResponse.json({ error: 'puuid is invalid.' }, { status: 400 });
    }

    if (!isRiotPlatformRoute(platform)) {
      return NextResponse.json({ error: 'platform is invalid.' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit({
      key: `riot-account-viewer:${clientIp}`,
      limit: rateLimitRequests,
      windowMs: rateLimitWindowMs,
    });

    if (!rateLimit.allowed) {
      const unavailable = rateLimit.source === 'unavailable';
      logServerEvent('warn', 'riot_account_viewer_rate_limited', {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return NextResponse.json(
        { error: unavailable ? 'Request protection is temporarily unavailable. Please try again shortly.' : `Too many Riot account lookups. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: unavailable ? 503 : 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimitRequests),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    const lookupKey = puuid ? `puuid:${puuid.toLowerCase()}` : `riot-id:${riotId.toLowerCase()}`;
    const cacheKey = `riot-account-viewer:${platform}:${lookupKey}`;
    const cachedData = shouldRefresh ? null : getServerCache<ViewerData>(cacheKey);
    if (cachedData && hasRiotAccountViewerItemDetails(cachedData)) {
      await recordViewerSearch(cachedData, searchDedupeKey);
      return NextResponse.json(cachedData, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-KnowLeague-Cache': 'HIT',
          'X-RateLimit-Limit': String(rateLimitRequests),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      });
    }

    const profileSnapshot = shouldRefresh
      ? null
      : puuid
        ? await getRiotAccountProfileSnapshotByPuuid(puuid, platform)
        : await getRiotAccountProfileSnapshot(riotId, platform);
    if (profileSnapshot && isRiotAccountProfileSnapshotFresh(profileSnapshot) && hasRiotAccountViewerItemDetails(profileSnapshot.data)) {
      let currentGame = profileSnapshot.data.currentGame;
      const liveGameIsFresh = profileSnapshot.currentGameFetchedAt
        && Date.now() - Date.parse(profileSnapshot.currentGameFetchedAt) < liveGameCacheTtlMs;
      if (!liveGameIsFresh) {
        const profileRiotId = `${profileSnapshot.data.account.gameName}#${profileSnapshot.data.account.tagLine}`;
        const liveGame = await loadAndCacheLiveGame(
          `riot-account-viewer-live-game:${platform}:${profileRiotId.toLowerCase()}`,
          profileRiotId,
          platform,
        );
        currentGame = liveGame.currentGame;
        await updateRiotAccountProfileSnapshotLiveGame(profileSnapshot, currentGame, liveGame.updatedAt);
      }
      const data = { ...profileSnapshot.data, currentGame };
      setServerCache(cacheKey, data, viewerMemoryCacheTtlMs);
      if (Date.now() - Date.parse(profileSnapshot.lastAccessedAt) >= 6 * 60 * 60_000) {
        await touchRiotAccountProfileSnapshot(profileSnapshot);
      }
      await recordViewerSearch(data, searchDedupeKey);
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-KnowLeague-Cache': 'PERSISTED_HIT',
          'X-RateLimit-Limit': String(rateLimitRequests),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      });
    }

    const data = puuid
      ? await loadAndCacheAccountByPuuid(cacheKey, puuid, platform)
      : await loadAndCacheAccount(cacheKey, riotId, platform);
    await recordViewerSearch(data, searchDedupeKey);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-KnowLeague-Cache': shouldRefresh ? 'REFRESH' : 'MISS',
        'X-RateLimit-Limit': String(rateLimitRequests),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Riot account data.';
    const status = getRiotAccountViewerErrorStatus(error);
    logServerEvent(status >= 500 ? 'error' : 'warn', 'riot_account_viewer_error', {
      status,
      message,
    });
    return NextResponse.json({ error: message }, { status });
  }
});
