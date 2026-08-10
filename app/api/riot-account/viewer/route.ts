import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import {
  getRiotAccountProfileSnapshot,
  getRiotAccountViewerData,
  getRiotLiveGameStatus,
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
    await Promise.all([
      saveRiotAccountProfileSnapshot(data, profileSnapshotTtlMs),
      recordRiotAccountSearch({
        riotId: `${data.account.gameName}#${data.account.tagLine}`,
        gameName: data.account.gameName,
        tagLine: data.account.tagLine,
        platform: data.platform,
      }),
    ]);
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

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not configured')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  return 400;
}

export const GET = withApiMetrics('/api/riot-account/viewer', async function GET(request: Request) {
  const clientIp = getClientIp(request);
  try {
    const url = new URL(request.url);
    const riotId = url.searchParams.get('riotId')?.trim() ?? '';
    const platform = (url.searchParams.get('platform') ?? 'NA1').trim().toUpperCase();
    const shouldRefresh = url.searchParams.get('refresh') === 'true';

    if (!riotId) {
      return NextResponse.json({ error: 'riotId is required.' }, { status: 400 });
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
        clientIp,
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

    const cacheKey = `riot-account-viewer:${platform}:${riotId.toLowerCase()}`;
    const cachedData = shouldRefresh ? null : getServerCache<ViewerData>(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-KnowLeague-Cache': 'HIT',
          'X-RateLimit-Limit': String(rateLimitRequests),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      });
    }

    const profileSnapshot = shouldRefresh ? null : await getRiotAccountProfileSnapshot(riotId, platform);
    if (profileSnapshot && isRiotAccountProfileSnapshotFresh(profileSnapshot)) {
      let currentGame = profileSnapshot.data.currentGame;
      const liveGameIsFresh = profileSnapshot.currentGameFetchedAt
        && Date.now() - Date.parse(profileSnapshot.currentGameFetchedAt) < liveGameCacheTtlMs;
      if (!liveGameIsFresh) {
        const liveGame = await loadAndCacheLiveGame(
          `riot-account-viewer-live-game:${platform}:${riotId.toLowerCase()}`,
          riotId,
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
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-KnowLeague-Cache': 'PERSISTED_HIT',
          'X-RateLimit-Limit': String(rateLimitRequests),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      });
    }

    const data = await loadAndCacheAccount(cacheKey, riotId, platform);
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
    logServerEvent(getErrorStatus(error) >= 500 ? 'error' : 'warn', 'riot_account_viewer_error', {
      clientIp,
      status: getErrorStatus(error),
      message,
    });
    return NextResponse.json({ error: message }, { status: getErrorStatus(error) });
  }
});
