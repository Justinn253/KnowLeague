import { describe, expect, it } from 'vitest';
import {
  availableDraftValues, canAddDraftItem, createDraftState, DRAFT_CHAMPIONS, DRAFT_ITEMS,
  draftReducer, generateDraftBuild, isValidDraftBuild, RANDODRAFT_LANES, RANDODRAFT_TYPES,
  type DraftCategory, type DraftSettings, type DraftState,
} from '@/lib/randodraft';

function start(manualSelections: DraftSettings['manualSelections'] = 0) {
  return draftReducer(createDraftState(), { type: 'start', settings: { manualSelections, randomBuildType: 'none' } });
}
function select(state: DraftState, category: DraftCategory, value: string, manual = false) {
  return draftReducer(state, { type: 'select', category, value, manual });
}
function complete(state: DraftState) {
  return select(select(select(state, 'champion', availableDraftValues('champion', state.picks)[0]), 'lane', availableDraftValues('lane', state.picks)[0]), 'type', 'AD');
}
function seededRandom(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

describe('Randodraft draft rules', () => {
  it('starts with every category spun and standard build types', () => {
    expect(createDraftState().settings).toEqual({ manualSelections: 0, randomBuildType: 'none' });
    const state = start();
    expect(select(state, 'champion', 'Ahri', true)).toBe(state);
    expect(draftReducer(state, { type: 'next' })).toBe(state);
  });

  it.each([0, 1, 2] as const)('enforces a per-pick manual allowance of %s', (allowance) => {
    let state = start(allowance);
    const choices = [['type', 'AD'], ['lane', 'Top'], ['champion', 'Ahri']] as const;
    choices.forEach(([category, value], index) => {
      const previous = state;
      state = select(state, category, value, true);
      if (index >= allowance) expect(state).toBe(previous);
      else expect(state.current[category]).toBe(value);
    });
    state = complete(state);
    state = draftReducer(state, { type: 'next' });
    expect(state.current.manualCategories).toHaveLength(0);
    expect(state.settings.manualSelections).toBe(allowance);
  });

  it('supports every category order and locks choices', () => {
    const orders: DraftCategory[][] = [
      ['champion', 'lane', 'type'], ['champion', 'type', 'lane'],
      ['lane', 'champion', 'type'], ['lane', 'type', 'champion'],
      ['type', 'champion', 'lane'], ['type', 'lane', 'champion'],
    ];
    orders.forEach((order) => {
      let state = start(2);
      order.forEach((category) => { state = select(state, category, { champion: 'Ahri', lane: 'Mid', type: 'AP' }[category]); });
      expect(state.current).toMatchObject({ champion: 'Ahri', lane: 'Mid', type: 'AP' });
      expect(select(state, 'lane', 'Top', true)).toBe(state);
      expect(draftReducer(state, { type: 'next' }).picks).toHaveLength(1);
    });
  });

  it.each(['none', 'allow', 'all'] as const)('enforces the %s Random build type setting', (randomBuildType) => {
    const state = draftReducer(createDraftState(), { type: 'start', settings: { manualSelections: 2, randomBuildType } });
    expect(availableDraftValues('type', [], randomBuildType)).toEqual(
      randomBuildType === 'all' ? ['Random'] : randomBuildType === 'allow' ? ['AD', 'AP', 'Tank', 'Random'] : ['AD', 'AP', 'Tank'],
    );
    expect(select(state, 'type', 'Random') === state).toBe(randomBuildType === 'none');
    expect(select(state, 'type', 'AD') === state).toBe(randomBuildType === 'all');
  });

  it('rejects unknown values, duplicate lanes, and duplicate champions', () => {
    let state = start();
    expect(select(state, 'lane', 'Middle')).toBe(state);
    expect(select(state, 'champion', 'Not a champion')).toBe(state);
    state = draftReducer(complete(state), { type: 'next' });
    expect(select(state, 'lane', state.picks[0].lane)).toBe(state);
    expect(select(state, 'champion', state.picks[0].champion)).toBe(state);
  });

  it('finishes exactly five complete picks and allows skipping builds', () => {
    let state = start();
    for (let i = 0; i < 5; i++) state = draftReducer(complete(state), { type: 'next' });
    expect(state.phase).toBe('finished');
    expect(new Set(state.picks.map((pick) => pick.lane))).toEqual(new Set(RANDODRAFT_LANES));
    expect(new Set(state.picks.map((pick) => pick.champion)).size).toBe(5);
    expect(draftReducer(state, { type: 'next' })).toBe(state);
    expect(draftReducer(state, { type: 'lobby' }).phase).toBe('lobby');
    expect(draftReducer(state, { type: 'start', settings: state.settings }).picks).toEqual([]);
  });

  it('accepts builds only once after all categories and rejects invalid builds', () => {
    const state = complete(start());
    const champion = DRAFT_CHAMPIONS.find((entry) => entry.id === state.current.champion)!;
    const ids = generateDraftBuild(champion, 'AD', seededRandom(42));
    expect(draftReducer(start(), { type: 'build', itemIds: ids }).current.build).toBeNull();
    expect(draftReducer(state, { type: 'build', itemIds: Array(6).fill(ids[0]) })).toBe(state);
    const built = draftReducer(state, { type: 'build', itemIds: ids });
    expect(built.current.build).toEqual(ids);
    expect(draftReducer(built, { type: 'build', itemIds: ids })).toBe(built);
  });
});

describe('Randodraft item catalogue and build legality', () => {
  it('has the full pinned roster and unique equipment IDs', () => {
    expect(DRAFT_CHAMPIONS).toHaveLength(173);
    expect(new Set(DRAFT_CHAMPIONS.map((champion) => champion.id)).size).toBe(DRAFT_CHAMPIONS.length);
    expect(new Set(DRAFT_ITEMS.map((item) => item.id)).size).toBe(DRAFT_ITEMS.length);
    expect(DRAFT_ITEMS.every((item) => Number(item.id) < 10000 && (item.boots || item.types.length))).toBe(true);
    expect(DRAFT_ITEMS.some((item) => /potion|elixir|ward|trinket/i.test(item.name))).toBe(false);
  });

  it('generates valid builds for every champion and type across multiple seeds', () => {
    for (const champion of DRAFT_CHAMPIONS) {
      for (const type of RANDODRAFT_TYPES) {
        for (let seed = 1; seed <= 8; seed++) {
          const ids = generateDraftBuild(champion, type, seededRandom(seed));
          expect(ids).toHaveLength(6);
          expect(isValidDraftBuild(ids, champion, type)).toBe(true);
          const items = ids.map((id) => DRAFT_ITEMS.find((item) => item.id === id)!);
          expect(items.filter((item) => item.boots)).toHaveLength(1);
          expect(items.every((item) => type === 'Random' || item.boots || item.types.includes(type))).toBe(true);
          const groups = items.flatMap((item) => item.groups);
          expect(new Set(groups).size).toBe(groups.length);
        }
      }
    }
  });

  it('enforces actual attack identities and permits Rapid Firecannon on ranged champions', () => {
    const melee = DRAFT_CHAMPIONS.find((champion) => champion.id === 'Aatrox')!;
    const ranged = DRAFT_CHAMPIONS.find((champion) => champion.id === 'Ashe')!;
    const shapeshifter = DRAFT_CHAMPIONS.find((champion) => champion.id === 'Jayce')!;
    const hurricane = DRAFT_ITEMS.find((item) => item.id === '3085')!;
    const firecannon = DRAFT_ITEMS.find((item) => item.id === '3094')!;
    expect(canAddDraftItem(hurricane, melee, 'AD', [])).toBe(false);
    expect(canAddDraftItem(hurricane, ranged, 'AD', [])).toBe(true);
    expect(canAddDraftItem(hurricane, shapeshifter, 'AD', [])).toBe(true);
    expect(canAddDraftItem(firecannon, ranged, 'AD', [])).toBe(true);
  });

  it.each([
    ['3074', '3748', 'AD'], // Hydra
    ['3156', '3053', 'AD'], // Lifeline
    ['3033', '3036', 'AD'], // Last Whisper
    ['3135', '3137', 'AP'], // Void penetration
    ['3119', '2526', 'Tank'], // Tear
    ['3006', '3111', 'AD'], // Boots, including the type exemption
  ] as const)('prevents conflicting equipment %s + %s', (firstId, secondId, type) => {
    const first = DRAFT_ITEMS.find((item) => item.id === firstId)!;
    const second = DRAFT_ITEMS.find((item) => item.id === secondId)!;
    expect(canAddDraftItem(second, DRAFT_CHAMPIONS[0], type, [first])).toBe(false);
  });
});
