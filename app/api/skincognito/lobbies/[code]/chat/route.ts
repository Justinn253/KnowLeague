import { NextResponse } from 'next/server';
import { postSkincognitoChatMessage } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ChatBody = {
  clientId: string;
  message: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ChatBody>(request);
    const view = await postSkincognitoChatMessage(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.message, 'message'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
