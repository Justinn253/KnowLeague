import { randomInt } from 'node:crypto';
import { ApiError } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import {
  MINING_DEPTHS,
  MINING_UPGRADES,
  findMiningResource,
  getMiningBestUpgrade,
  getMiningCraftingRecipe,
  getMiningDepth,
  getMiningResource,
  getMiningTravelDurationMs,
  getMiningUpgrade,
  resolveMiningExpedition,
  type MiningDepthId,
  type MiningEquipmentSnapshot,
  type MiningResource,
  type MiningResult,
  type MiningUpgrade,
} from '../discord-bot/src/mining-catalog';

type MiningInventoryRow = { resource_id: string; quantity: number };
type MiningUpgradeRow = { upgrade_id: string };
type PlayerInventoryRow = { item_id: string };
type MiningSkillRow = { level: number; total_xp: number };
type KnowBucksRow = { balance: number };

type MiningExpeditionStatus = 'descending' | 'returning' | 'completed';
type MiningExpeditionRow = {
  depth: MiningDepthId;
  equipment_snapshot: MiningEquipmentSnapshot;
  id: number;
  mining_started_at: string;
  outcome_seed: number;
  result: MiningResult | null;
  return_started_at: string | null;
  returns_at: string | null;
  status: MiningExpeditionStatus;
};

type MiningReturnRow = {
  depth: MiningDepthId;
  equipment_snapshot: MiningEquipmentSnapshot;
  expedition_id: number;
  mining_started_at: string;
  outcome_seed: number;
  return_started_at: string;
};

type MiningSettlementRow = {
  mining_current_level: number | null;
  mining_previous_level: number | null;
  mining_total_xp: number | null;
  mining_xp_awarded: number;
  result: MiningResult | null;
  settled: boolean;
};

type StartedMiningRow = { expedition_id: number; mining_started_at: string };

export type MiningSharedSkills = {
  cheapskate: number;
  haste: number;
  lucky: number;
  moneyMouser: number;
};

export type MiningDashboard = {
  activeExpedition: null | {
    cargo: MiningResult;
    depth: MiningDepthId;
    miningStartedAt: string;
    phase: 'descending' | 'mining' | 'returning';
    returnsAt: string | null;
    travelDurationMs: number;
  };
  balance: number;
  depths: Array<{ id: MiningDepthId; name: string; requiredToolName: string | null; unlocked: boolean }>;
  equipment: {
    elevatorName: string | null;
    filterName: string | null;
    processorTier: number;
    storageCapacity: number;
    storageName: string | null;
    toolName: string | null;
    toolStonesPerSecond: number;
  };
  inventory: Array<{ resource: MiningResource; quantity: number }>;
  mining: { level: number; totalXp: number };
  settlement: null | { currentLevel: number; expeditionId: number; previousLevel: number; result: MiningResult; xpAwarded: number };
  shop: Array<MiningUpgrade & { canCraft: boolean; owned: boolean; recipe: ReturnType<typeof getMiningCraftingRecipe>; unlocked: boolean }>;
  skills: MiningSharedSkills;
};

type MiningIdentity = { discordUserId: string; guildId: string };
type MiningState = {
  balance: number;
  inventory: MiningInventoryRow[];
  miningLevel: number;
  miningTotalXp: number;
  ownedUpgradeIds: string[];
  passiveGearItemIds: string[];
  skills: MiningSharedSkills;
};

function firstRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getDiscordGuildId() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(guildId)) {
    throw new ApiError(503, 'Discord server configuration is unavailable.');
  }
  return guildId;
}

async function getMiningIdentity(userId: string): Promise<MiningIdentity> {
  const { data, error } = await getSupabaseServiceClient()
    .from('profile_private_details')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle<{ discord_user_id: string | null }>();
  if (error) throw error;
  const discordUserId = data?.discord_user_id?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(discordUserId)) {
    throw new ApiError(409, 'Link your Discord account in Profile before managing Mining on the website.');
  }
  return { discordUserId, guildId: getDiscordGuildId() };
}

function getSkillLevels(itemIds: readonly string[]): MiningSharedSkills {
  const owned = new Set(itemIds);
  const count = (ids: readonly string[]) => ids.filter((id) => owned.has(id)).length;
  return {
    cheapskate: count(['cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4']),
    haste: count(['haste-1', 'haste-2', 'haste-3', 'haste-4']),
    lucky: count(['lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5']),
    moneyMouser: count(['money-mouser-1', 'money-mouser-2']),
  };
}

async function ensureMiningPlayer(identity: MiningIdentity) {
  const { error } = await getSupabaseServiceClient().rpc('ensure_discord_mining_player', {
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
}

async function getMiningState(identity: MiningIdentity): Promise<MiningState> {
  await ensureMiningPlayer(identity);
  const supabase = getSupabaseServiceClient();
  const [inventory, upgrades, mining, playerInventory, fishingInventory, balance] = await Promise.all([
    supabase.from('discord_game_resource_inventory').select('resource_id,quantity')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('resource_id').returns<MiningInventoryRow[]>(),
    supabase.from('discord_mining_player_upgrades').select('upgrade_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<MiningUpgradeRow[]>(),
    supabase.from('discord_game_skill_progress').select('level,total_xp')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).eq('skill_id', 'mining').maybeSingle<MiningSkillRow>(),
    supabase.from('discord_player_inventory').select('item_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<PlayerInventoryRow[]>(),
    supabase.from('discord_fishing_inventory').select('item_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).like('item_id', 'gear-%').returns<PlayerInventoryRow[]>(),
    supabase.from('discord_knowbucks_balances').select('balance')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).maybeSingle<KnowBucksRow>(),
  ]);
  if (inventory.error || upgrades.error || mining.error || playerInventory.error || fishingInventory.error || balance.error) {
    throw inventory.error ?? upgrades.error ?? mining.error ?? playerInventory.error ?? fishingInventory.error ?? balance.error;
  }
  return {
    balance: balance.data?.balance ?? 0,
    inventory: inventory.data ?? [],
    miningLevel: mining.data?.level ?? 0,
    miningTotalXp: mining.data?.total_xp ?? 0,
    ownedUpgradeIds: (upgrades.data ?? []).map((row) => row.upgrade_id),
    passiveGearItemIds: [...(playerInventory.data ?? []).map((row) => row.item_id).filter((id) => id.startsWith('mining-gear-')), ...(fishingInventory.data ?? []).map((row) => row.item_id)],
    skills: getSkillLevels((playerInventory.data ?? []).map((row) => row.item_id)),
  };
}

async function getActiveExpedition(identity: MiningIdentity) {
  const { data, error } = await getSupabaseServiceClient().from('discord_mining_expeditions')
    .select('id,depth,equipment_snapshot,mining_started_at,outcome_seed,result,return_started_at,returns_at,status')
    .eq('guild_id', identity.guildId)
    .eq('discord_user_id', identity.discordUserId)
    .in('status', ['descending', 'returning'])
    .maybeSingle<MiningExpeditionRow>();
  if (error) throw error;
  return data;
}

function getProcessorTier(state: MiningState) {
  return getMiningBestUpgrade(state.ownedUpgradeIds, 'processor')?.value ?? 0;
}

function equipmentFromState(depthId: MiningDepthId, state: MiningState): MiningEquipmentSnapshot {
  const tool = getMiningBestUpgrade(state.ownedUpgradeIds, 'tool');
  const storage = getMiningBestUpgrade(state.ownedUpgradeIds, 'storage');
  const elevator = getMiningBestUpgrade(state.ownedUpgradeIds, 'elevator');
  const filter = getMiningBestUpgrade(state.ownedUpgradeIds, 'filter');
  if (!tool || !storage) throw new ApiError(409, 'Mining starter equipment is unavailable.');
  const travelDurationMs = getMiningTravelDurationMs(
    getMiningDepth(depthId)?.descendAndAscendMs ?? 0,
    elevator?.value ?? 0,
    state.skills.haste,
  );
  return {
    catalogVersion: 2,
    descendDurationMs: travelDurationMs,
    elevatorTier: elevator?.value ?? 0,
    filterTier: filter?.value ?? 0,
    hasteLevel: state.skills.haste,
    luckLevel: Math.min(4, state.skills.lucky),
    passiveGearItemIds: state.passiveGearItemIds,
    storageCapacity: storage.value,
    toolId: tool.id,
    toolStonesPerSecond: tool.value,
  };
}

function resultAtReturn(expedition: Pick<MiningExpeditionRow, 'depth' | 'equipment_snapshot' | 'mining_started_at' | 'outcome_seed'>, returnStartedAt: string) {
  return resolveMiningExpedition(
    expedition.depth,
    expedition.equipment_snapshot,
    expedition.outcome_seed,
    Math.max(0, new Date(returnStartedAt).getTime() - new Date(expedition.mining_started_at).getTime()),
  );
}

async function settleDueMiningReturn(identity: MiningIdentity) {
  const active = await getActiveExpedition(identity);
  if (!active || active.status !== 'returning' || !active.returns_at || new Date(active.returns_at).getTime() > Date.now()) return null;
  const result = active.result ?? resultAtReturn(active, active.return_started_at ?? active.mining_started_at);
  if (!active.result) {
    const { error } = await getSupabaseServiceClient().rpc('record_discord_mining_return_result', {
      p_discord_user_id: identity.discordUserId,
      p_expedition_id: active.id,
      p_guild_id: identity.guildId,
      p_result: result,
    });
    if (error) throw error;
  }
  const { data, error } = await getSupabaseServiceClient().rpc('settle_discord_mining_expedition', {
    p_discord_user_id: identity.discordUserId,
    p_expedition_id: active.id,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
  const settled = firstRow(data as MiningSettlementRow | MiningSettlementRow[] | null);
  if (!settled?.settled || !settled.result || settled.mining_current_level === null || settled.mining_previous_level === null) return null;
  return {
    currentLevel: settled.mining_current_level,
    expeditionId: active.id,
    previousLevel: settled.mining_previous_level,
    result: settled.result,
    xpAwarded: settled.mining_xp_awarded,
  };
}

function projectActiveExpedition(expedition: MiningExpeditionRow): MiningDashboard['activeExpedition'] {
  const now = Date.now();
  const startsAt = new Date(expedition.mining_started_at).getTime();
  const phase = expedition.status === 'returning'
    ? 'returning'
    : startsAt > now ? 'descending' : 'mining';
  const cargo = expedition.status === 'returning'
    ? expedition.result ?? resultAtReturn(expedition, expedition.return_started_at ?? expedition.mining_started_at)
    : resolveMiningExpedition(expedition.depth, expedition.equipment_snapshot, expedition.outcome_seed, Math.max(0, now - startsAt));
  return {
    cargo,
    depth: expedition.depth,
    miningStartedAt: expedition.mining_started_at,
    phase,
    returnsAt: expedition.returns_at,
    travelDurationMs: expedition.equipment_snapshot.descendDurationMs,
  };
}

function canCraftUpgrade(state: MiningState, recipe: ReturnType<typeof getMiningCraftingRecipe>) {
  const inventory = new Map(state.inventory.map((item) => [item.resource_id, item.quantity]));
  const processorTier = getProcessorTier(state);
  return recipe.every((item) => {
    const resource = getMiningResource(item.resourceId);
    return (inventory.get(item.resourceId) ?? 0) >= item.quantity
      && (!resource || resource.kind !== 'ore' || (resource.processorTier ?? 0) <= processorTier);
  });
}

async function buildDashboard(identity: MiningIdentity, settlement: MiningDashboard['settlement']): Promise<MiningDashboard> {
  const [state, active] = await Promise.all([getMiningState(identity), getActiveExpedition(identity)]);
  const processorTier = getProcessorTier(state);
  const inventory = state.inventory.flatMap((entry) => {
    const resource = getMiningResource(entry.resource_id);
    return resource ? [{ resource, quantity: entry.quantity }] : [];
  });
  const tool = getMiningBestUpgrade(state.ownedUpgradeIds, 'tool');
  const storage = getMiningBestUpgrade(state.ownedUpgradeIds, 'storage');
  const elevator = getMiningBestUpgrade(state.ownedUpgradeIds, 'elevator');
  const filter = getMiningBestUpgrade(state.ownedUpgradeIds, 'filter');
  const shop = MINING_UPGRADES.map((upgrade) => {
    const recipe = getMiningCraftingRecipe(upgrade, state.skills.cheapskate);
    const owned = state.ownedUpgradeIds.includes(upgrade.id);
    const unlocked = !upgrade.previousUpgradeId || state.ownedUpgradeIds.includes(upgrade.previousUpgradeId);
    return { ...upgrade, canCraft: !owned && unlocked && canCraftUpgrade(state, recipe), owned, recipe, unlocked };
  });
  return {
    activeExpedition: active ? projectActiveExpedition(active) : null,
    balance: state.balance,
    depths: MINING_DEPTHS.map((depth) => ({
      id: depth.id,
      name: depth.name,
      requiredToolName: depth.requiredToolId ? getMiningUpgrade(depth.requiredToolId)?.name ?? null : null,
      unlocked: !depth.requiredToolId || state.ownedUpgradeIds.includes(depth.requiredToolId),
    })),
    equipment: {
      elevatorName: elevator?.name ?? null,
      filterName: filter?.name ?? null,
      processorTier,
      storageCapacity: storage?.value ?? 0,
      storageName: storage?.name ?? null,
      toolName: tool?.name ?? null,
      toolStonesPerSecond: tool?.value ?? 0,
    },
    inventory,
    mining: { level: state.miningLevel, totalXp: state.miningTotalXp },
    settlement,
    shop,
    skills: state.skills,
  };
}

export async function getMiningDashboard(userId: string) {
  const identity = await getMiningIdentity(userId);
  const settlement = await settleDueMiningReturn(identity);
  return buildDashboard(identity, settlement);
}

export async function startMiningWebsiteExpedition(userId: string, depthId: number) {
  const identity = await getMiningIdentity(userId);
  await settleDueMiningReturn(identity);
  const depth = getMiningDepth(depthId);
  if (!depth) throw new ApiError(400, 'Choose a valid Mining depth.');
  const state = await getMiningState(identity);
  if (depth.requiredToolId && !state.ownedUpgradeIds.includes(depth.requiredToolId)) {
    throw new ApiError(409, `${depth.name} requires the ${getMiningUpgrade(depth.requiredToolId)?.name ?? 'required tool'}.`);
  }
  const equipment = equipmentFromState(depth.id, state);
  const { data, error } = await getSupabaseServiceClient().rpc('start_discord_mining_expedition', {
    p_depth: depth.id,
    p_descend_duration_ms: equipment.descendDurationMs,
    p_discord_user_id: identity.discordUserId,
    p_equipment_snapshot: equipment,
    p_guild_id: identity.guildId,
    p_outcome_seed: randomInt(1, 2_147_483_648),
  });
  if (error) throw error;
  if (!firstRow(data as StartedMiningRow | StartedMiningRow[] | null)) throw new Error('Mining expedition did not return a result.');
  return buildDashboard(identity, null);
}

export async function returnMiningWebsiteExpedition(userId: string) {
  const identity = await getMiningIdentity(userId);
  await settleDueMiningReturn(identity);
  const active = await getActiveExpedition(identity);
  if (!active) throw new ApiError(409, 'You do not have an active mining expedition to recall.');
  if (active.status === 'returning') throw new ApiError(409, 'Your minecart is already returning to the surface.');
  const { data, error } = await getSupabaseServiceClient().rpc('begin_discord_mining_return', {
    p_ascent_duration_ms: active.equipment_snapshot.descendDurationMs,
    p_discord_user_id: identity.discordUserId,
    p_expedition_id: active.id,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
  const returning = firstRow(data as MiningReturnRow | MiningReturnRow[] | null);
  if (!returning) throw new Error('Mining expedition could not begin its return.');
  const result = resultAtReturn(returning, returning.return_started_at);
  const { error: recordError } = await getSupabaseServiceClient().rpc('record_discord_mining_return_result', {
    p_discord_user_id: identity.discordUserId,
    p_expedition_id: returning.expedition_id,
    p_guild_id: identity.guildId,
    p_result: result,
  });
  if (recordError) throw recordError;
  return buildDashboard(identity, null);
}

export async function shareMiningWebsiteResult(userId: string, expeditionId: number) {
  const identity = await getMiningIdentity(userId);
  if (!Number.isSafeInteger(expeditionId) || expeditionId < 1) {
    throw new ApiError(400, 'Choose a completed Mining expedition to share.');
  }
  await settleDueMiningReturn(identity);
  const { error } = await getSupabaseServiceClient().rpc('share_discord_mining_website_result', {
    p_discord_user_id: identity.discordUserId,
    p_expedition_id: expeditionId,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
  return buildDashboard(identity, null);
}

export async function purchaseMiningWebsiteUpgrade(userId: string, upgradeId: string) {
  const identity = await getMiningIdentity(userId);
  await settleDueMiningReturn(identity);
  const upgrade = getMiningUpgrade(upgradeId);
  if (!upgrade || upgrade.id === 'wooden-pickaxe' || upgrade.id === 'shabby-bin') {
    throw new ApiError(400, 'Choose a valid Mining upgrade.');
  }
  const state = await getMiningState(identity);
  if (state.ownedUpgradeIds.includes(upgrade.id)) throw new ApiError(409, 'You already own that Mining upgrade.');
  if (upgrade.previousUpgradeId && !state.ownedUpgradeIds.includes(upgrade.previousUpgradeId)) {
    throw new ApiError(409, `This upgrade requires ${getMiningUpgrade(upgrade.previousUpgradeId)?.name ?? 'the previous upgrade'} first.`);
  }
  const recipe = getMiningCraftingRecipe(upgrade, state.skills.cheapskate);
  if (!canCraftUpgrade(state, recipe)) throw new ApiError(409, 'You do not have the required processed Mining materials.');
  const { error } = await getSupabaseServiceClient().rpc('purchase_discord_mining_upgrade', {
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
    p_knowbucks_cost: 0,
    p_processor_tier: upgrade.category === 'processor' ? upgrade.value : 0,
    p_resource_cost: recipe.map((item) => ({ resource_id: item.resourceId, quantity: item.quantity })),
    p_upgrade_id: upgrade.id,
  });
  if (error) throw error;
  return buildDashboard(identity, null);
}

export async function sellMiningWebsiteResource(userId: string, resourceNameOrId: string, amountInput: string) {
  const identity = await getMiningIdentity(userId);
  await settleDueMiningReturn(identity);
  const resource = findMiningResource(resourceNameOrId);
  if (!resource || (resource.kind !== 'ore' && resource.kind !== 'gem') || !resource.saleValue) {
    throw new ApiError(400, 'Choose a valid ore or gem to sell.');
  }
  const state = await getMiningState(identity);
  if (resource.kind === 'ore' && (resource.processorTier ?? 0) > getProcessorTier(state)) {
    throw new ApiError(409, `${resource.name} requires a Depth ${resource.processorTier} Processor before it can be sold.`);
  }
  const heldAmount = state.inventory.find((item) => item.resource_id === resource.id)?.quantity ?? 0;
  const normalizedAmount = amountInput.trim().toLowerCase();
  const amount = normalizedAmount === 'all'
    ? heldAmount
    : /^[1-9][0-9]*$/.test(normalizedAmount) ? Number(normalizedAmount) : Number.NaN;
  if (!Number.isSafeInteger(amount) || amount < 1) throw new ApiError(400, 'Amount must be a positive whole number or all.');
  if (amount > heldAmount) throw new ApiError(409, `You only have ${heldAmount.toLocaleString()} ${resource.name}.`);
  const { error } = await getSupabaseServiceClient().rpc('sell_discord_mining_resource', {
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
    p_quantity: amount,
    p_resource_id: resource.id,
  });
  if (error) throw error;
  return buildDashboard(identity, null);
}

