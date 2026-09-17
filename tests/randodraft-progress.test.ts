import { describe, expect, it } from 'vitest';
import { createDraftState, draftReducer, RANDODRAFT_VERSION } from '@/lib/randodraft';
import { parseSavedRandodraft, randodraftProgressKey } from '@/lib/randodraft-progress';

describe('Local Randodraft recovery', () => {
  const snapshot = () => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: RANDODRAFT_VERSION, savedAt: '2026-09-11T00:00:00Z',
    state: draftReducer(createDraftState(), { type: 'start' as const, settings: { gameMode: 'summoners-rift' as const, manualSelections: 1 as const, randomBuildType: 'none' as const } }),
  });
  it('restores partial choices and names through the reducer', () => {
    const saved = snapshot();
    saved.state = draftReducer(saved.state, { type: 'select', category: 'champion', value: 'Ahri', manual: true });
    saved.state = draftReducer(saved.state, { type: 'rename', index: 0, name: 'Carry' });
    expect(parseSavedRandodraft(saved)).toEqual(saved);
  });
  it('rejects incompatible, malformed, and illegal snapshots', () => {
    expect(parseSavedRandodraft(null)).toBeNull();
    expect(parseSavedRandodraft({ ...snapshot(), version: 'old' })).toBeNull();
    const saved = snapshot();
    saved.state.current.champion = 'unknown';
    expect(parseSavedRandodraft(saved)).toBeNull();
    expect(parseSavedRandodraft({ ...snapshot(), state: { ...snapshot().state, picks: [snapshot().state.current] } })).toBeNull();
  });
  it('isolates guest and account storage', () => {
    expect(new Set([randodraftProgressKey(null), randodraftProgressKey('a'), randodraftProgressKey('b')]).size).toBe(3);
  });
});
