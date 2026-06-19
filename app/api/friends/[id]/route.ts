import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { removeFriend } from '@/lib/friends';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await removeFriend(userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
