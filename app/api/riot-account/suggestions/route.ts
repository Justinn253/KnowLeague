import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRiotAccountSearchSuggestions, isRiotPlatformRoute } from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logServerEvent } from '@/lib/server-log';

export const runtime = 'nodejs';

const rateLimitWindowMs = Number(process.env.SUGGESTIONS_RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitRequests = Number(process.env.SUGGESTIONS_RATE_LIMIT_REQUESTS ?? 60);

export const GET = withApiMetrics('/api/riot-account/suggestions', async function GET(request: Request) {
  const url = new URL(request.url);
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    key: `riot-account-suggestions:${clientIp}`,
    limit: rateLimitRequests,
    windowMs: rateLimitWindowMs,
  });

  if (!rateLimit.allowed) {
    const unavailable = rateLimit.source === 'unavailable';
    logServerEvent('warn', 'riot_account_suggestions_rate_limited', {
      clientIp,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return NextResponse.json(
      { suggestions: [], error: unavailable ? 'Request protection is temporarily unavailable. Please try again shortly.' : `Too many suggestion requests. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
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

  const query = url.searchParams.get('q') ?? '';
  const platform = url.searchParams.get('platform')?.toUpperCase() ?? null;
  const validatedPlatform = platform && isRiotPlatformRoute(platform) ? platform : undefined;
  const suggestions = await getRiotAccountSearchSuggestions(
    query,
    validatedPlatform,
  );

  return NextResponse.json({ suggestions }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-RateLimit-Limit': String(rateLimitRequests),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
    },
  });
});
