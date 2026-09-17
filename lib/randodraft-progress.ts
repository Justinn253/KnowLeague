import {
  createDraftState, draftCategories, draftReducer, draftTotalPicks, DRAFT_PICK_NAME_MAX_LENGTH,
  normalizeDraftSettings, RANDODRAFT_VERSION,
  type DraftCategory, type DraftPick, type DraftState,
} from '@/lib/randodraft';

export type SavedRandodraft = { id: string; version: string; savedAt: string; state: DraftState };
export const randodraftProgressKey = (userId: string | null) => 'knowleague:randodraft:progress:v1:' + (userId ?? 'guest');

export function parseSavedRandodraft(value: unknown): SavedRandodraft | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<SavedRandodraft>;
  const input = saved.state;
  if (typeof saved.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.id)
    || saved.version !== RANDODRAFT_VERSION || typeof saved.savedAt !== 'string' || !Number.isFinite(Date.parse(saved.savedAt))
    || !input || input.phase !== 'drafting' || !input.settings
    || ![0, 1, 2].includes(input.settings.manualSelections) || !['none', 'allow', 'all'].includes(input.settings.randomBuildType)
    || (input.settings.gameMode !== undefined && !['summoners-rift', 'aram'].includes(input.settings.gameMode))
    || (input.settings.playersPerTeam !== undefined && ![1, 2, 3, 4, 5].includes(input.settings.playersPerTeam))
    || (input.settings.quickRoll !== undefined && typeof input.settings.quickRoll !== 'boolean')
    || (input.settings.secondTeam !== undefined && typeof input.settings.secondTeam !== 'boolean')
    || !Array.isArray(input.picks) || !Array.isArray(input.pickNames)
    || input.pickNames.some((name) => typeof name !== 'string' || name.length > DRAFT_PICK_NAME_MAX_LENGTH)
    || !input.current) return null;
  const settings = normalizeDraftSettings(input.settings);
  const total = draftTotalPicks(settings);
  if (input.picks.length >= total || input.pickNames.length !== total) return null;

  let state = draftReducer(createDraftState(settings), { type: 'start', settings });
  for (let index = 0; index < total; index++) state = draftReducer(state, { type: 'rename', index, name: input.pickNames[index] });
  const categories: DraftCategory[] = draftCategories(settings.gameMode);
  function replay(pick: DraftPick): boolean {
    if (!pick || !Array.isArray(pick.manualCategories)
      || new Set(pick.manualCategories).size !== pick.manualCategories.length
      || pick.manualCategories.some((category) => !categories.includes(category) || pick[category] === null)) return false;
    for (const category of categories) {
      if (pick[category] === null) continue;
      if (typeof pick[category] !== 'string') return false;
      const next = draftReducer(state, { type: 'select', category, value: pick[category], manual: pick.manualCategories.includes(category) });
      if (next === state) return false;
      state = next;
    }
    if (pick.build !== null) {
      if (!Array.isArray(pick.build) || pick.build.some((id) => typeof id !== 'string')) return false;
      const next = draftReducer(state, { type: 'build', itemIds: pick.build });
      if (next === state) return false;
      state = next;
    }
    return true;
  }
  for (const pick of input.picks) {
    if (!replay(pick)) return null;
    const next = draftReducer(state, { type: 'next' });
    if (next === state) return null;
    state = next;
  }
  if (!replay(input.current)) return null;
  return { id: saved.id, version: saved.version, savedAt: saved.savedAt, state };
}

export function readSavedRandodraft(userId: string | null): SavedRandodraft | null {
  const raw = window.localStorage.getItem(randodraftProgressKey(userId));
  if (!raw) return null;
  try { return parseSavedRandodraft(JSON.parse(raw)); } catch { return null; }
}
