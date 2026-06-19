import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type FriendProfileSummary = {
  id: string;
  friendshipId: string;
  username: string;
  displayName: string;
  online: boolean;
  unreadCount: number;
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
  last_seen_at: string | null;
  is_banned?: boolean;
};

type FriendshipRow = {
  id: string;
  user_one_id: string;
  user_two_id: string;
};

const ONLINE_WINDOW_MS = 20 * 1000;

function isOnline(lastSeenAt?: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);
}

function toSummary(profile: ProfileRow, unreadCount = 0, friendshipId = ''): FriendProfileSummary {
  return {
    id: profile.id,
    friendshipId,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    online: isOnline(profile.last_seen_at),
    unreadCount,
  };
}

function orderedPair(userId: string, friendId: string) {
  return userId < friendId
    ? { userOneId: userId, userTwoId: friendId }
    : { userOneId: friendId, userTwoId: userId };
}

export async function touchUserPresence(userId: string) {
  await getSupabaseServiceClient()
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}

export async function getFriendDashboard(userId: string) {
  const supabase = getSupabaseServiceClient();
  const { data: friendships, error: friendshipError } = await supabase
    .from('friendships')
    .select('id, user_one_id, user_two_id')
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
    .returns<FriendshipRow[]>();

  if (friendshipError) {
    throw friendshipError;
  }

  const friendIds = (friendships ?? []).map((friendship) => (
    friendship.user_one_id === userId ? friendship.user_two_id : friendship.user_one_id
  ));

  const { data: friendProfiles, error: friendProfilesError } = friendIds.length > 0
    ? await supabase
      .from('profiles')
      .select('id, username, display_name, friend_requests_open, last_seen_at, is_banned')
      .in('id', friendIds)
      .returns<ProfileRow[]>()
    : { data: [], error: null };

  if (friendProfilesError) {
    throw friendProfilesError;
  }

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
    .map((profile) => toSummary(profile, unreadByFriendId.get(profile.id) ?? 0))
    .map((friend) => ({
      ...friend,
      friendshipId: (friendships ?? []).find((friendship) => (
        friendship.user_one_id === friend.id || friendship.user_two_id === friend.id
      ))?.id ?? '',
    }))
    .sort((left, right) => Number(right.online) - Number(left.online) || left.displayName.localeCompare(right.displayName));

  const incomingRequests: IncomingFriendRequest[] = (incoming ?? []).map((request) => ({
    id: request.id,
    requester: toSummary(request.requester),
    createdAt: request.created_at,
  }));

  return {
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
    .select('id, username, display_name, friend_requests_open, last_seen_at, is_banned')
    .ilike('username', `${cleanQuery}%`)
    .neq('id', userId)
    .eq('is_banned', false)
    .gte('last_seen_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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

  const pendingIds = new Set((pendingRequests ?? []).map((request) => (
    request.requester_id === userId ? request.addressee_id : request.requester_id
  )));

  return (profiles ?? []).map((profile) => ({
    ...toSummary(profile),
    friendRequestsOpen: profile.friend_requests_open,
    relationship: friendIds.has(profile.id) ? 'friend' : pendingIds.has(profile.id) ? 'pending' : 'none',
  }));
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

export async function createFriendRequest(userId: string, targetUserId: string) {
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

  if (!target.friend_requests_open) {
    throw new Error('This user is not accepting friend requests.');
  }

  const { userOneId, userTwoId } = orderedPair(userId, targetUserId);
  const { data: existingFriendship, error: friendshipError } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId)
    .maybeSingle<{ id: string }>();

  if (friendshipError) {
    throw friendshipError;
  }

  if (existingFriendship) {
    throw new Error('You are already friends.');
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
}

export async function createFriendRequestByUsername(userId: string, targetUsername: string) {
  const cleanUsername = targetUsername.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  const { data: target, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!target) {
    throw new Error('Profile not found.');
  }

  await createFriendRequest(userId, target.id);
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

  const { userOneId, userTwoId } = orderedPair(request.requester_id, request.addressee_id);
  const { error: friendshipError } = await supabase
    .from('friendships')
    .upsert({ user_one_id: userOneId, user_two_id: userTwoId }, { onConflict: 'user_one_id,user_two_id' });

  if (friendshipError) {
    throw friendshipError;
  }

  const { error: updateError } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', request.id);

  if (updateError) {
    throw updateError;
  }

  await Promise.all([request.requester_id, request.addressee_id].map(async (profileId) => {
    const { count, error } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .or(`user_one_id.eq.${profileId},user_two_id.eq.${profileId}`);

    if (!error) {
      await supabase.from('profiles').update({ friends_count: count ?? 0 }).eq('id', profileId);
    }
  }));
}

export async function getFriendMessages(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const { data: friendship, error: friendshipError } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId)
    .maybeSingle<{ id: string }>();

  if (friendshipError) {
    throw friendshipError;
  }

  if (!friendship) {
    throw new Error('You are not friends with this user.');
  }

  const { data: messages, error } = await supabase
    .from('friend_messages')
    .select('id, sender_id, message, created_at')
    .eq('friendship_id', friendship.id)
    .order('created_at', { ascending: true })
    .limit(100)
    .returns<Array<{ id: string; sender_id: string; message: string; created_at: string }>>();

  if (error) {
    throw error;
  }

  return {
    friendshipId: friendship.id,
    messages: messages ?? [],
  };
}

export async function markFriendMessagesRead(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const { data: friendship, error } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

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

  const { friendshipId } = await getFriendMessages(userId, friendId);
  const { error } = await getSupabaseServiceClient()
    .from('friend_messages')
    .insert({
      friendship_id: friendshipId,
      sender_id: userId,
      message: cleanMessage,
    });

  if (error) {
    throw error;
  }
}

export async function removeFriend(userId: string, friendId: string) {
  const { userOneId, userTwoId } = orderedPair(userId, friendId);
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_one_id', userOneId)
    .eq('user_two_id', userTwoId);

  if (error) {
    throw error;
  }

  await Promise.all([userId, friendId].map(async (profileId) => {
    const { count } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .or(`user_one_id.eq.${profileId},user_two_id.eq.${profileId}`);
    await supabase.from('profiles').update({ friends_count: count ?? 0 }).eq('id', profileId);
  }));
}
