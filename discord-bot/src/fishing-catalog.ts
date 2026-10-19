export const FISHING_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export const FISHING_CHEST_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

export type FishingRarity = typeof FISHING_RARITIES[number];
export type FishingChestRarity = typeof FISHING_CHEST_RARITIES[number];
export type FishingBiomeId = 'harbor' | 'warm-ocean' | 'hydroplant-reservoir' | 'sunken-sea' | 'kelp-forest' | 'crystaline-caverns' | 'rallypoint-delta';
export type FishingUpgradeCategory = 'rod' | 'bait' | 'boat' | 'gear' | 'skill' | 'crew';
export type FishingDurationTier = 1 | 2 | 3 | 4;

export interface FishingBiome {
  chestRarities: readonly FishingChestRarity[];
  description: string;
  id: FishingBiomeId;
  name: string;
  requiredBoatUpgradeId?: string;
}

export interface FishingExpeditionLength {
  catchCount: readonly [number, number];
  durationSeconds: number;
  requiredChatLevel: number;
  tier: FishingDurationTier;
}

export interface FishingFish {
  biomeId: FishingBiomeId;
  id: string;
  maxSaleValue: number;
  minSaleValue: number;
  name: string;
  rarity: FishingRarity;
  tags: readonly string[];
}

export interface FishingUpgrade {
  catchableRarities?: readonly FishingRarity[];
  category: FishingUpgradeCategory;
  cost: number;
  costReductionPercent?: number;
  description: string;
  foundBiomeIds?: readonly FishingBiomeId[];
  higherRarityBonusPercent?: number;
  id: string;
  name: string;
  requiredChatLevel?: number;
  requiredUpgradeId?: string;
  saleBonusPercent?: number;
  timeReductionPercent?: number;
}

/** The saved, self-contained configuration for a started expedition. */
export interface FishingEquipmentSnapshot {
  baitItemId: string;
  boatItemId?: string;
  catalogueVersion: 2 | 3;
  passiveItemIds: string[];
  rodItemId: string;
  storageItemId?: string;
}

export interface ResolvedFishingFishCatch {
  kind: 'fish';
  name: string;
  rarity: FishingRarity;
  saleValue: number;
}

export interface ResolvedFishingChestCatch {
  itemId: string;
  kind: 'chest';
  name: string;
  rarity: FishingChestRarity;
}

export interface ResolvedFishingGearCatch {
  itemId: string;
  kind: 'gear';
  name: string;
}

export type ResolvedFishingCatch = ResolvedFishingFishCatch | ResolvedFishingChestCatch | ResolvedFishingGearCatch;

export interface FishingExpeditionResult {
  catches: ResolvedFishingCatch[];
  chestItems: Array<{ itemId: string; quantity: number }>;
  fishSaleValue: number;
  gearItems: Array<{ itemId: string; quantity: number }>;
  knowBucksFound: number;
}

export const FISHING_BIOMES: readonly FishingBiome[] = [
  { id: 'harbor', name: 'Harbor', description: 'Free starting waters with a broad mix of familiar catches.', chestRarities: ['Common', 'Uncommon'] },
  { id: 'warm-ocean', name: 'Warm Ocean', description: 'Bright open waters unlocked by the Sail boat upgrade.', requiredBoatUpgradeId: 'sail', chestRarities: ['Uncommon', 'Rare', 'Epic'] },
  { id: 'hydroplant-reservoir', name: 'Hydroplant Reservoir', description: 'An unstable industrial reservoir unlocked by the Abiotic Turbine.', requiredBoatUpgradeId: 'abiotic-turbine', chestRarities: ['Common', 'Uncommon', 'Rare'] },
  { id: 'sunken-sea', name: 'Sunken Sea', description: 'A submerged world reached with the Submersible Pod.', requiredBoatUpgradeId: 'submersible-pod', chestRarities: ['Uncommon', 'Rare'] },
  { id: 'kelp-forest', name: 'Kelp Forest', description: 'A strange jelly-filled biome reached with the Magic Conch Navigator.', requiredBoatUpgradeId: 'magic-conch-navigator', chestRarities: ['Uncommon', 'Rare'] },
  { id: 'crystaline-caverns', name: 'Crystaline Caverns', description: 'A dangerous underground biome reached with the Drill Unit.', requiredBoatUpgradeId: 'drill-unit', chestRarities: ['Rare', 'Epic', 'Legendary'] },
  { id: 'rallypoint-delta', name: 'Rallypoint Delta', description: 'A hostile high-tier frontier reached with the Radar Scanner.', requiredBoatUpgradeId: 'radar-scanner', chestRarities: ['Epic', 'Legendary'] },
] as const;

export const FISHING_EXPEDITION_LENGTHS: readonly FishingExpeditionLength[] = [
  { tier: 1, requiredChatLevel: 1, durationSeconds: 30, catchCount: [1, 1] },
  { tier: 2, requiredChatLevel: 20, durationSeconds: 60, catchCount: [2, 3] },
  { tier: 3, requiredChatLevel: 50, durationSeconds: 120, catchCount: [5, 6] },
  { tier: 4, requiredChatLevel: 80, durationSeconds: 300, catchCount: [12, 15] },
] as const;

export const FISHING_UPGRADES: readonly FishingUpgrade[] = [
  { id: 'plastic-rod', name: 'Plastic Rod', category: 'rod', cost: 0, description: 'Starter rod that catches common fish.', catchableRarities: ['Common'] },
  { id: 'wooden-rod', name: 'Wooden Rod', category: 'rod', cost: 5_000, requiredChatLevel: 5, description: 'Catches common and uncommon fish.', catchableRarities: ['Common', 'Uncommon'] },
  { id: 'fiberglass-rod', name: 'Fiberglass Rod', category: 'rod', cost: 15_000, requiredChatLevel: 10, description: 'Catches common, uncommon, and rare fish.', catchableRarities: ['Common', 'Uncommon', 'Rare'] },
  { id: 'reinforced-rod', name: 'Reinforced Rod', category: 'rod', cost: 30_000, requiredChatLevel: 15, description: 'Catches common through epic fish.', catchableRarities: ['Common', 'Uncommon', 'Rare', 'Epic'] },
  { id: 'master-rod', name: 'Master Rod', category: 'rod', cost: 50_000, requiredChatLevel: 20, description: 'Catches common through legendary fish.', catchableRarities: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] },
  { id: 'celestial-rod', name: 'Celestial Rod', category: 'rod', cost: 250_000, requiredChatLevel: 50, description: 'Catches uncommon through legendary fish.', catchableRarities: ['Uncommon', 'Rare', 'Epic', 'Legendary'] },
  { id: 'god-rod', name: 'God Rod', category: 'rod', cost: 1_000_000, requiredChatLevel: 80, description: 'Catches rare, epic, legendary, and future Mythic fish.', catchableRarities: ['Rare', 'Epic', 'Legendary', 'Mythic'] },
  { id: 'basic-bait', name: 'Basic Bait', category: 'bait', cost: 0, description: 'Starter bait with no expedition modifier.' },
  { id: 'chum', name: 'Chum', category: 'bait', cost: 10_000, requiredChatLevel: 5, description: 'Each common or uncommon fish has a 10–30% chance to return one additional fish.' },
  { id: 'magnet', name: 'Magnet', category: 'bait', cost: 30_000, requiredChatLevel: 15, description: 'Increases each chest-spawn chance by 50% of its original odds.' },
  { id: 'sonar', name: 'Sonar', category: 'bait', cost: 75_000, requiredChatLevel: 25, description: 'Halves fish-roll success while doubling gear-find chance.' },
  { id: 'bloodworms', name: 'Bloodworms', category: 'bait', cost: 150_000, requiredChatLevel: 40, description: 'Each rare or epic fish has a 10–30% chance to return one additional fish.' },
  { id: 'mysterious-sea-food', name: 'Mysterious Sea Food', category: 'bait', cost: 250_000, requiredChatLevel: 55, description: 'Has a 20% chance to add 50% more fish rolls to an expedition.' },
  { id: 'truffle-worm', name: 'Truffle Worm', category: 'bait', cost: 1_000_000, requiredChatLevel: 80, description: 'Triples legendary odds, but only legendary fish can return.' },
  { id: 'sail', name: 'Sail', category: 'boat', cost: 10_000, requiredChatLevel: 10, description: 'Permanent boat upgrade that unlocks travel to the Warm Ocean.' },
  { id: 'abiotic-turbine', name: 'Abiotic Turbine', category: 'boat', cost: 25_000, requiredChatLevel: 20, description: 'Permanent boat upgrade that unlocks travel to the Hydroplant Reservoir.' },
  { id: 'submersible-pod', name: 'Submersible Pod', category: 'boat', cost: 60_000, requiredChatLevel: 30, description: 'Permanent boat upgrade that unlocks travel to the Sunken Sea.' },
  { id: 'magic-conch-navigator', name: 'Magic Conch Navigator', category: 'boat', cost: 100_000, requiredChatLevel: 40, description: 'Permanent boat upgrade that unlocks travel to the Kelp Forest.' },
  { id: 'drill-unit', name: 'Drill Unit', category: 'boat', cost: 150_000, requiredChatLevel: 50, description: 'Permanent boat upgrade that unlocks travel to the Crystaline Caverns.' },
  { id: 'radar-scanner', name: 'Radar Scanner', category: 'boat', cost: 250_000, requiredChatLevel: 60, description: 'Permanent boat upgrade that unlocks travel to Rallypoint Delta.' },
  { id: 'lucky-1', name: 'Lucky I', category: 'skill', cost: 2_500, description: 'Increases higher-rarity fishing odds by 5%.', higherRarityBonusPercent: 5 },
  { id: 'lucky-2', name: 'Lucky II', category: 'skill', cost: 15_000, description: 'Increases higher-rarity fishing odds by another 5%.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-1' },
  { id: 'lucky-3', name: 'Lucky III', category: 'skill', cost: 50_000, description: 'Increases higher-rarity fishing odds by another 5%.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-2' },
  { id: 'lucky-4', name: 'Lucky IV', category: 'skill', cost: 250_000, description: 'Increases higher-rarity fishing odds by another 5%.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-3' },
  { id: 'lucky-5', name: 'Lucky V', category: 'skill', cost: 1_000_000, description: 'Increases higher-rarity fishing odds by another 5%.', higherRarityBonusPercent: 5, requiredUpgradeId: 'lucky-4' },
  { id: 'cheapskate-1', name: 'Cheapskate I', category: 'skill', cost: 10_000, description: 'Reduces fishing-shop costs by 5%.', costReductionPercent: 5 },
  { id: 'cheapskate-2', name: 'Cheapskate II', category: 'skill', cost: 50_000, description: 'Reduces fishing-shop costs by another 5%.', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-1' },
  { id: 'cheapskate-3', name: 'Cheapskate III', category: 'skill', cost: 250_000, description: 'Reduces fishing-shop costs by another 5%.', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-2' },
  { id: 'cheapskate-4', name: 'Cheapskate IV', category: 'skill', cost: 1_000_000, description: 'Reduces fishing-shop costs by another 5%.', costReductionPercent: 5, requiredUpgradeId: 'cheapskate-3' },
  { id: 'money-mouser-1', name: 'Money Mouser I', category: 'skill', cost: 250_000, description: 'Increases money gained from fishing by 10%.', saleBonusPercent: 10 },
  { id: 'money-mouser-2', name: 'Money Mouser II', category: 'skill', cost: 1_000_000, description: 'Increases money gained from fishing by another 10%.', saleBonusPercent: 10, requiredUpgradeId: 'money-mouser-1' },
  { id: 'haste-1', name: 'Haste I', category: 'skill', cost: 10_000, description: 'Reduces expedition duration by 10%.', timeReductionPercent: 10 },
  { id: 'haste-2', name: 'Haste II', category: 'skill', cost: 25_000, description: 'Reduces expedition duration by another 10%.', timeReductionPercent: 10, requiredUpgradeId: 'haste-1' },
  { id: 'haste-3', name: 'Haste III', category: 'skill', cost: 100_000, description: 'Reduces expedition duration by another 10%.', timeReductionPercent: 10, requiredUpgradeId: 'haste-2' },
  { id: 'haste-4', name: 'Haste IV', category: 'skill', cost: 250_000, description: 'Reduces expedition duration by another 10%.', timeReductionPercent: 10, requiredUpgradeId: 'haste-3' },
  { id: 'gear-sea-star', name: 'Sea Star', category: 'gear', cost: 0, description: 'Permanent treasure: increases money gained from everything by 5%.' , saleBonusPercent: 5 },
  { id: 'gear-alien-engine', name: 'Alien Engine', category: 'gear', cost: 0, description: 'Permanent treasure: reduces expedition duration by 10%.', timeReductionPercent: 10 },
  { id: 'gear-dual-hook', name: 'Dual Hook', category: 'gear', cost: 0, description: 'Permanent treasure: adds one fish roll to every expedition.' },
  { id: 'gear-rod-improvement-kit', name: 'Rod Improvement Kit', category: 'gear', cost: 0, description: 'Permanent treasure: increases higher-rarity fishing odds by 5%.', higherRarityBonusPercent: 5 },
  { id: 'gear-lost-pursasion-device', name: 'Lost Pursasion Device', category: 'gear', cost: 0, description: 'Permanent treasure: reduces costs by 5%.', costReductionPercent: 5 },
  { id: 'gear-conduit', name: 'Conduit', category: 'gear', cost: 0, description: 'Permanent treasure: doubles gear-find chance.', foundBiomeIds: ['warm-ocean'] },
  { id: 'gear-reservoir-growth', name: 'Reservoir Growth', category: 'gear', cost: 0, description: 'Permanent treasure: raises chest-spawn chance by 10%.', foundBiomeIds: ['hydroplant-reservoir'] },
  { id: 'gear-giant-pearl', name: 'Giant Pearl', category: 'gear', cost: 0, description: 'Permanent treasure: reserves a 25% XP bonus for future XP-granting game rewards.', foundBiomeIds: ['sunken-sea'] },
  { id: 'gear-magic-conch', name: 'Magic Conch', category: 'gear', cost: 0, description: 'Permanent treasure: each fish has a 10% chance to upgrade one rarity.', foundBiomeIds: ['kelp-forest'] },
  { id: 'gear-gemcracker', name: 'Gemcracker', category: 'gear', cost: 0, description: 'Permanent treasure: reserves improved chest loot for the upcoming chest-opening system.', foundBiomeIds: ['crystaline-caverns'] },
  { id: 'gear-teleporter', name: 'Teleporter', category: 'gear', cost: 0, description: 'Permanent treasure: 5% chance to instantly complete a non-crew expedition.', foundBiomeIds: ['rallypoint-delta'] },
  { id: 'crew-1', name: 'Crew 1 Contract', category: 'crew', cost: 100_000, requiredChatLevel: 40, description: 'Unlocks Crew 1. Crew expeditions take 3x as long and earn half rewards.' },
  { id: 'crew-2', name: 'Crew 2 Contract', category: 'crew', cost: 250_000, requiredChatLevel: 80, description: 'Unlocks Crew 2. Requires Crew 1; crew expeditions take 3x as long and earn half rewards.' },
] as const;

const fish = (biomeId: FishingBiomeId, id: string, name: string, rarity: FishingRarity, minSaleValue: number, maxSaleValue: number, tags: readonly string[] = []): FishingFish => ({ biomeId, id, name, rarity, minSaleValue, maxSaleValue, tags });

export const FISHING_FISH: readonly FishingFish[] = [
  fish('harbor', 'carp', 'Carp', 'Common', 5, 8, ['silver']), fish('harbor', 'bluegill', 'Bluegill', 'Common', 5, 8, ['silver']), fish('harbor', 'trout', 'Trout', 'Common', 6, 9, ['silver']),
  fish('harbor', 'salmon', 'Salmon', 'Uncommon', 9, 13, ['silver']), fish('harbor', 'bass', 'Bass', 'Uncommon', 9, 13), fish('harbor', 'pike', 'Pike', 'Uncommon', 10, 14),
  fish('harbor', 'piranha', 'Piranha', 'Rare', 15, 22), fish('harbor', 'clownfish', 'Clownfish', 'Rare', 15, 22), fish('harbor', 'tuna', 'Tuna', 'Rare', 17, 24, ['deep']),
  fish('harbor', 'turtle', 'Turtle', 'Epic', 32, 45), fish('harbor', 'swordfish', 'Swordfish', 'Epic', 35, 50, ['deep']), fish('harbor', 'lionfish', 'Lionfish', 'Epic', 34, 48),
  fish('harbor', 'alligator', 'Alligator', 'Legendary', 100, 140), fish('harbor', 'shark', 'Shark', 'Legendary', 110, 150, ['deep']), fish('harbor', 'whale', 'Whale', 'Legendary', 120, 165, ['deep']), fish('harbor', 'giant-squid', 'Giant Squid', 'Legendary', 115, 160, ['deep']),

  fish('warm-ocean', 'ocean-fish', 'Fish', 'Common', 8, 12), fish('warm-ocean', 'tropical-fish', 'Tropical Fish', 'Uncommon', 14, 20), fish('warm-ocean', 'pufferfish', 'Pufferfish', 'Rare', 26, 36), fish('warm-ocean', 'dolphin', 'Dolphin', 'Epic', 60, 85), fish('warm-ocean', 'guardian', 'Guardian', 'Epic', 65, 90), fish('warm-ocean', 'elder-guardian', 'Elder Guardian', 'Legendary', 180, 250),
  fish('hydroplant-reservoir', 'antefish', 'Antefish', 'Common', 15, 20), fish('hydroplant-reservoir', 'portal-fish', 'Portal Fish', 'Uncommon', 25, 35), fish('hydroplant-reservoir', 'is-0098', 'IS0098', 'Rare', 45, 65), fish('hydroplant-reservoir', 'darkwater-fish', 'Darkwater Fish', 'Epic', 100, 145, ['deep']), fish('hydroplant-reservoir', 'corruscating-portal-fish', 'Corruscating Portal Fish', 'Legendary', 350, 500), fish('hydroplant-reservoir', 'amaranthic-is-0098', 'Amaranthic IS-0098', 'Legendary', 360, 510), fish('hydroplant-reservoir', 'saxe-darkwater-fish', 'Saxe Darkwater Fish', 'Legendary', 370, 520, ['deep']), fish('hydroplant-reservoir', 'darkwater-beast', 'Darkwater Beast', 'Legendary', 390, 550, ['deep']),
  fish('sunken-sea', 'greenwave-loach', 'Greenwave Loach', 'Common', 30, 45), fish('sunken-sea', 'prismatic-guppy', 'Prismatic Guppy', 'Uncommon', 55, 75), fish('sunken-sea', 'clam', 'Clam', 'Rare', 90, 130), fish('sunken-sea', 'eutrophic-ray', 'Eutrophic Ray', 'Rare', 100, 140), fish('sunken-sea', 'ghost-bell', 'Ghost Bell', 'Epic', 200, 300), fish('sunken-sea', 'prism-back', 'Prism-Back', 'Epic', 220, 320), fish('sunken-sea', 'giant-clam', 'Giant Clam', 'Legendary', 700, 1_000),
  fish('kelp-forest', 'jellyfish', 'Jellyfish', 'Common', 50, 70), fish('kelp-forest', 'nematodes', 'Nematodes', 'Common', 50, 70), fish('kelp-forest', 'groovy-jelly', 'Groovy Jelly', 'Uncommon', 80, 115), fish('kelp-forest', 'aggressive-jelly', 'Aggressive Jelly', 'Rare', 140, 200), fish('kelp-forest', 'seahorse', 'Seahorse', 'Epic', 320, 450), fish('kelp-forest', 'king-jelly', 'King Jelly', 'Epic', 340, 470), fish('kelp-forest', 'spongebob', 'Spongebob', 'Legendary', 1_150, 1_600), fish('kelp-forest', 'squidward', 'Squidward', 'Legendary', 1_150, 1_600), fish('kelp-forest', 'patrick', 'Patrick', 'Legendary', 1_200, 1_650), fish('kelp-forest', 'gary', 'Gary', 'Legendary', 1_100, 1_550),
  fish('crystaline-caverns', 'glyphid-swarmer', 'Glyphid Swarmer', 'Common', 75, 100), fish('crystaline-caverns', 'glyphid-exploder', 'Glyphid Exploder', 'Common', 75, 100), fish('crystaline-caverns', 'glyphid-grunt', 'Glyphid Grunt', 'Common', 80, 105), fish('crystaline-caverns', 'glyphid-web-spitter', 'Glyphid Web Spitter', 'Uncommon', 120, 170), fish('crystaline-caverns', 'glyphid-acid-spitter', 'Glyphid Acid Spitter', 'Uncommon', 125, 175), fish('crystaline-caverns', 'glyphid-slasher', 'Glyphid Slasher', 'Rare', 220, 310), fish('crystaline-caverns', 'glyphid-guard', 'Glyphid Guard', 'Rare', 230, 320), fish('crystaline-caverns', 'lootbug', 'Lootbug', 'Rare', 240, 330), fish('crystaline-caverns', 'glyphid-praetorian', 'Glyphid Praetorian', 'Epic', 500, 700), fish('crystaline-caverns', 'golden-lootbug', 'Golden Lootbug', 'Epic', 550, 750), fish('crystaline-caverns', 'glyphid-warden', 'Glyphid Warden', 'Epic', 520, 720), fish('crystaline-caverns', 'glyphid-dreadnought', 'Glyphid Dreadnought', 'Legendary', 1_800, 2_500), fish('crystaline-caverns', 'glyphid-hiveguard', 'Glyphid Hiveguard', 'Legendary', 1_850, 2_550), fish('crystaline-caverns', 'glyphid-bulk-detonator', 'Glyphid Bulk Detonator', 'Legendary', 1_900, 2_600), fish('crystaline-caverns', 'glyphid-oppressor', 'Glyphid Oppressor', 'Legendary', 1_900, 2_600),
  fish('rallypoint-delta', 'lemurian', 'Lemurian', 'Common', 120, 160), fish('rallypoint-delta', 'lesser-wisp', 'Lesser Wisp', 'Common', 125, 165), fish('rallypoint-delta', 'stone-golem', 'Stone Golem', 'Uncommon', 200, 275), fish('rallypoint-delta', 'imp', 'Imp', 'Uncommon', 210, 285), fish('rallypoint-delta', 'greater-wisp', 'Greater Wisp', 'Rare', 360, 500), fish('rallypoint-delta', 'bighorn-bison', 'Bighorn Bison', 'Rare', 375, 525), fish('rallypoint-delta', 'void-reaver', 'Void Reaver', 'Epic', 850, 1_200), fish('rallypoint-delta', 'clay-dunestrider', 'Clay Dunestrider', 'Legendary', 3_000, 4_250), fish('rallypoint-delta', 'imp-overlord', 'Imp Overlord', 'Legendary', 3_100, 4_350), fish('rallypoint-delta', 'magma-worm', 'Magma Worm', 'Legendary', 3_200, 4_500), fish('rallypoint-delta', 'scavenger', 'Scavenger', 'Legendary', 3_000, 4_250),
] as const;

/** Reserved for the Mythic fish catalogue. Mythic catches are intentionally not live yet. */
export const FISHING_MYTHIC_FISH: readonly FishingFish[] = [];

const rarityRank: Record<FishingRarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5 };
const rarityWeight: Record<FishingRarity, number> = { Common: 1_000, Uncommon: 200, Rare: 100, Epic: 20, Legendary: 1, Mythic: 0 };
const chestDropRate: Record<FishingChestRarity, number> = { Common: 0.20, Uncommon: 0.10, Rare: 0.05, Epic: 0.01, Legendary: 0.001 };
const GEAR_DROP_RATE = 0.001;

export function getFishingBiome(biomeId: string) { return FISHING_BIOMES.find((biome) => biome.id === biomeId); }
export function getFishingExpeditionLength(tier: number) { return FISHING_EXPEDITION_LENGTHS.find((length) => length.tier === tier); }
export function getFishingUpgrade(itemId: string) { return FISHING_UPGRADES.find((upgrade) => upgrade.id === itemId); }
export function getFishingUpgradeCategoryItems(category: FishingUpgradeCategory) { return FISHING_UPGRADES.filter((upgrade) => upgrade.category === category); }

function getOwnedFishingUpgrades(itemIds: readonly string[]) {
  return itemIds.map(getFishingUpgrade).filter((item): item is FishingUpgrade => Boolean(item));
}

export function getFishingUpgradeCost(upgrade: FishingUpgrade, ownedItemIds: readonly string[]) {
  const costReductionPercent = getOwnedFishingUpgrades(ownedItemIds)
    .reduce((total, item) => total + (item.costReductionPercent ?? 0), 0);
  return Math.max(0, Math.ceil(upgrade.cost * Math.max(0, 1 - (costReductionPercent / 100))));
}

export function getFishingTimeReductionPercent(equipment: FishingEquipmentSnapshot) {
  return Math.min(90, getOwnedFishingUpgrades(equipment.passiveItemIds)
    .reduce((total, item) => total + (item.timeReductionPercent ?? 0), 0));
}

export function shouldInstantlyCompleteFishingExpedition(equipment: FishingEquipmentSnapshot, outcomeSeed: number, isCrew: boolean) {
  return !isCrew && equipment.passiveItemIds.includes('gear-teleporter') && outcomeSeed % 20 === 0;
}

export function formatFishingDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function calculateFishingDurationSeconds(durationTier: FishingDurationTier, isCrew: boolean, timeReductionPercent = 0) {
  const length = getFishingExpeditionLength(durationTier);
  if (!length) return null;
  const baseDuration = length.durationSeconds * (isCrew ? 3 : 1);
  return Math.max(1, Math.round(baseDuration * Math.max(0, 1 - (timeReductionPercent / 100))));
}

function createSeededRandom(seed: number) {
  let state = (Math.trunc(seed) >>> 0) || 0x9E3779B9;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weightedPick<T>(items: readonly T[], getWeight: (item: T) => number, random: () => number) {
  const totalWeight = items.reduce((total, item) => total + Math.max(0, getWeight(item)), 0);
  if (totalWeight <= 0) return items[0];
  let cursor = random() * totalWeight;
  for (const item of items) {
    cursor -= Math.max(0, getWeight(item));
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function chooseChestRarity(biome: FishingBiome, random: () => number, dropRateMultiplier: number) {
  const totalRate = biome.chestRarities.reduce((total, rarity) => total + chestDropRate[rarity], 0);
  if (random() >= Math.min(1, totalRate * dropRateMultiplier)) return null;
  return weightedPick(biome.chestRarities, (rarity) => chestDropRate[rarity], random);
}

export function resolveFishingExpedition(biomeId: FishingBiomeId, durationTier: FishingDurationTier, equipment: FishingEquipmentSnapshot, seed: number, isCrew = false): FishingExpeditionResult {
  const biome = getFishingBiome(biomeId);
  const rod = getFishingUpgrade(equipment.rodItemId);
  const bait = getFishingUpgrade(equipment.baitItemId);
  const length = getFishingExpeditionLength(durationTier);
  if (!biome || !rod?.catchableRarities || !length || bait?.category !== 'bait') throw new Error('Fishing expedition contains invalid equipment data.');

  const passives = getOwnedFishingUpgrades(equipment.passiveItemIds);
  const higherRarityBonus = passives.reduce((total, item) => total + (item.higherRarityBonusPercent ?? 0), 0);
  const saleMultiplier = 1 + (passives.reduce((total, item) => total + (item.saleBonusPercent ?? 0), 0) / 100);
  const fishCandidates = [...FISHING_FISH, ...FISHING_MYTHIC_FISH]
    .filter((entry) => entry.biomeId === biomeId && rod.catchableRarities!.includes(entry.rarity));
  if (fishCandidates.length === 0) throw new Error('No fish are available for this expedition.');

  const random = createSeededRandom(seed);
  const catches: ResolvedFishingCatch[] = [];
  const chestItems = new Map<string, number>();
  const gearItems = new Map<string, number>();
  const foundGearItemIds = new Set(equipment.passiveItemIds);
  const availableGear = () => FISHING_UPGRADES.filter((item) => item.category === 'gear'
    && !foundGearItemIds.has(item.id)
    && (!item.foundBiomeIds || item.foundBiomeIds.includes(biomeId)));
  const chestDropRateMultiplier = (bait.id === 'magnet' ? 1.5 : 1)
    * (equipment.passiveItemIds.includes('gear-reservoir-growth') ? 1.1 : 1);
  const gearDropRateMultiplier = (bait.id === 'sonar' ? 2 : 1)
    * (equipment.passiveItemIds.includes('gear-conduit') ? 2 : 1);
  let fishSaleValue = 0;
  const baseCatchCount = length.catchCount[0] + Math.floor(random() * (length.catchCount[1] - length.catchCount[0] + 1));
  const mysteriousSeaFoodExtraRolls = bait.id === 'mysterious-sea-food' && random() < 0.2
    ? Math.ceil(baseCatchCount * 0.5)
    : 0;
  const catchCount = baseCatchCount + mysteriousSeaFoodExtraRolls + (equipment.passiveItemIds.includes('gear-dual-hook') ? 1 : 0);

  const chooseFish = () => weightedPick(fishCandidates, (candidate) => {
    const rarityMultiplier = rarityRank[candidate.rarity] === 0 ? 1 : 1 + (higherRarityBonus / 100);
    const truffleMultiplier = bait.id === 'truffle-worm' && candidate.rarity === 'Legendary' ? 3 : 1;
    return rarityWeight[candidate.rarity] * rarityMultiplier * truffleMultiplier;
  }, random);

  const maybeUpgradeFishRarity = (fish: FishingFish) => {
    if (!equipment.passiveItemIds.includes('gear-magic-conch') || random() >= 0.1) return fish;
    const upgradedCandidates = fishCandidates.filter((candidate) => rarityRank[candidate.rarity] === rarityRank[fish.rarity] + 1);
    return upgradedCandidates.length > 0
      ? weightedPick(upgradedCandidates, (candidate) => rarityWeight[candidate.rarity], random)
      : fish;
  };

  const addFish = (fish: FishingFish) => {
    const upgradedFish = maybeUpgradeFishRarity(fish);
    const soloSaleValue = Math.max(1, Math.round((upgradedFish.minSaleValue + (random() * (upgradedFish.maxSaleValue - upgradedFish.minSaleValue))) * saleMultiplier));
    const saleValue = isCrew ? Math.floor(soloSaleValue / 2) : soloSaleValue;
    fishSaleValue += saleValue;
    catches.push({ kind: 'fish', name: upgradedFish.name, rarity: upgradedFish.rarity, saleValue });
  };

  for (let index = 0; index < catchCount; index += 1) {
    const chestRarity = chooseChestRarity(biome, random, chestDropRateMultiplier);
    if (chestRarity) {
      const itemId = `${chestRarity.toLowerCase()}-chest`;
      chestItems.set(itemId, (chestItems.get(itemId) ?? 0) + 1);
      catches.push({ kind: 'chest', name: `${chestRarity} Chest`, rarity: chestRarity, itemId });
    }

    const eligibleGear = availableGear();
    if (eligibleGear.length > 0 && random() < GEAR_DROP_RATE * gearDropRateMultiplier) {
      const gear = weightedPick(eligibleGear, () => 1, random);
      foundGearItemIds.add(gear.id);
      gearItems.set(gear.id, 1);
      catches.push({ kind: 'gear', name: gear.name, itemId: gear.id });
    }

    if (bait.id === 'sonar' && random() >= 0.5) continue;
    const selectedFish = chooseFish();
    if (bait.id === 'truffle-worm' && selectedFish.rarity !== 'Legendary') continue;
    addFish(selectedFish);

    const bonusFishChance = (bait.id === 'chum' && (selectedFish.rarity === 'Common' || selectedFish.rarity === 'Uncommon'))
      || (bait.id === 'bloodworms' && (selectedFish.rarity === 'Rare' || selectedFish.rarity === 'Epic'))
      ? 0.1 + (random() * 0.2)
      : 0;
    if (random() < bonusFishChance) addFish(selectedFish);
  }

  return {
    catches,
    chestItems: [...chestItems.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    fishSaleValue,
    gearItems: [...gearItems.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    knowBucksFound: 0,
  };
}
