import { randomInt } from 'node:crypto';
import { ApiError } from '@/lib/api-utils';
import { getDiscordGameIdentity, type DiscordGameIdentity } from '@/lib/discord-game-identity';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getMiningBestUpgrade, getMiningResource } from '../discord-bot/src/mining-catalog';
import {
  getWoodcuttingAxe,
  getWoodcuttingChopIntervalMs,
  getWoodcuttingCritters,
  getWoodcuttingItemName,
  getWoodcuttingSapling,
  getWoodcuttingSuccessRate,
  getWoodcuttingUpgrade,
  resolveWoodcuttingClaim,
  WOODCUTTING_AXES,
  WOODCUTTING_SAPLINGS,
  WOODCUTTING_UPGRADES,
  WOODCUTTING_WORKER_COSTS,
  type WoodcuttingRecipeItem,
  type WoodcuttingTier,
} from '../discord-bot/src/woodcutting-catalog';

type WoodcuttingIdentity = DiscordGameIdentity;
type InventoryRow = { item_id: string; quantity: number };
type MiningInventoryRow = { resource_id: string; quantity: number };
type AxeRow = { axe_tier: WoodcuttingTier; id: number };
type WorkerRow = { axe_id: number | null; chop_remainder_ms: number; sapling_tier: WoodcuttingTier | null; worker_number: number };
type WoodcuttingState = {
  axes: Array<{ id: number; tier: WoodcuttingTier }>;
  balance: number;
  inventory: InventoryRow[];
  lastClaimedAt: string;
  miningInventory: MiningInventoryRow[];
  miningOwnedUpgradeIds: string[];
  ownedUpgradeIds: string[];
  processorTier: number;
  workers: Array<{ axeId: number | null; axeTier: WoodcuttingTier | null; chopRemainderMs: number; saplingTier: WoodcuttingTier | null; workerNumber: number }>;
};

export type WoodcuttingDashboard = {
  axes: Array<{ assignedTo: number | null; id: number; name: string; tier: WoodcuttingTier }>;
  balance: number;
  claimPreview: { activeWorkers: number; intervalMs: number; successRate: number; treesReady: number };
  inventory: Array<{ id: string; kind: 'amber' | 'critter' | 'sapling' | 'wood'; name: string; quantity: number; tier: number | null }>;
  nextWorkerCost: number | null;
  production: { activeWorkers: number; intervalMs: number; nextClaimAt: string; successRate: number };
  shop: {
    axes: Array<{ canCraft: boolean; name: string; recipe: Array<{ name: string; quantity: number; source: 'mining' | 'woodcutting' }>; tier: WoodcuttingTier }>;
    saplings: Array<{ canBuy: boolean; cost: number; name: string; quantity: number; tier: WoodcuttingTier; woodName: string }>;
    upgrades: Array<{ canCraft: boolean; category: string; description: string; id: string; name: string; owned: boolean; recipe: Array<{ name: string; quantity: number; source: 'mining' | 'woodcutting' }> }>;
  };
  workers: Array<{ axeName: string | null; axeTier: WoodcuttingTier | null; saplingName: string | null; saplingTier: WoodcuttingTier | null; workerNumber: number }>;
};

function firstRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function getWoodcuttingIdentity(userId: string): Promise<WoodcuttingIdentity> {
  return getDiscordGameIdentity(userId, 'Woodcutting');
}

async function ensureWoodcuttingPlayer(identity: WoodcuttingIdentity) {
  const { error } = await getSupabaseServiceClient().rpc('ensure_discord_woodcutting_player', {
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
}

async function getWoodcuttingState(identity: WoodcuttingIdentity): Promise<WoodcuttingState> {
  await ensureWoodcuttingPlayer(identity);
  const supabase = getSupabaseServiceClient();
  const [player, inventory, axes, workers, upgrades, miningInventory, miningUpgrades, balance] = await Promise.all([
    supabase.from('discord_woodcutting_players').select('last_claimed_at').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).maybeSingle<{ last_claimed_at: string }>(),
    supabase.from('discord_woodcutting_inventory').select('item_id,quantity').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('item_id').returns<InventoryRow[]>(),
    supabase.from('discord_woodcutting_axes').select('id,axe_tier').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('id').returns<AxeRow[]>(),
    supabase.from('discord_woodcutting_workers').select('worker_number,axe_id,sapling_tier,chop_remainder_ms').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('worker_number').returns<WorkerRow[]>(),
    supabase.from('discord_woodcutting_upgrades').select('upgrade_id').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<Array<{ upgrade_id: string }>>(),
    supabase.from('discord_game_resource_inventory').select('resource_id,quantity').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<MiningInventoryRow[]>(),
    supabase.from('discord_mining_player_upgrades').select('upgrade_id').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<Array<{ upgrade_id: string }>>(),
    supabase.from('discord_knowbucks_balances').select('balance').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).maybeSingle<{ balance: number }>(),
  ]);
  if (player.error || inventory.error || axes.error || workers.error || upgrades.error || miningInventory.error || miningUpgrades.error || balance.error) {
    throw player.error ?? inventory.error ?? axes.error ?? workers.error ?? upgrades.error ?? miningInventory.error ?? miningUpgrades.error ?? balance.error;
  }
  const axesData = (axes.data ?? []).map((axe) => ({ id: axe.id, tier: axe.axe_tier }));
  const axeTierById = new Map(axesData.map((axe) => [axe.id, axe.tier]));
  return {
    axes: axesData,
    balance: balance.data?.balance ?? 0,
    inventory: inventory.data ?? [],
    lastClaimedAt: player.data?.last_claimed_at ?? new Date().toISOString(),
    miningInventory: miningInventory.data ?? [],
    miningOwnedUpgradeIds: (miningUpgrades.data ?? []).map((upgrade) => upgrade.upgrade_id),
    ownedUpgradeIds: (upgrades.data ?? []).map((upgrade) => upgrade.upgrade_id),
    processorTier: getMiningBestUpgrade((miningUpgrades.data ?? []).map((upgrade) => upgrade.upgrade_id), 'processor')?.value ?? 0,
    workers: (workers.data ?? []).map((worker) => ({
      axeId: worker.axe_id,
      axeTier: worker.axe_id ? axeTierById.get(worker.axe_id) ?? null : null,
      chopRemainderMs: worker.chop_remainder_ms,
      saplingTier: worker.sapling_tier,
      workerNumber: worker.worker_number,
    })),
  };
}

function inventoryQuantity(inventory: readonly InventoryRow[], itemId: string) {
  return inventory.find((item) => item.item_id === itemId)?.quantity ?? 0;
}

function groupedRecipe(recipe: readonly WoodcuttingRecipeItem[], source: WoodcuttingRecipeItem['source']) {
  return recipe.filter((item) => item.source === source).map((item) => ({ item_id: item.itemId, quantity: item.quantity }));
}

function canAffordRecipe(state: WoodcuttingState, recipe: readonly WoodcuttingRecipeItem[]) {
  const mining = new Map(state.miningInventory.map((item) => [item.resource_id, item.quantity]));
  const woodcutting = new Map(state.inventory.map((item) => [item.item_id, item.quantity]));
  return recipe.every((item) => {
    const quantity = item.source === 'mining' ? mining.get(item.itemId) ?? 0 : woodcutting.get(item.itemId) ?? 0;
    const miningResource = item.source === 'mining' ? getMiningResource(item.itemId) : undefined;
    return quantity >= item.quantity && (!miningResource || miningResource.kind !== 'ore' || (miningResource.processorTier ?? 0) <= state.processorTier);
  });
}

function describeRecipe(recipe: readonly WoodcuttingRecipeItem[]) {
  return recipe.map((item) => ({
    name: item.source === 'mining' ? getMiningResource(item.itemId)?.name ?? item.itemId : getWoodcuttingItemName(item.itemId),
    quantity: item.quantity,
    source: item.source,
  }));
}

function getClaimResult(state: WoodcuttingState) {
  const saplingsByTier = new Map<WoodcuttingTier, number>(WOODCUTTING_SAPLINGS.map((sapling) => [sapling.tier, inventoryQuantity(state.inventory, sapling.id)]));
  return resolveWoodcuttingClaim(
    state.workers.map((worker) => ({ axeTier: worker.axeTier, chopRemainderMs: worker.chopRemainderMs, saplingTier: worker.saplingTier, workerNumber: worker.workerNumber })),
    state.ownedUpgradeIds,
    saplingsByTier,
    Math.max(0, Date.now() - new Date(state.lastClaimedAt).getTime()),
    randomInt(1, 2_147_483_648),
  );
}

async function settleWoodcuttingBeforeMutation(identity: WoodcuttingIdentity) {
  const state = await getWoodcuttingState(identity);
  const result = getClaimResult(state);
  const { error } = await getSupabaseServiceClient().rpc('claim_discord_woodcutting_rewards', {
    p_discord_user_id: identity.discordUserId,
    p_expected_last_claimed_at: state.lastClaimedAt,
    p_guild_id: identity.guildId,
    p_item_rewards: result.itemRewards.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity })),
    p_sapling_consumption: result.saplingsConsumed.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity })),
    p_worker_remainders: result.workerRemainders.map((entry) => ({ chop_remainder_ms: entry.chopRemainderMs, worker_number: entry.workerNumber })),
  });
  if (error) throw error;
  return getWoodcuttingState(identity);
}

async function buildWoodcuttingDashboard(identity: WoodcuttingIdentity): Promise<WoodcuttingDashboard> {
  const state = await getWoodcuttingState(identity);
  const now = Date.now();
  const intervalMs = getWoodcuttingChopIntervalMs(state.ownedUpgradeIds, state.workers.length);
  const activeWorkers = state.workers.filter((worker) => worker.axeTier && worker.saplingTier).length;
  const claimPreview = getClaimResult(state);
  const assignedWorkerByAxe = new Map(state.workers.filter((worker) => worker.axeId !== null).map((worker) => [worker.axeId!, worker.workerNumber]));
  const inventory = state.inventory.map((entry) => {
    const sapling = WOODCUTTING_SAPLINGS.find((item) => item.id === entry.item_id);
    const wood = WOODCUTTING_SAPLINGS.find((item) => item.woodItemId === entry.item_id);
    const amber = WOODCUTTING_SAPLINGS.find((item) => item.amberItemId === entry.item_id);
    const critterTier = ([1, 2, 3, 4, 5, 6, 7] as const).find((tier) => getWoodcuttingCritters(tier).some((critter) => critter.id === entry.item_id)) ?? null;
    return {
      id: entry.item_id,
      kind: sapling ? 'sapling' as const : wood ? 'wood' as const : amber ? 'amber' as const : 'critter' as const,
      name: getWoodcuttingItemName(entry.item_id),
      quantity: entry.quantity,
      tier: sapling?.tier ?? wood?.tier ?? amber?.tier ?? critterTier,
    };
  });

  return {
    axes: state.axes.map((axe) => ({ assignedTo: assignedWorkerByAxe.get(axe.id) ?? null, id: axe.id, name: getWoodcuttingAxe(axe.tier)?.name ?? `Tier ${axe.tier} Axe`, tier: axe.tier })),
    balance: state.balance,
    claimPreview: { activeWorkers, intervalMs, successRate: getWoodcuttingSuccessRate(state.ownedUpgradeIds), treesReady: claimPreview.finishedChops },
    inventory,
    nextWorkerCost: WOODCUTTING_WORKER_COSTS[state.workers.length] ?? null,
    production: {
      activeWorkers,
      intervalMs,
      nextClaimAt: new Date(now + Math.max(0, intervalMs - Math.max(...state.workers.map((worker) => worker.chopRemainderMs), 0))).toISOString(),
      successRate: getWoodcuttingSuccessRate(state.ownedUpgradeIds),
    },
    shop: {
      axes: WOODCUTTING_AXES.map((axe) => ({ canCraft: canAffordRecipe(state, axe.recipe), name: axe.name, recipe: describeRecipe(axe.recipe), tier: axe.tier })),
      saplings: WOODCUTTING_SAPLINGS.map((sapling) => ({
        canBuy: state.axes.some((axe) => axe.tier >= sapling.tier) && (!sapling.processorUpgradeId || state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)),
        cost: sapling.saplingCost,
        name: sapling.name,
        quantity: inventoryQuantity(state.inventory, sapling.id),
        tier: sapling.tier,
        woodName: sapling.woodName,
      })),
      upgrades: WOODCUTTING_UPGRADES.map((upgrade) => ({
        canCraft: !state.ownedUpgradeIds.includes(upgrade.id) && (!upgrade.previousUpgradeId || state.ownedUpgradeIds.includes(upgrade.previousUpgradeId)) && canAffordRecipe(state, upgrade.recipe),
        category: upgrade.category,
        description: upgrade.description,
        id: upgrade.id,
        name: upgrade.name,
        owned: state.ownedUpgradeIds.includes(upgrade.id),
        recipe: describeRecipe(upgrade.recipe),
      })),
    },
    workers: state.workers.map((worker) => ({
      axeName: worker.axeTier ? getWoodcuttingAxe(worker.axeTier)?.name ?? null : null,
      axeTier: worker.axeTier,
      saplingName: worker.saplingTier ? getWoodcuttingSapling(worker.saplingTier)?.name ?? null : null,
      saplingTier: worker.saplingTier,
      workerNumber: worker.workerNumber,
    })),
  };
}

export async function getWoodcuttingDashboard(userId: string) {
  return buildWoodcuttingDashboard(await getWoodcuttingIdentity(userId));
}

export async function claimWoodcuttingWebsiteRewards(userId: string) {
  const identity = await getWoodcuttingIdentity(userId);
  await settleWoodcuttingBeforeMutation(identity);
  return buildWoodcuttingDashboard(identity);
}

export async function hireWoodcuttingWebsiteWorker(userId: string) {
  const identity = await getWoodcuttingIdentity(userId);
  const state = await settleWoodcuttingBeforeMutation(identity);
  const cost = WOODCUTTING_WORKER_COSTS[state.workers.length];
  if (!cost) throw new ApiError(409, 'You already have the maximum of 10 lumberjacks.');
  const { data, error } = await getSupabaseServiceClient().rpc('hire_discord_woodcutting_worker', {
    p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId, p_knowbucks_cost: cost,
  });
  if (error) throw error;
  if (!firstRow(data as { worker_number: number } | Array<{ worker_number: number }> | null)) throw new Error('The lumberjack hire did not return a result.');
  return buildWoodcuttingDashboard(identity);
}

export async function buyWoodcuttingWebsiteSaplings(userId: string, tier: WoodcuttingTier, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new ApiError(400, 'Choose between 1 and 1,000,000 saplings.');
  const identity = await getWoodcuttingIdentity(userId);
  const sapling = getWoodcuttingSapling(tier);
  if (!sapling) throw new ApiError(400, 'Choose a valid sapling type.');
  const state = await settleWoodcuttingBeforeMutation(identity);
  if (!state.axes.some((axe) => axe.tier >= tier)) throw new ApiError(409, `${sapling.name} requires a matching axe first.`);
  if (sapling.processorUpgradeId && !state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)) throw new ApiError(409, `${sapling.name} requires the matching Resource Processor.`);
  const { error } = await getSupabaseServiceClient().rpc('purchase_discord_woodcutting_saplings', {
    p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId, p_knowbucks_cost: sapling.saplingCost * quantity, p_quantity: quantity, p_sapling_item_id: sapling.id,
  });
  if (error) throw error;
  return buildWoodcuttingDashboard(identity);
}

export async function craftWoodcuttingWebsiteAxe(userId: string, tier: WoodcuttingTier) {
  const identity = await getWoodcuttingIdentity(userId);
  const axe = getWoodcuttingAxe(tier);
  if (!axe) throw new ApiError(400, 'Choose a valid axe.');
  const state = await settleWoodcuttingBeforeMutation(identity);
  if (!canAffordRecipe(state, axe.recipe)) throw new ApiError(409, 'You do not have the required processed materials.');
  const { error } = await getSupabaseServiceClient().rpc('craft_discord_woodcutting_axe', {
    p_axe_tier: tier, p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId, p_mining_cost: groupedRecipe(axe.recipe, 'mining'), p_woodcutting_cost: groupedRecipe(axe.recipe, 'woodcutting'),
  });
  if (error) throw error;
  return buildWoodcuttingDashboard(identity);
}

export async function craftWoodcuttingWebsiteUpgrade(userId: string, upgradeId: string) {
  const identity = await getWoodcuttingIdentity(userId);
  const upgrade = getWoodcuttingUpgrade(upgradeId);
  if (!upgrade) throw new ApiError(400, 'Choose a valid Woodcutting upgrade.');
  const state = await settleWoodcuttingBeforeMutation(identity);
  if (state.ownedUpgradeIds.includes(upgrade.id)) throw new ApiError(409, 'You already own this Woodcutting upgrade.');
  if (upgrade.previousUpgradeId && !state.ownedUpgradeIds.includes(upgrade.previousUpgradeId)) throw new ApiError(409, `${upgrade.name} requires its preceding upgrade first.`);
  if (!canAffordRecipe(state, upgrade.recipe)) throw new ApiError(409, 'You do not have the required processed materials.');
  const { error } = await getSupabaseServiceClient().rpc('craft_discord_woodcutting_upgrade', {
    p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId, p_mining_cost: groupedRecipe(upgrade.recipe, 'mining'), p_upgrade_id: upgrade.id, p_woodcutting_cost: groupedRecipe(upgrade.recipe, 'woodcutting'),
  });
  if (error) throw error;
  return buildWoodcuttingDashboard(identity);
}

export async function autoAssignWoodcuttingWebsiteWorkers(userId: string) {
  const identity = await getWoodcuttingIdentity(userId);
  const state = await settleWoodcuttingBeforeMutation(identity);
  const stockedSaplings = WOODCUTTING_SAPLINGS.filter((sapling) => inventoryQuantity(state.inventory, sapling.id) > 0 && (!sapling.processorUpgradeId || state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)));
  const assignments = state.workers.map((worker, index) => {
    const axe = [...state.axes].sort((left, right) => right.tier - left.tier || right.id - left.id)[index];
    const sapling = axe ? stockedSaplings.filter((entry) => entry.tier <= axe.tier).sort((left, right) => right.tier - left.tier)[0] : null;
    return axe && sapling ? { axe_id: axe.id, sapling_tier: sapling.tier, worker_number: worker.workerNumber } : null;
  }).filter((assignment): assignment is { axe_id: number; sapling_tier: WoodcuttingTier; worker_number: number } => Boolean(assignment));
  const { error } = await getSupabaseServiceClient().rpc('assign_discord_woodcutting_workers_automatically', {
    p_assignments: assignments, p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId,
  });
  if (error) throw error;
  return buildWoodcuttingDashboard(identity);
}

export async function assignWoodcuttingWebsiteWorker(userId: string, workerNumber: number, axeId: number, saplingTier: WoodcuttingTier) {
  if (!Number.isSafeInteger(workerNumber) || !Number.isSafeInteger(axeId)) throw new ApiError(400, 'Choose a valid lumberjack and axe.');
  const identity = await getWoodcuttingIdentity(userId);
  const state = await settleWoodcuttingBeforeMutation(identity);
  const worker = state.workers.find((entry) => entry.workerNumber === workerNumber);
  const axe = state.axes.find((entry) => entry.id === axeId);
  const sapling = getWoodcuttingSapling(saplingTier);
  if (!worker || !axe || !sapling) throw new ApiError(400, 'Choose a valid lumberjack assignment.');
  if (state.workers.some((entry) => entry.workerNumber !== workerNumber && entry.axeId === axeId)) throw new ApiError(409, 'That axe is already assigned to another lumberjack.');
  if (sapling.tier > axe.tier) throw new ApiError(409, 'A lumberjack cannot chop a sapling above their axe tier.');
  if (inventoryQuantity(state.inventory, sapling.id) < 1) throw new ApiError(409, `Stock at least one ${sapling.name} before assigning this lumberjack.`);
  if (sapling.processorUpgradeId && !state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)) throw new ApiError(409, `${sapling.name} requires the matching Resource Processor.`);
  const { error } = await getSupabaseServiceClient().rpc('assign_discord_woodcutting_worker', {
    p_axe_id: axe.id, p_discord_user_id: identity.discordUserId, p_guild_id: identity.guildId, p_sapling_tier: sapling.tier, p_worker_number: worker.workerNumber,
  });
  if (error) throw error;
  return buildWoodcuttingDashboard(identity);
}
