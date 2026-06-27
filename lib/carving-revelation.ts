import { getSkinCatalog } from '@/lib/catalogs';
import { canReconnect, resolveMultiplayerLifecycle } from '@/lib/multiplayer-lifecycle';
import { forfeitOutstandingReconnects } from '@/lib/multiplayer-reconnect';
import {
  addMultiplayerLobbyEvent,
  assertMultiplayerAccountAvailable,
  assertMultiplayerHost,
  assertSupabaseConfigured,
  generateMultiplayerLobbyCode,
  getStaleConnectedMembers,
  MULTIPLAYER_MAX_LOBBY_PLAYERS,
  normalizeLobbyCode,
  resolveMultiplayerDisplayName,
} from '@/lib/multiplayer-session';
import { answerMatches, shuffle, type QuizItem } from '@/lib/quiz';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type CarvingRevelationLobbyStatus = 'waiting' | 'active' | 'finished' | 'terminated';
export type CarvingRevelationPlayerResult = 'active' | 'eliminated' | 'won';
export type CarvingRevelationActionType = 'draw' | 'guess';

export type CarvingRevelationLobby = {
  id: string;
  code: string;
  status: CarvingRevelationLobbyStatus;
  host_player_id: string | null;
  max_players: number;
  is_public: boolean;
  secret_skin_id: string | null;
  turn_order: string[];
  current_turn_index: number;
  round_number: number;
  winner_player_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  terminated_at: string | null;
};

type CarvingRevelationPlayerRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: 'host' | 'player';
  result: CarvingRevelationPlayerResult;
  joined_at: string;
  updated_at: string;
  connected: boolean;
  last_seen_at: string;
  disconnected_at: string | null;
};

export type CarvingRevelationPublicPlayer = Omit<CarvingRevelationPlayerRecord, 'client_id'> & {
  is_requesting_player: boolean;
  avatar_url: string | null;
};

export type CarvingRevelationAction = {
  id: number;
  lobby_id: string;
  player_id: string | null;
  action_type: CarvingRevelationActionType;
  turn_index: number;
  round_number: number;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CarvingRevelationPublicSkin = {
  id: string;
  imageUrl: string;
  title?: string;
  answer?: string;
  champion?: string;
};

export type CarvingRevelationLobbyView = {
  lobby: CarvingRevelationLobby;
  requestingPlayer: CarvingRevelationPublicPlayer | null;
  players: CarvingRevelationPublicPlayer[];
  actions: CarvingRevelationAction[];
  skin: CarvingRevelationPublicSkin | null;
  currentTurnPlayerId: string | null;
  lineLengthLimit: number;
};

type CreateOrJoinInput = {
  clientId: string;
  authUserId?: string | null;
};

type DrawInput = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const MAX_PLAYERS = Math.min(8, MULTIPLAYER_MAX_LOBBY_PLAYERS);
const BASE_LINE_LENGTH = 0.16;
const LINE_LENGTH_GROWTH_PER_ROUND = 0.035;
const MAX_LINE_LENGTH = 0.46;

function getLineLengthLimit(roundNumber: number) {
  return Math.min(MAX_LINE_LENGTH, BASE_LINE_LENGTH + Math.max(0, roundNumber - 1) * LINE_LENGTH_GROWTH_PER_ROUND);
}

function getSkinById(skinId: string | null) {
  if (!skinId) return null;
  return getSkinCatalog().find((skin) => skin.id === skinId) ?? null;
}

function toPublicSkin(lobby: CarvingRevelationLobby): CarvingRevelationPublicSkin | null {
  const skin = getSkinById(lobby.secret_skin_id);
  if (!skin) return null;
  if (lobby.status === 'finished') {
    return {
      id: skin.id,
      imageUrl: skin.imageUrl,
      title: skin.title,
      answer: skin.answer,
      champion: skin.champion,
    };
  }
  return {
    id: skin.id,
    imageUrl: skin.imageUrl,
  };
}

function sanitizeTurnOrder(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getCurrentTurnPlayerId(lobby: CarvingRevelationLobby, players: CarvingRevelationPlayerRecord[]) {
  if (lobby.status !== 'active') return null;
  const turnOrder = sanitizeTurnOrder(lobby.turn_order);
  if (turnOrder.length === 0) return null;
  const activeConnectedIds = new Set(players
    .filter((player) => player.result === 'active' && player.connected)
    .map((player) => player.id));
  if (activeConnectedIds.size === 0) return null;

  for (let offset = 0; offset < turnOrder.length; offset += 1) {
    const index = (lobby.current_turn_index + offset) % turnOrder.length;
    const playerId = turnOrder[index];
    if (activeConnectedIds.has(playerId)) {
      return { playerId, index };
    }
  }

  return null;
}

function getNextTurn(
  lobby: CarvingRevelationLobby,
  players: CarvingRevelationPlayerRecord[],
  startIndex = lobby.current_turn_index + 1,
) {
  const turnOrder = sanitizeTurnOrder(lobby.turn_order);
  const activeConnectedIds = new Set(players
    .filter((player) => player.result === 'active' && player.connected)
    .map((player) => player.id));
  if (turnOrder.length === 0 || activeConnectedIds.size === 0) {
    return { index: 0, roundNumber: lobby.round_number };
  }

  for (let offset = 0; offset < turnOrder.length; offset += 1) {
    const rawIndex = startIndex + offset;
    const index = rawIndex % turnOrder.length;
    const playerId = turnOrder[index];
    if (activeConnectedIds.has(playerId)) {
      return {
        index,
        roundNumber: lobby.round_number + (rawIndex >= turnOrder.length ? 1 : 0),
      };
    }
  }

  return { index: lobby.current_turn_index, roundNumber: lobby.round_number };
}

async function fetchLobby(code: string) {
  assertSupabaseConfigured();
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .select('*')
    .eq('code', normalizeLobbyCode(code))
    .maybeSingle<CarvingRevelationLobby>();

  if (error) throw error;
  return data ? { ...data, turn_order: sanitizeTurnOrder(data.turn_order) } : null;
}

async function fetchPlayers(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })
    .returns<CarvingRevelationPlayerRecord[]>();

  if (error) throw error;
  return data;
}

async function fetchActions(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('id', { ascending: true })
    .returns<CarvingRevelationAction[]>();

  if (error) throw error;
  return data;
}

async function fetchProfileAvatars(authUserIds: Array<string | null>) {
  const userIds = [...new Set(authUserIds.filter((userId): userId is string => Boolean(userId)))];
  if (userIds.length === 0) {
    return new Map<string, string | null>();
  }
  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id, avatar_url')
    .in('id', userIds)
    .returns<Array<{ id: string; avatar_url: string | null }>>();
  if (error) throw error;
  return new Map(data.map((profile) => [profile.id, profile.avatar_url ?? null]));
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  await addMultiplayerLobbyEvent('carving_revelation_lobby_events', lobbyId, eventType);
}

async function reconcileCarvingRevelationLobby(lobby: CarvingRevelationLobby) {
  if (lobby.status === 'finished' || lobby.status === 'terminated') {
    return lobby;
  }

  let nextLobby = lobby;
  let players = await fetchPlayers(lobby.id);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const stalePlayers = getStaleConnectedMembers(players, nowMs);
  if (stalePlayers.length > 0) {
    const query = getSupabaseServiceClient().from('carving_revelation_players');
    const { error } = lobby.status === 'waiting'
      ? await query.delete().in('id', stalePlayers.map((player) => player.id))
      : await query.update({ connected: false, disconnected_at: now, updated_at: now }).in('id', stalePlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'stale_players_removed');
  }

  const lifecycle = resolveMultiplayerLifecycle(players, nextLobby.host_player_id);
  if (lifecycle.shouldTerminate) {
    const { data, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return { ...data, turn_order: sanitizeTurnOrder(data.turn_order) };
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ role: 'player', updated_at: now })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) throw demoteError;

    const { error: promoteError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ role: 'host', updated_at: now })
      .eq('id', lifecycle.hostPlayerId);
    if (promoteError) throw promoteError;

    const { data, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ host_player_id: lifecycle.hostPlayerId, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    nextLobby = { ...data, turn_order: sanitizeTurnOrder(data.turn_order) };
    await addLobbyEvent(lobby.id, 'host_transferred');
  }

  if (nextLobby.status === 'waiting') {
    return nextLobby;
  }

  const expiredPlayers = players.filter((player) => (
    player.result === 'active' && !player.connected && player.disconnected_at && !canReconnect(player.disconnected_at)
  ));
  if (expiredPlayers.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'eliminated', updated_at: now })
      .in('id', expiredPlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'reconnect_window_expired');
  }

  const activePlayers = players.filter((player) => player.result === 'active');
  const pendingReconnect = activePlayers.some((player) => !player.connected && canReconnect(player.disconnected_at));
  if (!pendingReconnect && activePlayers.length <= 1) {
    const winner = activePlayers[0] ?? null;
    if (winner) {
      const { error } = await getSupabaseServiceClient()
        .from('carving_revelation_players')
        .update({ result: 'won', updated_at: now })
        .eq('id', winner.id);
      if (error) throw error;
    }
    const { data, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ status: 'finished', winner_player_id: winner?.id ?? null, finished_at: now, updated_at: now })
      .eq('id', nextLobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'game_finished');
    return { ...data, turn_order: sanitizeTurnOrder(data.turn_order) };
  }

  const currentTurn = getCurrentTurnPlayerId(nextLobby, players);
  if (currentTurn && currentTurn.index !== nextLobby.current_turn_index) {
    const { data, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ current_turn_index: currentTurn.index, updated_at: now })
      .eq('id', nextLobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    nextLobby = { ...data, turn_order: sanitizeTurnOrder(data.turn_order) };
    await addLobbyEvent(lobby.id, 'turn_skipped');
  }

  return nextLobby;
}

async function getLobbyView(lobby: CarvingRevelationLobby, clientId?: string | null): Promise<CarvingRevelationLobbyView> {
  const reconciledLobby = await reconcileCarvingRevelationLobby(lobby);
  const players = await fetchPlayers(reconciledLobby.id);
  const actions = await fetchActions(reconciledLobby.id);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const avatarByUserId = await fetchProfileAvatars(players.map((player) => player.auth_user_id));
  const currentTurn = getCurrentTurnPlayerId(reconciledLobby, players);

  const toPublicPlayer = (player: CarvingRevelationPlayerRecord): CarvingRevelationPublicPlayer => ({
    id: player.id,
    lobby_id: player.lobby_id,
    auth_user_id: player.auth_user_id,
    display_name: player.display_name,
    role: player.role,
    result: player.result,
    joined_at: player.joined_at,
    updated_at: player.updated_at,
    connected: player.connected,
    last_seen_at: player.last_seen_at,
    disconnected_at: player.disconnected_at,
    is_requesting_player: player.id === requestingPlayer?.id,
    avatar_url: player.auth_user_id ? avatarByUserId.get(player.auth_user_id) ?? null : null,
  });

  return {
    lobby: reconciledLobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer) : null,
    players: players.map(toPublicPlayer),
    actions,
    skin: toPublicSkin(reconciledLobby),
    currentTurnPlayerId: currentTurn?.playerId ?? null,
    lineLengthLimit: getLineLengthLimit(reconciledLobby.round_number),
  };
}

async function insertPlayer(lobby: CarvingRevelationLobby, input: CreateOrJoinInput, role: 'host' | 'player') {
  const displayName = await resolveMultiplayerDisplayName(input);
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .insert({
      lobby_id: lobby.id,
      client_id: input.clientId,
      auth_user_id: input.authUserId ?? null,
      display_name: displayName,
      role,
    })
    .select('*')
    .single<CarvingRevelationPlayerRecord>();
  if (error) throw error;
  return data;
}

export async function createCarvingRevelationLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  await forfeitOutstandingReconnects(input.clientId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: lobby, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .insert({ code: generateMultiplayerLobbyCode(), max_players: MAX_PLAYERS })
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) {
      if (error.code === '23505') continue;
      throw error;
    }

    const host = await insertPlayer({ ...lobby, turn_order: sanitizeTurnOrder(lobby.turn_order) }, input, 'host');
    const { data: updatedLobby, error: updateError } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ host_player_id: host.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (updateError) throw updateError;
    await addLobbyEvent(lobby.id, 'lobby_created');
    return getLobbyView({ ...updatedLobby, turn_order: sanitizeTurnOrder(updatedLobby.turn_order) }, input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinCarvingRevelationLobby(code: string, input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  await forfeitOutstandingReconnects(input.clientId, { carvingRevelationLobbyId: fetchedLobby.id });
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status === 'finished' || lobby.status === 'terminated') throw new Error('Lobby not found.');

  const players = await fetchPlayers(lobby.id);
  assertMultiplayerAccountAvailable(players, input.authUserId, input.clientId);
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
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({
        auth_user_id: input.authUserId ?? existingPlayer.auth_user_id,
        display_name: displayName,
        connected: true,
        last_seen_at: now,
        disconnected_at: null,
        updated_at: now,
      })
      .eq('id', existingPlayer.id);
    if (error) throw error;
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

export async function getCarvingRevelationLobby(code: string, clientId?: string | null) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  return getLobbyView(lobby, clientId);
}

export async function startCarvingRevelationLobby(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }
  let players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can start the game.');
  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .delete()
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
    players = players.filter((player) => player.connected);
  }
  if (players.length < 2) {
    throw new Error('At least two players are required.');
  }

  const skin = shuffle(getSkinCatalog())[0] as QuizItem | undefined;
  if (!skin) {
    throw new Error('No skins are available.');
  }

  const now = new Date().toISOString();
  const turnOrder = shuffle(players).map((player) => player.id);
  const { error: playerError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({ result: 'active', connected: true, last_seen_at: now, disconnected_at: null, updated_at: now })
    .in('id', players.map((player) => player.id));
  if (playerError) throw playerError;

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      status: 'active',
      secret_skin_id: skin.id,
      turn_order: turnOrder,
      current_turn_index: 0,
      round_number: 1,
      winner_player_id: null,
      started_at: now,
      finished_at: null,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'game_started');
  return getLobbyView({ ...updatedLobby, turn_order: sanitizeTurnOrder(updatedLobby.turn_order) }, clientId);
}

export async function heartbeatCarvingRevelationPlayer(code: string, clientId: string, connected = true) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) throw new Error('Player not found.');
  if (connected && lobby.status === 'active' && !player.connected && !canReconnect(player.disconnected_at)) {
    throw new Error('The reconnect window has expired.');
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({
      connected,
      last_seen_at: now,
      disconnected_at: connected ? null : now,
      updated_at: now,
    })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);
  if (error) throw error;
  await addLobbyEvent(lobby.id, connected ? 'player_reconnected' : 'player_disconnected');
  return getLobbyView(lobby, clientId);
}

export async function leaveCarvingRevelationLobby(code: string, clientId: string, forfeit = false) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    return { left: true };
  }
  const players = await fetchPlayers(lobby.id);
  const leavingPlayer = players.find((player) => player.client_id === clientId);
  if (!leavingPlayer) {
    return { left: true };
  }

  if (lobby.status === 'active' || lobby.status === 'finished') {
    const now = new Date().toISOString();
    const disconnectedAt = forfeit ? '1970-01-01T00:00:00.000Z' : now;
    const resultUpdate = forfeit && leavingPlayer.result === 'active'
      ? { result: 'eliminated' as const }
      : {};
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({
        connected: false,
        disconnected_at: disconnectedAt,
        last_seen_at: now,
        updated_at: now,
        ...resultUpdate,
      })
      .eq('id', leavingPlayer.id);
    if (error) throw error;
    await addLobbyEvent(lobby.id, forfeit ? 'reconnect_forfeited' : 'player_disconnected');
    await reconcileCarvingRevelationLobby(lobby);
    return { left: true };
  }

  const { error: deleteError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .delete()
    .eq('id', leavingPlayer.id);
  if (deleteError) throw deleteError;

  const remainingPlayers = players.filter((player) => player.id !== leavingPlayer.id);
  const lifecycle = resolveMultiplayerLifecycle(remainingPlayers, lobby.host_player_id);
  if (lifecycle.shouldTerminate) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lobby.id);
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return { left: true };
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const now = new Date().toISOString();
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ role: 'player', updated_at: now })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) throw demoteError;
    const { error: promoteError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ role: 'host', updated_at: now })
      .eq('id', lifecycle.hostPlayerId);
    if (promoteError) throw promoteError;
    const { error: lobbyError } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ host_player_id: lifecycle.hostPlayerId, updated_at: now })
      .eq('id', lobby.id);
    if (lobbyError) throw lobbyError;
  }

  await addLobbyEvent(lobby.id, 'player_left');
  return { left: true };
}

function normalizeStroke(input: DrawInput) {
  const coordinates = [input.x1, input.y1, input.x2, input.y2];
  if (coordinates.some((value) => !Number.isFinite(value))) {
    throw new Error('Invalid reveal stroke.');
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const stroke = {
    x1: clamp(input.x1),
    y1: clamp(input.y1),
    x2: clamp(input.x2),
    y2: clamp(input.y2),
  };
  const length = Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1);
  if (length <= 0.005) {
    throw new Error('Draw a longer reveal line.');
  }
  return { ...stroke, length };
}

async function assertCurrentTurn(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.result !== 'active' || !player.connected) {
    throw new Error('Player not found.');
  }
  const currentTurn = getCurrentTurnPlayerId(lobby, players);
  if (!currentTurn || currentTurn.playerId !== player.id) {
    throw new Error('It is not your turn.');
  }
  return { lobby, players, player, currentTurnIndex: currentTurn.index };
}

async function advanceTurn(lobby: CarvingRevelationLobby, players: CarvingRevelationPlayerRecord[]) {
  const nextTurn = getNextTurn(lobby, players);
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      current_turn_index: nextTurn.index,
      round_number: nextTurn.roundNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'turn_advanced');
  return { ...data, turn_order: sanitizeTurnOrder(data.turn_order) };
}

export async function drawCarvingRevealStroke(code: string, clientId: string, input: DrawInput) {
  const { lobby, players, player, currentTurnIndex } = await assertCurrentTurn(code, clientId);
  const stroke = normalizeStroke(input);
  const lineLengthLimit = getLineLengthLimit(lobby.round_number);
  if (stroke.length > lineLengthLimit + 0.002) {
    throw new Error('Reveal line is too long for this round.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'draw',
      turn_index: currentTurnIndex,
      round_number: lobby.round_number,
      payload: { ...stroke, lineLengthLimit },
    });
  if (error) throw error;

  const updatedLobby = await advanceTurn(lobby, players);
  return getLobbyView(updatedLobby, clientId);
}

export async function guessCarvingRevelationSkin(code: string, clientId: string, guess: string) {
  const { lobby, players, player, currentTurnIndex } = await assertCurrentTurn(code, clientId);
  const trimmedGuess = guess.trim().slice(0, 120);
  if (!trimmedGuess) {
    throw new Error('Guess is required.');
  }
  const skin = getSkinById(lobby.secret_skin_id);
  if (!skin) {
    throw new Error('Secret skin is unavailable.');
  }
  const correct = answerMatches(trimmedGuess, skin.answer);
  const now = new Date().toISOString();

  const { error: actionError } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'guess',
      turn_index: currentTurnIndex,
      round_number: lobby.round_number,
      payload: { guess: trimmedGuess, correct },
    });
  if (actionError) throw actionError;

  if (correct) {
    const { error: playerError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'won', updated_at: now })
      .eq('id', player.id);
    if (playerError) throw playerError;
    const { error: eliminatedError } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'eliminated', updated_at: now })
      .eq('lobby_id', lobby.id)
      .neq('id', player.id)
      .eq('result', 'active');
    if (eliminatedError) throw eliminatedError;
    const { data: updatedLobby, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ status: 'finished', winner_player_id: player.id, finished_at: now, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'game_finished');
    return getLobbyView({ ...updatedLobby, turn_order: sanitizeTurnOrder(updatedLobby.turn_order) }, clientId);
  }

  const updatedLobby = await advanceTurn(lobby, players);
  return getLobbyView(updatedLobby, clientId);
}
