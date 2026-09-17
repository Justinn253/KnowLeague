import {
  createDraftState, draftCategories, draftReducer, draftTotalPicks, DRAFT_PICK_NAME_MAX_LENGTH,
  normalizeDraftSettings,
  type CompleteDraftPick, type DraftCategory, type DraftSettings,
} from '@/lib/randodraft';

export type DraftHistoryInput = {
  id: string;
  version: string;
  settings: DraftSettings;
  picks: CompleteDraftPick[];
};
export type DraftHistoryEntry = DraftHistoryInput & { completedAt: string };

export function parseDraftHistoryInput(value: unknown): DraftHistoryInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<DraftHistoryInput>;
  if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)
    || typeof input.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.version)
    || !input.settings || ![0, 1, 2].includes(input.settings.manualSelections)
    || !['none', 'allow', 'all'].includes(input.settings.randomBuildType)
    || (input.settings.gameMode !== undefined && !['summoners-rift', 'aram'].includes(input.settings.gameMode))
    || (input.settings.playersPerTeam !== undefined && ![1, 2, 3, 4, 5].includes(input.settings.playersPerTeam))
    || (input.settings.quickRoll !== undefined && typeof input.settings.quickRoll !== 'boolean')
    || (input.settings.secondTeam !== undefined && typeof input.settings.secondTeam !== 'boolean')
    || !Array.isArray(input.picks)) return null;
  const settings = normalizeDraftSettings(input.settings);
  if (input.picks.length !== draftTotalPicks(settings)) return null;

  let state = draftReducer(createDraftState(settings), { type: 'start', settings });
  const categories: DraftCategory[] = draftCategories(settings.gameMode);
  for (const pick of input.picks) {
    if (!pick || !Array.isArray(pick.manualCategories)
      || new Set(pick.manualCategories).size !== pick.manualCategories.length
      || pick.manualCategories.some((category) => !categories.includes(category))) return null;
    if (pick.name !== undefined && (typeof pick.name !== 'string' || pick.name.length > DRAFT_PICK_NAME_MAX_LENGTH)) return null;
    if (pick.name !== undefined) state = draftReducer(state, { type: 'rename', index: state.picks.length, name: pick.name });
    for (const category of categories) {
      if (typeof pick[category] !== 'string') return null;
      const currentValue = state.current[category];
      if (currentValue !== null) {
        if (currentValue !== pick[category]) return null;
        continue;
      }
      const next = draftReducer(state, { type: 'select', category, value: pick[category], manual: pick.manualCategories.includes(category) });
      if (next === state) return null;
      state = next;
    }
    if (!Array.isArray(pick.build) || pick.build.some((id) => typeof id !== 'string')) return null;
    const built = draftReducer(state, { type: 'build', itemIds: pick.build });
    if (built === state) return null;
    state = built;
    const next = draftReducer(state, { type: 'next' });
    if (next === state) return null;
    state = next;
  }
  return { id: input.id, version: input.version, settings, picks: state.picks };
}
