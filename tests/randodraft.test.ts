import { describe, expect, it } from 'vitest';
import {
  availableDraftValues, canAddDraftItem, createDraftState, DRAFT_CHAMPIONS, DRAFT_ITEMS,
  draftReducer, generateDraftBuild, isCompletePick, isValidDraftBuild, RANDODRAFT_LANES, RANDODRAFT_TYPES,
  type DraftCategory, type DraftSettings, type DraftState,
} from '@/lib/randodraft';

function start(manualSelections: DraftSettings['manualSelections'] = 0) {
  return draftReducer(createDraftState(), { type: 'start', settings: { gameMode: 'summoners-rift', manualSelections, randomBuildType: 'none' } });
}
function select(state: DraftState, category: DraftCategory, value: string, manual = false) {
  return draftReducer(state, { type: 'select', category, value, manual });
}
function complete(state: DraftState) {
  return select(select(select(state, 'champion', availableDraftValues('champion', state.picks)[0]), 'lane', availableDraftValues('lane', state.picks)[0]!), 'type', 'Marksman');
}
function build(state: DraftState) {
  const champion = DRAFT_CHAMPIONS.find((entry) => entry.id === state.current.champion)!;
  return draftReducer(state, { type: 'build', itemIds: generateDraftBuild(champion, state.current.type!, seededRandom(42)) });
}
function seededRandom(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

describe('Randodraft draft rules', () => {
  it('starts with every category spun and standard build types', () => {
    expect(createDraftState().settings).toEqual({ gameMode: 'summoners-rift', manualSelections: 0, randomBuildType: 'none' });
    const state = start();
    expect(select(state, 'champion', 'Ahri', true)).toBe(state);
    expect(draftReducer(state, { type: 'next' })).toBe(state);
  });

  it.each([0, 1, 2] as const)('enforces a per-pick manual allowance of %s', (allowance) => {
    let state = start(allowance);
    const choices = [['type', 'Marksman'], ['lane', 'Top'], ['champion', 'Ahri']] as const;
    choices.forEach(([category, value], index) => {
      const previous = state;
      state = select(state, category, value, true);
      if (index >= allowance) expect(state).toBe(previous);
      else expect(state.current[category]).toBe(value);
    });
    state = complete(state);
    state = draftReducer(build(state), { type: 'next' });
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
      order.forEach((category) => { state = select(state, category, { champion: 'Ahri', lane: 'Mid', type: 'Mage' }[category]); });
      expect(state.current).toMatchObject({ champion: 'Ahri', lane: 'Mid', type: 'Mage' });
      expect(select(state, 'lane', 'Top', true)).toBe(state);
      expect(draftReducer(state, { type: 'next' })).toBe(state);
      expect(draftReducer(build(state), { type: 'next' }).picks).toHaveLength(1);
    });
  });

  it.each(['none', 'allow', 'all'] as const)('enforces the %s Random build type setting', (randomBuildType) => {
    const state = draftReducer(createDraftState(), { type: 'start', settings: { gameMode: 'summoners-rift', manualSelections: 2, randomBuildType } });
    expect(state.current.type).toBe(randomBuildType === 'all' ? 'Random' : null);
    expect(availableDraftValues('type', [], randomBuildType)).toEqual(
      randomBuildType === 'all' ? ['Random'] : randomBuildType === 'allow' ? ['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support', 'Random'] : ['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support'],
    );
    expect(select(state, 'type', 'Random') === state).toBe(randomBuildType !== 'allow');
    expect(select(state, 'type', 'Marksman') === state).toBe(randomBuildType === 'all');
  });


  it('keeps editable labels across picks, bounds names, and resets them for a new draft', () => {
    let state = draftReducer(start(), { type: 'rename', index: 0, name: '  Main   carry  ' });
    state = draftReducer(state, { type: 'rename', index: 1, name: 'Next pick' });
    state = draftReducer(build(complete(state)), { type: 'next' });
    expect(state.picks[0].name).toBe('Main carry');
    expect(state.pickNames[1]).toBe('Next pick');
    state = draftReducer(state, { type: 'rename', index: 0, name: 'Updated carry' });
    expect(state.picks[0].name).toBe('Updated carry');
    state = draftReducer(state, { type: 'rename', index: 2, name: 'x'.repeat(100) });
    expect(state.pickNames[2]).toHaveLength(32);
    expect(draftReducer(state, { type: 'rename', index: 5, name: 'Invalid' })).toBe(state);
    state = draftReducer(state, { type: 'rename', index: 2, name: ' ' });
    expect(state.pickNames[2]).toBe('Pick 3');
    expect(draftReducer(state, { type: 'start', settings: state.settings }).pickNames).toEqual(['Pick 1', 'Pick 2', 'Pick 3', 'Pick 4', 'Pick 5']);
  });

  it('rejects unknown values, duplicate lanes, and duplicate champions', () => {
    let state = start();
    expect(select(state, 'lane', 'Middle')).toBe(state);
    expect(select(state, 'champion', 'Not a champion')).toBe(state);
    state = draftReducer(build(complete(state)), { type: 'next' });
    expect(select(state, 'lane', state.picks[0].lane!)).toBe(state);
    expect(select(state, 'champion', state.picks[0].champion)).toBe(state);
  });

  it('finishes exactly five complete picks with required locked builds', () => {
    let state = start();
    for (let i = 0; i < 5; i++) state = draftReducer(build(complete(state)), { type: 'next' });
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
    const ids = generateDraftBuild(champion, 'Marksman', seededRandom(42));
    expect(draftReducer(start(), { type: 'build', itemIds: ids }).current.build).toBeNull();
    expect(draftReducer(state, { type: 'build', itemIds: Array(6).fill(ids[0]) })).toBe(state);
    expect(draftReducer(state, { type: 'next' })).toBe(state);
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

  it('uses Riot shop membership rather than inferring classes from stats', () => {
    const byId = (id: string) => DRAFT_ITEMS.find((item) => item.id === id)!;
    expect(byId('3078').types).toEqual(['Fighter']);
    expect(byId('3089').types).toEqual(['Mage']);
    expect(byId('3031').types).toEqual(['Marksman']);
    expect(byId('3190').types).toEqual(['Support', 'Tank']);
    expect(byId('6676').types).toEqual(['Marksman', 'Assassin']);
    const mapping: Record<number, string> = { 1: 'Fighter', 2: 'Marksman', 4: 'Assassin', 8: 'Tank', 16: 'Mage', 32: 'Support' };
    for (const item of DRAFT_ITEMS) {
      expect(item.types).toEqual([...new Set(item.shopAttributes.map((attribute) => mapping[attribute]))]);
    }
    expect(canAddDraftItem(byId('3078'), DRAFT_CHAMPIONS[0], 'Tank', [])).toBe(false);
  });

  it('supports five lane-free ARAM picks and ARAM item availability', () => {
    let state = draftReducer(createDraftState(), { type: 'start', settings: { gameMode: 'aram', manualSelections: 0, randomBuildType: 'none' } });
    expect(state.current.lane).toBeNull();
    expect(availableDraftValues('lane', state.picks, 'none', 'aram')).toEqual([]);
    for (let index = 0; index < 5; index++) {
      state = select(state, 'champion', availableDraftValues('champion', state.picks, 'none', 'aram')[0]);
      state = select(state, 'type', 'Mage');
      expect(isCompletePick(state.current, 'aram')).toBe(true);
      const champion = DRAFT_CHAMPIONS.find((entry) => entry.id === state.current.champion)!;
      const ids = generateDraftBuild(champion, state.current.type!, 'aram', seededRandom(index + 1));
      expect(ids.every((id) => DRAFT_ITEMS.find((item) => item.id === id)!.modes.includes('aram'))).toBe(true);
      state = draftReducer(state, { type: 'build', itemIds: ids });
      state = draftReducer(state, { type: 'next' });
    }
    expect(state.phase).toBe('finished');
    expect(state.picks).toHaveLength(5);
    expect(state.picks.every((pick) => pick.lane === null)).toBe(true);
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
    expect(canAddDraftItem(hurricane, melee, 'Marksman', [])).toBe(false);
    expect(canAddDraftItem(hurricane, ranged, 'Marksman', [])).toBe(true);
    expect(canAddDraftItem(hurricane, shapeshifter, 'Marksman', [])).toBe(true);
    expect(canAddDraftItem(firecannon, ranged, 'Marksman', [])).toBe(true);
  });

  it.each([
    ['3074', '3748', 'Fighter'], // Hydra
    ['3156', '3053', 'Fighter'], // Lifeline
    ['3033', '3036', 'Marksman'], // Last Whisper
    ['3135', '3137', 'Mage'], // Void penetration
    ['3119', '2526', 'Random'], // Tear
    ['3006', '3111', 'Marksman'], // Boots, including the type exemption
  ] as const)('prevents conflicting equipment %s + %s', (firstId, secondId, type) => {
    const first = DRAFT_ITEMS.find((item) => item.id === firstId)!;
    const second = DRAFT_ITEMS.find((item) => item.id === secondId)!;
    expect(canAddDraftItem(second, DRAFT_CHAMPIONS[0], type, [first])).toBe(false);
  });

  it('places boots in every possible slot across seeded builds', () => {
    const slots = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const ids = generateDraftBuild(DRAFT_CHAMPIONS[0], 'Fighter', seededRandom(seed));
      slots.add(ids.findIndex((id) => DRAFT_ITEMS.find((item) => item.id === id)!.boots));
    }
    expect([...slots].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
