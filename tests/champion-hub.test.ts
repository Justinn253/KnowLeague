import { describe, expect, it } from 'vitest';
import { getChampionHubChampion, getChampionHubChampions } from '@/lib/champion-hub';

describe('Champion Hub catalogue', () => {
  it('exposes the initial Aatrox page through its stable slug', () => {
    const aatrox = getChampionHubChampion('AATROX');

    expect(aatrox).toMatchObject({
      id: 'aatrox',
      slug: 'aatrox',
      name: 'Aatrox',
      role: 'Fighter',
    });
    expect(aatrox?.classes).toEqual(['Fighter']);
    expect(aatrox?.lanes).toEqual(['Top']);
    expect(aatrox?.primaryCombatStyle).toBe('Basic attacks');
    expect(aatrox?.loreSource).toEqual({
      label: 'Official League of Legends champion page',
      url: 'https://www.leagueoflegends.com/en-us/champions/aatrox/',
    });
    expect(aatrox?.playstyle).toEqual({
      damage: 3,
      durability: 3,
      crowdControl: 2,
      mobility: 2,
      utility: 2,
    });
    expect(aatrox?.abilities.map((ability) => ability.slot)).toEqual(['Passive', 'Q', 'W', 'E', 'R']);
    expect(aatrox?.abilities.find((ability) => ability.slot === 'Q')?.name).toBe('The Darkin Blade');
    expect(aatrox?.eternals.flatMap((eternal) => eternal.milestones.map((milestone) => milestone.name))).toEqual([
      'Chains Yanked',
      "QQ's",
      'Worlds Ended',
      'Blood Well',
      'Bloodthirsty General',
      'Duck and Slip',
    ]);
  });

  it('returns an alphabetized catalogue and safely ignores unknown slugs', () => {
    const champions = getChampionHubChampions();

    expect(champions.map((champion) => champion.name)).toEqual(['Aatrox']);
    expect(getChampionHubChampion('not-a-champion')).toBeUndefined();
  });
});
