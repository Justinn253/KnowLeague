import {
  createDraftState, draftReducer, RANDODRAFT_TEAM_SIZE,
  type CompleteDraftPick, type DraftCategory, type DraftSettings,
} from '@/lib/randodraft';

export type DraftHistoryInput = {
  id: string;
  version: string;
  settings: DraftSettings;
  picks: CompleteDraftPick[];
};
export type DraftHistoryEntry = DraftHistoryInput & { completedAt: string };

/** Replay the submitted draft to enforce the same locks, budgets, and build rules. */
export function parseDraftHistoryInput(value: unknown): DraftHistoryInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<DraftHistoryInput>;
  if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)
    || typeof input.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.version)
    || !input.settings || ![0, 1, 2].includes(input.settings.manualSelections)
    || !['none', 'allow', 'all'].includes(input.settings.randomBuildType)
    || !Array.isArray(input.picks) || input.picks.length !== RANDODRAFT_TEAM_SIZE) return null;
  const settings: DraftSettings = {
    manualSelections: input.settings.manualSelections,
    randomBuildType: input.settings.randomBuildType,
  };
  let state = draftReducer(createDraftState(), { type: 'start', settings });
  const categories: DraftCategory[] = ['champion', 'lane', 'type'];
  for (const pick of input.picks) {
    if (!pick || !Array.isArray(pick.manualCategories)
      || new Set(pick.manualCategories).size !== pick.manualCategories.length
      || pick.manualCategories.some((category) => !categories.includes(category))) return null;
    for (const category of categories) {
      if (typeof pick[category] !== 'string') return null;
      const next = draftReducer(state, { type: 'select', category, value: pick[category], manual: pick.manualCategories.includes(category) });
      if (next === state) return null;
      state = next;
    }
    if (pick.build !== null) {
      if (!Array.isArray(pick.build) || pick.build.some((id) => typeof id !== 'string')) return null;
      const next = draftReducer(state, { type: 'build', itemIds: pick.build });
      if (next === state) return null;
      state = next;
    }
    state = draftReducer(state, { type: 'next' });
  }
  return { id: input.id, version: input.version, settings, picks: state.picks };
}
