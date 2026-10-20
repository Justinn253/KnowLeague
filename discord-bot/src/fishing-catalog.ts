export const FISHING_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export const FISHING_CRATE_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

export type FishingRarity = typeof FISHING_RARITIES[number];
export type FishingCrateRarity = typeof FISHING_CRATE_RARITIES[number];
export type FishingBiomeId = 'harbor' | 'warm-ocean' | 'hydroplant-reservoir' | 'sunken-sea' | 'kelp-forest' | 'crystaline-caverns' | 'rallypoint-delta';
export type FishingEventId = 'halloween';
export const HALLOWEEN_EVENT_CATALOGUE_BIOME_ID = 'hellish-abyss' as const;
export type FishingEventCatalogueBiomeId = typeof HALLOWEEN_EVENT_CATALOGUE_BIOME_ID;
export type FishingUpgradeCategory = 'rod' | 'bait' | 'boat' | 'gear' | 'skill' | 'crew';
export type FishingDurationTier = 1 | 2 | 3 | 4;

export interface FishingBiome {
  crateRarities: readonly FishingCrateRarity[];
  description: string;
  id: FishingBiomeId;
  name: string;
  requiredBoatUpgradeId?: string;
}

export interface FishingExpeditionLength {
  catchCount: readonly [number, number];
  durationSeconds: number;
  higherRarityWeightBonusPercent: number;
  requiredFishingLevel: number;
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

export interface FishingCrate {
  biomeId: FishingBiomeId;
  id: string;
  name: string;
  rarity: FishingCrateRarity;
}

export interface FishingCrateLoot {
  biomeId: FishingBiomeId;
  id: string;
  maxSaleValue: number;
  minSaleValue: number;
  name: string;
  rarity: FishingCrateRarity;
  valueBonusPercent: number;
}

export interface FishingEventFish {
  id: string;
  name: string;
  nonSellable?: boolean;
  rarity: FishingRarity;
}

export interface FishingEventCrate {
  id: string;
  items: readonly string[];
  name: string;
  rarity: FishingCrateRarity;
}

export interface FishingEventTitle {
  /** Persistent inventory ID. The gear prefix preserves the existing unique-item settlement contract. */
  itemId: string;
  name: string;
  /** Chance per fish caught while the event is active (weight 1 against Common's 1,000). */
  dropRate: number;
}

export interface FishingEvent {
  biomeName: string;
  catalogueBiomeId: FishingEventCatalogueBiomeId;
  crates: readonly FishingEventCrate[];
  fish: readonly FishingEventFish[];
  id: FishingEventId;
  name: string;
  replacementChance: number;
  title: FishingEventTitle;
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
  requiredFishingLevel?: number;
  requiredUpgradeId?: string;
  saleBonusPercent?: number;
  timeReductionPercent?: number;
}

/** The saved, self-contained configuration for a started expedition. */
export interface FishingEquipmentSnapshot {
  baitItemId: string;
  boatItemId?: string;
  /** Fish already catalogued when the trip launched, used by Pearl Diver's Log. */
  catalogueFishKeys?: string[];
  catalogueVersion: 2 | 3 | 4 | 5 | 6 | 7;
  /** The active event selected when this trip launched. */
  eventId?: FishingEventId;
  /** Bonuses locked in when an expedition starts, so later config changes cannot alter it. */
  modifiers?: FishingExpeditionModifiers;
  passiveItemIds: string[];
  rodItemId: string;
  storageItemId?: string;
  /** Existing event titles, captured to avoid rolling duplicate unique titles. */
  titleItemIds?: string[];
}

export interface FishingExpeditionModifiers {
  /** Number of consecutive Genesys Loop relaunches before this trip. */
  genesysLoopCount?: number;
  /** The Early Bird Bell's first-launch-of-the-day bonus was eligible at launch. */
  earlyBirdBonus?: boolean;
  doubleKnowBucks?: boolean;
  doubleXp?: boolean;
  extraCrateLoot?: boolean;
  higherFishRarity?: boolean;
  roleBonus?: boolean;
  /** Streak Charm's launch-time value bonus, capped at 10%. */
  streakSaleBonusPercent?: number;
  shorterExpeditions?: boolean;
}

export interface ResolvedFishingFishCatch {
  catalogueBiomeId?: FishingEventCatalogueBiomeId;
  itemId?: string;
  kind: 'fish';
  name: string;
  nonSellable?: boolean;
  quantity: number;
  rarity: FishingRarity;
  saleValue: number;
}

export interface ResolvedFishingCrateCatch {
  itemId: string;
  kind: 'crate';
  lootItemId: string;
  lootName: string;
  lootRarity: FishingCrateRarity;
  name: string;
  quantity: number;
  rarity: FishingCrateRarity;
  saleValue: number;
}

export interface ResolvedFishingGearCatch {
  itemId: string;
  kind: 'gear';
  name: string;
  quantity: number;
}

export interface ResolvedFishingTitleCatch {
  itemId: string;
  kind: 'title';
  name: string;
  quantity: number;
}

export type ResolvedFishingCatch = ResolvedFishingFishCatch | ResolvedFishingCrateCatch | ResolvedFishingGearCatch | ResolvedFishingTitleCatch;

export interface FishingExpeditionResult {
  catches: ResolvedFishingCatch[];
  crateSaleValue: number;
  fishingCrateXp: number;
  fishingExpeditionXp: number;
  fishingXpAwarded: number;
  fishSaleValue: number;
  gearItems: Array<{ itemId: string; quantity: number }>;
  knowBucksFound: number;
  /** Inventory-only event collectibles and titles settled alongside Relics. */
  specialItems?: Array<{ itemId: string; quantity: number }>;
}

export interface FishingCrateOpeningResult {
  crate: FishingCrate;
  items: Array<{ itemId: string; name: string; quantity: number; rarity: FishingCrateRarity; saleValue: number }>;
  totalSaleValue: number;
}

export const FISHING_BIOMES: readonly FishingBiome[] = [
  { id: 'harbor', name: 'Harbor', description: 'Free starting waters with a broad mix of familiar catches.', crateRarities: ['Common', 'Uncommon'] },
  { id: 'warm-ocean', name: 'Warm Ocean', description: 'Bright open waters unlocked by the Sail boat upgrade.', requiredBoatUpgradeId: 'sail', crateRarities: ['Uncommon', 'Rare', 'Epic'] },
  { id: 'hydroplant-reservoir', name: 'Hydroplant Reservoir', description: 'An unstable industrial reservoir unlocked by the Abiotic Turbine.', requiredBoatUpgradeId: 'abiotic-turbine', crateRarities: ['Common', 'Uncommon', 'Rare'] },
  { id: 'sunken-sea', name: 'Sunken Sea', description: 'A submerged world reached with the Submersible Pod.', requiredBoatUpgradeId: 'submersible-pod', crateRarities: ['Uncommon', 'Rare'] },
  { id: 'kelp-forest', name: 'Kelp Forest', description: 'A strange jelly-filled biome reached with the Magic Conch Navigator.', requiredBoatUpgradeId: 'magic-conch-navigator', crateRarities: ['Uncommon', 'Rare'] },
  { id: 'crystaline-caverns', name: 'Crystaline Caverns', description: 'A dangerous underground biome reached with the Drill Unit.', requiredBoatUpgradeId: 'drill-unit', crateRarities: ['Rare', 'Epic', 'Legendary'] },
  { id: 'rallypoint-delta', name: 'Rallypoint Delta', description: 'A hostile high-tier frontier reached with the Radar Scanner.', requiredBoatUpgradeId: 'radar-scanner', crateRarities: ['Epic', 'Legendary'] },
] as const;

const crate = (biomeId: FishingBiomeId, rarity: FishingCrateRarity, name: string): FishingCrate => ({
  biomeId,
  id: `${biomeId}-${rarity.toLowerCase()}-crate`,
  name,
  rarity,
});

export const FISHING_CRATES: readonly FishingCrate[] = [
  crate('harbor', 'Common', 'Damaged Crate'),
  crate('harbor', 'Uncommon', 'Wooden Crate'),
  crate('harbor', 'Rare', 'Hardened Crate'),
  crate('harbor', 'Epic', 'Pristine Crate'),
  crate('harbor', 'Legendary', 'Gem-Crusted Crate'),
  crate('warm-ocean', 'Common', 'Waterlogged Crate'),
  crate('warm-ocean', 'Uncommon', 'Coral Crate'),
  crate('warm-ocean', 'Rare', 'Fishing Crate'),
  crate('warm-ocean', 'Epic', 'Ender Crate'),
  crate('warm-ocean', 'Legendary', 'Guardian Crate'),
  crate('hydroplant-reservoir', 'Common', 'Storage Crate'),
  crate('hydroplant-reservoir', 'Uncommon', 'Hydro Crate'),
  crate('hydroplant-reservoir', 'Rare', 'Compact Storage Crate'),
  crate('hydroplant-reservoir', 'Epic', 'Void Chest'),
  crate('hydroplant-reservoir', 'Legendary', 'Otherwordly Crate'),
  crate('sunken-sea', 'Common', 'Wooden Crate'),
  crate('sunken-sea', 'Uncommon', 'Iron Crate'),
  crate('sunken-sea', 'Rare', 'Water Crate'),
  crate('sunken-sea', 'Epic', 'Eutrophic Crate'),
  crate('sunken-sea', 'Legendary', 'Prism Crate'),
  crate('kelp-forest', 'Common', 'Mossy Crate'),
  crate('kelp-forest', 'Uncommon', 'Supply Crate'),
  crate('kelp-forest', 'Rare', 'Sponge Crate'),
  crate('kelp-forest', 'Epic', 'Magic Crate'),
  crate('kelp-forest', 'Legendary', 'Buried Crate'),
  crate('crystaline-caverns', 'Common', 'Dusty Crate'),
  crate('crystaline-caverns', 'Uncommon', 'Stone Crate'),
  crate('crystaline-caverns', 'Rare', 'Crystallized Crate'),
  crate('crystaline-caverns', 'Epic', 'Alien Crate'),
  crate('crystaline-caverns', 'Legendary', 'Technological Crate'),
  crate('rallypoint-delta', 'Common', 'Damaged UES Crate'),
  crate('rallypoint-delta', 'Uncommon', 'UES Crate'),
  crate('rallypoint-delta', 'Rare', 'Mechanical Crate'),
  crate('rallypoint-delta', 'Epic', 'Military Crate'),
  crate('rallypoint-delta', 'Legendary', 'Lunar Crate'),
] as const;

export const FISHING_EXPEDITION_LENGTHS: readonly FishingExpeditionLength[] = [
  { tier: 1, requiredFishingLevel: 0, durationSeconds: 5, catchCount: [1, 1], higherRarityWeightBonusPercent: 0 },
  { tier: 2, requiredFishingLevel: 10, durationSeconds: 60, catchCount: [12, 12], higherRarityWeightBonusPercent: 5 },
  { tier: 3, requiredFishingLevel: 20, durationSeconds: 600, catchCount: [120, 120], higherRarityWeightBonusPercent: 10 },
  { tier: 4, requiredFishingLevel: 30, durationSeconds: 3_600, catchCount: [720, 720], higherRarityWeightBonusPercent: 15 },
] as const;

/**
 * Active trips from before the beta length-scale revision resolve with the
 * rules that were saved when they launched. New trips always use the current
 * FISHING_EXPEDITION_LENGTHS values above.
 */
const LEGACY_FISHING_EXPEDITION_LENGTHS: readonly FishingExpeditionLength[] = [
  { tier: 1, requiredFishingLevel: 0, durationSeconds: 30, catchCount: [1, 1], higherRarityWeightBonusPercent: 0 },
  { tier: 2, requiredFishingLevel: 10, durationSeconds: 60, catchCount: [2, 3], higherRarityWeightBonusPercent: 0 },
  { tier: 3, requiredFishingLevel: 20, durationSeconds: 120, catchCount: [5, 6], higherRarityWeightBonusPercent: 0 },
  { tier: 4, requiredFishingLevel: 30, durationSeconds: 300, catchCount: [12, 15], higherRarityWeightBonusPercent: 0 },
] as const;

export const FISHING_UPGRADES: readonly FishingUpgrade[] = [
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
  { id: 'gear-sea-star', name: 'Sea Star', category: 'gear', cost: 0, description: 'Permanent relic: increases money gained from everything by 5%.', saleBonusPercent: 5 },
  { id: 'gear-alien-engine', name: 'Alien Engine', category: 'gear', cost: 0, description: 'Permanent relic: reduces expedition duration by 10%.', timeReductionPercent: 10 },
  { id: 'gear-dual-hook', name: 'Dual Hook', category: 'gear', cost: 0, description: 'Permanent relic: adds one fish roll to every expedition.' },
  { id: 'gear-rod-improvement-kit', name: 'Rod Improvement Kit', category: 'gear', cost: 0, description: 'Permanent relic: increases higher-rarity fishing odds by 5%.', higherRarityBonusPercent: 5 },
  { id: 'gear-lost-pursasion-device', name: 'Lost Pursasion Device', category: 'gear', cost: 0, description: 'Permanent relic: reduces costs by 5%.', costReductionPercent: 5 },
  { id: 'gear-conduit', name: 'Conduit', category: 'gear', cost: 0, description: 'Permanent relic: doubles relic-find chance.', foundBiomeIds: ['warm-ocean'] },
  { id: 'gear-reservoir-growth', name: 'Reservoir Growth', category: 'gear', cost: 0, description: 'Permanent relic: raises crate-spawn chance by 10%.', foundBiomeIds: ['hydroplant-reservoir'] },
  { id: 'gear-giant-pearl', name: 'Giant Pearl', category: 'gear', cost: 0, description: 'Permanent relic: increases Fishing XP earned by 25%.', foundBiomeIds: ['sunken-sea'] },
  { id: 'gear-magic-conch', name: 'Magic Conch', category: 'gear', cost: 0, description: 'Permanent relic: each fish has a 10% chance to upgrade one rarity.', foundBiomeIds: ['kelp-forest'] },
  { id: 'gear-gemcracker', name: 'Gemcracker', category: 'gear', cost: 0, description: 'Permanent relic: reserves improved crate loot for a future balance update.', foundBiomeIds: ['crystaline-caverns'] },
  { id: 'gear-teleporter', name: 'Teleporter', category: 'gear', cost: 0, description: 'Permanent relic: 5% chance to instantly complete a non-crew expedition.', foundBiomeIds: ['rallypoint-delta'] },
  { id: 'gear-lucky-coin', name: 'Lucky Coin', category: 'gear', cost: 0, description: 'Permanent relic: each fish or crate catch has a 3% chance to sell for double.', },
  { id: 'gear-streak-charm', name: 'Streak Charm', category: 'gear', cost: 0, description: 'Permanent relic: consecutive expeditions in the same location gain 0.5% value each, up to 10%; changing location resets the streak.', },
  { id: 'gear-early-bird-bell', name: 'Early Bird Bell', category: 'gear', cost: 0, description: 'Permanent relic: the first expedition launched each UTC day earns 50% more KnowBucks.', },
  { id: 'gear-knowleague-lure', name: 'KnowLeague Lure', category: 'gear', cost: 0, description: 'Permanent relic: legendary fish sell for 10% more.', },
  { id: 'gear-dockhands-ledger', name: "Harbor Dockhand's Ledger", category: 'gear', cost: 0, description: 'Permanent relic: crew expeditions earn 2.5% more KnowBucks.', foundBiomeIds: ['harbor'] },
  { id: 'gear-sunstone', name: 'Sunstone', category: 'gear', cost: 0, description: 'Permanent relic: Warm Ocean fish value rolls skew toward the top of their ranges.', foundBiomeIds: ['warm-ocean'] },
  { id: 'gear-genesys-loop', name: 'Genesys Loop', category: 'gear', cost: 0, description: 'Permanent relic: after an expedition settles, launches the same preset again up to twice in a row.', foundBiomeIds: ['hydroplant-reservoir'] },
  { id: 'gear-pearl-divers-log', name: "Pearl Diver's Log", category: 'gear', cost: 0, description: 'Permanent relic: the first catch of each fish pays five times its normal value.', foundBiomeIds: ['sunken-sea'] },
  { id: 'gear-tangle-net', name: 'Tangle Net', category: 'gear', cost: 0, description: 'Permanent relic: each distinct fish rarity in a haul adds 3% value to its fish sales.', foundBiomeIds: ['kelp-forest'] },
  { id: 'gear-crystal-resonator', name: 'Crystal Resonator', category: 'gear', cost: 0, description: 'Permanent relic: epic and legendary fish sell for 10% more.', foundBiomeIds: ['crystaline-caverns'] },
  { id: 'gear-autopilot-relay', name: 'Autopilot Relay', category: 'gear', cost: 0, description: 'Permanent relic: crew expeditions earn 20% more KnowBucks and finish 10% faster.', foundBiomeIds: ['rallypoint-delta'] },
  { id: 'crew-1', name: 'Crew 1 Contract', category: 'crew', cost: 100_000, requiredFishingLevel: 40, description: 'Unlocks Crew 1. Crew expeditions take 3x as long.' },
  { id: 'crew-2', name: 'Crew 2 Contract', category: 'crew', cost: 250_000, requiredFishingLevel: 80, description: 'Unlocks Crew 2. Requires Crew 1; crew expeditions take 3x as long.' },
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

const halloweenFish = (id: string, name: string, rarity: FishingRarity, nonSellable = false): FishingEventFish => ({
  id,
  name,
  nonSellable,
  rarity,
});

const halloweenCrate = (id: string, name: string, rarity: FishingCrateRarity, items: readonly string[]): FishingEventCrate => ({
  id,
  items,
  name,
  rarity,
});

/**
 * Active event content is kept outside the ordinary biome catalogue: it can
 * temporarily replace any selected expedition while retaining that selected
 * biome's sale-value ranges and expedition length.
 */
export const FISHING_EVENTS: readonly FishingEvent[] = [{
  biomeName: 'Hellish Abyss',
  catalogueBiomeId: HALLOWEEN_EVENT_CATALOGUE_BIOME_ID,
  crates: [
    halloweenCrate('halloween-ribcage', 'Ribcage', 'Common', ['Heart', 'Lungs', 'Intenstines', 'Spine']),
    halloweenCrate('halloween-sunken-jack-o-lantern', 'Sunken Jack-o-Lantern', 'Uncommon', ['Ghostly Figurine', 'Spider Eggs']),
    halloweenCrate('halloween-bloody-corpse', 'Bloody Corpse', 'Rare', ['Bloody Hands', 'Bloated Eye', 'Long-lost Letter']),
    halloweenCrate('halloween-satanic-pouch', 'Satanic Pouch', 'Epic', ['Watching Eye', 'Pentagram', 'Otherwordly Idol']),
    halloweenCrate('halloween-black-void-rift', 'Black-Void Rift', 'Legendary', ['Void Pearl', 'Hellish Embryo', 'Cthonic Void', 'Alluring Eye']),
  ],
  fish: [
    halloweenFish('oarfish', 'Oarfish', 'Common'),
    halloweenFish('angler-fish', 'Angler Fish', 'Common'),
    halloweenFish('skelly-fish', 'Skelly Fish', 'Uncommon'),
    halloweenFish('decayed-crab', 'Decayed Crab', 'Uncommon'),
    halloweenFish('blobfish', 'Blobfish', 'Rare'),
    halloweenFish('jack-o-fish', 'Jack-o-fish', 'Rare'),
    halloweenFish('slimy-abomination', 'Slimy Abomination', 'Rare'),
    halloweenFish('ghost-angler', 'Ghost Angler', 'Epic'),
    halloweenFish('living-corpse', 'Living Corpse', 'Epic'),
    halloweenFish('familiar-face', 'Familiar Face', 'Epic'),
    halloweenFish('1000-tentacle-squid', '1000-Tentacle Squid', 'Legendary'),
    halloweenFish('davy-jones', 'Davy Jones', 'Legendary'),
    halloweenFish('abyssal-mermaid', 'Abyssal Mermaid', 'Legendary'),
    halloweenFish('lost-soul', 'Lost Soul', 'Legendary'),
    halloweenFish('cthulhu', 'Cthulhu', 'Mythic', true),
  ],
  id: 'halloween',
  name: 'Halloween Event',
  replacementChance: 0.25,
  title: {
    dropRate: 0.001,
    itemId: 'gear-title-ghoulish-seafarer',
    name: 'Ghoulish Seafarer',
  },
}] as const;

export const FISHING_HALLOWEEN_FISH_RARITY_WEIGHTS: Readonly<Record<FishingRarity, number>> = {
  Common: 1_000,
  Uncommon: 200,
  Rare: 50,
  Epic: 10,
  Legendary: 1,
  Mythic: 0.1,
};

export function getFishingEvent(eventId: string | undefined | null) {
  return FISHING_EVENTS.find((event) => event.id === eventId);
}

/**
 * A 1-in-4 seed partition makes the event roll deterministic and exactly 25%
 * for newly launched expeditions without advancing their reward RNG stream.
 */
export function getFishingEventForOutcomeSeed(outcomeSeed: number) {
  const activeEvent = FISHING_EVENTS[0];
  return activeEvent && Math.abs(Math.trunc(outcomeSeed)) % 4 === 0 ? activeEvent : undefined;
}

function crateLoot(biomeId: FishingBiomeId, rarity: FishingCrateRarity, names: readonly string[]): FishingCrateLoot[] {
  const comparableFish = FISHING_FISH.filter((entry) => entry.biomeId === biomeId && entry.rarity === rarity);
  if (comparableFish.length === 0) throw new Error(`Crate loot requires ${rarity} fish in ${biomeId}.`);
  const averageMinSaleValue = comparableFish.reduce((total, fish) => total + fish.minSaleValue, 0) / comparableFish.length;
  const averageMaxSaleValue = comparableFish.reduce((total, fish) => total + fish.maxSaleValue, 0) / comparableFish.length;
  const increment = names.length > 1 ? 30 / (names.length - 1) : 15;
  return names.map((name, index) => {
    const valueBonusPercent = Math.round(index * increment);
    const valueMultiplier = 1 + (valueBonusPercent / 100);
    const minSaleValue = Math.max(1, Math.round(averageMinSaleValue * valueMultiplier));
    return {
      biomeId,
      id: `${biomeId}-${rarity.toLowerCase()}-loot-${index + 1}`,
      maxSaleValue: Math.max(minSaleValue, Math.round(averageMaxSaleValue * valueMultiplier)),
      minSaleValue,
      name,
      rarity,
      valueBonusPercent,
    };
  });
}

export const FISHING_CRATE_LOOT: readonly FishingCrateLoot[] = [
  ...crateLoot('harbor', 'Common', ['Soggy Boot', 'Cool Stick']),
  ...crateLoot('harbor', 'Uncommon', ['Silver Fork', 'Sea Glass']),
  ...crateLoot('harbor', 'Rare', ['Beautiful Shell', 'Message in a Bottle']),
  ...crateLoot('harbor', 'Epic', ['Aquamarine Gem', 'Gold Nugget']),
  ...crateLoot('harbor', 'Legendary', ['Diamond Necklace', 'Lost Heirloom']),
  ...crateLoot('warm-ocean', 'Common', ['Sand Block', 'Gravel Block', 'Clay Block']),
  ...crateLoot('warm-ocean', 'Uncommon', ['Coral Block', 'Sea Grass']),
  ...crateLoot('warm-ocean', 'Rare', ['Ink Sac', 'Shark Tooth']),
  ...crateLoot('warm-ocean', 'Epic', ['Enchanted Book', 'Treasure Map']),
  ...crateLoot('warm-ocean', 'Legendary', ['Heart of the Ocean', 'Conduit']),
  ...crateLoot('hydroplant-reservoir', 'Common', ['Hydro Pipe', 'Cog']),
  ...crateLoot('hydroplant-reservoir', 'Uncommon', ['Rotary Pump', 'Coil Winding']),
  ...crateLoot('hydroplant-reservoir', 'Rare', ['Motor', 'Toroidal Power Transformer']),
  ...crateLoot('hydroplant-reservoir', 'Epic', ['Transformer Bushing', 'Photon Receptor']),
  ...crateLoot('hydroplant-reservoir', 'Legendary', ['IS-0023 Figurine', 'IS-0059 Figurine']),
  ...crateLoot('sunken-sea', 'Common', ['Navystone', 'Eutrophic Sand']),
  ...crateLoot('sunken-sea', 'Uncommon', ['Sea Prism', 'Prism Shard']),
  ...crateLoot('sunken-sea', 'Rare', ['White Pearl', 'Mollusk Husk']),
  ...crateLoot('sunken-sea', 'Epic', ['Black Pearl', 'Pink Pearl']),
  ...crateLoot('sunken-sea', 'Legendary', ['Music Box', 'Giant Clam Trophy']),
  ...crateLoot('kelp-forest', 'Common', ['Kelp']),
  ...crateLoot('kelp-forest', 'Uncommon', ['Bench', 'Tent']),
  ...crateLoot('kelp-forest', 'Rare', ['Piece of Sponge']),
  ...crateLoot('kelp-forest', 'Epic', ['Broken Conch']),
  ...crateLoot('kelp-forest', 'Legendary', ['Kelp Forest Map', 'Crashed Plane']),
  ...crateLoot('crystaline-caverns', 'Common', ['Quartz', 'Spider Web']),
  ...crateLoot('crystaline-caverns', 'Uncommon', ['Blue Crystal', 'Morkite']),
  ...crateLoot('crystaline-caverns', 'Rare', ['Aquarq', 'Electrocrystal']),
  ...crateLoot('crystaline-caverns', 'Epic', ['Wall Eye', 'Bismor']),
  ...crateLoot('crystaline-caverns', 'Legendary', ['Jadiz', 'ERR://23¤Y%/']),
  ...crateLoot('rallypoint-delta', 'Common', ['Barrel', 'Chest']),
  ...crateLoot('rallypoint-delta', 'Uncommon', ['Large Chest', '3D Printer']),
  ...crateLoot('rallypoint-delta', 'Rare', ['Crashed Drone', 'Lunar Coin']),
  ...crateLoot('rallypoint-delta', 'Epic', ['Radio Scanner', 'Cloaked Chest']),
  ...crateLoot('rallypoint-delta', 'Legendary', ['Lunar Pod', 'Wisp', 'Preon Accumulator']),
];

const rarityRank: Record<FishingRarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5 };
/** Base fish selection weights before rod, bait, skill, Relic, and event modifiers. */
export const FISHING_FISH_RARITY_WEIGHTS: Readonly<Record<FishingRarity, number>> = {
  Common: 1_000,
  Uncommon: 200,
  Rare: 50,
  Epic: 10,
  Legendary: 0.1,
  Mythic: 0,
};
/** Legendary catches receive this multiplier before Relic, role, and event bonuses. */
export const FISHING_LEGENDARY_FISH_SALE_MULTIPLIER = 15;
/** 25% lower than the immediately preceding 7.5 XP-per-roll beta balance. */
export const FISHING_EXPEDITION_XP_PER_BASE_CATCH = 5.625;
const PREVIOUS_FISHING_EXPEDITION_XP_PER_BASE_CATCH = 7.5;
const LEGACY_FISHING_EXPEDITION_XP_PER_BASE_CATCH = 30;
export const FISHING_CRATE_XP_BY_RARITY: Readonly<Record<FishingCrateRarity, number>> = {
  Common: 15,
  Uncommon: 37.5,
  Rare: 112.5,
  Epic: 375,
  Legendary: 1_500,
};
const PREVIOUS_FISHING_CRATE_XP_BY_RARITY: Readonly<Record<FishingCrateRarity, number>> = {
  Common: 20,
  Uncommon: 50,
  Rare: 150,
  Epic: 500,
  Legendary: 2_000,
};
export const FISHING_CRATE_DROP_RATES: Readonly<Record<FishingCrateRarity, number>> = { Common: 0.05, Uncommon: 0.025, Rare: 0.0125, Epic: 0.0025, Legendary: 0.00025 };
const crateLootRarityWeight: Record<FishingCrateRarity, number> = { Common: 1_000, Uncommon: 200, Rare: 50, Epic: 10, Legendary: 1 };
/** Base chance per expedition catch roll: 0.01%, which is 10% of the prior 0.1% rate. */
export const FISHING_RELIC_DROP_RATE = 0.0001;

/** Uses the same cumulative curve as character/chat levels. */
export function getFishingTotalXpForLevel(level: number) {
  const targetLevel = Math.max(0, Math.min(10_000, Math.floor(level)));
  if (targetLevel === 0) return 0;
  return (50 * targetLevel * targetLevel) - (100 * targetLevel) + 150;
}

export function getFishingLevelForTotalXp(totalXp: number) {
  const normalizedTotalXp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (level < 10_000 && normalizedTotalXp >= getFishingTotalXpForLevel(level + 1)) level += 1;
  return level;
}

export function getFishingXpToNextLevel(level: number) {
  const currentLevel = Math.max(0, Math.min(9_999, Math.floor(level)));
  return getFishingTotalXpForLevel(currentLevel + 1) - getFishingTotalXpForLevel(currentLevel);
}

/** Rewards scale with the XP requirement of the level that was reached. */
export function getFishingLevelUpKnowBucks(level: number) {
  const targetLevel = Math.max(1, Math.min(10_000, Math.floor(level)));
  const xpRequired = getFishingTotalXpForLevel(targetLevel) - getFishingTotalXpForLevel(targetLevel - 1);
  return Math.max(500, (xpRequired * 3) / 2);
}

export function getFishingBiome(biomeId: string) { return FISHING_BIOMES.find((biome) => biome.id === biomeId); }
export function getFishingExpeditionLength(tier: number, catalogueVersion = 4) {
  const lengths = catalogueVersion < 4 ? LEGACY_FISHING_EXPEDITION_LENGTHS : FISHING_EXPEDITION_LENGTHS;
  return lengths.find((length) => length.tier === tier);
}

export function getFishingExpeditionXpPerBaseCatch(catalogueVersion = 7) {
  if (catalogueVersion < 6) return LEGACY_FISHING_EXPEDITION_XP_PER_BASE_CATCH;
  return catalogueVersion < 7
    ? PREVIOUS_FISHING_EXPEDITION_XP_PER_BASE_CATCH
    : FISHING_EXPEDITION_XP_PER_BASE_CATCH;
}

export function getFishingCrateXp(crateRarity: FishingCrateRarity, catalogueVersion = 7) {
  return catalogueVersion < 7
    ? PREVIOUS_FISHING_CRATE_XP_BY_RARITY[crateRarity]
    : FISHING_CRATE_XP_BY_RARITY[crateRarity];
}
export function getFishingCrate(itemId: string) { return FISHING_CRATES.find((crate) => crate.id === itemId); }
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

export function getFishingSaleBonusPercent(equipment: FishingEquipmentSnapshot) {
  return getOwnedFishingUpgrades(equipment.passiveItemIds)
    .reduce((total, item) => total + (item.saleBonusPercent ?? 0), 0);
}

export function getFishingXpBonusPercent(equipment: FishingEquipmentSnapshot) {
  return equipment.passiveItemIds.includes('gear-giant-pearl') ? 25 : 0;
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

export function calculateFishingDurationSeconds(
  durationTier: FishingDurationTier,
  isCrew: boolean,
  timeReductionPercent = 0,
  additionalTimeReductionPercent = 0,
) {
  const length = getFishingExpeditionLength(durationTier);
  if (!length) return null;
  const baseDuration = length.durationSeconds * (isCrew ? 3 : 1);
  return Math.max(1, Math.round(
    baseDuration
    * Math.max(0, 1 - (timeReductionPercent / 100))
    * Math.max(0, 1 - (additionalTimeReductionPercent / 100)),
  ));
}

export function getFishingKnowBucksMultiplier(modifiers: FishingExpeditionModifiers | undefined) {
  return (modifiers?.roleBonus ? 1.1 : 1) * (modifiers?.doubleKnowBucks ? 2 : 1);
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

function chooseCrateRarity(crateRarities: readonly FishingCrateRarity[], random: () => number, dropRateMultiplier: number) {
  const totalRate = crateRarities.reduce((total, rarity) => total + FISHING_CRATE_DROP_RATES[rarity], 0);
  if (random() >= Math.min(1, totalRate * dropRateMultiplier)) return null;
  return weightedPick(crateRarities, (rarity) => FISHING_CRATE_DROP_RATES[rarity], random);
}

function resolveSingleFishingCrateOpening(
  crate: FishingCrate,
  saleBonusPercent: number,
  random: () => number,
) {
  const eligibleLoot = FISHING_CRATE_LOOT.filter((item) => (
    item.biomeId === crate.biomeId && rarityRank[item.rarity] >= rarityRank[crate.rarity]
  ));
  if (eligibleLoot.length === 0) throw new Error('This fishing crate has no available loot.');
  const item = weightedPick(eligibleLoot, (candidate) => crateLootRarityWeight[candidate.rarity], random);
  const baseValue = item.minSaleValue + (random() * (item.maxSaleValue - item.minSaleValue));
  return {
    item,
    saleValue: Math.max(1, Math.round(baseValue * Math.max(0, 1 + (saleBonusPercent / 100)))),
  };
}

type ResolvableFishingFish = FishingFish & {
  catalogueBiomeId?: FishingEventCatalogueBiomeId;
  nonSellable?: boolean;
};

type ResolvableFishingCrate = {
  id: string;
  name: string;
  rarity: FishingCrateRarity;
};

type ResolvableFishingCrateLoot = {
  id: string;
  maxSaleValue: number;
  minSaleValue: number;
  name: string;
  rarity: FishingCrateRarity;
};

function getSelectedBiomeRaritySaleRange(biomeId: FishingBiomeId, rarity: FishingCrateRarity) {
  const comparableFish = FISHING_FISH.filter((entry) => entry.biomeId === biomeId && entry.rarity === rarity);
  if (comparableFish.length === 0) throw new Error(`Fishing event loot requires ${rarity} fish in ${biomeId}.`);
  return {
    maxSaleValue: comparableFish.reduce((total, fish) => total + fish.maxSaleValue, 0) / comparableFish.length,
    minSaleValue: comparableFish.reduce((total, fish) => total + fish.minSaleValue, 0) / comparableFish.length,
  };
}

function createEventFishCandidates(event: FishingEvent, selectedBiomeId: FishingBiomeId): ResolvableFishingFish[] {
  return event.fish.map((fish) => {
    if (fish.nonSellable) {
      return {
        biomeId: selectedBiomeId,
        catalogueBiomeId: event.catalogueBiomeId,
        id: fish.id,
        maxSaleValue: 0,
        minSaleValue: 0,
        name: fish.name,
        nonSellable: true,
        rarity: fish.rarity,
        tags: [],
      };
    }
    const saleRange = getSelectedBiomeRaritySaleRange(selectedBiomeId, fish.rarity as FishingCrateRarity);
    return {
      biomeId: selectedBiomeId,
      catalogueBiomeId: event.catalogueBiomeId,
      id: fish.id,
      maxSaleValue: saleRange.maxSaleValue,
      minSaleValue: saleRange.minSaleValue,
      name: fish.name,
      rarity: fish.rarity,
      tags: [],
    };
  });
}

function resolveSingleEventCrateOpening(
  crate: ResolvableFishingCrate,
  event: FishingEvent,
  selectedBiomeId: FishingBiomeId,
  saleBonusPercent: number,
  random: () => number,
) {
  const eligibleLoot = event.crates
    .filter((eventCrate) => rarityRank[eventCrate.rarity] >= rarityRank[crate.rarity])
    .flatMap((eventCrate) => {
      const saleRange = getSelectedBiomeRaritySaleRange(selectedBiomeId, eventCrate.rarity);
      const increment = eventCrate.items.length > 1 ? 30 / (eventCrate.items.length - 1) : 15;
      return eventCrate.items.map((name, index): ResolvableFishingCrateLoot => {
        const multiplier = 1 + ((index * increment) / 100);
        return {
          id: `${eventCrate.id}-loot-${index + 1}`,
          maxSaleValue: Math.max(1, Math.round(saleRange.maxSaleValue * multiplier)),
          minSaleValue: Math.max(1, Math.round(saleRange.minSaleValue * multiplier)),
          name,
          rarity: eventCrate.rarity,
        };
      });
    });
  if (eligibleLoot.length === 0) throw new Error('This event crate has no available loot.');
  const item = weightedPick(eligibleLoot, (candidate) => crateLootRarityWeight[candidate.rarity], random);
  const baseValue = item.minSaleValue + (random() * (item.maxSaleValue - item.minSaleValue));
  return {
    item,
    saleValue: Math.max(1, Math.round(baseValue * Math.max(0, 1 + (saleBonusPercent / 100)))),
  };
}

export function resolveFishingCrateOpenings(
  crateItemId: string,
  amount: number,
  saleBonusPercent: number,
  seed: number,
): FishingCrateOpeningResult {
  const crate = getFishingCrate(crateItemId);
  if (!crate || !Number.isInteger(amount) || amount < 1 || amount > 1_000_000 || !Number.isFinite(saleBonusPercent)) {
    throw new Error('Fishing crate opening data is invalid.');
  }

  const random = createSeededRandom(seed);
  const openedItems = new Map<string, { itemId: string; name: string; quantity: number; rarity: FishingCrateRarity; saleValue: number }>();
  let totalSaleValue = 0;
  for (let index = 0; index < amount; index += 1) {
    const { item, saleValue } = resolveSingleFishingCrateOpening(crate, saleBonusPercent, random);
    totalSaleValue += saleValue;
    const openedItem = openedItems.get(item.id);
    if (openedItem) {
      openedItem.quantity += 1;
      openedItem.saleValue += saleValue;
    } else {
      openedItems.set(item.id, { itemId: item.id, name: item.name, quantity: 1, rarity: item.rarity, saleValue });
    }
  }

  return { crate, items: [...openedItems.values()], totalSaleValue };
}

export function resolveFishingExpedition(biomeId: FishingBiomeId, durationTier: FishingDurationTier, equipment: FishingEquipmentSnapshot, seed: number, isCrew = false): FishingExpeditionResult {
  const biome = getFishingBiome(biomeId);
  const rod = getFishingUpgrade(equipment.rodItemId);
  const bait = getFishingUpgrade(equipment.baitItemId);
  const length = getFishingExpeditionLength(durationTier, equipment.catalogueVersion);
  const event = getFishingEvent(equipment.eventId);
  if (!biome || !rod?.catchableRarities || !length || bait?.category !== 'bait') throw new Error('Fishing expedition contains invalid equipment data.');

  const passives = getOwnedFishingUpgrades(equipment.passiveItemIds);
  const modifiers = equipment.modifiers;
  const hasRelic = (itemId: string) => equipment.passiveItemIds.includes(itemId);
  const higherRarityBonus = length.higherRarityWeightBonusPercent
    + passives.reduce((total, item) => total + (item.higherRarityBonusPercent ?? 0), 0)
    + (modifiers?.higherFishRarity ? 25 : 0);
  const launchSaleBonusPercent = (modifiers?.earlyBirdBonus ? 50 : 0)
    + Math.max(0, Math.min(10, modifiers?.streakSaleBonusPercent ?? 0))
    + (isCrew && hasRelic('gear-dockhands-ledger') ? 2.5 : 0)
    + (isCrew && hasRelic('gear-autopilot-relay') ? 20 : 0);
  const saleMultiplier = (1 + ((getFishingSaleBonusPercent(equipment) + launchSaleBonusPercent) / 100))
    * getFishingKnowBucksMultiplier(modifiers);
  const fishCandidates: ResolvableFishingFish[] = (event
    ? createEventFishCandidates(event, biomeId)
    : [...FISHING_FISH, ...FISHING_MYTHIC_FISH].filter((entry) => entry.biomeId === biomeId))
    .filter((entry) => rod.catchableRarities!.includes(entry.rarity));
  if (fishCandidates.length === 0) throw new Error('No fish are available for this expedition.');

  const random = createSeededRandom(seed);
  const catches = new Map<string, ResolvedFishingCatch>();
  const gearItems = new Map<string, number>();
  const specialItems = new Map<string, number>();
  const foundGearItemIds = new Set(equipment.passiveItemIds);
  const availableGear = () => FISHING_UPGRADES.filter((item) => item.category === 'gear'
    && !foundGearItemIds.has(item.id)
    && (!item.foundBiomeIds || item.foundBiomeIds.includes(biomeId)));
  const crateDropRateMultiplier = (bait.id === 'magnet' ? 1.5 : 1)
    * (hasRelic('gear-reservoir-growth') ? 1.1 : 1);
  const gearDropRateMultiplier = (bait.id === 'sonar' ? 2 : 1)
    * (hasRelic('gear-conduit') ? 2 : 1);
  const knownFishKeys = new Set(equipment.catalogueFishKeys ?? []);
  const knownTitleItemIds = new Set(equipment.titleItemIds ?? []);
  let fishSaleValue = 0;
  let crateSaleValue = 0;
  let fishingCrateXp = 0;
  const baseCatchCount = length.catchCount[0] + Math.floor(random() * (length.catchCount[1] - length.catchCount[0] + 1));
  const mysteriousSeaFoodExtraRolls = bait.id === 'mysterious-sea-food' && random() < 0.2
    ? Math.ceil(baseCatchCount * 0.5)
    : 0;
  const catchCount = baseCatchCount + mysteriousSeaFoodExtraRolls + (hasRelic('gear-dual-hook') ? 1 : 0);
  const fishRarityWeights = event ? FISHING_HALLOWEEN_FISH_RARITY_WEIGHTS : FISHING_FISH_RARITY_WEIGHTS;

  const chooseFish = () => weightedPick(fishCandidates, (candidate) => {
    const rarityMultiplier = rarityRank[candidate.rarity] === 0 ? 1 : 1 + (higherRarityBonus / 100);
    const truffleMultiplier = bait.id === 'truffle-worm' && candidate.rarity === 'Legendary' ? 3 : 1;
    return fishRarityWeights[candidate.rarity] * rarityMultiplier * truffleMultiplier;
  }, random);

  const maybeUpgradeFishRarity = (fish: ResolvableFishingFish) => {
    if (!hasRelic('gear-magic-conch') || random() >= 0.1) return fish;
    const upgradedCandidates = fishCandidates.filter((candidate) => rarityRank[candidate.rarity] === rarityRank[fish.rarity] + 1);
    return upgradedCandidates.length > 0
      ? weightedPick(upgradedCandidates, (candidate) => fishRarityWeights[candidate.rarity], random)
      : fish;
  };

  const addFish = (fish: ResolvableFishingFish) => {
    const upgradedFish = maybeUpgradeFishRarity(fish);
    const catalogueBiomeId = upgradedFish.catalogueBiomeId;
    const catalogueFishKey = `${catalogueBiomeId ?? biomeId}:${upgradedFish.name}:${upgradedFish.rarity}`;
    const firstCatchBonus = !upgradedFish.nonSellable && hasRelic('gear-pearl-divers-log') && !knownFishKeys.has(catalogueFishKey);
    if (firstCatchBonus) knownFishKeys.add(catalogueFishKey);
    let saleValue = 0;
    if (!upgradedFish.nonSellable) {
      const valueRoll = hasRelic('gear-sunstone') && biomeId === 'warm-ocean'
        ? 1 - ((1 - random()) ** 2)
        : random();
      const raritySaleMultiplier = (upgradedFish.rarity === 'Legendary' ? FISHING_LEGENDARY_FISH_SALE_MULTIPLIER : 1)
        * (upgradedFish.rarity === 'Legendary' && hasRelic('gear-knowleague-lure') ? 1.1 : 1)
        * ((upgradedFish.rarity === 'Epic' || upgradedFish.rarity === 'Legendary') && hasRelic('gear-crystal-resonator') ? 1.1 : 1)
        * (firstCatchBonus ? 5 : 1)
        * (hasRelic('gear-lucky-coin') && random() < 0.03 ? 2 : 1);
      saleValue = Math.max(1, Math.round(
        (upgradedFish.minSaleValue + (valueRoll * (upgradedFish.maxSaleValue - upgradedFish.minSaleValue)))
        * saleMultiplier
        * raritySaleMultiplier,
      ));
      fishSaleValue += saleValue;
    } else {
      specialItems.set(`event-${event!.id}-${upgradedFish.id}`, (specialItems.get(`event-${event!.id}-${upgradedFish.id}`) ?? 0) + 1);
    }
    const catchKey = `fish:${catalogueBiomeId ?? biomeId}:${upgradedFish.name}:${upgradedFish.rarity}`;
    const existingCatch = catches.get(catchKey);
    if (existingCatch?.kind === 'fish') {
      existingCatch.quantity += 1;
      existingCatch.saleValue += saleValue;
      return upgradedFish;
    }
    catches.set(catchKey, {
      catalogueBiomeId,
      itemId: upgradedFish.nonSellable ? `event-${event!.id}-${upgradedFish.id}` : undefined,
      kind: 'fish',
      name: upgradedFish.name,
      nonSellable: upgradedFish.nonSellable,
      quantity: 1,
      rarity: upgradedFish.rarity,
      saleValue,
    });
    return upgradedFish;
  };

  for (let index = 0; index < catchCount; index += 1) {
    const crateRarity = chooseCrateRarity(event ? FISHING_CRATE_RARITIES : biome.crateRarities, random, crateDropRateMultiplier);
    if (crateRarity) {
      const eventCrate = event?.crates.find((entry) => entry.rarity === crateRarity);
      const crate: ResolvableFishingCrate | undefined = eventCrate ?? getFishingCrate(`${biomeId}-${crateRarity.toLowerCase()}-crate`);
      if (!crate) throw new Error(`Missing ${biomeId} ${crateRarity} fishing crate.`);
      const crateSaleBonusPercent = (saleMultiplier - 1) * 100;
      fishingCrateXp += getFishingCrateXp(crateRarity, equipment.catalogueVersion);
      const crateLootRolls = 1 + (modifiers?.extraCrateLoot && random() < 0.5 ? 1 : 0);
      for (let lootRoll = 0; lootRoll < crateLootRolls; lootRoll += 1) {
        const opening = event
          ? resolveSingleEventCrateOpening(crate, event, biomeId, crateSaleBonusPercent, random)
          : resolveSingleFishingCrateOpening(crate as FishingCrate, crateSaleBonusPercent, random);
        const saleValue = hasRelic('gear-lucky-coin') && random() < 0.03
          ? opening.saleValue * 2
          : opening.saleValue;
        crateSaleValue += saleValue;
        const catchKey = `crate:${crate.id}:${opening.item.id}`;
        const existingCatch = catches.get(catchKey);
        if (existingCatch?.kind === 'crate') {
          existingCatch.quantity += 1;
          existingCatch.saleValue += saleValue;
        } else {
          catches.set(catchKey, {
            itemId: crate.id,
            kind: 'crate',
            lootItemId: opening.item.id,
            lootName: opening.item.name,
            lootRarity: opening.item.rarity,
            name: crate.name,
            quantity: 1,
            rarity: crate.rarity,
            saleValue,
          });
        }
      }
    }

    const eligibleGear = availableGear();
    if (eligibleGear.length > 0 && random() < FISHING_RELIC_DROP_RATE * gearDropRateMultiplier) {
      const gear = weightedPick(eligibleGear, () => 1, random);
      foundGearItemIds.add(gear.id);
      gearItems.set(gear.id, 1);
      catches.set(`gear:${gear.id}`, { kind: 'gear', name: gear.name, quantity: 1, itemId: gear.id });
    }

    if (bait.id === 'sonar' && random() >= 0.5) continue;
    const selectedFish = chooseFish();
    if (bait.id === 'truffle-worm' && selectedFish.rarity !== 'Legendary') continue;
    addFish(selectedFish);

    if (event && !knownTitleItemIds.has(event.title.itemId) && random() < event.title.dropRate) {
      knownTitleItemIds.add(event.title.itemId);
      specialItems.set(event.title.itemId, 1);
      catches.set(`title:${event.title.itemId}`, { itemId: event.title.itemId, kind: 'title', name: event.title.name, quantity: 1 });
    }

    const bonusFishChance = (bait.id === 'chum' && (selectedFish.rarity === 'Common' || selectedFish.rarity === 'Uncommon'))
      || (bait.id === 'bloodworms' && (selectedFish.rarity === 'Rare' || selectedFish.rarity === 'Epic'))
      ? 0.1 + (random() * 0.2)
      : 0;
    if (random() < bonusFishChance) addFish(selectedFish);
  }

  if (hasRelic('gear-tangle-net')) {
    const fishCatches = [...catches.values()].filter((catchItem): catchItem is ResolvedFishingFishCatch => catchItem.kind === 'fish');
    const tangleNetMultiplier = 1 + (new Set(fishCatches.map((catchItem) => catchItem.rarity)).size * 0.03);
    for (const fishCatch of fishCatches) {
      if (fishCatch.nonSellable) continue;
      const adjustedSaleValue = Math.round(fishCatch.saleValue * tangleNetMultiplier);
      fishSaleValue += adjustedSaleValue - fishCatch.saleValue;
      fishCatch.saleValue = adjustedSaleValue;
    }
  }

  const fishingExpeditionXp = baseCatchCount * getFishingExpeditionXpPerBaseCatch(equipment.catalogueVersion);
  const fishingXpAwarded = Math.floor((fishingExpeditionXp + fishingCrateXp)
    * (1 + (getFishingXpBonusPercent(equipment) / 100))
    * (modifiers?.roleBonus ? 1.1 : 1)
    * (modifiers?.doubleXp ? 2 : 1));

  return {
    catches: [...catches.values()],
    crateSaleValue,
    fishingCrateXp,
    fishingExpeditionXp,
    fishingXpAwarded,
    fishSaleValue,
    gearItems: [...gearItems.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    knowBucksFound: 0,
    specialItems: [...specialItems.entries()].flatMap(([itemId, quantity]) => {
      const items: Array<{ itemId: string; quantity: number }> = [];
      let remaining = quantity;
      while (remaining > 0) {
        const nextQuantity = Math.min(1_000, remaining);
        items.push({ itemId, quantity: nextQuantity });
        remaining -= nextQuantity;
      }
      return items;
    }),
  };
}
