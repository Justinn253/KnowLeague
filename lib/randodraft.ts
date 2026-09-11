import catalog from '@/data/catalogs/randodraft.json';

export const RANDODRAFT_LANES = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'] as const;
export const RANDODRAFT_TYPES = ['AD', 'AP', 'Tank', 'Random'] as const;
export const RANDODRAFT_TEAM_SIZE = RANDODRAFT_LANES.length;
export type DraftLane = typeof RANDODRAFT_LANES[number];
export type DraftType = typeof RANDODRAFT_TYPES[number];
export type DraftCategory = 'champion' | 'lane' | 'type';
export type RandomBuildTypeMode = 'none' | 'allow' | 'all';
export type DraftSettings = { manualSelections: 0 | 1 | 2; randomBuildType: RandomBuildTypeMode };
export type DraftChampion = {
  id: string;
  name: string;
  imageUrl: string;
  attackTypes: ('melee' | 'ranged')[];
};
export type DraftItem = {
  id: string;
  name: string;
  imageUrl: string;
  types: DraftType[];
  boots: boolean;
  groups: string[];
  attackType: 'melee' | 'ranged' | null;
};
export type DraftPick = {
  champion: string | null;
  lane: DraftLane | null;
  type: DraftType | null;
  manualCategories: DraftCategory[];
  build: string[] | null;
};
export type CompleteDraftPick = DraftPick & { champion: string; lane: DraftLane; type: DraftType };
export type DraftState = {
  phase: 'lobby' | 'drafting' | 'finished';
  settings: DraftSettings;
  picks: CompleteDraftPick[];
  current: DraftPick;
};
export type DraftAction =
  | { type: 'start'; settings: DraftSettings }
  | { type: 'select'; category: DraftCategory; value: string; manual: boolean }
  | { type: 'build'; itemIds: string[] }
  | { type: 'next' }
  | { type: 'lobby' };

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = { manualSelections: 0, randomBuildType: 'none' };
export const RANDODRAFT_VERSION = catalog.version;
export const DRAFT_CHAMPIONS = catalog.champions as DraftChampion[];
export const DRAFT_ITEMS = catalog.items as DraftItem[];
export const DRAFT_CHAMPION_BY_ID = new Map(DRAFT_CHAMPIONS.map((champion) => [champion.id, champion]));
export const DRAFT_ITEM_BY_ID = new Map(DRAFT_ITEMS.map((item) => [item.id, item]));
export const DRAFT_TYPE_DESCRIPTIONS: Record<DraftType, string> = {
  AD: 'Items that grant attack damage or attack speed.',
  AP: 'Items that grant ability power.',
  Tank: 'Items that grant health, armor, or magic resistance.',
  Random: 'Items from any build type, with the same equipment restrictions.',
};

function emptyPick(): DraftPick {
  return { champion: null, lane: null, type: null, manualCategories: [], build: null };
}

export function createDraftState(): DraftState {
  return { phase: 'lobby', settings: { ...DEFAULT_DRAFT_SETTINGS }, picks: [], current: emptyPick() };
}

export function isCompletePick(pick: DraftPick): pick is CompleteDraftPick {
  return Boolean(pick.champion && pick.lane && pick.type);
}

export function availableDraftValues(category: DraftCategory, picks: readonly DraftPick[], randomBuildType: RandomBuildTypeMode = 'none'): string[] {
  if (category === 'champion') return DRAFT_CHAMPIONS.filter((champion) => !picks.some((pick) => pick.champion === champion.id)).map((champion) => champion.id);
  if (category === 'lane') return RANDODRAFT_LANES.filter((lane) => !picks.some((pick) => pick.lane === lane));
  if (randomBuildType === 'all') return ['Random'];
  return RANDODRAFT_TYPES.filter((type) => type !== 'Random' || randomBuildType === 'allow');
}

export function randomDraftValue<T>(values: readonly T[], random = Math.random): T {
  if (!values.length) throw new Error('No draft choices remain.');
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
}

export function canAddDraftItem(item: DraftItem, champion: DraftChampion, type: DraftType, build: readonly DraftItem[]): boolean {
  return (type === 'Random' || item.boots || item.types.includes(type))
    && (!item.attackType || champion.attackTypes.includes(item.attackType))
    && !build.some((chosen) => chosen.id === item.id
      || (chosen.boots && item.boots)
      || chosen.groups.some((group) => item.groups.includes(group)));
}

/** Six inventory slots in purchase order; boots may sit outside the selected stat type. */
export function generateDraftBuild(champion: DraftChampion, type: DraftType, random = Math.random): string[] {
  const build: DraftItem[] = [];
  const boots = DRAFT_ITEMS.filter((item) => item.boots && canAddDraftItem(item, champion, type, []));
  if (boots.length) build.push(randomDraftValue(boots, random));
  while (build.length < 6) {
    const candidates = DRAFT_ITEMS.filter((item) => !item.boots && canAddDraftItem(item, champion, type, build));
    build.push(randomDraftValue(candidates, random));
  }
  return build.map((item) => item.id);
}

export function isValidDraftBuild(ids: readonly string[], champion: DraftChampion, type: DraftType): boolean {
  if (ids.length !== 6) return false;
  const build: DraftItem[] = [];
  for (const id of ids) {
    const item = DRAFT_ITEM_BY_ID.get(id);
    if (!item || !canAddDraftItem(item, champion, type, build)) return false;
    build.push(item);
  }
  return true;
}

/** All locking and budget rules live here, independent of animation timing. */
export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  if (action.type === 'lobby') return { ...state, phase: 'lobby' };
  if (action.type === 'start') {
    return { phase: 'drafting', settings: { ...action.settings }, picks: [], current: emptyPick() };
  }
  if (state.phase !== 'drafting') return state;
  if (action.type === 'select') {
    if (state.current[action.category] !== null
      || !availableDraftValues(action.category, state.picks, state.settings.randomBuildType).includes(action.value)
      || (action.manual && state.current.manualCategories.length >= state.settings.manualSelections)) return state;
    return {
      ...state,
      current: {
        ...state.current,
        [action.category]: action.value,
        manualCategories: action.manual ? [...state.current.manualCategories, action.category] : state.current.manualCategories,
      },
    };
  }
  if (!isCompletePick(state.current)) return state;
  if (action.type === 'build') {
    const champion = DRAFT_CHAMPION_BY_ID.get(state.current.champion);
    if (state.current.build || !champion
      || !isValidDraftBuild(action.itemIds, champion, state.current.type)) return state;
    return { ...state, current: { ...state.current, build: [...action.itemIds] } };
  }
  // Players may advance without rolling a build.
  const picks = [...state.picks, state.current];
  return { ...state, picks, current: emptyPick(), phase: picks.length === RANDODRAFT_TEAM_SIZE ? 'finished' : 'drafting' };
}
