import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { searchExistingFriends, searchFriendCandidates } from '@/lib/friends';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const friendSearchRateLimit = getDualRateLimit('friendSearch');

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'friend-search',
      ip: friendSearchRateLimit.ip,
      subject: { id: userId, ...friendSearchRateLimit.subject },
      errorMessage: 'Too many search requests. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    const results = scope === 'friends'
      ? await searchExistingFriends(userId, url.searchParams.get('q') ?? '')
      : await searchFriendCandidates(userId, url.searchParams.get('q') ?? '');
    return NextResponse.json({ results });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
