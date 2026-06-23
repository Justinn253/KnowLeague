import { NextResponse } from 'next/server';
import { getRiotAccountViewerData, isRiotPlatformRoute } from '@/lib/riot-account-viewer';

export const runtime = 'nodejs';

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not configured')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  return 400;
}

export async function GET(request: Request) {
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

    const data = await getRiotAccountViewerData(riotId, platform);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Riot account data.';
    return NextResponse.json({ error: message }, { status: getErrorStatus(error) });
  }
}
