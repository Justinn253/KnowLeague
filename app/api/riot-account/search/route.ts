import { withApiMetrics } from '@/lib/api-metrics';
import { isRiotPlatformRoute, parseRiotId, recordRiotAccountSearch } from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api-utils';

const rateLimitWindowMs = 60_000;
const rateLimitRequests = 30;

export const runtime = 'nodejs';

function getDedupeKey(searchSessionId: unknown, clientIp: string) {
  return typeof searchSessionId === 'string' && /^[a-zA-Z0-9-]{16,128}$/.test(searchSessionId)
    ? `session:${searchSessionId}`
    : `ip:${clientIp}`;
}

export const POST = withApiMetrics('/api/riot-account/search', async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    key: `riot-account-search-event:${clientIp}`,
    limit: rateLimitRequests,
    windowMs: rateLimitWindowMs,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many account searches. Try again shortly.' }, { status: 429 });
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const riotId = typeof body.riotId === 'string' ? body.riotId.trim() : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim().toUpperCase() : '';
    if (!riotId || !isRiotPlatformRoute(platform)) {
      return NextResponse.json({ error: 'A valid Riot ID and platform are required.' }, { status: 400 });
    }

    const parsed = parseRiotId(riotId);
    await recordRiotAccountSearch({
      riotId: parsed.normalized,
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform,
    }, getDedupeKey(body.searchSessionId, clientIp));

    return NextResponse.json({ recorded: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record the account search.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
