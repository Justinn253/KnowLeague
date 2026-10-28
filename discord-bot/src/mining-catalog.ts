import { MINING_DEPTH_CONFIG, MINING_REWARD_WEIGHT_CONFIG, MINING_SHOP_UPGRADE_CONFIG } from './minigame-content-config.js';

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

/**
 * Each depth follows its matching Fishing region's economy. The editable
 * resource, depth, processor-tier, and sale-value data lives in the shared
 * minigame content configuration.
 */
export const MINING_DEPTHS: readonly MiningDepth[] = MINING_DEPTH_CONFIG;

export const MINING_UPGRADES: readonly MiningUpgrade[] = MINING_SHOP_UPGRADE_CONFIG;

export const MINING_REWARD_WEIGHTS = MINING_REWARD_WEIGHT_CONFIG;

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
