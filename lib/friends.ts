import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { normalizeChatBorder, normalizeChatColor } from '@/lib/chat-colors';
import { sanitizeChatMessage } from '@/lib/chat-filter';

export type FriendProfileSummary = {
  id: string;
  friendshipId: string;
  username: string;
  displayName: string;
  aboutMe: string;
  createdAt: string | null;
  discordUsername: string | null;
  discordAvatarUrl: string | null;
  riotAccountName: string | null;
  online: boolean;
  unreadCount: number;
  chatColor: string;
  chatBorder: string;
  avatarUrl: string | null;
  friendNote: string;
  favorite: boolean;
};

export type IncomingFriendRequest = {
  id: string;
  requester: FriendProfileSummary;
  createdAt: string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  friend_requests_open: boolean;
  about_me?: string | null;
  last_seen_at: string | null;
  created_at?: string | null;
  is_banned?: boolean;
  chat_color?: string | null;
  chat_border?: string | null;
  avatar_url?: string | null;
};

type PrivateProfileDetailsRow = {
  user_id: string;
  discord_username: string | null;
  discord_avatar_url?: string | null;
  riot_account_name: string | null;
};

type FriendshipRow = {
  id: string;
  user_one_id: string;
  user_two_id: string;
  ended_at?: string | null;
  user_one_note?: string | null;
  user_two_note?: string | null;
  user_one_favorite?: boolean | null;
  user_two_favorite?: boolean | null;
};

type FriendMessageRow = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  chat_color?: string | null;
  chat_border?: string | null;
};

const ONLINE_WINDOW_MS = 20 * 1000;
const FRIEND_MESSAGE_RETENTION_DAYS = 30;
type FriendRequestResult = 'requested' | 'accepted';
export type PublicFriendRelationship = 'friend' | 'pending' | 'none';
let endedAtColumnAvailable: boolean | null = null;
let friendPreferenceColumnsAvailable: boolean | null = null;

function isOnline(lastSeenAt?: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);
}

function toSummary(
  profile: ProfileRow,
  unreadCount = 0,
  friendshipId = '',
  options: {
    privateDetails?: PrivateProfileDetailsRow | null;
    friendNote?: string;
    favorite?: boolean;
  } = {},
): FriendProfileSummary {
  return {
    id: profile.id,
    friendshipId,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    aboutMe: profile.about_me ?? '',
    createdAt: profile.created_at ?? null,
    discordUsername: options.privateDetails?.discord_username ?? null,
    discordAvatarUrl: options.privateDetails?.discord_avatar_url ?? null,
    riotAccountName: options.privateDetails?.riot_account_name ?? null,
    online: isOnline(profile.last_seen_at),
    unreadCount,
    chatColor: normalizeChatColor(profile.chat_color),
    chatBorder: normalizeChatBorder(profile.chat_border),
    avatarUrl: profile.avatar_url ?? null,
    friendNote: options.friendNote ?? '',
    favorite: options.favorite ?? false,
  };
}

function orderedPair(userId: string, friendId: string) {
  return userId < friendId
    ? { userOneId: userId, userTwoId: friendId }
    : { userOneId: friendId, userTwoId: userId };
}

function isMissingEndedAtError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (maybeError.code === '42703' || maybeError.code === 'PGRST204' || maybeError.code === 'PGRST200') && text.includes('ended_at');
}

function isMissingChatCosmeticsError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (
    maybeError.code === '42703' ||
    maybeError.code === 'PGRST204'
  ) && (text.includes('chat_color') || text.includes('chat_border'));
}

function isMissingMessageCosmeticsError(error: unknown) {
  return isMissingChatCosmeticsError(error);
}

function isMissingFriendPreferenceError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (
    maybeError.code === '42703' ||
    maybeError.code === 'PGRST204'
  ) && (
    text.includes('user_one_note') ||
    text.includes('user_two_note') ||
    text.includes('user_one_favorite') ||
    text.includes('user_two_favorite')
  );
}

async function selectProfilesByIds(supabase: ReturnType<typeof getSupabaseServiceClient>, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, about_me, friend_requests_open, last_seen_at, created_at, is_banned, chat_color, chat_border, avatar_url')
    .in('id', ids)
    .returns<ProfileRow[]>();

  if (isMissingChatCosmeticsError(error)) {
    const fallback = await supabase
      .from('profiles')
      .select('id, username, display_name, about_me, friend_requests_open, last_seen_at, created_at, is_banned, avatar_url')
      .in('id', ids)
      .returns<ProfileRow[]>();

    if (fallback.error) throw fallback.error;
    return fallback.data ?? [];
  }

  if (error) throw error;
  return data ?? [];
}

async function selectPrivateDetailsByUserIds(supabase: ReturnType<typeof getSupabaseServiceClient>, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, PrivateProfileDetailsRow>();
  }

  const { data, error } = await supabase
    .from('profile_private_details')
    .select('user_id, discord_username, discord_avatar_url, riot_account_name')
    .in('user_id', ids)
    .returns<PrivateProfileDetailsRow[]>();

  if (error) {
    const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || text.includes('profile_private_details')) {
      return new Map<string, PrivateProfileDetailsRow>();
    }
    throw error;
  }

  return new Map((data ?? []).map((details) => [details.user_id, details]));
}

async function getActiveFriendshipsForUser(supabase: ReturnType<typeof getSupabaseServiceClient>, userId: string) {
  if (endedAtColumnAvailable === false) {
    const selectColumns = friendPreferenceColumnsAvailable === false
      ? 'id, user_one_id, user_two_id'
      : 'id, user_one_id, user_two_id, user_one_note, user_two_note, user_one_favorite, user_two_favorite';
    const { data, error } = await supabase
      .from('friendships')
      .select(selectColumns)
      .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
      .returns<FriendshipRow[]>();

    if (isMissingFriendPreferenceError(error)) {
      friendPreferenceColumnsAvailable = false;
      return getActiveFriendshipsForUser(supabase, userId);
    }

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  const selectColumns = friendPreferenceColumnsAvailable === false
    ? 'id, user_one_id, user_two_id, ended_at'
    : 'id, user_one_id, user_two_id, ended_at, user_one_note, user_two_note, user_one_favorite, user_two_favorite';
  const { data, error } = await supabase
    .from('friendships')
    .select(selectColumns)
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
    .is('ended_at', null)
    .returns<FriendshipRow[]>();

  if (isMissingEndedAtError(error)) {
    endedAtColumnAvailable = false;
    return getActiveFriendshipsForUser(supabase, userId);
  }
  if (isMissingFriendPreferenceError(error)) {
    friendPreferenceColumnsAvailable = false;
    return getActiveFriendshipsForUser(supabase, userId);
  }

  if (error) {
    throw error;
  }

  endedAtColumnAvailable = true;
  friendPreferenceColumnsAvailable = true;
  return data ?? [];
}

async function getFriendshipBetween(supabase: ReturnType<typeof getSupabaseServiceClient>, userOneId: string, userTwoId: string) {
  if (endedAtColumnAvailable === false) {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_one_id', userOneId)
      .eq('user_two_id', userTwoId)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    return data ? { ...data, ended_at: null } : null;
  }

  const { data, error } = await supabase
    .from('friendships')
    .select('id, ended_at')
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId)
    .maybeSingle<{ id: string; ended_at: string | null }>();

  if (isMissingEndedAtError(error)) {
    endedAtColumnAvailable = false;
    return getFriendshipBetween(supabase, userOneId, userTwoId);
  }

  if (error) {
    throw error;
  }

  endedAtColumnAvailable = true;
  return data;
}

async function getActiveFriendshipBetween(supabase: ReturnType<typeof getSupabaseServiceClient>, userOneId: string, userTwoId: string) {
  const friendship = await getFriendshipBetween(supabase, userOneId, userTwoId);
  return friendship && !friendship.ended_at ? friendship : null;
}

async function refreshFriendCounts(supabase: ReturnType<typeof getSupabaseServiceClient>, profileIds: string[]) {
  await Promise.all([...new Set(profileIds)].map(async (profileId) => {
    const baseQuery = supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .or(`user_one_id.eq.${profileId},user_two_id.eq.${profileId}`);
    const { count, error } = endedAtColumnAvailable === false
      ? await baseQuery
      : await baseQuery.is('ended_at', null);

    if (isMissingEndedAtError(error)) {
      endedAtColumnAvailable = false;
      const { count: fallbackCount, error: fallbackError } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .or(`user_one_id.eq.${profileId},user_two_id.eq.${profileId}`);

      if (!fallbackError) {
        await supabase.from('profiles').update({ friends_count: fallbackCount ?? 0 }).eq('id', profileId);
      }

      return;
    }

    if (!error) {
      await supabase.from('profiles').update({ friends_count: count ?? 0 }).eq('id', profileId);
    }
  }));
}

async function acceptFriendPair(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  firstUserId: string,
  secondUserId: string,
) {
  const { userOneId, userTwoId } = orderedPair(firstUserId, secondUserId);
  const upsertFriendship = async (includeEndedAt: boolean) => supabase
    .from('friendships')
    .upsert(
      includeEndedAt
        ? { user_one_id: userOneId, user_two_id: userTwoId, ended_at: null }
        : { user_one_id: userOneId, user_two_id: userTwoId },
      { onConflict: 'user_one_id,user_two_id' },
    );
  const { error: friendshipError } = endedAtColumnAvailable === false
    ? await upsertFriendship(false)
    : await upsertFriendship(true);

  if (isMissingEndedAtError(friendshipError)) {
    endedAtColumnAvailable = false;
    const { error } = await upsertFriendship(false);
    if (error) {
      throw error;
    }
  } else if (friendshipError) {
    throw friendshipError;
  } else {
    endedAtColumnAvailable = true;
  }

  const acceptedAt = new Date().toISOString();
  const updates = [
    { requesterId: firstUserId, addresseeId: secondUserId },
    { requesterId: secondUserId, addresseeId: firstUserId },
  ];

  await Promise.all(updates.map(async ({ requesterId, addresseeId }) => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: acceptedAt })
      .eq('requester_id', requesterId)
      .eq('addressee_id', addresseeId)
      .eq('status', 'pending');

    if (error) {
      throw error;
    }
  }));

  await refreshFriendCounts(supabase, [firstUserId, secondUserId]);
}

async function deleteExpiredFriendMessages(supabase: ReturnType<typeof getSupabaseServiceClient>) {
  const cutoff = new Date(Date.now() - FRIEND_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('friend_messages')
    .delete()
    .lt('created_at', cutoff);

  if (error) {
    throw error;
  }
}

export async function touchUserPresence(userId: string) {
  await getSupabaseServiceClient()
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}

export async function getFriendDashboard(userId: string) {
  const supabase = getSupabaseServiceClient();
  await deleteExpiredFriendMessages(supabase);
  const friendships = await getActiveFriendshipsForUser(supabase, userId);

  const friendIds = (friendships ?? []).map((friendship) => (
    friendship.user_one_id === userId ? friendship.user_two_id : friendship.user_one_id
  ));

  const [currentProfile, friendProfiles] = await Promise.all([
    selectProfilesByIds(supabase, [userId]).then((profiles) => profiles[0] ?? null),
    selectProfilesByIds(supabase, friendIds),
  ]);
  const privateDetailsByUserId = await selectPrivateDetailsByUserIds(supabase, friendIds);

  const { data: incoming, error: incomingError } = await supabase
    .from('friend_requests')
    .select('id, created_at, requester:profiles!friend_requests_requester_id_fkey(id, username, display_name, friend_requests_open, last_seen_at)')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<Array<{ id: string; created_at: string; requester: ProfileRow }>>();

  if (incomingError) {
    throw incomingError;
  }

  const { data: readRows } = friendships && friendships.length > 0
    ? await supabase
      .from('friend_message_reads')
      .select('friendship_id, last_read_at')
      .eq('user_id', userId)
      .returns<Array<{ friendship_id: string; last_read_at: string }>>()
    : { data: [] };

  const readByFriendship = new Map((readRows ?? []).map((row) => [row.friendship_id, row.last_read_at]));
  const unreadByFriendId = new Map<string, number>();
  await Promise.all((friendships ?? []).map(async (friendship) => {
    const friendId = friendship.user_one_id === userId ? friendship.user_two_id : friendship.user_one_id;
    const lastReadAt = readByFriendship.get(friendship.id) ?? '1970-01-01T00:00:00.000Z';
    const { count } = await supabase
      .from('friend_messages')
      .select('id', { count: 'exact', head: true })
      .eq('friendship_id', friendship.id)
      .neq('sender_id', userId)
      .gt('created_at', lastReadAt);
    unreadByFriendId.set(friendId, count ?? 0);
  }));

  const friends = (friendProfiles ?? [])
    .filter((profile) => !profile.is_banned)
    .map((profile) => {
      const friendship = (friendships ?? []).find((candidate) => (
        candidate.user_one_id === profile.id || candidate.user_two_id === profile.id
      ));
      const viewerIsUserOne = friendship?.user_one_id === userId;
      return toSummary(profile, unreadByFriendId.get(profile.id) ?? 0, friendship?.id ?? '', {
        privateDetails: privateDetailsByUserId.get(profile.id) ?? null,
        friendNote: viewerIsUserOne ? friendship?.user_one_note ?? '' : friendship?.user_two_note ?? '',
        favorite: viewerIsUserOne ? Boolean(friendship?.user_one_favorite) : Boolean(friendship?.user_two_favorite),
      });
    })
    .sort((left, right) => Number(right.favorite) - Number(left.favorite) || Number(right.online) - Number(left.online) || left.displayName.localeCompare(right.displayName));

  const incomingRequests: IncomingFriendRequest[] = (incoming ?? []).map((request) => ({
    id: request.id,
    requester: toSummary(request.requester),
    createdAt: request.created_at,
  }));

  return {
    currentUser: currentProfile ? toSummary(currentProfile) : null,
    friends,
    incomingRequests,
    pendingRequestCount: incomingRequests.length,
    onlineFriendCount: friends.filter((friend) => friend.online).length,
  };
}

export async function searchFriendCandidates(userId: string, query: string) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 3) {
    return [];
  }

  const supabase = getSupabaseServiceClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, about_me, friend_requests_open, last_seen_at, created_at, is_banned')
    .ilike('username', `${cleanQuery}%`)
    .neq('id', userId)
    .eq('is_banned', false)
    .limit(10)
    .returns<ProfileRow[]>();

  if (error) {
    throw error;
  }

  const { friends } = await getFriendDashboard(userId);
  const friendIds = new Set(friends.map((friend) => friend.id));

  const { data: pendingRequests, error: pendingError } = await supabase
    .from('friend_requests')
    .select('requester_id, addressee_id')
    .eq('status', 'pending')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .returns<Array<{ requester_id: string; addressee_id: string }>>();

  if (pendingError) {
    throw pendingError;
  }

  const pendingByUserId = new Map((pendingRequests ?? []).map((request) => [
    request.requester_id === userId ? request.addressee_id : request.requester_id,
    request.requester_id === userId ? 'outgoing' : 'incoming',
  ]));

  return (profiles ?? []).map((profile) => ({
    ...toSummary(profile),
    friendRequestsOpen: profile.friend_requests_open,
    relationship: friendIds.has(profile.id) ? 'friend' : pendingByUserId.get(profile.id) ?? 'none',
  }));
}

export async function updateFriendPreferences(
  userId: string,
  friendId: string,
  input: { note?: unknown; favorite?: unknown },
) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const friendship = await getActiveFriendshipBetween(supabase, userOneId, userTwoId);
  if (!friendship) {
    throw new Error('You are not friends with this user.');
  }

  const updates: Partial<FriendshipRow> = {};
  if (typeof input.note === 'string') {
    const note = input.note.trim().slice(0, 30);
    if (userId === userOneId) {
      updates.user_one_note = note;
    } else {
      updates.user_two_note = note;
    }
  }
  if (typeof input.favorite === 'boolean') {
    if (userId === userOneId) {
      updates.user_one_favorite = input.favorite;
    } else {
      updates.user_two_favorite = input.favorite;
    }
  }
  if (Object.keys(updates).length === 0) {
    throw new Error('No friend preference changes were provided.');
  }

  const { error } = await supabase
    .from('friendships')
    .update(updates)
    .eq('id', friendship.id);

  if (isMissingFriendPreferenceError(error)) {
    throw new Error('Friend notes and favorites require the latest database migration.');
  }
  if (error) {
    throw error;
  }
}

export async function getFriendRelationship(userId: string, targetUserId: string): Promise<PublicFriendRelationship> {
  if (userId === targetUserId) {
    return 'none';
  }

  const supabase = getSupabaseServiceClient();
  const { userOneId, userTwoId } = orderedPair(userId, targetUserId);
  const friendship = await getActiveFriendshipBetween(supabase, userOneId, userTwoId);
  if (friendship) {
    return 'friend';
  }

  const { data: pendingRequests, error } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('status', 'pending')
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`)
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  return pendingRequests?.length ? 'pending' : 'none';
}

export async function searchExistingFriends(userId: string, query: string) {
  const cleanQuery = query.trim().toLowerCase();
  const { friends } = await getFriendDashboard(userId);
  if (cleanQuery.length < 1) {
    return friends;
  }

  return friends.filter((friend) => (
    friend.username.toLowerCase().includes(cleanQuery) ||
    friend.displayName.toLowerCase().includes(cleanQuery)
  ));
}

export async function createFriendRequest(userId: string, targetUserId: string): Promise<FriendRequestResult> {
  if (userId === targetUserId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const supabase = getSupabaseServiceClient();
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, friend_requests_open')
    .eq('id', targetUserId)
    .maybeSingle<{ id: string; friend_requests_open: boolean }>();

  if (targetError) {
    throw targetError;
  }

  if (!target) {
    throw new Error('Profile not found.');
  }

  const { userOneId, userTwoId } = orderedPair(userId, targetUserId);
  const existingFriendship = await getFriendshipBetween(supabase, userOneId, userTwoId);
  if (existingFriendship && !existingFriendship.ended_at) {
    throw new Error('You are already friends.');
  }

  const { data: reciprocalRequest, error: reciprocalError } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('requester_id', targetUserId)
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .maybeSingle<{ id: string }>();

  if (reciprocalError) {
    throw reciprocalError;
  }

  if (reciprocalRequest) {
    await acceptFriendPair(supabase, userId, targetUserId);
    return 'accepted';
  }

  if (!target.friend_requests_open) {
    throw new Error('This user is not accepting friend requests.');
  }

  const { error } = await supabase
    .from('friend_requests')
    .insert({
      requester_id: userId,
      addressee_id: targetUserId,
    });

  if (error) {
    if (error.code === '23505') {
      throw new Error('A friend request is already pending.');
    }

    throw error;
  }

  return 'requested';
}

export async function createFriendRequestByUsername(userId: string, targetUsername: string): Promise<FriendRequestResult> {
  const cleanUsername = targetUsername.trim();
  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  const { data: target, error } = await getSupabaseServiceClient()
    .rpc('find_profile_by_username_ci', { search_username: cleanUsername })
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!target) {
    throw new Error('Profile not found.');
  }

  return createFriendRequest(userId, target.id);
}

export async function respondToFriendRequest(userId: string, requestId: string, action: 'accept' | 'decline') {
  const supabase = getSupabaseServiceClient();
  const { data: request, error: requestError } = await supabase
    .from('friend_requests')
    .select('id, requester_id, addressee_id, status')
    .eq('id', requestId)
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .maybeSingle<{ id: string; requester_id: string; addressee_id: string; status: string }>();

  if (requestError) {
    throw requestError;
  }

  if (!request) {
    throw new Error('Friend request not found.');
  }

  if (action === 'decline') {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', request.id);

    if (error) {
      throw error;
    }

    return;
  }

  await acceptFriendPair(supabase, request.requester_id, request.addressee_id);
}

export async function getFriendMessages(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const friendship = await getActiveFriendshipBetween(supabase, userOneId, userTwoId);

  if (!friendship) {
    throw new Error('You are not friends with this user.');
  }

  await deleteExpiredFriendMessages(supabase);

  const { data: messages, error } = await supabase
    .from('friend_messages')
    .select('id, sender_id, message, created_at, chat_color, chat_border')
    .eq('friendship_id', friendship.id)
    .order('created_at', { ascending: true })
    .limit(100)
    .returns<FriendMessageRow[]>();

  let messageRows = messages ?? [];
  let messageError = error;
  if (isMissingMessageCosmeticsError(error)) {
    const fallback = await supabase
      .from('friend_messages')
      .select('id, sender_id, message, created_at')
      .eq('friendship_id', friendship.id)
      .order('created_at', { ascending: true })
      .limit(100)
      .returns<FriendMessageRow[]>();
    messageRows = fallback.data ?? [];
    messageError = fallback.error;
  }

  if (messageError) {
    throw messageError;
  }

  const { data: readRow, error: readError } = await supabase
    .from('friend_message_reads')
    .select('last_read_at')
    .eq('user_id', userId)
    .eq('friendship_id', friendship.id)
    .maybeSingle<{ last_read_at: string }>();

  if (readError) {
    throw readError;
  }

  const profiles = await selectProfilesByIds(supabase, [userId, friendId]);
  const lastReadAt = readRow?.last_read_at ?? '1970-01-01T00:00:00.000Z';
  const firstUnreadMessageId = messageRows.find((message) => (
    message.sender_id !== userId && message.created_at > lastReadAt
  ))?.id ?? null;

  return {
    friendshipId: friendship.id,
    firstUnreadMessageId,
    messages: messageRows.map((message) => ({
      ...message,
      chat_color: normalizeChatColor(message.chat_color),
      chat_border: normalizeChatBorder(message.chat_border),
    })),
    profiles: Object.fromEntries(profiles.map((profile) => [
      profile.id,
      {
        chatColor: normalizeChatColor(profile.chat_color),
        chatBorder: normalizeChatBorder(profile.chat_border),
        avatarUrl: profile.avatar_url ?? null,
      },
    ])),
  };
}

export async function markFriendMessagesRead(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const friendship = await getActiveFriendshipBetween(supabase, userOneId, userTwoId);

  if (!friendship) {
    throw new Error('You are not friends with this user.');
  }

  const { error: upsertError } = await supabase
    .from('friend_message_reads')
    .upsert({
      user_id: userId,
      friendship_id: friendship.id,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'user_id,friendship_id' });

  if (upsertError) {
    throw upsertError;
  }
}

export async function sendFriendMessage(userId: string, friendId: string, message: string) {
  const cleanMessage = message.trim().slice(0, 1000);
  if (!cleanMessage) {
    throw new Error('Message is required.');
  }
  const filteredMessage = sanitizeChatMessage(cleanMessage);

  const supabase = getSupabaseServiceClient();
  const { friendshipId } = await getFriendMessages(userId, friendId);
  const [profile] = await selectProfilesByIds(supabase, [userId]);
  const { error } = await supabase
    .from('friend_messages')
    .insert({
      friendship_id: friendshipId,
      sender_id: userId,
      message: filteredMessage,
      chat_color: normalizeChatColor(profile?.chat_color),
      chat_border: normalizeChatBorder(profile?.chat_border),
    });

  if (error) {
    throw error;
  }
}

export async function removeFriend(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const endFriendship = async () => supabase
    .from('friendships')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId)
    .is('ended_at', null);
  const { error } = endedAtColumnAvailable === false
    ? await supabase.from('friendships').delete().eq('user_one_id', userOneId).eq('user_two_id', userTwoId)
    : await endFriendship();

  if (isMissingEndedAtError(error)) {
    endedAtColumnAvailable = false;
    const { error: fallbackError } = await supabase
      .from('friendships')
      .delete()
      .eq('user_one_id', userOneId)
      .eq('user_two_id', userTwoId);

    if (fallbackError) {
      throw fallbackError;
    }

    await refreshFriendCounts(supabase, [userId, friendId]);
    return;
  }

  if (error) {
    throw error;
  }

  await refreshFriendCounts(supabase, [userId, friendId]);
}
