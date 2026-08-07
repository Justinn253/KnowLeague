import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { getUserAchievements } from '@/lib/achievements-server';
import { getFriendRelationshipDetails } from '@/lib/friends';
import { isAdminAuthUser } from '@/lib/moderation';
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
  chat_color: string | null;
  chat_border: string | null;
  profile_visibility: 'public' | 'private';
  friends_count: number;
  friend_requests_open: boolean;
  profile_status?: string | null;
  friends_list_public?: boolean | null;
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

    let username = '';
    try {
      username = decodeURIComponent(params.username).trim();
    } catch {
      throw new Error('Profile not found.');
    }
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

    let { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, about_me, avatar_url, chat_color, chat_border, profile_visibility, friends_count, friend_requests_open, profile_status, friends_list_public, selected_title_reward_id, displayed_badge_reward_ids, created_at')
      .eq('id', matchingProfile.id)
      .maybeSingle<PublicProfileRow>();

    if (error && (isMissingColumnError(error, 'chat_color') || isMissingColumnError(error, 'chat_border'))) {
      const fallback = await supabase
        .from('profiles')
        .select('id, username, display_name, about_me, avatar_url, profile_visibility, friends_count, friend_requests_open, profile_status, friends_list_public, selected_title_reward_id, displayed_badge_reward_ids, created_at')
        .eq('id', matchingProfile.id)
        .maybeSingle<Omit<PublicProfileRow, 'chat_color' | 'chat_border'>>();
      profile = fallback.data ? { ...fallback.data, chat_color: 'amber', chat_border: 'black' } : null;
      error = fallback.error;
    }

    if (error && (isMissingColumnError(error, 'profile_status') || isMissingColumnError(error, 'friends_list_public'))) {
      const fallback = await supabase
        .from('profiles')
        .select('id, username, display_name, about_me, avatar_url, chat_color, chat_border, profile_visibility, friends_count, friend_requests_open, selected_title_reward_id, displayed_badge_reward_ids, created_at')
        .eq('id', matchingProfile.id)
        .maybeSingle<Omit<PublicProfileRow, 'profile_status' | 'friends_list_public'>>();
      profile = fallback.data ? { ...fallback.data, profile_status: '', friends_list_public: true } : null;
      error = fallback.error;
    }

    if (error && isMissingColumnError(error, 'profile_visibility')) {
      const fallback = await supabase
        .from('profiles')
        .select('id, username, display_name, about_me, avatar_url, chat_color, chat_border, profile_status, friends_list_public, friends_count, friend_requests_open, selected_title_reward_id, displayed_badge_reward_ids, created_at')
        .eq('id', matchingProfile.id)
        .maybeSingle<Omit<PublicProfileRow, 'profile_visibility'>>();
      profile = fallback.data ? { ...fallback.data, profile_visibility: 'public' } : null;
      error = fallback.error;
    }

    if (error) {
      throw error;
    }
    if (!profile) {
      throw new Error('Profile not found.');
    }

    const viewerUser = await getOptionalAuthenticatedUser(request);
    const viewerId = viewerUser?.id ?? null;
    const viewerIsAdmin = isAdminAuthUser(viewerUser);
    if (profile.profile_visibility === 'private' && viewerId !== profile.id && !viewerIsAdmin) {
      throw new Error('Profile not found.');
    }

    const [privateDetails, relationshipDetails, achievements, moderationProfile] = await Promise.all([
      fetchPrivateDetails(profile.id),
      viewerId ? getFriendRelationshipDetails(viewerId, profile.id) : { relationship: 'none' as const, friendNote: '', blocked: false },
      getUserAchievements(profile.id),
      viewerIsAdmin
        ? supabase.from('profiles').select('is_banned').eq('id', profile.id).maybeSingle<{ is_banned: boolean | null }>()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (moderationProfile.error) throw moderationProfile.error;

    return NextResponse.json({
      viewer: {
        isOwner: viewerId === profile.id,
        isAdmin: viewerIsAdmin,
      },
      profile: {
        ...profile,
        discord_username: privateDetails?.discord_username ?? null,
        discord_avatar_url: privateDetails?.discord_avatar_url ?? null,
        discord_banner_url: privateDetails?.discord_banner_url ?? null,
        riot_account_name: privateDetails?.riot_account_name ?? null,
        profile_status: profile.profile_status ?? '',
        friends_list_public: profile.friends_list_public !== false,
        selected_title_reward_id: profile.selected_title_reward_id ?? null,
        displayed_badge_reward_ids: profile.displayed_badge_reward_ids ?? [],
        achievements,
        relationship: relationshipDetails.relationship,
        friend_note: relationshipDetails.friendNote,
        blocked: relationshipDetails.blocked,
        ...(viewerIsAdmin ? { is_banned: Boolean(moderationProfile.data?.is_banned) } : {}),
      },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
