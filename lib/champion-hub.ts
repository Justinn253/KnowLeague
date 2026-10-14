export type ChampionHubAbility = {
  id: string;
  slot: 'Passive' | 'Q' | 'W' | 'E' | 'R';
  name: string;
  description: string;
  imageUrl: string;
};

export const CHAMPION_HUB_CLASSES = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'] as const;
export type ChampionHubClass = (typeof CHAMPION_HUB_CLASSES)[number];

export const CHAMPION_HUB_LANES = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'] as const;
export type ChampionHubLane = (typeof CHAMPION_HUB_LANES)[number];

export type ChampionHubEternal = {
  series: string;
  milestones: readonly {
    name: string;
    description: string;
  }[];
};

export type ChampionHubPlaystyle = {
  damage: 1 | 2 | 3;
  durability: 1 | 2 | 3;
  crowdControl: 1 | 2 | 3;
  mobility: 1 | 2 | 3;
  utility: 1 | 2 | 3;
};

export type ChampionHubChampion = {
  id: string;
  slug: string;
  name: string;
  title: string;
  searchTerms: readonly string[];
  portraitUrl: string;
  splashUrl: string;
  officialUrl: string;
  role: string;
  lane: string;
  classes: readonly ChampionHubClass[];
  lanes: readonly ChampionHubLane[];
  difficulty: 'Low' | 'Moderate' | 'High';
  damageType: string;
  primaryCombatStyle: 'Abilities' | 'Basic attacks';
  lore: string;
  loreSource: {
    label: string;
    url: string;
  };
  playstyle: ChampionHubPlaystyle;
  abilities: readonly ChampionHubAbility[];
  eternals: readonly ChampionHubEternal[];
  eternalsSource: {
    label: string;
    url: string;
  };
};

/**
 * Hand-authored overview content for the Champion Hub. Game data that changes
 * every patch belongs in the generated catalogue; this layer is intentionally
 * reserved for durable explanatory copy and page presentation metadata.
 */
export const CHAMPION_HUB_CHAMPIONS: readonly ChampionHubChampion[] = [
  {
    id: 'aatrox',
    slug: 'aatrox',
    name: 'Aatrox',
    title: 'the Darkin Blade',
    searchTerms: ['darkin', 'blade', 'fighter', 'top'],
    portraitUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Aatrox.png',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg',
    officialUrl: 'https://www.leagueoflegends.com/en-us/champions/aatrox/',
    role: 'Fighter',
    lane: 'Top',
    classes: ['Fighter'],
    lanes: ['Top'],
    difficulty: 'High',
    damageType: 'Physical',
    primaryCombatStyle: 'Basic attacks',
    lore: 'Once honored defenders of Shurima against the Void, Aatrox and his brethren would eventually become an even greater threat to Runeterra, and were defeated only by cunning mortal sorcery. But after centuries of imprisonment, Aatrox was the first to find freedom once more, corrupting and transforming those foolish enough to try and wield the magical weapon that contained his essence. Now, with stolen flesh, he walks Runeterra in a brutal approximation of his previous form, seeking an apocalyptic and long overdue vengeance.',
    loreSource: {
      label: 'Official League of Legends champion page',
      url: 'https://www.leagueoflegends.com/en-us/champions/aatrox/',
    },
    playstyle: {
      damage: 3,
      durability: 3,
      crowdControl: 2,
      mobility: 2,
      utility: 2,
    },
    abilities: [
      {
        id: 'deathbringer-stance',
        slot: 'Passive',
        name: 'Deathbringer Stance',
        description: 'Periodically, Aatrox empowers his next basic attack to deal bonus physical damage based on the target’s maximum health and restore a portion of his health.',
        imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/passive/Aatrox_Passive.png',
      },
      {
        id: 'the-darkin-blade',
        slot: 'Q',
        name: 'The Darkin Blade',
        description: 'Aatrox slams his greatsword up to three times. Each strike deals physical damage, while enemies caught in the outer edge take heavier damage and are briefly knocked up.',
        imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/AatroxQ.png',
      },
      {
        id: 'infernal-chains',
        slot: 'W',
        name: 'Infernal Chains',
        description: 'Aatrox sends out chains that damage the first enemy hit. If they cannot leave the impact area in time, they are pulled back to its centre.',
        imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/AatroxW.png',
      },
      {
        id: 'umbral-dash',
        slot: 'E',
        name: 'Umbral Dash',
        description: 'Aatrox dashes in a chosen direction and passively heals for a portion of the damage he deals to enemy champions.',
        imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/AatroxE.png',
      },
      {
        id: 'world-ender',
        slot: 'R',
        name: 'World Ender',
        description: 'Aatrox reveals his true form, fearing nearby minions while gaining attack damage and amplified healing. Champion takedowns extend the transformation.',
        imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/AatroxR.png',
      },
    ],
    eternals: [
      {
        series: 'Series 1',
        milestones: [
          {
            name: 'Chains Yanked',
            description: 'Champions pulled with Infernal Chains (W).',
          },
          {
            name: "QQ's",
            description: 'Sweet spot hits on champions with The Darkin Blade (Q).',
          },
          {
            name: 'Worlds Ended',
            description: 'Champions killed during World Ender (R).',
          },
        ],
      },
      {
        series: 'Series 2',
        milestones: [
          {
            name: 'Blood Well',
            description: 'Healing from champions with Deathbringer Stance (P) and Umbral Dash (E).',
          },
          {
            name: 'Bloodthirsty General',
            description: 'Sweet spot hits on champions after using Umbral Dash (E) to reposition during The Darkin Blade (Q).',
          },
          {
            name: 'Duck and Slip',
            description: 'Skillshots dodged with Umbral Dash (E).',
          },
        ],
      },
    ],
    eternalsSource: {
      label: 'League of Legends Wiki',
      url: 'https://leagueoflegends.fandom.com/wiki/Aatrox/LoL/Cosmetics',
    },
  },
] as const;

export const CHAMPION_HUB_BY_SLUG = new Map(
  CHAMPION_HUB_CHAMPIONS.map((champion) => [champion.slug, champion]),
);

export function getChampionHubChampion(slug: string) {
  return CHAMPION_HUB_BY_SLUG.get(slug.toLowerCase());
}

export function getChampionHubChampions() {
  return [...CHAMPION_HUB_CHAMPIONS].sort((left, right) => left.name.localeCompare(right.name));
}
