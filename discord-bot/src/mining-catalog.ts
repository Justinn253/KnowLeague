export type MiningDepthId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type MiningResourceKind = 'ore' | 'gem' | 'fossil';
export type MiningUpgradeCategory = 'tool' | 'storage' | 'processor' | 'elevator' | 'filter';

export type MiningResource = {
  depth: MiningDepthId;
  id: string;
  kind: MiningResourceKind;
  name: string;
  processorTier?: number;
  saleValue?: number;
};

export type MiningDepth = {
  descendAndAscendMs: number;
  fossils: readonly MiningResource[];
  gems: readonly MiningResource[];
  id: MiningDepthId;
  name: string;
  ores: readonly MiningResource[];
  requiredToolId?: string;
};

export type MiningRecipeItem = { resourceId: string; quantity: number };

export type MiningUpgrade = {
  category: MiningUpgradeCategory;
  description: string;
  id: string;
  name: string;
  previousUpgradeId?: string;
  recipe?: readonly MiningRecipeItem[];
  value: number;
};

export type MiningEquipmentSnapshot = {
  catalogVersion: 1;
  descendDurationMs: number;
  elevatorTier: number;
  filterTier: number;
  hasteLevel: number;
  luckLevel: number;
  storageCapacity: number;
  toolId: string;
  toolStonesPerSecond: number;
};

export type MiningResult = {
  cargo: Array<{ id: string; kind: MiningResourceKind; name: string; quantity: number }>;
  discardedStone: number;
  miningXpAwarded: number;
  stoneStored: number;
  stoneBroken: number;
  storageUsed: number;
};

const resource = (
  depth: MiningDepthId,
  kind: MiningResourceKind,
  id: string,
  name: string,
  options: Pick<MiningResource, 'processorTier' | 'saleValue'> = {},
): MiningResource => ({ depth, kind, id, name, ...options });

const fossil = (depth: MiningDepthId, id: string, name: string) => resource(depth, 'fossil', id, `${name} Fossil`);

/**
 * Each depth follows its matching Fishing region's economy: the first and
 * second ores approximate common and uncommon fish, while gems approximate
 * rare and epic fish. Values are centralized so stored inventory survives
 * future balancing changes.
 */
export const MINING_DEPTHS: readonly MiningDepth[] = [
  {
    id: 1,
    name: 'Shallow Quarry',
    descendAndAscendMs: 5_000,
    ores: [resource(1, 'ore', 'coal', 'Coal', { saleValue: 7 }), resource(1, 'ore', 'quartz', 'Quartz', { saleValue: 11 })],
    gems: [resource(1, 'gem', 'opal', 'Opal', { saleValue: 20 }), resource(1, 'gem', 'pearl', 'Pearl', { saleValue: 40 })],
    fossils: [
      fossil(1, 'compsognathus-fossil', 'Compsognathus'), fossil(1, 'microraptor-fossil', 'Microraptor'),
      fossil(1, 'archaeopteryx-fossil', 'Archaeopteryx'), fossil(1, 'psittacosaurus-fossil', 'Psittacosaurus'),
      fossil(1, 'protoceratops-fossil', 'Protoceratops'),
    ],
  },
  {
    id: 2,
    name: 'Copper Veins',
    descendAndAscendMs: 30_000,
    requiredToolId: 'stone-pickaxe',
    ores: [resource(2, 'ore', 'copper', 'Copper', { processorTier: 1, saleValue: 10 }), resource(2, 'ore', 'tin', 'Tin', { processorTier: 1, saleValue: 17 })],
    gems: [resource(2, 'gem', 'jade', 'Jade', { saleValue: 31 }), resource(2, 'gem', 'emerald', 'Emerald', { saleValue: 75 })],
    fossils: [
      fossil(2, 'stegosaurus-fossil', 'Stegosaurus'), fossil(2, 'iguanodon-fossil', 'Iguanodon'),
      fossil(2, 'parasaurolophus-fossil', 'Parasaurolophus'), fossil(2, 'dilophosaurus-fossil', 'Dilophosaurus'),
      fossil(2, 'allosaurus-fossil', 'Allosaurus'),
    ],
  },
  {
    id: 3,
    name: 'Iron Delve',
    descendAndAscendMs: 60_000,
    requiredToolId: 'weak-metal-pickaxe',
    ores: [resource(3, 'ore', 'iron', 'Iron', { processorTier: 2, saleValue: 18 }), resource(3, 'ore', 'lead', 'Lead', { processorTier: 2, saleValue: 30 })],
    gems: [resource(3, 'gem', 'ruby', 'Ruby', { saleValue: 55 }), resource(3, 'gem', 'garnet', 'Garnet', { saleValue: 123 })],
    fossils: [
      fossil(3, 'ankylosaurus-fossil', 'Ankylosaurus'), fossil(3, 'pachycephalosaurus-fossil', 'Pachycephalosaurus'),
      fossil(3, 'baryonyx-fossil', 'Baryonyx'), fossil(3, 'carnotaurus-fossil', 'Carnotaurus'),
      fossil(3, 'camarasaurus-fossil', 'Camarasaurus'),
    ],
  },
  {
    id: 4,
    name: 'Silverworks',
    descendAndAscendMs: 120_000,
    requiredToolId: 'rudimentary-pickaxe',
    ores: [resource(4, 'ore', 'silver', 'Silver', { processorTier: 3, saleValue: 38 }), resource(4, 'ore', 'tungsten', 'Tungsten', { processorTier: 3, saleValue: 65 })],
    gems: [resource(4, 'gem', 'topaz', 'Topaz', { saleValue: 115 }), resource(4, 'gem', 'sapphire', 'Sapphire', { saleValue: 260 })],
    fossils: [
      fossil(4, 'triceratops-fossil', 'Triceratops'), fossil(4, 'spinosaurus-fossil', 'Spinosaurus'),
      fossil(4, 'velociraptor-fossil', 'Velociraptor'), fossil(4, 'diplodocus-fossil', 'Diplodocus'),
      fossil(4, 'argentinosaurus-fossil', 'Argentinosaurus'),
    ],
  },
  {
    id: 5,
    name: 'Gilded Depths',
    descendAndAscendMs: 300_000,
    requiredToolId: 'reinforced-pickaxe',
    ores: [resource(5, 'ore', 'gold', 'Gold', { processorTier: 4, saleValue: 60 }), resource(5, 'ore', 'platinum', 'Platinum', { processorTier: 4, saleValue: 98 })],
    gems: [resource(5, 'gem', 'amethyst', 'Amethyst', { saleValue: 170 }), resource(5, 'gem', 'aquamarine', 'Aquamarine', { saleValue: 395 })],
    fossils: [
      fossil(5, 'tyrannosaurus-fossil', 'Tyrannosaurus'), fossil(5, 'giganotosaurus-fossil', 'Giganotosaurus'),
      fossil(5, 'therizinosaurus-fossil', 'Therizinosaurus'), fossil(5, 'deinonychus-fossil', 'Deinonychus'),
      fossil(5, 'apatosaurus-fossil', 'Apatosaurus'),
    ],
  },
  {
    id: 6,
    name: 'Cobalt Hollow',
    descendAndAscendMs: 600_000,
    requiredToolId: 'sturdy-drill',
    ores: [resource(6, 'ore', 'cobalt', 'Cobalt', { processorTier: 5, saleValue: 90 }), resource(6, 'ore', 'palladium', 'Palladium', { processorTier: 5, saleValue: 148 })],
    gems: [resource(6, 'gem', 'citrine', 'Citrine', { saleValue: 270 }), resource(6, 'gem', 'peridot', 'Peridot', { saleValue: 650 })],
    fossils: [
      fossil(6, 'utahraptor-fossil', 'Utahraptor'), fossil(6, 'carcharodontosaurus-fossil', 'Carcharodontosaurus'),
      fossil(6, 'oviraptor-fossil', 'Oviraptor'), fossil(6, 'mamenchisaurus-fossil', 'Mamenchisaurus'),
      fossil(6, 'styracosaurus-fossil', 'Styracosaurus'),
    ],
  },
  {
    id: 7,
    name: 'Adamant Abyss',
    descendAndAscendMs: 1_800_000,
    requiredToolId: 'advanced-drill',
    ores: [resource(7, 'ore', 'titanium', 'Titanium', { processorTier: 6, saleValue: 142 }), resource(7, 'ore', 'adamantite', 'Adamantite', { processorTier: 6, saleValue: 242 })],
    gems: [resource(7, 'gem', 'diamond', 'Diamond', { saleValue: 440 }), resource(7, 'gem', 'moissanite', 'Moissanite', { saleValue: 1_025 })],
    fossils: [
      fossil(7, 'yutyrannus-fossil', 'Yutyrannus'), fossil(7, 'mapusaurus-fossil', 'Mapusaurus'),
      fossil(7, 'dreadnoughtus-fossil', 'Dreadnoughtus'), fossil(7, 'deinocheirus-fossil', 'Deinocheirus'),
      fossil(7, 'acrocanthosaurus-fossil', 'Acrocanthosaurus'),
    ],
  },
] as const;

const recipe = (...items: Array<[string, number]>): readonly MiningRecipeItem[] => (
  items.map(([resourceId, quantity]) => ({ resourceId, quantity }))
);

export const MINING_UPGRADES: readonly MiningUpgrade[] = [
  { id: 'wooden-pickaxe', name: 'Wooden Pickaxe', category: 'tool', value: 0.1, description: 'Starter tool that breaks 1 stone every 10 seconds.' },
  { id: 'stone-pickaxe', name: 'Stone Pickaxe', category: 'tool', value: 0.2, previousUpgradeId: 'wooden-pickaxe', recipe: recipe(['coal', 2], ['quartz', 2]), description: 'Breaks 1 stone every 5 seconds. Unlocks Copper Veins.' },
  { id: 'weak-metal-pickaxe', name: 'Weak Metal Pickaxe', category: 'tool', value: 0.5, previousUpgradeId: 'stone-pickaxe', recipe: recipe(['copper', 10], ['tin', 10], ['jade', 1]), description: 'Breaks 1 stone every 2 seconds. Unlocks Iron Delve.' },
  { id: 'rudimentary-pickaxe', name: 'Rudimentary Pickaxe', category: 'tool', value: 1, previousUpgradeId: 'weak-metal-pickaxe', recipe: recipe(['iron', 25], ['lead', 25], ['ruby', 3]), description: 'Breaks 1 stone each second. Unlocks Silverworks.' },
  { id: 'reinforced-pickaxe', name: 'Reinforced Pickaxe', category: 'tool', value: 2, previousUpgradeId: 'rudimentary-pickaxe', recipe: recipe(['silver', 75], ['tungsten', 75], ['topaz', 10]), description: 'Breaks 2 stone each second. Unlocks Gilded Depths.' },
  { id: 'sturdy-drill', name: 'Sturdy Drill', category: 'tool', value: 5, previousUpgradeId: 'reinforced-pickaxe', recipe: recipe(['gold', 200], ['platinum', 200], ['amethyst', 40]), description: 'Breaks 5 stone each second. Unlocks Cobalt Hollow.' },
  { id: 'advanced-drill', name: 'Advanced Drill', category: 'tool', value: 10, previousUpgradeId: 'sturdy-drill', recipe: recipe(['cobalt', 750], ['palladium', 750], ['citrine', 150]), description: 'Breaks 10 stone each second. Unlocks Adamant Abyss.' },
  { id: 'high-tech-drill', name: 'High-Tech Drill', category: 'tool', value: 25, previousUpgradeId: 'advanced-drill', recipe: recipe(['titanium', 3000], ['adamantite', 3000], ['diamond', 750]), description: 'Endgame drill that breaks 25 stone each second.' },

  { id: 'shabby-bin', name: 'Shabby Bin', category: 'storage', value: 5, description: 'Starter minecart storage with room for 5 items.' },
  { id: 'wooden-crate', name: 'Wooden Crate', category: 'storage', value: 15, previousUpgradeId: 'shabby-bin', recipe: recipe(['jade', 2], ['emerald', 2]), description: 'Raises minecart storage to 15 items.' },
  { id: 'iron-box', name: 'Iron Box', category: 'storage', value: 30, previousUpgradeId: 'wooden-crate', recipe: recipe(['ruby', 4], ['garnet', 4]), description: 'Raises minecart storage to 30 items.' },
  { id: 'reinforced-crate', name: 'Reinforced Crate', category: 'storage', value: 75, previousUpgradeId: 'iron-box', recipe: recipe(['topaz', 8], ['sapphire', 8]), description: 'Raises minecart storage to 75 items.' },
  { id: 'titanium-lockbox', name: 'Titanium Lockbox', category: 'storage', value: 150, previousUpgradeId: 'reinforced-crate', recipe: recipe(['amethyst', 16], ['aquamarine', 16]), description: 'Raises minecart storage to 150 items.' },
  { id: 'gemcrusted-safe', name: 'Gemcrusted Safe', category: 'storage', value: 300, previousUpgradeId: 'titanium-lockbox', recipe: recipe(['citrine', 32], ['peridot', 32]), description: 'Raises minecart storage to 300 items.' },
  { id: 'quantum-box', name: 'Quantum Box', category: 'storage', value: 750, previousUpgradeId: 'gemcrusted-safe', recipe: recipe(['diamond', 64], ['moissanite', 64]), description: 'Raises minecart storage to 750 items.' },

  { id: 'processor-depth-2', name: 'Depth 2 Processor', category: 'processor', value: 1, recipe: recipe(['coal', 10], ['quartz', 10]), description: 'Automatically processes Copper Veins ores.' },
  { id: 'processor-depth-3', name: 'Depth 3 Processor', category: 'processor', value: 2, previousUpgradeId: 'processor-depth-2', recipe: recipe(['copper', 25], ['tin', 25], ['jade', 2]), description: 'Automatically processes Iron Delve ores and lower tiers.' },
  { id: 'processor-depth-4', name: 'Depth 4 Processor', category: 'processor', value: 3, previousUpgradeId: 'processor-depth-3', recipe: recipe(['iron', 60], ['lead', 60], ['ruby', 6]), description: 'Automatically processes Silverworks ores and lower tiers.' },
  { id: 'processor-depth-5', name: 'Depth 5 Processor', category: 'processor', value: 4, previousUpgradeId: 'processor-depth-4', recipe: recipe(['silver', 150], ['tungsten', 150], ['topaz', 15]), description: 'Automatically processes Gilded Depths ores and lower tiers.' },
  { id: 'processor-depth-6', name: 'Depth 6 Processor', category: 'processor', value: 5, previousUpgradeId: 'processor-depth-5', recipe: recipe(['gold', 400], ['platinum', 400], ['amethyst', 50]), description: 'Automatically processes Cobalt Hollow ores and lower tiers.' },
  { id: 'processor-depth-7', name: 'Depth 7 Processor', category: 'processor', value: 6, previousUpgradeId: 'processor-depth-6', recipe: recipe(['cobalt', 1500], ['palladium', 1500], ['citrine', 175]), description: 'Automatically processes Adamant Abyss ores and lower tiers.' },

  { id: 'sturdy-gears', name: 'Sturdy Gears', category: 'elevator', value: 1, recipe: recipe(['iron', 30], ['lead', 30], ['ruby', 2]), description: 'Reduces ascent and descent time by 10%.' },
  { id: 'advanced-pulleys', name: 'Advanced Pulleys', category: 'elevator', value: 2, previousUpgradeId: 'sturdy-gears', recipe: recipe(['silver', 100], ['tungsten', 100], ['topaz', 10]), description: 'Reduces ascent and descent time by another 10%.' },
  { id: 'overcharged-motors', name: 'Overcharged Motors', category: 'elevator', value: 3, previousUpgradeId: 'advanced-pulleys', recipe: recipe(['gold', 250], ['platinum', 250], ['amethyst', 25]), description: 'Reduces ascent and descent time by another 10%.' },

  { id: 'stone-sorter', name: 'Stone Sorter', category: 'filter', value: 1, recipe: recipe(['coal', 25], ['quartz', 25], ['opal', 2]), description: 'Discards 25% of stone before it reaches storage.' },
  { id: 'filtering-system', name: 'Filtering System', category: 'filter', value: 2, previousUpgradeId: 'stone-sorter', recipe: recipe(['copper', 50], ['tin', 50], ['jade', 5]), description: 'Discards 50% of stone before it reaches storage.' },
  { id: 'advanced-ore-detector', name: 'Advanced Ore Detector', category: 'filter', value: 3, previousUpgradeId: 'filtering-system', recipe: recipe(['iron', 100], ['lead', 100], ['ruby', 10]), description: 'Discards 75% of stone before it reaches storage.' },
] as const;

export const MINING_REWARD_WEIGHTS = { fossil: 1, gem: 10, ore: 100, stone: 500 } as const;

export function getMiningDepth(depthId: number) {
  return MINING_DEPTHS.find((depth) => depth.id === depthId);
}

export function getMiningResource(resourceId: string) {
  return MINING_DEPTHS.flatMap((depth) => [...depth.ores, ...depth.gems, ...depth.fossils]).find((resourceItem) => resourceItem.id === resourceId);
}

export function findMiningResource(resourceNameOrId: string) {
  const normalized = resourceNameOrId.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return MINING_DEPTHS
    .flatMap((depth) => [...depth.ores, ...depth.gems, ...depth.fossils])
    .find((resourceItem) => resourceItem.id === normalized || resourceItem.name.toLowerCase() === normalized.replace(/-/g, ' '));
}

export function getMiningUpgrade(upgradeId: string) {
  return MINING_UPGRADES.find((upgrade) => upgrade.id === upgradeId);
}

export function getMiningUpgrades(category: MiningUpgradeCategory) {
  return MINING_UPGRADES.filter((upgrade) => upgrade.category === category);
}

export function getMiningBestUpgrade(ownedUpgradeIds: readonly string[], category: MiningUpgradeCategory) {
  return MINING_UPGRADES
    .filter((upgrade) => upgrade.category === category && ownedUpgradeIds.includes(upgrade.id))
    .reduce<MiningUpgrade | undefined>((best, upgrade) => (!best || upgrade.value > best.value ? upgrade : best), undefined);
}

export function getMiningCraftingRecipe(upgrade: MiningUpgrade, cheapskateLevel: number) {
  const reduction = Math.max(0, Math.min(4, Math.floor(cheapskateLevel))) * 0.05;
  return (upgrade.recipe ?? []).map((item) => ({
    resourceId: item.resourceId,
    quantity: Math.max(1, Math.ceil(item.quantity * (1 - reduction))),
  }));
}

export function getMiningTravelDurationMs(baseRoundTripMs: number, elevatorTier: number, hasteLevel: number) {
  const elevatorMultiplier = Math.max(0.1, 1 - (Math.max(0, Math.min(3, elevatorTier)) * 0.1));
  const hasteMultiplier = Math.max(0.1, 1 - (Math.max(0, Math.min(4, hasteLevel)) * 0.05));
  return Math.max(1_000, Math.round((baseRoundTripMs / 2) * elevatorMultiplier * hasteMultiplier));
}

function seededRandom(seed: number) {
  let state = (Math.trunc(seed) >>> 0) || 0x9E3779B9;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(items: readonly T[], random: () => number) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

/** Resolves only until storage fills; no work scales with unattended expedition time. */
export function resolveMiningExpedition(
  depthId: MiningDepthId,
  equipment: MiningEquipmentSnapshot,
  outcomeSeed: number,
  miningElapsedMs: number,
): MiningResult {
  const depth = getMiningDepth(depthId);
  if (!depth || !Number.isFinite(miningElapsedMs) || miningElapsedMs < 0 || equipment.catalogVersion !== 1) {
    throw new Error('Mining expedition data is invalid.');
  }
  const breakCount = Math.max(0, Math.floor((miningElapsedMs / 1_000) * equipment.toolStonesPerSecond));
  const random = seededRandom(outcomeSeed);
  const cargo = new Map<string, { id: string; kind: MiningResourceKind; name: string; quantity: number }>();
  const capacity = Math.max(1, Math.floor(equipment.storageCapacity));
  const luckLevel = Math.max(0, Math.min(4, Math.floor(equipment.luckLevel)));
  const stoneToOreChance = luckLevel * 0.05;
  const oreToGemChance = luckLevel * 0.01;
  const stoneDiscardChance = Math.max(0, Math.min(0.75, Math.floor(equipment.filterTier) * 0.25));
  const totalWeight = MINING_REWARD_WEIGHTS.stone + MINING_REWARD_WEIGHTS.ore + MINING_REWARD_WEIGHTS.gem + MINING_REWARD_WEIGHTS.fossil;
  let storageUsed = 0;
  let discardedStone = 0;
  let miningXpAwarded = 0;
  let stoneStored = 0;
  let stoneBroken = 0;

  for (let index = 0; index < breakCount && storageUsed < capacity; index += 1) {
    stoneBroken += 1;
    miningXpAwarded += 1;
    let roll = random() * totalWeight;
    let resourceItem: MiningResource | 'stone';
    if ((roll -= MINING_REWARD_WEIGHTS.stone) < 0) resourceItem = 'stone';
    else if ((roll -= MINING_REWARD_WEIGHTS.ore) < 0) resourceItem = pick(depth.ores, random);
    else if ((roll -= MINING_REWARD_WEIGHTS.gem) < 0) resourceItem = pick(depth.gems, random);
    else resourceItem = pick(depth.fossils, random);

    if (resourceItem === 'stone' && random() < stoneToOreChance) resourceItem = pick(depth.ores, random);
    if (resourceItem !== 'stone' && resourceItem.kind === 'ore' && random() < oreToGemChance) resourceItem = pick(depth.gems, random);
    if (resourceItem === 'stone' && random() < stoneDiscardChance) {
      discardedStone += 1;
      continue;
    }

    storageUsed += 1;
    if (resourceItem === 'stone') {
      stoneStored += 1;
      continue;
    }
    miningXpAwarded += resourceItem.kind === 'ore' ? 2 : resourceItem.kind === 'gem' ? 5 : 25;
    const existing = cargo.get(resourceItem.id);
    if (existing) existing.quantity += 1;
    else cargo.set(resourceItem.id, { id: resourceItem.id, kind: resourceItem.kind, name: resourceItem.name, quantity: 1 });
  }

  return { cargo: [...cargo.values()], discardedStone, miningXpAwarded, stoneStored, stoneBroken, storageUsed };
}

export function getMiningXpForLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.min(10_000, Math.floor(level)));
  return normalizedLevel === 0 ? 0 : (50 * normalizedLevel * normalizedLevel) - (100 * normalizedLevel) + 150;
}

export function getMiningXpToNextLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.min(9_999, Math.floor(level)));
  return getMiningXpForLevel(normalizedLevel + 1) - getMiningXpForLevel(normalizedLevel);
}

export function formatMiningDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
