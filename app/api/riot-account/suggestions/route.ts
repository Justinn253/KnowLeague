import { NextResponse } from 'next/server';
import { getRiotAccountSearchSuggestions, isRiotPlatformRoute } from '@/lib/riot-account-viewer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const platform = url.searchParams.get('platform')?.toUpperCase() ?? null;
  const validatedPlatform = platform && isRiotPlatformRoute(platform) ? platform : undefined;
  const suggestions = await getRiotAccountSearchSuggestions(
    query,
    validatedPlatform,
  );

  return NextResponse.json({ suggestions });
}
