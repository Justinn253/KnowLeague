import { withApiMetrics } from '@/lib/api-metrics';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getRiotTokenCatalog, getRiotTokenLeaderboard, RIOT_TOKEN_ALL_PLATFORM } from '@/lib/riot-token-leaderboards';
import { isRiotPlatformRoute } from '@/lib/riot-account-viewer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const rateLimitWindowMs = Number(process.env.RIOT_TOKEN_LEADERBOARD_RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitRequests = Number(process.env.RIOT_TOKEN_LEADERBOARD_RATE_LIMIT_REQUESTS ?? 12);

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not configured') || message.includes('cache is unavailable') || message.includes('guard is unavailable')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  if (message.includes('being generated')) return 202;
  return 400;
}

export const GET = withApiMetrics('/api/riot-account/token-leaderboards', async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({ key: 'riot-token-leaderboards:' + clientIp, limit: rateLimitRequests, windowMs: rateLimitWindowMs });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many token leaderboard requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }

  try {
    const url = new URL(request.url);
    const tokenIdParam = url.searchParams.get('tokenId')?.trim() ?? '';
    if (!tokenIdParam) {
      return NextResponse.json({ tokens: await getRiotTokenCatalog() }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const tokenId = Number(tokenIdParam);
    const platform = (url.searchParams.get('platform') ?? 'NA1').trim().toUpperCase();
    const riotId = url.searchParams.get('riotId')?.trim() || undefined;
    if (!/^\d+$/.test(tokenIdParam) || !Number.isSafeInteger(tokenId) || tokenId <= 0) {
      return NextResponse.json({ error: 'tokenId is invalid.' }, { status: 400 });
    }
    if (platform !== RIOT_TOKEN_ALL_PLATFORM && !isRiotPlatformRoute(platform)) {
      return NextResponse.json({ error: 'platform is invalid.' }, { status: 400 });
    }

    const data = await getRiotTokenLeaderboard(tokenId, platform, riotId);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store', 'X-RateLimit-Limit': String(rateLimitRequests), 'X-RateLimit-Remaining': String(rateLimit.remaining) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load token leaderboard data.';
    const status = getErrorStatus(error);
    return NextResponse.json({ error: message }, { status, headers: status === 202 ? { 'Retry-After': '3' } : undefined });
  }
});
