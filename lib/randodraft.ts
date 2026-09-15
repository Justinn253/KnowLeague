import catalog from '@/data/catalogs/randodraft.json';

export const RANDODRAFT_LANES = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'] as const;
export const RANDODRAFT_MODES = ['summoners-rift', 'aram'] as const;
export type DraftGameMode = typeof RANDODRAFT_MODES[number];
export const RANDODRAFT_TYPES = ['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support', 'Random'] as const;
export const RANDODRAFT_TEAM_SIZE = RANDODRAFT_LANES.length;
export type DraftLane = typeof RANDODRAFT_LANES[number];
export type DraftType = typeof RANDODRAFT_TYPES[number];
export type DraftCategory = 'champion' | 'lane' | 'type';
export type RandomBuildTypeMode = 'none' | 'allow' | 'all';
export type DraftSettings = { gameMode: DraftGameMode; manualSelections: 0 | 1 | 2; randomBuildType: RandomBuildTypeMode };
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
  shopAttributes: number[];
  boots: boolean;
  groups: string[];
  attackType: 'melee' | 'ranged' | null;
  modes: DraftGameMode[];
};
export const DRAFT_PICK_NAME_MAX_LENGTH = 32;
export type DraftPick = {
  name?: string;
  champion: string | null;
  lane: DraftLane | null;
  type: DraftType | null;
  manualCategories: DraftCategory[];
  build: string[] | null;
};
export type CompleteDraftPick = DraftPick & { champion: string; lane: DraftLane | null; type: DraftType };
export type DraftState = {
  phase: 'lobby' | 'drafting' | 'finished';
  settings: DraftSettings;
  picks: CompleteDraftPick[];
  current: DraftPick;
  pickNames: string[];
};
export type DraftAction =
  | { type: 'start'; settings: DraftSettings }
  | { type: 'resume'; state: DraftState }
  | { type: 'select'; category: DraftCategory; value: string; manual: boolean }
  | { type: 'rename'; index: number; name: string }
  | { type: 'build'; itemIds: string[] }
  | { type: 'next' }
  | { type: 'lobby' };

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = { gameMode: 'summoners-rift', manualSelections: 0, randomBuildType: 'none' };
export const RANDODRAFT_VERSION = catalog.version;
export const DRAFT_CHAMPIONS = catalog.champions as DraftChampion[];
export const DRAFT_ITEMS = catalog.items as DraftItem[];
export const DRAFT_CHAMPION_BY_ID = new Map(DRAFT_CHAMPIONS.map((champion) => [champion.id, champion]));
export const DRAFT_ITEM_BY_ID = new Map(DRAFT_ITEMS.map((item) => [item.id, item]));
export const DRAFT_TYPE_DESCRIPTIONS: Record<DraftType, string> = {
  Fighter: 'Items in the Fighter shop category.',
  Marksman: 'Items in the Marksman shop category.',
  Assassin: 'Items in the Assassin shop category.',
  Tank: 'Items in the Tank shop category.',
  Mage: 'Items in the Mage shop category.',
  Support: 'Items in the Support shop category.',
  Random: 'Items from any shop category, with the same equipment restrictions.',
};

export function draftCategories(gameMode: DraftGameMode): DraftCategory[] {
  return gameMode === 'aram' ? ['champion', 'type'] : ['champion', 'lane', 'type'];
}

function emptyPick(randomBuildType: RandomBuildTypeMode = 'none'): DraftPick {
  return { champion: null, lane: null, type: randomBuildType === 'all' ? 'Random' : null, manualCategories: [], build: null };
}

export function normalizeDraftPickName(name: string, index: number): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, DRAFT_PICK_NAME_MAX_LENGTH) || `Pick ${index + 1}`;
}

export function createDraftState(): DraftState {
  return { phase: 'lobby', settings: { ...DEFAULT_DRAFT_SETTINGS }, picks: [], current: emptyPick(), pickNames: Array.from({ length: RANDODRAFT_TEAM_SIZE }, (_, index) => `Pick ${index + 1}`) };
}

export function isCompletePick(pick: DraftPick, gameMode: DraftGameMode = 'summoners-rift'): pick is CompleteDraftPick {
  return Boolean(pick.champion && pick.type && (gameMode === 'aram' || pick.lane));
}

export function availableDraftValues(category: DraftCategory, picks: readonly DraftPick[], randomBuildType: RandomBuildTypeMode = 'none', gameMode: DraftGameMode = 'summoners-rift'): string[] {
  if (category === 'champion') return DRAFT_CHAMPIONS.filter((champion) => !picks.some((pick) => pick.champion === champion.id)).map((champion) => champion.id);
  if (gameMode === 'aram' && category === 'lane') return [];
  if (category === 'lane') return RANDODRAFT_LANES.filter((lane) => !picks.some((pick) => pick.lane === lane));
  if (randomBuildType === 'all') return ['Random'];
  return RANDODRAFT_TYPES.filter((type) => type !== 'Random' || randomBuildType === 'allow');
}

export function randomDraftValue<T>(values: readonly T[], random = Math.random): T {
  if (!values.length) throw new Error('No draft choices remain.');
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
}

export function canAddDraftItem(item: DraftItem, champion: DraftChampion, type: DraftType, build: readonly DraftItem[], gameMode: DraftGameMode = 'summoners-rift'): boolean {
  return (item.modes?.includes(gameMode) ?? gameMode === 'summoners-rift')
    && (type === 'Random' || item.boots || item.types.includes(type))
    && (!item.attackType || champion.attackTypes.includes(item.attackType))
    && !build.some((chosen) => chosen.id === item.id
      || (chosen.boots && item.boots)
      || chosen.groups.some((group) => item.groups.includes(group)));
}

/** Six shuffled inventory slots; boots may sit outside the selected shop class. */
export function generateDraftBuild(champion: DraftChampion, type: DraftType, gameModeOrRandom: DraftGameMode | (() => number) = 'summoners-rift', random = Math.random): string[] {
  const gameMode = typeof gameModeOrRandom === 'function' ? 'summoners-rift' : gameModeOrRandom;
  const picker = typeof gameModeOrRandom === 'function' ? gameModeOrRandom : random;
  const build: DraftItem[] = [];
  const boots = DRAFT_ITEMS.filter((item) => item.boots && canAddDraftItem(item, champion, type, [], gameMode));
  if (boots.length) build.push(randomDraftValue(boots, picker));
  while (build.length < 6) {
    const candidates = DRAFT_ITEMS.filter((item) => !item.boots && canAddDraftItem(item, champion, type, build, gameMode));
    build.push(randomDraftValue(candidates, picker));
  }
  const ids = build.map((item) => item.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const swap = Math.min(index, Math.max(0, Math.floor(picker() * (index + 1))));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return ids;
}

export function isValidDraftBuild(ids: readonly string[], champion: DraftChampion, type: DraftType, gameMode: DraftGameMode = 'summoners-rift'): boolean {
  if (ids.length !== 6) return false;
  const build: DraftItem[] = [];
  for (const id of ids) {
    const item = DRAFT_ITEM_BY_ID.get(id);
    if (!item || !canAddDraftItem(item, champion, type, build, gameMode)) return false;
    build.push(item);
  }
  return true;
}

/** All locking and budget rules live here, independent of animation timing. */
export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  if (action.type === 'resume') return action.state;
  if (action.type === 'lobby') return { ...state, phase: 'lobby' };
  if (action.type === 'start') {
    return { ...createDraftState(), phase: 'drafting', settings: { ...action.settings }, current: emptyPick(action.settings.randomBuildType) };
  }
  if (state.phase !== 'drafting') return state;
  if (action.type === 'rename') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= RANDODRAFT_TEAM_SIZE) return state;
    const name = normalizeDraftPickName(action.name, action.index);
    return {
      ...state,
      pickNames: state.pickNames.map((current, index) => index === action.index ? name : current),
      picks: state.picks.map((pick, index) => index === action.index ? { ...pick, name } : pick),
    };
  }
  if (action.type === 'select') {
    if (state.current[action.category] !== null
      || !draftCategories(state.settings.gameMode).includes(action.category)
      || !availableDraftValues(action.category, state.picks, state.settings.randomBuildType, state.settings.gameMode).includes(action.value)
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
  if (!isCompletePick(state.current, state.settings.gameMode)) return state;
  if (action.type === 'build') {
    const champion = DRAFT_CHAMPION_BY_ID.get(state.current.champion);
    if (state.current.build || !champion
      || !isValidDraftBuild(action.itemIds, champion, state.current.type, state.settings.gameMode)) return state;
    return { ...state, current: { ...state.current, build: [...action.itemIds] } };
  }
  if (!state.current.build) return state;
  const picks = [...state.picks, { ...state.current, name: state.pickNames[state.picks.length] }];
  return { ...state, picks, current: emptyPick(state.settings.randomBuildType), phase: picks.length === RANDODRAFT_TEAM_SIZE ? 'finished' : 'drafting' };
}
