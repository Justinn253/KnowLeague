import { randomInt } from 'node:crypto';
import type { DiscordBotConfig } from './config.js';
import type { GuildMember } from 'discord.js';
import {
  getMiningBestUpgrade,
  getMiningCraftingRecipe,
  getMiningDepth,
  getMiningGear,
  findMiningResource,
  getMiningResource,
  getMiningTravelDurationMs,
  getMiningUpgrade,
  getMiningXpForLevel,
  getMiningXpToNextLevel,
  resolveMiningExpedition,
  type MiningDepthId,
  type MiningEquipmentSnapshot,
  type MiningResourceKind,
  type MiningResult,
} from './mining-catalog.js';
import { getPlayerShopState, type PlayerSkillLevels } from './player.js';
import { createBotServiceClient } from './supabase.js';

type MiningInventoryRow = { resource_id: string; quantity: number };
type MiningUpgradeRow = { upgrade_id: string };
type MiningSkillRow = { level: number; total_xp: number };
type MiningCommandSettingsRow = { command_all_channels: boolean };
type MiningCommandChannelRow = { channel_id: string };

const MINING_COMMAND_SETTINGS_CACHE_MS = 30_000;
let cachedMiningCommandSettings: { allowedChannelIds: Set<string> | null; expiresAt: number } | null = null;

export type MiningExpeditionStatus = 'descending' | 'returning' | 'completed';

export type MiningExpeditionRow = {
  depth: MiningDepthId;
  equipment_snapshot: MiningEquipmentSnapshot;
  id: number;
  mining_started_at: string;
  outcome_seed: number;
  result: MiningResult | null;
  return_started_at: string | null;
  returns_at: string | null;
  started_at: string;
  status: MiningExpeditionStatus;
};

type StartedMiningExpeditionRow = { expedition_id: number; mining_started_at: string };
type BegunMiningReturnRow = {
  depth: MiningDepthId;
  equipment_snapshot: MiningEquipmentSnapshot;
  expedition_id: number;
  mining_started_at: string;
  outcome_seed: number;
  return_started_at: string;
  returns_at: string;
};
type SettledMiningExpeditionRow = {
  mining_current_level: number | null;
  mining_previous_level: number | null;
  mining_total_xp: number | null;
  mining_xp_awarded: number;
  result: MiningResult | null;
  settled: boolean;
};
type MiningSaleRow = { current_balance: number; knowbucks_awarded: number; sold_count: number };

export type MiningPlayerState = {
  balance: number;
  inventory: MiningInventoryRow[];
  miningLevel: number;
  miningTotalXp: number;
  miningXpIntoLevel: number;
  miningXpToNextLevel: number;
  ownedUpgradeIds: string[];
  passiveGearItemIds: string[];
  skills: PlayerSkillLevels;
};

export type StartedMiningExpedition = {
  depth: NonNullable<ReturnType<typeof getMiningDepth>>;
  expeditionId: number;
  miningStartsAt: string;
  travelDurationMs: number;
};

export type BegunMiningReturn = {
  depth: MiningDepthId;
  result: MiningResult;
  travelDurationMs: number;
};

export type SettledMiningExpedition = {
  currentLevel: number;
  previousLevel: number;
  result: MiningResult;
  totalXp: number;
  xpAwarded: number;
};

export type MiningSale = {
  balance: number;
  soldCount: number;
  totalSaleValue: number;
};

export type MiningCatalogueProgress = {
  acquiredGearItemIds: ReadonlySet<string>;
  acquiredResourceIds: ReadonlySet<string>;
};

function firstRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

async function ensureMiningPlayer(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('ensure_discord_mining_player', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to initialize Discord mining: ${error.message}`);
}

export async function getMiningPlayerState(config: DiscordBotConfig, discordUserId: string): Promise<MiningPlayerState> {
  await ensureMiningPlayer(config, discordUserId);
  const supabase = createBotServiceClient(config);
  const [inventoryResult, upgradesResult, skillResult, playerShop, fishingGearResult] = await Promise.all([
    supabase
      .from('discord_game_resource_inventory')
      .select('resource_id,quantity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .order('resource_id', { ascending: true })
      .returns<MiningInventoryRow[]>(),
    supabase
      .from('discord_mining_player_upgrades')
      .select('upgrade_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .returns<MiningUpgradeRow[]>(),
    supabase
      .from('discord_game_skill_progress')
      .select('level,total_xp')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('skill_id', 'mining')
      .maybeSingle<MiningSkillRow>(),
    getPlayerShopState(config, discordUserId),
    supabase
      .from('discord_fishing_inventory')
      .select('item_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .like('item_id', 'gear-%')
      .returns<Array<{ item_id: string }>>(),
  ]);
  if (inventoryResult.error) throw new Error(`Unable to load Discord mining inventory: ${inventoryResult.error.message}`);
  if (upgradesResult.error) throw new Error(`Unable to load Discord mining upgrades: ${upgradesResult.error.message}`);
  if (skillResult.error) throw new Error(`Unable to load Discord mining skill: ${skillResult.error.message}`);
  if (fishingGearResult.error) throw new Error(`Unable to load Mining-compatible Fishing Relics: ${fishingGearResult.error.message}`);
  const miningLevel = skillResult.data?.level ?? 0;
  const miningTotalXp = skillResult.data?.total_xp ?? 0;
  return {
    balance: playerShop.balance,
    inventory: inventoryResult.data ?? [],
    miningLevel,
    miningTotalXp,
    miningXpIntoLevel: Math.max(0, miningTotalXp - getMiningXpForLevel(miningLevel)),
    miningXpToNextLevel: getMiningXpToNextLevel(miningLevel),
    ownedUpgradeIds: (upgradesResult.data ?? []).map((row) => row.upgrade_id),
    passiveGearItemIds: [...playerShop.itemIds.filter((itemId) => itemId.startsWith('mining-gear-')), ...(fishingGearResult.data ?? []).map((entry) => entry.item_id)],
    skills: playerShop.skillLevels,
  };
}

/** Loads durable discoveries, which remain visible after resources are spent or sold. */
export async function getMiningCatalogueProgress(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<MiningCatalogueProgress> {
  await ensureMiningPlayer(config, discordUserId);
  const supabase = createBotServiceClient(config);
  const [resourceResult, gearResult] = await Promise.all([
    supabase
      .from('discord_mining_catalogue_discoveries')
      .select('resource_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .returns<Array<{ resource_id: string }>>(),
    supabase
      .from('discord_player_inventory')
      .select('item_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .like('item_id', 'mining-gear-%')
      .returns<Array<{ item_id: string }>>(),
  ]);
  if (resourceResult.error) throw new Error(`Unable to load Discord mining catalogue progress: ${resourceResult.error.message}`);
  if (gearResult.error) throw new Error(`Unable to load Discord mining catalogue gear: ${gearResult.error.message}`);

  return {
    acquiredResourceIds: new Set((resourceResult.data ?? []).map((entry) => entry.resource_id).filter((resourceId) => Boolean(getMiningResource(resourceId)))),
    acquiredGearItemIds: new Set((gearResult.data ?? []).map((entry) => entry.item_id).filter((itemId) => Boolean(getMiningGear(itemId)))),
  };
}

export async function getActiveMiningExpedition(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_mining_expeditions')
    .select('id,depth,equipment_snapshot,mining_started_at,outcome_seed,result,return_started_at,returns_at,started_at,status')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .in('status', ['descending', 'returning'])
    .maybeSingle<MiningExpeditionRow>();
  if (error) throw new Error(`Unable to load the active mining expedition: ${error.message}`);
  return data;
}

/** Returns whether Mining commands and their panel controls may run in a channel. */
export async function isMiningCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const now = Date.now();
  if (!cachedMiningCommandSettings || cachedMiningCommandSettings.expiresAt <= now) {
    const supabase = createBotServiceClient(config);
    const { data: settings, error: settingsError } = await supabase
      .from('discord_mining_command_settings')
      .select('command_all_channels')
      .eq('guild_id', config.guildId)
      .maybeSingle<MiningCommandSettingsRow>();
    if (settingsError) throw new Error(`Unable to load Mining command settings: ${settingsError.message}`);

    if (!settings || settings.command_all_channels) {
      cachedMiningCommandSettings = { allowedChannelIds: null, expiresAt: now + MINING_COMMAND_SETTINGS_CACHE_MS };
    } else {
      const { data: channels, error: channelsError } = await supabase
        .from('discord_mining_command_channels')
        .select('channel_id')
        .eq('guild_id', config.guildId)
        .returns<MiningCommandChannelRow[]>();
      if (channelsError) throw new Error(`Unable to load Mining command channels: ${channelsError.message}`);
      cachedMiningCommandSettings = {
        allowedChannelIds: new Set((channels ?? []).map((channel) => channel.channel_id)),
        expiresAt: now + MINING_COMMAND_SETTINGS_CACHE_MS,
      };
    }
  }

  return cachedMiningCommandSettings.allowedChannelIds === null
    || cachedMiningCommandSettings.allowedChannelIds.has(channelId);
}

/** Returns configured Mining command channels, or an empty array when Mining is open everywhere. */
export async function getMiningCommandChannelIds(config: DiscordBotConfig): Promise<readonly string[]> {
  await isMiningCommandAllowedInChannel(config, '0');
  return cachedMiningCommandSettings?.allowedChannelIds
    ? [...cachedMiningCommandSettings.allowedChannelIds]
    : [];
}

export async function grantEligibleMiningLevelRoles(config: DiscordBotConfig, member: GuildMember, miningLevel: number) {
  const { data, error } = await createBotServiceClient(config).from('discord_mining_level_role_rewards').select('discord_role_id,level').eq('guild_id', config.guildId).returns<Array<{ discord_role_id: string; level: number }>>();
  if (error) throw new Error(`Unable to read Mining level rewards: ${error.message}`);
  const rewards = data ?? [];
  const highestTier = rewards.filter((reward) => reward.level <= miningLevel).reduce((highest, reward) => Math.max(highest, reward.level), 0);
  const targetRoleIds = new Set(rewards.filter((reward) => reward.level === highestTier).map((reward) => reward.discord_role_id));
  const configuredRoleIds = new Set(rewards.map((reward) => reward.discord_role_id));
  const removable = [...configuredRoleIds].filter((roleId) => member.roles.cache.has(roleId) && !targetRoleIds.has(roleId) && member.guild.roles.cache.get(roleId)?.editable);
  const missing = [...targetRoleIds].filter((roleId) => !member.roles.cache.has(roleId) && member.guild.roles.cache.get(roleId)?.editable);
  if (removable.length) await member.roles.remove(removable, 'KnowLeague Mining level reward tier replaced');
  if (missing.length) await member.roles.add(missing, 'KnowLeague Mining level reward');
}

function equipmentFromState(depthId: MiningDepthId, state: MiningPlayerState): MiningEquipmentSnapshot {
  const tool = getMiningBestUpgrade(state.ownedUpgradeIds, 'tool');
  const storage = getMiningBestUpgrade(state.ownedUpgradeIds, 'storage');
  const elevator = getMiningBestUpgrade(state.ownedUpgradeIds, 'elevator');
  const filter = getMiningBestUpgrade(state.ownedUpgradeIds, 'filter');
  if (!tool || !storage) throw new Error('Your mining starter equipment is unavailable. Please try again shortly.');
  const hasteLevel = state.skills.haste;
  const travelDurationMs = getMiningTravelDurationMs(
    getMiningDepth(depthId)?.descendAndAscendMs ?? 0,
    elevator?.value ?? 0,
    hasteLevel,
  );
  return {
    catalogVersion: 2,
    descendDurationMs: travelDurationMs,
    elevatorTier: elevator?.value ?? 0,
    filterTier: filter?.value ?? 0,
    hasteLevel,
    luckLevel: Math.min(4, state.skills.lucky),
    passiveGearItemIds: state.passiveGearItemIds,
    storageCapacity: storage.value,
    toolId: tool.id,
    toolStonesPerSecond: tool.value,
  };
}

export function getMiningProcessorTier(state: MiningPlayerState) {
  return getMiningBestUpgrade(state.ownedUpgradeIds, 'processor')?.value ?? 0;
}

export async function startMiningExpedition(
  config: DiscordBotConfig,
  discordUserId: string,
  depthId: MiningDepthId,
): Promise<StartedMiningExpedition> {
  const depth = getMiningDepth(depthId);
  if (!depth) throw new Error('That mining depth is invalid.');
  const state = await getMiningPlayerState(config, discordUserId);
  if (depth.requiredToolId && !state.ownedUpgradeIds.includes(depth.requiredToolId)) {
    const tool = getMiningUpgrade(depth.requiredToolId);
    throw new Error(`${depth.name} requires the ${tool?.name ?? 'required tool'}.`);
  }
  const equipment = equipmentFromState(depthId, state);
  const { data, error } = await createBotServiceClient(config).rpc('start_discord_mining_expedition', {
    p_depth: depthId,
    p_descend_duration_ms: equipment.descendDurationMs,
    p_discord_user_id: discordUserId,
    p_equipment_snapshot: equipment,
    p_guild_id: config.guildId,
    p_outcome_seed: randomInt(1, 2_147_483_648),
  });
  if (error) throw new Error(`Unable to start Discord mining expedition: ${error.message}`);
  const started = firstRow(data as StartedMiningExpeditionRow | StartedMiningExpeditionRow[] | null);
  if (!started) throw new Error('Mining expedition did not return a result.');
  return { depth, expeditionId: started.expedition_id, miningStartsAt: started.mining_started_at, travelDurationMs: equipment.descendDurationMs };
}

function miningResultAtReturn(expedition: Pick<MiningExpeditionRow, 'depth' | 'equipment_snapshot' | 'mining_started_at' | 'outcome_seed'>, returnStartedAt: string) {
  const elapsedMs = Math.max(0, new Date(returnStartedAt).getTime() - new Date(expedition.mining_started_at).getTime());
  return resolveMiningExpedition(expedition.depth, expedition.equipment_snapshot, expedition.outcome_seed, elapsedMs);
}

export async function beginMiningReturn(config: DiscordBotConfig, discordUserId: string): Promise<BegunMiningReturn> {
  const active = await getActiveMiningExpedition(config, discordUserId);
  if (!active) throw new Error('You do not have an active mining expedition to recall.');
  if (active.status === 'returning') throw new Error('Your minecart is already returning to the surface.');
  const { data, error } = await createBotServiceClient(config).rpc('begin_discord_mining_return', {
    p_ascent_duration_ms: active.equipment_snapshot.descendDurationMs,
    p_discord_user_id: discordUserId,
    p_expedition_id: active.id,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to recall mining expedition: ${error.message}`);
  const begun = firstRow(data as BegunMiningReturnRow | BegunMiningReturnRow[] | null);
  if (!begun) throw new Error('Mining expedition could not begin its return.');
  const result = miningResultAtReturn(begun, begun.return_started_at);
  const { error: recordError } = await createBotServiceClient(config).rpc('record_discord_mining_return_result', {
    p_discord_user_id: discordUserId,
    p_expedition_id: begun.expedition_id,
    p_guild_id: config.guildId,
    p_result: result,
  });
  if (recordError) throw new Error(`Unable to secure mining expedition results: ${recordError.message}`);
  return { depth: active.depth, result, travelDurationMs: active.equipment_snapshot.descendDurationMs };
}

async function ensureMiningReturnResult(config: DiscordBotConfig, discordUserId: string, expedition: MiningExpeditionRow) {
  if (expedition.result || !expedition.return_started_at) return expedition.result;
  const result = miningResultAtReturn(expedition, expedition.return_started_at);
  const { error } = await createBotServiceClient(config).rpc('record_discord_mining_return_result', {
    p_discord_user_id: discordUserId,
    p_expedition_id: expedition.id,
    p_guild_id: config.guildId,
    p_result: result,
  });
  if (error) throw new Error(`Unable to recover mining expedition results: ${error.message}`);
  return result;
}

/** Settles one overdue return on demand. There is intentionally no mining scheduler. */
export async function settleDueMiningReturn(config: DiscordBotConfig, discordUserId: string): Promise<SettledMiningExpedition | null> {
  const active = await getActiveMiningExpedition(config, discordUserId);
  if (!active || active.status !== 'returning' || !active.returns_at || new Date(active.returns_at).getTime() > Date.now()) return null;
  await ensureMiningReturnResult(config, discordUserId, active);
  const { data, error } = await createBotServiceClient(config).rpc('settle_discord_mining_expedition', {
    p_discord_user_id: discordUserId,
    p_expedition_id: active.id,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to settle mining expedition: ${error.message}`);
  const settled = firstRow(data as SettledMiningExpeditionRow | SettledMiningExpeditionRow[] | null);
  if (!settled?.settled || !settled.result || settled.mining_current_level === null || settled.mining_previous_level === null || settled.mining_total_xp === null) return null;
  return {
    currentLevel: settled.mining_current_level,
    previousLevel: settled.mining_previous_level,
    result: settled.result,
    totalXp: settled.mining_total_xp,
    xpAwarded: settled.mining_xp_awarded,
  };
}

export async function purchaseMiningUpgrade(config: DiscordBotConfig, discordUserId: string, upgradeId: string) {
  const upgrade = getMiningUpgrade(upgradeId);
  if (!upgrade || upgrade.id === 'wooden-pickaxe' || upgrade.id === 'shabby-bin') throw new Error('That mining upgrade is unavailable.');
  const state = await getMiningPlayerState(config, discordUserId);
  if (state.ownedUpgradeIds.includes(upgrade.id)) throw new Error('You already own that upgrade.');
  if (upgrade.previousUpgradeId && !state.ownedUpgradeIds.includes(upgrade.previousUpgradeId)) {
    throw new Error(`This upgrade requires ${getMiningUpgrade(upgrade.previousUpgradeId)?.name ?? 'the previous upgrade'} first.`);
  }
  const recipe = getMiningCraftingRecipe(upgrade, state.skills.cheapskate);
  const inventory = new Map(state.inventory.map((item) => [item.resource_id, item.quantity]));
  const processorTier = getMiningProcessorTier(state);
  for (const cost of recipe) {
    const resource = getMiningResource(cost.resourceId);
    if (resource?.kind === 'ore' && (resource.processorTier ?? 0) > processorTier) {
      throw new Error(`${resource.name} requires a Depth ${resource.processorTier} Processor before it can be used for crafting.`);
    }
    if ((inventory.get(cost.resourceId) ?? 0) < cost.quantity) throw new Error('You do not have the required mining materials.');
  }
  const { error } = await createBotServiceClient(config).rpc('purchase_discord_mining_upgrade', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_knowbucks_cost: 0,
    p_processor_tier: upgrade.category === 'processor' ? upgrade.value : 0,
    p_resource_cost: recipe.map((item) => ({ resource_id: item.resourceId, quantity: item.quantity })),
    p_upgrade_id: upgrade.id,
  });
  if (error) throw new Error(`Unable to craft mining upgrade: ${error.message}`);
  return { recipe, upgrade };
}

export async function sellMiningResource(
  config: DiscordBotConfig,
  discordUserId: string,
  resourceNameOrId: string,
  requestedAmount: string,
): Promise<MiningSale> {
  const resource = findMiningResource(resourceNameOrId);
  if (!resource || (resource.kind !== 'ore' && resource.kind !== 'gem') || !resource.saleValue) {
    throw new Error('Choose a valid ore or gem name, such as Copper, Ruby, or Moissanite.');
  }
  const state = await getMiningPlayerState(config, discordUserId);
  if (resource.kind === 'ore' && (resource.processorTier ?? 0) > getMiningProcessorTier(state)) {
    throw new Error(`${resource.name} requires a Depth ${resource.processorTier} Processor before it can be sold.`);
  }
  const heldAmount = state.inventory.find((item) => item.resource_id === resource.id)?.quantity ?? 0;
  const normalizedAmount = requestedAmount.trim().toLowerCase();
  const amount = normalizedAmount === 'all'
    ? heldAmount
    : /^[1-9][0-9]*$/.test(normalizedAmount) ? Number(normalizedAmount) : Number.NaN;
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Amount must be a positive whole number or `all`.');
  if (amount > heldAmount) throw new Error(`You only have ${heldAmount.toLocaleString()} ${resource.name}.`);
  const { data, error } = await createBotServiceClient(config).rpc('sell_discord_mining_resource', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_quantity: amount,
    p_resource_id: resource.id,
  });
  if (error) throw new Error(`Unable to sell mining resources: ${error.message}`);
  const sale = firstRow(data as MiningSaleRow | MiningSaleRow[] | null);
  if (!sale) throw new Error('Mining sale did not return a result.');
  return { balance: sale.current_balance, soldCount: sale.sold_count, totalSaleValue: sale.knowbucks_awarded };
}

export function getMiningInventoryByKind(state: MiningPlayerState, kind: MiningResourceKind) {
  return state.inventory.flatMap((entry) => {
    const resource = getMiningResource(entry.resource_id);
    return resource?.kind === kind ? [{ resource, quantity: entry.quantity }] : [];
  });
}
