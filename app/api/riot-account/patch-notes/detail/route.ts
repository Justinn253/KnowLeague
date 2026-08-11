import { withApiMetrics } from '@/lib/api-metrics';
import { getRiotPatchNoteDetail } from '@/lib/riot-account-viewer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/riot-account/patch-notes/detail', async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim() ?? '';
  const detail = await getRiotPatchNoteDetail(slug);
  if (!detail) return NextResponse.json({ error: 'Patch note not found.' }, { status: 404 });

  return NextResponse.json({ detail }, {
    headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=21600' },
  });
});
