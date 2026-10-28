import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  DEFAULT_DISCORD_LEVELING_SETTINGS,
  DISCORD_LEVELING_LEVEL_UP_MESSAGE_TEMPLATE_MAX_LENGTH,
  type DiscordGuildRole,
  type DiscordLevelingRoleReward,
  type DiscordLevelingSettings,
} from '@/lib/discord-leveling';
import {
  DEFAULT_DISCORD_GENERAL_SETTINGS,
  type DiscordGeneralSettings,
} from '@/lib/discord-general-settings';
import {
  DEFAULT_DISCORD_SKIN_CLAIM_RARITY_WEIGHTS,
  DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES,
  DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS,
  DISCORD_SKIN_CLAIM_RARITIES,
  type DiscordGuildChannel,
  type DiscordSkinClaimRarity,
  type DiscordSkinClaimRarityWeight,
  type DiscordSkinClaimSellValue,
  type DiscordSkinClaimSettings,
} from '@/lib/discord-skin-claims';
import {
  DEFAULT_DISCORD_FISHING_BONUS_SETTINGS,
  DEFAULT_DISCORD_FISHING_COMMAND_SETTINGS,
  DEFAULT_DISCORD_FISHING_ROLE_SETTINGS,
  DISCORD_FISHING_WEEKDAY_PHENOMENA,
  type DiscordFishingBonusSettings,
  type DiscordFishingCommandSettings,
  type DiscordFishingLevelRoleReward,
  type DiscordFishingRoleSettings,
  type DiscordFishingWeekdayPhenomenon,
  type DiscordFishingWeekdayPhenomenonId,
} from '@/lib/discord-fishing';
import { requireAdminAccess } from '@/lib/moderation';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type StoredSettingsRow = {
  cooldown_seconds: number;
  enabled: boolean;
  leaderboard_top_role_id: string | null;
  level_up_message_enabled: boolean;
  level_up_message_channel_id: string | null;
  level_up_message_template: string;
  xp_per_message: number;
};

type StoredRoleRow = {
  assignable: boolean;
  position: number;
  role_id: string;
  role_name: string;
};

type StoredRewardRoleRow = {
  discord_role_id: string;
  level: number;
};

type StoredRewardMessageRow = {
  level: number;
  message_template: string;
};

type StoredStaffRoleRow = {
  discord_role_id: string;
};

type StoredSkinClaimAdminRoleRow = {
  discord_role_id: string;
};

type StoredLeaderboardExcludedRoleRow = {
  discord_role_id: string;
};

type StoredGuildChannelRow = {
  channel_id: string;
  channel_name: string;
  position: number;
  sendable: boolean;
};

type StoredGeneralCommandChannelRow = {
  channel_id: string;
};

type StoredSkinClaimSettingsRow = {
  all_channels: boolean;
  claim_window_minutes: number;
  enabled: boolean;
  maximum_interval_minutes: number;
  minimum_interval_minutes: number;
};

type StoredSkinClaimEconomySettingsRow = {
  claim_grace_period_seconds: number;
  collection_capacity_upgrade_cost: number;
  collection_steal_chance_percent: number;
  default_collection_capacity: number;
  summon_base_cost: number;
};

type StoredSkinClaimChannelRow = {
  channel_id: string;
};

type StoredSkinClaimCommandChannelRow = {
  channel_id: string;
};

type StoredSkinClaimRarityWeightRow = {
  rarity: DiscordSkinClaimRarity;
  weight: number;
};

type StoredSkinClaimSellValueRow = {
  amount: number;
  rarity: DiscordSkinClaimRarity;
};

type StoredFishingCommandSettingsRow = {
  command_all_channels: boolean;
  top_fisher_role_id: string | null;
};

type StoredFishingCommandChannelRow = {
  channel_id: string;
};

type StoredFishingRoleRewardRow = {
  discord_role_id: string;
  level: number;
};

type StoredFishingBonusRoleRow = {
  discord_role_id: string;
};

type StoredFishingWeekdayPhenomenonRow = {
  phenomenon: DiscordFishingWeekdayPhenomenonId;
  weekday: number;
};

type StoredChannelRow = {
  channel_id: string;
};

type StoredMiningCommandSettingsRow = {
  command_all_channels: boolean;
};

type LevelingSettingsBody = {
  collectionAdminRoleIds?: unknown;
  cooldownSeconds?: unknown;
  generalCommandChannelIds?: unknown;
  enabled?: unknown;
  leaderboardExcludedRoleIds?: unknown;
  leaderboardTopRoleId?: unknown;
  levelUpMessageEnabled?: unknown;
  levelUpMessageChannelId?: unknown;
  levelUpMessageTemplate?: unknown;
  manualXpRoleIds?: unknown;
  miningCommandAllChannels?: unknown;
  miningCommandChannelIds?: unknown;
  miningWebsitePanelChannelIds?: unknown;
  roleRewards?: unknown;
  skinClaimAllChannels?: unknown;
  skinClaimClaimGracePeriodSeconds?: unknown;
  skinClaimChannelIds?: unknown;
  skinClaimClaimWindowMinutes?: unknown;
  skinClaimCommandChannelIds?: unknown;
  skinClaimCollectionCapacityUpgradeCost?: unknown;
  skinClaimCollectionStealChancePercent?: unknown;
  skinClaimDefaultCollectionCapacity?: unknown;
  skinClaimEnabled?: unknown;
  skinClaimMaximumIntervalMinutes?: unknown;
  skinClaimMinimumIntervalMinutes?: unknown;
  skinClaimRarityWeights?: unknown;
  skinClaimSellValues?: unknown;
  skinClaimSummonBaseCost?: unknown;
  skindleShareChannelIds?: unknown;
  fishingCommandAllChannels?: unknown;
  fishingCommandChannelIds?: unknown;
  fishingBonusRoleIds?: unknown;
  fishingRoleRewards?: unknown;
  fishingTopFisherRoleId?: unknown;
  fishingWeekdayPhenomena?: unknown;
  xpPerMessage?: unknown;
};

function getDiscordGuildId() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(guildId)) {
    throw new ApiError(503, 'Discord server configuration is unavailable.');
  }
  return guildId;
}

function toSettings(row: StoredSettingsRow | null): DiscordLevelingSettings {
  return row ? {
    cooldownSeconds: row.cooldown_seconds,
    enabled: row.enabled,
    leaderboardTopRoleId: row.leaderboard_top_role_id,
    levelUpMessageEnabled: row.level_up_message_enabled,
    levelUpMessageChannelId: row.level_up_message_channel_id,
    levelUpMessageTemplate: row.level_up_message_template,
    xpPerMessage: row.xp_per_message,
  } : DEFAULT_DISCORD_LEVELING_SETTINGS;
}

function toGuildRole(row: StoredRoleRow): DiscordGuildRole {
  return { assignable: row.assignable, id: row.role_id, name: row.role_name, position: row.position };
}

function toGuildChannel(row: StoredGuildChannelRow): DiscordGuildChannel {
  return { id: row.channel_id, name: row.channel_name, position: row.position, sendable: row.sendable };
}

function toGeneralSettings(rows: StoredGeneralCommandChannelRow[]): DiscordGeneralSettings {
  return rows.length ? { commandChannelIds: rows.map((row) => row.channel_id) } : DEFAULT_DISCORD_GENERAL_SETTINGS;
}

function toSkinClaimSettings(
  row: StoredSkinClaimSettingsRow | null,
  economy: StoredSkinClaimEconomySettingsRow | null,
): DiscordSkinClaimSettings {
  return row ? {
    allChannels: row.all_channels,
    claimWindowMinutes: row.claim_window_minutes,
    claimGracePeriodSeconds: economy?.claim_grace_period_seconds ?? DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.claimGracePeriodSeconds,
    collectionCapacityUpgradeCost: economy?.collection_capacity_upgrade_cost ?? DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.collectionCapacityUpgradeCost,
    collectionStealChancePercent: economy?.collection_steal_chance_percent ?? DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.collectionStealChancePercent,
    defaultCollectionCapacity: economy?.default_collection_capacity ?? DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.defaultCollectionCapacity,
    enabled: row.enabled,
    maximumIntervalMinutes: row.maximum_interval_minutes,
    minimumIntervalMinutes: row.minimum_interval_minutes,
    summonBaseCost: economy?.summon_base_cost ?? DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.summonBaseCost,
  } : DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS;
}

function toFishingCommandSettings(row: StoredFishingCommandSettingsRow | null): DiscordFishingCommandSettings {
  return row ? { allChannels: row.command_all_channels } : DEFAULT_DISCORD_FISHING_COMMAND_SETTINGS;
}

function toFishingRoleSettings(row: StoredFishingCommandSettingsRow | null): DiscordFishingRoleSettings {
  return row ? { topFisherRoleId: row.top_fisher_role_id } : DEFAULT_DISCORD_FISHING_ROLE_SETTINGS;
}

function toFishingBonusSettings(
  roles: StoredFishingBonusRoleRow[],
  phenomena: StoredFishingWeekdayPhenomenonRow[],
): DiscordFishingBonusSettings {
  if (roles.length === 0 && phenomena.length === 0) return DEFAULT_DISCORD_FISHING_BONUS_SETTINGS;
  const weekdaysByPhenomenon = new Map<DiscordFishingWeekdayPhenomenonId, number[]>();
  for (const phenomenon of phenomena) {
    weekdaysByPhenomenon.set(phenomenon.phenomenon, [
      ...(weekdaysByPhenomenon.get(phenomenon.phenomenon) ?? []),
      phenomenon.weekday,
    ]);
  }
  return {
    bonusRoleIds: roles.map((role) => role.discord_role_id),
    weekdayPhenomena: DISCORD_FISHING_WEEKDAY_PHENOMENA.flatMap((phenomenon): DiscordFishingWeekdayPhenomenon[] => {
      const weekdays = weekdaysByPhenomenon.get(phenomenon) ?? [];
      return weekdays.length ? [{ phenomenon, weekdays: [...weekdays].sort((left, right) => left - right) }] : [];
    }),
  };
}

function normalizeSkinClaimRarityWeights(rows: StoredSkinClaimRarityWeightRow[]): DiscordSkinClaimRarityWeight[] {
  const weightByRarity = new Map(rows.map((row) => [row.rarity, row.weight]));
  return DISCORD_SKIN_CLAIM_RARITIES.map((rarity) => ({
    rarity,
    weight: weightByRarity.get(rarity) ?? DEFAULT_DISCORD_SKIN_CLAIM_RARITY_WEIGHTS.find((entry) => entry.rarity === rarity)!.weight,
  }));
}

function normalizeSkinClaimSellValues(rows: StoredSkinClaimSellValueRow[]): DiscordSkinClaimSellValue[] {
  const amountByRarity = new Map(rows.map((row) => [row.rarity, row.amount]));
  return DISCORD_SKIN_CLAIM_RARITIES.map((rarity) => ({
    amount: amountByRarity.get(rarity) ?? DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES.find((entry) => entry.rarity === rarity)!.amount,
    rarity,
  }));
}

function groupRoleRewards(rows: StoredRewardRoleRow[], messages: StoredRewardMessageRow[]) {
  const roleIdsByLevel = new Map<number, string[]>();
  for (const row of rows) {
    roleIdsByLevel.set(row.level, [...(roleIdsByLevel.get(row.level) ?? []), row.discord_role_id]);
  }
  const messageByLevel = new Map(messages.map((message) => [message.level, message.message_template]));
  return [...roleIdsByLevel.entries()]
    .map(([level, roleIds]): DiscordLevelingRoleReward => ({
      level,
      levelUpMessageTemplate: messageByLevel.get(level) ?? null,
      roleIds,
    }))
    .sort((left, right) => left.level - right.level);
}

function groupFishingRoleRewards(rows: StoredFishingRoleRewardRow[]): DiscordFishingLevelRoleReward[] {
  const roleIdsByLevel = new Map<number, string[]>();
  for (const row of rows) {
    roleIdsByLevel.set(row.level, [...(roleIdsByLevel.get(row.level) ?? []), row.discord_role_id]);
  }
  return [...roleIdsByLevel.entries()]
    .map(([level, roleIds]) => ({ level, roleIds }))
    .sort((left, right) => left.level - right.level);
}

async function getLevelingData(guildId: string) {
  const supabase = getSupabaseServiceClient();
  const [
    settingsResult,
    rolesResult,
    rewardRolesResult,
    rewardMessagesResult,
    staffRolesResult,
    skinClaimAdminRolesResult,
    leaderboardExcludedRolesResult,
    channelsResult,
    generalCommandChannelsResult,
    skinClaimSettingsResult,
    skinClaimChannelsResult,
    skinClaimCommandChannelsResult,
    skinClaimRarityWeightsResult,
    skinClaimEconomySettingsResult,
    skinClaimSellValuesResult,
    fishingCommandSettingsResult,
    fishingCommandChannelsResult,
    fishingRoleRewardsResult,
    fishingBonusRolesResult,
    fishingWeekdayPhenomenaResult,
    skindleShareChannelsResult,
    miningCommandSettingsResult,
    miningCommandChannelsResult,
    miningWebsitePanelChannelsResult,
  ] = await Promise.all([
    supabase.from('discord_leveling_settings')
      .select('enabled, xp_per_message, cooldown_seconds, level_up_message_enabled, level_up_message_channel_id, level_up_message_template, leaderboard_top_role_id')
      .eq('guild_id', guildId)
      .maybeSingle<StoredSettingsRow>(),
    supabase.from('discord_guild_roles')
      .select('role_id, role_name, position, assignable')
      .eq('guild_id', guildId)
      .order('position', { ascending: false })
      .order('role_name', { ascending: true })
      .returns<StoredRoleRow[]>(),
    supabase.from('discord_leveling_role_rewards')
      .select('discord_role_id, level')
      .eq('guild_id', guildId)
      .order('level', { ascending: true })
      .order('discord_role_id', { ascending: true })
      .returns<StoredRewardRoleRow[]>(),
    supabase.from('discord_leveling_reward_level_messages')
      .select('level, message_template')
      .eq('guild_id', guildId)
      .returns<StoredRewardMessageRow[]>(),
    supabase.from('discord_leveling_staff_roles')
      .select('discord_role_id')
      .eq('guild_id', guildId)
      .order('discord_role_id', { ascending: true })
      .returns<StoredStaffRoleRow[]>(),
    supabase.from('discord_skin_claim_admin_roles')
      .select('discord_role_id')
      .eq('guild_id', guildId)
      .order('discord_role_id', { ascending: true })
      .returns<StoredSkinClaimAdminRoleRow[]>(),
    supabase.from('discord_leveling_leaderboard_excluded_roles')
      .select('discord_role_id')
      .eq('guild_id', guildId)
      .order('discord_role_id', { ascending: true })
      .returns<StoredLeaderboardExcludedRoleRow[]>(),
    supabase.from('discord_guild_text_channels')
      .select('channel_id, channel_name, position, sendable')
      .eq('guild_id', guildId)
      .order('position', { ascending: true })
      .order('channel_name', { ascending: true })
      .returns<StoredGuildChannelRow[]>(),
    supabase.from('discord_general_command_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredGeneralCommandChannelRow[]>(),
    supabase.from('discord_skin_claim_settings')
      .select('enabled, minimum_interval_minutes, maximum_interval_minutes, claim_window_minutes, all_channels')
      .eq('guild_id', guildId)
      .maybeSingle<StoredSkinClaimSettingsRow>(),
    supabase.from('discord_skin_claim_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredSkinClaimChannelRow[]>(),
    supabase.from('discord_skin_claim_command_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredSkinClaimCommandChannelRow[]>(),
    supabase.from('discord_skin_claim_rarity_weights')
      .select('rarity, weight')
      .eq('guild_id', guildId)
      .returns<StoredSkinClaimRarityWeightRow[]>(),
    supabase.from('discord_skin_claim_economy_settings')
      .select('summon_base_cost, default_collection_capacity, collection_capacity_upgrade_cost, collection_steal_chance_percent, claim_grace_period_seconds')
      .eq('guild_id', guildId)
      .maybeSingle<StoredSkinClaimEconomySettingsRow>(),
    supabase.from('discord_skin_claim_sell_values')
      .select('rarity, amount')
      .eq('guild_id', guildId)
      .returns<StoredSkinClaimSellValueRow[]>(),
    supabase.from('discord_fishing_settings')
      .select('command_all_channels,top_fisher_role_id')
      .eq('guild_id', guildId)
      .maybeSingle<StoredFishingCommandSettingsRow>(),
    supabase.from('discord_fishing_command_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredFishingCommandChannelRow[]>(),
    supabase.from('discord_fishing_level_role_rewards')
      .select('discord_role_id,level')
      .eq('guild_id', guildId)
      .order('level', { ascending: true })
      .order('discord_role_id', { ascending: true })
      .returns<StoredFishingRoleRewardRow[]>(),
    supabase.from('discord_fishing_bonus_roles')
      .select('discord_role_id')
      .eq('guild_id', guildId)
      .order('discord_role_id', { ascending: true })
      .returns<StoredFishingBonusRoleRow[]>(),
    supabase.from('discord_fishing_weekday_phenomena')
      .select('phenomenon,weekday')
      .eq('guild_id', guildId)
      .order('phenomenon', { ascending: true })
      .order('weekday', { ascending: true })
      .returns<StoredFishingWeekdayPhenomenonRow[]>(),
    supabase.from('discord_skindle_share_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredChannelRow[]>(),
    supabase.from('discord_mining_command_settings')
      .select('command_all_channels')
      .eq('guild_id', guildId)
      .maybeSingle<StoredMiningCommandSettingsRow>(),
    supabase.from('discord_mining_command_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredChannelRow[]>(),
    supabase.from('discord_mining_website_panel_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .order('channel_id', { ascending: true })
      .returns<StoredChannelRow[]>(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (rewardRolesResult.error) throw rewardRolesResult.error;
  if (rewardMessagesResult.error) throw rewardMessagesResult.error;
  if (staffRolesResult.error) throw staffRolesResult.error;
  if (skinClaimAdminRolesResult.error) throw skinClaimAdminRolesResult.error;
  if (leaderboardExcludedRolesResult.error) throw leaderboardExcludedRolesResult.error;
  if (channelsResult.error) throw channelsResult.error;
  if (generalCommandChannelsResult.error) throw generalCommandChannelsResult.error;
  if (skinClaimSettingsResult.error) throw skinClaimSettingsResult.error;
  if (skinClaimChannelsResult.error) throw skinClaimChannelsResult.error;
  if (skinClaimCommandChannelsResult.error) throw skinClaimCommandChannelsResult.error;
  if (skinClaimRarityWeightsResult.error) throw skinClaimRarityWeightsResult.error;
  if (skinClaimEconomySettingsResult.error) throw skinClaimEconomySettingsResult.error;
  if (skinClaimSellValuesResult.error) throw skinClaimSellValuesResult.error;
  if (fishingCommandSettingsResult.error) throw fishingCommandSettingsResult.error;
  if (fishingCommandChannelsResult.error) throw fishingCommandChannelsResult.error;
  if (fishingRoleRewardsResult.error) throw fishingRoleRewardsResult.error;
  if (fishingBonusRolesResult.error) throw fishingBonusRolesResult.error;
  if (fishingWeekdayPhenomenaResult.error) throw fishingWeekdayPhenomenaResult.error;
  if (skindleShareChannelsResult.error) throw skindleShareChannelsResult.error;
  if (miningCommandSettingsResult.error) throw miningCommandSettingsResult.error;
  if (miningCommandChannelsResult.error) throw miningCommandChannelsResult.error;
  if (miningWebsitePanelChannelsResult.error) throw miningWebsitePanelChannelsResult.error;

  return {
    channels: (channelsResult.data ?? []).map(toGuildChannel),
    collectionAdminRoleIds: (skinClaimAdminRolesResult.data ?? []).map((role) => role.discord_role_id),
    generalSettings: toGeneralSettings(generalCommandChannelsResult.data ?? []),
    leaderboardExcludedRoleIds: (leaderboardExcludedRolesResult.data ?? []).map((role) => role.discord_role_id),
    manualXpRoleIds: (staffRolesResult.data ?? []).map((role) => role.discord_role_id),
    roleRewards: groupRoleRewards(rewardRolesResult.data ?? [], rewardMessagesResult.data ?? []),
    roles: (rolesResult.data ?? []).map(toGuildRole),
    settings: toSettings(settingsResult.data),
    skinClaimChannelIds: (skinClaimChannelsResult.data ?? []).map((channel) => channel.channel_id),
    skinClaimCommandChannelIds: (skinClaimCommandChannelsResult.data ?? []).map((channel) => channel.channel_id),
    skinClaimRarityWeights: normalizeSkinClaimRarityWeights(skinClaimRarityWeightsResult.data ?? []),
    skinClaimSellValues: normalizeSkinClaimSellValues(skinClaimSellValuesResult.data ?? []),
    skinClaimSettings: toSkinClaimSettings(skinClaimSettingsResult.data, skinClaimEconomySettingsResult.data),
    fishingCommandChannelIds: (fishingCommandChannelsResult.data ?? []).map((channel) => channel.channel_id),
    fishingCommandSettings: toFishingCommandSettings(fishingCommandSettingsResult.data),
    fishingRoleRewards: groupFishingRoleRewards(fishingRoleRewardsResult.data ?? []),
    fishingRoleSettings: toFishingRoleSettings(fishingCommandSettingsResult.data),
    skindleShareChannelIds: (skindleShareChannelsResult.data ?? []).map((channel) => channel.channel_id),
    miningCommandSettings: { allChannels: miningCommandSettingsResult.data?.command_all_channels ?? true },
    miningCommandChannelIds: (miningCommandChannelsResult.data ?? []).map((channel) => channel.channel_id),
    miningWebsitePanelChannelIds: (miningWebsitePanelChannelsResult.data ?? []).map((channel) => channel.channel_id),
    fishingBonusSettings: toFishingBonusSettings(
      fishingBonusRolesResult.data ?? [],
      fishingWeekdayPhenomenaResult.data ?? [],
    ),
  };
}

function parsePositiveInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ApiError(400, `${label} must be a whole number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function parseOptionalMessageTemplate(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, `${label} must be text.`);
  const template = value.trim();
  if (!template || template.length > DISCORD_LEVELING_LEVEL_UP_MESSAGE_TEMPLATE_MAX_LENGTH) {
    throw new ApiError(400, `${label} must contain between 1 and ${DISCORD_LEVELING_LEVEL_UP_MESSAGE_TEMPLATE_MAX_LENGTH} characters.`);
  }
  return template;
}

function parseOptionalSnowflake(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9]{17,20}$/.test(value)) {
    throw new ApiError(400, `${label} must be a valid Discord ID.`);
  }
  return value;
}

function parseRoleRewards(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new ApiError(400, 'Provide up to 50 reward levels.');
  }

  const seenLevels = new Set<number>();
  const seenRoleIds = new Set<string>();
  let roleCount = 0;
  return value.map((reward): DiscordLevelingRoleReward => {
    if (!reward || typeof reward !== 'object') throw new ApiError(400, 'Each reward level must be valid.');
    const { level, levelUpMessageTemplate, roleIds } = reward as { level?: unknown; levelUpMessageTemplate?: unknown; roleIds?: unknown };
    const parsedLevel = parsePositiveInteger(level, 'Reward level', 1, 10000);
    if (seenLevels.has(parsedLevel)) throw new ApiError(400, 'Each reward level can only be configured once.');
    seenLevels.add(parsedLevel);
    if (!Array.isArray(roleIds) || roleIds.length === 0) throw new ApiError(400, 'Each reward level needs at least one Discord role.');
    const parsedRoleIds = roleIds.map((roleId) => {
      if (typeof roleId !== 'string' || !/^[0-9]{17,20}$/.test(roleId)) {
        throw new ApiError(400, 'Choose a valid Discord role for every reward.');
      }
      if (seenRoleIds.has(roleId)) throw new ApiError(400, 'A Discord reward role can only be selected once.');
      seenRoleIds.add(roleId);
      return roleId;
    });
    roleCount += parsedRoleIds.length;
    if (roleCount > 50) throw new ApiError(400, 'Provide up to 50 total reward roles.');
    return {
      level: parsedLevel,
      levelUpMessageTemplate: parseOptionalMessageTemplate(levelUpMessageTemplate, 'Reward-level message'),
      roleIds: parsedRoleIds,
    };
  }).sort((left, right) => left.level - right.level);
}

function parseFishingRoleRewards(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new ApiError(400, 'Provide up to 50 Fishing reward levels.');
  }

  const seenLevels = new Set<number>();
  const seenRoleIds = new Set<string>();
  let roleCount = 0;
  return value.map((reward): DiscordFishingLevelRoleReward => {
    if (!reward || typeof reward !== 'object') throw new ApiError(400, 'Each Fishing reward level must be valid.');
    const { level, roleIds } = reward as { level?: unknown; roleIds?: unknown };
    const parsedLevel = parsePositiveInteger(level, 'Fishing reward level', 1, 10000);
    if (seenLevels.has(parsedLevel)) throw new ApiError(400, 'Each Fishing reward level can only be configured once.');
    seenLevels.add(parsedLevel);
    if (!Array.isArray(roleIds) || roleIds.length === 0) throw new ApiError(400, 'Each Fishing reward level needs at least one Discord role.');
    const parsedRoleIds = roleIds.map((roleId) => {
      if (typeof roleId !== 'string' || !/^[0-9]{17,20}$/.test(roleId)) {
        throw new ApiError(400, 'Choose a valid Discord role for every Fishing reward.');
      }
      if (seenRoleIds.has(roleId)) throw new ApiError(400, 'A Fishing reward role can only be selected once.');
      seenRoleIds.add(roleId);
      return roleId;
    });
    roleCount += parsedRoleIds.length;
    if (roleCount > 50) throw new ApiError(400, 'Provide up to 50 total Fishing reward roles.');
    return { level: parsedLevel, roleIds: parsedRoleIds };
  }).sort((left, right) => left.level - right.level);
}

function parseFishingWeekdayPhenomena(value: unknown): DiscordFishingWeekdayPhenomenon[] {
  if (!Array.isArray(value) || value.length > DISCORD_FISHING_WEEKDAY_PHENOMENA.length) {
    throw new ApiError(400, 'Provide up to five Fishing weekday phenomena.');
  }

  const seenPhenomena = new Set<DiscordFishingWeekdayPhenomenonId>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, 'Each Fishing weekday phenomenon must be valid.');
    const { phenomenon, weekdays } = entry as { phenomenon?: unknown; weekdays?: unknown };
    if (typeof phenomenon !== 'string' || !DISCORD_FISHING_WEEKDAY_PHENOMENA.includes(phenomenon as DiscordFishingWeekdayPhenomenonId)) {
      throw new ApiError(400, 'Choose a supported Fishing weekday phenomenon.');
    }
    const typedPhenomenon = phenomenon as DiscordFishingWeekdayPhenomenonId;
    if (seenPhenomena.has(typedPhenomenon)) throw new ApiError(400, 'Each Fishing weekday phenomenon can only be configured once.');
    seenPhenomena.add(typedPhenomenon);
    if (!Array.isArray(weekdays) || weekdays.length === 0 || weekdays.length > 7) {
      throw new ApiError(400, 'Choose one or more weekdays for every Fishing phenomenon.');
    }
    const parsedWeekdays = weekdays.map((weekday) => parsePositiveInteger(weekday, 'Fishing phenomenon weekday', 0, 6));
    if (new Set(parsedWeekdays).size !== parsedWeekdays.length) {
      throw new ApiError(400, 'Each Fishing phenomenon weekday can only be selected once.');
    }
    return { phenomenon: typedPhenomenon, weekdays: parsedWeekdays.sort((left, right) => left - right) };
  });
}

function parseRoleIds(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new ApiError(400, `Provide up to ${maximum} ${label}.`);
  const roleIds = value.map((roleId) => {
    if (typeof roleId !== 'string' || !/^[0-9]{17,20}$/.test(roleId)) throw new ApiError(400, `Choose a valid Discord role for every ${label}.`);
    return roleId;
  });
  if (new Set(roleIds).size !== roleIds.length) throw new ApiError(400, `Each ${label.slice(0, -1)} can only be selected once.`);
  return roleIds;
}

function parseSkinClaimChannelIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 25) {
    throw new ApiError(400, 'Provide up to 25 eligible skin-claim channels.');
  }
  const channelIds = value.map((channelId) => {
    if (typeof channelId !== 'string' || !/^[0-9]{17,20}$/.test(channelId)) {
      throw new ApiError(400, 'Choose a valid Discord channel for every skin-claim channel.');
    }
    return channelId;
  });
  if (new Set(channelIds).size !== channelIds.length) {
    throw new ApiError(400, 'Each eligible skin-claim channel can only be selected once.');
  }
  return channelIds;
}

function parseChannelIds(value: unknown, label: string, maximum = 100) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new ApiError(400, `Provide up to ${maximum} ${label} channels.`);
  }
  const channelIds = value.map((channelId) => {
    if (typeof channelId !== 'string' || !/^[0-9]{17,20}$/.test(channelId)) {
      throw new ApiError(400, `Choose a valid Discord channel for every ${label} channel.`);
    }
    return channelId;
  });
  if (new Set(channelIds).size !== channelIds.length) {
    throw new ApiError(400, `Each ${label} channel can only be selected once.`);
  }
  return channelIds;
}

function parseCommandChannelIds(value: unknown, label: string) {
  return parseChannelIds(value, `${label} command`);
}

function parseSkinClaimRarityWeights(value: unknown): DiscordSkinClaimRarityWeight[] {
  if (!Array.isArray(value) || value.length !== DISCORD_SKIN_CLAIM_RARITIES.length) {
    throw new ApiError(400, 'Provide one weight for every skin rarity.');
  }
  const weights = value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, 'Every skin rarity weight must be valid.');
    const { rarity, weight } = entry as { rarity?: unknown; weight?: unknown };
    if (typeof rarity !== 'string' || !DISCORD_SKIN_CLAIM_RARITIES.includes(rarity as DiscordSkinClaimRarity)) {
      throw new ApiError(400, 'Choose a supported skin rarity for every weight.');
    }
    return {
      rarity: rarity as DiscordSkinClaimRarity,
      weight: parsePositiveInteger(weight, `${rarity} weight`, 0, 1000),
    };
  });
  if (new Set(weights.map((entry) => entry.rarity)).size !== DISCORD_SKIN_CLAIM_RARITIES.length) {
    throw new ApiError(400, 'Provide each supported skin rarity exactly once.');
  }
  if (!weights.some((entry) => entry.weight > 0)) {
    throw new ApiError(400, 'At least one skin rarity must have a positive weight.');
  }
  return weights;
}

function parseSkinClaimSellValues(value: unknown): DiscordSkinClaimSellValue[] {
  if (!Array.isArray(value) || value.length !== DISCORD_SKIN_CLAIM_RARITIES.length) {
    throw new ApiError(400, 'Provide one sell value for every skin rarity.');
  }
  const sellValues = value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, 'Every skin sell value must be valid.');
    const { amount, rarity } = entry as { amount?: unknown; rarity?: unknown };
    if (typeof rarity !== 'string' || !DISCORD_SKIN_CLAIM_RARITIES.includes(rarity as DiscordSkinClaimRarity)) {
      throw new ApiError(400, 'Choose a supported skin rarity for every sell value.');
    }
    return {
      amount: parsePositiveInteger(amount, `${rarity} sell value`, 1, 1_000_000_000),
      rarity: rarity as DiscordSkinClaimRarity,
    };
  });
  if (new Set(sellValues.map((entry) => entry.rarity)).size !== DISCORD_SKIN_CLAIM_RARITIES.length) {
    throw new ApiError(400, 'Provide each supported skin rarity exactly once.');
  }
  return sellValues;
}

export const GET = withApiMetrics('/api/discord/leveling', async function GET(request: Request) {
  try {
    await requireAdminAccess(await getAuthenticatedUser(request));
    return NextResponse.json(await getLevelingData(getDiscordGuildId()));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PUT = withApiMetrics('/api/discord/leveling', async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireAdminAccess(user);
    const body = await readJsonBody<LevelingSettingsBody>(request);
    if (typeof body.enabled !== 'boolean' || typeof body.levelUpMessageEnabled !== 'boolean' || typeof body.skinClaimEnabled !== 'boolean') {
      throw new ApiError(400, 'Leveling, level-up message, and skin-claim states must be enabled or disabled.');
    }

    const xpPerMessage = parsePositiveInteger(body.xpPerMessage, 'XP per message', 1, 1000);
    const cooldownSeconds = parsePositiveInteger(body.cooldownSeconds, 'Cooldown', 1, 3600);
    const roleRewards = parseRoleRewards(body.roleRewards);
    const fishingRoleRewards = parseFishingRoleRewards(body.fishingRoleRewards);
    const fishingBonusRoleIds = parseRoleIds(body.fishingBonusRoleIds, 'Fishing bonus roles', 25);
    const fishingWeekdayPhenomena = parseFishingWeekdayPhenomena(body.fishingWeekdayPhenomena);
    const levelUpMessageTemplate = parseOptionalMessageTemplate(body.levelUpMessageTemplate, 'Level-up message');
    if (!levelUpMessageTemplate) throw new ApiError(400, 'Level-up messages must contain between 1 and 500 characters.');
    const levelUpMessageChannelId = parseOptionalSnowflake(body.levelUpMessageChannelId, 'Level-up channel ID');
    const leaderboardTopRoleId = parseOptionalSnowflake(body.leaderboardTopRoleId, 'Leaderboard top role');
    const manualXpRoleIds = parseRoleIds(body.manualXpRoleIds, 'manual XP staff roles', 25);
    const collectionAdminRoleIds = parseRoleIds(body.collectionAdminRoleIds, 'collection admin roles', 25);
    const leaderboardExcludedRoleIds = parseRoleIds(body.leaderboardExcludedRoleIds, 'leaderboard exclusion roles', 25);
    const skinClaimMinimumIntervalMinutes = parsePositiveInteger(body.skinClaimMinimumIntervalMinutes, 'Skin-claim minimum interval', 1, 10080);
    const skinClaimMaximumIntervalMinutes = parsePositiveInteger(body.skinClaimMaximumIntervalMinutes, 'Skin-claim maximum interval', skinClaimMinimumIntervalMinutes, 10080);
    const skinClaimClaimWindowMinutes = parsePositiveInteger(body.skinClaimClaimWindowMinutes, 'Skin-claim window', 1, 1440);
    const generalCommandChannelIds = parseCommandChannelIds(body.generalCommandChannelIds, 'General');
    const skinClaimCommandChannelIds = parseCommandChannelIds(body.skinClaimCommandChannelIds, 'Collections');
    const skinClaimSummonBaseCost = parsePositiveInteger(body.skinClaimSummonBaseCost, 'Summon base cost', 1, 1_000_000_000);
    const skinClaimDefaultCollectionCapacity = parsePositiveInteger(body.skinClaimDefaultCollectionCapacity, 'Default collection size', 1, 50);
    const skinClaimCollectionCapacityUpgradeCost = parsePositiveInteger(body.skinClaimCollectionCapacityUpgradeCost, 'Collection level-up cost', 1, 1_000_000_000);
    const skinClaimCollectionStealChancePercent = parsePositiveInteger(body.skinClaimCollectionStealChancePercent, 'Collection steal base chance', 0, 100);
    const skinClaimClaimGracePeriodSeconds = parsePositiveInteger(body.skinClaimClaimGracePeriodSeconds, 'Collection claim grace period', 0, 600);
    if (typeof body.skinClaimAllChannels !== 'boolean') {
      throw new ApiError(400, 'Skin-claim channel scope must be all channels or selected channels.');
    }
    const skinClaimAllChannels = body.skinClaimAllChannels;
    // Specific channels are deliberately ignored in all-channel mode. This lets
    // staff recover from a deleted channel or a bot-permission change that left
    // behind an obsolete saved selection while preserving the unrestricted scope.
    const skinClaimChannelIds = skinClaimAllChannels ? [] : parseSkinClaimChannelIds(body.skinClaimChannelIds);
    if (typeof body.fishingCommandAllChannels !== 'boolean') {
      throw new ApiError(400, 'Fishing command channel scope must be all channels or selected channels.');
    }
    const fishingCommandAllChannels = body.fishingCommandAllChannels;
    const fishingCommandChannelIds = parseCommandChannelIds(body.fishingCommandChannelIds, 'Fishing');
    const fishingTopFisherRoleId = parseOptionalSnowflake(body.fishingTopFisherRoleId, 'Top Fisher role');
    if (typeof body.miningCommandAllChannels !== 'boolean') {
      throw new ApiError(400, 'Mining command channel scope must be all channels or selected channels.');
    }
    const miningCommandAllChannels = body.miningCommandAllChannels;
    const miningCommandChannelIds = parseCommandChannelIds(body.miningCommandChannelIds, 'Mining');
    const skindleShareChannelIds = parseChannelIds(body.skindleShareChannelIds, 'Skindle results');
    const miningWebsitePanelChannelIds = parseChannelIds(body.miningWebsitePanelChannelIds, 'Mining website result');
    const skinClaimRarityWeights = parseSkinClaimRarityWeights(body.skinClaimRarityWeights);
    const skinClaimSellValues = parseSkinClaimSellValues(body.skinClaimSellValues);
    const guildId = getDiscordGuildId();
    const supabase = getSupabaseServiceClient();
    const { data: roles, error: rolesError } = await supabase.from('discord_guild_roles')
      .select('role_id, assignable')
      .eq('guild_id', guildId)
      .returns<Array<Pick<StoredRoleRow, 'assignable' | 'role_id'>>>();
    if (rolesError) throw rolesError;
    const { data: channels, error: channelsError } = await supabase.from('discord_guild_text_channels')
      .select('channel_id, sendable')
      .eq('guild_id', guildId)
      .returns<Array<Pick<StoredGuildChannelRow, 'channel_id' | 'sendable'>>>();
    if (channelsError) throw channelsError;

    const assignableRoleIds = new Set((roles ?? []).filter((role) => role.assignable).map((role) => role.role_id));
    if (roleRewards.some((reward) => reward.roleIds.some((roleId) => !assignableRoleIds.has(roleId)))) {
      throw new ApiError(400, 'Choose reward roles that are available below the KnowLeague bot role.');
    }
    if (fishingRoleRewards.some((reward) => reward.roleIds.some((roleId) => !assignableRoleIds.has(roleId)))) {
      throw new ApiError(400, 'Choose Fishing reward roles that are available below the KnowLeague bot role.');
    }
    const syncedRoleIds = new Set((roles ?? []).map((role) => role.role_id));
    if (manualXpRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose staff roles that are currently synced from Discord.');
    }
    if (collectionAdminRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose collection admin roles that are currently synced from Discord.');
    }
    if (leaderboardExcludedRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose leaderboard exclusion roles that are currently synced from Discord.');
    }
    if (fishingBonusRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose Fishing bonus roles that are currently synced from Discord.');
    }
    if (leaderboardTopRoleId && !assignableRoleIds.has(leaderboardTopRoleId)) {
      throw new ApiError(400, 'Choose a leaderboard top role that is available below the KnowLeague bot role.');
    }
    if (leaderboardTopRoleId && roleRewards.some((reward) => reward.roleIds.includes(leaderboardTopRoleId))) {
      throw new ApiError(400, 'The leaderboard top role cannot also be a level reward.');
    }
    if (leaderboardTopRoleId && manualXpRoleIds.includes(leaderboardTopRoleId)) {
      throw new ApiError(400, 'The leaderboard top role cannot also be a manual XP staff role.');
    }
    if (leaderboardTopRoleId && leaderboardExcludedRoleIds.includes(leaderboardTopRoleId)) {
      throw new ApiError(400, 'The leaderboard top role cannot exclude its own holders.');
    }
    if (fishingTopFisherRoleId && !assignableRoleIds.has(fishingTopFisherRoleId)) {
      throw new ApiError(400, 'Choose a top Fisher role that is available below the KnowLeague bot role.');
    }
    if (fishingTopFisherRoleId && fishingRoleRewards.some((reward) => reward.roleIds.includes(fishingTopFisherRoleId))) {
      throw new ApiError(400, 'The top Fisher role cannot also be a Fishing level reward.');
    }
    if (fishingTopFisherRoleId && roleRewards.some((reward) => reward.roleIds.includes(fishingTopFisherRoleId))) {
      throw new ApiError(400, 'The top Fisher role cannot also be a chat level reward.');
    }
    if (fishingTopFisherRoleId && (
      fishingTopFisherRoleId === leaderboardTopRoleId
      || manualXpRoleIds.includes(fishingTopFisherRoleId)
      || collectionAdminRoleIds.includes(fishingTopFisherRoleId)
    )) {
      throw new ApiError(400, 'Keep the top Fisher role dedicated to the Fishing leaderboard.');
    }
    const sendableChannelIds = new Set((channels ?? []).filter((channel) => channel.sendable).map((channel) => channel.channel_id));
    if (generalCommandChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose General commands channels that are currently available to the KnowLeague bot.');
    }
    if (skinClaimChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose skin-claim channels that are currently available to the KnowLeague bot.');
    }
    if (skinClaimCommandChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose Collections commands channels that are currently available to the KnowLeague bot.');
    }
    if (fishingCommandChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose fishing command channels that are currently available to the KnowLeague bot.');
    }
    if (miningCommandChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose Mining command channels that are currently available to the KnowLeague bot.');
    }
    if (skindleShareChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose Skindle results channels that are currently available to the KnowLeague bot.');
    }
    if (miningWebsitePanelChannelIds.some((channelId) => !sendableChannelIds.has(channelId))) {
      throw new ApiError(400, 'Choose Mining website result channels that are currently available to the KnowLeague bot.');
    }
    if (body.skinClaimEnabled && (!sendableChannelIds.size || (!skinClaimAllChannels && !skinClaimChannelIds.length))) {
      throw new ApiError(400, 'Enable skin claims only after Discord has synced a sendable channel or you select at least one eligible channel.');
    }
    if (!fishingCommandAllChannels && !fishingCommandChannelIds.length) {
      throw new ApiError(400, 'Choose at least one channel when fishing commands are not enabled in all channels.');
    }
    if (!miningCommandAllChannels && !miningCommandChannelIds.length) {
      throw new ApiError(400, 'Choose at least one channel when Mining commands are not enabled in all channels.');
    }
    if (!miningCommandAllChannels && miningWebsitePanelChannelIds.some((channelId) => !miningCommandChannelIds.includes(channelId))) {
      throw new ApiError(400, 'Every Mining website result channel must also allow Mining commands so its Mine again control remains usable.');
    }

    const { error } = await supabase.rpc('replace_discord_collection_configuration', {
      p_cooldown_seconds: cooldownSeconds,
      p_enabled: body.enabled,
      p_guild_id: guildId,
      p_leaderboard_excluded_role_ids: leaderboardExcludedRoleIds,
      p_leaderboard_top_role_id: leaderboardTopRoleId,
      p_level_up_message_enabled: body.levelUpMessageEnabled,
      p_level_up_message_channel_id: levelUpMessageChannelId,
      p_level_up_message_template: levelUpMessageTemplate,
      p_manual_xp_role_ids: manualXpRoleIds,
      p_role_rewards: roleRewards,
      p_xp_per_message: xpPerMessage,
      p_updated_by: user.id,
      p_skin_claim_all_channels: skinClaimAllChannels,
      p_skin_claim_eligible_channel_ids: skinClaimChannelIds,
      p_skin_claim_enabled: body.skinClaimEnabled,
      p_skin_claim_maximum_interval_minutes: skinClaimMaximumIntervalMinutes,
      p_skin_claim_minimum_interval_minutes: skinClaimMinimumIntervalMinutes,
      p_skin_claim_rarity_weights: skinClaimRarityWeights,
      p_skin_claim_window_minutes: skinClaimClaimWindowMinutes,
      p_summon_base_cost: skinClaimSummonBaseCost,
      p_default_collection_capacity: skinClaimDefaultCollectionCapacity,
      p_collection_capacity_upgrade_cost: skinClaimCollectionCapacityUpgradeCost,
      p_collection_steal_chance_percent: skinClaimCollectionStealChancePercent,
      p_claim_grace_period_seconds: skinClaimClaimGracePeriodSeconds,
      p_collection_admin_role_ids: collectionAdminRoleIds,
      p_sell_values: skinClaimSellValues,
    });
    if (error) throw error;
    const { error: generalCommandChannelsError } = await supabase.rpc('replace_discord_general_command_channels', {
      p_command_channel_ids: generalCommandChannelIds,
      p_guild_id: guildId,
      p_updated_by: user.id,
    });
    if (generalCommandChannelsError) throw generalCommandChannelsError;
    const { error: collectionCommandChannelsError } = await supabase.rpc('replace_discord_skin_claim_command_channels', {
      p_command_channel_ids: skinClaimCommandChannelIds,
      p_guild_id: guildId,
      p_updated_by: user.id,
    });
    if (collectionCommandChannelsError) throw collectionCommandChannelsError;
    const { error: fishingConfigurationError } = await supabase.rpc('replace_discord_fishing_command_configuration', {
      p_command_all_channels: fishingCommandAllChannels,
      p_command_channel_ids: fishingCommandChannelIds,
      p_guild_id: guildId,
      p_updated_by: user.id,
    });
    if (fishingConfigurationError) throw fishingConfigurationError;
    const { error: miningConfigurationError } = await supabase.rpc('replace_discord_mining_command_configuration', {
      p_command_all_channels: miningCommandAllChannels,
      p_command_channel_ids: miningCommandChannelIds,
      p_guild_id: guildId,
      p_updated_by: user.id,
    });
    if (miningConfigurationError) throw miningConfigurationError;
    const { error: fishingRoleConfigurationError } = await supabase.rpc('replace_discord_fishing_role_configuration', {
      p_guild_id: guildId,
      p_role_rewards: fishingRoleRewards,
      p_top_fisher_role_id: fishingTopFisherRoleId,
      p_updated_by: user.id,
    });
    if (fishingRoleConfigurationError) throw fishingRoleConfigurationError;
    const { error: fishingBonusConfigurationError } = await supabase.rpc('replace_discord_fishing_bonus_configuration', {
      p_bonus_role_ids: fishingBonusRoleIds,
      p_guild_id: guildId,
      p_updated_by: user.id,
      p_weekday_phenomena: fishingWeekdayPhenomena,
    });
    if (fishingBonusConfigurationError) throw fishingBonusConfigurationError;
    const [skindleShareConfiguration, miningWebsitePanelConfiguration] = await Promise.all([
      supabase.rpc('replace_discord_skindle_share_channels', {
        p_channel_ids: skindleShareChannelIds,
        p_guild_id: guildId,
        p_updated_by: user.id,
      }),
      supabase.rpc('replace_discord_mining_website_panel_channels', {
        p_channel_ids: miningWebsitePanelChannelIds,
        p_guild_id: guildId,
        p_updated_by: user.id,
      }),
    ]);
    if (skindleShareConfiguration.error) throw skindleShareConfiguration.error;
    if (miningWebsitePanelConfiguration.error) throw miningWebsitePanelConfiguration.error;
    return NextResponse.json(await getLevelingData(guildId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
