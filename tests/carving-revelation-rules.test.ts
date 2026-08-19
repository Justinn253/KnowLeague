import { describe, expect, it } from 'vitest';
import {
  getActiveConnectedPlayerIds,
  getCorrectGuessPlayerIds,
  getFirstCorrectGuessPlayerId,
  haveAllPlayersSubmitted,
  sanitizeCarvingRevelationLobbyForViewer,
} from '@/lib/carving-revelation-rules';

const action = (overrides: Partial<{
  id: number;
  player_id: string | null;
  action_type: 'draw' | 'guess' | 'next_round_vote' | 'power_up';
  round_number: number;
  payload: Record<string, unknown>;
}> = {}) => ({
  id: 1,
  player_id: 'player-1',
  action_type: 'guess' as const,
  round_number: 1,
  payload: {},
  ...overrides,
});

describe('Carving Revelation round rules', () => {
  it('keeps only connected active players in the current round progress', () => {
    expect(getActiveConnectedPlayerIds([
      { id: 'active-connected', result: 'active', connected: true },
      { id: 'active-disconnected', result: 'active', connected: false },
      { id: 'won', result: 'won', connected: true },
      { id: 'eliminated', result: 'eliminated', connected: true },
    ])).toEqual(['active-connected']);
  });

  it('selects the earliest persisted correct guess for first-correct wins', () => {
    const actions = [
      action({ id: 12, player_id: 'later', payload: { correct: true } }),
      action({ id: 4, player_id: 'earlier', payload: { correct: true } }),
      action({ id: 2, player_id: 'wrong', payload: { correct: false } }),
      action({ id: 1, player_id: 'other-round', round_number: 2, payload: { correct: true } }),
    ];

    expect(getFirstCorrectGuessPlayerId(actions, 1)).toBe('earlier');
    expect(getCorrectGuessPlayerIds(actions, 1)).toEqual(['earlier', 'later']);
  });

  it('requires each active player to submit the required number of actions', () => {
    const actions = [
      action({ id: 1, action_type: 'draw', player_id: 'player-1', payload: {} }),
      action({ id: 2, action_type: 'draw', player_id: 'player-2', payload: {} }),
    ];

    expect(haveAllPlayersSubmitted(actions, ['player-1', 'player-2'], 'draw', 1)).toBe(true);
    expect(haveAllPlayersSubmitted(actions, ['player-1', 'player-2'], 'draw', 1, () => 2)).toBe(false);
    expect(haveAllPlayersSubmitted(actions, [], 'draw', 1)).toBe(false);
  });

  it('hides the secret skin from waiting and active lobby views', () => {
    const activeLobby = { status: 'active', secret_skin_id: 'skin-secret' } as const;
    const finishedLobby = { status: 'finished', secret_skin_id: 'skin-secret' } as const;

    expect(sanitizeCarvingRevelationLobbyForViewer(activeLobby).secret_skin_id).toBeNull();
    expect(sanitizeCarvingRevelationLobbyForViewer(finishedLobby).secret_skin_id).toBe('skin-secret');
  });
});
