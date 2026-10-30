import { MINING_DEPTH_CONFIG, MINING_GEAR_CONTENT_CONFIG, MINING_GEAR_DROP_RATE, MINING_REWARD_WEIGHT_CONFIG, MINING_SHOP_UPGRADE_CONFIG } from './minigame-content-config.js';

export type MiningDepthId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type MiningResourceKind = 'ore' | 'gem' | 'fossil';
export type MiningUpgradeCategory = 'tool' | 'storage' | 'processor' | 'elevator' | 'filter';
export type MiningEventId = 'lost-temple' | 'ore-vein' | 'gem-cluster' | 'damaged-gear' | 'arcane-rift' | 'energy-crystals' | 'old-dynamite' | 'quantum-fluctuations';
export type MiningEventAction = 'attempt-relic' | 'continue' | 'claim-ores' | 'claim-gems' | 'repair' | 'enter-rift' | 'claim-crystals' | 'trigger-dynamite' | 'embrace-fluctuations';
export type MiningEventTrigger = 'half-cart' | 'full-cart' | 'timed';
export type MiningEventStatus = 'scheduled' | 'active' | 'resolved' | 'expired';

/**
 * A durable, server-authored event plan. It is persisted with the expedition
 * so Discord and the website can project precisely the same event and result.
 */
export type MiningExpeditionEventState = {
  action?: MiningEventAction;
  activatedAt?: string;
  expiresAt?: string;
  id: MiningEventId;
  relicItemId?: string;
  resolvedAt?: string;
  status: MiningEventStatus;
  success?: boolean;
  trigger: MiningEventTrigger;
  /** Elapsed mining time after descent, rather than wall-clock time. */
  triggerDelayMs: number;
  version: 1;
};

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
  catalogVersion: 1 | 2;
  descendDurationMs: number;
  elevatorTier: number;
  filterTier: number;
  hasteLevel: number;
  luckLevel: number;
  passiveGearItemIds?: readonly string[];
  storageCapacity: number;
  toolId: string;
  toolStonesPerSecond: number;
};

export type MiningResult = {
  /** True only when every available cart compartment was filled before return. */
  cartFull: boolean;
  cargo: Array<{ id: string; kind: MiningResourceKind; name: string; quantity: number }>;
  discardedStone: number;
  gearItems?: Array<{ itemId: string; quantity: number }>;
  gemStorageCapacity?: number;
  gemStorageUsed?: number;
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
export const MINING_GEAR = MINING_GEAR_CONTENT_CONFIG;
export const MINING_GEAR_FIND_RATE = MINING_GEAR_DROP_RATE;
export const MINING_EVENT_CHANCE = 0.1;

export function getMiningEventTimeLimitMs(depthId: MiningDepthId) {
  return Math.max(30_000, Math.floor(depthId) * 30_000);
}

/**
 * Makes deeper carts proportionally more likely to find a Relic, preserving
 * approximately the same real-time expected wait despite their travel time.
 */
export function getMiningRelicFindChance(depthId: MiningDepthId) {
  const depth = getMiningDepth(depthId);
  const shallow = getMiningDepth(1);
  if (!depth || !shallow) return 0;
  return Math.min(1, MINING_GEAR_FIND_RATE * (depth.descendAndAscendMs / shallow.descendAndAscendMs));
}

export function getMiningGear(itemId: string) {
  return MINING_GEAR.find((gear) => gear.id === itemId);
}

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

export function getMiningTravelDurationMs(baseRoundTripMs: number, elevatorTier: number, hasteLevel: number, alienEngine = false) {
  const elevatorMultiplier = Math.max(0.1, 1 - (Math.max(0, Math.min(3, elevatorTier)) * 0.1));
  const hasteMultiplier = Math.max(0.1, 1 - (Math.max(0, Math.min(4, hasteLevel)) * 0.05));
  const alienEngineMultiplier = alienEngine ? 0.95 : 1;
  return Math.max(1_000, Math.round((baseRoundTripMs / 2) * elevatorMultiplier * hasteMultiplier * alienEngineMultiplier));
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

/** Chooses at most one event when the expedition is launched, after descent. */
export function createMiningExpeditionEvent(
  depthId: MiningDepthId,
  equipment: MiningEquipmentSnapshot,
  eventSeed: number,
  unacquiredRelicItemIds: readonly string[],
): MiningExpeditionEventState | null {
  const random = seededRandom(eventSeed);
  if (random() >= MINING_EVENT_CHANCE) return null;
  const hasGemPouch = (equipment.passiveGearItemIds ?? []).includes('mining-gear-gem-bag');
  const candidates: Array<{ id: MiningEventId; weight: number }> = [
    ...(unacquiredRelicItemIds.length ? [{ id: 'lost-temple' as const, weight: 1 }] : []),
    { id: 'ore-vein', weight: 1 },
    ...(hasGemPouch ? [{ id: 'gem-cluster' as const, weight: 1 }] : []),
    // Luck specifically counters gear damage; each level halves this event's weight.
    { id: 'damaged-gear', weight: 0.5 ** Math.max(0, Math.min(5, Math.floor(equipment.luckLevel))) },
    { id: 'arcane-rift', weight: 1 },
    { id: 'energy-crystals', weight: 1 },
    { id: 'old-dynamite', weight: 1 },
    { id: 'quantum-fluctuations', weight: 1 },
  ];
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  let roll = random() * totalWeight;
  let selected = candidates[candidates.length - 1]!;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) {
      selected = candidate;
      break;
    }
  }
  const trigger: MiningEventTrigger = selected.id === 'ore-vein' || selected.id === 'arcane-rift'
    ? 'half-cart'
    : selected.id === 'lost-temple' || selected.id === 'gem-cluster'
      ? 'full-cart'
      : 'timed';
  // Timed events occur shortly after descent. Damaged Gear intentionally has a
  // wider random window because it is not tied to the cart's capacity.
  const triggerDelayMs = selected.id === 'damaged-gear'
    ? 30_000 + Math.floor(random() * Math.max(150_000, depthId * 30_000))
    : trigger === 'timed' ? 30_000 : 0;
  return {
    id: selected.id,
    ...(selected.id === 'lost-temple' ? { relicItemId: pick(unacquiredRelicItemIds, random) } : {}),
    status: 'scheduled',
    trigger,
    triggerDelayMs,
    version: 1,
  };
}

export function isMiningEventReady(
  event: MiningExpeditionEventState,
  result: Pick<MiningResult, 'storageUsed'>,
  miningElapsedMs: number,
  storageCapacity: number,
) {
  if (event.status !== 'scheduled') return false;
  if (event.trigger === 'timed') return miningElapsedMs >= event.triggerDelayMs;
  if (event.trigger === 'half-cart') return result.storageUsed >= Math.ceil(Math.max(1, storageCapacity) / 2);
  return result.storageUsed >= Math.max(1, storageCapacity);
}

/**
 * Calculates the real elapsed moment a planned event became available. This
 * keeps deadline handling correct even if the player did not refresh exactly
 * when a cart threshold was first crossed.
 */
export function getMiningEventActivationElapsedMs(
  event: MiningExpeditionEventState,
  depthId: MiningDepthId,
  equipment: MiningEquipmentSnapshot,
  outcomeSeed: number,
  miningElapsedMs: number,
) {
  const elapsed = Math.max(0, Math.floor(miningElapsedMs));
  if (event.status !== 'scheduled') return null;
  if (event.trigger === 'timed') return elapsed >= event.triggerDelayMs ? event.triggerDelayMs : null;
  const threshold = event.trigger === 'half-cart'
    ? Math.ceil(Math.max(1, equipment.storageCapacity) / 2)
    : Math.max(1, equipment.storageCapacity);
  const atElapsed = (milliseconds: number) => resolveMiningExpedition(depthId, equipment, outcomeSeed, milliseconds).storageUsed;
  if (atElapsed(elapsed) < threshold) return null;
  let low = 0;
  let high = elapsed;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (atElapsed(middle) >= threshold) high = middle;
    else low = middle + 1;
  }
  return low;
}

function isActionForMiningEvent(eventId: MiningEventId, action: MiningEventAction) {
  return (eventId === 'lost-temple' && (action === 'attempt-relic' || action === 'continue'))
    || (eventId === 'ore-vein' && action === 'claim-ores')
    || (eventId === 'gem-cluster' && action === 'claim-gems')
    || (eventId === 'damaged-gear' && action === 'repair')
    || (eventId === 'arcane-rift' && action === 'enter-rift')
    || (eventId === 'energy-crystals' && action === 'claim-crystals')
    || (eventId === 'old-dynamite' && action === 'trigger-dynamite')
    || (eventId === 'quantum-fluctuations' && action === 'embrace-fluctuations');
}

/** Resolves one valid prompt action without trusting a client-side outcome. */
export function resolveMiningEventAction(
  event: MiningExpeditionEventState,
  action: MiningEventAction,
  eventSeed: number,
  resolvedAt: string,
): MiningExpeditionEventState {
  if (event.status !== 'active' || !isActionForMiningEvent(event.id, action)) throw new Error('That Mining event action is unavailable.');
  const success = event.id === 'lost-temple' && action === 'attempt-relic'
    ? seededRandom(eventSeed ^ 0x51F15EED)() < 0.1
    : undefined;
  return {
    ...event,
    action,
    resolvedAt,
    status: 'resolved',
    ...(success === undefined ? {} : { success }),
  };
}

function eventElapsedMs(event: MiningExpeditionEventState, miningStartedAt: number, fallbackElapsedMs: number) {
  const value = event.resolvedAt ?? event.expiresAt;
  if (!value) return fallbackElapsedMs;
  const elapsed = new Date(value).getTime() - miningStartedAt;
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : fallbackElapsedMs;
}

function effectiveMiningElapsedMs(
  miningElapsedMs: number,
  event: MiningExpeditionEventState | undefined,
  miningStartedAt: number | undefined,
) {
  if (!event || miningStartedAt === undefined) return miningElapsedMs;
  const transitionAt = eventElapsedMs(event, miningStartedAt, miningElapsedMs);
  if (event.id === 'energy-crystals' && event.action === 'claim-crystals' && event.status === 'resolved') {
    return transitionAt + (Math.max(0, miningElapsedMs - transitionAt) * 2);
  }
  if (event.id === 'damaged-gear' && event.status === 'expired') {
    return transitionAt + (Math.max(0, miningElapsedMs - transitionAt) * 0.5);
  }
  return miningElapsedMs;
}

function resourceAtHigherDepth(resource: MiningResource, random: () => number) {
  let current = resource;
  while (current.depth < 7 && random() < 0.05) {
    const nextDepth = getMiningDepth((current.depth + 1) as MiningDepthId);
    const candidates = current.kind === 'ore' ? nextDepth?.ores : current.kind === 'gem' ? nextDepth?.gems : [];
    if (!candidates?.length) break;
    current = pick(candidates, random);
  }
  return current;
}

/** Resolves only until storage fills; no work scales with unattended expedition time. */
export function resolveMiningExpedition(
  depthId: MiningDepthId,
  equipment: MiningEquipmentSnapshot,
  outcomeSeed: number,
  miningElapsedMs: number,
  event?: MiningExpeditionEventState,
  miningStartedAt?: number,
): MiningResult {
  const depth = getMiningDepth(depthId);
  if (!depth || !Number.isFinite(miningElapsedMs) || miningElapsedMs < 0 || (equipment.catalogVersion !== 1 && equipment.catalogVersion !== 2)) {
    throw new Error('Mining expedition data is invalid.');
  }
  const gearIds = new Set(equipment.passiveGearItemIds ?? []);
  const hasGear = (id: string) => gearIds.has(id);
  const effectiveElapsedMs = effectiveMiningElapsedMs(miningElapsedMs, event, miningStartedAt);
  const breakCount = Math.max(0, Math.floor((effectiveElapsedMs / 1_000) * equipment.toolStonesPerSecond * (hasGear('mining-gear-hardened-tip') ? 1.1 : 1)));
  const random = seededRandom(outcomeSeed);
  const cargo = new Map<string, { id: string; kind: MiningResourceKind; name: string; quantity: number }>();
  const gearItems = new Map<string, number>();
  const capacity = Math.max(1, Math.floor(equipment.storageCapacity));
  const gemStorageCapacity = hasGear('mining-gear-gem-bag') ? Math.max(1, Math.floor(capacity * 0.25)) : 0;
  const luckLevel = Math.max(0, Math.min(4, Math.floor(equipment.luckLevel)));
  const stoneToOreChance = Math.min(1, (luckLevel * 0.05) + (hasGear('mining-gear-bioluminescence') ? 0.05 : 0));
  const oreToGemChance = luckLevel * 0.01;
  const stoneDiscardChance = Math.max(0, Math.min(0.8, (Math.floor(equipment.filterTier) * 0.25) + (hasGear('mining-gear-melter') ? 0.05 : 0)));
  const fossilWeight = MINING_REWARD_WEIGHTS.fossil * (hasGear('mining-gear-paleontological-certificate') ? 2 : 1);
  const totalWeight = MINING_REWARD_WEIGHTS.stone + MINING_REWARD_WEIGHTS.ore + MINING_REWARD_WEIGHTS.gem + fossilWeight;
  let storageUsed = 0;
  let discardedStone = 0;
  let miningXpAwarded = 0;
  let stoneStored = 0;
  let stoneBroken = 0;
  let gemStorageUsed = 0;
  const eventActionElapsedMs = event && miningStartedAt !== undefined
    ? eventElapsedMs(event, miningStartedAt, miningElapsedMs)
    : Number.POSITIVE_INFINITY;
  const eventActionBreak = Math.max(0, Math.floor((Math.min(eventActionElapsedMs, miningElapsedMs) / 1_000) * equipment.toolStonesPerSecond * (hasGear('mining-gear-hardened-tip') ? 1.1 : 1)));
  const isResolved = event?.status === 'resolved';
  const forcedOres = isResolved && (event?.id === 'ore-vein' && event.action === 'claim-ores' || event?.id === 'old-dynamite' && event.action === 'trigger-dynamite');
  const forcedGems = isResolved && event?.id === 'gem-cluster' && event.action === 'claim-gems';
  const quantumStart = isResolved && event?.id === 'quantum-fluctuations' && event.action === 'embrace-fluctuations'
    ? eventActionBreak
    : Number.POSITIVE_INFINITY;
  const oresAtDepthOrBelow = MINING_DEPTHS.filter((candidate) => candidate.id <= depth.id).flatMap((candidate) => candidate.ores);
  const gemsAtDepthOrBelow = MINING_DEPTHS.filter((candidate) => candidate.id <= depth.id).flatMap((candidate) => candidate.gems);
  let forcedCartFilled = false;
  let forcedGemBagFilled = false;

  if (event?.id === 'lost-temple' && (event.status === 'expired' || (event.status === 'resolved' && event.action === 'attempt-relic' && event.success === false))) {
    return {
      cargo: [],
      cartFull: false,
      discardedStone: 0,
      gearItems: [],
      gemStorageCapacity,
      gemStorageUsed: 0,
      miningXpAwarded: 0,
      stoneStored: 0,
      stoneBroken: 0,
      storageUsed: 0,
    };
  }

  const addCargo = (resourceItem: MiningResource) => {
    const existing = cargo.get(resourceItem.id);
    if (existing) existing.quantity += 1;
    else cargo.set(resourceItem.id, { id: resourceItem.id, kind: resourceItem.kind, name: resourceItem.name, quantity: 1 });
  };

  const fillRemainingCartWithOres = () => {
    while (storageUsed < capacity) {
      addCargo(pick(oresAtDepthOrBelow, random));
      storageUsed += 1;
    }
  };

  const fillRemainingGemBagWithGems = () => {
    while (gemStorageUsed < gemStorageCapacity) {
      addCargo(pick(gemsAtDepthOrBelow, random));
      gemStorageUsed += 1;
    }
  };

  for (let index = 0; index < breakCount && (storageUsed < capacity || gemStorageUsed < gemStorageCapacity); index += 1) {
    if (forcedOres && !forcedCartFilled && index >= eventActionBreak) {
      fillRemainingCartWithOres();
      forcedCartFilled = true;
    }
    if (forcedGems && !forcedGemBagFilled && index >= eventActionBreak) {
      fillRemainingGemBagWithGems();
      forcedGemBagFilled = true;
    }
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
    // Once dynamite is triggered, the ordinary cart keeps producing ore. A
    // Gem Bag remains an explicit exception so the player can keep filling it.
    const dynamiteActive = isResolved && event?.id === 'old-dynamite' && event.action === 'trigger-dynamite' && index >= eventActionBreak;
    const gemBagCanTakeResource = resourceItem !== 'stone' && resourceItem.kind === 'gem' && gemStorageUsed < gemStorageCapacity;
    if (dynamiteActive && resourceItem !== 'stone' && (resourceItem.kind === 'fossil' || !gemBagCanTakeResource)) {
      resourceItem = pick(depth.ores, random);
    }
    if (index >= quantumStart && resourceItem !== 'stone' && (resourceItem.kind === 'ore' || resourceItem.kind === 'gem')) {
      resourceItem = resourceAtHigherDepth(resourceItem, random);
    }
    if (resourceItem === 'stone' && random() < stoneDiscardChance) {
      discardedStone += 1;
      continue;
    }

    const usesGemBag = resourceItem !== 'stone' && resourceItem.kind === 'gem' && gemStorageUsed < gemStorageCapacity;
    if (!usesGemBag && storageUsed >= capacity) continue;
    if (usesGemBag) gemStorageUsed += 1;
    else storageUsed += 1;
    if (resourceItem === 'stone') {
      stoneStored += 1;
      continue;
    }
    miningXpAwarded += resourceItem.kind === 'ore' ? 2 : resourceItem.kind === 'gem' ? 5 : 25;
    addCargo(resourceItem);
    if (resourceItem.kind === 'gem' && hasGear('gear-gemcracker') && random() < 0.1) {
      const duplicate = cargo.get(resourceItem.id)!;
      duplicate.quantity += 1;
    }
  }

  if (forcedOres && !forcedCartFilled && miningElapsedMs >= eventActionElapsedMs) fillRemainingCartWithOres();
  if (forcedGems && !forcedGemBagFilled && miningElapsedMs >= eventActionElapsedMs) fillRemainingGemBagWithGems();

  const cartFull = storageUsed >= capacity && gemStorageUsed >= gemStorageCapacity;
  const eligibleGear = MINING_GEAR.filter((gear) => gear.depth === depth.id && !gearIds.has(gear.id));
  if (cartFull && eligibleGear.length > 0 && random() < getMiningRelicFindChance(depth.id)) {
    const gear = pick(eligibleGear, random);
    gearItems.set(gear.id, 1);
  }
  if (event?.id === 'lost-temple' && event.status === 'resolved' && event.action === 'attempt-relic' && event.success && event.relicItemId) {
    gearItems.set(event.relicItemId, 1);
  }

  const xpMultiplier = hasGear('gear-giant-pearl') ? 1.25 : 1;
  return { cargo: [...cargo.values()], cartFull, discardedStone, gearItems: [...gearItems.entries()].map(([itemId, quantity]) => ({ itemId, quantity })), gemStorageCapacity, gemStorageUsed, miningXpAwarded: Math.floor(miningXpAwarded * xpMultiplier), stoneStored, stoneBroken, storageUsed };
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
