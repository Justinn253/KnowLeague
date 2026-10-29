import { randomInt } from 'node:crypto';
import { ButtonBuilder, ButtonStyle, EmbedBuilder, type Guild, type GuildMember, type SendableChannels } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_CRATES,
  FISHING_CRATE_LOOT,
  FISHING_EVENTS,
  FISHING_EXPEDITION_LENGTHS,
  FISHING_FISH,
  FISHING_UPGRADES,
  formatFishingDuration,
  getFishingBiome,
  getFishingCrate,
  getFishingEvent,
  getFishingEventForOutcomeSeed,
  getFishingExpeditionLength,
  getFishingKnowBucksMultiplier,
  getFishingTotalXpForLevel,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingTimeReductionPercent,
  getFishingXpToNextLevel,
  resolveFishingExpedition,
  shouldInstantlyCompleteFishingExpedition,
  type FishingBiomeId,
  type FishingCrateRarity,
  type FishingDurationTier,
  type FishingEquipmentSnapshot,
  type FishingEventCatalogueBiomeId,
  type FishingExpeditionModifiers,
  type FishingExpeditionResult,
  type FishingFish,
  type FishingRarity,
  type FishingUpgrade,
  type FishingUpgradeCategory,
} from './fishing-catalog.js';
import { createBotServiceClient } from './supabase.js';

type FishingPlayerRow = {
  crew_one_unlocked: boolean;
  crew_two_unlocked: boolean;
  equipped_bait_id: string;
  equipped_rod_id: string;
};

type FishingInventoryRow = {
  item_id: string;
  quantity: number;
};

type FishingSkillRow = {
  level: number;
  total_xp: number;
};

type FishingExpeditionRow = {
  biome_id: FishingBiomeId;
  completes_at: string;
  crew_slot: number;
  discord_user_id: string;
  duration_tier: FishingDurationTier;
  equipment_snapshot: FishingEquipmentSnapshot;
  id: number;
  notification_channel_id: string;
  notification_message_id: string | null;
  outcome_seed: number;
  result: FishingExpeditionResult | null;
  started_at: string;
  status: 'active' | 'completed';
};

type FishingRecentExpeditionRow = {
  biome_id: FishingBiomeId;
};

type FishingCommandSettingsRow = {
  command_all_channels: boolean;
};

type FishingCommandChannelRow = {
  channel_id: string;
};

type FishingBonusRoleRow = {
  discord_role_id: string;
};

type FishingWeekdayPhenomenonId = 'double-xp' | 'double-knowbucks' | 'higher-fish-rarity' | 'shorter-expeditions' | 'extra-crate-loot';

type FishingWeekdayPhenomenonRow = {
  phenomenon: FishingWeekdayPhenomenonId;
  weekday: number;
};

type FishingLevelRoleRewardRow = {
  discord_role_id: string;
  level: number;
};

type FishingRoleSettingsRow = {
  top_fisher_role_id: string | null;
};

type FishingTopRoleAssignmentRow = {
  discord_role_id: string;
  discord_user_id: string;
};

type FishingLeaderboardMemberRow = {
  discord_user_id: string;
  level: number;
  total_xp: number;
};

type FishingCatalogueCatchRow = {
  biome_id: FishingBiomeId | FishingEventCatalogueBiomeId;
  fish_name: string;
  fish_rarity: FishingRarity;
};

type StartedExpeditionRow = { completes_at: string; expedition_id: number };
type PurchaseUpgradeRow = { crew_slots: number; current_balance: number };
type SettledExpeditionRow = {
  awarded_gear_item_ids: string[];
  current_balance: number | null;
  discord_user_id: string | null;
  fishing_current_level: number | null;
  fishing_knowbucks_awarded: number;
  fishing_previous_level: number | null;
  fishing_total_xp: number | null;
  fishing_xp_awarded: number;
  knowbucks_awarded: number;
  notification_channel_id: string | null;
  result: FishingExpeditionResult | null;
  settled: boolean;
};

export type FishingPlayerState = {
  balance: number;
  chatLevel: number;
  crewSlots: number;
  equipment: FishingEquipmentSnapshot;
  fishingLevel: number;
  fishingTotalXp: number;
  fishingXpIntoLevel: number;
  fishingXpToNextLevel: number;
  inventory: FishingInventoryRow[];
  /** Shared player-shop items, currently the reusable skill tiers. */
  playerItemIds: string[];
};

type FishingSettlementSkillAward = {
  currentLevel: number;
  knowBucksAwarded: number;
  previousLevel: number;
  totalXp: number;
  xpAwarded: number;
};

export type FishingCatalogueProgress = {
  caughtFish: readonly Pick<FishingFish, 'biomeId' | 'name' | 'rarity'>[];
  ownedGearItemIds: ReadonlySet<string>;
};

export type FishingEventCatalogueProgress = {
  caughtFish: readonly Pick<FishingFish, 'name' | 'rarity'>[];
  ownedTitleItemIds: ReadonlySet<string>;
};

export type StartedFishingExpedition = {
  activeModifierLabels?: string[];
  biomeName: string;
  crewSlot: number;
  durationSeconds: number;
  expeditionId: number;
  eventName?: string;
  instantCompletion: boolean;
  selectedBiomeName?: string;
};

export type FishingRepeatPreset = {
  biomeId: FishingBiomeId;
  crewSlot: number;
  durationTier: FishingDurationTier;
  ownerDiscordUserId: string;
};

export const FISHING_REPEAT_BUTTON_PREFIX = 'fish-repeat';

export type FishingShopPurchase = {
  balance: number;
  cost: number;
  crewSlots: number;
  upgrade: FishingUpgrade;
};

const FISHING_SCHEDULER_INTERVAL_MS = 5_000;
const FISHING_COMMAND_SETTINGS_CACHE_MS = 30_000;
const FISHING_BONUS_SETTINGS_CACHE_MS = 30_000;
const FISHING_LEVEL_REWARDS_CACHE_MS = 30_000;
const FISHING_TOP_ROLE_RECONCILIATION_INTERVAL_MS = 60_000;
const FISHING_TOP_ROLE_MAX_MEMBER_SCAN = 500;
let scheduler: ReturnType<typeof setInterval> | null = null;
let settlementInFlight: Promise<void> | null = null;
let cachedFishingCommandSettings: { allowedChannelIds: Set<string> | null; expiresAt: number } | null = null;
let cachedFishingBonusSettings: { expiresAt: number; guildId: string; value: FishingBonusSettings } | null = null;
let fishingBonusSettingsLoad: Promise<FishingBonusSettings> | null = null;
let cachedFishingLevelRewards: { expiresAt: number; guildId: string; value: FishingLevelRoleRewardRow[] } | null = null;
let fishingLevelRewardsLoad: Promise<FishingLevelRoleRewardRow[]> | null = null;
let fishingTopRoleSyncInFlight: Promise<void> | null = null;
let lastFishingTopRoleReconciliationAt = 0;

type FishingBonusSettings = {
  bonusRoleIds: ReadonlySet<string>;
  weekdaysByPhenomenon: ReadonlyMap<FishingWeekdayPhenomenonId, ReadonlySet<number>>;
};

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function normalizeEquipmentSnapshot(snapshot: FishingEquipmentSnapshot): FishingEquipmentSnapshot {
  const rod = getFishingUpgrade(snapshot.rodItemId);
  const bait = getFishingUpgrade(snapshot.baitItemId);
  if (rod?.category !== 'rod' || bait?.category !== 'bait') {
    throw new Error('Fishing equipment contains an invalid upgrade.');
  }
  const passiveItemIds = [...new Set(snapshot.passiveItemIds ?? [])]
    .filter((itemId) => {
      const item = getFishingUpgrade(itemId);
      return item?.category === 'gear' || item?.category === 'skill';
    });
  const catalogueVersion = snapshot.catalogueVersion === 2 || snapshot.catalogueVersion === 3 || snapshot.catalogueVersion === 4 || snapshot.catalogueVersion === 5 || snapshot.catalogueVersion === 6
    ? snapshot.catalogueVersion
    : 7;
  const modifiers: FishingExpeditionModifiers = {
    doubleKnowBucks: snapshot.modifiers?.doubleKnowBucks === true,
    doubleXp: snapshot.modifiers?.doubleXp === true,
    earlyBirdBonus: snapshot.modifiers?.earlyBirdBonus === true,
    extraCrateLoot: snapshot.modifiers?.extraCrateLoot === true,
    genesysLoopCount: Number.isInteger(snapshot.modifiers?.genesysLoopCount)
      ? Math.max(0, Math.min(2, snapshot.modifiers?.genesysLoopCount ?? 0))
      : 0,
    higherFishRarity: snapshot.modifiers?.higherFishRarity === true,
    roleBonus: snapshot.modifiers?.roleBonus === true,
    streakSaleBonusPercent: Number.isFinite(snapshot.modifiers?.streakSaleBonusPercent)
      ? Math.max(0, Math.min(10, snapshot.modifiers?.streakSaleBonusPercent ?? 0))
      : 0,
    shorterExpeditions: snapshot.modifiers?.shorterExpeditions === true,
  };
  const catalogueFishKeys = [...new Set(snapshot.catalogueFishKeys ?? [])]
    .filter((fishKey): fishKey is string => typeof fishKey === 'string' && fishKey.length > 0 && fishKey.length <= 256)
    .slice(0, 250);
  const titleItemIds = [...new Set(snapshot.titleItemIds ?? [])]
    .filter((itemId): itemId is string => FISHING_EVENTS.some((event) => event.title.itemId === itemId));
  const eventId = getFishingEvent(snapshot.eventId)?.id;
  return { catalogueVersion, catalogueFishKeys, rodItemId: rod.id, baitItemId: bait.id, passiveItemIds, modifiers, titleItemIds, eventId };
}

async function ensureFishingPlayer(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('ensure_discord_fishing_player', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to initialize Discord fishing: ${error.message}`);
}

export async function getFishingPlayerState(config: DiscordBotConfig, discordUserId: string): Promise<FishingPlayerState> {
  await ensureFishingPlayer(config, discordUserId);
  const supabase = createBotServiceClient(config);
  const [playerResult, inventoryResult, playerInventoryResult, balanceResult, levelResult, fishingSkillResult] = await Promise.all([
    supabase
      .from('discord_fishing_players')
      .select('crew_one_unlocked,crew_two_unlocked,equipped_bait_id,equipped_rod_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .single<FishingPlayerRow>(),
    supabase
      .from('discord_fishing_inventory')
      .select('item_id,quantity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .order('item_id', { ascending: true })
      .returns<FishingInventoryRow[]>(),
    supabase
      .from('discord_player_inventory')
      .select('item_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .returns<Pick<FishingInventoryRow, 'item_id'>[]>(),
    supabase
      .from('discord_knowbucks_balances')
      .select('balance')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<{ balance: number }>(),
    supabase
      .from('discord_leveling_members')
      .select('level')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<{ level: number }>(),
    supabase
      .from('discord_game_skill_progress')
      .select('level,total_xp')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('skill_id', 'fishing')
      .maybeSingle<FishingSkillRow>(),
  ]);
  if (playerResult.error) throw new Error(`Unable to load Discord fishing profile: ${playerResult.error.message}`);
  if (inventoryResult.error) throw new Error(`Unable to load Discord fishing inventory: ${inventoryResult.error.message}`);
  if (playerInventoryResult.error) throw new Error(`Unable to load shared player inventory for fishing: ${playerInventoryResult.error.message}`);
  if (balanceResult.error) throw new Error(`Unable to load Discord fishing balance: ${balanceResult.error.message}`);
  if (levelResult.error) throw new Error(`Unable to load Discord chat level for fishing: ${levelResult.error.message}`);
  if (fishingSkillResult.error) throw new Error(`Unable to load Discord fishing level: ${fishingSkillResult.error.message}`);
  if (!playerResult.data) throw new Error('Discord fishing profile was not created.');

  const inventory = inventoryResult.data ?? [];
  const playerItemIds = (playerInventoryResult.data ?? []).map((item) => item.item_id);
  const fishingLevel = fishingSkillResult.data?.level ?? 0;
  const fishingTotalXp = fishingSkillResult.data?.total_xp ?? 0;
  return {
    balance: balanceResult.data?.balance ?? 0,
    chatLevel: levelResult.data?.level ?? 0,
    crewSlots: 1 + Number(playerResult.data.crew_one_unlocked) + Number(playerResult.data.crew_two_unlocked),
    equipment: normalizeEquipmentSnapshot({
      catalogueVersion: 7,
      rodItemId: playerResult.data.equipped_rod_id,
      baitItemId: playerResult.data.equipped_bait_id,
      passiveItemIds: inventory
        .map((item) => item.item_id)
        .filter((itemId) => {
          const item = getFishingUpgrade(itemId);
          return item?.category === 'gear';
        })
        .concat(playerItemIds.filter((itemId) => getFishingUpgrade(itemId)?.category === 'skill')),
      titleItemIds: inventory
        .map((item) => item.item_id)
        .filter((itemId) => FISHING_EVENTS.some((event) => event.title.itemId === itemId)),
    }),
    fishingLevel,
    fishingTotalXp,
    fishingXpIntoLevel: Math.max(0, fishingTotalXp - getFishingTotalXpForLevel(fishingLevel)),
    fishingXpToNextLevel: getFishingXpToNextLevel(fishingLevel),
    inventory,
    playerItemIds,
  };
}

async function getActiveExpeditions(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_fishing_expeditions')
    .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .eq('status', 'active')
    .order('completes_at', { ascending: true })
    .returns<FishingExpeditionRow[]>();
  if (error) throw new Error(`Unable to load active fishing expeditions: ${error.message}`);
  return data ?? [];
}

type FishingLaunchRelicState = {
  catalogueFishKeys: string[];
  earlyBirdBonus: boolean;
  streakSaleBonusPercent: number;
};

/**
 * Relic rules that depend on a player's history are captured at launch so a
 * scheduled settlement stays deterministic even if more expeditions start
 * before it completes.
 */
async function getFishingLaunchRelicState(
  config: DiscordBotConfig,
  discordUserId: string,
  biomeId: FishingBiomeId,
  equipment: FishingEquipmentSnapshot,
): Promise<FishingLaunchRelicState> {
  const hasStreakCharm = equipment.passiveItemIds.includes('gear-streak-charm');
  const hasEarlyBirdBell = equipment.passiveItemIds.includes('gear-early-bird-bell');
  const hasPearlDiversLog = equipment.passiveItemIds.includes('gear-pearl-divers-log');
  if (!hasStreakCharm && !hasEarlyBirdBell && !hasPearlDiversLog) {
    return { catalogueFishKeys: [], earlyBirdBonus: false, streakSaleBonusPercent: 0 };
  }

  const supabase = createBotServiceClient(config);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [recentResult, dailyResult, catalogueResult] = await Promise.all([
    hasStreakCharm
      ? supabase
        .from('discord_fishing_expeditions')
        .select('biome_id')
        .eq('guild_id', config.guildId)
        .eq('discord_user_id', discordUserId)
        .order('started_at', { ascending: false })
        .limit(20)
        .returns<FishingRecentExpeditionRow[]>()
      : Promise.resolve({ data: [] as FishingRecentExpeditionRow[], error: null }),
    hasEarlyBirdBell
      ? supabase
        .from('discord_fishing_expeditions')
        .select('id')
        .eq('guild_id', config.guildId)
        .eq('discord_user_id', discordUserId)
        .gte('started_at', dayStart.toISOString())
        .limit(1)
      : Promise.resolve({ data: [] as Array<{ id: number }>, error: null }),
    hasPearlDiversLog
      ? supabase
        .from('discord_fishing_catalogue_catches')
        .select('biome_id,fish_name,fish_rarity')
        .eq('guild_id', config.guildId)
        .eq('discord_user_id', discordUserId)
        .returns<FishingCatalogueCatchRow[]>()
      : Promise.resolve({ data: [] as FishingCatalogueCatchRow[], error: null }),
  ]);
  if (recentResult.error) throw new Error(`Unable to load Fishing streak history: ${recentResult.error.message}`);
  if (dailyResult.error) throw new Error(`Unable to load Fishing daily launch history: ${dailyResult.error.message}`);
  if (catalogueResult.error) throw new Error(`Unable to load Fishing catalogue history: ${catalogueResult.error.message}`);

  let consecutiveMatches = 0;
  for (const expedition of recentResult.data ?? []) {
    if (expedition.biome_id !== biomeId) break;
    consecutiveMatches += 1;
  }
  return {
    catalogueFishKeys: (catalogueResult.data ?? []).map((catchEntry) => (
      `${catchEntry.biome_id}:${catchEntry.fish_name}:${catchEntry.fish_rarity}`
    )),
    earlyBirdBonus: hasEarlyBirdBell && (dailyResult.data?.length ?? 0) === 0,
    streakSaleBonusPercent: Math.min(10, consecutiveMatches * 0.5),
  };
}

export function selectFishingCrewSlot(
  crewSlots: number,
  activeCrewSlots: readonly number[],
  requestedCrewSlot?: number,
) {
  const crewSlot = requestedCrewSlot ?? Array.from({ length: crewSlots }, (_, index) => index + 1)
    .find((slot) => !activeCrewSlots.includes(slot));
  if (!Number.isInteger(crewSlot) || !crewSlot || crewSlot < 1 || crewSlot > crewSlots) {
    throw new Error('Every unlocked crew slot is already on an expedition.');
  }
  if (activeCrewSlots.includes(crewSlot)) {
    throw new Error(`Crew slot ${crewSlot} is already on an expedition.`);
  }
  return crewSlot;
}

export function buildFishingRepeatCustomId(preset: FishingRepeatPreset) {
  return [
    FISHING_REPEAT_BUTTON_PREFIX,
    preset.ownerDiscordUserId,
    preset.biomeId,
    preset.durationTier,
    preset.crewSlot,
  ].join(':');
}

export function parseFishingRepeatCustomId(customId: string): FishingRepeatPreset | null {
  const [prefix, ownerDiscordUserId, biomeId, durationTierRaw, crewSlotRaw, ...extra] = customId.split(':');
  if (prefix !== FISHING_REPEAT_BUTTON_PREFIX || !ownerDiscordUserId || !biomeId || !durationTierRaw || !crewSlotRaw || extra.length > 0) {
    return null;
  }

  const durationTier = Number(durationTierRaw);
  const crewSlot = Number(crewSlotRaw);
  if (
    !Number.isSafeInteger(durationTier)
    || !Number.isSafeInteger(crewSlot)
    || !getFishingBiome(biomeId as FishingBiomeId)
    || !getFishingExpeditionLength(durationTier as FishingDurationTier)
    || crewSlot < 1
    || crewSlot > 3
  ) {
    return null;
  }

  return {
    biomeId: biomeId as FishingBiomeId,
    crewSlot,
    durationTier: durationTier as FishingDurationTier,
    ownerDiscordUserId,
  };
}

export async function isFishingCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const now = Date.now();
  if (!cachedFishingCommandSettings || cachedFishingCommandSettings.expiresAt <= now) {
    const supabase = createBotServiceClient(config);
    const { data: settings, error: settingsError } = await supabase
      .from('discord_fishing_settings')
      .select('command_all_channels')
      .eq('guild_id', config.guildId)
      .maybeSingle<FishingCommandSettingsRow>();
    if (settingsError) throw new Error(`Unable to load fishing command settings: ${settingsError.message}`);

    if (!settings || settings.command_all_channels) {
      cachedFishingCommandSettings = { allowedChannelIds: null, expiresAt: now + FISHING_COMMAND_SETTINGS_CACHE_MS };
    } else {
      const { data: channels, error: channelsError } = await supabase
        .from('discord_fishing_command_channels')
        .select('channel_id')
        .eq('guild_id', config.guildId)
        .returns<FishingCommandChannelRow[]>();
      if (channelsError) throw new Error(`Unable to load fishing command channels: ${channelsError.message}`);
      cachedFishingCommandSettings = {
        allowedChannelIds: new Set((channels ?? []).map((channel) => channel.channel_id)),
        expiresAt: now + FISHING_COMMAND_SETTINGS_CACHE_MS,
      };
    }
  }

  return cachedFishingCommandSettings.allowedChannelIds === null
    || cachedFishingCommandSettings.allowedChannelIds.has(channelId);
}

/** Returns the configured Fishing command channels, or an empty array when Fishing is open everywhere. */
export async function getFishingCommandChannelIds(config: DiscordBotConfig): Promise<readonly string[]> {
  await isFishingCommandAllowedInChannel(config, '0');
  return cachedFishingCommandSettings?.allowedChannelIds
    ? [...cachedFishingCommandSettings.allowedChannelIds]
    : [];
}

async function getConfiguredFishingBonusSettings(config: DiscordBotConfig): Promise<FishingBonusSettings> {
  const now = Date.now();
  if (cachedFishingBonusSettings
    && cachedFishingBonusSettings.guildId === config.guildId
    && cachedFishingBonusSettings.expiresAt > now) {
    return cachedFishingBonusSettings.value;
  }
  if (fishingBonusSettingsLoad) return fishingBonusSettingsLoad;

  fishingBonusSettingsLoad = (async () => {
    const supabase = createBotServiceClient(config);
    const [rolesResult, phenomenaResult] = await Promise.all([
      supabase
        .from('discord_fishing_bonus_roles')
        .select('discord_role_id')
        .eq('guild_id', config.guildId)
        .returns<FishingBonusRoleRow[]>(),
      supabase
        .from('discord_fishing_weekday_phenomena')
        .select('phenomenon,weekday')
        .eq('guild_id', config.guildId)
        .returns<FishingWeekdayPhenomenonRow[]>(),
    ]);
    if (rolesResult.error) throw new Error(`Unable to load Fishing bonus roles: ${rolesResult.error.message}`);
    if (phenomenaResult.error) throw new Error(`Unable to load Fishing weekday phenomena: ${phenomenaResult.error.message}`);

    const weekdaysByPhenomenon = new Map<FishingWeekdayPhenomenonId, ReadonlySet<number>>();
    for (const row of phenomenaResult.data ?? []) {
      const weekdays = new Set(weekdaysByPhenomenon.get(row.phenomenon) ?? []);
      weekdays.add(row.weekday);
      weekdaysByPhenomenon.set(row.phenomenon, weekdays);
    }
    const value: FishingBonusSettings = {
      bonusRoleIds: new Set((rolesResult.data ?? []).map((row) => row.discord_role_id)),
      weekdaysByPhenomenon,
    };
    cachedFishingBonusSettings = { expiresAt: Date.now() + FISHING_BONUS_SETTINGS_CACHE_MS, guildId: config.guildId, value };
    return value;
  })();

  try {
    return await fishingBonusSettingsLoad;
  } finally {
    fishingBonusSettingsLoad = null;
  }
}

function getFishingExpeditionModifiers(
  settings: FishingBonusSettings,
  memberRoleIds: readonly string[],
  launchedAt: Date,
): FishingExpeditionModifiers {
  const weekday = launchedAt.getUTCDay();
  const isActive = (phenomenon: FishingWeekdayPhenomenonId) => settings.weekdaysByPhenomenon.get(phenomenon)?.has(weekday) ?? false;
  return {
    doubleKnowBucks: isActive('double-knowbucks'),
    doubleXp: isActive('double-xp'),
    extraCrateLoot: isActive('extra-crate-loot'),
    higherFishRarity: isActive('higher-fish-rarity'),
    roleBonus: memberRoleIds.some((roleId) => settings.bonusRoleIds.has(roleId)),
    shorterExpeditions: isActive('shorter-expeditions'),
  };
}

function getFishingModifierLabels(modifiers: FishingExpeditionModifiers) {
  const labels: string[] = [];
  if (modifiers.roleBonus) labels.push('Role bonus: +10% Fishing XP and KnowBucks');
  if (modifiers.doubleXp) labels.push('Double Fishing XP');
  if (modifiers.doubleKnowBucks) labels.push('Double KnowBucks');
  if (modifiers.higherFishRarity) labels.push('+25% higher fish rarity');
  if (modifiers.shorterExpeditions) labels.push('25% shorter expedition');
  if (modifiers.extraCrateLoot) labels.push('50% more crate loot');
  return labels;
}

async function getConfiguredFishingLevelRewards(
  config: DiscordBotConfig,
  forceRefresh = false,
): Promise<FishingLevelRoleRewardRow[]> {
  const now = Date.now();
  if (!forceRefresh
    && cachedFishingLevelRewards
    && cachedFishingLevelRewards.guildId === config.guildId
    && cachedFishingLevelRewards.expiresAt > now) {
    return cachedFishingLevelRewards.value;
  }
  if (!forceRefresh && fishingLevelRewardsLoad) {
    return fishingLevelRewardsLoad;
  }

  const load = async () => {
    const { data, error } = await createBotServiceClient(config)
      .from('discord_fishing_level_role_rewards')
      .select('discord_role_id,level')
      .eq('guild_id', config.guildId)
      .order('level', { ascending: true })
      .returns<FishingLevelRoleRewardRow[]>();
    if (error) throw new Error(`Unable to read Fishing level rewards: ${error.message}`);

    const value = data ?? [];
    cachedFishingLevelRewards = {
      expiresAt: Date.now() + FISHING_LEVEL_REWARDS_CACHE_MS,
      guildId: config.guildId,
      value,
    };
    return value;
  };

  if (forceRefresh) return load();
  fishingLevelRewardsLoad = load();
  try {
    return await fishingLevelRewardsLoad;
  } finally {
    fishingLevelRewardsLoad = null;
  }
}

export async function grantEligibleFishingLevelRoles(
  config: DiscordBotConfig,
  member: GuildMember,
  fishingLevel: number,
) {
  const rewards = await getConfiguredFishingLevelRewards(config);
  const highestTier = rewards.filter((reward) => reward.level <= fishingLevel).reduce((highest, reward) => Math.max(highest, reward.level), 0);
  const targetRoleIds = new Set(rewards.filter((reward) => reward.level === highestTier).map((reward) => reward.discord_role_id));
  const configuredRoleIds = new Set(rewards.map((reward) => reward.discord_role_id));
  const removableRoleIds = [...configuredRoleIds].filter((roleId) => member.roles.cache.has(roleId) && !targetRoleIds.has(roleId) && member.guild.roles.cache.get(roleId)?.editable);
  const missingRoleIds = [...targetRoleIds].filter((roleId) => !member.roles.cache.has(roleId) && member.guild.roles.cache.get(roleId)?.editable);
  if (removableRoleIds.length) await member.roles.remove(removableRoleIds, 'KnowLeague Fishing level reward tier replaced');
  if (missingRoleIds.length) await member.roles.add(missingRoleIds, 'KnowLeague Fishing level reward');
}

export async function grantCurrentFishingLevelRoles(config: DiscordBotConfig, member: GuildMember) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_game_skill_progress')
    .select('level')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', member.id)
    .eq('skill_id', 'fishing')
    .maybeSingle<Pick<FishingSkillRow, 'level'>>();
  if (error) throw new Error(`Unable to read Fishing level rewards for member: ${error.message}`);
  await grantEligibleFishingLevelRoles(config, member, data?.level ?? 0);
}

async function getCurrentTopFishingMember(
  config: DiscordBotConfig,
  guild: Guild,
): Promise<(FishingLeaderboardMemberRow & { member: GuildMember }) | null> {
  const supabase = createBotServiceClient(config);
  const pageSize = 25;
  let start = 0;
  while (start < FISHING_TOP_ROLE_MAX_MEMBER_SCAN) {
    const { data, error } = await supabase
      .from('discord_game_skill_progress')
      .select('discord_user_id,level,total_xp')
      .eq('guild_id', config.guildId)
      .eq('skill_id', 'fishing')
      .gt('total_xp', 0)
      .order('level', { ascending: false })
      .order('total_xp', { ascending: false })
      .order('discord_user_id', { ascending: true })
      .range(start, Math.min(start + pageSize - 1, FISHING_TOP_ROLE_MAX_MEMBER_SCAN - 1))
      .returns<FishingLeaderboardMemberRow[]>();
    if (error) throw new Error(`Unable to load the Fishing leaderboard: ${error.message}`);
    if (!data?.length) return null;

    for (const entry of data) {
      try {
        const member = await guild.members.fetch(entry.discord_user_id);
        if (!member.user.bot) return { ...entry, member };
      } catch {
        // Skill rows outlive ordinary Discord server departures. Skip them so
        // a current member can hold the managed top-Fisher role.
      }
    }
    if (data.length < pageSize) return null;
    start += pageSize;
  }
  return null;
}

async function removeTrackedFishingTopRole(
  guild: Guild,
  assignment: FishingTopRoleAssignmentRow,
): Promise<boolean> {
  const role = await guild.roles.fetch(assignment.discord_role_id);
  if (!role) return true;
  if (!role.editable) {
    console.error('Fishing top-role synchronization could not remove a role above the bot.');
    return false;
  }
  try {
    const member = await guild.members.fetch(assignment.discord_user_id);
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'KnowLeague top Fisher changed');
    }
    return true;
  } catch {
    // Discord removes member roles when a member leaves or is banned, so the
    // stale assignment can safely be cleared when the member cannot be found.
    return true;
  }
}

async function performDiscordFishingTopRoleSync(config: DiscordBotConfig, guild: Guild) {
  const supabase = createBotServiceClient(config);
  const [settingsResult, assignmentResult] = await Promise.all([
    supabase
      .from('discord_fishing_settings')
      .select('top_fisher_role_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<FishingRoleSettingsRow>(),
    supabase
      .from('discord_fishing_top_role_assignments')
      .select('discord_role_id,discord_user_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<FishingTopRoleAssignmentRow>(),
  ]);
  if (settingsResult.error) throw new Error(`Unable to load top Fisher role settings: ${settingsResult.error.message}`);
  if (assignmentResult.error) throw new Error(`Unable to load top Fisher role assignment: ${assignmentResult.error.message}`);

  const assigned = assignmentResult.data;
  const configuredRoleId = settingsResult.data?.top_fisher_role_id ?? null;
  if (!configuredRoleId) {
    if (!assigned || !(await removeTrackedFishingTopRole(guild, assigned))) return;
    const { error } = await supabase
      .from('discord_fishing_top_role_assignments')
      .delete()
      .eq('guild_id', config.guildId);
    if (error) throw new Error(`Unable to clear the top Fisher role assignment: ${error.message}`);
    return;
  }

  const role = await guild.roles.fetch(configuredRoleId);
  if (!role) {
    console.error('Fishing top-role synchronization could not find the configured role.');
    return;
  }
  if (!role.editable) {
    console.error('Fishing top-role synchronization requires the configured role to be below the bot role.');
    return;
  }

  const leader = await getCurrentTopFishingMember(config, guild);
  if (assigned && (!leader || assigned.discord_role_id !== role.id || assigned.discord_user_id !== leader.discord_user_id)) {
    if (!(await removeTrackedFishingTopRole(guild, assigned))) return;
    const { error } = await supabase
      .from('discord_fishing_top_role_assignments')
      .delete()
      .eq('guild_id', config.guildId);
    if (error) throw new Error(`Unable to clear the previous top Fisher role assignment: ${error.message}`);
  }

  if (!leader) return;
  if (!leader.member.roles.cache.has(role.id)) {
    await leader.member.roles.add(role, 'KnowLeague top Fisher');
  }
  const { error } = await supabase
    .from('discord_fishing_top_role_assignments')
    .upsert({
      discord_role_id: role.id,
      discord_user_id: leader.discord_user_id,
      guild_id: config.guildId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
  if (error) throw new Error(`Unable to save the top Fisher role assignment: ${error.message}`);
}

export function syncDiscordFishingTopRole(config: DiscordBotConfig, guild: Guild): Promise<void> {
  if (guild.id !== config.guildId) return Promise.resolve();
  if (fishingTopRoleSyncInFlight) return fishingTopRoleSyncInFlight;

  const work = performDiscordFishingTopRoleSync(config, guild);
  fishingTopRoleSyncInFlight = work;
  void work.then(
    () => {
      lastFishingTopRoleReconciliationAt = Date.now();
      if (fishingTopRoleSyncInFlight === work) fishingTopRoleSyncInFlight = null;
    },
    () => {
      if (fishingTopRoleSyncInFlight === work) fishingTopRoleSyncInFlight = null;
    },
  );
  return work;
}

async function maybeSyncDiscordFishingTopRole(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId || Date.now() - lastFishingTopRoleReconciliationAt < FISHING_TOP_ROLE_RECONCILIATION_INTERVAL_MS) {
    return;
  }
  await syncDiscordFishingTopRole(config, guild);
}

export async function startFishingExpedition(
  config: DiscordBotConfig,
  discordUserId: string,
  biomeId: FishingBiomeId,
  durationTier: FishingDurationTier,
  notificationChannelId: string,
  requestedCrewSlot?: number,
  memberRoleIds: readonly string[] = [],
  options?: { genesysLoopCount?: number },
): Promise<StartedFishingExpedition> {
  const biome = getFishingBiome(biomeId);
  const expeditionLength = getFishingExpeditionLength(durationTier);
  if (!biome || !expeditionLength) throw new Error('Choose a valid fishing biome and expedition length.');
  const [state, activeExpeditions, bonusSettings] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    getActiveExpeditions(config, discordUserId),
    getConfiguredFishingBonusSettings(config),
  ]);
  const crewSlot = selectFishingCrewSlot(
    state.crewSlots,
    activeExpeditions.map((expedition) => expedition.crew_slot),
    requestedCrewSlot,
  );
  if (state.fishingLevel < expeditionLength.requiredFishingLevel) {
    throw new Error(`Expedition length ${durationTier} unlocks at fishing level ${expeditionLength.requiredFishingLevel}.`);
  }
  if (biome.requiredBoatUpgradeId && !state.inventory.some((item) => item.item_id === biome.requiredBoatUpgradeId)) {
    const upgrade = getFishingUpgrade(biome.requiredBoatUpgradeId);
    throw new Error(`${biome.name} requires the ${upgrade?.name ?? 'required boat upgrade'}.`);
  }
  const launchRelicState = await getFishingLaunchRelicState(config, discordUserId, biomeId, state.equipment);
  const modifiers: FishingExpeditionModifiers = {
    ...getFishingExpeditionModifiers(bonusSettings, memberRoleIds, new Date()),
    earlyBirdBonus: launchRelicState.earlyBirdBonus,
    genesysLoopCount: Math.max(0, Math.min(2, Math.floor(options?.genesysLoopCount ?? 0))),
    streakSaleBonusPercent: launchRelicState.streakSaleBonusPercent,
  };
  const outcomeSeed = randomInt(1, 2_147_483_648);
  const event = getFishingEventForOutcomeSeed(outcomeSeed);
  const equipment: FishingEquipmentSnapshot = {
    ...state.equipment,
    catalogueFishKeys: launchRelicState.catalogueFishKeys,
    catalogueVersion: 7,
    eventId: event?.id,
    modifiers,
  };
  const instantCompletion = shouldInstantlyCompleteFishingExpedition(equipment, outcomeSeed, crewSlot > 1);
  const durationSeconds = instantCompletion
    ? 0
    : calculateFishingDurationSeconds(
      durationTier,
      crewSlot > 1,
      getFishingTimeReductionPercent(equipment)
        + (crewSlot > 1 && equipment.passiveItemIds.includes('gear-autopilot-relay') ? 10 : 0),
      modifiers.shorterExpeditions ? 25 : 0,
    );
  if (durationSeconds === null) throw new Error('Fishing expedition duration is invalid.');

  const { data, error } = await createBotServiceClient(config).rpc('start_discord_fishing_expedition', {
    p_biome_id: biomeId,
    p_crew_slot: crewSlot,
    p_discord_user_id: discordUserId,
    p_duration_seconds: durationSeconds,
    p_duration_tier: durationTier,
    p_equipment_snapshot: equipment,
    p_guild_id: config.guildId,
    p_notification_channel_id: notificationChannelId,
    p_outcome_seed: outcomeSeed,
  });
  if (error) throw new Error(`Unable to start Discord fishing expedition: ${error.message}`);
  const started = getFirstResult(data as StartedExpeditionRow | StartedExpeditionRow[] | null);
  if (!started) throw new Error('Discord fishing expedition did not return a result.');
  return {
    activeModifierLabels: getFishingModifierLabels(modifiers),
    biomeName: event?.biomeName ?? biome.name,
    crewSlot,
    durationSeconds,
    expeditionId: started.expedition_id,
    eventName: event?.name,
    instantCompletion,
    selectedBiomeName: event ? biome.name : undefined,
  };
}

export async function attachFishingExpeditionMessage(
  config: DiscordBotConfig,
  discordUserId: string,
  expeditionId: number,
  messageId: string,
) {
  const { data, error } = await createBotServiceClient(config).rpc('attach_discord_fishing_expedition_message', {
    p_discord_user_id: discordUserId,
    p_expedition_id: expeditionId,
    p_guild_id: config.guildId,
    p_notification_message_id: messageId,
  });
  if (error) throw new Error(`Unable to attach Discord fishing expedition message: ${error.message}`);
  if (data !== true) throw new Error('Fishing expedition is no longer active, so its launch message could not be attached.');
}

export async function getFishingProgress(config: DiscordBotConfig, discordUserId: string) {
  const [state, activeResult, completedResult] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    getActiveExpeditions(config, discordUserId),
    createBotServiceClient(config)
      .from('discord_fishing_expeditions')
      .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('status', 'completed')
      .order('settled_at', { ascending: false })
      .limit(1)
      .returns<FishingExpeditionRow[]>(),
  ]);
  if (completedResult.error) throw new Error(`Unable to load recent fishing expedition: ${completedResult.error.message}`);
  return { state, active: activeResult, mostRecent: completedResult.data?.[0] ?? null };
}

export async function getFishingCatalogueProgress(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<FishingCatalogueProgress> {
  const [state, catchesResult] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    createBotServiceClient(config)
      .from('discord_fishing_catalogue_catches')
      .select('biome_id,fish_name,fish_rarity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .returns<FishingCatalogueCatchRow[]>(),
  ]);
  if (catchesResult.error) throw new Error(`Unable to load fishing catalogue progress: ${catchesResult.error.message}`);

  return {
    caughtFish: (catchesResult.data ?? [])
      .filter((entry): entry is FishingCatalogueCatchRow & { biome_id: FishingBiomeId } => Boolean(getFishingBiome(entry.biome_id)))
      .map((entry) => ({
        biomeId: entry.biome_id,
        name: entry.fish_name,
        rarity: entry.fish_rarity,
      })),
    ownedGearItemIds: new Set(
      state.inventory
        .map((entry) => getFishingUpgrade(entry.item_id))
        .filter((item): item is FishingUpgrade => item?.category === 'gear')
        .map((item) => item.id),
    ),
  };
}

export async function getFishingEventCatalogueProgress(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<FishingEventCatalogueProgress> {
  const activeEvent = FISHING_EVENTS[0];
  if (!activeEvent) return { caughtFish: [], ownedTitleItemIds: new Set() };
  const [state, catchesResult] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    createBotServiceClient(config)
      .from('discord_fishing_catalogue_catches')
      .select('biome_id,fish_name,fish_rarity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('biome_id', activeEvent.catalogueBiomeId)
      .returns<FishingCatalogueCatchRow[]>(),
  ]);
  if (catchesResult.error) throw new Error(`Unable to load fishing event catalogue progress: ${catchesResult.error.message}`);

  return {
    caughtFish: (catchesResult.data ?? []).map((entry) => ({ name: entry.fish_name, rarity: entry.fish_rarity })),
    ownedTitleItemIds: new Set(state.inventory
      .map((entry) => entry.item_id)
      .filter((itemId) => activeEvent.title.itemId === itemId)),
  };
}

export function isFishingFishCaught(progress: FishingCatalogueProgress, fish: Pick<FishingFish, 'biomeId' | 'name' | 'rarity'>) {
  return progress.caughtFish.some((caughtFish) => (
    caughtFish.biomeId === fish.biomeId
    && caughtFish.name === fish.name
    && caughtFish.rarity === fish.rarity
  ));
}

export async function purchaseFishingUpgrade(config: DiscordBotConfig, discordUserId: string, itemId: string): Promise<FishingShopPurchase> {
  const upgrade = getFishingUpgrade(itemId);
  if (!upgrade || upgrade.cost <= 0 || upgrade.category === 'skill') throw new Error('That fishing shop item is unavailable.');
  const state = await getFishingPlayerState(config, discordUserId);
  const ownedItemIds = [...state.inventory.map((item) => item.item_id), ...state.playerItemIds];
  if (upgrade.requiredUpgradeId && !ownedItemIds.includes(upgrade.requiredUpgradeId)) {
    const requiredUpgrade = getFishingUpgrade(upgrade.requiredUpgradeId);
    throw new Error(`This upgrade requires ${requiredUpgrade?.name ?? 'the previous level'} first.`);
  }
  const cost = getFishingUpgradeCost(upgrade, ownedItemIds);
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_fishing_upgrade', {
    p_category: upgrade.category,
    p_cost: cost,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_item_id: upgrade.id,
    p_required_fishing_level: upgrade.requiredFishingLevel ?? 0,
  });
  if (error) throw new Error(`Unable to purchase fishing upgrade: ${error.message}`);
  const purchase = getFirstResult(data as PurchaseUpgradeRow | PurchaseUpgradeRow[] | null);
  if (!purchase) throw new Error('Fishing shop purchase did not return a result.');
  return { balance: purchase.current_balance, cost, crewSlots: purchase.crew_slots, upgrade };
}

export async function equipFishingUpgrade(config: DiscordBotConfig, discordUserId: string, itemId: string) {
  const upgrade = getFishingUpgrade(itemId);
  if (!upgrade || !['rod', 'bait'].includes(upgrade.category)) throw new Error('Only owned rods and bait can be equipped.');
  const { error } = await createBotServiceClient(config).rpc('equip_discord_fishing_upgrade', {
    p_category: upgrade.category,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_item_id: upgrade.id,
  });
  if (error) throw new Error(`Unable to equip fishing upgrade: ${error.message}`);
  return upgrade;
}

const FISHING_CRATE_RARITY_MARKERS: Record<FishingCrateRarity, string> = {
  Common: '⬜',
  Uncommon: '🟩',
  Rare: '🟦',
  Epic: '🟪',
  Legendary: '🟨',
};

function formatCatch(catchItem: FishingExpeditionResult['catches'][number]) {
  const quantity = catchItem.quantity > 1 ? ` x${formatNumber(catchItem.quantity)}` : '';
  if (catchItem.kind === 'fish') {
    if (catchItem.nonSellable) {
      return `🌌 **${catchItem.name}** (${catchItem.rarity})${quantity} — added to your inventory`;
    }
    return `**${catchItem.name}** (${catchItem.rarity})${quantity} — sold for ${formatNumber(catchItem.saleValue)} KnowBucks`;
  }
  if (catchItem.kind === 'crate') {
    return `${FISHING_CRATE_RARITY_MARKERS[catchItem.rarity]} **${catchItem.name}** -> **${catchItem.lootName}** (${catchItem.lootRarity})${quantity} — sold for ${formatNumber(catchItem.saleValue)} KnowBucks`;
  }
  if (catchItem.kind === 'gear') {
    return `✨ **RELIC FOUND: ${catchItem.name}** — permanently added to inventory`;
  }
  return `🏷️ **TITLE FOUND: ${catchItem.name}** — permanently added to your titles`;
}

function buildFishingCatchFields(name: string, catches: FishingExpeditionResult['catches']) {
  const values: string[] = [];
  let currentValue = '';
  for (const catchItem of catches) {
    const line = formatCatch(catchItem);
    const nextValue = currentValue ? `${currentValue}\n${line}` : line;
    if (nextValue.length > 1_024 && currentValue) {
      values.push(currentValue);
      currentValue = line;
    } else {
      currentValue = nextValue;
    }
  }
  if (currentValue) values.push(currentValue);
  return values.map((value, index) => ({ name: index === 0 ? name : `${name} (continued)`, value }));
}

export function buildFishingCompletionEmbed(
  biomeId: FishingBiomeId,
  result: FishingExpeditionResult,
  reward: number,
  balance: number,
  fishingSkillAward?: FishingSettlementSkillAward,
  eventId?: string,
) {
  const biome = getFishingBiome(biomeId);
  const event = getFishingEvent(eventId);
  const fishingSkillField = fishingSkillAward && fishingSkillAward.xpAwarded > 0
    ? [{
      name: '⬆️ Fishing skill',
      value: `+${formatNumber(fishingSkillAward.xpAwarded)} Fishing XP · Level **${fishingSkillAward.currentLevel}**${fishingSkillAward.currentLevel > fishingSkillAward.previousLevel
        ? ` · Level rewards: **${formatNumber(fishingSkillAward.knowBucksAwarded)} KnowBucks**`
        : ''}`,
    }]
    : [];
  return new EmbedBuilder()
    .setColor(0x0EA5E9)
    .setTitle(`✅ ${event?.biomeName ?? biome?.name ?? 'Fishing'} expedition complete ✅`)
    .setDescription(result.crateSaleValue > 0
      ? `You earned ${formatNumber(result.fishSaleValue)} KnowBucks from your sold fish. Crate items earned ${formatNumber(result.crateSaleValue)} KnowBucks. New balance: ${formatNumber(balance)} KnowBucks.`
      : `You earned ${formatNumber(reward)} KnowBucks from your sold fish. New balance: ${formatNumber(balance)} KnowBucks.`)
    .addFields(
      ...fishingSkillField,
      ...buildFishingCatchFields('🐟 Fish caught', result.catches.filter((catchItem) => catchItem.kind === 'fish')),
      ...buildFishingCatchFields('🎁 Crates found', result.catches.filter((catchItem) => catchItem.kind === 'crate')),
      ...buildFishingCatchFields('💎 Relics found', result.catches.filter((catchItem) => catchItem.kind === 'gear')),
      ...buildFishingCatchFields('🏷️ Title found', result.catches.filter((catchItem) => catchItem.kind === 'title')),
    );
}

function buildFishingCompletionComponents(preset: FishingRepeatPreset) {
  return [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(buildFishingRepeatCustomId(preset))
        .setStyle(ButtonStyle.Primary)
        .setLabel('Fish again'),
    ],
  }];
}

async function reconcileFishingRolesAfterSettlement(
  config: DiscordBotConfig,
  guild: Guild,
  settled: SettledExpeditionRow,
) {
  if (settled.discord_user_id && settled.fishing_current_level !== null) {
    const member = await guild.members.fetch(settled.discord_user_id).catch(() => null);
    if (member && !member.user.bot) {
      await grantEligibleFishingLevelRoles(config, member, settled.fishing_current_level);
    }
  }
  await syncDiscordFishingTopRole(config, guild);
}

async function launchGenesysLoopFollowUp(
  config: DiscordBotConfig,
  guild: Guild,
  expedition: FishingExpeditionRow,
  equipment: FishingEquipmentSnapshot,
  notificationChannel: SendableChannels,
) {
  const previousAutoLaunches = equipment.modifiers?.genesysLoopCount ?? 0;
  if (!equipment.passiveItemIds.includes('gear-genesys-loop') || previousAutoLaunches >= 2) return;

  try {
    const member = await guild.members.fetch(expedition.discord_user_id);
    if (member.user.bot) return;
    const launched = await startFishingExpedition(
      config,
      expedition.discord_user_id,
      expedition.biome_id,
      expedition.duration_tier,
      expedition.notification_channel_id,
      expedition.crew_slot,
      [...member.roles.cache.keys()],
      { genesysLoopCount: previousAutoLaunches + 1 },
    );
    const launchMessage = await notificationChannel.send({
      allowedMentions: { users: [expedition.discord_user_id] },
      content: `<@${expedition.discord_user_id}> **Genesys Loop** launched another ${launched.biomeName} expedition. ${launched.instantCompletion
        ? 'This trip completed immediately.'
        : `This trip takes about **${formatFishingDuration(launched.durationSeconds)}**.`}`,
    });
    await attachFishingExpeditionMessage(config, expedition.discord_user_id, launched.expeditionId, launchMessage.id);
  } catch (error) {
    console.warn(`Discord fishing expedition ${expedition.id} could not start its Genesys Loop follow-up.`, error);
  }
}

async function announceFishingEventMilestones(
  channel: SendableChannels,
  discordUserId: string,
  result: FishingExpeditionResult,
  equipment: FishingEquipmentSnapshot,
  awardedGearItemIds: ReadonlySet<string>,
) {
  const event = getFishingEvent(equipment.eventId);
  if (!event) return;

  const mythicCatch = result.catches.find((catchItem) => catchItem.kind === 'fish' && catchItem.nonSellable);
  if (mythicCatch?.kind === 'fish') {
    await channel.send({
      allowedMentions: { users: [discordUserId] },
      content: `🌌 <@${discordUserId}> uncovered **${mythicCatch.name}**, the Mythic catch of the **${event.biomeName}**. It has been added to their inventory!`,
    });
  }
  if (awardedGearItemIds.has(event.title.itemId)) {
    await channel.send({
      allowedMentions: { users: [discordUserId] },
      content: `🏷️ <@${discordUserId}> earned the **${event.title.name}** title!`,
    });
  }
}

async function settleFishingExpedition(config: DiscordBotConfig, guild: Guild, expedition: FishingExpeditionRow) {
  const equipment = normalizeEquipmentSnapshot(expedition.equipment_snapshot);
  const result = resolveFishingExpedition(
    expedition.biome_id,
    expedition.duration_tier,
    equipment,
    expedition.outcome_seed,
    expedition.crew_slot > 1,
  );
  const reward = result.fishSaleValue + result.crateSaleValue + result.knowBucksFound;
  const { data, error } = await createBotServiceClient(config).rpc('settle_discord_fishing_expedition', {
    p_expedition_id: expedition.id,
    p_fishing_level_knowbucks_multiplier_basis_points: Math.round(getFishingKnowBucksMultiplier(equipment.modifiers) * 10_000),
    p_knowbucks_awarded: reward,
    p_result: result,
    p_special_items: [...(result.gearItems ?? []), ...(result.specialItems ?? [])],
  });
  if (error) throw new Error(`Unable to settle Discord fishing expedition: ${error.message}`);
  const settled = getFirstResult(data as SettledExpeditionRow | SettledExpeditionRow[] | null);
  if (!settled?.settled || !settled.discord_user_id || !settled.notification_channel_id || !settled.result) return;

  void reconcileFishingRolesAfterSettlement(config, guild, settled)
    .catch((roleError: unknown) => console.error(`Discord fishing expedition ${expedition.id} role reconciliation failed.`, roleError));

  const channel = await guild.channels.fetch(settled.notification_channel_id).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.error(`Discord fishing expedition ${expedition.id} completed, but its notification channel is unavailable.`);
    return;
  }

  const awardedGearItemIds = new Set(settled.awarded_gear_item_ids ?? []);
  const displayedResult: FishingExpeditionResult = {
    ...settled.result,
    catches: settled.result.catches.filter((catchItem) => (
      (catchItem.kind !== 'gear' && catchItem.kind !== 'title') || awardedGearItemIds.has(catchItem.itemId)
    )),
    gearItems: (settled.result.gearItems ?? []).filter((gear) => awardedGearItemIds.has(gear.itemId)),
  };
  const fishingSkillAward = settled.fishing_current_level === null
    || settled.fishing_previous_level === null
    || settled.fishing_total_xp === null
    ? undefined
    : {
      currentLevel: settled.fishing_current_level,
      knowBucksAwarded: settled.fishing_knowbucks_awarded,
      previousLevel: settled.fishing_previous_level,
      totalXp: settled.fishing_total_xp,
      xpAwarded: settled.fishing_xp_awarded,
    };
  const completion = {
    allowedMentions: { parse: [] as const },
    components: buildFishingCompletionComponents({
      biomeId: expedition.biome_id,
      crewSlot: expedition.crew_slot,
      durationTier: expedition.duration_tier,
      ownerDiscordUserId: settled.discord_user_id,
    }),
    content: `<@${settled.discord_user_id}> your fishing expedition is complete!`,
    embeds: [buildFishingCompletionEmbed(
      expedition.biome_id,
      displayedResult,
      settled.knowbucks_awarded,
      settled.current_balance ?? settled.knowbucks_awarded,
      fishingSkillAward,
      equipment.eventId,
    )],
  };

  if (expedition.notification_message_id) {
    try {
      const message = await channel.messages.fetch(expedition.notification_message_id);
      await message.edit(completion);
      await announceFishingEventMilestones(channel, settled.discord_user_id, settled.result, equipment, awardedGearItemIds)
        .catch((announcementError: unknown) => console.warn(`Discord fishing expedition ${expedition.id} event announcement failed.`, announcementError));
      await launchGenesysLoopFollowUp(config, guild, expedition, equipment, channel);
      return;
    } catch (error) {
      console.warn(`Discord fishing expedition ${expedition.id} could not update its launch message; sending a completion notice instead.`, error);
    }
  }

  await channel.send({
    allowedMentions: { users: [settled.discord_user_id] },
    components: buildFishingCompletionComponents({
      biomeId: expedition.biome_id,
      crewSlot: expedition.crew_slot,
      durationTier: expedition.duration_tier,
      ownerDiscordUserId: settled.discord_user_id,
    }),
    content: `<@${settled.discord_user_id}> your fishing expedition is complete!`,
    embeds: [buildFishingCompletionEmbed(
      expedition.biome_id,
      displayedResult,
      settled.knowbucks_awarded,
      settled.current_balance ?? settled.knowbucks_awarded,
      fishingSkillAward,
      equipment.eventId,
    )],
  });
  await announceFishingEventMilestones(channel, settled.discord_user_id, settled.result, equipment, awardedGearItemIds)
    .catch((announcementError: unknown) => console.warn(`Discord fishing expedition ${expedition.id} event announcement failed.`, announcementError));
  await launchGenesysLoopFollowUp(config, guild, expedition, equipment, channel);
}

async function settleDueFishingExpeditions(config: DiscordBotConfig, guild: Guild) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_fishing_expeditions')
    .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
    .eq('guild_id', config.guildId)
    .eq('status', 'active')
    .lte('completes_at', new Date().toISOString())
    .order('completes_at', { ascending: true })
    .limit(25)
    .returns<FishingExpeditionRow[]>();
  if (error) throw new Error(`Unable to find completed Discord fishing expeditions: ${error.message}`);
  for (const expedition of data ?? []) {
    try {
      await settleFishingExpedition(config, guild, expedition);
    } catch (error) {
      console.error(`Discord fishing expedition ${expedition.id} settlement failed.`, error);
    }
  }
}

export async function reconcileDueFishingExpeditions(config: DiscordBotConfig, guild: Guild) {
  if (settlementInFlight) return settlementInFlight;
  const run = settleDueFishingExpeditions(config, guild);
  settlementInFlight = run;
  try {
    await run;
  } finally {
    if (settlementInFlight === run) settlementInFlight = null;
  }
}

export function startDiscordFishingScheduler(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId || scheduler) return;
  const tick = () => {
    void reconcileDueFishingExpeditions(config, guild)
      .catch((error: unknown) => console.error('Discord fishing expedition reconciliation failed.', error));
    void maybeSyncDiscordFishingTopRole(config, guild)
      .catch((error: unknown) => console.error('Discord Fishing top-role synchronization failed.', error));
  };
  tick();
  scheduler = setInterval(tick, FISHING_SCHEDULER_INTERVAL_MS);
  scheduler.unref();
}

export function getFishingShopItems(category: FishingUpgradeCategory) {
  return FISHING_UPGRADES.filter((upgrade) => upgrade.category === category && upgrade.cost > 0);
}

/** Skills are a sequence per track; the shop only exposes the next unowned tier. */
export function getVisibleFishingShopItems(category: FishingUpgradeCategory, ownedItemIds: readonly string[]) {
  const items = getFishingShopItems(category);
  if (category !== 'skill') return items;

  const owned = new Set(ownedItemIds);
  return items.filter((item) => !owned.has(item.id) && (!item.requiredUpgradeId || owned.has(item.requiredUpgradeId)));
}

export function describeFishingEquipment(equipment: FishingEquipmentSnapshot) {
  const display = (itemId: string) => getFishingUpgrade(itemId)?.name ?? itemId;
  return {
    bait: display(equipment.baitItemId),
    relics: equipment.passiveItemIds.length > 0 ? equipment.passiveItemIds.map(display).join(', ') : 'None',
    rod: display(equipment.rodItemId),
  };
}

/** A compact result summary shared by progress panels after automatic settlement. */
export function summarizeFishingSettlement(result: FishingExpeditionResult) {
  const count = (kind: FishingExpeditionResult['catches'][number]['kind']) => result.catches
    .filter((catchItem) => catchItem.kind === kind)
    .reduce((total, catchItem) => total + catchItem.quantity, 0);
  const fish = count('fish');
  const crates = count('crate');
  const relics = count('gear');
  const titles = count('title');
  const parts = [
    fish ? `${formatNumber(fish)} fish` : null,
    crates ? `${formatNumber(crates)} automatic crate reward${crates === 1 ? '' : 's'}` : null,
    relics ? `${formatNumber(relics)} new Relic${relics === 1 ? '' : 's'}` : null,
    titles ? `${formatNumber(titles)} new title${titles === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : 'No catches recorded';
}

export { FISHING_BIOMES, FISHING_CRATES, FISHING_CRATE_LOOT, FISHING_EVENTS, FISHING_EXPEDITION_LENGTHS, FISHING_FISH, FISHING_UPGRADES, formatFishingDuration, getFishingBiome, getFishingCrate, getFishingEvent, getFishingExpeditionLength, getFishingUpgrade, getFishingUpgradeCost };
export type { FishingBiomeId, FishingDurationTier, FishingUpgradeCategory };
