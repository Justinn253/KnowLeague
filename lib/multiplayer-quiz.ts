import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getAbilityCatalog, getSkinCatalog } from '@/lib/catalogs';
import { shuffle, type QuizItem } from '@/lib/quiz';
import {
  canReconnect,
  getReconnectDeadline,
  resolveMultiplayerLifecycle,
} from '@/lib/multiplayer-lifecycle';
import { forfeitOutstandingReconnects } from '@/lib/multiplayer-reconnect';
import { ALL_ABILITY_SLOT_IDS, filterItemsByAbilitySlots, type AbilitySlotId } from '@/lib/ability-slots';
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
import { normalizeChatColor, type ChatColor } from '@/lib/chat-colors';

export type MultiplayerQuizGameMode = 'ability_blitz' | 'skin_champion';
export type MultiplayerQuizDifficulty = 'iron' | 'gold' | 'diamond' | 'challenger';
export type MultiplayerQuizPlayerResult = 'active' | 'completed' | 'failed';

export type MultiplayerQuizLobby = {
  id: string;
  code: string;
  game_mode: MultiplayerQuizGameMode;
  status: 'waiting' | 'active' | 'finished' | 'terminated';
  host_player_id: string | null;
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  ability_slots: AbilitySlotId[];
  max_players: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  terminated_at: string | null;
  quiz_item_ids: string[];
  total_items: number;
  started_at: string | null;
  finished_at: string | null;
};

type MultiplayerQuizPlayerRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: 'host' | 'player';
  joined_at: string;
  updated_at: string;
  progress: number;
  elapsed_seconds: number;
  finished_at: string | null;
  connected: boolean;
  last_seen_at: string;
  disconnected_at: string | null;
  result: MultiplayerQuizPlayerResult;
  record_wins: number;
  record_losses: number;
};

export type MultiplayerQuizPublicPlayer = Omit<MultiplayerQuizPlayerRecord, 'client_id'> & {
  is_requesting_player: boolean;
  avatar_url: string | null;
  chat_color: ChatColor;
};

export type MultiplayerQuizLobbyView = {
  lobby: MultiplayerQuizLobby;
  requestingPlayer: MultiplayerQuizPublicPlayer | null;
  players: MultiplayerQuizPublicPlayer[];
  quizItems: QuizItem[];
};

export type MultiplayerQuizPublicLobby = {
  code: string;
  gameMode: MultiplayerQuizGameMode;
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  abilitySlots: AbilitySlotId[];
  totalItems: number;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
  hostChatColor: ChatColor;
};

type CreateOrJoinInput = {
  gameMode: MultiplayerQuizGameMode;
  clientId: string;
  authUserId?: string | null;
  requirePublic?: boolean;
  recordSnapshot?: MultiplayerQuizRecordSnapshot | null;
};
type MultiplayerQuizRecordSnapshot = {
  wins: number;
  losses: number;
};

const MAX_PLAYERS = MULTIPLAYER_MAX_LOBBY_PLAYERS;
const DEFAULT_TOTAL_ITEMS = 25;
const difficulties = new Set<MultiplayerQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);
const modifierIds: Record<MultiplayerQuizGameMode, Set<string>> = {
  ability_blitz: new Set(['greyscale', 'pixelated', 'rotating', 'disappearing', 'hiddenTimer', 'confirmEntry']),
  skin_champion: new Set(['greyscale', 'blurred', 'cropped', 'hiddenTimer', 'confirmEntry']),
};

export function parseMultiplayerQuizGameMode(value: unknown): MultiplayerQuizGameMode {
  if (value === 'ability_blitz' || value === 'skin_champion') {
    return value;
  }

  throw new Error('Invalid multiplayer game mode.');
}

function sanitizeRecordSnapshot(snapshot?: MultiplayerQuizRecordSnapshot | null) {
  return {
    wins: Math.max(0, Math.floor(Number(snapshot?.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(snapshot?.losses) || 0)),
  };
}

async function fetchLobby(code: string) {
  assertSupabaseConfigured();
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .select('*')
    .eq('code', normalizeLobbyCode(code))
    .maybeSingle<MultiplayerQuizLobby>();

  if (error) {
    throw error;
  }
  return data;
}

async function fetchPlayers(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })
    .returns<MultiplayerQuizPlayerRecord[]>();

  if (error) {
    throw error;
  }
  return data;
}

type ProfileCosmetics = {
  avatarUrl: string | null;
  chatColor: ChatColor;
};

async function fetchProfileCosmetics(authUserIds: Array<string | null>) {
  const userIds = [...new Set(authUserIds.filter((userId): userId is string => Boolean(userId)))];
  if (userIds.length === 0) {
    return new Map<string, ProfileCosmetics>();
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id, avatar_url, chat_color')
    .in('id', userIds)
    .returns<Array<{ id: string; avatar_url: string | null; chat_color: string | null }>>();
  if (error) {
    throw error;
  }

  return new Map(data.map((profile) => [profile.id, {
    avatarUrl: profile.avatar_url ?? null,
    chatColor: normalizeChatColor(profile.chat_color),
  }]));
}

async function fetchBannedClientIds(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobby_bans')
    .select('client_id')
    .eq('lobby_id', lobbyId)
    .returns<Array<{ client_id: string }>>();
  if (error) {
    throw error;
  }
  return new Set(data.map((ban) => ban.client_id));
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  await addMultiplayerLobbyEvent('multiplayer_quiz_lobby_events', lobbyId, eventType);
}

function getGameCatalog(gameMode: MultiplayerQuizGameMode) {
  return gameMode === 'ability_blitz' ? getAbilityCatalog() : getSkinCatalog();
}

async function reconcileMultiplayerQuizLobby(lobby: MultiplayerQuizLobby) {
  if (lobby.status === 'finished' || lobby.status === 'terminated') {
    return lobby;
  }
  let nextLobby = lobby;
  let players = await fetchPlayers(lobby.id);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const stalePlayers = getStaleConnectedMembers(players, nowMs);
  if (stalePlayers.length > 0) {
    const stalePlayerIds = stalePlayers.map((player) => player.id);
    const query = getSupabaseServiceClient().from('multiplayer_quiz_players');
    const { error } = lobby.status === 'waiting'
      ? await query.delete().in('id', stalePlayerIds)
      : await query.update({ connected: false, disconnected_at: now, updated_at: now }).in('id', stalePlayerIds);
    if (error) {
      throw error;
    }
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'stale_players_removed');
  }

  const lifecycle = resolveMultiplayerLifecycle(players, nextLobby.host_player_id);
  const connectedPlayers = players.filter((player) => lifecycle.connectedMemberIds.includes(player.id));
  const hasReconnectableActivePlayers = nextLobby.status === 'active' && players.some((player) => (
    player.result === 'active' && !player.connected && canReconnect(player.disconnected_at, nowMs)
  ));
  if (lifecycle.shouldTerminate && !hasReconnectableActivePlayers) {
    const { data, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return data;
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ role: 'player', updated_at: now })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) throw demoteError;

    const { error: promoteError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ role: 'host', updated_at: now })
      .eq('id', lifecycle.hostPlayerId);
    if (promoteError) throw promoteError;

    const { data, error: lobbyError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ host_player_id: lifecycle.hostPlayerId, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (lobbyError) throw lobbyError;
    nextLobby = data;
    await addLobbyEvent(lobby.id, 'host_transferred');
  }

  if (nextLobby.status === 'waiting') {
    return nextLobby;
  }

  if (connectedPlayers.length === 0 && !hasReconnectableActivePlayers) {
    const { data, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', nextLobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return data;
  }

  const expiredPlayers = players.filter((player) => (
    player.result === 'active' && !player.connected && player.disconnected_at && !canReconnect(player.disconnected_at)
  ));
  if (expiredPlayers.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ result: 'failed', finished_at: now, updated_at: now })
      .in('id', expiredPlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'reconnect_window_expired');
  }

  const pendingReconnect = players.some((player) => (
    player.result === 'active' && !player.connected && canReconnect(player.disconnected_at)
  ));
  const connectedPlayersAfterReconnectResolution = players.filter((player) => player.connected);
  if (!pendingReconnect && connectedPlayersAfterReconnectResolution.length === 0) {
    const { data, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', nextLobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return data;
  }
  const connectedPlayersResolved = connectedPlayersAfterReconnectResolution.every((player) => player.result !== 'active');
  const onlyOnePlayerLeftInGame = connectedPlayersAfterReconnectResolution.length <= 1;
  const shouldFinish = !pendingReconnect && (
    connectedPlayersResolved ||
    onlyOnePlayerLeftInGame
  );
  if (shouldFinish) {
    const { data, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'finished', finished_at: now, updated_at: now })
      .eq('id', nextLobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'game_finished');
    return data;
  }
  return nextLobby;
}

async function getLobbyView(lobby: MultiplayerQuizLobby, clientId?: string | null): Promise<MultiplayerQuizLobbyView> {
  const reconciledLobby = await reconcileMultiplayerQuizLobby(lobby);
  const players = await fetchPlayers(reconciledLobby.id);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const profileCosmeticsByUserId = await fetchProfileCosmetics(players.map((player) => player.auth_user_id));
  const toPublicPlayer = (player: MultiplayerQuizPlayerRecord): MultiplayerQuizPublicPlayer => ({
    id: player.id,
    lobby_id: player.lobby_id,
    auth_user_id: player.auth_user_id,
    display_name: player.display_name,
    role: player.role,
    joined_at: player.joined_at,
    updated_at: player.updated_at,
    progress: player.progress,
    elapsed_seconds: player.elapsed_seconds,
    finished_at: player.finished_at,
    connected: player.connected,
    last_seen_at: player.last_seen_at,
    disconnected_at: player.disconnected_at,
    result: player.result,
    record_wins: player.record_wins,
    record_losses: player.record_losses,
    is_requesting_player: player.id === requestingPlayer?.id,
    avatar_url: player.auth_user_id ? profileCosmeticsByUserId.get(player.auth_user_id)?.avatarUrl ?? null : null,
    chat_color: player.auth_user_id ? profileCosmeticsByUserId.get(player.auth_user_id)?.chatColor ?? 'amber' : 'amber',
  });

  return {
    lobby: reconciledLobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer) : null,
    players: players.map(toPublicPlayer),
    quizItems: reconciledLobby.quiz_item_ids
      .map((itemId) => getGameCatalog(reconciledLobby.game_mode).find((item) => item.id === itemId))
      .filter((item): item is QuizItem => Boolean(item)),
  };
}

async function insertPlayer(lobby: MultiplayerQuizLobby, input: CreateOrJoinInput, role: 'host' | 'player') {
  const displayName = await resolveMultiplayerDisplayName(input);
  const recordSnapshot = sanitizeRecordSnapshot(input.recordSnapshot);
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .insert({
      lobby_id: lobby.id,
      client_id: input.clientId,
      auth_user_id: input.authUserId ?? null,
      display_name: displayName,
      role,
      record_wins: recordSnapshot.wins,
      record_losses: recordSnapshot.losses,
    })
    .select('*')
    .single<MultiplayerQuizPlayerRecord>();
  if (error) {
    throw error;
  }
  return data;
}

export async function createMultiplayerQuizLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  await forfeitOutstandingReconnects(input.clientId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: lobby, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .insert({ code: generateMultiplayerLobbyCode(), game_mode: input.gameMode, max_players: MAX_PLAYERS, total_items: DEFAULT_TOTAL_ITEMS })
      .select('*')
      .single<MultiplayerQuizLobby>();

    if (error) {
      if (error.code === '23505') {
        continue;
      }
      throw error;
    }

    const host = await insertPlayer(lobby, input, 'host');
    const { data: updatedLobby, error: updateError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ host_player_id: host.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (updateError) {
      throw updateError;
    }
    await addLobbyEvent(lobby.id, 'lobby_created');
    return getLobbyView(updatedLobby, input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinMultiplayerQuizLobby(code: string, input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status === 'terminated' || fetchedLobby.game_mode !== input.gameMode) {
    throw new Error('Lobby not found.');
  }
  await forfeitOutstandingReconnects(input.clientId, { multiplayerQuizLobbyId: fetchedLobby.id });
  const lobby = await reconcileMultiplayerQuizLobby(fetchedLobby);
  if (lobby.status === 'finished' || lobby.status === 'terminated') throw new Error('Lobby not found.');
  if (input.requirePublic && !lobby.is_public) {
    throw new Error('This lobby is no longer public.');
  }

  const players = await fetchPlayers(lobby.id);
  assertMultiplayerAccountAvailable(players, input.authUserId, input.clientId);
  const bannedClientIds = await fetchBannedClientIds(lobby.id);
  if (bannedClientIds.has(input.clientId)) {
    throw new Error('You cannot rejoin this lobby.');
  }
  const existingPlayer = players.find((player) => player.client_id === input.clientId);
  if (existingPlayer) {
    if (lobby.status === 'active' && (
      existingPlayer.result !== 'active' ||
      (!existingPlayer.connected && !canReconnect(existingPlayer.disconnected_at))
    )) {
      throw new Error('This player cannot rejoin the active game.');
    }
    const now = new Date().toISOString();
    const displayName = await resolveMultiplayerDisplayName(input);
    const recordSnapshot = input.recordSnapshot ? sanitizeRecordSnapshot(input.recordSnapshot) : null;
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({
        auth_user_id: input.authUserId ?? existingPlayer.auth_user_id,
        display_name: displayName,
        connected: true,
        last_seen_at: now,
        disconnected_at: null,
        ...(recordSnapshot ? { record_wins: recordSnapshot.wins, record_losses: recordSnapshot.losses } : {}),
        updated_at: now,
      })
      .eq('id', existingPlayer.id);
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'player_reconnected');
    return getLobbyView(lobby, input.clientId);
  }
  if (lobby.status !== 'waiting') {
    throw new Error('This game has already started.');
  }
  if (players.length >= lobby.max_players) {
    throw new Error('Lobby is full.');
  }

  await insertPlayer(lobby, input, 'player');
  await addLobbyEvent(lobby.id, 'player_joined');
  return getLobbyView(lobby, input.clientId);
}

export async function getMultiplayerQuizRejoinEligibility(code: string, clientId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby) return { eligible: false as const };
  const reconciledLobby = await reconcileMultiplayerQuizLobby(lobby);
  if (reconciledLobby.status !== 'active') return { eligible: false as const };
  const players = await fetchPlayers(reconciledLobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.connected || player.result !== 'active' || !canReconnect(player.disconnected_at)) {
    return { eligible: false as const };
  }
  return {
    eligible: true as const,
    code: reconciledLobby.code,
    expiresAt: new Date(getReconnectDeadline(player.disconnected_at as string)).toISOString(),
  };
}

export async function getMultiplayerQuizLobby(code: string, clientId?: string | null) {
  assertSupabaseConfigured();
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  return getLobbyView(lobby, clientId);
}

export async function startMultiplayerQuizLobby(code: string, clientId: string, recordSnapshot?: MultiplayerQuizRecordSnapshot | null) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby) {
    throw new Error('Lobby cannot be started.');
  }
  const lobby = await reconcileMultiplayerQuizLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }
  let players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can start the game.');
  const sanitizedRecord = recordSnapshot ? sanitizeRecordSnapshot(recordSnapshot) : null;
  if (sanitizedRecord) {
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ record_wins: sanitizedRecord.wins, record_losses: sanitizedRecord.losses, updated_at: new Date().toISOString() })
      .eq('id', host.id);
    if (error) {
      throw error;
    }
  }
  const disconnectedWaitingPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedWaitingPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .delete()
      .in('id', disconnectedWaitingPlayerIds);
    if (error) {
      throw error;
    }
    players = players.filter((player) => player.connected);
  }
  if (players.length < 2) {
    throw new Error('At least two players are required.');
  }
  const catalog = getGameCatalog(lobby.game_mode);
  const eligibleItems = lobby.game_mode === 'ability_blitz'
    ? filterItemsByAbilitySlots(catalog, lobby.ability_slots)
    : catalog;
  const itemIds = shuffle(eligibleItems).slice(0, lobby.total_items).map((item) => item.id);
  const now = new Date().toISOString();
  const { error: playerError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({ progress: 0, elapsed_seconds: 0, finished_at: null, result: 'active', connected: true, last_seen_at: now, disconnected_at: null, updated_at: now })
    .in('id', players.map((player) => player.id));
  if (playerError) {
    throw playerError;
  }
  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({ status: 'active', quiz_item_ids: itemIds, total_items: itemIds.length, started_at: now, finished_at: null, updated_at: now })
    .eq('id', lobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, 'game_started');
  return getLobbyView(updatedLobby, clientId);
}

export async function returnMultiplayerQuizLobbyToWaiting(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can return to the lobby.');
  }

  const players = await fetchPlayers(fetchedLobby.id);
  assertMultiplayerHost(players, fetchedLobby.host_player_id, clientId, 'Only the host can return everyone to the lobby.');

  const now = new Date().toISOString();
  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error: deleteError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .delete()
      .in('id', disconnectedPlayerIds);
    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: playerError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({
      progress: 0,
      elapsed_seconds: 0,
      finished_at: null,
      result: 'active',
      connected: true,
      last_seen_at: now,
      disconnected_at: null,
      updated_at: now,
    })
    .eq('lobby_id', fetchedLobby.id)
    .eq('connected', true);
  if (playerError) {
    throw playerError;
  }

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({
      status: 'waiting',
      quiz_item_ids: [],
      started_at: null,
      finished_at: null,
      is_public: false,
      updated_at: now,
    })
    .eq('id', fetchedLobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (error) {
    throw error;
  }

  await addLobbyEvent(updatedLobby.id, 'returned_to_lobby');
  return getLobbyView(updatedLobby, clientId);
}

export async function updateMultiplayerQuizProgress(
  code: string,
  clientId: string,
  progress: number,
  elapsedSeconds: number,
  result: MultiplayerQuizPlayerResult,
  recordSnapshot?: MultiplayerQuizRecordSnapshot | null,
) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) {
    throw new Error('Player not found.');
  }
  if (!Number.isFinite(progress) || !Number.isFinite(elapsedSeconds)) {
    throw new Error('Invalid progress update.');
  }
  const nextProgress = Math.max(player.progress, Math.min(lobby.total_items, Math.floor(progress)));
  if (nextProgress > player.progress + 1) {
    throw new Error('Invalid progress update.');
  }
  const now = new Date().toISOString();
  const completed = result === 'completed' && nextProgress >= lobby.total_items;
  const failed = result === 'failed' && lobby.difficulty === 'challenger';
  const nextResult: MultiplayerQuizPlayerResult = completed ? 'completed' : failed ? 'failed' : 'active';
  const shouldFinish = nextResult !== 'active';
  const sanitizedRecord = recordSnapshot ? sanitizeRecordSnapshot(recordSnapshot) : null;
  const { error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({
      progress: nextProgress,
      elapsed_seconds: Math.max(player.elapsed_seconds, Math.floor(elapsedSeconds)),
      finished_at: shouldFinish ? player.finished_at ?? now : null,
      result: nextResult,
      connected: true,
      last_seen_at: now,
      disconnected_at: null,
      ...(sanitizedRecord ? { record_wins: sanitizedRecord.wins, record_losses: sanitizedRecord.losses } : {}),
      updated_at: now,
    })
    .eq('id', player.id);
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, 'progress_updated');
  return getLobbyView(lobby, clientId);
}

export async function heartbeatMultiplayerQuizPlayer(
  code: string,
  clientId: string,
  connected = true,
  recordSnapshot?: MultiplayerQuizRecordSnapshot | null,
) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) throw new Error('Player not found.');
  if (connected && lobby.status === 'active' && !player.connected && !canReconnect(player.disconnected_at)) {
    await reconcileMultiplayerQuizLobby(lobby);
    throw new Error('The reconnect window has expired.');
  }
  const now = new Date().toISOString();
  const sanitizedRecord = recordSnapshot ? sanitizeRecordSnapshot(recordSnapshot) : null;
  const disconnectedAt = connected ? null : player.disconnected_at ?? now;
  const { error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({
      connected,
      last_seen_at: now,
      disconnected_at: disconnectedAt,
      ...(sanitizedRecord ? { record_wins: sanitizedRecord.wins, record_losses: sanitizedRecord.losses } : {}),
      updated_at: now,
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, connected ? 'player_reconnected' : 'player_disconnected');
  return getLobbyView(lobby, clientId);
}

export async function updateMultiplayerQuizSettings(
  code: string,
  clientId: string,
  difficulty: string,
  modifiers: unknown,
  totalItems: number,
  isPublic: boolean,
  abilitySlots: unknown,
) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileMultiplayerQuizLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change lobby settings.');
  if (!difficulties.has(difficulty as MultiplayerQuizDifficulty)) {
    throw new Error('Invalid difficulty.');
  }
  if (!Number.isFinite(totalItems)) {
    throw new Error('Invalid entry count.');
  }
  const validModifiers = Array.isArray(modifiers)
    ? [...new Set(modifiers.filter((value): value is string => typeof value === 'string' && modifierIds[lobby.game_mode].has(value)))]
    : [];
  const validAbilitySlots = lobby.game_mode === 'ability_blitz' && Array.isArray(abilitySlots)
    ? ALL_ABILITY_SLOT_IDS.filter((slot) => abilitySlots.includes(slot))
    : ALL_ABILITY_SLOT_IDS;
  if (validAbilitySlots.length === 0) {
    throw new Error('Select at least one ability set.');
  }
  const catalog = getGameCatalog(lobby.game_mode);
  const catalogSize = lobby.game_mode === 'ability_blitz'
    ? filterItemsByAbilitySlots(catalog, validAbilitySlots).length
    : catalog.length;
  const validTotalItems = Math.min(catalogSize, Math.max(1, Math.floor(totalItems)));

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({
      difficulty,
      modifiers: validModifiers,
      ability_slots: validAbilitySlots,
      total_items: validTotalItems,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, 'settings_updated');
  return getLobbyView(updatedLobby, clientId);
}

export async function listPublicMultiplayerQuizLobbies(gameMode: MultiplayerQuizGameMode) {
  assertSupabaseConfigured();
  const { data: lobbies, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .select('*')
    .eq('game_mode', gameMode)
    .eq('status', 'waiting')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(30)
    .returns<MultiplayerQuizLobby[]>();
  if (error) {
    throw error;
  }
  if (lobbies.length === 0) return [];
  const { data: publicPlayers, error: playersError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .select('id, lobby_id, auth_user_id, display_name, connected, last_seen_at')
    .in('lobby_id', lobbies.map((lobby) => lobby.id))
    .returns<Array<Pick<MultiplayerQuizPlayerRecord, 'id' | 'lobby_id' | 'auth_user_id' | 'display_name' | 'connected' | 'last_seen_at'>>>();
  if (playersError) {
    throw playersError;
  }

  const nowMs = Date.now();
  const profileCosmeticsByUserId = await fetchProfileCosmetics(publicPlayers.map((player) => player.auth_user_id));
  return lobbies.map((lobby): MultiplayerQuizPublicLobby | null => {
    const players = getFreshConnectedMembers(publicPlayers.filter((player) => player.lobby_id === lobby.id), nowMs);
    if (players.length === 0) return null;
    if (players.length >= lobby.max_players) {
      return null;
    }
    const host = players.find((player) => player.id === lobby.host_player_id);
    if (!host) return null;
    return {
      code: lobby.code,
      gameMode: lobby.game_mode,
      difficulty: lobby.difficulty,
      modifiers: lobby.modifiers,
      abilitySlots: lobby.ability_slots,
      totalItems: lobby.total_items,
      playerCount: players.length,
      maxPlayers: lobby.max_players,
      hostName: host.display_name,
      hostChatColor: host.auth_user_id ? profileCosmeticsByUserId.get(host.auth_user_id)?.chatColor ?? 'amber' : 'amber',
    };
  }).filter((entry): entry is MultiplayerQuizPublicLobby => entry !== null);
}

export async function leaveMultiplayerQuizLobby(code: string, clientId: string, forfeit = false) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    return { left: true };
  }
  const players = await fetchPlayers(lobby.id);
  const leavingPlayer = players.find((player) => player.client_id === clientId);
  if (!leavingPlayer) {
    return { left: true };
  }
  if (lobby.status === 'finished') {
    const now = new Date().toISOString();
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ connected: false, disconnected_at: now, last_seen_at: now, updated_at: now })
      .eq('id', leavingPlayer.id);
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'player_disconnected');
    return { left: true };
  }
  if (lobby.status === 'active') {
    const now = new Date().toISOString();
    const disconnectedAt = forfeit ? '1970-01-01T00:00:00.000Z' : now;
    const resultUpdate = forfeit && leavingPlayer.result === 'active'
      ? { result: 'failed' as const, finished_at: now }
      : {};
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({
        connected: false,
        disconnected_at: disconnectedAt,
        last_seen_at: now,
        updated_at: now,
        ...resultUpdate,
      })
      .eq('id', leavingPlayer.id);
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, forfeit ? 'reconnect_forfeited' : 'player_disconnected');
    await reconcileMultiplayerQuizLobby(lobby);
    return { left: true };
  }
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .delete()
    .eq('id', leavingPlayer.id);
  if (deleteError) {
    throw deleteError;
  }

  const remainingPlayers = players.filter((player) => player.id !== leavingPlayer.id);
  const lifecycle = resolveMultiplayerLifecycle(remainingPlayers, lobby.host_player_id);
  if (lifecycle.shouldTerminate) {
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lobby.id);
    if (error) {
      throw error;
    }
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return { left: true };
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const nextHost = remainingPlayers.find((player) => player.id === lifecycle.hostPlayerId);
    if (!nextHost) {
      throw new Error('Unable to assign a lobby host.');
    }
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ role: 'player', updated_at: new Date().toISOString() })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) {
      throw demoteError;
    }
    const { error: roleError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ role: 'host', updated_at: new Date().toISOString() })
      .eq('id', nextHost.id);
    if (roleError) {
      throw roleError;
    }
    const { error: lobbyError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ host_player_id: nextHost.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id);
    if (lobbyError) {
      throw lobbyError;
    }
  }

  await addLobbyEvent(lobby.id, 'player_left');
  return { left: true };
}

export async function kickMultiplayerQuizPlayer(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileMultiplayerQuizLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can kick players.');
  const target = players.find((player) => player.id === targetPlayerId);
  if (!target || target.id === host.id) {
    throw new Error('Invalid kick target.');
  }

  const { error: banError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobby_bans')
    .upsert({ lobby_id: lobby.id, client_id: target.client_id, banned_by_player_id: host.id }, { onConflict: 'lobby_id,client_id' });
  if (banError) {
    throw banError;
  }
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .delete()
    .eq('id', target.id);
  if (deleteError) {
    throw deleteError;
  }
  await addLobbyEvent(lobby.id, 'player_kicked');
  return getLobbyView(lobby, clientId);
}

export async function transferMultiplayerQuizHost(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileMultiplayerQuizLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can transfer host.');
  const target = players.find((player) => player.id === targetPlayerId);
  if (!target || target.id === host.id || !target.connected) {
    throw new Error('Invalid host target.');
  }

  const now = new Date().toISOString();
  const { error: demoteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({ role: 'player', updated_at: now })
    .eq('id', host.id);
  if (demoteError) throw demoteError;
  const { error: promoteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({ role: 'host', updated_at: now })
    .eq('id', target.id);
  if (promoteError) throw promoteError;
  const { data: updatedLobby, error: lobbyError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({ host_player_id: target.id, updated_at: new Date().toISOString() })
    .eq('id', lobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (lobbyError) {
    throw lobbyError;
  }
  await addLobbyEvent(lobby.id, 'host_transferred');
  return getLobbyView(updatedLobby, clientId);
}
