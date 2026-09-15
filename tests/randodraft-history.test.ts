import { describe, expect, it } from 'vitest';
import { DRAFT_CHAMPION_BY_ID, generateDraftBuild, availableDraftValues, createDraftState, DEFAULT_DRAFT_SETTINGS, draftReducer, RANDODRAFT_VERSION } from '@/lib/randodraft';
import { parseDraftHistoryInput, type DraftHistoryInput } from '@/lib/randodraft-history';

function draft(): DraftHistoryInput {
  let state = draftReducer(createDraftState(), { type: 'start', settings: DEFAULT_DRAFT_SETTINGS });
  for (let index = 0; index < 5; index++) {
    for (const category of ['champion', 'lane', 'type'] as const) {
      state = draftReducer(state, { type: 'select', category, value: availableDraftValues(category, state.picks)[0], manual: false });
    }
    state = draftReducer(state, { type: 'build', itemIds: generateDraftBuild(DRAFT_CHAMPION_BY_ID.get(state.current.champion!)!, state.current.type!) });
    state = draftReducer(state, { type: 'next' });
  }
  return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: RANDODRAFT_VERSION, settings: state.settings, picks: state.picks };
}

describe('Completed draft validation', () => {
  it('accepts a complete legal draft and strips arbitrary fields', () => {
    const input = draft();
    input.picks[0].name = 'Carry';
    expect(parseDraftHistoryInput({ ...input, userId: 'someone-else', completedAt: 'fake' })).toEqual(input);
  });

  it('rejects incomplete, duplicate, invalid, and over-budget drafts', () => {
    expect(parseDraftHistoryInput(null)).toBeNull();
    const incomplete = draft();
    incomplete.picks.pop();
    expect(parseDraftHistoryInput(incomplete)).toBeNull();
    const duplicate = draft();
    duplicate.picks[1].champion = duplicate.picks[0].champion;
    expect(parseDraftHistoryInput(duplicate)).toBeNull();
    const manual = draft();
    manual.picks[0].manualCategories = ['type'];
    expect(parseDraftHistoryInput(manual)).toBeNull();
    const missingBuild = draft();
    missingBuild.picks[0].build = null;
    expect(parseDraftHistoryInput(missingBuild)).toBeNull();
    const items = draft();
    items.picks[0].build = Array(6).fill('invalid');
    expect(parseDraftHistoryInput(items)).toBeNull();
    const oversizedName = draft();
    oversizedName.picks[0].name = 'x'.repeat(33);
    expect(parseDraftHistoryInput(oversizedName)).toBeNull();
    const type = draft();
    type.settings.randomBuildType = 'all';
    expect(parseDraftHistoryInput(type)).toBeNull();
  });
});
