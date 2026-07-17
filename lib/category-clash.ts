import { DEFAULT_CHAT_BORDER, normalizeChatBorder, normalizeChatColor, type ChatBorder, type ChatColor } from '@/lib/chat-colors';
import { sanitizeChatMessage } from '@/lib/chat-filter';
import {
  getAvailableCategoryIds,
  getCategoryClashCategories,
  getCategoryClashCategory,
  getRandomAvailableCategoryId,
  matchCategoryClashAnswer,
  normalizeEnabledCategoryIds,
  type CategoryClashCategory,
} from '@/lib/category-clash-data';
import { canReconnect, MULTIPLAYER_STALE_AFTER_MS, resolveMultiplayerLifecycle, shouldUpdateMultiplayerPresence } from '@/lib/multiplayer-lifecycle';
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
  sanitizeMultiplayerLobbyDescription,
} from '@/lib/multiplayer-session';
import { shuffle } from '@/lib/quiz';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type { CategoryClashCategory } from '@/lib/category-clash-data';

export type CategoryClashLobbyStatus = 'waiting' | 'active' | 'finished' | 'terminated';
export type CategoryClashGameMode = 'simultaneous' | 'turns';
export type CategoryClashPhase = 'countdown' | 'answering' | 'review' | 'intermission';
export type CategoryClashPlayerResult = 'active' | 'eliminated' | 'won';
export type CategoryClashChatMessageType = 'system' | 'result' | 'player';
export type CategoryClashChatTone = 'neutral' | 'correct' | 'incorrect';

export type CategoryClashLobby = {
  id: string;
  code: string;
  status: CategoryClashLobbyStatus;
  host_player_id: string | null;
  max_players: number;
  is_public: boolean;
  lobby_description: string;
  game_mode: CategoryClashGameMode;
  round_seconds: number;
  intermission_seconds: number;
  timer_decrement_interval: number;
  max_strikes: number;
  enabled_category_ids: string[];
  used_answers: Record<string, string[]>;
  turn_order: string[];
  current_turn_index: number;
  turn_sequence: number;
  round_number: number;
  phase: CategoryClashPhase;
  phase_deadline_at: string | null;
  current_category_id: string | null;
  winner_player_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  terminated_at: string | null;
};

type CategoryClashPlayerRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: 'host' | 'player';
  result: CategoryClashPlayerResult;
  strikes: number;
  joined_at: string;
  updated_at: string;
  connected: boolean;
  last_seen_at: string;
  disconnected_at: string | null;
};

export type CategoryClashPublicPlayer = Omit<CategoryClashPlayerRecord, 'client_id'> & {
  is_requesting_player: boolean;
  avatar_url: string | null;
  chat_color: ChatColor;
};

export type CategoryClashSubmission = {
  id: number;
  lobby_id: string;
  player_id: string | null;
  round_number: number;
  turn_sequence: number;
  category_id: string;
  guess: string;
  answer_id: string | null;
  answer_label: string | null;
  correct: boolean | null;
  reason: string | null;
  created_at: string;
};

export type CategoryClashChatMessage = {
  id: number;
  lobby_id: string;
  player_id: string | null;
  message: string;
  message_type: CategoryClashChatMessageType;
  tone: CategoryClashChatTone;
  chat_color: ChatColor;
  chat_border: ChatBorder;
  created_at: string;
};

export type CategoryClashLobbyView = {
  lobby: CategoryClashLobby;
  requestingPlayer: CategoryClashPublicPlayer | null;
  players: CategoryClashPublicPlayer[];
  submissions: CategoryClashSubmission[];
  chatMessages: CategoryClashChatMessage[];
  categories: CategoryClashCategory[];
  currentCategory: CategoryClashCategory | null;
  availableCategoryCount: number;
  currentTurnPlayerId: string | null;
  phaseEndsAt: string | null;
  roundSeconds: number;
  nextMatchVotes: string[];
};

export type CategoryClashPublicLobby = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
  hostChatColor: ChatColor;
  mode: CategoryClashGameMode;
  description: string;
};

type CreateOrJoinInput = {
  clientId: string;
  authUserId?: string | null;
  requirePublic?: boolean;
};

type ProfileChatCosmetics = {
  avatar_url: string | null;
  chat_color: ChatColor;
  chat_border: ChatBorder;
};

type AnswerFailureReason = 'duplicate' | 'wrong_answer';

const MAX_PLAYERS = Math.min(8, MULTIPLAYER_MAX_LOBBY_PLAYERS);
const COUNTDOWN_SECONDS = 5;
const BASE_ROUND_SECONDS = 10;
const MIN_ROUND_SECONDS = 5;
const GAME_MODES = new Set<CategoryClashGameMode>(['simultaneous', 'turns']);
const ROUND_SECONDS_OPTIONS = new Set([5, 8, 10, 15, 20]);
const INTERMISSION_SECONDS_OPTIONS = new Set([0, 3, 5, 10]);
const TIMER_DECREMENT_INTERVAL_OPTIONS = new Set([0, 1, 2, 3]);
const MAX_STRIKES_OPTIONS = new Set([1, 2, 3, 4, 5]);
const GLOBAL_ITEM_ANSWERS_KEY = '__items__';
const FORFEIT_DISCONNECTED_AT = '1970-01-01T00:00:00.000Z';
const ANSWER_GRADING_GRACE_MS = 1000;

function getDeadline(seconds: number, nowMs = Date.now()) {
  return new Date(nowMs + seconds * 1000).toISOString();
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeGameMode(value: unknown): CategoryClashGameMode {
  return typeof value === 'string' && GAME_MODES.has(value as CategoryClashGameMode)
    ? value as CategoryClashGameMode
    : 'simultaneous';
}

function normalizePhase(value: unknown): CategoryClashPhase {
  return value === 'answering' || value === 'review' || value === 'intermission' || value === 'countdown'
    ? value
    : 'countdown';
}

function normalizeNumberOption(value: unknown, options: ReadonlySet<number>, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && options.has(value) ? value : fallback;
}

function normalizeUsedAnswers(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([categoryId, answerIds]) => [
    categoryId,
    sanitizeStringArray(answerIds),
  ]));
}

function normalizeLobby<TLobby extends CategoryClashLobby>(lobby: TLobby): TLobby {
  return {
    ...lobby,
    game_mode: normalizeGameMode(lobby.game_mode),
    round_seconds: normalizeNumberOption(lobby.round_seconds, ROUND_SECONDS_OPTIONS, BASE_ROUND_SECONDS),
    intermission_seconds: normalizeNumberOption(lobby.intermission_seconds, INTERMISSION_SECONDS_OPTIONS, 5),
    timer_decrement_interval: normalizeNumberOption(lobby.timer_decrement_interval, TIMER_DECREMENT_INTERVAL_OPTIONS, 2),
    max_strikes: normalizeNumberOption(lobby.max_strikes, MAX_STRIKES_OPTIONS, 3),
    enabled_category_ids: normalizeEnabledCategoryIds(lobby.enabled_category_ids),
    used_answers: normalizeUsedAnswers(lobby.used_answers),
    turn_order: sanitizeStringArray(lobby.turn_order),
    phase: normalizePhase(lobby.phase),
  };
}

function getRoundSeconds(lobby: CategoryClashLobby, roundNumber = lobby.round_number, turnSequence = lobby.turn_sequence) {
  const timerUnit = lobby.game_mode === 'turns' ? turnSequence : roundNumber;
  const decrement = lobby.timer_decrement_interval > 0
    ? Math.floor(Math.max(0, timerUnit - 1) / lobby.timer_decrement_interval)
    : 0;
  return Math.max(MIN_ROUND_SECONDS, lobby.round_seconds - decrement);
}

function isActivePlayer(player: CategoryClashPlayerRecord) {
  return player.result === 'active';
}

function getCurrentTurnPlayerId(lobby: CategoryClashLobby, players: CategoryClashPlayerRecord[]) {
  if (lobby.status !== 'active' || lobby.game_mode !== 'turns') return null;
  const turnOrder = sanitizeStringArray(lobby.turn_order);
  const activeIds = new Set(players.filter(isActivePlayer).map((player) => player.id));
  if (turnOrder.length === 0 || activeIds.size === 0) return null;

  for (let offset = 0; offset < turnOrder.length; offset += 1) {
    const index = (lobby.current_turn_index + offset) % turnOrder.length;
    const playerId = turnOrder[index];
    if (activeIds.has(playerId)) {
      return { playerId, index };
    }
  }

  return null;
}

function getNextTurn(lobby: CategoryClashLobby, players: CategoryClashPlayerRecord[]) {
  const turnOrder = sanitizeStringArray(lobby.turn_order);
  const activeIds = new Set(players.filter(isActivePlayer).map((player) => player.id));
  if (turnOrder.length === 0 || activeIds.size === 0) {
    return null;
  }

  for (let offset = 1; offset <= turnOrder.length * 2; offset += 1) {
    const rawIndex = lobby.current_turn_index + offset;
    const index = rawIndex % turnOrder.length;
    const playerId = turnOrder[index];
    if (activeIds.has(playerId)) {
      return {
        playerId,
        index,
        roundNumber: lobby.round_number + Math.floor(rawIndex / turnOrder.length),
      };
    }
  }

  return null;
}

async function fetchLobby(code: string) {
  assertSupabaseConfigured();
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .select('*')
    .eq('code', normalizeLobbyCode(code))
    .maybeSingle<CategoryClashLobby>();

  if (error) throw error;
  return data ? normalizeLobby(data) : null;
}

async function fetchPlayers(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })
    .returns<CategoryClashPlayerRecord[]>();

  if (error) throw error;
  return data;
}

async function fetchSubmissions(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('id', { ascending: true })
    .returns<CategoryClashSubmission[]>();

  if (error) throw error;
  return data;
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === '23505';
}

async function fetchChatMessages(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_chat_messages')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('id', { ascending: true })
    .limit(160)
    .returns<CategoryClashChatMessage[]>();

  if (error) throw error;
  return data.map((message) => ({
    ...message,
    chat_color: normalizeChatColor(message.chat_color),
    chat_border: normalizeChatBorder(message.chat_border),
  }));
}

async function fetchNextMatchVotes(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_next_match_votes')
    .select('player_id')
    .eq('lobby_id', lobbyId)
    .returns<Array<{ player_id: string }>>();
  if (error) throw error;
  return data.map((vote) => vote.player_id);
}

async function deleteNextMatchVotes(lobbyId: string, playerIds?: string[]) {
  let query = getSupabaseServiceClient()
    .from('category_clash_next_match_votes')
    .delete()
    .eq('lobby_id', lobbyId);
  if (playerIds) {
    if (playerIds.length === 0) return;
    query = query.in('player_id', playerIds);
  }
  const { error } = await query;
  if (error) throw error;
}

async function fetchBannedClientIds(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobby_bans')
    .select('client_id')
    .eq('lobby_id', lobbyId)
    .returns<Array<{ client_id: string }>>();
  if (error) throw error;
  return new Set(data.map((ban) => ban.client_id));
}

async function fetchProfileCosmetics(authUserIds: Array<string | null>) {
  const userIds = [...new Set(authUserIds.filter((userId): userId is string => Boolean(userId)))];
  if (userIds.length === 0) {
    return new Map<string, ProfileChatCosmetics>();
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id, avatar_url, chat_color, chat_border')
    .in('id', userIds)
    .returns<Array<{ id: string; avatar_url: string | null; chat_color: string | null; chat_border: string | null }>>();
  if (error) throw error;
  return new Map(data.map((profile) => [
    profile.id,
    {
      avatar_url: profile.avatar_url ?? null,
      chat_color: normalizeChatColor(profile.chat_color),
      chat_border: normalizeChatBorder(profile.chat_border),
    },
  ]));
}

async function addLobbyEvent(lobbyId: string, eventType: string, payload?: Record<string, unknown>) {
  await addMultiplayerLobbyEvent('category_clash_lobby_events', lobbyId, eventType, payload);
}

async function addSystemChatMessage(
  lobbyId: string,
  message: string,
  tone: CategoryClashChatTone = 'neutral',
  playerId: string | null = null,
) {
  const { error } = await getSupabaseServiceClient()
    .from('category_clash_chat_messages')
    .insert({
      lobby_id: lobbyId,
      player_id: playerId,
      message,
      message_type: tone === 'neutral' ? 'system' : 'result',
      tone,
      chat_color: 'amber',
      chat_border: DEFAULT_CHAT_BORDER,
    });
  if (error) throw error;
}

function getNextUsedAnswers(
  lobby: CategoryClashLobby,
  categoryId: string,
  answerIds: readonly string[],
  category?: CategoryClashCategory,
) {
  const existing = lobby.used_answers[categoryId] ?? [];
  const nextUsedAnswers = {
    ...lobby.used_answers,
    [categoryId]: [...new Set([...existing, ...answerIds])],
  };
  if (category?.group === 'Items') {
    nextUsedAnswers[GLOBAL_ITEM_ANSWERS_KEY] = [
      ...new Set([...(lobby.used_answers[GLOBAL_ITEM_ANSWERS_KEY] ?? []), ...answerIds]),
    ];
  }
  return nextUsedAnswers;
}

function getUnavailableAnswerSet(lobby: CategoryClashLobby, category: CategoryClashCategory) {
  return new Set([
    ...(lobby.used_answers[category.id] ?? []),
    ...(category.group === 'Items' ? lobby.used_answers[GLOBAL_ITEM_ANSWERS_KEY] ?? [] : []),
  ]);
}

async function addCategoryPromptChatMessage(
  lobby: CategoryClashLobby,
  category: CategoryClashCategory,
  turnPlayer?: CategoryClashPlayerRecord | null,
) {
  if (lobby.game_mode === 'turns') {
    await addSystemChatMessage(
      lobby.id,
      `__turn_start__|${lobby.turn_sequence}|${turnPlayer?.display_name ?? 'Player'}|${category.prompt}`,
    );
    return;
  }

  await addSystemChatMessage(
    lobby.id,
    `__round_start__|${lobby.round_number}|${category.prompt}`,
  );
}

async function addGameOverChatSeparator(lobbyId: string) {
  await addSystemChatMessage(lobbyId, '__game_over__');
}

function getAnswerFailureLabel(reason: string | null | undefined) {
  if (reason === 'duplicate') return 'duplicate';
  if (reason === 'no_answer') return 'no answer';
  return 'wrong answer';
}

function resolveCategoryClashGuess(
  guess: string,
  category: CategoryClashCategory,
  unavailableAnswerIds: ReadonlySet<string>,
) {
  const availableMatch = matchCategoryClashAnswer(guess, category, unavailableAnswerIds);
  if (availableMatch) {
    return {
      correct: true as const,
      answer: availableMatch,
      reason: 'correct',
    };
  }

  const anyMatch = matchCategoryClashAnswer(guess, category);
  return {
    correct: false as const,
    answer: null,
    reason: anyMatch && unavailableAnswerIds.has(anyMatch.id) ? 'duplicate' as AnswerFailureReason : 'wrong_answer' as AnswerFailureReason,
  };
}

async function finishCategoryClashMatch(
  lobby: CategoryClashLobby,
  players: CategoryClashPlayerRecord[],
  message = 'Match finished.',
) {
  if (lobby.status === 'finished' || lobby.status === 'terminated') {
    return lobby;
  }

  const activePlayers = players.filter(isActivePlayer);
  const winner = activePlayers.length === 1
    ? activePlayers[0]
    : players.find((player) => player.result === 'won') ?? null;
  const now = new Date().toISOString();

  if (winner) {
    const { error: winnerError } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ result: 'won', updated_at: now })
      .eq('id', winner.id);
    if (winnerError) throw winnerError;
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      status: 'finished',
      winner_player_id: winner?.id ?? null,
      phase_deadline_at: null,
      finished_at: now,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (error) throw error;
  if (!data) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }

  await addGameOverChatSeparator(lobby.id);
  await addSystemChatMessage(lobby.id, winner ? `${winner.display_name} wins. ${message}` : message, 'neutral', winner?.id ?? null);
  await addLobbyEvent(lobby.id, 'game_finished');
  return normalizeLobby(data);
}

async function startAnsweringPhase(lobby: CategoryClashLobby) {
  const categoryId = lobby.current_category_id
    && getAvailableCategoryIds([lobby.current_category_id], lobby.used_answers).length > 0
    ? lobby.current_category_id
    : getRandomAvailableCategoryId(lobby.enabled_category_ids, lobby.used_answers);

  if (!categoryId) {
    const players = await fetchPlayers(lobby.id);
    return finishCategoryClashMatch(lobby, players, 'No unused categories remain.');
  }
  const category = getCategoryClashCategory(categoryId);
  if (!category) {
    const players = await fetchPlayers(lobby.id);
    return finishCategoryClashMatch(lobby, players, 'Current category is unavailable.');
  }

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      phase: 'answering',
      current_category_id: categoryId,
      phase_deadline_at: getDeadline(getRoundSeconds(lobby)),
      updated_at: now,
    })
    .eq('id', lobby.id)
    .eq('status', 'active')
    .eq('phase', 'countdown')
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (error) throw error;
  if (!data) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }
  const nextLobby = normalizeLobby(data);
  const players = nextLobby.game_mode === 'turns' ? await fetchPlayers(nextLobby.id) : [];
  const currentTurn = nextLobby.game_mode === 'turns' ? getCurrentTurnPlayerId(nextLobby, players) : null;
  const turnPlayer = currentTurn ? players.find((player) => player.id === currentTurn.playerId) : null;
  await addCategoryPromptChatMessage(nextLobby, category, turnPlayer);
  await addLobbyEvent(lobby.id, 'answering_started');
  return nextLobby;
}

async function updateSubmissionResult(
  submissionId: number,
  correct: boolean,
  answerId: string | null,
  answerLabel: string | null,
  reason: string,
) {
  const { error } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .update({
      correct,
      answer_id: answerId,
      answer_label: answerLabel,
      reason,
    })
    .eq('id', submissionId);
  if (error) throw error;
}

async function replaceSubmission(
  submissionId: number,
  input: {
    roundNumber: number;
    turnSequence: number;
    categoryId: string;
    guess: string;
  },
) {
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .update({
      round_number: input.roundNumber,
      turn_sequence: input.turnSequence,
      category_id: input.categoryId,
      guess: input.guess,
      correct: null,
      answer_id: null,
      answer_label: null,
      reason: null,
    })
    .eq('id', submissionId)
    .select('*')
    .single<CategoryClashSubmission>();
  if (error) throw error;
  return data;
}

async function saveSimultaneousSubmission(
  lobby: CategoryClashLobby,
  player: CategoryClashPlayerRecord,
  categoryId: string,
  guess: string,
) {
  const submissionInput = {
    lobby_id: lobby.id,
    player_id: player.id,
    round_number: lobby.round_number,
    turn_sequence: lobby.turn_sequence,
    category_id: categoryId,
    guess,
  };

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .insert(submissionInput)
    .select('*')
    .single<CategoryClashSubmission>();

  if (!error) {
    return data;
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existingSubmissions, error: fetchError } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .select('*')
    .eq('lobby_id', lobby.id)
    .eq('player_id', player.id)
    .eq('turn_sequence', lobby.turn_sequence)
    .order('id', { ascending: false })
    .limit(1)
    .returns<CategoryClashSubmission[]>();
  if (fetchError) throw fetchError;

  const existingSubmission = existingSubmissions[0];
  if (!existingSubmission) {
    throw error;
  }

  return replaceSubmission(existingSubmission.id, {
    roundNumber: lobby.round_number,
    turnSequence: lobby.turn_sequence,
    categoryId,
    guess,
  });
}

async function ensureCategoryClashHostPlayer(lobby: CategoryClashLobby, players: CategoryClashPlayerRecord[]) {
  const currentHost = players.find((player) => player.id === lobby.host_player_id);
  if (currentHost?.connected) {
    return lobby;
  }

  const nextHost = players.find((player) => player.connected) ?? null;
  const now = new Date().toISOString();
  const { error: demoteError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({ role: 'player', updated_at: now })
    .eq('lobby_id', lobby.id)
    .eq('role', 'host');
  if (demoteError) throw demoteError;

  if (nextHost) {
    const { error: promoteError } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ role: 'host', updated_at: now })
      .eq('id', nextHost.id);
    if (promoteError) throw promoteError;
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({ host_player_id: nextHost?.id ?? null, updated_at: now })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, nextHost ? 'host_transferred' : 'host_cleared');
  return normalizeLobby(data);
}

async function applyStrikes(lobby: CategoryClashLobby, strikePlayerIds: string[]) {
  if (strikePlayerIds.length === 0) return new Set<string>();
  const uniqueIds = [...new Set(strikePlayerIds)];
  const now = new Date().toISOString();
  const players = await getSupabaseServiceClient()
    .from('category_clash_players')
    .select('id, strikes')
    .in('id', uniqueIds)
    .returns<Array<{ id: string; strikes: number }>>();
  if (players.error) throw players.error;

  const eliminatedPlayerIds = new Set<string>();
  await Promise.all((players.data ?? []).map(async (player) => {
    const nextStrikes = Math.min(lobby.max_strikes, player.strikes + 1);
    if (nextStrikes >= lobby.max_strikes) {
      eliminatedPlayerIds.add(player.id);
    }
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({
        strikes: nextStrikes,
        result: nextStrikes >= lobby.max_strikes ? 'eliminated' : 'active',
        updated_at: now,
      })
      .eq('id', player.id);
    if (error) throw error;
  }));
  return eliminatedPlayerIds;
}

async function resolveSimultaneousRound(lobby: CategoryClashLobby, players: CategoryClashPlayerRecord[]) {
  const category = getCategoryClashCategory(lobby.current_category_id);
  if (!category) {
    return finishCategoryClashMatch(lobby, players, 'Current category is unavailable.');
  }

  const now = new Date().toISOString();
  const { data: claimedData, error: claimError } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({ phase: 'review', phase_deadline_at: getDeadline(lobby.intermission_seconds), updated_at: now })
    .eq('id', lobby.id)
    .eq('phase', 'answering')
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (claimError) throw claimError;
  if (!claimedData) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }
  const claimedLobby = normalizeLobby(claimedData);
  const intermissionDeadline = getDeadline(claimedLobby.intermission_seconds);
  const activePlayers = players.filter(isActivePlayer);
  const submissions = (await fetchSubmissions(lobby.id)).filter((submission) => (
    submission.round_number === lobby.round_number &&
    submission.turn_sequence === lobby.turn_sequence &&
    submission.category_id === category.id
  ));
  const submissionByPlayerId = new Map<string, CategoryClashSubmission>();
  submissions.forEach((submission) => {
    if (submission.player_id) {
      submissionByPlayerId.set(submission.player_id, submission);
    }
  });
  const usedBeforeRound = getUnavailableAnswerSet(claimedLobby, category);
  const correctAnswerIds: string[] = [];
  const strikePlayerIds: string[] = [];

  for (const player of activePlayers) {
    const submission = submissionByPlayerId.get(player.id);
    if (!submission) {
      strikePlayerIds.push(player.id);
      await addSystemChatMessage(lobby.id, `${player.display_name} did not answer.`, 'incorrect', player.id);
      continue;
    }

    const result = resolveCategoryClashGuess(submission.guess, category, usedBeforeRound);
    if (result.correct) {
      correctAnswerIds.push(result.answer.id);
      await updateSubmissionResult(submission.id, true, result.answer.id, result.answer.label, 'correct');
      await addSystemChatMessage(lobby.id, `${player.display_name}: ${submission.guess} - correct (${result.answer.label})`, 'correct', player.id);
    } else {
      strikePlayerIds.push(player.id);
      await updateSubmissionResult(submission.id, false, null, null, result.reason);
      await addSystemChatMessage(lobby.id, `${player.display_name}: ${submission.guess} - incorrect (${getAnswerFailureLabel(result.reason)})`, 'incorrect', player.id);
    }
  }

  const eliminatedPlayerIds = await applyStrikes(claimedLobby, strikePlayerIds);
  const nextPlayers = await fetchPlayers(lobby.id);
  await Promise.all(nextPlayers
    .filter((player) => eliminatedPlayerIds.has(player.id))
    .map((player) => addSystemChatMessage(lobby.id, `${player.display_name} was eliminated.`, 'incorrect', player.id)));
  const activeRemaining = nextPlayers.filter(isActivePlayer);
  const usedAnswers = getNextUsedAnswers(claimedLobby, category.id, correctAnswerIds, category);

  if (activeRemaining.length <= 1) {
    const { data, error } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .update({ used_answers: usedAnswers, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CategoryClashLobby>();
    if (error) throw error;
    return finishCategoryClashMatch(normalizeLobby(data), nextPlayers);
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      used_answers: usedAnswers,
      phase: 'review',
      phase_deadline_at: intermissionDeadline,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'round_resolved');
  return normalizeLobby(data);
}

async function startNextSimultaneousRound(lobby: CategoryClashLobby) {
  const categoryId = getRandomAvailableCategoryId(lobby.enabled_category_ids, lobby.used_answers);
  const players = await fetchPlayers(lobby.id);
  if (!categoryId) {
    return finishCategoryClashMatch(lobby, players, 'No unused categories remain.');
  }
  const category = getCategoryClashCategory(categoryId);
  if (!category) {
    return finishCategoryClashMatch(lobby, players, 'Current category is unavailable.');
  }

  const now = new Date().toISOString();
  const nextRoundNumber = lobby.round_number + 1;
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      round_number: nextRoundNumber,
      current_category_id: categoryId,
      phase: 'answering',
      phase_deadline_at: getDeadline(getRoundSeconds(lobby, nextRoundNumber)),
      updated_at: now,
    })
    .eq('id', lobby.id)
    .eq('status', 'active')
    .eq('phase', 'review')
    .eq('round_number', lobby.round_number)
    .eq('turn_sequence', lobby.turn_sequence)
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (error) throw error;
  if (!data) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }
  await addCategoryPromptChatMessage(normalizeLobby(data), category);
  await addLobbyEvent(lobby.id, 'round_started');
  return normalizeLobby(data);
}

async function resolveTurn(lobby: CategoryClashLobby, player: CategoryClashPlayerRecord, submission: CategoryClashSubmission | null) {
  const category = getCategoryClashCategory(lobby.current_category_id);
  if (!category) {
    const players = await fetchPlayers(lobby.id);
    return finishCategoryClashMatch(lobby, players, 'Current category is unavailable.');
  }

  const now = new Date().toISOString();
  const { data: claimedData, error: claimError } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({ phase: 'intermission', phase_deadline_at: getDeadline(lobby.intermission_seconds), updated_at: now })
    .eq('id', lobby.id)
    .eq('status', 'active')
    .eq('phase', 'answering')
    .eq('turn_sequence', lobby.turn_sequence)
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (claimError) throw claimError;
  if (!claimedData) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }
  const claimedLobby = normalizeLobby(claimedData);
  const usedBeforeTurn = getUnavailableAnswerSet(claimedLobby, category);
  const guess = submission?.guess ?? null;
  const result = guess ? resolveCategoryClashGuess(guess, category, usedBeforeTurn) : null;
  const matchedAnswer = result?.correct ? result.answer : null;
  const correct = Boolean(matchedAnswer);

  if (submission) {
    await updateSubmissionResult(
      submission.id,
      correct,
      matchedAnswer?.id ?? null,
      matchedAnswer?.label ?? null,
      result?.reason ?? 'wrong_answer',
    );
    await addSystemChatMessage(
      lobby.id,
      correct
        ? `${player.display_name}: ${submission.guess} - correct (${matchedAnswer?.label})`
        : `${player.display_name}: ${submission.guess} - incorrect (${getAnswerFailureLabel(result?.reason)})`,
      correct ? 'correct' : 'incorrect',
      player.id,
    );
  } else {
    await addSystemChatMessage(lobby.id, `${player.display_name} did not answer.`, 'incorrect', player.id);
  }

  const eliminatedPlayerIds = !correct ? await applyStrikes(claimedLobby, [player.id]) : new Set<string>();
  const nextPlayers = await fetchPlayers(lobby.id);
  await Promise.all(nextPlayers
    .filter((candidate) => eliminatedPlayerIds.has(candidate.id))
    .map((candidate) => addSystemChatMessage(lobby.id, `${candidate.display_name} was eliminated.`, 'incorrect', candidate.id)));
  const activeRemaining = nextPlayers.filter(isActivePlayer);
  const usedAnswers = matchedAnswer ? getNextUsedAnswers(claimedLobby, category.id, [matchedAnswer.id], category) : claimedLobby.used_answers;
  if (activeRemaining.length <= 1) {
    const { data, error } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .update({ used_answers: usedAnswers, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CategoryClashLobby>();
    if (error) throw error;
    return finishCategoryClashMatch(normalizeLobby(data), nextPlayers);
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      used_answers: usedAnswers,
      phase: 'intermission',
      phase_deadline_at: claimedLobby.phase_deadline_at,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'turn_resolved');
  return normalizeLobby(data);
}

async function startNextTurn(lobby: CategoryClashLobby) {
  const players = await fetchPlayers(lobby.id);
  const nextTurn = getNextTurn(lobby, players);
  if (!nextTurn) {
    return finishCategoryClashMatch(lobby, players);
  }

  const categoryId = getRandomAvailableCategoryId(lobby.enabled_category_ids, lobby.used_answers);
  if (!categoryId) {
    return finishCategoryClashMatch(lobby, players, 'No unused categories remain.');
  }
  const category = getCategoryClashCategory(categoryId);
  if (!category) {
    return finishCategoryClashMatch(lobby, players, 'Current category is unavailable.');
  }

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      round_number: nextTurn.roundNumber,
      turn_sequence: lobby.turn_sequence + 1,
      current_turn_index: nextTurn.index,
      current_category_id: categoryId,
      phase: 'answering',
      phase_deadline_at: getDeadline(getRoundSeconds(lobby, nextTurn.roundNumber, lobby.turn_sequence + 1)),
      updated_at: now,
    })
    .eq('id', lobby.id)
    .eq('status', 'active')
    .eq('phase', 'intermission')
    .eq('turn_sequence', lobby.turn_sequence)
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (error) throw error;
  if (!data) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', lobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return normalizeLobby(latestData);
  }
  await addCategoryPromptChatMessage(normalizeLobby(data), category, players.find((player) => player.id === nextTurn.playerId));
  await addLobbyEvent(lobby.id, 'turn_started');
  return normalizeLobby(data);
}

async function advanceExpiredPhase(lobby: CategoryClashLobby, players: CategoryClashPlayerRecord[], nowMs: number) {
  if (lobby.status !== 'active' || !lobby.phase_deadline_at) {
    return lobby;
  }

  const deadlineMs = new Date(lobby.phase_deadline_at).getTime();
  if (deadlineMs > nowMs || (lobby.phase === 'answering' && deadlineMs + ANSWER_GRADING_GRACE_MS > nowMs)) {
    return lobby;
  }

  if (lobby.phase === 'countdown') {
    return startAnsweringPhase(lobby);
  }

  if (lobby.phase === 'review') {
    return startNextSimultaneousRound(lobby);
  }

  if (lobby.phase === 'intermission') {
    return startNextTurn(lobby);
  }

  if (lobby.game_mode === 'turns') {
    const currentTurn = getCurrentTurnPlayerId(lobby, players);
    const player = currentTurn ? players.find((candidate) => candidate.id === currentTurn.playerId) : null;
    if (!player) {
      return startNextTurn(lobby);
    }
    const submissions = await fetchSubmissions(lobby.id);
    const submission = [...submissions].reverse().find((candidate) => (
      candidate.player_id === player.id &&
      candidate.round_number === lobby.round_number &&
      candidate.turn_sequence === lobby.turn_sequence &&
      candidate.category_id === lobby.current_category_id
    )) ?? null;
    return resolveTurn(lobby, player, submission);
  }

  return resolveSimultaneousRound(lobby, players);
}

async function reconcileCategoryClashLobby(lobby: CategoryClashLobby, initialPlayers?: CategoryClashPlayerRecord[]) {
  if (lobby.status === 'finished' || lobby.status === 'terminated') {
    return lobby;
  }

  let nextLobby = lobby;
  let players = initialPlayers ?? await fetchPlayers(lobby.id);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const stalePlayers = getStaleConnectedMembers(players, nowMs);

  if (stalePlayers.length > 0) {
    const query = getSupabaseServiceClient().from('category_clash_players');
    const { error } = lobby.status === 'waiting'
      ? await query.delete().in('id', stalePlayers.map((player) => player.id))
      : await query.update({ connected: false, disconnected_at: now, updated_at: now }).in('id', stalePlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'stale_players_removed');
  }

  const hasReconnectableActivePlayers = nextLobby.status === 'active' && players.some((player) => (
    player.result === 'active' && !player.connected && canReconnect(player.disconnected_at, nowMs)
  ));
  const lifecycle = resolveMultiplayerLifecycle(players, nextLobby.host_player_id);

  if (lifecycle.shouldTerminate && !hasReconnectableActivePlayers) {
    const { data, error } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .update({ status: 'terminated', host_player_id: null, is_public: false, terminated_at: now, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CategoryClashLobby>();
    if (error) throw error;
    await addLobbyEvent(lobby.id, 'lobby_terminated');
    return normalizeLobby(data);
  }

  if (lifecycle.hostChanged && lifecycle.hostPlayerId) {
    const { error: demoteError } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ role: 'player', updated_at: now })
      .eq('lobby_id', lobby.id)
      .eq('role', 'host');
    if (demoteError) throw demoteError;

    const { error: promoteError } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ role: 'host', updated_at: now })
      .eq('id', lifecycle.hostPlayerId);
    if (promoteError) throw promoteError;

    const { data, error } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .update({ host_player_id: lifecycle.hostPlayerId, updated_at: now })
      .eq('id', lobby.id)
      .select('*')
      .single<CategoryClashLobby>();
    if (error) throw error;
    nextLobby = normalizeLobby(data);
    await addLobbyEvent(lobby.id, 'host_transferred');
  }

  if (nextLobby.status === 'waiting') {
    return nextLobby;
  }

  const expiredDisconnectedPlayers = players.filter((player) => (
    player.result === 'active' &&
    !player.connected &&
    player.disconnected_at &&
    !canReconnect(player.disconnected_at, nowMs)
  ));
  if (expiredDisconnectedPlayers.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ result: 'eliminated', strikes: nextLobby.max_strikes, updated_at: now })
      .in('id', expiredDisconnectedPlayers.map((player) => player.id));
    if (error) throw error;
    players = await fetchPlayers(lobby.id);
    await addLobbyEvent(lobby.id, 'player_disconnected');
  }

  const activeRemaining = players.filter(isActivePlayer);
  if (activeRemaining.length <= 1) {
    return finishCategoryClashMatch(nextLobby, players);
  }

  nextLobby = await advanceExpiredPhase(nextLobby, players, nowMs);
  return nextLobby;
}

async function getLobbyView(lobby: CategoryClashLobby, clientId?: string | null): Promise<CategoryClashLobbyView> {
  let reconciledLobby = await reconcileCategoryClashLobby(lobby);
  let players = await fetchPlayers(reconciledLobby.id);
  if (reconciledLobby.status === 'finished') {
    reconciledLobby = await ensureCategoryClashHostPlayer(reconciledLobby, players);
    players = await fetchPlayers(reconciledLobby.id);
  }
  const [submissions, chatMessages, rawNextMatchVotes] = await Promise.all([
    fetchSubmissions(reconciledLobby.id),
    fetchChatMessages(reconciledLobby.id),
    fetchNextMatchVotes(reconciledLobby.id),
  ]);
  const connectedPlayerIds = new Set(players.filter((player) => player.connected).map((player) => player.id));
  const nextMatchVotes = rawNextMatchVotes.filter((playerId) => connectedPlayerIds.has(playerId));
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const cosmeticsByUserId = await fetchProfileCosmetics(players.map((player) => player.auth_user_id));
  const currentTurn = getCurrentTurnPlayerId(reconciledLobby, players);
  const categories = getCategoryClashCategories();

  const toPublicPlayer = (player: CategoryClashPlayerRecord): CategoryClashPublicPlayer => {
    const cosmetics = player.auth_user_id ? cosmeticsByUserId.get(player.auth_user_id) : null;
    return {
      id: player.id,
      lobby_id: player.lobby_id,
      auth_user_id: player.auth_user_id,
      display_name: player.display_name,
      role: player.role,
      result: player.result,
      strikes: player.strikes,
      joined_at: player.joined_at,
      updated_at: player.updated_at,
      connected: player.connected,
      last_seen_at: player.last_seen_at,
      disconnected_at: player.disconnected_at,
      is_requesting_player: player.id === requestingPlayer?.id,
      avatar_url: cosmetics?.avatar_url ?? null,
      chat_color: cosmetics?.chat_color ?? 'amber',
    };
  };

  return {
    lobby: reconciledLobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer) : null,
    players: players.map(toPublicPlayer),
    submissions,
    chatMessages,
    categories,
    currentCategory: getCategoryClashCategory(reconciledLobby.current_category_id),
    availableCategoryCount: getAvailableCategoryIds(reconciledLobby.enabled_category_ids, reconciledLobby.used_answers).length,
    currentTurnPlayerId: currentTurn?.playerId ?? null,
    phaseEndsAt: reconciledLobby.phase_deadline_at,
    roundSeconds: getRoundSeconds(reconciledLobby),
    nextMatchVotes,
  };
}

async function insertPlayer(lobby: CategoryClashLobby, input: CreateOrJoinInput, role: 'host' | 'player') {
  const displayName = await resolveMultiplayerDisplayName(input);
  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .insert({
      lobby_id: lobby.id,
      client_id: input.clientId,
      auth_user_id: input.authUserId ?? null,
      display_name: displayName,
      role,
    })
    .select('*')
    .single<CategoryClashPlayerRecord>();
  if (error) throw error;
  return data;
}

export async function createCategoryClashLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  await forfeitOutstandingReconnects(input.clientId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: lobby, error } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .insert({ code: generateMultiplayerLobbyCode(), max_players: MAX_PLAYERS })
      .select('*')
      .single<CategoryClashLobby>();
    if (error) {
      if (error.code === '23505') continue;
      throw error;
    }

    const normalizedLobby = normalizeLobby(lobby);
    const host = await insertPlayer(normalizedLobby, input, 'host');
    const { data: updatedLobby, error: updateError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .update({ host_player_id: host.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select('*')
      .single<CategoryClashLobby>();
    if (updateError) throw updateError;
    await addLobbyEvent(lobby.id, 'lobby_created');
    return getLobbyView(normalizeLobby(updatedLobby), input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinCategoryClashLobby(code: string, input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  await forfeitOutstandingReconnects(input.clientId, { categoryClashLobbyId: fetchedLobby.id });
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
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
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
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

export async function getCategoryClashLobby(code: string, clientId?: string | null) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  return getLobbyView(lobby, clientId);
}

export async function listPublicCategoryClashLobbies() {
  assertSupabaseConfigured();
  const { data: lobbies, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .select('*')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(30)
    .returns<CategoryClashLobby[]>();
  if (error) throw error;
  if (lobbies.length === 0) return [];

  const { data: publicPlayers, error: playersError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .select('id, lobby_id, auth_user_id, display_name, connected, last_seen_at')
    .in('lobby_id', lobbies.map((lobby) => lobby.id))
    .returns<Array<Pick<CategoryClashPlayerRecord, 'id' | 'lobby_id' | 'auth_user_id' | 'display_name' | 'connected' | 'last_seen_at'>>>();
  if (playersError) throw playersError;

  const nowMs = Date.now();
  const cosmeticsByUserId = await fetchProfileCosmetics(publicPlayers.map((player) => player.auth_user_id));
  return lobbies.map((rawLobby): CategoryClashPublicLobby | null => {
    const lobby = normalizeLobby(rawLobby);
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
      hostChatColor: host.auth_user_id ? cosmeticsByUserId.get(host.auth_user_id)?.chat_color ?? 'amber' : 'amber',
      mode: lobby.game_mode,
      description: lobby.lobby_description,
    };
  }).filter((entry): entry is CategoryClashPublicLobby => entry !== null);
}

export async function updateCategoryClashSettings(
  code: string,
  clientId: string,
  input: {
    isPublic: boolean;
    gameMode?: unknown;
    enabledCategoryIds?: unknown;
    roundSeconds?: unknown;
    intermissionSeconds?: unknown;
    timerDecrementInterval?: unknown;
    maxStrikes?: unknown;
    lobbyDescription?: unknown;
  },
) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can change lobby settings.');
  const enabledCategoryIds = normalizeEnabledCategoryIds(input.enabledCategoryIds ?? lobby.enabled_category_ids, false);
  if (enabledCategoryIds.length === 0) {
    throw new Error('Select at least one category.');
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      is_public: input.isPublic,
      game_mode: normalizeGameMode(input.gameMode ?? lobby.game_mode),
      round_seconds: normalizeNumberOption(input.roundSeconds ?? lobby.round_seconds, ROUND_SECONDS_OPTIONS, BASE_ROUND_SECONDS),
      intermission_seconds: normalizeNumberOption(input.intermissionSeconds ?? lobby.intermission_seconds, INTERMISSION_SECONDS_OPTIONS, 5),
      timer_decrement_interval: normalizeNumberOption(input.timerDecrementInterval ?? lobby.timer_decrement_interval, TIMER_DECREMENT_INTERVAL_OPTIONS, 2),
      max_strikes: normalizeNumberOption(input.maxStrikes ?? lobby.max_strikes, MAX_STRIKES_OPTIONS, 3),
      enabled_category_ids: enabledCategoryIds,
      lobby_description: sanitizeMultiplayerLobbyDescription(input.lobbyDescription ?? lobby.lobby_description),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'settings_updated');
  return getLobbyView(normalizeLobby(data), clientId);
}

export async function startCategoryClashLobby(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby cannot be started.');
  }
  let players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can start the game.');
  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .delete()
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
    players = players.filter((player) => player.connected);
  }
  if (players.length < 2) {
    throw new Error('At least two connected players are required.');
  }
  const enabledCategoryIds = normalizeEnabledCategoryIds(lobby.enabled_category_ids);
  const categoryId = getRandomAvailableCategoryId(enabledCategoryIds, {});
  if (!categoryId) {
    throw new Error('Select at least one category with answers.');
  }

  const now = new Date().toISOString();
  const turnOrder = shuffle(players).map((player) => player.id);
  const { error: resetPlayersError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({ result: 'active', strikes: 0, updated_at: now })
    .eq('lobby_id', lobby.id);
  if (resetPlayersError) throw resetPlayersError;

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      status: 'active',
      game_mode: normalizeGameMode(lobby.game_mode),
      enabled_category_ids: enabledCategoryIds,
      used_answers: {},
      turn_order: turnOrder,
      current_turn_index: 0,
      turn_sequence: 1,
      round_number: 1,
      phase: 'countdown',
      phase_deadline_at: getDeadline(COUNTDOWN_SECONDS),
      current_category_id: null,
      winner_player_id: null,
      max_strikes: lobby.max_strikes,
      started_at: now,
      finished_at: null,
      terminated_at: null,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;

  const { error: submissionDeleteError } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .delete()
    .eq('lobby_id', lobby.id);
  if (submissionDeleteError) throw submissionDeleteError;

  const { error: chatDeleteError } = await getSupabaseServiceClient()
    .from('category_clash_chat_messages')
    .delete()
    .eq('lobby_id', lobby.id);
  if (chatDeleteError) throw chatDeleteError;

  await deleteNextMatchVotes(lobby.id);
  await addSystemChatMessage(lobby.id, 'Match starting. Get ready.');
  await addLobbyEvent(lobby.id, 'game_started');
  return getLobbyView(normalizeLobby(data), clientId);
}

async function startNextCategoryClashMatchForPlayers(
  fetchedLobby: CategoryClashLobby,
  players: CategoryClashPlayerRecord[],
  connectedPlayers: CategoryClashPlayerRecord[],
  clientId: string,
) {
  if (connectedPlayers.length < 2) {
    throw new Error('At least two connected players are required.');
  }

  const enabledCategoryIds = normalizeEnabledCategoryIds(fetchedLobby.enabled_category_ids);
  const categoryId = getRandomAvailableCategoryId(enabledCategoryIds, {});
  if (!categoryId) {
    throw new Error('Select at least one category with answers.');
  }

  const now = new Date().toISOString();
  const turnOrder = shuffle(connectedPlayers).map((player) => player.id);
  const { error: submissionDeleteError } = await getSupabaseServiceClient()
    .from('category_clash_submissions')
    .delete()
    .eq('lobby_id', fetchedLobby.id);
  if (submissionDeleteError) throw submissionDeleteError;

  const { error: chatDeleteError } = await getSupabaseServiceClient()
    .from('category_clash_chat_messages')
    .delete()
    .eq('lobby_id', fetchedLobby.id);
  if (chatDeleteError) throw chatDeleteError;

  await deleteNextMatchVotes(fetchedLobby.id);

  const { error: connectedPlayerError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({ result: 'active', strikes: 0, connected: true, last_seen_at: now, disconnected_at: null, updated_at: now })
    .in('id', connectedPlayers.map((player) => player.id));
  if (connectedPlayerError) throw connectedPlayerError;

  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ result: 'eliminated', strikes: fetchedLobby.max_strikes, updated_at: now })
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      status: 'active',
      enabled_category_ids: enabledCategoryIds,
      used_answers: {},
      turn_order: turnOrder,
      current_turn_index: 0,
      turn_sequence: 1,
      round_number: 1,
      phase: 'countdown',
      phase_deadline_at: getDeadline(COUNTDOWN_SECONDS),
      current_category_id: null,
      winner_player_id: null,
      max_strikes: fetchedLobby.max_strikes,
      started_at: now,
      finished_at: null,
      terminated_at: null,
      updated_at: now,
    })
    .eq('id', fetchedLobby.id)
    .eq('status', 'finished')
    .select('*')
    .maybeSingle<CategoryClashLobby>();
  if (error) throw error;
  if (!data) {
    const { data: latestData, error: latestError } = await getSupabaseServiceClient()
      .from('category_clash_lobbies')
      .select('*')
      .eq('id', fetchedLobby.id)
      .single<CategoryClashLobby>();
    if (latestError) throw latestError;
    return getLobbyView(normalizeLobby(latestData), clientId);
  }

  await addSystemChatMessage(fetchedLobby.id, 'New match starting. Get ready.');
  await addLobbyEvent(fetchedLobby.id, 'next_match_started');
  return getLobbyView(normalizeLobby(data), clientId);
}

export async function returnCategoryClashLobbyToWaiting(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can return to the lobby.');
  }

  let players = await fetchPlayers(fetchedLobby.id);
  const lobby = await ensureCategoryClashHostPlayer(fetchedLobby, players);
  players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can return everyone to the lobby.');

  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);
  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .delete()
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
  }

  const now = new Date().toISOString();
  const { error: playerError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({
      result: 'active',
      strikes: 0,
      connected: true,
      last_seen_at: now,
      disconnected_at: null,
      updated_at: now,
    })
    .eq('lobby_id', lobby.id)
    .eq('connected', true);
  if (playerError) throw playerError;

  await deleteNextMatchVotes(lobby.id);

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({
      status: 'waiting',
      is_public: false,
      used_answers: {},
      turn_order: [],
      current_turn_index: 0,
      turn_sequence: 1,
      round_number: 1,
      phase: 'countdown',
      phase_deadline_at: null,
      current_category_id: null,
      winner_player_id: null,
      started_at: null,
      finished_at: null,
      terminated_at: null,
      updated_at: now,
    })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;

  await addLobbyEvent(lobby.id, 'returned_to_lobby');
  return getLobbyView(normalizeLobby(data), clientId);
}

async function startNextMatchIfAllConnectedPlayersVoted(lobby: CategoryClashLobby, clientId: string) {
  if (lobby.status !== 'finished') {
    return null;
  }
  const players = await fetchPlayers(lobby.id);
  const connectedPlayers = players.filter((candidate) => candidate.connected);
  const connectedPlayerIds = new Set(connectedPlayers.map((candidate) => candidate.id));
  const votes = await fetchNextMatchVotes(lobby.id);
  const disconnectedVoteIds = votes.filter((playerId) => !connectedPlayerIds.has(playerId));
  await deleteNextMatchVotes(lobby.id, disconnectedVoteIds);
  const connectedVotes = votes.filter((playerId) => connectedPlayerIds.has(playerId));

  if (connectedPlayers.length >= 2 && connectedPlayers.every((candidate) => connectedVotes.includes(candidate.id))) {
    await addLobbyEvent(lobby.id, 'next_match_vote');
    return startNextCategoryClashMatchForPlayers(lobby, players, connectedPlayers, clientId);
  }

  return null;
}

export async function startNextCategoryClashMatch(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can start another match.');
  }
  let players = await fetchPlayers(fetchedLobby.id);
  const lobby = await ensureCategoryClashHostPlayer(fetchedLobby, players);
  players = await fetchPlayers(lobby.id);
  assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can start the next match.');
  const connectedPlayers = players.filter((player) => player.connected);
  return startNextCategoryClashMatchForPlayers(lobby, players, connectedPlayers, clientId);
}

export async function voteForNextCategoryClashMatch(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can receive next-match votes.');
  }
  const players = await fetchPlayers(fetchedLobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || !player.connected) {
    throw new Error('Player not found.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('category_clash_next_match_votes')
    .upsert({ lobby_id: fetchedLobby.id, player_id: player.id }, { onConflict: 'lobby_id,player_id' });
  if (error) throw error;

  const startedMatch = await startNextMatchIfAllConnectedPlayersVoted(fetchedLobby, clientId);
  if (startedMatch) return startedMatch;

  await addLobbyEvent(fetchedLobby.id, 'next_match_vote');
  return getLobbyView(fetchedLobby, clientId);
}

export async function submitCategoryClashAnswer(code: string, clientId: string, guess: string) {
  const cleanGuess = guess.trim().slice(0, 120);
  if (!cleanGuess) {
    throw new Error('Answer is required.');
  }
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  if (lobby.status !== 'active' || lobby.phase !== 'answering') {
    throw new Error('Answers are not open.');
  }
  const category = getCategoryClashCategory(lobby.current_category_id);
  if (!category) {
    throw new Error('Current category is unavailable.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || player.result !== 'active' || !player.connected) {
    throw new Error('Player not found.');
  }

  if (lobby.game_mode === 'turns') {
    const currentTurn = getCurrentTurnPlayerId(lobby, players);
    if (!currentTurn || currentTurn.playerId !== player.id) {
      throw new Error('It is not your turn.');
    }
    await saveSimultaneousSubmission(lobby, player, category.id, cleanGuess);
    await addLobbyEvent(lobby.id, 'answer_submitted');
    return { kind: 'answer_submitted' as const };
  }

  await saveSimultaneousSubmission(lobby, player, category.id, cleanGuess);
  await addLobbyEvent(lobby.id, 'answer_submitted');
  return { kind: 'answer_submitted' as const };
}

export async function postCategoryClashChatMessage(code: string, clientId: string, message: string) {
  const cleanMessage = message.trim().slice(0, 1000);
  if (!cleanMessage) {
    throw new Error('Message is required.');
  }
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'finished') {
    throw new Error('Chat opens when the match is over.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || !player.connected) {
    throw new Error('Player not found.');
  }

  const cosmeticsByUserId = await fetchProfileCosmetics([player.auth_user_id]);
  const cosmetics = player.auth_user_id ? cosmeticsByUserId.get(player.auth_user_id) : null;
  const { data: insertedMessage, error } = await getSupabaseServiceClient()
    .from('category_clash_chat_messages')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      message: sanitizeChatMessage(cleanMessage),
      message_type: 'player',
      tone: 'neutral',
      chat_color: cosmetics?.chat_color ?? 'amber',
      chat_border: cosmetics?.chat_border ?? DEFAULT_CHAT_BORDER,
    })
    .select('*')
    .single<CategoryClashChatMessage>();
  if (error) throw error;
  const chatMessage: CategoryClashChatMessage = {
    ...insertedMessage,
    chat_color: normalizeChatColor(insertedMessage.chat_color),
    chat_border: normalizeChatBorder(insertedMessage.chat_border),
  };
  await addLobbyEvent(lobby.id, 'chat_message_posted', { kind: 'chat_message', chatMessage });
  return { kind: 'chat_message' as const, chatMessage };
}

export async function heartbeatCategoryClashPlayer(code: string, clientId: string, connected = true) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) throw new Error('Player not found.');
  const connectionChanged = player.connected !== connected;
  if (connected && lobby.status === 'active' && !player.connected && !canReconnect(player.disconnected_at)) {
    await reconcileCategoryClashLobby(lobby);
    throw new Error('The reconnect window has expired.');
  }
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const disconnectedAt = connected ? null : player.disconnected_at ?? now;
  const presenceUpdated = shouldUpdateMultiplayerPresence(player.last_seen_at, player.connected, connected, nowMs);
  if (presenceUpdated) {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({
        connected,
        last_seen_at: now,
        disconnected_at: disconnectedAt,
        updated_at: now,
      })
      .eq('lobby_id', lobby.id)
      .eq('client_id', clientId);
    if (error) throw error;
  }
  if (connectionChanged) {
    await addLobbyEvent(lobby.id, connected ? 'player_reconnected' : 'player_disconnected');
  }
  const updatedPlayers = presenceUpdated
    ? players.map((candidate) => candidate.id === player.id
      ? { ...candidate, connected, last_seen_at: now, disconnected_at: disconnectedAt, updated_at: now }
      : candidate)
    : players;
  if (!connected && lobby.status === 'finished') {
    const updatedLobby = await ensureCategoryClashHostPlayer(lobby, updatedPlayers);
    const startedMatch = await startNextMatchIfAllConnectedPlayersVoted(updatedLobby, clientId);
    return { connected, status: startedMatch?.lobby.status ?? updatedLobby.status, presenceUpdated };
  }
  const reconciledLobby = await reconcileCategoryClashLobby(lobby, updatedPlayers);
  return { connected, status: reconciledLobby.status, presenceUpdated };
}

export async function leaveCategoryClashLobby(code: string, clientId: string, forfeit = false) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status === 'terminated') {
    return { left: true };
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player) {
    return { left: true };
  }
  const now = new Date().toISOString();

  if (lobby.status === 'waiting') {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .delete()
      .eq('id', player.id);
    if (error) throw error;
  } else if (lobby.status === 'finished') {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ connected: false, disconnected_at: player.disconnected_at ?? now, updated_at: now })
      .eq('id', player.id);
    if (error) throw error;
    const updatedLobby = await ensureCategoryClashHostPlayer(lobby, await fetchPlayers(lobby.id));
    await startNextMatchIfAllConnectedPlayersVoted(updatedLobby, clientId);
  } else if (forfeit) {
    if (lobby.status === 'active' && forfeit) {
      const { error } = await getSupabaseServiceClient()
        .from('category_clash_players')
        .update({
          connected: false,
          result: 'eliminated',
          strikes: lobby.max_strikes,
          disconnected_at: FORFEIT_DISCONNECTED_AT,
          updated_at: now,
        })
        .eq('id', player.id);
      if (error) throw error;
    }
  } else {
    const { error } = await getSupabaseServiceClient()
      .from('category_clash_players')
      .update({ connected: false, disconnected_at: now, updated_at: now })
      .eq('id', player.id);
    if (error) throw error;
  }

  await addLobbyEvent(lobby.id, 'player_left');
  await reconcileCategoryClashLobby(lobby);
  return { left: true };
}

export async function kickCategoryClashPlayer(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can kick players.');
  const target = players.find((candidate) => candidate.id === targetPlayerId);
  if (!target || target.id === host.id) {
    throw new Error('Invalid player target.');
  }

  const { error: banError } = await getSupabaseServiceClient()
    .from('category_clash_lobby_bans')
    .insert({ lobby_id: lobby.id, client_id: target.client_id });
  if (banError) throw banError;
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .delete()
    .eq('id', target.id);
  if (deleteError) throw deleteError;
  await addLobbyEvent(lobby.id, 'player_kicked');
  return getLobbyView(lobby, clientId);
}

export async function transferCategoryClashHost(code: string, clientId: string, targetPlayerId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const lobby = await reconcileCategoryClashLobby(fetchedLobby);
  if (lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = assertMultiplayerHost(players, lobby.host_player_id, clientId, 'Only the host can transfer host.');
  const target = players.find((candidate) => candidate.id === targetPlayerId);
  if (!target || target.id === host.id || !target.connected) {
    throw new Error('Invalid host target.');
  }
  const now = new Date().toISOString();

  const { error: demoteError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({ role: 'player', updated_at: now })
    .eq('id', host.id);
  if (demoteError) throw demoteError;
  const { error: promoteError } = await getSupabaseServiceClient()
    .from('category_clash_players')
    .update({ role: 'host', updated_at: now })
    .eq('id', target.id);
  if (promoteError) throw promoteError;

  const { data, error } = await getSupabaseServiceClient()
    .from('category_clash_lobbies')
    .update({ host_player_id: target.id, updated_at: now })
    .eq('id', lobby.id)
    .select('*')
    .single<CategoryClashLobby>();
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'host_transferred');
  return getLobbyView(normalizeLobby(data), clientId);
}

export async function getCategoryClashRejoinEligibility(code: string, clientId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'active') {
    return { eligible: false as const };
  }
  const reconciledLobby = await reconcileCategoryClashLobby(lobby);
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
