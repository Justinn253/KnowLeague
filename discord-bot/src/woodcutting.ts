import { randomInt } from 'node:crypto';
import type { DiscordBotConfig } from './config.js';
import { getMiningProcessorTier, getMiningPlayerState } from './mining.js';
import { getMiningResource } from './mining-catalog.js';
import { getPlayerShopState } from './player.js';
import { createBotServiceClient } from './supabase.js';
import {
  getWoodcuttingAxe,
  getWoodcuttingItemName,
  getWoodcuttingSapling,
  getWoodcuttingUpgrade,
  resolveWoodcuttingClaim,
  WOODCUTTING_SAPLINGS,
  WOODCUTTING_WORKER_COSTS,
  type WoodcuttingClaimResult,
  type WoodcuttingRecipeItem,
  type WoodcuttingTier,
} from './woodcutting-catalog.js';

type WoodcuttingInventoryRow = { item_id: string; quantity: number };
type WoodcuttingPlayerRow = { last_claimed_at: string };
type WoodcuttingAxeRow = { axe_tier: WoodcuttingTier; id: number };
type WoodcuttingWorkerRow = { axe_id: number | null; chop_remainder_ms: number; sapling_tier: WoodcuttingTier | null; worker_number: number };
type WoodcuttingUpgradeRow = { upgrade_id: string };

export type WoodcuttingAxeState = { id: number; tier: WoodcuttingTier };
export type WoodcuttingWorkerState = {
  axeId: number | null;
  axeTier: WoodcuttingTier | null;
  chopRemainderMs: number;
  saplingTier: WoodcuttingTier | null;
  workerNumber: number;
};

export type WoodcuttingPlayerState = {
  axes: WoodcuttingAxeState[];
  balance: number;
  inventory: WoodcuttingInventoryRow[];
  lastClaimedAt: string;
  miningInventory: Array<{ resource_id: string; quantity: number }>;
  miningOwnedUpgradeIds: string[];
  ownedUpgradeIds: string[];
  processorTier: number;
  workers: WoodcuttingWorkerState[];
};

type WoodcuttingClaimState = Pick<WoodcuttingPlayerState, 'axes' | 'inventory' | 'lastClaimedAt' | 'ownedUpgradeIds' | 'workers'>;

export type WoodcuttingCatalogueProgress = { discoveredItemIds: ReadonlySet<string> };
export type WoodcuttingSettlement = { result: WoodcuttingClaimResult; state: WoodcuttingClaimState };
export type WoodcuttingAssignmentIssue = { availableAxes: WoodcuttingAxeState[]; command?: string; message: string };

export class WoodcuttingAssignmentIssueError extends Error {
  constructor(readonly issue: WoodcuttingAssignmentIssue) {
    super(issue.message);
    this.name = 'WoodcuttingAssignmentIssueError';
  }
}

function firstRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function groupedRecipe(recipe: readonly WoodcuttingRecipeItem[], source: WoodcuttingRecipeItem['source']) {
  return recipe.filter((item) => item.source === source).map((item) => ({ item_id: item.itemId, quantity: item.quantity }));
}

function inventoryMap(inventory: readonly { item_id: string; quantity: number }[]) {
  return new Map(inventory.map((entry) => [entry.item_id, entry.quantity]));
}

const WOODCUTTING_CLAIM_ATTEMPTS = 2;

async function ensureWoodcuttingPlayer(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('ensure_discord_woodcutting_player', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to initialize Discord Woodcutting: ${error.message}`);
}

async function getWoodcuttingClaimState(config: DiscordBotConfig, discordUserId: string): Promise<WoodcuttingClaimState> {
  await ensureWoodcuttingPlayer(config, discordUserId);
  const supabase = createBotServiceClient(config);
  const [playerResult, inventoryResult, axeResult, workerResult, upgradeResult] = await Promise.all([
    supabase.from('discord_woodcutting_players').select('last_claimed_at').eq('guild_id', config.guildId).eq('discord_user_id', discordUserId).maybeSingle<WoodcuttingPlayerRow>(),
    supabase.from('discord_woodcutting_inventory').select('item_id,quantity').eq('guild_id', config.guildId).eq('discord_user_id', discordUserId).order('item_id', { ascending: true }).returns<WoodcuttingInventoryRow[]>(),
    supabase.from('discord_woodcutting_axes').select('id,axe_tier').eq('guild_id', config.guildId).eq('discord_user_id', discordUserId).order('id', { ascending: true }).returns<WoodcuttingAxeRow[]>(),
    supabase.from('discord_woodcutting_workers').select('worker_number,axe_id,sapling_tier,chop_remainder_ms').eq('guild_id', config.guildId).eq('discord_user_id', discordUserId).order('worker_number', { ascending: true }).returns<WoodcuttingWorkerRow[]>(),
    supabase.from('discord_woodcutting_upgrades').select('upgrade_id').eq('guild_id', config.guildId).eq('discord_user_id', discordUserId).returns<WoodcuttingUpgradeRow[]>(),
  ]);
  if (playerResult.error) throw new Error(`Unable to load Woodcutting progress: ${playerResult.error.message}`);
  if (inventoryResult.error) throw new Error(`Unable to load Woodcutting inventory: ${inventoryResult.error.message}`);
  if (axeResult.error) throw new Error(`Unable to load Woodcutting axes: ${axeResult.error.message}`);
  if (workerResult.error) throw new Error(`Unable to load Woodcutting workers: ${workerResult.error.message}`);
  if (upgradeResult.error) throw new Error(`Unable to load Woodcutting upgrades: ${upgradeResult.error.message}`);
  const axes = (axeResult.data ?? []).map((axe) => ({ id: axe.id, tier: axe.axe_tier }));
  const axeTierById = new Map(axes.map((axe) => [axe.id, axe.tier]));
  return {
    axes,
    inventory: inventoryResult.data ?? [],
    lastClaimedAt: playerResult.data?.last_claimed_at ?? new Date().toISOString(),
    ownedUpgradeIds: (upgradeResult.data ?? []).map((upgrade) => upgrade.upgrade_id),
    workers: (workerResult.data ?? []).map((worker) => ({
      axeId: worker.axe_id,
      axeTier: worker.axe_id ? axeTierById.get(worker.axe_id) ?? null : null,
      chopRemainderMs: worker.chop_remainder_ms,
      saplingTier: worker.sapling_tier,
      workerNumber: worker.worker_number,
    })),
  };
}

export async function getWoodcuttingPlayerState(config: DiscordBotConfig, discordUserId: string): Promise<WoodcuttingPlayerState> {
  const [woodcutting, miningState, playerShop] = await Promise.all([
    getWoodcuttingClaimState(config, discordUserId),
    getMiningPlayerState(config, discordUserId),
    getPlayerShopState(config, discordUserId),
  ]);
  return {
    ...woodcutting,
    balance: playerShop.balance,
    miningInventory: miningState.inventory,
    miningOwnedUpgradeIds: miningState.ownedUpgradeIds,
    processorTier: getMiningProcessorTier(miningState),
  };
}

export async function getWoodcuttingCatalogueProgress(config: DiscordBotConfig, discordUserId: string): Promise<WoodcuttingCatalogueProgress> {
  await ensureWoodcuttingPlayer(config, discordUserId);
  const { data, error } = await createBotServiceClient(config)
    .from('discord_woodcutting_catalogue_discoveries')
    .select('item_id')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .returns<Array<{ item_id: string }>>();
  if (error) throw new Error(`Unable to load the Woodcutting catalogue: ${error.message}`);
  return { discoveredItemIds: new Set((data ?? []).map((entry) => entry.item_id)) };
}

function resolveClaim(state: WoodcuttingClaimState) {
  const lastClaimedAtMs = Date.parse(state.lastClaimedAt);
  const elapsedMs = Number.isFinite(lastClaimedAtMs) ? Math.max(0, Date.now() - lastClaimedAtMs) : 0;
  const saplingsByTier = new Map<WoodcuttingTier, number>(WOODCUTTING_SAPLINGS.map((sapling) => [
    sapling.tier,
    state.inventory.find((item) => item.item_id === sapling.id)?.quantity ?? 0,
  ]));
  return resolveWoodcuttingClaim(
    state.workers.map((worker) => ({
      axeTier: worker.axeTier,
      chopRemainderMs: worker.chopRemainderMs,
      saplingTier: worker.saplingTier,
      workerNumber: worker.workerNumber,
    })),
    state.ownedUpgradeIds,
    saplingsByTier,
    elapsedMs,
    randomInt(1, 2_147_483_648),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
}

function isWoodcuttingClaimConflict(error: unknown) {
  return errorMessage(error).includes('Woodcutting progress changed before this claim could be saved');
}

/** Calculates all elapsed work only when the player claims or changes production. */
export async function claimWoodcuttingRewards(config: DiscordBotConfig, discordUserId: string): Promise<WoodcuttingSettlement> {
  for (let attempt = 0; attempt < WOODCUTTING_CLAIM_ATTEMPTS; attempt += 1) {
    const state = await getWoodcuttingClaimState(config, discordUserId);
    const result = resolveClaim(state);
    const { error } = await createBotServiceClient(config).rpc('claim_discord_woodcutting_rewards', {
      p_discord_user_id: discordUserId,
      p_expected_last_claimed_at: state.lastClaimedAt,
      p_guild_id: config.guildId,
      p_item_rewards: result.itemRewards.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity })),
      p_sapling_consumption: result.saplingsConsumed.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity })),
      p_worker_remainders: result.workerRemainders.map((entry) => ({ chop_remainder_ms: entry.chopRemainderMs, worker_number: entry.workerNumber })),
    });
    if (!error) return { result, state };
    if (attempt + 1 < WOODCUTTING_CLAIM_ATTEMPTS && isWoodcuttingClaimConflict(error)) continue;
    throw new Error(`Unable to claim Woodcutting rewards: ${error.message}`);
  }
  throw new Error('Unable to claim Woodcutting rewards. Please try again.');
}

/** Settles work before production-affecting changes so nothing is retroactive. */
async function settleBeforeMutation(config: DiscordBotConfig, discordUserId: string) {
  const settlement = await claimWoodcuttingRewards(config, discordUserId);
  return { settlement, state: await getWoodcuttingPlayerState(config, discordUserId) };
}

function assertRecipeAffordable(state: WoodcuttingPlayerState, recipe: readonly WoodcuttingRecipeItem[]) {
  const mining = new Map(state.miningInventory.map((entry) => [entry.resource_id, entry.quantity]));
  const woodcutting = inventoryMap(state.inventory);
  for (const cost of recipe) {
    if (((cost.source === 'mining' ? mining : woodcutting).get(cost.itemId) ?? 0) < cost.quantity) {
      throw new Error(`You do not have enough ${cost.source === 'mining' ? 'mining' : 'Woodcutting'} materials.`);
    }
    const miningResource = cost.source === 'mining' ? getMiningResource(cost.itemId) : undefined;
    if (miningResource?.kind === 'ore' && (miningResource.processorTier ?? 0) > state.processorTier) {
      throw new Error(`${miningResource.name} needs the matching Resource Processor before it can be crafted with.`);
    }
  }
}

export async function hireWoodcuttingWorker(config: DiscordBotConfig, discordUserId: string) {
  // Hiring needs only the worker roster. Keeping it independent of unrelated
  // Mining/Fishing reads means an available lumberjack cannot be blocked by a
  // separate companion surface while its Woodcutting claim is valid.
  const settlement = await claimWoodcuttingRewards(config, discordUserId);
  const state = await getWoodcuttingClaimState(config, discordUserId);
  const cost = WOODCUTTING_WORKER_COSTS[state.workers.length];
  if (!cost) throw new Error('You already have the maximum of 10 lumberjacks.');
  const { data, error } = await createBotServiceClient(config).rpc('hire_discord_woodcutting_worker', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_knowbucks_cost: cost,
  });
  if (error) throw new Error(`Unable to hire a lumberjack: ${error.message}`);
  const hired = firstRow(data as { starter_axe_id: number | null; worker_number: number } | Array<{ starter_axe_id: number | null; worker_number: number }> | null);
  if (!hired) throw new Error('The lumberjack hire did not return a result.');
  return { ...hired, cost, settlement };
}

export async function purchaseWoodcuttingSaplings(config: DiscordBotConfig, discordUserId: string, tier: WoodcuttingTier, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new Error('Choose between 1 and 1,000,000 saplings.');
  const sapling = getWoodcuttingSapling(tier);
  if (!sapling) throw new Error('That sapling tier is invalid.');
  const { settlement, state } = await settleBeforeMutation(config, discordUserId);
  if (!state.axes.some((axe) => axe.tier >= tier)) throw new Error(`${sapling.name} requires a ${getWoodcuttingAxe(tier)?.name ?? 'matching axe'} first.`);
  if (sapling.processorUpgradeId && !state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)) {
    throw new Error(`${sapling.name} requires the ${sapling.processorUpgradeId.replace('processor-depth-', 'Resource ')} Processor.`);
  }
  const cost = sapling.saplingCost * quantity;
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_woodcutting_saplings', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_knowbucks_cost: cost,
    p_quantity: quantity,
    p_sapling_item_id: sapling.id,
  });
  if (error) throw new Error(`Unable to buy Woodcutting saplings: ${error.message}`);
  return { balance: Number(data), cost, sapling, settlement };
}

export async function craftWoodcuttingAxe(config: DiscordBotConfig, discordUserId: string, tier: WoodcuttingTier) {
  const axe = getWoodcuttingAxe(tier);
  if (!axe) throw new Error('That axe tier is invalid.');
  const { settlement, state } = await settleBeforeMutation(config, discordUserId);
  assertRecipeAffordable(state, axe.recipe);
  const { data, error } = await createBotServiceClient(config).rpc('craft_discord_woodcutting_axe', {
    p_axe_tier: tier,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_mining_cost: groupedRecipe(axe.recipe, 'mining'),
    p_woodcutting_cost: groupedRecipe(axe.recipe, 'woodcutting'),
  });
  if (error) throw new Error(`Unable to craft a Woodcutting axe: ${error.message}`);
  return { axe, axeId: Number(data), settlement };
}

export async function craftWoodcuttingUpgrade(config: DiscordBotConfig, discordUserId: string, upgradeId: string) {
  const upgrade = getWoodcuttingUpgrade(upgradeId);
  if (!upgrade) throw new Error('That Woodcutting upgrade is unavailable.');
  const { settlement, state } = await settleBeforeMutation(config, discordUserId);
  if (state.ownedUpgradeIds.includes(upgrade.id)) throw new Error('You already own that Woodcutting upgrade.');
  if (upgrade.previousUpgradeId && !state.ownedUpgradeIds.includes(upgrade.previousUpgradeId)) {
    throw new Error(`${upgrade.name} requires ${getWoodcuttingUpgrade(upgrade.previousUpgradeId)?.name ?? 'the preceding sharpening tier'} first.`);
  }
  assertRecipeAffordable(state, upgrade.recipe);
  const { error } = await createBotServiceClient(config).rpc('craft_discord_woodcutting_upgrade', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_mining_cost: groupedRecipe(upgrade.recipe, 'mining'),
    p_upgrade_id: upgrade.id,
    p_woodcutting_cost: groupedRecipe(upgrade.recipe, 'woodcutting'),
  });
  if (error) throw new Error(`Unable to craft a Woodcutting upgrade: ${error.message}`);
  return { settlement, upgrade };
}

export function getAvailableWoodcuttingAxes(state: WoodcuttingPlayerState, workerNumber: number) {
  const occupiedByOtherWorker = new Set(state.workers.filter((worker) => worker.workerNumber !== workerNumber && worker.axeId !== null).map((worker) => worker.axeId));
  return state.axes.filter((axe) => !occupiedByOtherWorker.has(axe.id));
}

export function getWoodcuttingAssignmentIssue(state: WoodcuttingPlayerState, workerNumber: number, axeTier: WoodcuttingTier, saplingTier: WoodcuttingTier): WoodcuttingAssignmentIssue | null {
  if (!state.workers.some((worker) => worker.workerNumber === workerNumber)) return { availableAxes: getAvailableWoodcuttingAxes(state, workerNumber), message: `Lumberjack ${workerNumber} has not been hired yet.` };
  if (saplingTier > axeTier) return { availableAxes: getAvailableWoodcuttingAxes(state, workerNumber), message: 'A lumberjack cannot chop a sapling above their axe tier.' };
  const sapling = getWoodcuttingSapling(saplingTier);
  if (sapling?.processorUpgradeId && !state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId)) return { availableAxes: getAvailableWoodcuttingAxes(state, workerNumber), message: `${sapling.name} requires the matching Resource Processor.` };
  const matchingAxes = getAvailableWoodcuttingAxes(state, workerNumber).filter((axe) => axe.tier === axeTier);
  if (!matchingAxes.length) return { availableAxes: getAvailableWoodcuttingAxes(state, workerNumber), message: `You do not have an available ${getWoodcuttingAxe(axeTier)?.name ?? `Tier ${axeTier} axe`}.` };
  if (!sapling || (state.inventory.find((item) => item.item_id === sapling.id)?.quantity ?? 0) < 1) {
    return {
      availableAxes: getAvailableWoodcuttingAxes(state, workerNumber),
      command: `/woodcutting buy-saplings type:${sapling?.name ?? `Tier ${saplingTier}`} quantity:1`,
      message: `You do not have any ${sapling?.name ?? 'selected saplings'} in stock.`,
    };
  }
  return null;
}

export async function assignWoodcuttingWorker(config: DiscordBotConfig, discordUserId: string, workerNumber: number, axeTier: WoodcuttingTier, saplingTier: WoodcuttingTier) {
  const { settlement, state } = await settleBeforeMutation(config, discordUserId);
  const issue = getWoodcuttingAssignmentIssue(state, workerNumber, axeTier, saplingTier);
  if (issue) throw new WoodcuttingAssignmentIssueError(issue);
  const axe = getAvailableWoodcuttingAxes(state, workerNumber).find((entry) => entry.tier === axeTier)!;
  const { error } = await createBotServiceClient(config).rpc('assign_discord_woodcutting_worker', {
    p_axe_id: axe.id,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_sapling_tier: saplingTier,
    p_worker_number: workerNumber,
  });
  if (error) throw new Error(`Unable to assign the lumberjack: ${error.message}`);
  return { axe, settlement };
}

export async function assignWoodcuttingWorkersAutomatically(config: DiscordBotConfig, discordUserId: string) {
  const { settlement, state } = await settleBeforeMutation(config, discordUserId);
  const stockedSaplings = WOODCUTTING_SAPLINGS.filter((sapling) => (
    (state.inventory.find((item) => item.item_id === sapling.id)?.quantity ?? 0) > 0
    && (!sapling.processorUpgradeId || state.miningOwnedUpgradeIds.includes(sapling.processorUpgradeId))
  ));
  const assignments = state.workers.map((worker, index) => {
    const axe = [...state.axes].sort((left, right) => right.tier - left.tier || right.id - left.id)[index];
    if (!axe) return null;
    const sapling = stockedSaplings.filter((entry) => entry.tier <= axe.tier).sort((left, right) => right.tier - left.tier)[0];
    return sapling ? { axe_id: axe.id, sapling_tier: sapling.tier, worker_number: worker.workerNumber } : null;
  }).filter((assignment): assignment is { axe_id: number; sapling_tier: WoodcuttingTier; worker_number: number } => Boolean(assignment));
  const { error } = await createBotServiceClient(config).rpc('assign_discord_woodcutting_workers_automatically', {
    p_assignments: assignments,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to auto-assign lumberjacks: ${error.message}`);
  return { assignments, settlement };
}

export function formatWoodcuttingRecipe(recipe: readonly WoodcuttingRecipeItem[]) {
  return recipe.map((item) => `${item.quantity.toLocaleString()} ${item.source === 'mining' ? getMiningResource(item.itemId)?.name ?? item.itemId : getWoodcuttingItemName(item.itemId)}`).join(', ');
}

export function formatWoodcuttingClaim(result: WoodcuttingClaimResult) {
  const rewards = result.itemRewards.map((entry) => `**${getWoodcuttingItemName(entry.itemId)}** ×${entry.quantity.toLocaleString()}`);
  return rewards.length ? rewards.join('\n') : 'No resources this time. Stock saplings and assign equipped lumberjacks to begin chopping.';
}
