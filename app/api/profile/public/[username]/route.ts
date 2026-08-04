import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getUserAchievements } from '@/lib/achievements-server';
import { getFriendRelationship } from '@/lib/friends';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getIpRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const publicProfileRateLimit = getIpRateLimit('publicProfile');

type PublicProfileRow = {
  id: string;
  username: string;
  display_name: string;
  about_me: string;
  avatar_url: string | null;
  friends_count: number;
  friend_requests_open: boolean;
  selected_title_reward_id?: string | null;
  displayed_badge_reward_ids?: string[] | null;
  created_at: string;
};

type PrivateProfileDetailsRow = {
  discord_username: string | null;
  discord_avatar_url?: string | null;
  discord_banner_url?: string | null;
  riot_account_name: string | null;
};

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (maybeError.code === '42703' || maybeError.code === 'PGRST204') && text.includes(column);
}

async function fetchPrivateDetails(userId: string) {
  const supabase = getSupabaseServiceClient();
  let { data, error } = await supabase
    .from('profile_private_details')
    .select('discord_username, discord_avatar_url, discord_banner_url, riot_account_name')
    .eq('user_id', userId)
    .maybeSingle<PrivateProfileDetailsRow>();

  if (error && isMissingColumnError(error, 'discord_banner_url')) {
    const fallback = await supabase
      .from('profile_private_details')
      .select('discord_username, discord_avatar_url, riot_account_name')
      .eq('user_id', userId)
      .maybeSingle<PrivateProfileDetailsRow>();
    data = fallback.data ? { ...fallback.data, discord_banner_url: null } : null;
    error = fallback.error;
  }

  if (error && isMissingColumnError(error, 'discord_avatar_url')) {
    const fallback = await supabase
      .from('profile_private_details')
      .select('discord_username, riot_account_name')
      .eq('user_id', userId)
      .maybeSingle<PrivateProfileDetailsRow>();
    data = fallback.data ? { ...fallback.data, discord_avatar_url: null, discord_banner_url: null } : null;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: Request, { params }: { params: { username: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'public-profile',
      ip: publicProfileRateLimit,
      errorMessage: 'Too many profile requests. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const username = decodeURIComponent(params.username).trim();
    if (!username) {
      throw new Error('Profile not found.');
    }

    const supabase = getSupabaseServiceClient();
    const { data: matchingProfile, error: matchError } = await supabase
      .rpc('find_profile_by_username_ci', { search_username: username })
      .maybeSingle<{ id: string; username: string }>();
    if (matchError) {
      throw matchError;
    }
    if (!matchingProfile) {
      throw new Error('Profile not found.');
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, about_me, avatar_url, friends_count, friend_requests_open, selected_title_reward_id, displayed_badge_reward_ids, created_at')
      .eq('id', matchingProfile.id)
      .maybeSingle<PublicProfileRow>();

    if (error) {
      throw error;
    }
    if (!profile) {
      throw new Error('Profile not found.');
    }

    const [privateDetails, relationship, achievements] = await Promise.all([
      fetchPrivateDetails(profile.id),
      getOptionalAuthenticatedUserId(request).then((viewerId) => (
        viewerId ? getFriendRelationship(viewerId, profile.id) : 'none'
      )),
      getUserAchievements(profile.id, { includeGlobalStats: false }),
    ]);

    return NextResponse.json({
      profile: {
        ...profile,
        discord_username: privateDetails?.discord_username ?? null,
        discord_avatar_url: privateDetails?.discord_avatar_url ?? null,
        discord_banner_url: privateDetails?.discord_banner_url ?? null,
        riot_account_name: privateDetails?.riot_account_name ?? null,
        selected_title_reward_id: profile.selected_title_reward_id ?? null,
        displayed_badge_reward_ids: profile.displayed_badge_reward_ids ?? [],
        achievements,
        relationship,
      },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
