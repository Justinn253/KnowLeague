import { NextResponse } from 'next/server';
import { postCategoryClashChatMessage } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ChatBody = { clientId: string; message: string };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ChatBody>(request);
    return NextResponse.json(await postCategoryClashChatMessage(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.message, 'message'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
