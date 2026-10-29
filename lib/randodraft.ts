import catalog from '@/data/catalogs/randodraft.json';

export const RANDODRAFT_LANES = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'] as const;
export const RANDODRAFT_MODES = ['summoners-rift', 'aram'] as const;
export type DraftGameMode = typeof RANDODRAFT_MODES[number];
export const RANDODRAFT_TYPES = ['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support', 'Random'] as const;
export const RANDODRAFT_TEAM_SIZE = RANDODRAFT_LANES.length;
export const DRAFT_PICK_NAME_MAX_LENGTH = 32;
export const RANDODRAFT_PLAYER_COUNTS = [1, 2, 3, 4, 5] as const;
export type DraftPlayersPerTeam = typeof RANDODRAFT_PLAYER_COUNTS[number];
export type DraftLane = typeof RANDODRAFT_LANES[number];
export type DraftType = typeof RANDODRAFT_TYPES[number];
export type DraftCategory = 'champion' | 'lane' | 'type';
export type RandomBuildTypeMode = 'none' | 'allow' | 'all';

export type DraftSettings = {
  gameMode: DraftGameMode;
  manualSelections: 0 | 1 | 2;
  randomBuildType: RandomBuildTypeMode;
  quickRoll?: boolean;
  secondTeam?: boolean;
  playersPerTeam?: DraftPlayersPerTeam;
};

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

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  gameMode: 'summoners-rift',
  manualSelections: 0,
  randomBuildType: 'none',
  quickRoll: true,
  secondTeam: false,
  playersPerTeam: RANDODRAFT_TEAM_SIZE,
};
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

export function normalizeDraftSettings(input?: Partial<DraftSettings> | null): DraftSettings {
  const gameMode: DraftGameMode = input?.gameMode === 'aram' ? 'aram' : 'summoners-rift';
  const manualSelections: 0 | 1 | 2 = input?.manualSelections === 1 || input?.manualSelections === 2 ? input.manualSelections : 0;
  const randomBuildType: RandomBuildTypeMode = input?.randomBuildType === 'allow' || input?.randomBuildType === 'all' ? input.randomBuildType : 'none';
  const playersPerTeam = RANDODRAFT_PLAYER_COUNTS.includes(input?.playersPerTeam as DraftPlayersPerTeam) ? input!.playersPerTeam as DraftPlayersPerTeam : RANDODRAFT_TEAM_SIZE;
  return { gameMode, manualSelections, randomBuildType, quickRoll: input?.quickRoll !== false, secondTeam: input?.secondTeam === true, playersPerTeam };
}

export function draftPlayersPerTeam(settings?: Partial<DraftSettings> | null): DraftPlayersPerTeam {
  return normalizeDraftSettings(settings).playersPerTeam!;
}
export function hasSecondTeam(settings?: Partial<DraftSettings> | null): boolean {
  return normalizeDraftSettings(settings).secondTeam === true;
}
export function draftTotalPicks(settings?: Partial<DraftSettings> | null): number {
  const normalized = normalizeDraftSettings(settings);
  return normalized.playersPerTeam! * (normalized.secondTeam ? 2 : 1);
}
export function draftTeamIndexForPick(pickIndex: number, settings?: Partial<DraftSettings> | null): 0 | 1 {
  return hasSecondTeam(settings) && pickIndex >= draftPlayersPerTeam(settings) ? 1 : 0;
}
export function draftSlotForPick(pickIndex: number, settings?: Partial<DraftSettings> | null): number {
  return pickIndex % draftPlayersPerTeam(settings);
}

export function draftCategories(gameMode: DraftGameMode): DraftCategory[] {
  return gameMode === 'aram' ? ['champion', 'type'] : ['champion', 'lane', 'type'];
}

function emptyPick(randomBuildType: RandomBuildTypeMode = 'none'): DraftPick {
  return { champion: null, lane: null, type: randomBuildType === 'all' ? 'Random' : null, manualCategories: [], build: null };
}

export function defaultDraftPickName(index: number): string {
  return `Pick ${index + 1}`;
}

export function normalizeDraftPickName(name: string, index: number): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 32) || defaultDraftPickName(index);
}

/** Uses the champion as the completed-draft label until a player assigns a custom pick name. */
export function draftPickDisplayName(pick: Pick<DraftPick, 'name'>, index: number, championName: string): string {
  const name = pick.name?.trim();
  return name && name !== defaultDraftPickName(index) ? name : championName;
}

export function createDraftState(settings: DraftSettings = DEFAULT_DRAFT_SETTINGS): DraftState {
  const normalized = normalizeDraftSettings(settings);
  return {
    phase: 'lobby',
    settings: normalized,
    picks: [],
    current: emptyPick(normalized.randomBuildType),
    pickNames: Array.from({ length: draftTotalPicks(normalized) }, (_, index) => defaultDraftPickName(index)),
  };
}

export function isCompletePick(pick: DraftPick, gameMode: DraftGameMode = 'summoners-rift'): pick is CompleteDraftPick {
  return Boolean(pick.champion && pick.type && (gameMode === 'aram' || pick.lane));
}

export function availableDraftValues(
  category: DraftCategory,
  picks: readonly DraftPick[],
  randomBuildType: RandomBuildTypeMode = 'none',
  gameMode: DraftGameMode = 'summoners-rift',
  settings?: Partial<DraftSettings> | null,
): string[] {
  if (category === 'champion') return DRAFT_CHAMPIONS.filter((champion) => !picks.some((pick) => pick.champion === champion.id)).map((champion) => champion.id);
  if (gameMode === 'aram' && category === 'lane') return [];
  if (category === 'lane') {
    const teamSize = draftPlayersPerTeam(settings);
    const secondTeam = hasSecondTeam(settings);
    const currentTeamStart = secondTeam ? Math.floor(picks.length / teamSize) * teamSize : 0;
    const teamPicks = picks.slice(currentTeamStart, currentTeamStart + teamSize);
    return RANDODRAFT_LANES.filter((lane) => !teamPicks.some((pick) => pick.lane === lane));
  }
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
    && !build.some((chosen) => chosen.id === item.id || (chosen.boots && item.boots) || chosen.groups.some((group) => item.groups.includes(group)));
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
  if (action.type === 'resume') {
    const settings = normalizeDraftSettings(action.state.settings);
    const total = draftTotalPicks(settings);
    return {
      ...action.state,
      settings,
      pickNames: Array.from({ length: total }, (_, index) => normalizeDraftPickName(action.state.pickNames?.[index] ?? defaultDraftPickName(index), index)),
    };
  }
  if (action.type === 'lobby') return { ...state, phase: 'lobby' };
  if (action.type === 'start') {
    const settings = normalizeDraftSettings(action.settings);
    return { ...createDraftState(settings), phase: 'drafting', settings, current: emptyPick(settings.randomBuildType) };
  }
  if (state.phase !== 'drafting') return state;
  if (action.type === 'rename') {
    const total = draftTotalPicks(state.settings);
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= total) return state;
    const name = normalizeDraftPickName(action.name, action.index);
    return { ...state, pickNames: state.pickNames.map((current, index) => index === action.index ? name : current), picks: state.picks.map((pick, index) => index === action.index ? { ...pick, name } : pick) };
  }
  if (action.type === 'select') {
    const categories = draftCategories(state.settings.gameMode);
    if (state.current[action.category] !== null
      || !categories.includes(action.category)
      || !availableDraftValues(action.category, state.picks, state.settings.randomBuildType, state.settings.gameMode, state.settings).includes(action.value)
      || (action.manual && state.current.manualCategories.length >= state.settings.manualSelections!)) return state;
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
    if (state.current.build || !champion || !isValidDraftBuild(action.itemIds, champion, state.current.type, state.settings.gameMode)) return state;
    return { ...state, current: { ...state.current, build: [...action.itemIds] } };
  }
  if (!state.current.build || state.picks.length >= draftTotalPicks(state.settings)) return state;
  const picks = [...state.picks, { ...state.current, name: state.pickNames[state.picks.length] }];
  return { ...state, picks, current: emptyPick(state.settings.randomBuildType), phase: picks.length === draftTotalPicks(state.settings) ? 'finished' : 'drafting' };
}
