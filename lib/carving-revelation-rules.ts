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
