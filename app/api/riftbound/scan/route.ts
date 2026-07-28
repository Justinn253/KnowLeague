import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type ScanBody = {
  image?: unknown;
};

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: unknown };
    textAnnotations?: Array<{ description?: unknown }>;
    error?: { message?: unknown };
  }>;
};

const MAX_IMAGE_DATA_LENGTH = 2_500_000;

function readImageContent(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IMAGE_DATA_LENGTH) {
    throw new Error('A valid scan image is required.');
  }

  const match = value.match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[1]) throw new Error('The scan image must be a JPEG or PNG data URL.');
  return match[1];
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:scan',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 20, windowMs: 60_000 },
      errorMessage: 'Too many card scans. Please wait a moment before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Cloud card recognition is not configured.' }, { status: 503 });
    }

    const body = await readJsonBody<ScanBody>(request);
    const imageContent = readImageContent(body.image);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let visionResponse: Response;
    try {
      visionResponse = await fetch('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          requests: [{
            image: { content: imageContent },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseBody = await visionResponse.json() as VisionResponse;
    const serviceError = responseBody.responses?.[0]?.error?.message;
    if (!visionResponse.ok || typeof serviceError === 'string') {
      throw new Error(typeof serviceError === 'string' ? serviceError : 'Cloud card recognition failed.');
    }

    const fullText = responseBody.responses?.[0]?.fullTextAnnotation?.text;
    const fallbackText = responseBody.responses?.[0]?.textAnnotations?.[0]?.description;
    const text = typeof fullText === 'string' ? fullText : typeof fallbackText === 'string' ? fallbackText : '';

    return NextResponse.json({ text, source: 'google-cloud-vision' });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
