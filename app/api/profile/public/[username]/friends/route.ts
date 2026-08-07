import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { getPublicFriendList } from '@/lib/friends';
import { isAdminAuthUser } from '@/lib/moderation';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { getIpRateLimit } from '@/lib/abuse-controls';

export const runtime = 'nodejs';
const publicFriendsRateLimit = getIpRateLimit('publicProfile');

export async function GET(request: Request, { params }: { params: { username: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'public-profile-friends',
      ip: publicFriendsRateLimit,
      errorMessage: 'Too many friends-list requests. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const username = decodeURIComponent(params.username).trim();
    const supabase = getSupabaseServiceClient();
    const { data: profile, error: profileError } = await supabase
      .rpc('find_profile_by_username_ci', { search_username: username })
      .maybeSingle<{ id: string; username: string }>();
    if (profileError) throw profileError;
    if (!profile) throw new Error('Profile not found.');

    const viewer = await getOptionalAuthenticatedUser(request);
    const result = await getPublicFriendList(profile.id, viewer?.id ?? null, isAdminAuthUser(viewer));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
