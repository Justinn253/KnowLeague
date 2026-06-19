import { getSkinCatalog } from '@/lib/catalogs';
import { normalizeAnswer, type QuizItem } from '@/lib/quiz';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

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

type CreateOrJoinInput = {
  clientId: string;
  displayName: string;
  authUserId?: string | null;
  selectedSkinId?: string | null;
};

type SubmitActionInput = {
  clientId: string;
  actionType: SkincognitoActionType;
  categoryId?: SkincognitoCategoryId | null;
  guessValue: string;
};

const LOBBY_CODE_LENGTH = 6;
const MAX_LOBBY_PLAYERS = 10;
const CHAT_MESSAGE_MAX_LENGTH = 240;
const RECONNECT_GRACE_MS = 60_000;
const HEARTBEAT_STALE_MS = 15_000;

function assertSupabaseConfigured() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function generateLobbyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < LOBBY_CODE_LENGTH; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

function sanitizeDisplayName(displayName: string) {
  const trimmedName = displayName.trim();
  return trimmedName.slice(0, 16) || 'Player';
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
): SkincognitoPublicPlayer {
  const revealSkin = canSeeSelectedSkin(player, requestingPlayerId, lobbyStatus);

  return {
    id: player.id,
    lobby_id: player.lobby_id,
    auth_user_id: player.auth_user_id,
    display_name: player.display_name,
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
    .eq('code', code.toUpperCase())
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
    });

  if (error) {
    throw error;
  }
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  const { error } = await getSupabaseServiceClient()
    .from('skincognito_lobby_events')
    .insert({
      lobby_id: lobbyId,
      event_type: eventType,
    });

  if (error) {
    throw error;
  }
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
  const finishedSkinUseCount = finishedTargetSkinId ? await countSkincognitoSkinUses(finishedTargetSkinId) : null;

  return {
    lobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer, requestingPlayer.id, lobby.status) : null,
    players: players.map((player) => toPublicPlayer(player, requestingPlayer?.id ?? null, lobby.status)),
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
  let displayName = sanitizeDisplayName(input.displayName);
  if (input.authUserId) {
    const { data: profile } = await getSupabaseServiceClient()
      .from('profiles')
      .select('username, display_name')
      .eq('id', input.authUserId)
      .maybeSingle<{ username: string; display_name: string }>();
    displayName = sanitizeDisplayName(profile?.display_name || profile?.username || displayName);
  }

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

async function reconcileLobby(lobby: SkincognitoLobbyRecord) {
  let players = await fetchPlayers(lobby.id);
  let nextLobby = lobby;

  if (
    nextLobby.status === 'finished' &&
    nextLobby.return_to_lobby_at &&
    Date.now() >= new Date(nextLobby.return_to_lobby_at).getTime()
  ) {
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

  const stalePlayers = players.filter((player) => (
    player.connected &&
    Date.now() - new Date(player.last_seen_at).getTime() > HEARTBEAT_STALE_MS
  ));

  if (stalePlayers.length > 0) {
    const now = new Date().toISOString();
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        connected: false,
        disconnected_at: now,
      })
      .in('id', stalePlayers.map((player) => player.id));

    if (error) {
      throw error;
    }

    players = await fetchPlayers(lobby.id);
  }

  if (players.length === 0) {
    return updateLobby(lobby.id, {
      status: 'terminated',
      terminated_at: new Date().toISOString(),
    });
  }

  const connectedPlayers = players.filter((player) => player.connected);
  if (connectedPlayers.length === 0) {
    return updateLobby(lobby.id, {
      status: 'terminated',
      terminated_at: new Date().toISOString(),
    });
  }

  if (!lobby.host_player_id || !players.some((player) => player.id === lobby.host_player_id && player.connected)) {
    const nextHost = connectedPlayers[0];
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({ role: 'host' })
      .eq('id', nextHost.id);

    if (error) {
      throw error;
    }

    nextLobby = await updateLobby(lobby.id, { host_player_id: nextHost.id });
  }

  if (nextLobby.status === 'waiting') {
    const refreshedPlayers = await fetchPlayers(nextLobby.id);
    const connectedWaitingPlayers = refreshedPlayers.filter((player) => player.connected);
    const currentPlayerOne = nextLobby.player_one_id
      ? connectedWaitingPlayers.find((player) => player.id === nextLobby.player_one_id)
      : null;
    const currentPlayerTwo = nextLobby.player_two_id
      ? connectedWaitingPlayers.find((player) => player.id === nextLobby.player_two_id)
      : null;
    const playerOne = currentPlayerOne
      ?? connectedWaitingPlayers.find((player) => player.id === nextLobby.host_player_id)
      ?? connectedWaitingPlayers[0]
      ?? null;
    const playerTwo = currentPlayerTwo && currentPlayerTwo.id !== playerOne?.id
      ? currentPlayerTwo
      : connectedWaitingPlayers.find((player) => player.id !== playerOne?.id)
        ?? null;

    nextLobby = await updateLobby(nextLobby.id, {
      player_one_id: playerOne?.id ?? null,
      player_two_id: playerTwo?.id ?? null,
      host_player_id: playerOne?.id ?? nextLobby.host_player_id,
    });

    const roleUpdates = connectedWaitingPlayers.map((player) => ({
      id: player.id,
      role: player.id === playerOne?.id ? 'host' : player.id === playerTwo?.id ? 'opponent' : 'spectator',
    }));

    await Promise.all(roleUpdates.map(async (roleUpdate) => {
      const { error } = await getSupabaseServiceClient()
        .from('skincognito_players')
        .update({ role: roleUpdate.role })
        .eq('id', roleUpdate.id);

      if (error) {
        throw error;
      }
    }));
  }

  if (nextLobby.status === 'active' && nextLobby.player_one_id && nextLobby.player_two_id) {
    const activePlayerIds = [nextLobby.player_one_id, nextLobby.player_two_id];
    const expiredPlayer = players.find((player) => {
      if (!activePlayerIds.includes(player.id) || player.connected || !player.disconnected_at) {
        return false;
      }

      return Date.now() - new Date(player.disconnected_at).getTime() > RECONNECT_GRACE_MS;
    });

    if (expiredPlayer) {
      const replacement = connectedPlayers.find((player) => player.role === 'spectator');
      if (replacement) {
        const promotedColumn = expiredPlayer.id === nextLobby.player_one_id ? 'player_one_id' : 'player_two_id';
        const { error } = await getSupabaseServiceClient()
          .from('skincognito_players')
          .update({ role: expiredPlayer.role })
          .eq('id', replacement.id);

        if (error) {
          throw error;
        }

        nextLobby = await updateLobby(nextLobby.id, {
          [promotedColumn]: replacement.id,
          current_turn_player_id: nextLobby.current_turn_player_id === expiredPlayer.id ? replacement.id : nextLobby.current_turn_player_id,
        } as Partial<SkincognitoLobbyRecord>);
        await addSystemMessage(nextLobby.id, `${replacement.display_name} replaced a disconnected player.`, replacement.id);
      } else {
        const winnerId = activePlayerIds.find((playerId) => playerId !== expiredPlayer.id) ?? null;
        nextLobby = await updateLobby(nextLobby.id, {
          status: 'finished',
          winner_player_id: winnerId,
          finished_at: new Date().toISOString(),
        });
        await addSystemMessage(nextLobby.id, 'A player disconnected and did not return in time.');
      }
    }
  }

  return nextLobby;
}

export async function createSkincognitoLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateLobbyCode();
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
    return getLobbyView(updatedLobby, input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinSkincognitoLobby(code: string, input: CreateOrJoinInput) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const reconciledLobby = await reconcileLobby(lobby);
  if (reconciledLobby.status === 'finished' || reconciledLobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const players = await fetchPlayers(reconciledLobby.id);
  const bans = await fetchBans(reconciledLobby.id);
  const existingPlayer = players.find((player) => player.client_id === input.clientId);
  if (bans.some((ban) => ban.client_id === input.clientId)) {
    throw new Error('You cannot rejoin this lobby.');
  }

  if (players.length >= MAX_LOBBY_PLAYERS && !existingPlayer) {
    throw new Error('Lobby is full.');
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

export async function leaveSkincognitoLobby(code: string, clientId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) {
    return getLobbyView(lobby, clientId);
  }

  const updatedLobby = await removePlayerFromLobby(lobby, player);
  await addSystemMessage(updatedLobby.id, `${player.display_name} left the lobby.`);
  const reconciledLobby = await reconcileLobby(updatedLobby);
  await addLobbyEvent(reconciledLobby.id, 'player_left');
  return getLobbyView(reconciledLobby, clientId);
}

export async function kickSkincognitoPlayer(code: string, clientId: string, targetPlayerId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Players can only be kicked before the game starts.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  const target = players.find((player) => player.id === targetPlayerId);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can kick players.');
  }

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
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Players can only be changed before the game starts.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  const target = players.find((player) => player.id === targetPlayerId);

  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can change players.');
  }

  if (!target || target.role !== 'spectator') {
    throw new Error('Only spectators can be promoted.');
  }

  const promotedColumn = lobby.player_one_id ? 'player_two_id' : 'player_one_id';
  const nextPlayerOneId = promotedColumn === 'player_one_id' ? target.id : lobby.player_one_id;
  const nextPlayerTwoId = promotedColumn === 'player_two_id' ? target.id : lobby.player_two_id;

  await Promise.all(players.map(async (player) => {
    const nextRole: SkincognitoPlayerRole =
      player.id === nextPlayerOneId ? 'host' : player.id === nextPlayerTwoId ? 'opponent' : 'spectator';
    const isSpectator = nextRole === 'spectator';
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        role: nextRole,
        selected_skin_id: isSpectator ? null : player.selected_skin_id,
        selected_skin_answer: isSpectator ? null : player.selected_skin_answer,
        selected_skin_image_url: isSpectator ? null : player.selected_skin_image_url,
      })
      .eq('id', player.id);

    if (error) {
      throw error;
    }
  }));

  const updatedLobby = await updateLobby(lobby.id, {
    player_one_id: nextPlayerOneId,
    player_two_id: nextPlayerTwoId,
    host_player_id: nextPlayerOneId,
  } as Partial<SkincognitoLobbyRecord>);

  await addSystemMessage(updatedLobby.id, `${target.display_name} became a player.`, host.id);
  await addLobbyEvent(updatedLobby.id, 'player_promoted');
  return getLobbyView(updatedLobby, clientId);
}

export async function transferSkincognitoHost(code: string, clientId: string, targetPlayerId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Host can only be transferred before the game starts.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  const target = players.find((player) => player.id === targetPlayerId);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can transfer host.');
  }
  if (!target || target.id === host.id) {
    throw new Error('Invalid host target.');
  }

  const nextPlayerOneId = target.id;
  const nextPlayerTwoId = target.id === lobby.player_two_id ? host.id : lobby.player_two_id;
  await Promise.all(players.map(async (player) => {
    const nextRole: SkincognitoPlayerRole = player.id === nextPlayerOneId
      ? 'host'
      : player.id === nextPlayerTwoId
        ? 'opponent'
        : 'spectator';
    const { error } = await getSupabaseServiceClient()
      .from('skincognito_players')
      .update({
        role: nextRole,
        selected_skin_id: nextRole === 'spectator' ? null : player.selected_skin_id,
        selected_skin_answer: nextRole === 'spectator' ? null : player.selected_skin_answer,
        selected_skin_image_url: nextRole === 'spectator' ? null : player.selected_skin_image_url,
      })
      .eq('id', player.id);
    if (error) {
      throw error;
    }
  }));

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
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'waiting') {
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

export async function updateSkincognitoDisplayName(code: string, clientId: string, displayName: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby is not available.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .update({
      display_name: sanitizeDisplayName(displayName),
      last_seen_at: new Date().toISOString(),
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);

  if (error) {
    throw error;
  }

  await addLobbyEvent(lobby.id, 'display_name_updated');
  return getLobbyView(lobby, clientId);
}

export async function startSkincognitoLobby(code: string, clientId: string) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }

  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can start this lobby.');
  }

  const activePlayers = players.filter((player) => player.id === lobby.player_one_id || player.id === lobby.player_two_id);
  if (activePlayers.length !== 2) {
    throw new Error('Two active players are required.');
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
  const host = players.find((candidate) => candidate.id === lobby.host_player_id);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can return everyone to the lobby.');
  }

  const returnToLobbyAt = new Date(Date.now() + 5000).toISOString();
  const updatedLobby = await updateLobby(lobby.id, {
    return_to_lobby_at: returnToLobbyAt,
  });

  await addLobbyEvent(updatedLobby.id, 'return_to_lobby_scheduled');
  return getLobbyView(updatedLobby, clientId);
}

export async function submitSkincognitoAction(code: string, input: SubmitActionInput) {
  const lobby = await fetchLobbyByCode(code);
  if (!lobby || lobby.status !== 'active') {
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

  const { error } = await getSupabaseServiceClient()
    .from('skincognito_chat_messages')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      message: cleanMessage,
      message_type: 'player',
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

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('skincognito_players')
    .update({
      connected,
      last_seen_at: now,
      disconnected_at: connected ? null : now,
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);

  if (error) {
    throw error;
  }

  const reconciledLobby = await reconcileLobby(lobby);
  return getLobbyView(reconciledLobby, clientId);
}
