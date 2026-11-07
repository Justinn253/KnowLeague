import { withApiMetrics } from '@/lib/api-metrics';
import { searchRiotPatchNotes } from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/riot-account/patch-notes/search', async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    key: `riot-patch-notes-search:${clientIp}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    const unavailable = rateLimit.source === 'unavailable';
    return NextResponse.json(
      { error: unavailable ? 'Request protection is temporarily unavailable. Please try again shortly.' : 'Too many patch-note searches. Try again shortly.' },
      { status: unavailable ? 503 : 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ error: 'Search for at least two characters.' }, { status: 400 });
  if (query.length > 80) return NextResponse.json({ error: 'Search terms must be 80 characters or fewer.' }, { status: 400 });

  const results = await searchRiotPatchNotes(query);
  return NextResponse.json({ query, results }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=21600' },
  });
});
