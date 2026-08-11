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
    return NextResponse.json({ error: 'Too many patch-note searches. Try again shortly.' }, { status: 429 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ error: 'Search for at least two characters.' }, { status: 400 });
  if (query.length > 80) return NextResponse.json({ error: 'Search terms must be 80 characters or fewer.' }, { status: 400 });

  const results = await searchRiotPatchNotes(query);
  return NextResponse.json({ query, results }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=21600' },
  });
});
