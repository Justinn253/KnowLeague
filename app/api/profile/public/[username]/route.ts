import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getUserAchievements } from '@/lib/achievements-server';
import { getFriendRelationship } from '@/lib/friends';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

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
    const username = decodeURIComponent(params.username).trim().toLowerCase();
    if (!username) {
      throw new Error('Profile not found.');
    }

    const supabase = getSupabaseServiceClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, about_me, avatar_url, friends_count, friend_requests_open, selected_title_reward_id, displayed_badge_reward_ids, created_at')
      .eq('username', username)
      .maybeSingle<PublicProfileRow>();

    if (error) {
      throw error;
    }
    if (!profile) {
      throw new Error('Profile not found.');
    }

    const [privateDetails, viewerId, achievements] = await Promise.all([
      fetchPrivateDetails(profile.id),
      getOptionalAuthenticatedUserId(request),
      getUserAchievements(profile.id),
    ]);
    const relationship = viewerId ? await getFriendRelationship(viewerId, profile.id) : 'none';

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
