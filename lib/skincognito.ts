import { getSkinCatalog } from '@/lib/catalogs';
import { normalizeAnswer, type QuizItem } from '@/lib/quiz';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { canReconnect, getReconnectDeadline, resolveMultiplayerLifecycle } from '@/lib/multiplayer-lifecycle';
import { forfeitOutstandingReconnects } from '@/lib/multiplayer-reconnect';
import { DEFAULT_CHAT_BORDER, normalizeChatBorder, normalizeChatColor, type ChatBorder, type ChatColor } from '@/lib/chat-colors';
import {
  addMultiplayerLobbyEvent,
  assertMultiplayerAccountAvailable,
  assertMultiplayerHost,
  assertSupabaseConfigured,
  generateMultiplayerLobbyCode,
  getFreshConnectedMembers,
  getStaleConnectedMembers,
  MULTIPLAYER_MAX_LOBBY_PLAYERS,
  normalizeLobbyCode,
  resolveMultiplayerDisplayName,
} from '@/lib/multiplayer-session';

export type SkincognitoCategoryId = 'skin' | 'champion' | 'skinLine' | 'releaseYear' | 'rarity' | 'gender' | 'role' | 'race';
export type SkincognitoLobbyStatus = 'waiting' | 'active' | 'finished' | 'terminated';
export type SkincognitoPlayerRole = 'host' | 'opponent' | 'spectator';
export type SkincognitoActionType = 'category_guess' | 'skin_guess';

export type SkincognitoLobbyRecord = {
  id: string;
  code: string;
  status: SkincognitoLobbyStatus;
  host_player_id: string | null;
  player_one_id: string | null;
  player_two_id: string | null;
  current_turn_player_id: string | null;
  winner_player_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  terminated_at: string | null;
  return_to_lobby_at: string | null;
  is_public: boolean;
};

export type SkincognitoPlayerRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: SkincognitoPlayerRole;
  selected_skin_id: string | null;
  selected_skin_answer: string | null;
  selected_skin_image_url: string | null;
  connected: boolean;
  joined_at: string;
  last_seen_at: string;
  disconnected_at: string | null;
};

export type SkincognitoActionRecord = {
  id: string;
  lobby_id: string;
  player_id: string;
  action_type: SkincognitoActionType;
  category_id: SkincognitoCategoryId | null;
  guess_value: string;
  is_correct: boolean;
  result_hint: string | null;
  created_at: string;
};

export type SkincognitoChatMessageRecord = {
  id: string;
  lobby_id: string;
  player_id: string | null;
  message: string;
  message_type: 'player' | 'system';
  chat_color: ChatColor;
  chat_border: ChatBorder;
  created_at: string;
};

type SkincognitoBanRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  banned_by_player_id: string | null;
  created_at: string;
};

export type SkincognitoPublicPlayer = Omit<
  SkincognitoPlayerRecord,
  'client_id' | 'selected_skin_id' | 'selected_skin_answer' | 'selected_skin_image_url'
> & {
  chat_color: ChatColor;
  chat_border: ChatBorder;
  avatar_url: string | null;
  is_requesting_player: boolean;
  selected_skin?: {
    id: string;
    answer: string;
    imageUrl: string;
  } | null;
  has_selected_skin: boolean;
};

export type SkincognitoLobbyView = {
  lobby: SkincognitoLobbyRecord;
  requestingPlayer: SkincognitoPublicPlayer | null;
  players: SkincognitoPublicPlayer[];
  actions: SkincognitoActionRecord[];
  chatMessages: SkincognitoChatMessageRecord[];
  finishedSkinUseCount: number | null;
};

export type SkincognitoPublicLobby = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
};

type CreateOrJoinInput = {
  clientId: string;
  authUserId?: string | null;
  selectedSkinId?: string | null;
  requirePublic?: boolean;
};

type SubmitActionInput = {
  clientId: string;
  actionType: SkincognitoActionType;
  categoryId?: SkincognitoCategoryId | null;
  guessValue: string;
};

const MAX_LOBBY_PLAYERS = MULTIPLAYER_MAX_LOBBY_PLAYERS;
const CHAT_MESSAGE_MAX_LENGTH = 240;

type ProfileChatCosmetics = {
  color: ChatColor;
  border: ChatBorder;
  avatarUrl: string | null;
};

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

async function fetchProfileChatCosmetics(authUserIds: string[]) {
  const uniqueIds = Array.from(new Set(authUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, ProfileChatCosmetics>();
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id, chat_color, chat_border, avatar_url')
    .in('id', uniqueIds)
    .returns<Array<{ id: string; chat_color: string | null; chat_border: string | null; avatar_url: string | null }>>();

  if (isMissingChatCosmeticsError(error)) {
    return new Map<string, ProfileChatCosmetics>();
  }

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((profile) => [
    profile.id,
    {
      color: normalizeChatColor(profile.chat_color),
      border: normalizeChatBorder(profile.chat_border),
      avatarUrl: profile.avatar_url ?? null,
    },
  ]));
}

function getSkinById(skinId?: string | null) {
  if (!skinId) {
    return null;
  }

  return getSkinCatalog().find((skin) => skin.id === skinId) ?? null;
}

function getRandomSkin() {
  const skins = getSkinCatalog();
  return skins[Math.floor(Math.random() * skins.length)];
}

function getCategoryValue(item: QuizItem, categoryId: SkincognitoCategoryId) {
  if (categoryId === 'skin') {
    return item.answer;
  }

  if (categoryId === 'releaseYear') {
    return item.releaseDate?.slice(0, 4) || 'Unknown';
  }

  if (categoryId === 'rarity') {
    const rarity = item.rarity || 'Unknown';
    return rarity.startsWith('k') ? rarity.slice(1) : rarity;
  }

  const value = item[categoryId as keyof QuizItem];
  return typeof value === 'string' && value.trim() ? value : 'Unknown';
}

function valuesMatch(categoryId: SkincognitoCategoryId, guessValue: string, targetSkin: QuizItem) {
  const targetValue = getCategoryValue(targetSkin, categoryId);

  if (categoryId === 'race') {
    const guessedSpecies = guessValue.split(',').map(normalizeAnswer).filter(Boolean);
    const targetSpecies = targetValue.split(',').map(normalizeAnswer).filter(Boolean);
    return guessedSpecies.some((species) => targetSpecies.includes(species));
  }

  return normalizeAnswer(guessValue) === normalizeAnswer(targetValue);
}

function getResultHint(categoryId: SkincognitoCategoryId, guessValue: string, targetSkin: QuizItem) {
  if (categoryId !== 'releaseYear') {
    return null;
  }

  const guessedYear = Number(guessValue);
  const targetYear = Number(getCategoryValue(targetSkin, categoryId));
  if (!Number.isFinite(guessedYear) || !Number.isFinite(targetYear) || guessedYear === targetYear) {
    return null;
  }

  return guessedYear < targetYear ? 'higher' : 'lower';
}

function canSeeSelectedSkin(
  player: SkincognitoPlayerRecord,
  requestingPlayerId: string | null,
  lobbyStatus: SkincognitoLobbyStatus,
) {
  return player.id === requestingPlayerId || lobbyStatus === 'finished' || lobbyStatus === 'terminated';
}

function toPublicPlayer(
  player: SkincognitoPlayerRecord,
  requestingPlayerId: string | null,
  lobbyStatus: SkincognitoLobbyStatus,
  chatCosmeticsByUserId = new Map<string, ProfileChatCosmetics>(),
): SkincognitoPublicPlayer {
  const revealSkin = canSeeSelectedSkin(player, requestingPlayerId, lobbyStatus);
  const chatCosmetics = player.auth_user_id ? chatCosmeticsByUserId.get(player.auth_user_id) : null;

  return {
    id: player.id,
    lobby_id: player.lobby_id,
    auth_user_id: player.auth_user_id,
    display_name: player.display_name,
    chat_color: chatCosmetics?.color ?? 'amber',
    chat_border: chatCosmetics?.border ?? DEFAULT_CHAT_BORDER,
    avatar_url: chatCosmetics?.avatarUrl ?? null,
    role: player.role,
    connected: player.connected,
    joined_at: player.joined_at,
    last_seen_at: player.last_seen_at,
    disconnected_at: player.disconnected_at,
    is_requesting_player: player.id === requestingPlayerId,
    selected_skin: revealSkin && player.selected_skin_id && player.selected_skin_answer && player.selected_skin_image_url
      ? {
          id: player.selected_skin_id,
          answer: player.selected_skin_answer,
          imageUrl: player.selected_skin_image_url,
        }
      : null,
    has_selected_skin: Boolean(player.selected_skin_id),
  };
}

async function fetchLobbyByCode(code: string) {
  assertSupabaseConfigured();

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('skincognito_lobbies')
    .select('*')
    .eq('code', normalizeLobbyCode(code))
    .maybeSingle<SkincognitoLobbyRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPlayers(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })
    .returns<SkincognitoPlayerRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchBans(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_bans')
    .select('*')
    .eq('lobby_id', lobbyId)
    .returns<SkincognitoBanRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchActions(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_actions')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: true })
    .limit(100)
    .returns<SkincognitoActionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchChatMessages(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_chat_messages')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: true })
    .limit(100)
    .returns<SkincognitoChatMessageRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function addSystemMessage(lobbyId: string, message: string, playerId?: string | null) {
  const { error } = await getSupabaseServiceClient()
    .from('skincognito_chat_messages')
    .insert({
      lobby_id: lobbyId,
      player_id: playerId ?? null,
      message,
      message_type: 'system',
      chat_color: 'amber',
      chat_border: DEFAULT_CHAT_BORDER,
    });

  if (error) {
    throw error;
  }
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  await addMultiplayerLobbyEvent('skincognito_lobby_events', lobbyId, eventType);
}

async function getLobbyView(lobby: SkincognitoLobbyRecord, clientId?: string | null): Promise<SkincognitoLobbyView> {
  const [players, actions, chatMessages] = await Promise.all([
    fetchPlayers(lobby.id),
    fetchActions(lobby.id),
    fetchChatMessages(lobby.id),
  ]);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const winnerPlayer = lobby.winner_player_id ? players.find((player) => player.id === lobby.winner_player_id) : null;
  const targetPlayerId = winnerPlayer?.id === lobby.player_one_id ? lobby.player_two_id : winnerPlayer?.id === lobby.player_two_id ? lobby.player_one_id : null;
  const targetPlayer = targetPlayerId ? players.find((player) => player.id === targetPlayerId) : null;
  const finishedTargetSkinId = lobby.status === 'finished' ? targetPlayer?.selected_skin_id : null;
  const [chatCosmeticsByUserId, finishedSkinUseCount] = await Promise.all([
    fetchProfileChatCosmetics(players.map((player) => player.auth_user_id).filter((id): id is string => Boolean(id))),
    finishedTargetSkinId ? countSkincognitoSkinUses(finishedTargetSkinId) : Promise.resolve(null),
  ]);

  return {
    lobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer, requestingPlayer.id, lobby.status, chatCosmeticsByUserId) : null,
    players: players.map((player) => toPublicPlayer(player, requestingPlayer?.id ?? null, lobby.status, chatCosmeticsByUserId)),
    actions,
    chatMessages,
    finishedSkinUseCount,
  };
}

async function countSkincognitoSkinUses(skinId: string) {
  const { count, error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .select('id', { count: 'exact', head: true })
    .eq('selected_skin_id', skinId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function upsertPlayer(lobby: SkincognitoLobbyRecord, input: CreateOrJoinInput, role: SkincognitoPlayerRole) {
  const selectedSkin = role === 'spectator' ? null : getSkinById(input.selectedSkinId);
  const displayName = await resolveMultiplayerDisplayName(input);

  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .upsert(
      {
        lobby_id: lobby.id,
        client_id: input.clientId,
        auth_user_id: input.authUserId ?? null,
        display_name: displayName,
        role,
        selected_skin_id: selectedSkin?.id ?? null,
        selected_skin_answer: selectedSkin?.answer ?? null,
        selected_skin_image_url: selectedSkin?.imageUrl ?? null,
        connected: true,
        last_seen_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: 'lobby_id,client_id' },
    )
    .select('*')
    .single<SkincognitoPlayerRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function removePlayerFromLobby(lobby: SkincognitoLobbyRecord, player: SkincognitoPlayerRecord) {
  const { error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .delete()
    .eq('id', player.id);

  if (error) {
    throw error;
  }

  const updates: Partial<SkincognitoLobbyRecord> = {};
  if (lobby.host_player_id === player.id) {
    updates.host_player_id = null;
  }

  if (lobby.player_one_id === player.id) {
    updates.player_one_id = null;
  }

  if (lobby.player_two_id === player.id) {
    updates.player_two_id = null;
  }

  if (lobby.current_turn_player_id === player.id) {
    updates.current_turn_player_id = null;
  }

  if (Object.keys(updates).length) {
    return updateLobby(lobby.id, updates);
  }

  return lobby;
}

async function updateLobby(lobbyId: string, values: Partial<SkincognitoLobbyRecord>) {
  const { data, error } = await getSupabaseServiceClient()
    .from('skincognito_lobbies')
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobbyId)
    .select('*')
    .single<SkincognitoLobbyRecord>();

  if (error) {
    throw error;
  }

  return data;
}

function getWaitingLobbyRole(
  playerId: string,
  playerOneId: string | null,
  playerTwoId: string | null,
  hostPlayerId: string | null,
): SkincognitoPlayerRole {
  if (playerId !== playerOneId && playerId !== playerTwoId) return 'spectator';
  if (playerId === hostPlayerId) return 'host';
  return 'opponent';
}

async function updateWaitingLobbyPlayerRoles(
  players: SkincognitoPlayerRecord[],
  playerOneId: string | null,
  playerTwoId: string | null,
  hostPlayerId: string | null,
) {
  const currentHostIdsToDemote = players
    .filter((player) => player.role === 'host' && getWaitingLobbyRole(player.id, playerOneId, playerTwoId, hostPlayerId) !== 'host')
    .map((player) => player.id);

  if (currentHostIdsToDemote.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({ role: 'spectator' })
      .in('id', currentHostIdsToDemote);
    if (error) {
      throw error;
    }
  }

  const activeHost = hostPlayerId
    ? players.find((player) => player.id === hostPlayerId && getWaitingLobbyRole(player.id, playerOneId, playerTwoId, hostPlayerId) === 'host')
    : null;

  await Promise.all(players.filter((player) => player.id !== activeHost?.id).map(async (player) => {
    const role = getWaitingLobbyRole(player.id, playerOneId, playerTwoId, hostPlayerId);
    const isSpectator = role === 'spectator';
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        role,
        selected_skin_id: isSpectator ? null : player.selected_skin_id,
        selected_skin_answer: isSpectator ? null : player.selected_skin_answer,
        selected_skin_image_url: isSpectator ? null : player.selected_skin_image_url,
      })
      .eq('id', player.id);

    if (error) {
      throw error;
    }
  }));

  if (activeHost) {
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        role: 'host',
        selected_skin_id: activeHost.selected_skin_id,
        selected_skin_answer: activeHost.selected_skin_answer,
        selected_skin_image_url: activeHost.selected_skin_image_url,
      })
      .eq('id', activeHost.id);
    if (error) {
      throw error;
    }
  }
}

async function reconcileLobby(lobby: SkincognitoLobbyRecord) {
  let players = await fetchPlayers(lobby.id);
  let nextLobby = lobby;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  if (
    nextLobby.status === 'finished' &&
    nextLobby.return_to_lobby_at &&
    nowMs >= new Date(nextLobby.return_to_lobby_at).getTime()
  ) {
    const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
    if (disconnectedPlayerIds.length > 0) {
      const { error: playersDeleteError } = await getSupabaseServiceClient()
        .from('skincognito_players')
        .delete()
        .in('id', disconnectedPlayerIds);

      if (playersDeleteError) {
        throw playersDeleteError;
      }

      players = await fetchPlayers(nextLobby.id);
    }

    const { error: actionsDeleteError } = await getSupabaseServiceClient()
      .from('skincognito_actions')
      .delete()
      .eq('lobby_id', nextLobby.id);

    if (actionsDeleteError) {
      throw actionsDeleteError;
    }

    const { error: chatDeleteError } = await getSupabaseServiceClient()
      .from('skincognito_chat_messages')
      .delete()
      .eq('lobby_id', nextLobby.id);

    if (chatDeleteError) {
      throw chatDeleteError;
    }

    const remainingPlayerIds = players.map((player) => player.id);
    if (remainingPlayerIds.length > 0) {
      const { error: skinClearError } = await getSupabaseServiceClient()
        .from('skincognito_players')
        .update({
          selected_skin_id: null,
          selected_skin_answer: null,
          selected_skin_image_url: null,
        })
        .in('id', remainingPlayerIds);

      if (skinClearError) {
        throw skinClearError;
      }
    }

    nextLobby = await updateLobby(nextLobby.id, {
      status: 'waiting',
      current_turn_player_id: null,
      winner_player_id: null,
      started_at: null,
      finished_at: null,
      return_to_lobby_at: null,
    });
    await addLobbyEvent(nextLobby.id, 'returned_to_lobby');
  }

  const stalePlayers = getStaleConnectedMembers(players, nowMs);

  if (stalePlayers.length > 0) {
    const stalePlayerIds = stalePlayers.map((player) => player.id);
    const query = getSupabaseServiceClient().from('skincognito_players');
    const { error } = nextLobby.status === 'waiting'
      ? await query.delete().in('id', stalePlayerIds)
      : await query.update({ connected: false, disconnected_at: now }).in('id', stalePlayerIds);

    if (error) {
      throw error;
    }

    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'stale_players_removed');
  }

  const lifecycle = resolveMultiplayerLifecycle(players, nextLobby.host_player_id);
  const connectedPlayers = players.filter((player) => lifecycle.connectedMemberIds.includes(player.id));
  const activePlayerIds = [nextLobby.player_one_id, nextLobby.player_two_id].filter((id): id is string => Boolean(id));
  const connectedActivePlayers = players.filter((player) => activePlayerIds.includes(player.id) && player.connected);
  const reconnectableActivePlayers = players.filter((player) => (
    activePlayerIds.includes(player.id) && !player.connected && canReconnect(player.disconnected_at, nowMs)
  ));
  if (nextLobby.status === 'active' && connectedActivePlayers.length === 0 && reconnectableActivePlayers.length === 0) {
    const terminatedLobby = await updateLobby(lobby.id, {
      status: 'terminated',
      host_player_id: null,
      player_one_id: null,
      player_two_id: null,
      current_turn_player_id: null,
      is_public: false,
      terminated_at: new Date().toISOString(),
    });
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return terminatedLobby;
  }
  if (lifecycle.shouldTerminate && reconnectableActivePlayers.length === 0) {
    const terminatedLobby = await updateLobby(lobby.id, {
      status: 'terminated',
      host_player_id: null,
      player_one_id: null,
      player_two_id: null,
      current_turn_player_id: null,
      is_public: false,
      terminated_at: new Date().toISOString(),
    });
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return terminatedLobby;
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const nextHost = connectedPlayers.find((player) => player.id === lifecycle.hostPlayerId);
    if (!nextHost) {
      throw new Error('Unable to assign a lobby host.');
    }
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({ role: 'spectator' })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) throw demoteError;

    await Promise.all(players.filter((player) => player.id !== nextHost.id).map(async (player) => {
      const role: SkincognitoPlayerRole = player.id === nextHost.id
        ? 'host'
        : player.id === nextLobby.player_one_id || player.id === nextLobby.player_two_id
          ? 'opponent'
          : 'spectator';
      const isSpectator = role === 'spectator';
      const { error } = await getSupabaseServiceClient()
        .from('skincognito_players')
        .update({
          role,
          selected_skin_id: isSpectator ? null : player.selected_skin_id,
          selected_skin_answer: isSpectator ? null : player.selected_skin_answer,
          selected_skin_image_url: isSpectator ? null : player.selected_skin_image_url,
        })
        .eq('id', player.id);
      if (error) throw error;
    }));

    const { error: promoteError } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({ role: 'host' })
      .eq('id', nextHost.id);
    if (promoteError) throw promoteError;

    nextLobby = await updateLobby(lobby.id, { host_player_id: nextHost.id });
    await addLobbyEvent(lobby.id, 'host_transferred');
  }

  if (nextLobby.status === 'waiting') {
    const refreshedPlayers = await fetchPlayers(nextLobby.id);
    const connectedWaitingPlayers = refreshedPlayers.filter((player) => player.connected);
    const playerOne = nextLobby.player_one_id
      ? connectedWaitingPlayers.find((player) => player.id === nextLobby.player_one_id) ?? null
      : null;
    const playerTwo = nextLobby.player_two_id && nextLobby.player_two_id !== playerOne?.id
      ? connectedWaitingPlayers.find((player) => player.id === nextLobby.player_two_id) ?? null
      : null;

    nextLobby = await updateLobby(nextLobby.id, {
      player_one_id: playerOne?.id ?? null,
      player_two_id: playerTwo?.id ?? null,
      host_player_id: nextLobby.host_player_id,
    });

    await updateWaitingLobbyPlayerRoles(connectedWaitingPlayers, playerOne?.id ?? null, playerTwo?.id ?? null, nextLobby.host_player_id);
  }

  if (nextLobby.status === 'active' && nextLobby.player_one_id && nextLobby.player_two_id) {
    const expiredPlayer = players.find((player) => {
      if (!activePlayerIds.includes(player.id) || player.connected || !player.disconnected_at) {
        return false;
      }

      return !canReconnect(player.disconnected_at);
    });

    if (expiredPlayer) {
      const winnerId = connectedActivePlayers[0]?.id ?? null;
      if (!winnerId) {
        const terminatedLobby = await updateLobby(nextLobby.id, {
          status: 'terminated',
          host_player_id: null,
          player_one_id: null,
          player_two_id: null,
          current_turn_player_id: null,
          is_public: false,
          terminated_at: new Date().toISOString(),
        });
        await addLobbyEvent(nextLobby.id, 'lobby_terminated');
        return terminatedLobby;
      }
      nextLobby = await updateLobby(nextLobby.id, {
        status: 'finished',
        winner_player_id: winnerId,
        current_turn_player_id: null,
        finished_at: new Date().toISOString(),
      });
      await addSystemMessage(nextLobby.id, 'A player disconnected and did not return in time.');
      await addLobbyEvent(nextLobby.id, 'game_finished');
    }
  }

  return nextLobby;
}

export async function createSkincognitoLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  await forfeitOutstandingReconnects(input.clientId);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateMultiplayerLobbyCode();
    const { data: lobby, error } = await getSupabaseServiceClient()
      .from('skincognito_lobbies')
      .insert({ code })
      .select('*')
      .single<SkincognitoLobbyRecord>();

    if (error) {
      if (error.code === '23505') {
        continue;
      }

      throw error;
    }

    const player = await upsertPlayer(lobby, input, 'host');
    const updatedLobby = await updateLobby(lobby.id, {
      host_player_id: player.id,
      player_one_id: player.id,
    });
    await addLobbyEvent(updatedLobby.id, 'lobby_created');
    return getLobbyView(updatedLobby, input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinSkincognitoLobby(code: string, input: CreateOrJoinInput) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }
  await forfeitOutstandingReconnects(input.clientId, { skincognitoLobbyId: lobby.id });

  const reconciledLobby = await reconcileLobby(lobby);
  if (reconciledLobby.status === 'finished' || reconciledLobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }
  if (input.requirePublic && !reconciledLobby.is_public) {
    throw new Error('This lobby is no longer public.');
  }

  const players = await fetchPlayers(reconciledLobby.id);
  assertMultiplayerAccountAvailable(players, input.authUserId, input.clientId);
  const bans = await fetchBans(reconciledLobby.id);
  const existingPlayer = players.find((player) => player.client_id === input.clientId);
  if (bans.some((ban) => ban.client_id === input.clientId)) {
    throw new Error('You cannot rejoin this lobby.');
  }

  if (players.length >= MAX_LOBBY_PLAYERS && !existingPlayer) {
    throw new Error('Lobby is full.');
  }

  if (existingPlayer && reconciledLobby.status === 'active') {
    const isActivePlayer = existingPlayer.id === reconciledLobby.player_one_id || existingPlayer.id === reconciledLobby.player_two_id;
    if (!isActivePlayer || existingPlayer.role === 'spectator' || (!existingPlayer.connected && !canReconnect(existingPlayer.disconnected_at))) {
      throw new Error('This player cannot rejoin the active game.');
    }
    const now = new Date().toISOString();
    const displayName = await resolveMultiplayerDisplayName(input);
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        auth_user_id: input.authUserId ?? existingPlayer.auth_user_id,
        display_name: displayName,
        connected: true,
        last_seen_at: now,
        disconnected_at: null,
      })
      .eq('id', existingPlayer.id);
    if (error) throw error;
    await addLobbyEvent(reconciledLobby.id, 'player_reconnected');
    return getLobbyView(reconciledLobby, input.clientId);
  }

  const role: SkincognitoPlayerRole =
    existingPlayer?.role ?? (reconciledLobby.status === 'waiting' && !reconciledLobby.player_two_id ? 'opponent' : 'spectator');
  const player = await upsertPlayer(reconciledLobby, input, role);
  const updatedLobby =
    reconciledLobby.status === 'waiting' && role === 'opponent' && !reconciledLobby.player_two_id
      ? await updateLobby(reconciledLobby.id, { player_two_id: player.id })
      : reconciledLobby;

  await addLobbyEvent(updatedLobby.id, 'player_joined');
  return getLobbyView(updatedLobby, input.clientId);
}

export async function getSkincognitoRejoinEligibility(code: string, clientId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby) return { eligible: false as const };
  const reconciledLobby = await reconcileLobby(lobby);
  if (reconciledLobby.status !== 'active') return { eligible: false as const };
  const players = await fetchPlayers(reconciledLobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  const isActivePlayer = player && (player.id === reconciledLobby.player_one_id || player.id === reconciledLobby.player_two_id);
  if (!player || !isActivePlayer || player.role === 'spectator' || player.connected || !canReconnect(player.disconnected_at)) {
    return { eligible: false as const };
  }
  return {
    eligible: true as const,
    code: reconciledLobby.code,
    expiresAt: new Date(getReconnectDeadline(player.disconnected_at as string)).toISOString(),
  };
}

export async function listPublicSkincognitoLobbies() {
  assertSupabaseConfigured();
  const { data: lobbies, error } = await getSupabaseServiceClient()
    .from('skincognito_lobbies')
    .select('*')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(30)
    .returns<SkincognitoLobbyRecord[]>();
  if (error) throw error;
  if (lobbies.length === 0) return [];
  const { data: publicPlayers, error: playersError } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .select('id, lobby_id, display_name, connected, last_seen_at')
    .in('lobby_id', lobbies.map((lobby) => lobby.id))
    .returns<Array<Pick<SkincognitoPlayerRecord, 'id' | 'lobby_id' | 'display_name' | 'connected' | 'last_seen_at'>>>();
  if (playersError) throw playersError;

  const nowMs = Date.now();
  return lobbies.map((lobby): SkincognitoPublicLobby | null => {
    const players = getFreshConnectedMembers(publicPlayers.filter((player) => player.lobby_id === lobby.id), nowMs);
    if (players.length === 0) return null;
    if (players.length >= MAX_LOBBY_PLAYERS) return null;
    const host = players.find((player) => player.id === lobby.host_player_id);
    if (!host) return null;
    return {
      code: lobby.code,
      hostName: host.display_name,
      playerCount: players.length,
      maxPlayers: MAX_LOBBY_PLAYERS,
    };
  }).filter((entry): entry is SkincognitoPublicLobby => entry !== null);
}

export async function updateSkincognitoLobbyVisibility(code: string, clientId: string, isPublic: boolean) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') throw new Error('Lobby is not available.');
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') throw new Error('Lobby is not available.');
  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change lobby visibility.');
  const updatedLobby = await updateLobby(lobby.id, { is_public: isPublic });
  await addLobbyEvent(lobby.id, 'visibility_updated');
  return getLobbyView(updatedLobby, clientId);
}

export async function leaveSkincognitoLobby(code: string, clientId: string, forfeit = false) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) {
    return getLobbyView(lobby, clientId);
  }

  if (lobby.status === 'active' && !forfeit) {
    const now = new Date().toISOString();
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({ connected: false, last_seen_at: now, disconnected_at: now })
      .eq('id', player.id);
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'player_disconnected');
    const reconciledLobby = await reconcileLobby(lobby);
    return getLobbyView(reconciledLobby, clientId);
  }

  const updatedLobby = await removePlayerFromLobby(lobby, player);
  await addSystemMessage(updatedLobby.id, `${player.display_name} left the lobby.`);
  let reconciledLobby = await reconcileLobby(updatedLobby);
  if (forfeit && lobby.status === 'active' && reconciledLobby.status === 'active') {
    const activePlayerIds = [reconciledLobby.player_one_id, reconciledLobby.player_two_id]
      .filter((id): id is string => Boolean(id));
    const remainingActivePlayers = players.filter((candidate) => (
      candidate.id !== player.id && candidate.connected && activePlayerIds.includes(candidate.id)
    ));
    if (remainingActivePlayers.length === 1) {
      reconciledLobby = await updateLobby(reconciledLobby.id, {
        status: 'finished',
        winner_player_id: remainingActivePlayers[0].id,
        current_turn_player_id: null,
        is_public: false,
        finished_at: new Date().toISOString(),
      });
      await addLobbyEvent(reconciledLobby.id, 'game_finished');
      return getLobbyView(reconciledLobby, clientId);
    }
  }
  await addLobbyEvent(reconciledLobby.id, 'player_left');
  return getLobbyView(reconciledLobby, clientId);
}

export async function kickSkincognitoPlayer(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Players can only be kicked before the game starts.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Players can only be kicked before the game starts.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can kick players.');
  const target = players.find((player) => player.id === targetPlayerId);

  if (!target || target.id === host.id) {
    throw new Error('Invalid kick target.');
  }

  const { error: banError } = await getSupabaseServiceClient()
    .from('skincognito_bans')
    .upsert(
      {
        lobby_id: lobby.id,
        client_id: target.client_id,
        banned_by_player_id: host.id,
      },
      { onConflict: 'lobby_id,client_id' },
    );

  if (banError) {
    throw banError;
  }

  const updatedLobby = await removePlayerFromLobby(lobby, target);
  await addSystemMessage(updatedLobby.id, `${target.display_name} was removed from the lobby.`, host.id);
  const reconciledLobby = await reconcileLobby(updatedLobby);
  await addLobbyEvent(reconciledLobby.id, 'player_kicked');
  return getLobbyView(reconciledLobby, clientId);
}

export async function promoteSkincognitoSpectator(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Players can only be changed before the game starts.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Players can only be changed before the game starts.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change players.');
  const target = players.find((player) => player.id === targetPlayerId);

  if (!target || target.role !== 'spectator' || !target.connected) {
    throw new Error('Only spectators can be promoted.');
  }

  if (lobby.player_one_id && lobby.player_two_id) {
    throw new Error('Active player slots are full.');
  }

  const promotedColumn = lobby.player_one_id ? 'player_two_id' : 'player_one_id';
  const nextPlayerOneId = promotedColumn === 'player_one_id' ? target.id : lobby.player_one_id;
  const nextPlayerTwoId = promotedColumn === 'player_two_id' ? target.id : lobby.player_two_id;

  await updateWaitingLobbyPlayerRoles(players, nextPlayerOneId, nextPlayerTwoId, lobby.host_player_id);

  const updatedLobby = await updateLobby(lobby.id, {
    player_one_id: nextPlayerOneId,
    player_two_id: nextPlayerTwoId,
    host_player_id: lobby.host_player_id,
  } as Partial<SkincognitoLobbyRecord>);

  await addSystemMessage(updatedLobby.id, `${target.display_name} became a player.`, host.id);
  await addLobbyEvent(updatedLobby.id, 'player_promoted');
  return getLobbyView(updatedLobby, clientId);
}

export async function demoteSkincognitoPlayerToSpectator(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Players can only be changed before the game starts.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Players can only be changed before the game starts.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change players.');
  const target = players.find((player) => player.id === targetPlayerId);

  if (!target || target.role === 'spectator') {
    throw new Error('Invalid spectator target.');
  }

  const nextPlayerOneId = lobby.player_one_id === target.id ? null : lobby.player_one_id;
  const nextPlayerTwoId = lobby.player_two_id === target.id ? null : lobby.player_two_id;
  await updateWaitingLobbyPlayerRoles(players, nextPlayerOneId, nextPlayerTwoId, lobby.host_player_id);

  const updatedLobby = await updateLobby(lobby.id, {
    player_one_id: nextPlayerOneId,
    player_two_id: nextPlayerTwoId,
    host_player_id: lobby.host_player_id,
  });

  await addSystemMessage(updatedLobby.id, `${target.display_name} became a spectator.`, host.id);
  await addLobbyEvent(updatedLobby.id, 'player_demoted');
  return getLobbyView(updatedLobby, clientId);
}

export async function transferSkincognitoHost(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Host can only be transferred before the game starts.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Host can only be transferred before the game starts.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can transfer host.');
  const target = players.find((player) => player.id === targetPlayerId);
  if (!target || target.id === host.id || !target.connected) {
    throw new Error('Invalid host target.');
  }

  const nextPlayerOneId = target.id;
  const nextPlayerTwoId = target.id === lobby.player_two_id ? lobby.player_one_id : lobby.player_two_id;
  await updateWaitingLobbyPlayerRoles(players, nextPlayerOneId, nextPlayerTwoId, target.id);

  const updatedLobby = await updateLobby(lobby.id, {
    host_player_id: target.id,
    player_one_id: nextPlayerOneId,
    player_two_id: nextPlayerTwoId,
  });
  await addSystemMessage(updatedLobby.id, `${target.display_name} is now the host.`, host.id);
  await addLobbyEvent(updatedLobby.id, 'host_transferred');
  return getLobbyView(updatedLobby, clientId);
}

export async function getSkincognitoLobby(code: string, clientId?: string | null) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby) {
    throw new Error('Lobby not found.');
  }

  const reconciledLobby = await reconcileLobby(lobby);
  return getLobbyView(reconciledLobby, clientId);
}

export async function selectSkincognitoSkin(code: string, clientId: string, skinId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Skin selection is closed.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Skin selection is closed.');
  }

  const skin = getSkinById(skinId);
  if (!skin) {
    throw new Error('Invalid skin selection.');
  }

  const players = await fetchPlayers(lobby.id);
  const currentPlayer = players.find((player) => player.client_id === clientId);
  if (!currentPlayer || currentPlayer.role === 'spectator') {
    throw new Error('Spectators cannot select skins.');
  }

  const { data: player, error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .update({
      selected_skin_id: skin.id,
      selected_skin_answer: skin.answer,
      selected_skin_image_url: skin.imageUrl,
      last_seen_at: new Date().toISOString(),
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId)
    .select('*')
    .single<SkincognitoPlayerRecord>();

  if (error) {
    throw error;
  }

  await addLobbyEvent(lobby.id, 'skin_selected');
  return getLobbyView(lobby, clientId);
}

export async function startSkincognitoLobby(code: string, clientId: string) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby) {
    throw new Error('Lobby cannot be started.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }

  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can start this lobby.');

  const activePlayers = players.filter((player) => player.id === lobby.player_one_id || player.id === lobby.player_two_id);
  if (activePlayers.length !== 2 || activePlayers.some((player) => !player.connected)) {
    throw new Error('Two connected active players are required.');
  }

  await Promise.all(
    activePlayers.map(async (player) => {
      if (player.selected_skin_id) {
        return;
      }

      const fallbackSkin = getRandomSkin();
      const { error } = await getSupabaseServiceClient()
        .from('skincognito_players')
        .update({
          selected_skin_id: fallbackSkin.id,
          selected_skin_answer: fallbackSkin.answer,
          selected_skin_image_url: fallbackSkin.imageUrl,
        })
        .eq('id', player.id);

      if (error) {
        throw error;
      }
    }),
  );

  const startingPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
  const updatedLobby = await updateLobby(lobby.id, {
    status: 'active',
    current_turn_player_id: startingPlayer.id,
    winner_player_id: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    return_to_lobby_at: null,
  });

  await addLobbyEvent(updatedLobby.id, 'game_started');
  return getLobbyView(updatedLobby, clientId);
}

export async function scheduleSkincognitoReturnToLobby(code: string, clientId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'finished') {
    throw new Error('Only finished games can return to the lobby.');
  }

  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can return everyone to the lobby.');

  const returnToLobbyAt = new Date(Date.now() + 5000).toISOString();
  const updatedLobby = await updateLobby(lobby.id, {
    return_to_lobby_at: returnToLobbyAt,
  });

  await addLobbyEvent(updatedLobby.id, 'return_to_lobby_scheduled');
  return getLobbyView(updatedLobby, clientId);
}

export async function submitSkincognitoAction(code: string, input: SubmitActionInput) {
  const fetchedLobby = await fetchLobbyByCode(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const lobby = await reconcileLobby(fetchedLobby);
  if (lobby.status !== 'active') {
    throw new Error('Game is not active.');
  }

  const players = await fetchPlayers(lobby.id);
  const actor = players.find((player) => player.client_id === input.clientId);
  if (!actor || actor.id !== lobby.current_turn_player_id) {
    throw new Error('It is not your turn.');
  }

  if (actor.role === 'spectator') {
    throw new Error('Spectators cannot submit guesses.');
  }

  const opponentId = actor.id === lobby.player_one_id ? lobby.player_two_id : lobby.player_one_id;
  const opponent = players.find((player) => player.id === opponentId);
  if (!opponent?.selected_skin_id) {
    throw new Error('Opponent skin is not available.');
  }

  const opponentSkin = getSkinById(opponent.selected_skin_id);
  if (!opponentSkin) {
    throw new Error('Opponent skin metadata is not available.');
  }

  const categoryId = input.actionType === 'skin_guess' ? 'skin' : input.categoryId;
  if (!categoryId) {
    throw new Error('Category is required.');
  }

  const isCorrect = input.actionType === 'skin_guess'
    ? normalizeAnswer(input.guessValue) === normalizeAnswer(opponentSkin.answer)
    : valuesMatch(categoryId, input.guessValue, opponentSkin);
  const resultHint = getResultHint(categoryId, input.guessValue, opponentSkin);

  const { error } = await getSupabaseServiceClient()
    .from('skincognito_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: actor.id,
      action_type: input.actionType,
      category_id: categoryId,
      guess_value: input.guessValue,
      is_correct: isCorrect,
      result_hint: resultHint,
    });

  if (error) {
    throw error;
  }

  const updatedLobby = input.actionType === 'skin_guess' && isCorrect
    ? await updateLobby(lobby.id, {
        status: 'finished',
        winner_player_id: actor.id,
        finished_at: new Date().toISOString(),
      })
    : await updateLobby(lobby.id, {
        current_turn_player_id: opponent?.id ?? lobby.current_turn_player_id,
      });

  await addLobbyEvent(updatedLobby.id, 'action_submitted');
  return getLobbyView(updatedLobby, input.clientId);
}

export async function postSkincognitoChatMessage(code: string, clientId: string, message: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) {
    throw new Error('Player not found in lobby.');
  }

  const cleanMessage = message.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
  if (!cleanMessage) {
    throw new Error('Message cannot be empty.');
  }

  const playerCosmetics = player.auth_user_id
    ? (await fetchProfileChatCosmetics([player.auth_user_id])).get(player.auth_user_id)
    : null;

  const { error } = await getSupabaseServiceClient()
    .from('skincognito_chat_messages')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      message: cleanMessage,
      message_type: 'player',
      chat_color: playerCosmetics?.color ?? 'amber',
      chat_border: playerCosmetics?.border ?? DEFAULT_CHAT_BORDER,
    });

  if (error) {
    throw error;
  }

  await addLobbyEvent(lobby.id, 'chat_message_posted');
  return getLobbyView(lobby, clientId);
}

export async function heartbeatSkincognitoPlayer(code: string, clientId: string, connected: boolean) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) throw new Error('Player not found.');
  if (connected && lobby.status === 'active' && !player.connected) {
    const isActivePlayer = player.id === lobby.player_one_id || player.id === lobby.player_two_id;
    if (!isActivePlayer || player.role === 'spectator' || !canReconnect(player.disconnected_at)) {
      await reconcileLobby(lobby);
      throw new Error('The reconnect window has expired.');
    }
  }

  const now = new Date().toISOString();
  const disconnectedAt = connected ? null : player.disconnected_at ?? now;
  const { error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .update({
      connected,
      last_seen_at: now,
      disconnected_at: disconnectedAt,
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);

  if (error) {
    throw error;
  }

  await addLobbyEvent(lobby.id, connected ? 'player_reconnected' : 'player_disconnected');

  const reconciledLobby = await reconcileLobby(lobby);
  return getLobbyView(reconciledLobby, clientId);
}
