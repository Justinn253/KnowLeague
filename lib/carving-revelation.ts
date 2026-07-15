import { getSkinCatalog } from '@/lib/catalogs';
import {
  CHAT_COLOR_HEX,
  CHAT_COLOR_VALUES,
  normalizeChatColor,
} from '@/lib/chat-colors';
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
  sanitizeMultiplayerLobbyDescription,
} from '@/lib/multiplayer-session';
import { answerMatches, shuffle, type QuizItem } from '@/lib/quiz';
import { toSkinThemeQuizItem } from '@/lib/skin-themes';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import {
  canActivateCarvingRevelationPowerUp,
  CARVING_REVELATION_POWER_UP_DEFINITIONS,
  getCarvingRevelationPowerUpDefinition,
  MAX_CARVING_REVELATION_POWER_UP_COUNT,
  type CarvingRevelationPowerUpKind,
} from '@/lib/carving-revelation-power-ups';

export type {
  CarvingRevelationPowerUpActivationPhase,
  CarvingRevelationPowerUpKind,
} from '@/lib/carving-revelation-power-ups';

export type CarvingRevelationLobbyStatus = 'waiting' | 'active' | 'finished' | 'terminated';
export type CarvingRevelationPlayerResult = 'active' | 'eliminated' | 'won';
export type CarvingRevelationActionType = 'draw' | 'guess' | 'next_round_vote' | 'power_up';
export type CarvingRevelationPhase = 'carve' | 'guess';
export type CarvingRevelationWinCondition = 'everyone_correct' | 'first_correct';
export type CarvingRevelationModifier = 'greyscale' | 'blurred' | 'cropped';

export type CarvingRevelationPowerUp = {
  id: string;
  kind: CarvingRevelationPowerUpKind;
  x: number;
  y: number;
  radius: number;
};

export type CarvingRevelationPowerUpState = CarvingRevelationPowerUp & {
  claimedByPlayerId: string | null;
  conflicted: boolean;
};

export type CarvingRevelationPowerUpMessage = {
  id: string;
  roundNumber: number;
  type: 'claimed' | 'contested' | 'used';
  playerIds: string[];
  powerUpName?: string;
};

export type CarvingRevelationInsightSquare = {
  roundNumber: number;
  x: number;
  y: number;
  size: number;
};

export type CarvingRevelationLobby = {
  id: string;
  code: string;
  status: CarvingRevelationLobbyStatus;
  host_player_id: string | null;
  max_players: number;
  is_public: boolean;
  lobby_description: string;
  secret_skin_id: string | null;
  turn_order: string[];
  current_turn_index: number;
  round_number: number;
  phase: CarvingRevelationPhase;
  phase_deadline_at: string | null;
  phase_duration_seconds: number | null;
  win_condition: CarvingRevelationWinCondition;
  modifiers: CarvingRevelationModifier[];
  power_ups_enabled: boolean;
  power_up_count: number;
  power_ups: CarvingRevelationPowerUp[];
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
  powerUps: CarvingRevelationPowerUpState[];
  claimedPowerUps: CarvingRevelationPowerUpState[];
  powerUpMessages: CarvingRevelationPowerUpMessage[];
  revealedChampionName: string | null;
  insightSquares: CarvingRevelationInsightSquare[];
};

export type CarvingRevelationPublicLobby = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
  hostColor: string;
  description: string;
};

export type CarvingRevelationSkinImageSource = {
  imageUrl: string;
  status: CarvingRevelationLobbyStatus;
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
const MAX_ETHEREAL_LINE_LENGTH = 1;
const INSIGHT_SQUARE_SIZE = Math.sqrt(0.05) * 0.7;
const START_COUNTDOWN_MS = 5000;
const DEFAULT_PHASE_SECONDS = 30;
const PHASE_DURATION_OPTIONS = new Set<number | null>([10, 20, 30, 45, 60, null]);
const WIN_CONDITIONS = new Set<CarvingRevelationWinCondition>(['everyone_correct', 'first_correct']);
const MODIFIERS = new Set<CarvingRevelationModifier>(['greyscale', 'blurred', 'cropped']);
const STARTING_LINE_LENGTH_OPTIONS = new Set([5, 8, 10, 15, 20]);
const LINE_LENGTH_INCREMENT_OPTIONS = new Set([1, 2, 3, 4, 5]);
const DEFAULT_POWER_UP_COUNT = 3;
const POWER_UP_RADIUS = 0.035;
const ALL_PLAYERS_BLOCKED_GUESS_SECONDS = 5;

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

function normalizePowerUpCount(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return DEFAULT_POWER_UP_COUNT;
  }
  return Math.min(MAX_CARVING_REVELATION_POWER_UP_COUNT, Math.floor(numericValue));
}

function normalizePowerUps(value: unknown): CarvingRevelationPowerUp[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenKinds = new Set<CarvingRevelationPowerUpKind>();

  return value
    .map((entry, index): CarvingRevelationPowerUp | null => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Partial<CarvingRevelationPowerUp>;
      const definition = getCarvingRevelationPowerUpDefinition(candidate.kind);
      const radius = Number(candidate.radius);
      const x = Number(candidate.x);
      const y = Number(candidate.y);
      if (!definition || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return null;
      if (seenKinds.has(definition.kind)) return null;

      const baseId = typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `power-up-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (seenIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }

      const safeRadius = Math.max(0.02, Math.min(0.06, radius));
      seenIds.add(id);
      seenKinds.add(definition.kind);
      return {
        id,
        kind: definition.kind,
        x: Math.max(safeRadius, Math.min(1 - safeRadius, x)),
        y: Math.max(safeRadius, Math.min(1 - safeRadius, y)),
        radius: safeRadius,
      };
    })
    .filter((entry): entry is CarvingRevelationPowerUp => Boolean(entry));
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
    power_ups_enabled: lobby.power_ups_enabled !== false,
    power_up_count: normalizePowerUpCount(lobby.power_up_count),
    power_ups: normalizePowerUps(lobby.power_ups),
    starting_line_length_percent: normalizeStartingLineLength(lobby.starting_line_length_percent),
    line_length_increment_percent: normalizeLineLengthIncrement(lobby.line_length_increment_percent),
  };
}

function getLineLengthLimit(lobby: CarvingRevelationLobby) {
  const percent = lobby.starting_line_length_percent + Math.max(0, lobby.round_number - 1) * lobby.line_length_increment_percent;
  return Math.min(MAX_LINE_LENGTH, percent / 100);
}

function getAspectDistance(first: RevealPoint, second: RevealPoint) {
  return Math.hypot((first.x - second.x) * 16, (first.y - second.y) * 9);
}

function generatePowerUps(enabled: boolean, count: number): CarvingRevelationPowerUp[] {
  if (!enabled) return [];
  const definitions = shuffle(CARVING_REVELATION_POWER_UP_DEFINITIONS)
    .slice(0, Math.min(MAX_CARVING_REVELATION_POWER_UP_COUNT, Math.max(0, Math.floor(count))));
  const positions: Array<{ x: number; y: number }> = [];
  const radius = POWER_UP_RADIUS;
  const minDistance = radius * 2.75 * 16;
  let attempts = 0;
  while (positions.length < definitions.length && attempts < definitions.length * 80) {
    attempts += 1;
    const candidate = {
      x: radius + Math.random() * (1 - radius * 2),
      y: radius + Math.random() * (1 - radius * 2),
    };
    const hasRoom = positions.every((position) => (
      getAspectDistance(candidate, position) >= minDistance
    ));
    if (hasRoom) positions.push(candidate);
  }

  if (positions.length < definitions.length) {
    const columns = Math.ceil(Math.sqrt(definitions.length * 16 / 9));
    const rows = Math.ceil(definitions.length / columns);
    positions.splice(0, positions.length, ...definitions.map((_, index) => ({
      x: radius + (((index % columns) + 0.5) / columns) * (1 - radius * 2),
      y: radius + ((Math.floor(index / columns) + 0.5) / rows) * (1 - radius * 2),
    })));
  }

  return definitions.map((definition, index) => ({
    id: `power-up-${index + 1}`,
    kind: definition.kind,
    ...positions[index],
    radius,
  }));
}

function getPointSegmentDistance(point: RevealPoint, start: RevealPoint, end: RevealPoint) {
  const segmentX = (end.x - start.x) * 16;
  const segmentY = (end.y - start.y) * 9;
  const pointX = (point.x - start.x) * 16;
  const pointY = (point.y - start.y) * 9;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return Math.hypot(pointX, pointY);
  const scale = Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / segmentLengthSquared));
  return Math.hypot(pointX - segmentX * scale, pointY - segmentY * scale);
}

function isPointInPolygon(point: RevealPoint, polygon: RevealPoint[]) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(first: RevealPoint, second: RevealPoint, third: RevealPoint) {
  const value = (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(firstStart: RevealPoint, firstEnd: RevealPoint, secondStart: RevealPoint, secondEnd: RevealPoint) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  return firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation;
}

function polygonsIntersect(first: RevealPoint[], second: RevealPoint[]) {
  if (first.some((point) => isPointInPolygon(point, second)) || second.some((point) => isPointInPolygon(point, first))) {
    return true;
  }
  return first.some((point, index) => {
    const nextPoint = first[(index + 1) % first.length];
    return second.some((otherPoint, otherIndex) => (
      segmentsIntersect(point, nextPoint, otherPoint, second[(otherIndex + 1) % second.length])
    ));
  });
}

function carveOverlapsHiddenSmokeScreen(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  playerId: string,
  points: RevealPoint[],
) {
  const hiddenActionIds = getHiddenSmokeScreenDrawActionIds(lobby, actions, playerId);
  return actions.some((action) => (
    hiddenActionIds.has(action.id) &&
    getStoredDrawPoints(action) &&
    polygonsIntersect(points, getStoredDrawPoints(action) as RevealPoint[])
  ));
}

function shapeClaimsPowerUp(points: RevealPoint[], powerUp: CarvingRevelationPowerUp) {
  const center = { x: powerUp.x, y: powerUp.y };
  if (isPointInPolygon(center, points)) return true;
  const radius = powerUp.radius * 16;
  return points.some((point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    return getAspectDistance(point, center) <= radius || getPointSegmentDistance(center, point, nextPoint) <= radius;
  });
}

function getDrawClaimedPowerUpIds(action: CarvingRevelationAction) {
  const value = action.payload.claimedPowerUpIds;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getPowerUpStates(lobby: CarvingRevelationLobby, actions: CarvingRevelationAction[]) {
  if (!lobby.power_ups_enabled || lobby.power_ups.length === 0) return [];
  const claimersByPowerUpId = new Map<string, Set<string>>();
  actions
    .filter((action) => action.action_type === 'draw' && action.round_number === lobby.round_number && action.player_id)
    .forEach((action) => {
      getDrawClaimedPowerUpIds(action).forEach((powerUpId) => {
        const claimers = claimersByPowerUpId.get(powerUpId) ?? new Set<string>();
        claimers.add(action.player_id as string);
        claimersByPowerUpId.set(powerUpId, claimers);
      });
    });

  const claimedPowerUpIds = new Set<string>();
  actions
    .filter((action) => action.action_type === 'draw' && action.round_number < lobby.round_number)
    .forEach((action) => getDrawClaimedPowerUpIds(action).forEach((powerUpId) => claimedPowerUpIds.add(powerUpId)));

  return lobby.power_ups
    .filter((powerUp) => !claimedPowerUpIds.has(powerUp.id))
    .map((powerUp) => {
      const claimers = [...(claimersByPowerUpId.get(powerUp.id) ?? new Set<string>())];
      return {
        ...powerUp,
        claimedByPlayerId: claimers.length === 1 ? claimers[0] : null,
        conflicted: claimers.length > 1,
      };
    });
}

function getPowerUpClaimGroups(actions: CarvingRevelationAction[]) {
  const claimersByKey = new Map<string, { roundNumber: number; powerUpId: string; playerIds: Set<string> }>();
  actions
    .filter((action) => action.action_type === 'draw' && action.player_id)
    .forEach((action) => {
      getDrawClaimedPowerUpIds(action).forEach((powerUpId) => {
        const key = `${action.round_number}:${powerUpId}`;
        const group = claimersByKey.get(key) ?? {
          roundNumber: action.round_number,
          powerUpId,
          playerIds: new Set<string>(),
        };
        group.playerIds.add(action.player_id as string);
        claimersByKey.set(key, group);
      });
    });
  return [...claimersByKey.values()].sort((first, second) => (
    first.roundNumber - second.roundNumber || first.powerUpId.localeCompare(second.powerUpId)
  ));
}

function getUsedPowerUpIds(actions: CarvingRevelationAction[]) {
  return new Set(actions
    .filter((action) => action.action_type === 'power_up')
    .map((action) => action.payload.powerUpId)
    .filter((powerUpId): powerUpId is string => typeof powerUpId === 'string'));
}

function getUsablePowerUpsForPlayer(lobby: CarvingRevelationLobby, actions: CarvingRevelationAction[], playerId: string) {
  const usedPowerUpIds = getUsedPowerUpIds(actions);
  const powerUpsById = new Map(lobby.power_ups.map((powerUp) => [powerUp.id, powerUp]));
  const usablePowerUps: CarvingRevelationPowerUpState[] = [];
  getPowerUpClaimGroups(actions)
    .filter((group) => group.playerIds.size === 1 && group.playerIds.has(playerId) && !usedPowerUpIds.has(group.powerUpId))
    .forEach((group) => {
      const powerUp = powerUpsById.get(group.powerUpId);
      if (!powerUp) return;
      usablePowerUps.push({
        ...powerUp,
        claimedByPlayerId: playerId,
        conflicted: false,
      });
    });
  return usablePowerUps;
}

function getPowerUpMessages(actions: CarvingRevelationAction[]): CarvingRevelationPowerUpMessage[] {
  const claimedMessages = getPowerUpClaimGroups(actions).map((group): CarvingRevelationPowerUpMessage => {
    const playerIds = [...group.playerIds];
    return {
      id: `${group.roundNumber}:${group.powerUpId}`,
      roundNumber: group.roundNumber,
      type: playerIds.length > 1 ? 'contested' : 'claimed',
      playerIds,
    };
  });
  const usedMessages = actions
    .filter((action) => action.action_type === 'power_up' && action.payload.powerUpAnnounced === true)
    .map((action): CarvingRevelationPowerUpMessage | null => {
      const definition = getCarvingRevelationPowerUpDefinition(action.payload.kind);
      return definition ? {
        id: `used:${action.id}`,
        roundNumber: action.round_number,
        type: 'used' as const,
        playerIds: action.player_id ? [action.player_id] : [],
        powerUpName: definition.name,
      } : null;
    })
    .filter((message): message is CarvingRevelationPowerUpMessage => Boolean(message));
  return [...claimedMessages, ...usedMessages].sort((first, second) => first.roundNumber - second.roundNumber || first.id.localeCompare(second.id));
}

function getPowerUpActionKind(action: CarvingRevelationAction) {
  if (action.action_type !== 'power_up') return null;
  const definition = getCarvingRevelationPowerUpDefinition(action.payload.kind);
  return definition?.kind ?? null;
}

function getPowerUpActionTargetRound(action: CarvingRevelationAction) {
  const targetRoundNumber = Number(action.payload.targetRoundNumber);
  return Number.isFinite(targetRoundNumber) ? targetRoundNumber : action.round_number;
}

function getPowerUpActionTargetPhase(action: CarvingRevelationAction) {
  return action.payload.targetPhase === 'guess' || action.payload.targetPhase === 'carve'
    ? action.payload.targetPhase
    : null;
}

function hasPowerUpPhaseEnded(lobby: CarvingRevelationLobby, action: CarvingRevelationAction) {
  const targetRoundNumber = getPowerUpActionTargetRound(action);
  const targetPhase = getPowerUpActionTargetPhase(action);
  if (!targetPhase || lobby.round_number > targetRoundNumber) return lobby.round_number > targetRoundNumber;
  if (lobby.round_number < targetRoundNumber) return false;
  return targetPhase === 'carve' && lobby.phase === 'guess';
}

function getNextCarvePowerUpActions(
  actions: CarvingRevelationAction[],
  kind: CarvingRevelationPowerUpKind,
  drawRoundNumber: number,
) {
  return actions.filter((action) => (
    getPowerUpActionKind(action) === kind &&
    getPowerUpActionTargetPhase(action) === 'guess' &&
    getPowerUpActionTargetRound(action) + 1 === drawRoundNumber
  ));
}

function getActiveSmokeScreenActions(lobby: CarvingRevelationLobby, actions: CarvingRevelationAction[]) {
  return actions.filter((action) => (
    getPowerUpActionKind(action) === 'smoke_screen' &&
    lobby.round_number >= getPowerUpActionTargetRound(action) + 1 &&
    lobby.round_number <= getPowerUpActionTargetRound(action) + 2
  ));
}

function getSmokeSnapshotDrawActionIds(action: CarvingRevelationAction) {
  const value = action.payload.snapshotDrawActionIds;
  return new Set(
    Array.isArray(value)
      ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      : [],
  );
}

function getStoredRevealPoints(value: unknown) {
  if (!Array.isArray(value)) return null;
  const points = value
    .map((point) => (
      typeof point === 'object' && point !== null && 'x' in point && 'y' in point
        ? { x: Number(point.x), y: Number(point.y) }
        : null
    ))
    .filter((point): point is RevealPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)));
  return points.length >= 3 ? points : null;
}

function getStoredDrawPoints(action: CarvingRevelationAction) {
  if (action.action_type !== 'draw') return null;
  return getStoredRevealPoints(action.payload.points);
}

function getHiddenSmokeScreenDrawActionIds(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  viewerPlayerId: string | null,
) {
  const hiddenActionIds = new Set<number>();
  getActiveSmokeScreenActions(lobby, actions).forEach((smokeAction) => {
    if (smokeAction.player_id && smokeAction.player_id === viewerPlayerId) return;
    getSmokeSnapshotDrawActionIds(smokeAction).forEach((actionId) => hiddenActionIds.add(actionId));
  });
  return hiddenActionIds;
}

function getLineLengthLimitForPlayer(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  playerId: string | null,
) {
  const baseLimit = getLineLengthLimit(lobby);
  if (lobby.phase !== 'carve' || !playerId) return baseLimit;
  const hasEtherealLine = getNextCarvePowerUpActions(actions, 'ethereal_line', lobby.round_number)
    .some((action) => action.player_id === playerId);
  return hasEtherealLine ? Math.min(MAX_ETHEREAL_LINE_LENGTH, baseLimit * 2) : baseLimit;
}

function getInsightSquares(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  playerId: string | null,
): CarvingRevelationInsightSquare[] {
  if (lobby.phase !== 'guess' || !playerId) return [];
  return actions
    .filter((action) => (
      getPowerUpActionKind(action) === 'insight' &&
      action.player_id === playerId &&
      hasPowerUpPhaseEnded(lobby, action)
    ))
    .map((action) => {
      const insightSquares = action.payload.insightSquares;
      if (!insightSquares || typeof insightSquares !== 'object' || Array.isArray(insightSquares)) return null;
      const square = (insightSquares as Record<string, unknown>)[String(lobby.round_number)];
      if (!square || typeof square !== 'object' || Array.isArray(square)) return null;
      const candidate = square as Record<string, unknown>;
      const x = Number(candidate.x);
      const y = Number(candidate.y);
      const size = Number(candidate.size);
      if (![x, y, size].every(Number.isFinite)) return null;
      return { roundNumber: lobby.round_number, x, y, size };
    })
    .filter((square): square is CarvingRevelationInsightSquare => Boolean(square));
}

function getRevealedChampionName(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  playerId: string | null,
) {
  if (!playerId) return null;
  const hasNameReveal = actions.some((action) => (
    getPowerUpActionKind(action) === 'name_reveal' &&
    action.player_id === playerId &&
    hasPowerUpPhaseEnded(lobby, action)
  ));
  if (!hasNameReveal) return null;
  return getSkinById(lobby.secret_skin_id)?.champion ?? null;
}

async function markPowerUpApplications(lobby: CarvingRevelationLobby) {
  const actions = await fetchActions(lobby.id);
  const actionsToAnnounce = actions.filter((action) => (
    getPowerUpActionKind(action) &&
    getPowerUpActionTargetRound(action) === lobby.round_number &&
    getPowerUpActionTargetPhase(action) === lobby.phase &&
    action.payload.powerUpAnnounced !== true
  ));

  for (const action of actionsToAnnounce) {
    const kind = getPowerUpActionKind(action);
    const definition = kind ? getCarvingRevelationPowerUpDefinition(kind) : null;
    if (!definition) continue;
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_actions')
      .update({ payload: { ...action.payload, powerUpAnnounced: true } })
      .eq('id', action.id)
      .eq('lobby_id', lobby.id);
    if (error) throw error;
  }
}

function getSkipTurnBlockedPlayerIds(lobby: CarvingRevelationLobby, actions: CarvingRevelationAction[], players: CarvingRevelationPlayerRecord[]) {
  const activePlayerIds = new Set(getActivePlayerIds(players));
  const skippedPlayerIds = new Set<string>();
  const claimGroups = getPowerUpClaimGroups(actions);
  actions
    .filter((action) => (
      action.action_type === 'power_up' &&
      Number(action.payload.targetRoundNumber) === lobby.round_number &&
      action.payload.targetPhase === 'carve' &&
      lobby.phase === 'guess' &&
      action.player_id &&
      action.payload.kind === 'skip_turns'
    ))
    .forEach((action) => {
      const powerUpId = typeof action.payload.powerUpId === 'string' ? action.payload.powerUpId : null;
      const powerUp = lobby.power_ups.find((candidate) => candidate.id === powerUpId);
      const claim = claimGroups.find((group) => (
        group.powerUpId === powerUpId &&
        group.playerIds.size === 1 &&
        group.playerIds.has(action.player_id as string)
      ));
      if (!powerUp || powerUp.kind !== 'skip_turns' || !claim) return;
      activePlayerIds.forEach((playerId) => {
        if (playerId !== action.player_id) skippedPlayerIds.add(playerId);
      });
    });
  return skippedPlayerIds;
}

function getSkinById(skinId: string | null) {
  if (!skinId) return null;
  const skin = getSkinCatalog().find((candidate) => candidate.id === skinId);
  if (!skin) return null;

  return toSkinThemeQuizItem(skin) ?? skin;
}

function getSkinThemeCatalog() {
  return getSkinCatalog()
    .map(toSkinThemeQuizItem)
    .filter((skin): skin is QuizItem => Boolean(skin));
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

  await markPowerUpApplications(lobby);
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

function movePointsToRandomSpot(points: RevealPoint[]) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const minOffsetX = -minX;
  const maxOffsetX = 1 - maxX;
  const minOffsetY = -minY;
  const maxOffsetY = 1 - maxY;
  const offsetX = minOffsetX + Math.random() * Math.max(0, maxOffsetX - minOffsetX);
  const offsetY = minOffsetY + Math.random() * Math.max(0, maxOffsetY - minOffsetY);
  return points.map((point) => ({
    x: Math.max(0, Math.min(1, point.x + offsetX)),
    y: Math.max(0, Math.min(1, point.y + offsetY)),
  }));
}

function createInsightSquare() {
  return {
    x: Math.random() * (1 - INSIGHT_SQUARE_SIZE),
    y: Math.random() * (1 - INSIGHT_SQUARE_SIZE),
    size: INSIGHT_SQUARE_SIZE,
  };
}

async function ensureInsightSquareForRound(lobby: CarvingRevelationLobby) {
  const actions = await fetchActions(lobby.id);
  const insightActions = actions.filter((action) => (
    getPowerUpActionKind(action) === 'insight' &&
    getPowerUpActionTargetPhase(action) === 'carve' &&
    getPowerUpActionTargetRound(action) <= lobby.round_number
  ));
  const client = getSupabaseServiceClient();
  for (const action of insightActions) {
    const existingSquares = action.payload.insightSquares && typeof action.payload.insightSquares === 'object' && !Array.isArray(action.payload.insightSquares)
      ? action.payload.insightSquares as Record<string, unknown>
      : {};
    const roundKey = String(lobby.round_number);
    const existingSquare = existingSquares[roundKey];
    if (existingSquare && typeof existingSquare === 'object') continue;
    const { error } = await client
      .from('carving_revelation_actions')
      .update({
        payload: {
          ...action.payload,
          insightSquares: { ...existingSquares, [roundKey]: createInsightSquare() },
        },
      })
      .eq('id', action.id)
      .eq('lobby_id', lobby.id);
    if (error) throw error;
  }
}

async function applyShuffleToCarveActions(lobby: CarvingRevelationLobby) {
  const actions = await fetchActions(lobby.id);
  const shuffleAction = actions.find((action) => (
    getPowerUpActionKind(action) === 'shuffle' &&
    getPowerUpActionTargetPhase(action) === 'guess' &&
    getPowerUpActionTargetRound(action) + 1 === lobby.round_number &&
    action.payload.shuffleApplied !== true
  ));
  if (!shuffleAction) return;

  const drawActions = actions.filter((action) => action.action_type === 'draw' && action.round_number === lobby.round_number);
  const client = getSupabaseServiceClient();
  await Promise.all(drawActions.map(async (action) => {
    const points = getStoredDrawPoints(action);
    if (!points) return;
    const shuffledPoints = movePointsToRandomSpot(points);
    const { error } = await client
      .from('carving_revelation_actions')
      .update({ payload: { ...action.payload, points: shuffledPoints, shuffleSourcePoints: points, shuffled: true } })
      .eq('id', action.id)
      .eq('lobby_id', lobby.id);
    if (error) throw error;
  }));

  const { error } = await client
    .from('carving_revelation_actions')
    .update({ payload: { ...shuffleAction.payload, shuffleApplied: true, appliedRoundNumber: lobby.round_number } })
    .eq('id', shuffleAction.id)
    .eq('lobby_id', lobby.id);
  if (error) throw error;
}

async function startGuessPhase(lobby: CarvingRevelationLobby, nowMs = Date.now(), durationSeconds = lobby.phase_duration_seconds) {
  await applyShuffleToCarveActions(lobby);
  await ensureInsightSquareForRound(lobby);
  await markPowerUpApplications(lobby);
  const now = new Date(nowMs).toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      phase: 'guess',
      phase_deadline_at: getPhaseDeadline(durationSeconds, nowMs),
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

function getPublicDrawAction(
  lobby: CarvingRevelationLobby,
  actions: CarvingRevelationAction[],
  action: CarvingRevelationAction,
  viewerPlayerId: string | null,
) {
  const points = getStoredDrawPoints(action);
  if (!points) return action;

  const hiddenBySmokeScreen = getHiddenSmokeScreenDrawActionIds(lobby, actions, viewerPlayerId).has(action.id);
  const isPrivateDoubleLine = action.payload.lineNumber === 2 && action.player_id !== viewerPlayerId;
  if (hiddenBySmokeScreen || isPrivateDoubleLine) {
    return { ...action, payload: { hidden: true } };
  }

  const viewThiefAction = getNextCarvePowerUpActions(actions, 'view_thief', action.round_number)[0] ?? null;
  if (viewThiefAction && viewThiefAction.player_id !== viewerPlayerId) {
    return { ...action, payload: { hidden: true } };
  }

  const shuffleSourcePoints = action.payload.shuffled === true && Array.isArray(action.payload.shuffleSourcePoints)
    ? getStoredRevealPoints(action.payload.shuffleSourcePoints)
    : null;
  const shuffleAction = shuffleSourcePoints
    ? actions.find((candidate) => getPowerUpActionKind(candidate) === 'shuffle')
    : null;
  const isShuffleOwner = Boolean(shuffleSourcePoints && shuffleAction?.player_id === viewerPlayerId);
  const visiblePoints = isShuffleOwner && shuffleSourcePoints ? shuffleSourcePoints : points;

  const isEtherealLine = action.player_id && getNextCarvePowerUpActions(actions, 'ethereal_line', action.round_number)
    .some((powerUpAction) => powerUpAction.player_id === action.player_id);
  if (isEtherealLine && action.player_id !== viewerPlayerId) {
    return { ...action, payload: { outlinePoints: visiblePoints } };
  }

  if (isShuffleOwner && shuffleSourcePoints) {
    const { shuffleSourcePoints: _shuffleSourcePoints, shuffled: _shuffled, ...payload } = action.payload;
    return { ...action, payload: { ...payload, points: visiblePoints } };
  }

  return action;
}

async function getLobbyView(lobby: CarvingRevelationLobby, clientId?: string | null): Promise<CarvingRevelationLobbyView> {
  const reconciledLobby = await reconcileCarvingRevelationLobby(lobby);
  const [players, actions] = await Promise.all([
    fetchPlayers(reconciledLobby.id),
    fetchActions(reconciledLobby.id),
  ]);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const cosmeticsByUserId = await fetchProfileCosmetics(players.map((player) => player.auth_user_id));
  const nextRoundVotes = actions
    .filter((action) => action.action_type === 'next_round_vote' && action.player_id)
    .map((action) => action.player_id as string)
    .filter((playerId, index, playerIds) => playerIds.indexOf(playerId) === index);
  const claimedPowerUps = requestingPlayer
    ? getUsablePowerUpsForPlayer(reconciledLobby, actions, requestingPlayer.id)
    : [];
  const publicActions = actions.map((action) => {
    if (action.action_type === 'draw') {
      return getPublicDrawAction(reconciledLobby, actions, action, requestingPlayer?.id ?? null);
    }
    if (action.action_type === 'power_up') {
      const targetRoundNumber = Number(action.payload.targetRoundNumber);
      const visibleToEveryone = reconciledLobby.phase === 'guess' && targetRoundNumber === reconciledLobby.round_number;
      const visibleToRequester = requestingPlayer && action.player_id === requestingPlayer.id;
      if (visibleToEveryone || visibleToRequester) {
        return action;
      }
      return { ...action, payload: { pending: true } };
    }
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
    lineLengthLimit: getLineLengthLimitForPlayer(reconciledLobby, actions, requestingPlayer?.id ?? null),
    maxLineLength: requestingPlayer && getLineLengthLimitForPlayer(reconciledLobby, actions, requestingPlayer.id) > MAX_LINE_LENGTH
      ? MAX_ETHEREAL_LINE_LENGTH
      : MAX_LINE_LENGTH,
    nextRoundVotes,
    phaseEndsAt: reconciledLobby.phase_deadline_at,
    powerUps: getPowerUpStates(reconciledLobby, actions),
    claimedPowerUps,
    powerUpMessages: getPowerUpMessages(actions),
    revealedChampionName: getRevealedChampionName(reconciledLobby, actions, requestingPlayer?.id ?? null),
    insightSquares: getInsightSquares(reconciledLobby, actions, requestingPlayer?.id ?? null),
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

export async function getCarvingRevelationSkinImageSource(code: string, clientId: string): Promise<CarvingRevelationSkinImageSource> {
  const lobby = await fetchLobby(code);
  if (!lobby || (lobby.status !== 'active' && lobby.status !== 'finished')) {
    throw new Error('Skin image is unavailable.');
  }
  const players = await fetchPlayers(lobby.id);
  const player = players.find((candidate) => candidate.client_id === clientId);
  if (!player || !player.connected) {
    throw new Error('Player not found.');
  }
  const skin = getSkinById(lobby.secret_skin_id);
  if (!skin) {
    throw new Error('Skin image is unavailable.');
  }
  return { imageUrl: skin.imageUrl, status: lobby.status };
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
    .select('id, lobby_id, auth_user_id, display_name, connected, last_seen_at')
    .in('lobby_id', lobbies.map((lobby) => lobby.id))
    .returns<Array<Pick<CarvingRevelationPlayerRecord, 'id' | 'lobby_id' | 'auth_user_id' | 'display_name' | 'connected' | 'last_seen_at'>>>();
  if (playersError) throw playersError;

  const nowMs = Date.now();
  const profileCosmeticsByUserId = await fetchProfileCosmetics(publicPlayers.map((player) => player.auth_user_id));
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
      hostColor: host.auth_user_id ? profileCosmeticsByUserId.get(host.auth_user_id)?.carve_color ?? getFallbackCarveColor(host.id) : getFallbackCarveColor(host.id),
      description: lobby.lobby_description,
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
    powerUpsEnabled?: unknown;
    powerUpCount?: unknown;
    startingLineLengthPercent?: unknown;
    lineLengthIncrementPercent?: unknown;
    lobbyDescription?: unknown;
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
  const powerUpsEnabled = typeof input.powerUpsEnabled === 'boolean' ? input.powerUpsEnabled : lobby.power_ups_enabled !== false;
  const powerUpCount = normalizePowerUpCount(input.powerUpCount ?? lobby.power_up_count);
  const startingLineLengthPercent = normalizeStartingLineLength(input.startingLineLengthPercent ?? lobby.starting_line_length_percent);
  const lineLengthIncrementPercent = normalizeLineLengthIncrement(input.lineLengthIncrementPercent ?? lobby.line_length_increment_percent);

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      is_public: input.isPublic,
      phase_duration_seconds: phaseDurationSeconds,
      win_condition: winCondition,
      modifiers,
      power_ups_enabled: powerUpsEnabled,
      power_up_count: powerUpCount,
      starting_line_length_percent: startingLineLengthPercent,
      line_length_increment_percent: lineLengthIncrementPercent,
      lobby_description: sanitizeMultiplayerLobbyDescription(input.lobbyDescription ?? lobby.lobby_description),
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

  const skin = shuffle(getSkinThemeCatalog())[0] as QuizItem | undefined;
  if (!skin) {
    throw new Error('No skins are available.');
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const startsAt = new Date(nowMs + START_COUNTDOWN_MS).toISOString();
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
      phase_deadline_at: getPhaseDeadline(lobby.phase_duration_seconds, nowMs + START_COUNTDOWN_MS),
      power_ups: generatePowerUps(lobby.power_ups_enabled !== false, lobby.power_up_count),
      winner_player_id: null,
      started_at: startsAt,
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

  const skinCatalog = getSkinThemeCatalog();
  const eligibleSkins = skinCatalog.filter((skin) => skin.id !== fetchedLobby.secret_skin_id);
  const skin = shuffle(eligibleSkins.length > 0 ? eligibleSkins : skinCatalog)[0] as QuizItem | undefined;
  if (!skin) {
    throw new Error('No skins are available.');
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const startsAt = new Date(nowMs + START_COUNTDOWN_MS).toISOString();
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
      phase_deadline_at: getPhaseDeadline(fetchedLobby.phase_duration_seconds, nowMs + START_COUNTDOWN_MS),
      power_ups: generatePowerUps(fetchedLobby.power_ups_enabled !== false, fetchedLobby.power_up_count),
      winner_player_id: null,
      started_at: startsAt,
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

export async function returnCarvingRevelationToLobby(code: string, clientId: string) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'finished') {
    throw new Error('Only finished games can return to the lobby.');
  }

  const players = await fetchPlayers(fetchedLobby.id);
  assertMultiplayerHost(players, fetchedLobby.host_player_id, clientId, 'Only the host can return everyone to the lobby.');

  const now = new Date().toISOString();
  const connectedPlayers = players.filter((player) => player.connected);
  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);

  if (disconnectedPlayerIds.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .delete()
      .in('id', disconnectedPlayerIds);
    if (error) throw error;
  }

  if (connectedPlayers.length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from('carving_revelation_players')
      .update({ result: 'active', connected: true, disconnected_at: null, last_seen_at: now, updated_at: now })
      .in('id', connectedPlayers.map((player) => player.id));
    if (error) throw error;
  }

  const { error: actionError } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .delete()
    .eq('lobby_id', fetchedLobby.id);
  if (actionError) throw actionError;

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('carving_revelation_lobbies')
    .update({
      status: 'waiting',
      secret_skin_id: null,
      turn_order: [],
      current_turn_index: 0,
      round_number: 1,
      phase: 'carve',
      phase_deadline_at: null,
      winner_player_id: null,
      started_at: null,
      finished_at: null,
      updated_at: now,
    })
    .eq('id', fetchedLobby.id)
    .select('*')
    .single<CarvingRevelationLobby>();
  if (error) throw error;

  await addLobbyEvent(fetchedLobby.id, 'returned_to_lobby');
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
  if (player.connected !== connected) {
    await addLobbyEvent(lobby.id, connected ? 'player_reconnected' : 'player_disconnected');
  }
  const reconciledLobby = await reconcileCarvingRevelationLobby(lobby);
  return getLobbyView(reconciledLobby, clientId);
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

async function assertActivePhasePlayer(code: string, clientId: string, phase?: CarvingRevelationPhase) {
  const fetchedLobby = await fetchLobby(code);
  if (!fetchedLobby || fetchedLobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  await refreshActivePlayerPresence(fetchedLobby.id, clientId);
  const lobby = await reconcileCarvingRevelationLobby(fetchedLobby);
  if (lobby.status !== 'active') {
    throw new Error('Game is not active.');
  }
  if (phase && lobby.phase !== phase) {
    throw new Error(phase === 'carve' ? 'Carving is not active.' : 'Guessing is not active.');
  }
  if (lobby.started_at && new Date(lobby.started_at).getTime() > Date.now()) {
    throw new Error('Round is starting.');
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
  const existingActions = await fetchActions(lobby.id);
  const shape = normalizeRevealShape(input);
  const lineLengthLimit = getLineLengthLimitForPlayer(lobby, existingActions, player.id);
  if (shape.length > lineLengthLimit + 0.004) {
    throw new Error('Reveal shape is too long for this round.');
  }
  if (carveOverlapsHiddenSmokeScreen(lobby, existingActions, player.id, shape.points)) {
    throw new Error('Smoke Screen is hiding this area until the effect expires.');
  }

  const existingDraws = existingActions.filter((action) => (
    action.action_type === 'draw' &&
    action.round_number === lobby.round_number &&
    action.player_id === player.id
  ));
  const hasDoubleLine = getNextCarvePowerUpActions(existingActions, 'double_line', lobby.round_number)
    .some((action) => action.player_id === player.id);
  if (hasDoubleLine && existingDraws.length >= 2) {
    throw new Error('You have already submitted both carve lines this round.');
  }
  const activePowerUps = getPowerUpStates(lobby, existingActions);
  const claimedPowerUpIds = activePowerUps
    .filter((powerUp) => shapeClaimsPowerUp(shape.points, powerUp))
    .map((powerUp) => powerUp.id);

  if (!hasDoubleLine) {
    const { error: deletePreviousError } = await getSupabaseServiceClient()
      .from('carving_revelation_actions')
      .delete()
      .eq('lobby_id', lobby.id)
      .eq('player_id', player.id)
      .eq('action_type', 'draw')
      .eq('round_number', lobby.round_number);
    if (deletePreviousError) throw deletePreviousError;
  }

  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'draw',
      turn_index: 0,
      round_number: lobby.round_number,
      payload: {
        points: shape.points,
        length: shape.length,
        lineLengthLimit,
        claimedPowerUpIds,
        lineNumber: hasDoubleLine ? existingDraws.length + 1 : 1,
      },
    });
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'carve_submitted');
  const activePlayerIds = getActivePlayerIds(players);
  const nextActions = await fetchActions(lobby.id);
  const allPlayersFinishedCarving = activePlayerIds.every((playerId) => {
    const drawCount = nextActions.filter((action) => (
      action.action_type === 'draw' &&
      action.round_number === lobby.round_number &&
      action.player_id === playerId
    )).length;
    const requiresDoubleLine = getNextCarvePowerUpActions(nextActions, 'double_line', lobby.round_number)
      .some((action) => action.player_id === playerId);
    return drawCount >= (requiresDoubleLine ? 2 : 1);
  });
  if (activePlayerIds.length > 0 && allPlayersFinishedCarving) {
    const skippedPlayerIds = getSkipTurnBlockedPlayerIds(lobby, nextActions, players);
    const allRemainingGuessersBlocked = activePlayerIds.every((playerId) => (
      skippedPlayerIds.has(playerId)
    ));
    const nextLobby = await startGuessPhase(
      lobby,
      Date.now(),
      allRemainingGuessersBlocked ? ALL_PLAYERS_BLOCKED_GUESS_SECONDS : lobby.phase_duration_seconds,
    );
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
  const skipTurnBlockedPlayerIds = getSkipTurnBlockedPlayerIds(lobby, actions, players);
  if (skipTurnBlockedPlayerIds.has(player.id)) {
    throw new Error('Your guessing turn was skipped by a power up.');
  }
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

  const activePlayerIds = getActivePlayerIds(players).filter((playerId) => (
    !skipTurnBlockedPlayerIds.has(playerId)
  ));
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

export async function activateCarvingRevelationPowerUp(code: string, clientId: string, powerUpId: string) {
  const { lobby, player } = await assertActivePhasePlayer(code, clientId);
  const actions = await fetchActions(lobby.id);
  const powerUp = getUsablePowerUpsForPlayer(lobby, actions, player.id).find((candidate) => candidate.id === powerUpId);
  if (!powerUp) {
    throw new Error('Power up is not available.');
  }
  if (!canActivateCarvingRevelationPowerUp(powerUp.kind, lobby.phase)) {
    throw new Error('Power up cannot be used during this phase.');
  }

  const definition = getCarvingRevelationPowerUpDefinition(powerUp.kind);
  if (!definition) {
    throw new Error('Power up is not supported.');
  }

  const targetRoundNumber = lobby.round_number;
  const targetPhase = lobby.phase;
  const snapshotDrawActionIds = powerUp.kind === 'smoke_screen'
    ? actions
      .filter((action) => action.action_type === 'draw' && action.round_number <= lobby.round_number)
      .map((action) => action.id)
    : undefined;

  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .insert({
      lobby_id: lobby.id,
      player_id: player.id,
      action_type: 'power_up',
      turn_index: 0,
      round_number: lobby.round_number,
      payload: {
          powerUpId: powerUp.id,
          kind: definition.kind,
          targetRoundNumber,
          targetPhase,
          ...(snapshotDrawActionIds ? { snapshotDrawActionIds } : {}),
        },
    });
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'power_up_used');
  return getLobbyView(lobby, clientId);
}

export async function cancelCarvingRevelationPowerUp(code: string, clientId: string, powerUpId: string) {
  const { lobby, player } = await assertActivePhasePlayer(code, clientId);
  const actions = await fetchActions(lobby.id);
  const pendingAction = actions.find((action) => (
    action.action_type === 'power_up' &&
    action.player_id === player.id &&
    action.payload.powerUpId === powerUpId &&
    Number(action.payload.targetRoundNumber) === lobby.round_number &&
    action.payload.targetPhase === lobby.phase
  ));
  if (!pendingAction) {
    throw new Error('Power up is no longer queued.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .delete()
    .eq('id', pendingAction.id)
    .eq('lobby_id', lobby.id)
    .eq('player_id', player.id)
    .eq('action_type', 'power_up');
  if (error) throw error;
  await addLobbyEvent(lobby.id, 'power_up_cancelled');
  return getLobbyView(lobby, clientId);
}
