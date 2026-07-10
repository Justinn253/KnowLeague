import { NextResponse } from 'next/server';
import { getRouteErrorResponse, requireString } from '@/lib/api-utils';
import { getCarvingRevelationSkinImageSource } from '@/lib/carving-revelation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const url = new URL(request.url);
    const { imageUrl } = await getCarvingRevelationSkinImageSource(
      params.code,
      requireString(url.searchParams.get('clientId'), 'clientId'),
    );
    const imageResponse = await fetch(imageUrl, { cache: 'force-cache' });
    if (!imageResponse.ok || !imageResponse.body) {
      throw new Error('Skin image is unavailable.');
    }
    return new NextResponse(imageResponse.body, {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Type': imageResponse.headers.get('content-type') ?? 'image/jpeg',
      },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
