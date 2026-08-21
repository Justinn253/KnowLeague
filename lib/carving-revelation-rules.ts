export type CarvingRevelationRulePlayer = {
  id: string;
  result: 'active' | 'eliminated' | 'won';
  connected: boolean;
};

export type CarvingRevelationRuleAction = {
  id: number;
  player_id: string | null;
  action_type: 'draw' | 'guess' | 'next_round_vote' | 'power_up';
  round_number: number;
  payload: Record<string, unknown>;
};

export type CarvingRevelationHintFrequency = 0 | 1 | 2 | 3 | 4;

export type CarvingRevelationViewLobbyVersion = {
  id: string;
  status: string;
  round_number: number;
  phase: string;
  created_at: string;
  started_at: string | null;
  updated_at: string;
};

function getTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getStatusRank(status: string) {
  return status === 'waiting' ? 0
    : status === 'active' ? 1
      : status === 'finished' ? 2
        : status === 'terminated' ? 3
          : -1;
}

/** Identifies a complete Carving Revelation match, including a next round. */
export function getCarvingRevelationMatchKey(lobby: Pick<CarvingRevelationViewLobbyVersion, 'id' | 'created_at' | 'started_at'>) {
  return `${lobby.id}:${lobby.started_at ?? lobby.created_at}`;
}

/**
 * Compares two lobby snapshots. A negative result means `next` is older and
 * must not replace the already-rendered snapshot.
 */
export function compareCarvingRevelationViewVersions(
  next: CarvingRevelationViewLobbyVersion,
  current: CarvingRevelationViewLobbyVersion,
) {
  const nextMatchStart = getTimestamp(next.started_at ?? next.created_at);
  const currentMatchStart = getTimestamp(current.started_at ?? current.created_at);
  if (nextMatchStart !== currentMatchStart) return nextMatchStart - currentMatchStart;

  const statusDifference = getStatusRank(next.status) - getStatusRank(current.status);
  if (statusDifference !== 0) return statusDifference;

  if (next.round_number !== current.round_number) return next.round_number - current.round_number;

  const phaseDifference = (next.phase === 'guess' ? 1 : 0) - (current.phase === 'guess' ? 1 : 0);
  if (phaseDifference !== 0) return phaseDifference;

  return getTimestamp(next.updated_at) - getTimestamp(current.updated_at);
}

export function getCarvingRevelationAnswerCandidates(
  answer: string | null | undefined,
  title: string | null | undefined,
) {
  return [...new Set([answer, title]
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => candidate.trim())
    .filter(Boolean))];
}

export function getCarvingRevelationHint(
  answer: string | null | undefined,
  frequency: CarvingRevelationHintFrequency,
  roundNumber: number,
) {
  const trimmedAnswer = answer?.trim() ?? '';
  if (!trimmedAnswer || frequency === 0 || roundNumber < frequency) return null;

  const revealedCharacterCount = Math.min(trimmedAnswer.length, Math.floor(roundNumber / frequency));
  return trimmedAnswer.slice(0, revealedCharacterCount) || null;
}

export function sanitizeCarvingRevelationLobbyForViewer<
  TLobby extends { status: string; secret_skin_id: string | null },
>(lobby: TLobby): TLobby {
  if (lobby.status === 'finished') return lobby;
  return { ...lobby, secret_skin_id: null };
}

export function getActiveConnectedPlayerIds(players: CarvingRevelationRulePlayer[]) {
  return players
    .filter((player) => player.result === 'active' && player.connected)
    .map((player) => player.id);
}

export function getFirstCorrectGuessPlayerId(
  actions: CarvingRevelationRuleAction[],
  roundNumber: number,
) {
  const correctGuessActions = actions
    .filter((action) => (
      action.action_type === 'guess' &&
      action.round_number === roundNumber &&
      action.player_id &&
      action.payload.correct === true
    ))
    .sort((first, second) => first.id - second.id);

  return correctGuessActions[0]?.player_id ?? null;
}

export function getCorrectGuessPlayerIds(
  actions: CarvingRevelationRuleAction[],
  roundNumber: number,
) {
  return [...new Set(
    actions
      .filter((action) => (
        action.action_type === 'guess' &&
        action.round_number === roundNumber &&
        action.player_id &&
        action.payload.correct === true
      ))
      .sort((first, second) => first.id - second.id)
      .map((action) => action.player_id as string),
  )];
}

export function getRoundPlayerActionCount(
  actions: CarvingRevelationRuleAction[],
  actionType: CarvingRevelationRuleAction['action_type'],
  roundNumber: number,
  playerId: string,
) {
  return actions.filter((action) => (
    action.action_type === actionType &&
    action.round_number === roundNumber &&
    action.player_id === playerId
  )).length;
}

export function haveAllPlayersSubmitted(
  actions: CarvingRevelationRuleAction[],
  playerIds: string[],
  actionType: CarvingRevelationRuleAction['action_type'],
  roundNumber: number,
  requiredActionsPerPlayer: (playerId: string) => number = () => 1,
) {
  return playerIds.length > 0 && playerIds.every((playerId) => (
    getRoundPlayerActionCount(actions, actionType, roundNumber, playerId) >= requiredActionsPerPlayer(playerId)
  ));
}
