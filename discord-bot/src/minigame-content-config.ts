/**
 * Editable Discord minigame content and balance data.
 *
 * Change item names, rarities, sale values, resource values, and depth details
 * here. The gameplay catalogues validate and consume these records, and the
 * ignored tier-reference Markdown files are regenerated from the same data.
 */

type FishingRarityConfig = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
type FishingBiomeIdConfig = 'harbor' | 'warm-ocean' | 'hydroplant-reservoir' | 'sunken-sea' | 'kelp-forest' | 'crystaline-caverns' | 'rallypoint-delta';

type FishingCatchConfig = {
  biomeId: FishingBiomeIdConfig;
  id: string;
  maxSaleValue: number;
  minSaleValue: number;
  name: string;
  rarity: FishingRarityConfig;
  tags?: readonly string[];
};

/** One editable entry for every standard Fishing catch. Values are pre-bonus. */
export const FISHING_CATCH_CONFIG = [
  { biomeId: 'harbor', id: 'carp', name: 'Carp', rarity: 'Common', minSaleValue: 5, maxSaleValue: 8, tags: ['silver'] },
  { biomeId: 'harbor', id: 'bluegill', name: 'Bluegill', rarity: 'Common', minSaleValue: 5, maxSaleValue: 8, tags: ['silver'] },
  { biomeId: 'harbor', id: 'trout', name: 'Trout', rarity: 'Common', minSaleValue: 6, maxSaleValue: 9, tags: ['silver'] },
  { biomeId: 'harbor', id: 'salmon', name: 'Salmon', rarity: 'Uncommon', minSaleValue: 9, maxSaleValue: 13, tags: ['silver'] },
  { biomeId: 'harbor', id: 'bass', name: 'Bass', rarity: 'Uncommon', minSaleValue: 9, maxSaleValue: 13 },
  { biomeId: 'harbor', id: 'pike', name: 'Pike', rarity: 'Uncommon', minSaleValue: 10, maxSaleValue: 14 },
  { biomeId: 'harbor', id: 'piranha', name: 'Piranha', rarity: 'Rare', minSaleValue: 15, maxSaleValue: 22 },
  { biomeId: 'harbor', id: 'clownfish', name: 'Clownfish', rarity: 'Rare', minSaleValue: 15, maxSaleValue: 22 },
  { biomeId: 'harbor', id: 'tuna', name: 'Tuna', rarity: 'Rare', minSaleValue: 17, maxSaleValue: 24, tags: ['deep'] },
  { biomeId: 'harbor', id: 'turtle', name: 'Turtle', rarity: 'Epic', minSaleValue: 32, maxSaleValue: 45 },
  { biomeId: 'harbor', id: 'swordfish', name: 'Swordfish', rarity: 'Epic', minSaleValue: 35, maxSaleValue: 50, tags: ['deep'] },
  { biomeId: 'harbor', id: 'lionfish', name: 'Lionfish', rarity: 'Epic', minSaleValue: 34, maxSaleValue: 48 },
  { biomeId: 'harbor', id: 'alligator', name: 'Alligator', rarity: 'Legendary', minSaleValue: 100, maxSaleValue: 140 },
  { biomeId: 'harbor', id: 'shark', name: 'Shark', rarity: 'Legendary', minSaleValue: 110, maxSaleValue: 150, tags: ['deep'] },
  { biomeId: 'harbor', id: 'whale', name: 'Whale', rarity: 'Legendary', minSaleValue: 120, maxSaleValue: 165, tags: ['deep'] },
  { biomeId: 'harbor', id: 'giant-squid', name: 'Giant Squid', rarity: 'Legendary', minSaleValue: 115, maxSaleValue: 160, tags: ['deep'] },

  { biomeId: 'warm-ocean', id: 'ocean-fish', name: 'Fish', rarity: 'Common', minSaleValue: 8, maxSaleValue: 12 },
  { biomeId: 'warm-ocean', id: 'tropical-fish', name: 'Tropical Fish', rarity: 'Uncommon', minSaleValue: 14, maxSaleValue: 20 },
  { biomeId: 'warm-ocean', id: 'pufferfish', name: 'Pufferfish', rarity: 'Rare', minSaleValue: 26, maxSaleValue: 36 },
  { biomeId: 'warm-ocean', id: 'dolphin', name: 'Dolphin', rarity: 'Epic', minSaleValue: 60, maxSaleValue: 85 },
  { biomeId: 'warm-ocean', id: 'guardian', name: 'Guardian', rarity: 'Epic', minSaleValue: 65, maxSaleValue: 90 },
  { biomeId: 'warm-ocean', id: 'elder-guardian', name: 'Elder Guardian', rarity: 'Legendary', minSaleValue: 180, maxSaleValue: 250 },

  { biomeId: 'hydroplant-reservoir', id: 'antefish', name: 'Antefish', rarity: 'Common', minSaleValue: 15, maxSaleValue: 20 },
  { biomeId: 'hydroplant-reservoir', id: 'portal-fish', name: 'Portal Fish', rarity: 'Uncommon', minSaleValue: 25, maxSaleValue: 35 },
  { biomeId: 'hydroplant-reservoir', id: 'is-0098', name: 'IS0098', rarity: 'Rare', minSaleValue: 45, maxSaleValue: 65 },
  { biomeId: 'hydroplant-reservoir', id: 'darkwater-fish', name: 'Darkwater Fish', rarity: 'Epic', minSaleValue: 100, maxSaleValue: 145, tags: ['deep'] },
  { biomeId: 'hydroplant-reservoir', id: 'corruscating-portal-fish', name: 'Corruscating Portal Fish', rarity: 'Legendary', minSaleValue: 350, maxSaleValue: 500 },
  { biomeId: 'hydroplant-reservoir', id: 'amaranthic-is-0098', name: 'Amaranthic IS-0098', rarity: 'Legendary', minSaleValue: 360, maxSaleValue: 510 },
  { biomeId: 'hydroplant-reservoir', id: 'saxe-darkwater-fish', name: 'Saxe Darkwater Fish', rarity: 'Legendary', minSaleValue: 370, maxSaleValue: 520, tags: ['deep'] },
  { biomeId: 'hydroplant-reservoir', id: 'darkwater-beast', name: 'Darkwater Beast', rarity: 'Legendary', minSaleValue: 390, maxSaleValue: 550, tags: ['deep'] },

  { biomeId: 'sunken-sea', id: 'greenwave-loach', name: 'Greenwave Loach', rarity: 'Common', minSaleValue: 30, maxSaleValue: 45 },
  { biomeId: 'sunken-sea', id: 'prismatic-guppy', name: 'Prismatic Guppy', rarity: 'Uncommon', minSaleValue: 55, maxSaleValue: 75 },
  { biomeId: 'sunken-sea', id: 'clam', name: 'Clam', rarity: 'Rare', minSaleValue: 90, maxSaleValue: 130 },
  { biomeId: 'sunken-sea', id: 'eutrophic-ray', name: 'Eutrophic Ray', rarity: 'Rare', minSaleValue: 100, maxSaleValue: 140 },
  { biomeId: 'sunken-sea', id: 'ghost-bell', name: 'Ghost Bell', rarity: 'Epic', minSaleValue: 200, maxSaleValue: 300 },
  { biomeId: 'sunken-sea', id: 'prism-back', name: 'Prism-Back', rarity: 'Epic', minSaleValue: 220, maxSaleValue: 320 },
  { biomeId: 'sunken-sea', id: 'giant-clam', name: 'Giant Clam', rarity: 'Legendary', minSaleValue: 700, maxSaleValue: 1_000 },

  { biomeId: 'kelp-forest', id: 'jellyfish', name: 'Jellyfish', rarity: 'Common', minSaleValue: 50, maxSaleValue: 70 },
  { biomeId: 'kelp-forest', id: 'nematodes', name: 'Nematodes', rarity: 'Common', minSaleValue: 50, maxSaleValue: 70 },
  { biomeId: 'kelp-forest', id: 'groovy-jelly', name: 'Groovy Jelly', rarity: 'Uncommon', minSaleValue: 80, maxSaleValue: 115 },
  { biomeId: 'kelp-forest', id: 'aggressive-jelly', name: 'Aggressive Jelly', rarity: 'Rare', minSaleValue: 140, maxSaleValue: 200 },
  { biomeId: 'kelp-forest', id: 'seahorse', name: 'Seahorse', rarity: 'Epic', minSaleValue: 320, maxSaleValue: 450 },
  { biomeId: 'kelp-forest', id: 'king-jelly', name: 'King Jelly', rarity: 'Epic', minSaleValue: 340, maxSaleValue: 470 },
  { biomeId: 'kelp-forest', id: 'spongebob', name: 'Spongebob', rarity: 'Legendary', minSaleValue: 1_150, maxSaleValue: 1_600 },
  { biomeId: 'kelp-forest', id: 'squidward', name: 'Squidward', rarity: 'Legendary', minSaleValue: 1_150, maxSaleValue: 1_600 },
  { biomeId: 'kelp-forest', id: 'patrick', name: 'Patrick', rarity: 'Legendary', minSaleValue: 1_200, maxSaleValue: 1_650 },
  { biomeId: 'kelp-forest', id: 'gary', name: 'Gary', rarity: 'Legendary', minSaleValue: 1_100, maxSaleValue: 1_550 },

  { biomeId: 'crystaline-caverns', id: 'glyphid-swarmer', name: 'Glyphid Swarmer', rarity: 'Common', minSaleValue: 75, maxSaleValue: 100 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-exploder', name: 'Glyphid Exploder', rarity: 'Common', minSaleValue: 75, maxSaleValue: 100 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-grunt', name: 'Glyphid Grunt', rarity: 'Common', minSaleValue: 80, maxSaleValue: 105 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-web-spitter', name: 'Glyphid Web Spitter', rarity: 'Uncommon', minSaleValue: 120, maxSaleValue: 170 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-acid-spitter', name: 'Glyphid Acid Spitter', rarity: 'Uncommon', minSaleValue: 125, maxSaleValue: 175 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-slasher', name: 'Glyphid Slasher', rarity: 'Rare', minSaleValue: 220, maxSaleValue: 310 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-guard', name: 'Glyphid Guard', rarity: 'Rare', minSaleValue: 230, maxSaleValue: 320 },
  { biomeId: 'crystaline-caverns', id: 'lootbug', name: 'Lootbug', rarity: 'Rare', minSaleValue: 240, maxSaleValue: 330 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-praetorian', name: 'Glyphid Praetorian', rarity: 'Epic', minSaleValue: 500, maxSaleValue: 700 },
  { biomeId: 'crystaline-caverns', id: 'golden-lootbug', name: 'Golden Lootbug', rarity: 'Epic', minSaleValue: 550, maxSaleValue: 750 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-warden', name: 'Glyphid Warden', rarity: 'Epic', minSaleValue: 520, maxSaleValue: 720 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-dreadnought', name: 'Glyphid Dreadnought', rarity: 'Legendary', minSaleValue: 1_800, maxSaleValue: 2_500 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-hiveguard', name: 'Glyphid Hiveguard', rarity: 'Legendary', minSaleValue: 1_850, maxSaleValue: 2_550 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-bulk-detonator', name: 'Glyphid Bulk Detonator', rarity: 'Legendary', minSaleValue: 1_900, maxSaleValue: 2_600 },
  { biomeId: 'crystaline-caverns', id: 'glyphid-oppressor', name: 'Glyphid Oppressor', rarity: 'Legendary', minSaleValue: 1_900, maxSaleValue: 2_600 },

  { biomeId: 'rallypoint-delta', id: 'lemurian', name: 'Lemurian', rarity: 'Common', minSaleValue: 120, maxSaleValue: 160 },
  { biomeId: 'rallypoint-delta', id: 'lesser-wisp', name: 'Lesser Wisp', rarity: 'Common', minSaleValue: 125, maxSaleValue: 165 },
  { biomeId: 'rallypoint-delta', id: 'stone-golem', name: 'Stone Golem', rarity: 'Uncommon', minSaleValue: 200, maxSaleValue: 275 },
  { biomeId: 'rallypoint-delta', id: 'imp', name: 'Imp', rarity: 'Uncommon', minSaleValue: 210, maxSaleValue: 285 },
  { biomeId: 'rallypoint-delta', id: 'greater-wisp', name: 'Greater Wisp', rarity: 'Rare', minSaleValue: 360, maxSaleValue: 500 },
  { biomeId: 'rallypoint-delta', id: 'bighorn-bison', name: 'Bighorn Bison', rarity: 'Rare', minSaleValue: 375, maxSaleValue: 525 },
  { biomeId: 'rallypoint-delta', id: 'void-reaver', name: 'Void Reaver', rarity: 'Epic', minSaleValue: 850, maxSaleValue: 1_200 },
  { biomeId: 'rallypoint-delta', id: 'clay-dunestrider', name: 'Clay Dunestrider', rarity: 'Legendary', minSaleValue: 3_000, maxSaleValue: 4_250 },
  { biomeId: 'rallypoint-delta', id: 'imp-overlord', name: 'Imp Overlord', rarity: 'Legendary', minSaleValue: 3_100, maxSaleValue: 4_350 },
  { biomeId: 'rallypoint-delta', id: 'magma-worm', name: 'Magma Worm', rarity: 'Legendary', minSaleValue: 3_200, maxSaleValue: 4_500 },
  { biomeId: 'rallypoint-delta', id: 'scavenger', name: 'Scavenger', rarity: 'Legendary', minSaleValue: 3_000, maxSaleValue: 4_250 },
] as const satisfies readonly FishingCatchConfig[];

/** Shared Fishing odds, sale, XP, and drop-rate balance values. */
export const FISHING_BALANCE_CONFIG = {
  crateDropRates: { Common: 0.05, Uncommon: 0.025, Rare: 0.0125, Epic: 0.0025, Legendary: 0.00025 },
  crateXpByRarity: { Common: 15, Uncommon: 37.5, Rare: 112.5, Epic: 375, Legendary: 1_500 },
  expeditionXpPerBaseCatch: 5.625,
  fishRarityWeights: { Common: 1_000, Uncommon: 200, Rare: 50, Epic: 10, Legendary: 0.1, Mythic: 0 },
  legendaryFishSaleMultiplier: 15,
  relicDropRate: 0.0001,
} as const satisfies {
  crateDropRates: Record<Exclude<FishingRarityConfig, 'Mythic'>, number>;
  crateXpByRarity: Record<Exclude<FishingRarityConfig, 'Mythic'>, number>;
  expeditionXpPerBaseCatch: number;
  fishRarityWeights: Record<FishingRarityConfig, number>;
  legendaryFishSaleMultiplier: number;
  relicDropRate: number;
};

type MiningDepthIdConfig = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type MiningResourceKindConfig = 'ore' | 'gem' | 'fossil';

type MiningResourceConfig = {
  depth: MiningDepthIdConfig;
  id: string;
  kind: MiningResourceKindConfig;
  name: string;
  processorTier?: number;
  saleValue?: number;
};

type MiningDepthConfig = {
  descendAndAscendMs: number;
  fossils: readonly MiningResourceConfig[];
  gems: readonly MiningResourceConfig[];
  id: MiningDepthIdConfig;
  name: string;
  ores: readonly MiningResourceConfig[];
  requiredToolId?: string;
};

/** One editable entry for every Mining depth, resource, and sale value. */
export const MINING_DEPTH_CONFIG = [
  {
    id: 1,
    name: 'Shallow Quarry',
    descendAndAscendMs: 5_000,
    ores: [
      { depth: 1, kind: 'ore', id: 'coal', name: 'Coal', saleValue: 7 },
      { depth: 1, kind: 'ore', id: 'quartz', name: 'Quartz', saleValue: 11 },
    ],
    gems: [
      { depth: 1, kind: 'gem', id: 'opal', name: 'Opal', saleValue: 20 },
      { depth: 1, kind: 'gem', id: 'pearl', name: 'Pearl', saleValue: 40 },
    ],
    fossils: [
      { depth: 1, kind: 'fossil', id: 'compsognathus-fossil', name: 'Compsognathus Fossil' },
      { depth: 1, kind: 'fossil', id: 'microraptor-fossil', name: 'Microraptor Fossil' },
      { depth: 1, kind: 'fossil', id: 'archaeopteryx-fossil', name: 'Archaeopteryx Fossil' },
      { depth: 1, kind: 'fossil', id: 'psittacosaurus-fossil', name: 'Psittacosaurus Fossil' },
      { depth: 1, kind: 'fossil', id: 'protoceratops-fossil', name: 'Protoceratops Fossil' },
    ],
  },
  {
    id: 2,
    name: 'Copper Veins',
    descendAndAscendMs: 30_000,
    requiredToolId: 'stone-pickaxe',
    ores: [
      { depth: 2, kind: 'ore', id: 'copper', name: 'Copper', processorTier: 1, saleValue: 10 },
      { depth: 2, kind: 'ore', id: 'tin', name: 'Tin', processorTier: 1, saleValue: 17 },
    ],
    gems: [
      { depth: 2, kind: 'gem', id: 'jade', name: 'Jade', saleValue: 31 },
      { depth: 2, kind: 'gem', id: 'emerald', name: 'Emerald', saleValue: 75 },
    ],
    fossils: [
      { depth: 2, kind: 'fossil', id: 'stegosaurus-fossil', name: 'Stegosaurus Fossil' },
      { depth: 2, kind: 'fossil', id: 'iguanodon-fossil', name: 'Iguanodon Fossil' },
      { depth: 2, kind: 'fossil', id: 'parasaurolophus-fossil', name: 'Parasaurolophus Fossil' },
      { depth: 2, kind: 'fossil', id: 'dilophosaurus-fossil', name: 'Dilophosaurus Fossil' },
      { depth: 2, kind: 'fossil', id: 'allosaurus-fossil', name: 'Allosaurus Fossil' },
    ],
  },
  {
    id: 3,
    name: 'Iron Delve',
    descendAndAscendMs: 60_000,
    requiredToolId: 'weak-metal-pickaxe',
    ores: [
      { depth: 3, kind: 'ore', id: 'iron', name: 'Iron', processorTier: 2, saleValue: 18 },
      { depth: 3, kind: 'ore', id: 'lead', name: 'Lead', processorTier: 2, saleValue: 30 },
    ],
    gems: [
      { depth: 3, kind: 'gem', id: 'ruby', name: 'Ruby', saleValue: 55 },
      { depth: 3, kind: 'gem', id: 'garnet', name: 'Garnet', saleValue: 123 },
    ],
    fossils: [
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fossil', name: 'Ankylosaurus Fossil' },
      { depth: 3, kind: 'fossil', id: 'pachycephalosaurus-fossil', name: 'Pachycephalosaurus Fossil' },
      { depth: 3, kind: 'fossil', id: 'baryonyx-fossil', name: 'Baryonyx Fossil' },
      { depth: 3, kind: 'fossil', id: 'carnotaurus-fossil', name: 'Carnotaurus Fossil' },
      { depth: 3, kind: 'fossil', id: 'camarasaurus-fossil', name: 'Camarasaurus Fossil' },
    ],
  },
  {
    id: 4,
    name: 'Silverworks',
    descendAndAscendMs: 120_000,
    requiredToolId: 'rudimentary-pickaxe',
    ores: [
      { depth: 4, kind: 'ore', id: 'silver', name: 'Silver', processorTier: 3, saleValue: 38 },
      { depth: 4, kind: 'ore', id: 'tungsten', name: 'Tungsten', processorTier: 3, saleValue: 65 },
    ],
    gems: [
      { depth: 4, kind: 'gem', id: 'topaz', name: 'Topaz', saleValue: 115 },
      { depth: 4, kind: 'gem', id: 'sapphire', name: 'Sapphire', saleValue: 260 },
    ],
    fossils: [
      { depth: 4, kind: 'fossil', id: 'triceratops-fossil', name: 'Triceratops Fossil' },
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fossil', name: 'Spinosaurus Fossil' },
      { depth: 4, kind: 'fossil', id: 'velociraptor-fossil', name: 'Velociraptor Fossil' },
      { depth: 4, kind: 'fossil', id: 'diplodocus-fossil', name: 'Diplodocus Fossil' },
      { depth: 4, kind: 'fossil', id: 'argentinosaurus-fossil', name: 'Argentinosaurus Fossil' },
    ],
  },
  {
    id: 5,
    name: 'Gilded Depths',
    descendAndAscendMs: 300_000,
    requiredToolId: 'reinforced-pickaxe',
    ores: [
      { depth: 5, kind: 'ore', id: 'gold', name: 'Gold', processorTier: 4, saleValue: 60 },
      { depth: 5, kind: 'ore', id: 'platinum', name: 'Platinum', processorTier: 4, saleValue: 98 },
    ],
    gems: [
      { depth: 5, kind: 'gem', id: 'amethyst', name: 'Amethyst', saleValue: 170 },
      { depth: 5, kind: 'gem', id: 'aquamarine', name: 'Aquamarine', saleValue: 395 },
    ],
    fossils: [
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fossil', name: 'Tyrannosaurus Fossil' },
      { depth: 5, kind: 'fossil', id: 'giganotosaurus-fossil', name: 'Giganotosaurus Fossil' },
      { depth: 5, kind: 'fossil', id: 'therizinosaurus-fossil', name: 'Therizinosaurus Fossil' },
      { depth: 5, kind: 'fossil', id: 'deinonychus-fossil', name: 'Deinonychus Fossil' },
      { depth: 5, kind: 'fossil', id: 'apatosaurus-fossil', name: 'Apatosaurus Fossil' },
    ],
  },
  {
    id: 6,
    name: 'Cobalt Hollow',
    descendAndAscendMs: 600_000,
    requiredToolId: 'sturdy-drill',
    ores: [
      { depth: 6, kind: 'ore', id: 'cobalt', name: 'Cobalt', processorTier: 5, saleValue: 90 },
      { depth: 6, kind: 'ore', id: 'palladium', name: 'Palladium', processorTier: 5, saleValue: 148 },
    ],
    gems: [
      { depth: 6, kind: 'gem', id: 'citrine', name: 'Citrine', saleValue: 270 },
      { depth: 6, kind: 'gem', id: 'peridot', name: 'Peridot', saleValue: 650 },
    ],
    fossils: [
      { depth: 6, kind: 'fossil', id: 'utahraptor-fossil', name: 'Utahraptor Fossil' },
      { depth: 6, kind: 'fossil', id: 'carcharodontosaurus-fossil', name: 'Carcharodontosaurus Fossil' },
      { depth: 6, kind: 'fossil', id: 'oviraptor-fossil', name: 'Oviraptor Fossil' },
      { depth: 6, kind: 'fossil', id: 'mamenchisaurus-fossil', name: 'Mamenchisaurus Fossil' },
      { depth: 6, kind: 'fossil', id: 'styracosaurus-fossil', name: 'Styracosaurus Fossil' },
    ],
  },
  {
    id: 7,
    name: 'Adamant Abyss',
    descendAndAscendMs: 1_800_000,
    requiredToolId: 'advanced-drill',
    ores: [
      { depth: 7, kind: 'ore', id: 'titanium', name: 'Titanium', processorTier: 6, saleValue: 142 },
      { depth: 7, kind: 'ore', id: 'adamantite', name: 'Adamantite', processorTier: 6, saleValue: 242 },
    ],
    gems: [
      { depth: 7, kind: 'gem', id: 'diamond', name: 'Diamond', saleValue: 440 },
      { depth: 7, kind: 'gem', id: 'moissanite', name: 'Moissanite', saleValue: 1_025 },
    ],
    fossils: [
      { depth: 7, kind: 'fossil', id: 'yutyrannus-fossil', name: 'Yutyrannus Fossil' },
      { depth: 7, kind: 'fossil', id: 'mapusaurus-fossil', name: 'Mapusaurus Fossil' },
      { depth: 7, kind: 'fossil', id: 'dreadnoughtus-fossil', name: 'Dreadnoughtus Fossil' },
      { depth: 7, kind: 'fossil', id: 'deinocheirus-fossil', name: 'Deinocheirus Fossil' },
      { depth: 7, kind: 'fossil', id: 'acrocanthosaurus-fossil', name: 'Acrocanthosaurus Fossil' },
    ],
  },
] as const satisfies readonly MiningDepthConfig[];

export const MINING_REWARD_WEIGHT_CONFIG = { fossil: 1, gem: 10, ore: 100, stone: 500 } as const satisfies Record<'fossil' | 'gem' | 'ore' | 'stone', number>;
