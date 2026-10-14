import { describe, expect, it } from 'vitest';
import {
  getChampionHubChampion,
  getChampionHubChampions,
  getChampionHubDirectoryChampions,
  getChampionHubSkin,
  hasChampionGameplayDetails,
} from '@/lib/champion-hub';

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
    expect(aatrox?.skins[0]).toMatchObject({
      id: '266000',
      name: 'Aatrox',
      price: 'Included',
      modelViewerUrl: 'https://modelviewer.lol/model-viewer?id=266000',
    });
    expect(aatrox?.skins.find((skin) => skin.id === '266021')?.chromas).toHaveLength(8);
    expect(aatrox?.skins[0].officialLore).toBeUndefined();
    expect(aatrox?.skins.find((skin) => skin.id === '266001')?.officialLore).toBe(
      'Chief among the Arclight stand the Justicars, sentinels who serve as living embodiments of justice and order. Aatrox embodies power, for it is his martial prowess that holds the chaos back.',
    );
    expect(aatrox?.skins.find((skin) => skin.id === '266008')?.price).toBe('100 Mythic Essence');
    expect(aatrox?.skins.map(({ id, riotRarity, rarity }) => [id, riotRarity, rarity])).toEqual([
      ['266000', 'kNoRarity', 'Common'],
      ['266001', 'kNoRarity', 'Common'],
      ['266002', 'kEpic', 'Epic'],
      ['266003', 'kNoRarity', 'Common'],
      ['266007', 'kEpic', 'Epic'],
      ['266008', 'kMythic', 'Mythic'],
      ['266009', 'kRare', 'Rare'],
      ['266011', 'kEpic', 'Epic'],
      ['266020', 'kMythic', 'Mythic'],
      ['266021', 'kEpic', 'Epic'],
      ['266030', 'kEpic', 'Epic'],
      ['266031', 'kMythic', 'Mythic'],
      ['266033', 'kLegendary', 'Legendary'],
    ]);
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
    expect(aatrox?.gameplayDetails.levelLabel).toBe('Level 1 → 20');
    expect(aatrox?.gameplayDetails.statGroups.map((group) => group.title)).toEqual([
      'Base statistics',
      'Attack speed',
    ]);
    const darkinBlade = aatrox?.gameplayDetails.abilities.find((ability) => ability.abilityId === 'the-darkin-blade');
    expect(darkinBlade?.detail?.progression).toEqual(expect.arrayContaining([
      { label: 'Cooldown', values: ['14 sec', '12 sec', '10 sec', '8 sec', '6 sec'] },
      { label: 'Base damage', values: ['10', '25', '40', '55', '70'] },
      { label: 'Total AD ratio', values: ['60%', '67.5%', '75%', '82.5%', '90%'] },
    ]));
    expect(darkinBlade?.detail?.notes).toContain('Knock up duration against monsters is doubled.');
    expect(aatrox?.gameplayDetails.source).toEqual({
      label: 'CommunityDragon client-data snapshot 14.24',
      url: 'https://raw.communitydragon.org/14.24/game/data/characters/aatrox/aatrox.bin.json',
    });
    expect(hasChampionGameplayDetails(aatrox!)).toBe(true);
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

  it('returns the complete Overview and Skins catalogues alphabetically and safely ignores unknown slugs', () => {
    const champions = getChampionHubChampions();
    const directoryChampions = getChampionHubDirectoryChampions();
    const ahri = getChampionHubChampion('ahri');
    const akali = getChampionHubChampion('AKALI');
    const akshan = getChampionHubChampion('akshan');
    const alistar = getChampionHubChampion('alistar');
    const wukong = getChampionHubChampion('monkeyking');

    expect(champions).toHaveLength(173);
    expect(champions.slice(0, 5).map((champion) => champion.name)).toEqual(['Aatrox', 'Ahri', 'Akali', 'Akshan', 'Alistar']);
    expect(champions.slice(-5).map((champion) => champion.name)).toEqual(['Zeri', 'Ziggs', 'Zilean', 'Zoe', 'Zyra']);
    expect(new Set(champions.map((champion) => champion.slug)).size).toBe(champions.length);
    expect(champions.every((champion) => champion.lore && champion.abilities.length === 5 && champion.lanes.length > 0)).toBe(true);
    expect(directoryChampions).toHaveLength(champions.length);
    expect(directoryChampions[0]).not.toHaveProperty('lore');
    expect(directoryChampions[0]).not.toHaveProperty('abilities');
    expect(ahri).toMatchObject({
      slug: 'ahri',
      classes: ['Mage', 'Assassin'],
      lanes: ['Mid'],
      damageType: 'Magic',
      skinCatalogueStatus: 'complete',
    });
    expect(ahri?.loreSource).toEqual({
      label: 'Official League of Legends champion page',
      url: 'https://www.leagueoflegends.com/en-us/champions/ahri/',
    });
    expect(ahri?.abilities.map((ability) => ability.slot)).toEqual(['Passive', 'Q', 'W', 'E', 'R']);
    expect(ahri?.skins[0]).toMatchObject({
      id: '103000',
      name: 'Ahri',
      price: 'Included',
      rarity: 'Common',
    });
    expect(ahri?.skins.find((skin) => skin.id === '103001')).toMatchObject({
      name: 'Dynasty Ahri',
      price: '975 RP',
      officialLore: expect.any(String),
    });
    expect(champions.every((champion) => (
      champion.skinCatalogueStatus === 'complete'
      && champion.skins.length > 0
      && champion.skins[0].name === champion.name
      && champion.skins[0].price === 'Included'
    ))).toBe(true);
    expect(akali?.lanes).toEqual(['Top', 'Mid']);
    expect(akshan?.primaryCombatStyle).toBe('Basic attacks');
    expect(alistar?.playstyle).toEqual({ damage: 1, durability: 3, crowdControl: 3, mobility: 2, utility: 3 });
    expect(hasChampionGameplayDetails(ahri!)).toBe(false);
    expect(wukong).toMatchObject({
      name: 'Wukong',
      slug: 'monkeyking',
      officialUrl: 'https://www.leagueoflegends.com/en-us/champions/monkeyking/',
    });
    expect(getChampionHubChampion('not-a-champion')).toBeUndefined();
  });

  it('resolves direct skin links and defaults invalid selections to the base skin', () => {
    const aatrox = getChampionHubChampion('aatrox');
    const ahri = getChampionHubChampion('ahri');

    expect(aatrox).toBeDefined();
    expect(ahri).toBeDefined();
    expect(getChampionHubSkin(aatrox!, '266033').name).toBe('Primordian Aatrox');
    expect(getChampionHubSkin(aatrox!, 'does-not-exist').id).toBe('266000');
    expect(getChampionHubSkin(aatrox!).id).toBe('266000');
    expect(getChampionHubSkin(ahri!, '103001').name).toBe('Dynasty Ahri');
    expect(getChampionHubSkin(ahri!, 'does-not-exist').id).toBe('103000');
  });
});
