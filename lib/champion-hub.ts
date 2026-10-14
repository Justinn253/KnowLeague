import championAbilityDetailsCatalogue from '@/data/catalogs/champion-ability-details.json';
import championHubOverviewCatalogue from '@/data/catalogs/champion-hub-overviews.json';

export type ChampionHubAbility = {
  id: string;
  slot: 'Passive' | 'Q' | 'W' | 'E' | 'R';
  name: string;
  description: string;
  imageUrl: string;
};

export type ChampionHubGameplayStat = {
  label: string;
  value: string;
  kind: 'health' | 'resource' | 'healthRegen' | 'resourceRegen' | 'armor' | 'attackDamage' | 'magicResist' | 'criticalDamage' | 'moveSpeed' | 'attackRange' | 'attackSpeed' | 'windup';
};

export type ChampionHubGameplayStatGroup = {
  title: string;
  stats: readonly ChampionHubGameplayStat[];
};

export type ChampionHubGameplayAbility = {
  abilityId: ChampionHubAbility['id'];
  summary: string;
  facts?: readonly {
    label: string;
    value: string;
  }[];
  effects?: readonly {
    label: string;
    value: string;
    detail?: string;
  }[];
  /** Full client-tooltip detail generated into the local Champion Hub catalogue. */
  detail?: ChampionHubGameplayAbilityDetail;
};

export type ChampionHubGameplayAbilityDetail = {
  paragraphs: readonly string[];
  notes: readonly string[];
  progression: readonly {
    label: string;
    values: readonly string[];
  }[];
};

export type ChampionHubGameplayDetails = {
  levelLabel: string;
  statGroups: readonly ChampionHubGameplayStatGroup[];
  abilities: readonly ChampionHubGameplayAbility[];
  /** Display summaries are maintained catalogue content, rather than parsed in the client at runtime. */
  source: {
    label: string;
    url: string;
  };
};

type ChampionAbilityDetailsCatalogue = {
  patch: string;
  sources: readonly string[];
  champions: Record<string, {
    abilities: readonly (ChampionHubGameplayAbilityDetail & { abilityId: string })[];
  }>;
};

const clientAbilityDetails = championAbilityDetailsCatalogue as unknown as ChampionAbilityDetailsCatalogue;

function clientAbilityDetail(championSlug: string, abilityId: ChampionHubAbility['id']) {
  const record = clientAbilityDetails.champions[championSlug]?.abilities.find((ability) => ability.abilityId === abilityId);
  if (!record) throw new Error(`Missing generated gameplay detail for ${championSlug}/${abilityId}`);

  const { abilityId: _abilityId, ...detail } = record;
  return detail;
}

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

export const CHAMPION_HUB_SKIN_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Exalted', 'Transcendent'] as const;
export type ChampionHubSkinRarity = (typeof CHAMPION_HUB_SKIN_RARITIES)[number];

export const RIOT_CLIENT_SKIN_RARITIES = ['kNoRarity', 'kRare', 'kEpic', 'kLegendary', 'kMythic', 'kUltimate', 'kExalted', 'kTranscendent'] as const;
export type RiotClientSkinRarity = (typeof RIOT_CLIENT_SKIN_RARITIES)[number];

const RIOT_CLIENT_RARITY_TO_TIER: Record<RiotClientSkinRarity, ChampionHubSkinRarity> = {
  kNoRarity: 'Common',
  kRare: 'Rare',
  kEpic: 'Epic',
  kLegendary: 'Legendary',
  kMythic: 'Mythic',
  kUltimate: 'Ultimate',
  kExalted: 'Exalted',
  kTranscendent: 'Transcendent',
};

function championHubSkinRarity(riotRarity: RiotClientSkinRarity) {
  return RIOT_CLIENT_RARITY_TO_TIER[riotRarity];
}

export type ChampionHubSkinChroma = {
  id: string;
  name: string;
  imageUrl: string;
  modelViewerUrl?: string;
};

export type ChampionHubSkin = {
  id: string;
  name: string;
  splashUrl: string;
  releaseDate: string;
  price: string;
  availability: string;
  skinLine: string;
  /** Exact rarity identifier supplied by Riot's League client data. */
  riotRarity: RiotClientSkinRarity;
  rarity: ChampionHubSkinRarity;
  modelViewerUrl: string;
  /** Exact cosmetic description published in Riot client data; omit when none is available. */
  officialLore?: string;
  chromas: readonly ChampionHubSkinChroma[];
};

export type ChampionHubSkinCatalogueStatus = 'complete' | 'coming-soon';

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
  gameplayDetails: ChampionHubGameplayDetails;
  /** Keeps incomplete cosmetic data out of the live Skins experience. */
  skinCatalogueStatus: ChampionHubSkinCatalogueStatus;
  skins: readonly ChampionHubSkin[];
  abilities: readonly ChampionHubAbility[];
  eternals: readonly ChampionHubEternal[];
  eternalsSource: {
    label: string;
    url: string;
  };
};

/** Minimal directory payload; do not send full lore and ability data to the searchable client grid. */
export type ChampionHubDirectoryChampion = Pick<
  ChampionHubChampion,
  'id' | 'slug' | 'name' | 'title' | 'searchTerms' | 'splashUrl' | 'role' | 'lane' | 'classes' | 'lanes'
>;

type ChampionHubOverviewCatalogue = {
  patch: string;
  sources: {
    dataDragon: string;
    officialChampionPages: string;
  };
  champions: readonly {
    id: string;
    slug: string;
    name: string;
    title: string;
    tags: readonly string[];
    lanes: readonly ChampionHubLane[];
    lore: string;
    officialUrl: string;
    portraitUrl: string;
    splashUrl: string;
    info: {
      attack: number;
      defense: number;
      magic: number;
      difficulty: number;
    };
    abilities: readonly ChampionHubAbility[];
  }[];
};

type ChampionHubOverviewPresentation = Pick<ChampionHubChampion, 'damageType' | 'primaryCombatStyle' | 'difficulty' | 'playstyle'>;

const championHubOverview = championHubOverviewCatalogue as unknown as ChampionHubOverviewCatalogue;

/** Preserve the existing reviewed profile presentation where the generic source inference is not nuanced enough. */
const OVERVIEW_PRESENTATION_OVERRIDES: Partial<Record<string, ChampionHubOverviewPresentation>> = {
  ahri: {
    damageType: 'Magic',
    primaryCombatStyle: 'Abilities',
    difficulty: 'Moderate',
    playstyle: { damage: 3, durability: 1, crowdControl: 2, mobility: 3, utility: 2 },
  },
  akali: {
    damageType: 'Mixed',
    primaryCombatStyle: 'Abilities',
    difficulty: 'High',
    playstyle: { damage: 3, durability: 1, crowdControl: 1, mobility: 3, utility: 1 },
  },
  akshan: {
    damageType: 'Physical',
    primaryCombatStyle: 'Basic attacks',
    difficulty: 'High',
    playstyle: { damage: 3, durability: 1, crowdControl: 1, mobility: 3, utility: 2 },
  },
  alistar: {
    damageType: 'Magic',
    primaryCombatStyle: 'Abilities',
    difficulty: 'Moderate',
    playstyle: { damage: 1, durability: 3, crowdControl: 3, mobility: 2, utility: 3 },
  },
};

function isChampionHubClass(value: string): value is ChampionHubClass {
  return (CHAMPION_HUB_CLASSES as readonly string[]).includes(value);
}

function playstyleTier(value: number): 1 | 2 | 3 {
  if (value >= 7) return 3;
  if (value >= 4) return 2;
  return 1;
}

function inferredOverviewPresentation(champion: ChampionHubOverviewCatalogue['champions'][number], classes: readonly ChampionHubClass[]): ChampionHubOverviewPresentation {
  const usesMagic = champion.info.magic >= champion.info.attack + 3;
  const usesPhysical = champion.info.attack >= champion.info.magic + 3;
  const isSupport = classes.includes('Support');
  const isTank = classes.includes('Tank');
  const isAssassin = classes.includes('Assassin');
  const isMage = classes.includes('Mage');
  const isFighter = classes.includes('Fighter');
  const isMarksman = classes.includes('Marksman');

  return {
    damageType: usesMagic ? 'Magic' : usesPhysical ? 'Physical' : 'Mixed',
    primaryCombatStyle: isMarksman || (usesPhysical && isFighter && !isMage) ? 'Basic attacks' : 'Abilities',
    difficulty: champion.info.difficulty >= 7 ? 'High' : champion.info.difficulty >= 4 ? 'Moderate' : 'Low',
    playstyle: {
      damage: playstyleTier(Math.max(champion.info.attack, champion.info.magic)),
      durability: playstyleTier(champion.info.defense),
      crowdControl: isSupport || isTank ? 3 : isMage || isFighter ? 2 : 1,
      mobility: isAssassin ? 3 : isMage || isFighter || isMarksman ? 2 : 1,
      utility: isSupport ? 3 : isTank || isMage || isFighter ? 2 : 1,
    },
  };
}

/**
 * The overview catalogue deliberately owns only the shared overview baseline. Skins,
 * Eternals, and client-tooltip gameplay details retain their own audited
 * catalogues and remain unavailable until each has complete source coverage.
 */
const OVERVIEW_CHAMPION_PROFILES: readonly ChampionHubChampion[] = championHubOverview.champions
  .filter((champion) => champion.slug !== 'aatrox')
  .map((champion) => {
    const classes = champion.tags.filter(isChampionHubClass);
    const presentation = {
      ...inferredOverviewPresentation(champion, classes),
      ...OVERVIEW_PRESENTATION_OVERRIDES[champion.slug],
    };

    if (!classes.length || !champion.lanes.length || champion.abilities.length !== 5) {
      throw new Error(`Incomplete Champion Hub overview profile for ${champion.slug}.`);
    }

    return {
      id: champion.slug,
      slug: champion.slug,
      name: champion.name,
      title: champion.title,
      searchTerms: [...classes, ...champion.lanes, champion.id],
      portraitUrl: champion.portraitUrl,
      splashUrl: champion.splashUrl,
      officialUrl: champion.officialUrl,
      role: classes.join(' / '),
      lane: champion.lanes.join(' / '),
      classes,
      lanes: champion.lanes,
      difficulty: presentation.difficulty,
      damageType: presentation.damageType,
      primaryCombatStyle: presentation.primaryCombatStyle,
      lore: champion.lore,
      loreSource: {
        label: 'Official League of Legends champion page',
        url: champion.officialUrl,
      },
      playstyle: presentation.playstyle,
      gameplayDetails: {
        levelLabel: 'Gameplay details coming soon',
        statGroups: [],
        abilities: [],
        source: {
          label: `Data Dragon ${championHubOverview.patch} overview snapshot`,
          url: championHubOverview.sources.dataDragon,
        },
      },
      skinCatalogueStatus: 'coming-soon',
      skins: [],
      abilities: champion.abilities,
      eternals: [],
      eternalsSource: {
        label: 'Eternals catalogue coming soon',
        url: champion.officialUrl,
      },
    };
  });

const AATROX_MODEL_VIEWER_BASE_URL = 'https://modelviewer.lol/model-viewer?id=';
const AATROX_CHROMA_IMAGE_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-chroma-images/266';

function aatroxModelViewerUrl(id: string) {
  return `${AATROX_MODEL_VIEWER_BASE_URL}${id}`;
}

function aatroxChroma(id: string, name: string): ChampionHubSkinChroma {
  return {
    id,
    name,
    imageUrl: `${AATROX_CHROMA_IMAGE_BASE_URL}/${id}.png`,
    modelViewerUrl: aatroxModelViewerUrl(id),
  };
}

/**
 * Aatrox cosmetics are a local, curated snapshot of Riot client data. They
 * deliberately live beside the presentation layer so Champion Hub never
 * fetches third-party catalogues while a visitor is browsing a skin.
 */
const AATROX_SKINS: readonly ChampionHubSkin[] = [
  {
    id: '266000',
    name: 'Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg',
    releaseDate: '2013-06-12',
    price: 'Included',
    availability: 'Available',
    skinLine: 'Original',
    riotRarity: 'kNoRarity',
    rarity: championHubSkinRarity('kNoRarity'),
    modelViewerUrl: aatroxModelViewerUrl('266000'),
    chromas: [],
  },
  {
    id: '266001',
    name: 'Justicar Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_1.jpg',
    releaseDate: '2013-06-12',
    price: '975 RP',
    availability: 'Available',
    skinLine: 'Arclight',
    riotRarity: 'kNoRarity',
    rarity: championHubSkinRarity('kNoRarity'),
    modelViewerUrl: aatroxModelViewerUrl('266001'),
    officialLore: 'Chief among the Arclight stand the Justicars, sentinels who serve as living embodiments of justice and order. Aatrox embodies power, for it is his martial prowess that holds the chaos back.',
    chromas: [],
  },
  {
    id: '266002',
    name: 'Mecha Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_2.jpg',
    releaseDate: '2014-07-23',
    price: '1350 RP',
    availability: 'Available',
    skinLine: 'Mecha',
    riotRarity: 'kEpic',
    rarity: championHubSkinRarity('kEpic'),
    modelViewerUrl: aatroxModelViewerUrl('266002'),
    officialLore: 'Designated ATRX-1, the “Mecha Aatrox” unit was developed in response to \'gliding\' kaiju with the capability of limited flight. In addition, ATRX-1 wields a thermal blade that can turn residual light particles into a heated cutting edge. ',
    chromas: [
      aatroxChroma('266004', 'Obsidian'),
      aatroxChroma('266005', 'Pearl'),
      aatroxChroma('266006', 'Tanzanite'),
    ],
  },
  {
    id: '266003',
    name: 'Sea Hunter Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_3.jpg',
    releaseDate: '2015-07-22',
    price: '750 RP',
    availability: 'Available',
    skinLine: 'Bilgewater: Burning Tides',
    riotRarity: 'kNoRarity',
    rarity: championHubSkinRarity('kNoRarity'),
    modelViewerUrl: aatroxModelViewerUrl('266003'),
    officialLore: 'Bilgewater is home to many bounty hunters, but those looking to track a target through hundreds of miles of open ocean go to the hulking creature known as Aatrox. Cool, professional, and capable of rapidly regenerating from near-fatal wounds, with Aatrox you\'ll always know your bounty is in good hands.',
    chromas: [],
  },
  {
    id: '266007',
    name: 'Blood Moon Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_7.jpg',
    releaseDate: '2019-01-10',
    price: '1350 RP',
    availability: 'Available',
    skinLine: 'Blood Moon',
    riotRarity: 'kEpic',
    rarity: championHubSkinRarity('kEpic'),
    modelViewerUrl: aatroxModelViewerUrl('266007'),
    officialLore: 'Ancient manuscripts tracking the orbit of the Blood Moon describe it not as celestial phenomenon, but as a cosmic womb. As the seasons grow shorter and the cult\'s activity continues to increase, some worry it will give birth to a new kind of demon—a creature helping to bring about its own dark ascendance.',
    chromas: [aatroxChroma('266040', 'Paragon')],
  },
  {
    id: '266008',
    name: 'Prestige Blood Moon Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_8.jpg',
    releaseDate: '2019-01-10',
    price: '100 Mythic Essence',
    availability: 'Limited',
    skinLine: 'Blood Moon',
    riotRarity: 'kMythic',
    rarity: championHubSkinRarity('kMythic'),
    modelViewerUrl: aatroxModelViewerUrl('266008'),
    officialLore: 'Aatrox has been loosed upon the mortal plane. A creature born in the heart of the Blood Moon, he is the progenitor of all demons, and a malignant darkness that will consume the entire world.',
    chromas: [],
  },
  {
    id: '266009',
    name: 'Victorious Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_9.jpg',
    releaseDate: '2019-11-21',
    price: '2019 ranked reward',
    availability: 'Limited',
    skinLine: 'Victorious',
    riotRarity: 'kRare',
    rarity: championHubSkinRarity('kRare'),
    modelViewerUrl: aatroxModelViewerUrl('266009'),
    officialLore: 'Victorious Aatrox was awarded to players who reached Gold or higher in the 2019 season. With arm and sword sculpted from crystal quartz, he stands as a monument to all who wish to achieve greatness.',
    chromas: [aatroxChroma('266010', 'Amber')],
  },
  {
    id: '266011',
    name: 'Odyssey Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_11.jpg',
    releaseDate: '2020-10-15',
    price: '1350 RP',
    availability: 'Available',
    skinLine: 'Odyssey',
    riotRarity: 'kEpic',
    rarity: championHubSkinRarity('kEpic'),
    modelViewerUrl: aatroxModelViewerUrl('266011'),
    officialLore: 'Aatrox is a violent and notorious crime lord whose name is feared throughout the criminal underworld. He is also disfigured by Ora abuse. Seeking to purge the substance from his body, he abducts Templars to extract it—and kills them when they are unable to do so. He has seized a number of high ranking Templar priests in order to draw out Karma, who he believes will finally heal him.',
    chromas: [
      aatroxChroma('266012', 'Ruby'),
      aatroxChroma('266013', 'Citrine'),
      aatroxChroma('266014', 'Turquoise'),
      aatroxChroma('266015', 'Sapphire'),
      aatroxChroma('266016', 'Emerald'),
      aatroxChroma('266017', 'Rose Quartz'),
      aatroxChroma('266018', 'Rainbow'),
      aatroxChroma('266019', 'Merc'),
    ],
  },
  {
    id: '266020',
    name: 'Prestige Blood Moon Aatrox (2022)',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_20.jpg',
    releaseDate: '2022-04-01',
    price: '125 Mythic Essence',
    availability: 'Legacy',
    skinLine: 'Blood Moon',
    riotRarity: 'kMythic',
    rarity: championHubSkinRarity('kMythic'),
    modelViewerUrl: aatroxModelViewerUrl('266020'),
    officialLore: 'Aatrox has been loosed upon the mortal plane. A creature born in the heart of the Blood Moon, he is the progenitor of all demons, and a malignant darkness that will consume the entire world.',
    chromas: [],
  },
  {
    id: '266021',
    name: 'Lunar Eclipse Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_21.jpg',
    releaseDate: '2022-04-28',
    price: '1350 RP',
    availability: 'Available',
    skinLine: 'Eclipse',
    riotRarity: 'kEpic',
    rarity: championHubSkinRarity('kEpic'),
    modelViewerUrl: aatroxModelViewerUrl('266021'),
    officialLore: 'One of the few who took up the mantle of the Eclipse Knights in the days of old, Aatrox hopelessly pined for Kayle\'s affections… but she could only ever love the blazing sun. When she devoured it, the entity\'s lunar corona consumed him. He exists now as Kayle\'s monstrous, once-noble shadow, ever at her side.',
    chromas: [
      aatroxChroma('266022', 'Ruby'),
      aatroxChroma('266023', 'Citrine'),
      aatroxChroma('266024', 'Emerald'),
      aatroxChroma('266025', 'Turquoise'),
      aatroxChroma('266026', 'Rose Quartz'),
      aatroxChroma('266027', 'Tanzanite'),
      aatroxChroma('266028', 'Obsidian'),
      aatroxChroma('266029', 'Rainbow'),
    ],
  },
  {
    id: '266030',
    name: 'DRX Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_30.jpg',
    releaseDate: '2023-06-01',
    price: '1350 RP',
    availability: 'Legacy',
    skinLine: 'World Champions: 2022',
    riotRarity: 'kEpic',
    rarity: championHubSkinRarity('kEpic'),
    modelViewerUrl: aatroxModelViewerUrl('266030'),
    officialLore: "Honoring Kingen's winning performance as Aatrox during the 2022 World Championship.",
    chromas: [aatroxChroma('266032', 'Elite')],
  },
  {
    id: '266031',
    name: 'Prestige DRX Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_31.jpg',
    releaseDate: '2023-06-01',
    price: '125 Mythic Essence',
    availability: 'Legacy',
    skinLine: 'World Champions: 2022',
    riotRarity: 'kMythic',
    rarity: championHubSkinRarity('kMythic'),
    modelViewerUrl: aatroxModelViewerUrl('266031'),
    officialLore: "Aatrox is DRX's #1 fan, and he's got the goods to prove it, turning heads with his blue-and-white nod to the South Korean superstars. DRX and T1 supporters alike line up at Worlds to take photos, but he won't let his newfound fame distract him. He's just there to watch his favorite team take home the Summoner's Cup.",
    chromas: [],
  },
  {
    id: '266033',
    name: 'Primordian Aatrox',
    splashUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_33.jpg',
    releaseDate: '2024-07-31',
    price: '1820 RP',
    availability: 'Available',
    skinLine: 'Anima Squad',
    riotRarity: 'kLegendary',
    rarity: championHubSkinRarity('kLegendary'),
    modelViewerUrl: aatroxModelViewerUrl('266033'),
    officialLore: 'When the Primordians first attacked, humanity was unprepared—until Anima Squad formed to become its last defense. But they are safe no longer, for the Primordians evolved in turn. Their apex being is called Aatrox, whose understanding of humanity only furthers his hatred. His flesh has no limits, his sword no mercy. He is the harbinger of Anima’s end.',
    chromas: [
      aatroxChroma('266034', 'Ruby'),
      aatroxChroma('266035', 'Catseye'),
      aatroxChroma('266036', 'Sapphire'),
      aatroxChroma('266037', 'Tanzanite'),
      aatroxChroma('266038', 'Emerald'),
      aatroxChroma('266039', 'Abyssal'),
    ],
  },
] as const;

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
    gameplayDetails: {
      levelLabel: 'Level 1 → 20',
      statGroups: [
        {
          title: 'Base statistics',
          stats: [
            { label: 'Health', value: '650 → 2,891.81', kind: 'health' },
            { label: 'Resource', value: 'N/A', kind: 'resource' },
            { label: 'Health regeneration', value: '3 → 12.83', kind: 'healthRegen' },
            { label: 'Resource regeneration', value: 'N/A', kind: 'resourceRegen' },
            { label: 'Armor', value: '38 → 132.39', kind: 'armor' },
            { label: 'Attack damage', value: '60 → 158.33', kind: 'attackDamage' },
            { label: 'Magic resistance', value: '32 → 72.33', kind: 'magicResist' },
            { label: 'Critical damage', value: '200%', kind: 'criticalDamage' },
            { label: 'Move speed', value: '345', kind: 'moveSpeed' },
            { label: 'Attack range', value: '175', kind: 'attackRange' },
          ],
        },
        {
          title: 'Attack speed',
          stats: [
            { label: 'Base attack speed', value: '0.651', kind: 'attackSpeed' },
            { label: 'Windup', value: '19.737%', kind: 'windup' },
            { label: 'Attack speed ratio', value: '0.651', kind: 'attackSpeed' },
            { label: 'Bonus attack speed', value: '0 → 49.16%', kind: 'attackSpeed' },
          ],
        },
      ],
      abilities: [
        {
          abilityId: 'deathbringer-stance',
          summary: 'Aatrox periodically empowers his next basic attack, dealing bonus damage based on the target’s maximum health and healing himself.',
          detail: clientAbilityDetail('aatrox', 'deathbringer-stance'),
        },
        {
          abilityId: 'the-darkin-blade',
          summary: 'Aatrox swings his greatsword up to three times. Each cast has a distinct area, while sweetspots deal increased damage and briefly knock enemies up.',
          detail: clientAbilityDetail('aatrox', 'the-darkin-blade'),
        },
        {
          abilityId: 'infernal-chains',
          summary: 'Aatrox fires chains that slow the first enemy hit. Champions and large monsters that fail to leave the impact area are pulled back to its center.',
          detail: clientAbilityDetail('aatrox', 'infernal-chains'),
        },
        {
          abilityId: 'umbral-dash',
          summary: 'Aatrox dashes in a chosen direction and passively restores health when he damages enemy champions.',
          detail: clientAbilityDetail('aatrox', 'umbral-dash'),
        },
        {
          abilityId: 'world-ender',
          summary: 'Aatrox unleashes his true form, gaining movement speed, attack damage, and increased self-healing. Champion takedowns extend the transformation.',
          detail: clientAbilityDetail('aatrox', 'world-ender'),
        },
      ],
      source: {
        label: 'CommunityDragon client-data snapshot 14.24',
        url: clientAbilityDetails.sources[0],
      },
    },
    skinCatalogueStatus: 'complete',
    skins: AATROX_SKINS,
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
  ...OVERVIEW_CHAMPION_PROFILES,
] as const;

export const CHAMPION_HUB_BY_SLUG = new Map(
  CHAMPION_HUB_CHAMPIONS.map((champion) => [champion.slug, champion]),
);

export function getChampionHubChampion(slug: string) {
  return CHAMPION_HUB_BY_SLUG.get(slug.toLowerCase());
}

/** Prevents unfinished baseline profiles from rendering an empty Gameplay Details page. */
export function hasChampionGameplayDetails(champion: ChampionHubChampion) {
  return champion.gameplayDetails.statGroups.length > 0 && champion.gameplayDetails.abilities.length > 0;
}

export function getChampionHubChampions() {
  return [...CHAMPION_HUB_CHAMPIONS].sort((left, right) => left.name.localeCompare(right.name));
}

export function getChampionHubDirectoryChampions(): readonly ChampionHubDirectoryChampion[] {
  return getChampionHubChampions().map((champion) => ({
    id: champion.id,
    slug: champion.slug,
    name: champion.name,
    title: champion.title,
    searchTerms: champion.searchTerms,
    splashUrl: champion.splashUrl,
    role: champion.role,
    lane: champion.lane,
    classes: champion.classes,
    lanes: champion.lanes,
  }));
}

/** Resolve direct skin links safely, falling back to the champion's base skin. */
export function getChampionHubSkin(champion: ChampionHubChampion, skinId?: string | null) {
  return champion.skins.find((skin) => skin.id === skinId) ?? champion.skins[0];
}
