import { getSkinCatalog } from '@/lib/catalogs';
import { CHAT_COLOR_HEX, CHAT_COLOR_VALUES, normalizeChatColor } from '@/lib/chat-colors';
import { canReconnect, MULTIPLAYER_STALE_AFTER_MS, resolveMultiplayerLifecycle } from '@/lib/multiplayer-lifecycle';
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
export type CarvingRevelationActionType = 'draw' | 'guess' | 'next_round_vote';
export type CarvingRevelationPhase = 'carve' | 'guess';
export type CarvingRevelationWinCondition = 'everyone_correct' | 'first_correct';
export type CarvingRevelationModifier = 'greyscale' | 'blurred' | 'cropped';

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
  phase: CarvingRevelationPhase;
  phase_deadline_at: string | null;
  phase_duration_seconds: number | null;
  win_condition: CarvingRevelationWinCondition;
  modifiers: CarvingRevelationModifier[];
  starting_line_length_percent: number;
  line_length_increment_percent: number;
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
  carve_color: string;
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
  maxLineLength: number;
  nextRoundVotes: string[];
  phaseEndsAt: string | null;
};

export type CarvingRevelationPublicLobby = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
};

type CreateOrJoinInput = {
  clientId: string;
  authUserId?: string | null;
  requirePublic?: boolean;
};

type RevealPoint = {
  x: number;
  y: number;
};

type DrawInput = {
  points: RevealPoint[];
};

const MAX_PLAYERS = Math.min(8, MULTIPLAYER_MAX_LOBBY_PLAYERS);
const MAX_LINE_LENGTH = 0.5;
const DEFAULT_PHASE_SECONDS = 30;
const PHASE_DURATION_OPTIONS = new Set<number | null>([10, 20, 30, 45, 60, null]);
const WIN_CONDITIONS = new Set<CarvingRevelationWinCondition>(['everyone_correct', 'first_correct']);
const MODIFIERS = new Set<CarvingRevelationModifier>(['greyscale', 'blurred', 'cropped']);
const STARTING_LINE_LENGTH_OPTIONS = new Set([5, 8, 10, 15, 20]);
const LINE_LENGTH_INCREMENT_OPTIONS = new Set([1, 2, 3, 4, 5]);

function getPhaseDeadline(seconds: number | null, now = Date.now()) {
  if (seconds === null) return null;
  return new Date(now + seconds * 1000).toISOString();
}

function normalizePhaseDuration(value: unknown) {
  if (value === null) return null;
  const numericValue = Number(value);
  return PHASE_DURATION_OPTIONS.has(numericValue) ? numericValue : DEFAULT_PHASE_SECONDS;
}

function normalizeWinCondition(value: unknown): CarvingRevelationWinCondition {
  return typeof value === 'string' && WIN_CONDITIONS.has(value as CarvingRevelationWinCondition)
    ? value as CarvingRevelationWinCondition
    : 'everyone_correct';
}

function normalizeModifiers(value: unknown): CarvingRevelationModifier[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is CarvingRevelationModifier => (
      typeof entry === 'string' && MODIFIERS.has(entry as CarvingRevelationModifier)
    )))]
    : [];
}

function normalizeStartingLineLength(value: unknown) {
  const numericValue = Number(value);
  return STARTING_LINE_LENGTH_OPTIONS.has(numericValue) ? numericValue : 8;
}

function normalizeLineLengthIncrement(value: unknown) {
  const numericValue = Number(value);
  return LINE_LENGTH_INCREMENT_OPTIONS.has(numericValue) ? numericValue : 2;
}

function normalizeLobbySettings<TLobby extends CarvingRevelationLobby>(lobby: TLobby): TLobby {
  return {
    ...lobby,
    turn_order: sanitizeTurnOrder(lobby.turn_order),
    phase_duration_seconds: normalizePhaseDuration(lobby.phase_duration_seconds),
    win_condition: normalizeWinCondition(lobby.win_condition),
    modifiers: normalizeModifiers(lobby.modifiers),
    starting_line_length_percent: normalizeStartingLineLength(lobby.starting_line_length_percent),
    line_length_increment_percent: normalizeLineLengthIncrement(lobby.line_length_increment_percent),
  };
}

function getLineLengthLimit(lobby: CarvingRevelationLobby) {
  const percent = lobby.starting_line_length_percent + Math.max(0, lobby.round_number - 1) * lobby.line_length_increment_percent;
  return Math.min(MAX_LINE_LENGTH, percent / 100);
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

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getFallbackCarveColor(playerId: string) {
  return CHAT_COLOR_HEX[CHAT_COLOR_VALUES[hashString(playerId) % CHAT_COLOR_VALUES.length]];
}

function isActiveMatchPlayer(player: CarvingRevelationPlayerRecord) {
  return player.result === 'active' && player.connected;
}

function getCurrentTurnPlayerId(lobby: CarvingRevelationLobby, players: CarvingRevelationPlayerRecord[]) {
  if (lobby.status !== 'active') return null;
  const turnOrder = sanitizeTurnOrder(lobby.turn_order);
  if (turnOrder.length === 0) return null;
  const activeConnectedIds = new Set(players
    .filter(isActiveMatchPlayer)
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
    .filter(isActiveMatchPlayer)
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
  return data ? normalizeLobbySettings(data) : null;
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

async function refreshActivePlayerPresence(lobbyId: string, clientId: string) {
  const players = await fetchPlayers(lobbyId);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.result !== 'active') return;
  if (!player.connected) {
    throw new Error('This player is no longer in the active game.');
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({ connected: true, disconnected_at: null, last_seen_at: now, updated_at: now })
    .eq('id', player.id);
  if (error) throw error;
}

async function fetchBannedClientIds(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobby_bans')
    .select('client_id')
    .eq('lobby_id', lobbyId)
    .returns<Array<{ client_id: string }>>();
  if (error) throw error;
  return new Set(data.map((ban) => ban.client_id));
}

type ProfileCosmetics = {
  avatar_url: string | null;
  carve_color: string;
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
  if (error) throw error;
  return new Map(data.map((profile) => [
    profile.id,
    {
      avatar_url: profile.avatar_url ?? null,
      carve_color: CHAT_COLOR_HEX[normalizeChatColor(profile.chat_color)],
    },
  ]));
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  await addMultiplayerLobbyEvent('carving_revelation_lobby_events', lobbyId, eventType);
}

function getActivePlayerIds(players: CarvingRevelationPlayerRecord[]) {
  return players
    .filter(isActiveMatchPlayer)
    .map((player) => player.id);
}

async function finishCarvingRevelationMatch(
  lobby: CarvingRevelationLobby,
  players: CarvingRevelationPlayerRecord[],
) {
  const wonPlayers = players.filter((player) => player.result === 'won');
  const fallbackWinner = wonPlayers[0] ?? players.find((player) => player.connected) ?? null;
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({ status: 'finished', winner_player_id: fallbackWinner?.id ?? null, finished_at: now, updated_at: now })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'game_finished');
  return normalizeLobbySettings(data);
}

async function resolveGuessPhase(lobby: CarvingRevelationLobby, players: CarvingRevelationPlayerRecord[]) {
  const actions = await fetchActions(lobby.id);
  const correctPlayerIds = actions
    .filter((action) => (
      action.action_type === 'guess' &&
      action.round_number === lobby.round_number &&
      action.payload.correct === true &&
      action.player_id
    ))
    .map((action) => action.player_id as string);
  const uniqueCorrectPlayerIds = [...new Set(correctPlayerIds)];
  const now = new Date().toISOString();

  if (uniqueCorrectPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'won', updated_at: now })
      .in('id', uniqueCorrectPlayerIds);
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    if (lobby.win_condition === 'first_correct') {
      return finishCarvingRevelationMatch(lobby, players);
    }
  }

  const activePlayerIds = getActivePlayerIds(players);
  if (activePlayerIds.length === 0) {
    return finishCarvingRevelationMatch(lobby, players);
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      phase: 'carve',
      phase_deadline_at: getPhaseDeadline(lobby.phase_duration_seconds),
      round_number: lobby.round_number + 1,
      current_turn_index: 0,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, uniqueCorrectPlayerIds.length > 0 ? 'round_resolved' : 'round_advanced');
  return normalizeLobbySettings(data);
}

async function startGuessPhase(lobby: CarvingRevelationLobby, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      phase: 'guess',
      phase_deadline_at: getPhaseDeadline(lobby.phase_duration_seconds, nowMs),
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'guess_phase_started');
  return normalizeLobbySettings(data);
}

async function advanceExpiredCarvingPhase(lobby: CarvingRevelationLobby, players: CarvingRevelationPlayerRecord[], nowMs: number) {
  if (lobby.status !== 'active' || !lobby.phase_deadline_at || new Date(lobby.phase_deadline_at).getTime() > nowMs) {
    return lobby;
  }
  const now = new Date(nowMs).toISOString();
  if (lobby.phase === 'carve') {
    return startGuessPhase(lobby, nowMs);
  }

  return resolveGuessPhase(lobby, players);
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
  const hasReconnectableActivePlayers = nextLobby.status === 'active' && players.some((player) => (
    player.result === 'active' && !player.connected && canReconnect(player.disconnected_at, nowMs)
  ));
  if (lifecycle.shouldTerminate && !hasReconnectableActivePlayers) {
    const { data, error } = await getSupabaseServiceClient()
      .from('carving_revelation_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CarvingRevelationLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return normalizeLobbySettings(data);
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
    nextLobby = normalizeLobbySettings(data);
    await addLobbyEvent(lobby.id, 'host_transferred');
  }

  if (nextLobby.status === 'waiting') {
    return nextLobby;
  }

  const disconnectedActivePlayers = players.filter((player) => (
    player.result === 'active' &&
    !player.connected &&
    player.disconnected_at &&
    !canReconnect(player.disconnected_at, nowMs)
  ));
  if (disconnectedActivePlayers.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'eliminated', updated_at: now })
      .in('id', disconnectedActivePlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'player_disconnected');

    const nextLifecycle = resolveMultiplayerLifecycle(players, nextLobby.host_player_id);
    const hasPendingReconnect = players.some((player) => (
      player.result === 'active' && !player.connected && canReconnect(player.disconnected_at, nowMs)
    ));
    if (nextLifecycle.shouldTerminate && !hasPendingReconnect) {
      const { data, error: terminateError } = await getSupabaseServiceClient()
        .from('carving_revelation_lobbies')
        .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
        .eq('id', lobby.id)
        .select('*')
        .single<CarvingRevelationLobby>();
      if (terminateError) throw terminateError;
      await addLobbyEvent(lobby.id, 'lobby_terminated');
      return normalizeLobbySettings(data);
    }
  }

  nextLobby = await advanceExpiredCarvingPhase(nextLobby, players, nowMs);

  return nextLobby;
}

async function getLobbyView(lobby: CarvingRevelationLobby, clientId?: string | null): Promise<CarvingRevelationLobbyView> {
  const reconciledLobby = await reconcileCarvingRevelationLobby(lobby);
  const players = await fetchPlayers(reconciledLobby.id);
  const actions = await fetchActions(reconciledLobby.id);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const cosmeticsByUserId = await fetchProfileCosmetics(players.map((player) => player.auth_user_id));
  const nextRoundVotes = actions
    .filter((action) => action.action_type === 'next_round_vote' && action.player_id)
    .map((action) => action.player_id as string)
    .filter((playerId, index, playerIds) => playerIds.indexOf(playerId) === index);
  const publicActions = actions.map((action) => {
    if (action.action_type !== 'guess') {
      return action;
    }
    const roundHasEnded = reconciledLobby.status === 'finished' || action.round_number < reconciledLobby.round_number;
    if (!roundHasEnded) {
      return { ...action, payload: { submitted: true } };
    }
    if (action.payload.correct === true) {
      return { ...action, payload: { correct: true } };
    }
    return action;
  });

  const toPublicPlayer = (player: CarvingRevelationPlayerRecord): CarvingRevelationPublicPlayer => {
    const cosmetics = player.auth_user_id ? cosmeticsByUserId.get(player.auth_user_id) : null;
    return {
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
      avatar_url: cosmetics?.avatar_url ?? null,
      carve_color: cosmetics?.carve_color ?? getFallbackCarveColor(player.id),
    };
  };

  return {
    lobby: reconciledLobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer) : null,
    players: players.map(toPublicPlayer),
    actions: publicActions,
    skin: toPublicSkin(reconciledLobby),
    currentTurnPlayerId: null,
    lineLengthLimit: getLineLengthLimit(reconciledLobby),
    maxLineLength: MAX_LINE_LENGTH,
    nextRoundVotes,
    phaseEndsAt: reconciledLobby.phase_deadline_at,
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
    return getLobbyView(normalizeLobbySettings(updatedLobby), input.clientId);
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
    if (lobby.status === 'active') {
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

export async function getCarvingRevelationRejoinEligibility(code: string, clientId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'active') {
    return { eligible: false as const };
  }
  const reconciledLobby = await reconcileCarvingRevelationLobby(lobby);
  if (reconciledLobby.status !== 'active') {
    return { eligible: false as const };
  }
  const players = await fetchPlayers(reconciledLobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.result !== 'active' || player.connected || !canReconnect(player.disconnected_at)) {
    return { eligible: false as const };
  }
  return {
    eligible: true as const,
    lobbyCode: reconciledLobby.code,
    disconnectedAt: player.disconnected_at,
  };
}

export async function getCarvingRevelationLobby(code: string, clientId?: string | null) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  return getLobbyView(lobby, clientId);
}

export async function listPublicCarvingRevelationLobbies() {
  assertSupabaseConfigured();
  const { data: lobbies, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .select('*')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(30)
    .returns<CarvingRevelationLobby[]>();
  if (error) throw error;
  if (lobbies.length === 0) return [];

  const { data: publicPlayers, error: playersError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .select('id, lobby_id, display_name, connected, last_seen_at')
    .in('lobby_id', lobbies.map((lobby) => lobby.id))
    .returns<Array<Pick<CarvingRevelationPlayerRecord, 'id' | 'lobby_id' | 'display_name' | 'connected' | 'last_seen_at'>>>();
  if (playersError) throw playersError;

  const nowMs = Date.now();
  return lobbies.map((lobby): CarvingRevelationPublicLobby | null => {
    const players = publicPlayers.filter((player) => (
      player.lobby_id === lobby.id && player.connected && nowMs - new Date(player.last_seen_at).getTime() <= MULTIPLAYER_STALE_AFTER_MS
    ));
    if (players.length === 0 || players.length >= lobby.max_players) return null;
    const host = players.find((player) => player.id === lobby.host_player_id);
    if (!host) return null;
    return {
      code: lobby.code,
      playerCount: players.length,
      maxPlayers: lobby.max_players,
      hostName: host.display_name,
    };
  }).filter((entry): entry is CarvingRevelationPublicLobby => entry !== null);
}

export async function updateCarvingRevelationSettings(
  code: string,
  clientId: string,
  input: {
    isPublic: boolean;
    phaseDurationSeconds?: unknown;
    winCondition?: unknown;
    modifiers?: unknown;
    startingLineLengthPercent?: unknown;
    lineLengthIncrementPercent?: unknown;
  },
) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change lobby settings.');
  const phaseDurationSeconds = normalizePhaseDuration(input.phaseDurationSeconds ?? lobby.phase_duration_seconds);
  const winCondition = normalizeWinCondition(input.winCondition ?? lobby.win_condition);
  const modifiers = normalizeModifiers(input.modifiers ?? lobby.modifiers);
  const startingLineLengthPercent = normalizeStartingLineLength(input.startingLineLengthPercent ?? lobby.starting_line_length_percent);
  const lineLengthIncrementPercent = normalizeLineLengthIncrement(input.lineLengthIncrementPercent ?? lobby.line_length_increment_percent);

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      is_public: input.isPublic,
      phase_duration_seconds: phaseDurationSeconds,
      win_condition: winCondition,
      modifiers,
      starting_line_length_percent: startingLineLengthPercent,
      line_length_increment_percent: lineLengthIncrementPercent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'settings_updated');
  return getLobbyView(normalizeLobbySettings(updatedLobby), clientId);
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
      phase: 'carve',
      phase_deadline_at: getPhaseDeadline(lobby.phase_duration_seconds),
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
  return getLobbyView(normalizeLobbySettings(updatedLobby), clientId);
}

export async function startNextCarvingRevelationRound(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can start another round.');
  }
  const players = await fetchPlayers(fetchedLobby.id);
  assertMultiplayerHost(players, fetchedLobby.host_player_id, clientId, 'Only the host can start the next round.');
  const connectedPlayers = players.filter((player) => player.connected);
  if (connectedPlayers.length < 2) {
    throw new Error('At least two connected players are required.');
  }

  const eligibleSkins = getSkinCatalog().filter((skin) => skin.id !== fetchedLobby.secret_skin_id);
  const skin = shuffle(eligibleSkins.length > 0 ? eligibleSkins : getSkinCatalog())[0] as QuizItem | undefined;
  if (!skin) {
    throw new Error('No skins are available.');
  }

  const now = new Date().toISOString();
  const turnOrder = shuffle(connectedPlayers).map((player) => player.id);
  const { error: actionError } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .delete()
    .eq('lobby_id', fetchedLobby.id);
  if (actionError) throw actionError;

  const { error: connectedPlayerError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({ result: 'active', connected: true, last_seen_at: now, disconnected_at: null, updated_at: now })
    .in('id', connectedPlayers.map((player) => player.id));
  if (connectedPlayerError) throw connectedPlayerError;

  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'eliminated', updated_at: now })
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
  }

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      status: 'active',
      secret_skin_id: skin.id,
      turn_order: turnOrder,
      current_turn_index: 0,
      round_number: 1,
      phase: 'carve',
      phase_deadline_at: getPhaseDeadline(fetchedLobby.phase_duration_seconds),
      winner_player_id: null,
      started_at: now,
      finished_at: null,
      updated_at: now,
    })
    .eq('id', fetchedLobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;

  await addLobbyEvent(fetchedLobby.id, 'next_round_started');
  return getLobbyView(normalizeLobbySettings(updatedLobby), clientId);
}

export async function voteForNextCarvingRevelationRound(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can receive next-round votes.');
  }
  const players = await fetchPlayers(fetchedLobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || !player.connected) {
    throw new Error('Player not found.');
  }
  const actions = await fetchActions(fetchedLobby.id);
  const alreadyVoted = actions.some((action) => (
    action.action_type === 'next_round_vote' && action.player_id === player.id
  ));
  if (!alreadyVoted) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_actions')
      .insert({
        lobby_id: fetchedLobby.id,
        player_id: player.id,
        action_type: 'next_round_vote',
        turn_index: 0,
        round_number: fetchedLobby.round_number,
        payload: {},
      });
    if (error) throw error;
    await addLobbyEvent(fetchedLobby.id, 'next_round_vote');
  }
  return getLobbyView(fetchedLobby, clientId);
}

export async function giveUpCarvingRevelationMatch(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  await refreshActivePlayerPresence(fetchedLobby.id, clientId);
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || !player.connected) {
    throw new Error('Player not found.');
  }
  if (player.result === 'active') {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'eliminated', updated_at: new Date().toISOString() })
      .eq('id', player.id);
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'player_gave_up');
  }
  const nextPlayers = await fetchPlayers(lobby.id);
  if (getActivePlayerIds(nextPlayers).length === 0) {
    const finishedLobby = await finishCarvingRevelationMatch(lobby, nextPlayers);
    return getLobbyView(finishedLobby, clientId);
  }
  return getLobbyView(lobby, clientId);
}

export async function heartbeatCarvingRevelationPlayer(code: string, clientId: string, connected = true) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) throw new Error('Player not found.');
  if (connected && lobby.status === 'active' && !player.connected) {
    if (player.result !== 'active' || !canReconnect(player.disconnected_at)) {
      await reconcileCarvingRevelationLobby(lobby);
      throw new Error('This player cannot rejoin the active game.');
    }
  }

  const now = new Date().toISOString();
  const disconnectedAt = connected ? null : player.disconnected_at ?? now;
  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({
      connected,
      last_seen_at: now,
      disconnected_at: disconnectedAt,
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
    const resultUpdate = forfeit && lobby.status === 'active' && leavingPlayer.result === 'active'
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
    if (lobby.status === 'finished') {
      const remainingPlayers = players
        .filter((player) => player.id !== leavingPlayer.id)
        .map((player) => player.id === lobby.host_player_id ? { ...player, connected: false } : player)
        .filter((player) => player.connected);
      const lifecycle = resolveMultiplayerLifecycle(remainingPlayers, lobby.host_player_id);
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
        const { error: lobbyError } = await getSupabaseServiceClient()
          .from('carving_revelation_lobbies')
          .update({ host_player_id: lifecycle.hostPlayerId, updated_at: now })
          .eq('id', lobby.id);
        if (lobbyError) throw lobbyError;
        await addLobbyEvent(lobby.id, 'host_transferred');
      }
    }
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

export async function kickCarvingRevelationPlayer(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
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
    .from('carving_revelation_lobby_bans')
    .upsert({ lobby_id: lobby.id, client_id: target.client_id, banned_by_player_id: host.id }, { onConflict: 'lobby_id,client_id' });
  if (banError) throw banError;
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .delete()
    .eq('id', target.id);
  if (deleteError) throw deleteError;
  await addLobbyEvent(lobby.id, 'player_kicked');
  return getLobbyView(lobby, clientId);
}

export async function transferCarvingRevelationHost(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
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
    .from('carving_revelation_players')
    .update({ role: 'player', updated_at: now })
    .eq('id', host.id);
  if (demoteError) throw demoteError;
  const { error: promoteError } = await getSupabaseServiceClient()
    .from('carving_revelation_players')
    .update({ role: 'host', updated_at: now })
    .eq('id', target.id);
  if (promoteError) throw promoteError;
  const { data: updatedLobby, error: lobbyError } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({ host_player_id: target.id, updated_at: now })
    .eq('id', lobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (lobbyError) throw lobbyError;
  await addLobbyEvent(lobby.id, 'host_transferred');
  return getLobbyView(normalizeLobbySettings(updatedLobby), clientId);
}

function getPathLength(points: RevealPoint[]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function getPolygonArea(points: RevealPoint[]) {
  const doubledArea = points.reduce((total, point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    return total + point.x * nextPoint.y - nextPoint.x * point.y;
  }, 0);
  return Math.abs(doubledArea) / 2;
}

function normalizeRevealShape(input: DrawInput) {
  if (!Array.isArray(input.points)) {
    throw new Error('Invalid reveal shape.');
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const points = input.points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .slice(0, 160)
    .map((point) => ({ x: clamp(point.x), y: clamp(point.y) }))
    .filter((point, index, allPoints) => {
      const previous = allPoints[index - 1];
      return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.001;
    });

  if (points.length < 3) {
    throw new Error('Carve out an area and hit confirm.');
  }

  const length = getPathLength(points);
  if (length <= 0.01 || getPolygonArea(points) <= 0.0002) {
    throw new Error('Carve a larger area.');
  }
  return { points, length };
}

async function assertActivePhasePlayer(code: string, clientId: string, phase: CarvingRevelationPhase) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  await refreshActivePlayerPresence(fetchedLobby.id, clientId);
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'active' || lobby.phase !== phase) {
    throw new Error(phase === 'carve' ? 'Carving is not active.' : 'Guessing is not active.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.result !== 'active' || !player.connected) {
    throw new Error('Player not found.');
  }
  return { lobby, players, player };
}

export async function drawCarvingRevealStroke(code: string, clientId: string, input: DrawInput) {
  const { lobby, players, player } = await assertActivePhasePlayer(code, clientId, 'carve');
  const shape = normalizeRevealShape(input);
  const lineLengthLimit = getLineLengthLimit(lobby);
  if (shape.length > lineLengthLimit + 0.004) {
    throw new Error('Reveal shape is too long for this round.');
  }

  const { error: deletePreviousError } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .delete()
    .eq('lobby_id', lobby.id)
    .eq('player_id', player.id)
    .eq('action_type', 'draw')
    .eq('round_number', lobby.round_number);
  if (deletePreviousError) throw deletePreviousError;

  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'draw',
      turn_index: 0,
      round_number: lobby.round_number,
      payload: { points: shape.points, length: shape.length, lineLengthLimit },
    });
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'carve_submitted');
  const activePlayerIds = getActivePlayerIds(players);
  const nextActions = await fetchActions(lobby.id);
  const carvedPlayerIds = new Set(nextActions
    .filter((action) => action.action_type === 'draw' && action.round_number === lobby.round_number && action.player_id)
    .map((action) => action.player_id as string));
  if (activePlayerIds.length > 0 && activePlayerIds.every((playerId) => carvedPlayerIds.has(playerId))) {
    const nextLobby = await startGuessPhase(lobby);
    return getLobbyView(nextLobby, clientId);
  }
  return getLobbyView(lobby, clientId);
}

export async function guessCarvingRevelationSkin(code: string, clientId: string, guess: string) {
  const { lobby, players, player } = await assertActivePhasePlayer(code, clientId, 'guess');
  const trimmedGuess = guess.trim().slice(0, 120);
  if (!trimmedGuess) {
    throw new Error('Guess is required.');
  }
  const skin = getSkinById(lobby.secret_skin_id);
  if (!skin) {
    throw new Error('Secret skin is unavailable.');
  }
  const correct = answerMatches(trimmedGuess, skin.answer);
  const actions = await fetchActions(lobby.id);
  const alreadyGuessed = actions.some((action) => (
    action.action_type === 'guess' &&
    action.round_number === lobby.round_number &&
    action.player_id === player.id
  ));
  if (alreadyGuessed) {
    throw new Error('You already guessed this round.');
  }

  const { error: actionError } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'guess',
      turn_index: 0,
      round_number: lobby.round_number,
      payload: { guess: trimmedGuess, correct },
    });
  if (actionError) throw actionError;
  if (correct && lobby.win_condition === 'first_correct') {
    const nextLobby = await resolveGuessPhase(lobby, players);
    return getLobbyView(nextLobby, clientId);
  }

  const activePlayerIds = getActivePlayerIds(players);
  const nextActions = await fetchActions(lobby.id);
  const guessedPlayerIds = new Set(nextActions
    .filter((action) => action.action_type === 'guess' && action.round_number === lobby.round_number && action.player_id)
    .map((action) => action.player_id as string));
  if (activePlayerIds.every((playerId) => guessedPlayerIds.has(playerId))) {
    const nextLobby = await resolveGuessPhase(lobby, players);
    return getLobbyView(nextLobby, clientId);
  }
  await addLobbyEvent(lobby.id, 'guess_submitted');
  return getLobbyView(lobby, clientId);
}
