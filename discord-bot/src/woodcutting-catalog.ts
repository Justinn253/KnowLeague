import {
  WOODCUTTING_AXE_CONFIG,
  WOODCUTTING_CRITTER_CONFIG,
  WOODCUTTING_SAPLING_CONFIG,
  WOODCUTTING_UPGRADE_CONFIG,
  WOODCUTTING_WORKER_COST_CONFIG,
} from './minigame-content-config.js';

export type WoodcuttingTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type WoodcuttingUpgradeCategory = 'lodging' | 'meal' | 'sharpening';
export type WoodcuttingRecipeItem = { itemId: string; quantity: number; source: 'mining' | 'woodcutting' };

export type WoodcuttingAxe = {
  id: string;
  name: string;
  recipe: readonly WoodcuttingRecipeItem[];
  tier: WoodcuttingTier;
};

export type WoodcuttingSapling = {
  amberItemId: string;
  id: string;
  name: string;
  processorUpgradeId?: string;
  saplingCost: number;
  tier: WoodcuttingTier;
  woodItemId: string;
  woodName: string;
};

export type WoodcuttingCritter = { id: string; name: string; weight: number };

export type WoodcuttingUpgrade = {
  category: WoodcuttingUpgradeCategory;
  description: string;
  id: string;
  name: string;
  previousUpgradeId?: string;
  recipe: readonly WoodcuttingRecipeItem[];
  value: number;
};

export type WoodcuttingWorkerSnapshot = {
  axeTier: WoodcuttingTier | null;
  chopRemainderMs: number;
  saplingTier: WoodcuttingTier | null;
  workerNumber: number;
};

export type WoodcuttingClaimResult = {
  attemptedChops: number;
  finishedChops: number;
  itemRewards: Array<{ itemId: string; quantity: number }>;
  saplingsConsumed: Array<{ itemId: string; quantity: number }>;
  successfulChops: number;
  workerRemainders: Array<{ chopRemainderMs: number; workerNumber: number }>;
};

export const WOODCUTTING_AXES: readonly WoodcuttingAxe[] = WOODCUTTING_AXE_CONFIG;
export const WOODCUTTING_SAPLINGS: readonly WoodcuttingSapling[] = WOODCUTTING_SAPLING_CONFIG;
export const WOODCUTTING_UPGRADES: readonly WoodcuttingUpgrade[] = WOODCUTTING_UPGRADE_CONFIG;
export const WOODCUTTING_WORKER_COSTS: readonly number[] = WOODCUTTING_WORKER_COST_CONFIG;

const MAX_WORKERS = 10;
const BASE_CHOP_INTERVAL_MS = 60_000;
const BASE_SUCCESS_RATE = 0.2;
const CRITTER_FIND_RATE = 0.1;
const AMBER_FIND_RATE = 0.0001;

export function getWoodcuttingAxe(tier: number) {
  return WOODCUTTING_AXES.find((axe) => axe.tier === tier);
}

export function getWoodcuttingSapling(tier: number) {
  return WOODCUTTING_SAPLINGS.find((sapling) => sapling.tier === tier);
}

export function getWoodcuttingUpgrade(upgradeId: string) {
  return WOODCUTTING_UPGRADES.find((upgrade) => upgrade.id === upgradeId);
}

export function getWoodcuttingUpgrades(category: WoodcuttingUpgradeCategory) {
  return WOODCUTTING_UPGRADES.filter((upgrade) => upgrade.category === category);
}

export function getWoodcuttingCritters(tier: WoodcuttingTier): readonly WoodcuttingCritter[] {
  return WOODCUTTING_CRITTER_CONFIG[tier];
}

export function getWoodcuttingItemName(itemId: string) {
  const sapling = WOODCUTTING_SAPLINGS.find((entry) => entry.id === itemId);
  if (sapling) return sapling.name;
  const wood = WOODCUTTING_SAPLINGS.find((entry) => entry.woodItemId === itemId);
  if (wood) return wood.woodName;
  const amber = WOODCUTTING_SAPLINGS.find((entry) => entry.amberItemId === itemId);
  if (amber) return amber.amberItemId.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
  for (const tier of [1, 2, 3, 4, 5, 6, 7] as const) {
    const critter = WOODCUTTING_CRITTER_CONFIG[tier].find((entry) => entry.id === itemId);
    if (critter) return critter.name;
  }
  return itemId;
}

export function getWoodcuttingChopIntervalMs(ownedUpgradeIds: readonly string[], workerCount: number) {
  const sharpening = WOODCUTTING_UPGRADES
    .filter((upgrade) => upgrade.category === 'sharpening' && ownedUpgradeIds.includes(upgrade.id))
    .reduce((fastest, upgrade) => Math.min(fastest, upgrade.value), BASE_CHOP_INTERVAL_MS / 1_000);
  const hasLumberjacksStew = ownedUpgradeIds.includes('meal-lumberjacks-stew');
  const speedMultiplier = hasLumberjacksStew ? 1 + (Math.max(0, Math.min(MAX_WORKERS, workerCount)) * 0.01) : 1;
  return (sharpening * 1_000) / speedMultiplier;
}

export function getWoodcuttingSuccessRate(ownedUpgradeIds: readonly string[]) {
  const lodgingCount = WOODCUTTING_UPGRADES.filter((upgrade) => upgrade.category === 'lodging' && ownedUpgradeIds.includes(upgrade.id)).length;
  const mealBonus = ownedUpgradeIds.includes('meal-woodland-chowder') ? 0.05 : 0;
  return Math.min(1, BASE_SUCCESS_RATE + (lodgingCount * 0.1) + mealBonus);
}

function seededRandom(seed: number) {
  let state = (Math.trunc(seed) >>> 0) || 0x6D2B79F5;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sampleBinomial(trials: number, probability: number, random: () => number) {
  const n = Math.max(0, Math.floor(trials));
  const p = Math.max(0, Math.min(1, probability));
  if (n === 0 || p === 0) return 0;
  if (p === 1) return n;
  // Exact rolls preserve intuitive low-count outcomes. A normal approximation
  // avoids a multi-million random-roll loop after a long unattended claim.
  if (n <= 20_000) {
    let successes = 0;
    for (let index = 0; index < n; index += 1) if (random() < p) successes += 1;
    return successes;
  }
  const u1 = Math.max(Number.EPSILON, random());
  const u2 = random();
  const standardNormal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(n, Math.round((n * p) + (standardNormal * Math.sqrt(n * p * (1 - p))))));
}

function addQuantity(target: Map<string, number>, itemId: string, quantity: number) {
  if (quantity > 0) target.set(itemId, (target.get(itemId) ?? 0) + quantity);
}

function distributeWeightedDrops(target: Map<string, number>, drops: number, critters: readonly WoodcuttingCritter[], random: () => number) {
  let remainingDrops = drops;
  let remainingWeight = critters.reduce((total, critter) => total + critter.weight, 0);
  for (const critter of critters.slice(0, -1)) {
    const quantity = sampleBinomial(remainingDrops, critter.weight / remainingWeight, random);
    addQuantity(target, critter.id, quantity);
    remainingDrops -= quantity;
    remainingWeight -= critter.weight;
  }
  if (remainingDrops > 0) addQuantity(target, critters[critters.length - 1]!.id, remainingDrops);
}

/** Returns the number of eligible chops before a finite sapling stack runs out. */
function resolveChopsWithSaplings(attempts: number, saplings: number, hasSapSaverStew: boolean, random: () => number) {
  if (attempts <= 0 || saplings <= 0) return { consumed: 0, finished: 0 };
  if (!hasSapSaverStew) return { consumed: Math.min(attempts, saplings), finished: Math.min(attempts, saplings) };
  let consumed = 0;
  let finished = 0;
  // A stack cannot exceed one million, so even the 20% non-consumption effect
  // has a deterministic upper bound of roughly 1.25M checks per sapling tier.
  while (finished < attempts && consumed < saplings) {
    finished += 1;
    if (random() >= 0.2) consumed += 1;
  }
  return { consumed, finished };
}

/**
 * Resolves all elapsed worker cycles in one bounded claim calculation. Work
 * stops for the remainder of the interval if a selected sapling stack empties;
 * this prevents newly purchased saplings from being applied retroactively.
 */
export function resolveWoodcuttingClaim(
  workers: readonly WoodcuttingWorkerSnapshot[],
  ownedUpgradeIds: readonly string[],
  saplingsByTier: ReadonlyMap<WoodcuttingTier, number>,
  elapsedMs: number,
  outcomeSeed: number,
): WoodcuttingClaimResult {
  const random = seededRandom(outcomeSeed);
  const intervalMs = getWoodcuttingChopIntervalMs(ownedUpgradeIds, workers.length);
  const rewards = new Map<string, number>();
  const consumption = new Map<string, number>();
  const workerRemainders = new Map<number, number>();
  const groupedWorkers = new Map<WoodcuttingTier, Array<{ attempts: number; worker: WoodcuttingWorkerSnapshot; remainder: number }>>();
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  let attemptedChops = 0;
  let finishedChops = 0;
  let successfulChops = 0;

  for (const worker of workers) {
    if (!worker.axeTier || !worker.saplingTier || worker.saplingTier > worker.axeTier) {
      workerRemainders.set(worker.workerNumber, 0);
      continue;
    }
    const availableMs = elapsed + Math.max(0, Math.floor(worker.chopRemainderMs));
    const attempts = Math.max(0, Math.floor(availableMs / intervalMs));
    const remainder = Math.max(0, Math.floor(availableMs - (attempts * intervalMs)));
    attemptedChops += attempts;
    const group = groupedWorkers.get(worker.saplingTier) ?? [];
    group.push({ attempts, worker, remainder });
    groupedWorkers.set(worker.saplingTier, group);
  }

  const hasSapSaverStew = ownedUpgradeIds.includes('meal-sap-savers-stew');
  const critterChance = CRITTER_FIND_RATE + (ownedUpgradeIds.includes('meal-trackers-stew') ? 0.05 : 0);
  const doubleWoodChance = ownedUpgradeIds.includes('meal-bountiful-stew') ? 0.1 : 0;
  const successRate = getWoodcuttingSuccessRate(ownedUpgradeIds);

  for (const [tier, activeWorkers] of groupedWorkers) {
    const sapling = getWoodcuttingSapling(tier)!;
    const attempts = activeWorkers.reduce((total, entry) => total + entry.attempts, 0);
    const availableSaplings = Math.max(0, Math.floor(saplingsByTier.get(tier) ?? 0));
    const resolved = resolveChopsWithSaplings(attempts, availableSaplings, hasSapSaverStew, random);
    addQuantity(consumption, sapling.id, resolved.consumed);
    finishedChops += resolved.finished;

    const successes = sampleBinomial(resolved.finished, successRate, random);
    successfulChops += successes;
    addQuantity(rewards, sapling.woodItemId, successes + sampleBinomial(successes, doubleWoodChance, random));
    const critterDrops = sampleBinomial(resolved.finished, critterChance, random);
    distributeWeightedDrops(rewards, critterDrops, getWoodcuttingCritters(tier), random);
    addQuantity(rewards, sapling.amberItemId, sampleBinomial(resolved.finished, AMBER_FIND_RATE, random));

    const stackRanOut = resolved.finished < attempts;
    for (const entry of activeWorkers) {
      workerRemainders.set(entry.worker.workerNumber, stackRanOut ? 0 : entry.remainder);
    }
  }

  return {
    attemptedChops,
    finishedChops,
    itemRewards: [...rewards.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    saplingsConsumed: [...consumption.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    successfulChops,
    workerRemainders: workers.map((worker) => ({
      workerNumber: worker.workerNumber,
      chopRemainderMs: workerRemainders.get(worker.workerNumber) ?? 0,
    })),
  };
}
