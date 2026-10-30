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

type FishingShopUpgradeCategoryConfig = 'rod' | 'bait' | 'boat' | 'crew';

type FishingShopUpgradeConfig = {
  catchableRarities?: readonly FishingRarityConfig[];
  category: FishingShopUpgradeCategoryConfig;
  cost: number;
  description: string;
  id: string;
  name: string;
  requiredFishingLevel?: number;
  requiredUpgradeId?: string;
};

/** Standard Fishing shop upgrades. Relics and shared player skills are configured separately below. */
export const FISHING_SHOP_UPGRADE_CONFIG: readonly FishingShopUpgradeConfig[] = [
  { id: 'plastic-rod', name: 'Plastic Rod', category: 'rod', cost: 0, description: 'Starter rod that catches common fish.', catchableRarities: ['Common'] },
  { id: 'wooden-rod', name: 'Wooden Rod', category: 'rod', cost: 5_000, requiredFishingLevel: 5, description: 'Catches common and uncommon fish.', catchableRarities: ['Common', 'Uncommon'] },
  { id: 'fiberglass-rod', name: 'Fiberglass Rod', category: 'rod', cost: 15_000, requiredFishingLevel: 10, description: 'Catches common, uncommon, and rare fish.', catchableRarities: ['Common', 'Uncommon', 'Rare'] },
  { id: 'reinforced-rod', name: 'Reinforced Rod', category: 'rod', cost: 30_000, requiredFishingLevel: 15, description: 'Catches common through epic fish.', catchableRarities: ['Common', 'Uncommon', 'Rare', 'Epic'] },
  { id: 'master-rod', name: 'Master Rod', category: 'rod', cost: 50_000, requiredFishingLevel: 20, description: 'Catches common through legendary fish.', catchableRarities: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] },
  { id: 'celestial-rod', name: 'Celestial Rod', category: 'rod', cost: 250_000, requiredFishingLevel: 50, description: 'Catches uncommon through legendary fish.', catchableRarities: ['Uncommon', 'Rare', 'Epic', 'Legendary'] },
  { id: 'god-rod', name: 'God Rod', category: 'rod', cost: 1_000_000, requiredFishingLevel: 80, description: 'Catches rare, epic, legendary, and future Mythic fish.', catchableRarities: ['Rare', 'Epic', 'Legendary', 'Mythic'] },

  { id: 'basic-bait', name: 'Basic Bait', category: 'bait', cost: 0, description: 'Starter bait with no expedition modifier.' },
  { id: 'chum', name: 'Chum', category: 'bait', cost: 10_000, requiredFishingLevel: 5, description: 'Each common or uncommon fish has a 10–30% chance to return one additional fish.' },
  { id: 'magnet', name: 'Magnet', category: 'bait', cost: 30_000, requiredFishingLevel: 15, description: 'Increases each crate-spawn chance by 50% of its original odds.' },
  { id: 'sonar', name: 'Sonar', category: 'bait', cost: 75_000, requiredFishingLevel: 25, description: 'Halves fish-roll success while doubling relic-find chance.' },
  { id: 'bloodworms', name: 'Bloodworms', category: 'bait', cost: 150_000, requiredFishingLevel: 40, description: 'Each rare or epic fish has a 10–30% chance to return one additional fish.' },
  { id: 'mysterious-sea-food', name: 'Mysterious Sea Food', category: 'bait', cost: 250_000, requiredFishingLevel: 55, description: 'Has a 20% chance to add 50% more fish rolls to an expedition.' },
  { id: 'truffle-worm', name: 'Truffle Worm', category: 'bait', cost: 1_000_000, requiredFishingLevel: 80, description: 'Triples legendary odds, but only legendary fish can return.' },

  { id: 'sail', name: 'Sail', category: 'boat', cost: 10_000, requiredFishingLevel: 10, description: 'Permanent boat upgrade that unlocks travel to the Warm Ocean.' },
  { id: 'abiotic-turbine', name: 'Abiotic Turbine', category: 'boat', cost: 25_000, requiredFishingLevel: 20, description: 'Permanent boat upgrade that unlocks travel to the Hydroplant Reservoir.' },
  { id: 'submersible-pod', name: 'Submersible Pod', category: 'boat', cost: 60_000, requiredFishingLevel: 30, description: 'Permanent boat upgrade that unlocks travel to the Sunken Sea.' },
  { id: 'magic-conch-navigator', name: 'Magic Conch Navigator', category: 'boat', cost: 100_000, requiredFishingLevel: 40, description: 'Permanent boat upgrade that unlocks travel to the Kelp Forest.' },
  { id: 'drill-unit', name: 'Drill Unit', category: 'boat', cost: 150_000, requiredFishingLevel: 50, description: 'Permanent boat upgrade that unlocks travel to the Crystaline Caverns.' },
  { id: 'radar-scanner', name: 'Radar Scanner', category: 'boat', cost: 250_000, requiredFishingLevel: 60, description: 'Permanent boat upgrade that unlocks travel to Rallypoint Delta.' },

  { id: 'crew-1', name: 'Crew 1 Contract', category: 'crew', cost: 100_000, requiredFishingLevel: 40, description: 'Unlocks Crew 1. Crew expeditions take 3x as long.' },
  { id: 'crew-2', name: 'Crew 2 Contract', category: 'crew', cost: 250_000, requiredFishingLevel: 80, description: 'Unlocks Crew 2. Requires Crew 1; crew expeditions take 3x as long.' },
];

type FishingRelicContentConfig = {
  description: string;
  /** Use null when the relic can be found in every standard biome. */
  foundBiomeIds: readonly FishingBiomeIdConfig[] | null;
  id: string;
  name: string;
};

/**
 * Editable Fishing relic names, descriptions, and discovery locations.
 * Mechanical effects remain in the Fishing catalogue beside their resolver.
 */
export const FISHING_RELIC_CONTENT_CONFIG = [
  { id: 'gear-sea-star', name: 'Sea Star', description: 'Permanent relic: increases money gained from everything by 5%.', foundBiomeIds: null },
  { id: 'gear-alien-engine', name: 'Alien Engine', description: 'Permanent relic: reduces expedition duration by 10%.', foundBiomeIds: null },
  { id: 'gear-dual-hook', name: 'Dual Hook', description: 'Permanent relic: adds one fish roll to every expedition.', foundBiomeIds: null },
  { id: 'gear-rod-improvement-kit', name: 'Rod Improvement Kit', description: 'Permanent relic: increases higher-rarity fishing odds by 5%.', foundBiomeIds: null },
  { id: 'gear-lost-pursasion-device', name: 'Lost Pursasion Device', description: 'Permanent relic: reduces costs by 5%.', foundBiomeIds: null },
  { id: 'gear-conduit', name: 'Conduit', description: 'Permanent relic: doubles relic-find chance.', foundBiomeIds: ['warm-ocean'] },
  { id: 'gear-reservoir-growth', name: 'Reservoir Growth', description: 'Permanent relic: raises crate-spawn chance by 10%.', foundBiomeIds: ['hydroplant-reservoir'] },
  { id: 'gear-giant-pearl', name: 'Giant Pearl', description: 'Permanent relic: increases Fishing XP earned by 25%.', foundBiomeIds: ['sunken-sea'] },
  { id: 'gear-magic-conch', name: 'Magic Conch', description: 'Permanent relic: each fish has a 10% chance to upgrade one rarity.', foundBiomeIds: ['kelp-forest'] },
  { id: 'gear-gemcracker', name: 'Gemcracker', description: 'Permanent relic: reserves improved crate loot for a future balance update.', foundBiomeIds: ['crystaline-caverns'] },
  { id: 'gear-teleporter', name: 'Teleporter', description: 'Permanent relic: 5% chance to instantly complete a non-crew expedition.', foundBiomeIds: ['rallypoint-delta'] },
  { id: 'gear-lucky-coin', name: 'Lucky Coin', description: 'Permanent relic: each fish or crate catch has a 3% chance to sell for double.', foundBiomeIds: null },
  { id: 'gear-streak-charm', name: 'Streak Charm', description: 'Permanent relic: consecutive expeditions in the same location gain 0.5% value each, up to 10%; changing location resets the streak.', foundBiomeIds: null },
  { id: 'gear-early-bird-bell', name: 'Early Bird Bell', description: 'Permanent relic: the first expedition launched each UTC day earns 50% more KnowBucks.', foundBiomeIds: null },
  { id: 'gear-knowleague-lure', name: 'KnowLeague Lure', description: 'Permanent relic: legendary fish sell for 10% more.', foundBiomeIds: null },
  { id: 'gear-dockhands-ledger', name: "Harbor Dockhand's Ledger", description: 'Permanent relic: crew expeditions earn 2.5% more KnowBucks.', foundBiomeIds: ['harbor'] },
  { id: 'gear-sunstone', name: 'Sunstone', description: 'Permanent relic: Warm Ocean fish value rolls skew toward the top of their ranges.', foundBiomeIds: ['warm-ocean'] },
  { id: 'gear-genesys-loop', name: 'Genesys Loop', description: 'Permanent relic: after an expedition settles, has a 20% chance to launch the same preset again.', foundBiomeIds: ['hydroplant-reservoir'] },
  { id: 'gear-pearl-divers-log', name: "Pearl Diver's Log", description: 'Permanent relic: the first catch of each fish pays five times its normal value.', foundBiomeIds: ['sunken-sea'] },
  { id: 'gear-tangle-net', name: 'Tangle Net', description: 'Permanent relic: each distinct fish rarity in a haul adds 3% value to its fish sales.', foundBiomeIds: ['kelp-forest'] },
  { id: 'gear-crystal-resonator', name: 'Crystal Resonator', description: 'Permanent relic: epic and legendary fish sell for 10% more.', foundBiomeIds: ['crystaline-caverns'] },
  { id: 'gear-autopilot-relay', name: 'Autopilot Relay', description: 'Permanent relic: crew expeditions earn 20% more KnowBucks and finish 10% faster.', foundBiomeIds: ['rallypoint-delta'] },
] as const satisfies readonly FishingRelicContentConfig[];

type PlayerSkillTrackConfig = 'lucky' | 'cheapskate' | 'moneyMouser' | 'haste';

type PlayerSkillTierConfig = {
  cost: number;
  costReductionPercent?: number;
  description: string;
  higherRarityBonusPercent?: number;
  id: string;
  level: number;
  name: string;
  requiredUpgradeId?: string;
  saleBonusPercent?: number;
  timeReductionPercent?: number;
  track: PlayerSkillTrackConfig;
};

/**
 * Shared player-skill tiers. Keep each track's levels in order and point every
 * non-first level at the preceding tier through requiredUpgradeId.
 */
export const PLAYER_SKILL_TIER_CONFIG: readonly PlayerSkillTierConfig[] = [
  { track: 'lucky', level: 1, id: 'lucky-1', name: 'Lucky I', cost: 2_500, description: '+5% increased fishing rarity odds. +2% stone filtered. +2% robbery success chance. +1% robbery defense odds.', higherRarityBonusPercent: 5 },
  { track: 'lucky', level: 2, id: 'lucky-2', name: 'Lucky II', cost: 15_000, description: '+5% increased fishing rarity odds. +2% stone filtered. +2% robbery success chance. +1% robbery defense odds.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-1' },
  { track: 'lucky', level: 3, id: 'lucky-3', name: 'Lucky III', cost: 50_000, description: '+5% increased fishing rarity odds. +2% stone filtered. +2% robbery success chance. +1% robbery defense odds.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-2' },
  { track: 'lucky', level: 4, id: 'lucky-4', name: 'Lucky IV', cost: 250_000, description: '+5% increased fishing rarity odds. +2% stone filtered. +2% robbery success chance. +1% robbery defense odds.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-3' },
  { track: 'lucky', level: 5, id: 'lucky-5', name: 'Lucky V', cost: 1_000_000, description: '+5% increased fishing rarity odds. +2% stone filtered. +2% robbery success chance. +1% robbery defense odds.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-4' },

  { track: 'cheapskate', level: 1, id: 'cheapskate-1', name: 'Cheapskate I', cost: 10_000, description: '+5% discount on everything!', costReductionPercent: 5 },
  { track: 'cheapskate', level: 2, id: 'cheapskate-2', name: 'Cheapskate II', cost: 50_000, description: '+5% discount on everything!', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-1' },
  { track: 'cheapskate', level: 3, id: 'cheapskate-3', name: 'Cheapskate III', cost: 250_000, description: '+5% discount on everything!', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-2' },
  { track: 'cheapskate', level: 4, id: 'cheapskate-4', name: 'Cheapskate IV', cost: 1_000_000, description: '+5% discount on everything!', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-3' },

  { track: 'moneyMouser', level: 1, id: 'money-mouser-1', name: 'Money Mouser I', cost: 250_000, description: '+10% increased money gain.', saleBonusPercent: 10 },
  { track: 'moneyMouser', level: 2, id: 'money-mouser-2', name: 'Money Mouser II', cost: 1_000_000, description: '+10% increased money gain.', saleBonusPercent: 10, requiredUpgradeId: 'money-mouser-1' },

  { track: 'haste', level: 1, id: 'haste-1', name: 'Haste I', cost: 10_000, description: '-10% fishing expedition duration. +5% elevator speed. -5% robbery cooldown.', timeReductionPercent: 10 },
  { track: 'haste', level: 2, id: 'haste-2', name: 'Haste II', cost: 25_000, description: '-10% fishing expedition duration. +5% elevator speed. -5% robbery cooldown.', timeReductionPercent: 10, requiredUpgradeId: 'haste-1' },
  { track: 'haste', level: 3, id: 'haste-3', name: 'Haste III', cost: 100_000, description: '-10% fishing expedition duration. +5% elevator speed. -5% robbery cooldown.', timeReductionPercent: 10, requiredUpgradeId: 'haste-2' },
  { track: 'haste', level: 4, id: 'haste-4', name: 'Haste IV', cost: 250_000, description: '-10% fishing expedition duration. +5% elevator speed. -5% robbery cooldown.', timeReductionPercent: 10, requiredUpgradeId: 'haste-3' },
];

type FishingEventBiomeConfig = {
  catalogueBiomeId: 'hellish-abyss';
  id: 'halloween';
  name: string;
  biomeName: string;
  replacementChance: number;
};

/** Event-biome metadata. Add future Fishing event biomes here before their event content is activated. */
export const FISHING_EVENT_BIOME_CONFIG = [
  { id: 'halloween', name: 'Halloween Event', biomeName: 'Hellish Abyss', catalogueBiomeId: 'hellish-abyss', replacementChance: 0.25 },
] as const satisfies readonly FishingEventBiomeConfig[];

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
      { depth: 1, kind: 'fossil', id: 'triceratops-fragment-1', name: 'Triceratops Fragment 1/5' },
      { depth: 1, kind: 'fossil', id: 'triceratops-fragment-2', name: 'Triceratops Fragment 2/5' },
      { depth: 1, kind: 'fossil', id: 'triceratops-fragment-3', name: 'Triceratops Fragment 3/5' },
      { depth: 1, kind: 'fossil', id: 'triceratops-fragment-4', name: 'Triceratops Fragment 4/5' },
      { depth: 1, kind: 'fossil', id: 'triceratops-fragment-5', name: 'Triceratops Fragment 5/5' },
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
      { depth: 2, kind: 'fossil', id: 'velociraptor-fragment-1', name: 'Velociraptor Fragment 1/5' },
      { depth: 2, kind: 'fossil', id: 'velociraptor-fragment-2', name: 'Velociraptor Fragment 2/5' },
      { depth: 2, kind: 'fossil', id: 'velociraptor-fragment-3', name: 'Velociraptor Fragment 3/5' },
      { depth: 2, kind: 'fossil', id: 'velociraptor-fragment-4', name: 'Velociraptor Fragment 4/5' },
      { depth: 2, kind: 'fossil', id: 'velociraptor-fragment-5', name: 'Velociraptor Fragment 5/5' },
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
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fragment-1', name: 'Ankylosaurus Fragment 1/5' },
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fragment-2', name: 'Ankylosaurus Fragment 2/5' },
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fragment-3', name: 'Ankylosaurus Fragment 3/5' },
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fragment-4', name: 'Ankylosaurus Fragment 4/5' },
      { depth: 3, kind: 'fossil', id: 'ankylosaurus-fragment-5', name: 'Ankylosaurus Fragment 5/5' },
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
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fragment-1', name: 'Spinosaurus Fragment 1/5' },
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fragment-2', name: 'Spinosaurus Fragment 2/5' },
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fragment-3', name: 'Spinosaurus Fragment 3/5' },
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fragment-4', name: 'Spinosaurus Fragment 4/5' },
      { depth: 4, kind: 'fossil', id: 'spinosaurus-fragment-5', name: 'Spinosaurus Fragment 5/5' },
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
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fragment-1', name: 'Tyrannosaurus Fragment 1/5' },
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fragment-2', name: 'Tyrannosaurus Fragment 2/5' },
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fragment-3', name: 'Tyrannosaurus Fragment 3/5' },
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fragment-4', name: 'Tyrannosaurus Fragment 4/5' },
      { depth: 5, kind: 'fossil', id: 'tyrannosaurus-fragment-5', name: 'Tyrannosaurus Fragment 5/5' },
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
      { depth: 6, kind: 'fossil', id: 'stegosaurus-fragment-1', name: 'Stegosaurus Fragment 1/5' },
      { depth: 6, kind: 'fossil', id: 'stegosaurus-fragment-2', name: 'Stegosaurus Fragment 2/5' },
      { depth: 6, kind: 'fossil', id: 'stegosaurus-fragment-3', name: 'Stegosaurus Fragment 3/5' },
      { depth: 6, kind: 'fossil', id: 'stegosaurus-fragment-4', name: 'Stegosaurus Fragment 4/5' },
      { depth: 6, kind: 'fossil', id: 'stegosaurus-fragment-5', name: 'Stegosaurus Fragment 5/5' },
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
      { depth: 7, kind: 'fossil', id: 'brachiosaurus-fragment-1', name: 'Brachiosaurus Fragment 1/5' },
      { depth: 7, kind: 'fossil', id: 'brachiosaurus-fragment-2', name: 'Brachiosaurus Fragment 2/5' },
      { depth: 7, kind: 'fossil', id: 'brachiosaurus-fragment-3', name: 'Brachiosaurus Fragment 3/5' },
      { depth: 7, kind: 'fossil', id: 'brachiosaurus-fragment-4', name: 'Brachiosaurus Fragment 4/5' },
      { depth: 7, kind: 'fossil', id: 'brachiosaurus-fragment-5', name: 'Brachiosaurus Fragment 5/5' },
    ],
  },
] as const satisfies readonly MiningDepthConfig[];

type MiningGearContentConfig = {
  depth: MiningDepthIdConfig;
  description: string;
  id: string;
  name: string;
};

/** Permanent Mining relics. Each eligible stone break uses Fishing's 0.01% relic-find rate. */
export const MINING_GEAR_CONTENT_CONFIG = [
  { depth: 1, id: 'mining-gear-bioluminescence', name: 'Bioluminescence', description: 'Ores glow nearby, adding a 5% stone-to-ore conversion chance.' },
  { depth: 1, id: 'mining-gear-loaned-coin', name: 'Loaned Coin', description: 'An all-balance coinflip pays four times the balance on a win or leaves that amount owed on a loss.' },
  { depth: 2, id: 'mining-gear-melter', name: 'Melter', description: 'Filters an additional 5% of stone before it reaches your cart.' },
  { depth: 3, id: 'mining-gear-hardened-tip', name: 'Hardened Tip', description: 'Increases Mining speed by 10%.' },
  { depth: 3, id: 'mining-gear-inspiring-photo', name: 'Inspiring Photo', description: 'Collection rerolls have an additional 5% chance to upgrade rarity, up to Mythic.' },
  { depth: 4, id: 'mining-gear-conveyor-belt', name: 'Conveyor Belt', description: 'Lets you claim a filled minecart without recalling the expedition.' },
  { depth: 5, id: 'mining-gear-gem-bag', name: 'Gem Bag', description: 'Stores gems separately up to 25% of minecart capacity before they use cart storage.' },
  { depth: 5, id: 'mining-gear-translocator', name: 'Translocator', description: 'Receives 25% of every KnowBucks Surprise.' },
  { depth: 6, id: 'mining-gear-paleontological-certificate', name: 'Paleontological Certificate', description: 'Doubles fossil discovery odds.' },
  { depth: 6, id: 'mining-gear-obsidian-dagger', name: 'Obsidian Dagger', description: 'Increases robbery success and defense chances by 1%.' },
  { depth: 7, id: 'mining-gear-ancient-refinery', name: 'Ancient Refinery', description: 'Ores sell for 50% more KnowBucks.' },
] as const satisfies readonly MiningGearContentConfig[];

/** A full Tier 1 cart has a one-in-250 chance to return a Relic. */
export const MINING_GEAR_DROP_RATE = 1 / 250;

export const MINING_REWARD_WEIGHT_CONFIG = { fossil: 1, gem: 10, ore: 100, stone: 500 } as const satisfies Record<'fossil' | 'gem' | 'ore' | 'stone', number>;

type MiningShopUpgradeCategoryConfig = 'tool' | 'storage' | 'processor' | 'elevator' | 'filter';

type MiningShopUpgradeConfig = {
  category: MiningShopUpgradeCategoryConfig;
  description: string;
  id: string;
  name: string;
  previousUpgradeId?: string;
  recipe?: readonly { resourceId: string; quantity: number }[];
  value: number;
};

/** Every Mining shop upgrade, including the exact crafting materials for each tier. */
export const MINING_SHOP_UPGRADE_CONFIG: readonly MiningShopUpgradeConfig[] = [
  { id: 'wooden-pickaxe', name: 'Wooden Pickaxe', category: 'tool', value: 0.1, description: 'Starter tool that breaks 1 stone every 10 seconds.' },
  { id: 'stone-pickaxe', name: 'Stone Pickaxe', category: 'tool', value: 0.2, previousUpgradeId: 'wooden-pickaxe', recipe: [{ resourceId: 'coal', quantity: 2 }, { resourceId: 'quartz', quantity: 2 }], description: 'Breaks 1 stone every 5 seconds. Unlocks Copper Veins.' },
  { id: 'weak-metal-pickaxe', name: 'Weak Metal Pickaxe', category: 'tool', value: 0.5, previousUpgradeId: 'stone-pickaxe', recipe: [{ resourceId: 'copper', quantity: 10 }, { resourceId: 'tin', quantity: 10 }, { resourceId: 'jade', quantity: 1 }], description: 'Breaks 1 stone every 2 seconds. Unlocks Iron Delve.' },
  { id: 'rudimentary-pickaxe', name: 'Rudimentary Pickaxe', category: 'tool', value: 1, previousUpgradeId: 'weak-metal-pickaxe', recipe: [{ resourceId: 'iron', quantity: 25 }, { resourceId: 'lead', quantity: 25 }, { resourceId: 'ruby', quantity: 3 }], description: 'Breaks 1 stone each second. Unlocks Silverworks.' },
  { id: 'reinforced-pickaxe', name: 'Reinforced Pickaxe', category: 'tool', value: 2, previousUpgradeId: 'rudimentary-pickaxe', recipe: [{ resourceId: 'silver', quantity: 75 }, { resourceId: 'tungsten', quantity: 75 }, { resourceId: 'topaz', quantity: 10 }], description: 'Breaks 2 stone each second. Unlocks Gilded Depths.' },
  { id: 'sturdy-drill', name: 'Sturdy Drill', category: 'tool', value: 5, previousUpgradeId: 'reinforced-pickaxe', recipe: [{ resourceId: 'gold', quantity: 200 }, { resourceId: 'platinum', quantity: 200 }, { resourceId: 'amethyst', quantity: 40 }], description: 'Breaks 5 stone each second. Unlocks Cobalt Hollow.' },
  { id: 'advanced-drill', name: 'Advanced Drill', category: 'tool', value: 10, previousUpgradeId: 'sturdy-drill', recipe: [{ resourceId: 'cobalt', quantity: 750 }, { resourceId: 'palladium', quantity: 750 }, { resourceId: 'citrine', quantity: 150 }], description: 'Breaks 10 stone each second. Unlocks Adamant Abyss.' },
  { id: 'high-tech-drill', name: 'High-Tech Drill', category: 'tool', value: 25, previousUpgradeId: 'advanced-drill', recipe: [{ resourceId: 'titanium', quantity: 3_000 }, { resourceId: 'adamantite', quantity: 3_000 }, { resourceId: 'diamond', quantity: 750 }], description: 'Endgame drill that breaks 25 stone each second.' },

  { id: 'shabby-bin', name: 'Shabby Bin', category: 'storage', value: 5, description: 'Starter minecart storage with room for 5 items.' },
  { id: 'wooden-crate', name: 'Wooden Crate', category: 'storage', value: 15, previousUpgradeId: 'shabby-bin', recipe: [{ resourceId: 'jade', quantity: 2 }, { resourceId: 'emerald', quantity: 2 }], description: 'Raises minecart storage to 15 items.' },
  { id: 'iron-box', name: 'Iron Box', category: 'storage', value: 30, previousUpgradeId: 'wooden-crate', recipe: [{ resourceId: 'ruby', quantity: 4 }, { resourceId: 'garnet', quantity: 4 }], description: 'Raises minecart storage to 30 items.' },
  { id: 'reinforced-crate', name: 'Reinforced Crate', category: 'storage', value: 75, previousUpgradeId: 'iron-box', recipe: [{ resourceId: 'topaz', quantity: 8 }, { resourceId: 'sapphire', quantity: 8 }], description: 'Raises minecart storage to 75 items.' },
  { id: 'titanium-lockbox', name: 'Titanium Lockbox', category: 'storage', value: 150, previousUpgradeId: 'reinforced-crate', recipe: [{ resourceId: 'amethyst', quantity: 16 }, { resourceId: 'aquamarine', quantity: 16 }], description: 'Raises minecart storage to 150 items.' },
  { id: 'gemcrusted-safe', name: 'Gemcrusted Safe', category: 'storage', value: 300, previousUpgradeId: 'titanium-lockbox', recipe: [{ resourceId: 'citrine', quantity: 32 }, { resourceId: 'peridot', quantity: 32 }], description: 'Raises minecart storage to 300 items.' },
  { id: 'quantum-box', name: 'Quantum Box', category: 'storage', value: 750, previousUpgradeId: 'gemcrusted-safe', recipe: [{ resourceId: 'diamond', quantity: 64 }, { resourceId: 'moissanite', quantity: 64 }], description: 'Raises minecart storage to 750 items.' },

  { id: 'processor-depth-2', name: 'Depth 2 Processor', category: 'processor', value: 1, recipe: [{ resourceId: 'coal', quantity: 10 }, { resourceId: 'quartz', quantity: 10 }], description: 'Automatically processes Copper Veins ores.' },
  { id: 'processor-depth-3', name: 'Depth 3 Processor', category: 'processor', value: 2, previousUpgradeId: 'processor-depth-2', recipe: [{ resourceId: 'copper', quantity: 25 }, { resourceId: 'tin', quantity: 25 }, { resourceId: 'jade', quantity: 2 }], description: 'Automatically processes Iron Delve ores and lower tiers.' },
  { id: 'processor-depth-4', name: 'Depth 4 Processor', category: 'processor', value: 3, previousUpgradeId: 'processor-depth-3', recipe: [{ resourceId: 'iron', quantity: 60 }, { resourceId: 'lead', quantity: 60 }, { resourceId: 'ruby', quantity: 6 }], description: 'Automatically processes Silverworks ores and lower tiers.' },
  { id: 'processor-depth-5', name: 'Depth 5 Processor', category: 'processor', value: 4, previousUpgradeId: 'processor-depth-4', recipe: [{ resourceId: 'silver', quantity: 150 }, { resourceId: 'tungsten', quantity: 150 }, { resourceId: 'topaz', quantity: 15 }], description: 'Automatically processes Gilded Depths ores and lower tiers.' },
  { id: 'processor-depth-6', name: 'Depth 6 Processor', category: 'processor', value: 5, previousUpgradeId: 'processor-depth-5', recipe: [{ resourceId: 'gold', quantity: 400 }, { resourceId: 'platinum', quantity: 400 }, { resourceId: 'amethyst', quantity: 50 }], description: 'Automatically processes Cobalt Hollow ores and lower tiers.' },
  { id: 'processor-depth-7', name: 'Depth 7 Processor', category: 'processor', value: 6, previousUpgradeId: 'processor-depth-6', recipe: [{ resourceId: 'cobalt', quantity: 1_500 }, { resourceId: 'palladium', quantity: 1_500 }, { resourceId: 'citrine', quantity: 175 }], description: 'Automatically processes Adamant Abyss ores and lower tiers.' },

  { id: 'sturdy-gears', name: 'Sturdy Gears', category: 'elevator', value: 1, recipe: [{ resourceId: 'iron', quantity: 30 }, { resourceId: 'lead', quantity: 30 }, { resourceId: 'ruby', quantity: 2 }], description: 'Reduces ascent and descent time by 10%.' },
  { id: 'advanced-pulleys', name: 'Advanced Pulleys', category: 'elevator', value: 2, previousUpgradeId: 'sturdy-gears', recipe: [{ resourceId: 'silver', quantity: 100 }, { resourceId: 'tungsten', quantity: 100 }, { resourceId: 'topaz', quantity: 10 }], description: 'Reduces ascent and descent time by another 10%.' },
  { id: 'overcharged-motors', name: 'Overcharged Motors', category: 'elevator', value: 3, previousUpgradeId: 'advanced-pulleys', recipe: [{ resourceId: 'gold', quantity: 250 }, { resourceId: 'platinum', quantity: 250 }, { resourceId: 'amethyst', quantity: 25 }], description: 'Reduces ascent and descent time by another 10%.' },

  { id: 'stone-sorter', name: 'Stone Sorter', category: 'filter', value: 1, recipe: [{ resourceId: 'coal', quantity: 25 }, { resourceId: 'quartz', quantity: 25 }, { resourceId: 'opal', quantity: 2 }], description: 'Discards 25% of stone before it reaches storage.' },
  { id: 'filtering-system', name: 'Filtering System', category: 'filter', value: 2, previousUpgradeId: 'stone-sorter', recipe: [{ resourceId: 'copper', quantity: 50 }, { resourceId: 'tin', quantity: 50 }, { resourceId: 'jade', quantity: 5 }], description: 'Discards 50% of stone before it reaches storage.' },
  { id: 'advanced-ore-detector', name: 'Advanced Ore Detector', category: 'filter', value: 3, previousUpgradeId: 'filtering-system', recipe: [{ resourceId: 'iron', quantity: 100 }, { resourceId: 'lead', quantity: 100 }, { resourceId: 'ruby', quantity: 10 }], description: 'Discards 75% of stone before it reaches storage.' },
];
