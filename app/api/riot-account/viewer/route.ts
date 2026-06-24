import { NextResponse } from 'next/server';
import { getRiotAccountViewerData, isRiotPlatformRoute, recordRiotAccountSearch } from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';
import { logServerEvent } from '@/lib/server-log';

export const runtime = 'nodejs';

const rateLimitWindowMs = Number(process.env.RIOT_VIEWER_RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitRequests = Number(process.env.RIOT_VIEWER_RATE_LIMIT_REQUESTS ?? 12);
const cacheTtlMs = Number(process.env.RIOT_VIEWER_CACHE_TTL_MS ?? 5 * 60_000);

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not configured')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  return 400;
}

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  try {
    const url = new URL(request.url);
    const riotId = url.searchParams.get('riotId')?.trim() ?? '';
    const platform = (url.searchParams.get('platform') ?? 'NA1').trim().toUpperCase();

    if (!riotId) {
      return NextResponse.json({ error: 'riotId is required.' }, { status: 400 });
    }

    if (!isRiotPlatformRoute(platform)) {
      return NextResponse.json({ error: 'platform is invalid.' }, { status: 400 });
    }

    const rateLimit = checkRateLimit({
      key: `riot-account-viewer:${clientIp}`,
      limit: rateLimitRequests,
      windowMs: rateLimitWindowMs,
    });

    if (!rateLimit.allowed) {
      logServerEvent('warn', 'riot_account_viewer_rate_limited', {
        clientIp,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return NextResponse.json(
        { error: `Too many Riot account lookups. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimitRequests),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    const cacheKey = `riot-account-viewer:${platform}:${riotId.toLowerCase()}`;
    const cachedData = getServerCache<Awaited<ReturnType<typeof getRiotAccountViewerData>>>(cacheKey);
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

    const data = await getRiotAccountViewerData(riotId, platform);
    setServerCache(cacheKey, data, cacheTtlMs);
    await recordRiotAccountSearch({
      riotId: `${data.account.gameName}#${data.account.tagLine}`,
      gameName: data.account.gameName,
      tagLine: data.account.tagLine,
      platform: data.platform,
    });
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-KnowLeague-Cache': 'MISS',
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
}
