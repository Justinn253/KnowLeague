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

type StoredLeaderboardExcludedRoleRow = {
  discord_role_id: string;
};

type LevelingSettingsBody = {
  cooldownSeconds?: unknown;
  enabled?: unknown;
  leaderboardExcludedRoleIds?: unknown;
  leaderboardTopRoleId?: unknown;
  levelUpMessageEnabled?: unknown;
  levelUpMessageChannelId?: unknown;
  levelUpMessageTemplate?: unknown;
  manualXpRoleIds?: unknown;
  roleRewards?: unknown;
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

async function getLevelingData(guildId: string) {
  const supabase = getSupabaseServiceClient();
  const [settingsResult, rolesResult, rewardRolesResult, rewardMessagesResult, staffRolesResult, leaderboardExcludedRolesResult] = await Promise.all([
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
    supabase.from('discord_leveling_leaderboard_excluded_roles')
      .select('discord_role_id')
      .eq('guild_id', guildId)
      .order('discord_role_id', { ascending: true })
      .returns<StoredLeaderboardExcludedRoleRow[]>(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (rewardRolesResult.error) throw rewardRolesResult.error;
  if (rewardMessagesResult.error) throw rewardMessagesResult.error;
  if (staffRolesResult.error) throw staffRolesResult.error;
  if (leaderboardExcludedRolesResult.error) throw leaderboardExcludedRolesResult.error;

  return {
    leaderboardExcludedRoleIds: (leaderboardExcludedRolesResult.data ?? []).map((role) => role.discord_role_id),
    manualXpRoleIds: (staffRolesResult.data ?? []).map((role) => role.discord_role_id),
    roleRewards: groupRoleRewards(rewardRolesResult.data ?? [], rewardMessagesResult.data ?? []),
    roles: (rolesResult.data ?? []).map(toGuildRole),
    settings: toSettings(settingsResult.data),
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

function parseRoleIds(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new ApiError(400, `Provide up to ${maximum} ${label}.`);
  const roleIds = value.map((roleId) => {
    if (typeof roleId !== 'string' || !/^[0-9]{17,20}$/.test(roleId)) throw new ApiError(400, `Choose a valid Discord role for every ${label}.`);
    return roleId;
  });
  if (new Set(roleIds).size !== roleIds.length) throw new ApiError(400, `Each ${label.slice(0, -1)} can only be selected once.`);
  return roleIds;
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
    if (typeof body.enabled !== 'boolean' || typeof body.levelUpMessageEnabled !== 'boolean') {
      throw new ApiError(400, 'Leveling and level-up message states must be enabled or disabled.');
    }

    const xpPerMessage = parsePositiveInteger(body.xpPerMessage, 'XP per message', 1, 1000);
    const cooldownSeconds = parsePositiveInteger(body.cooldownSeconds, 'Cooldown', 1, 3600);
    const roleRewards = parseRoleRewards(body.roleRewards);
    const levelUpMessageTemplate = parseOptionalMessageTemplate(body.levelUpMessageTemplate, 'Level-up message');
    if (!levelUpMessageTemplate) throw new ApiError(400, 'Level-up messages must contain between 1 and 500 characters.');
    const levelUpMessageChannelId = parseOptionalSnowflake(body.levelUpMessageChannelId, 'Level-up channel ID');
    const leaderboardTopRoleId = parseOptionalSnowflake(body.leaderboardTopRoleId, 'Leaderboard top role');
    const manualXpRoleIds = parseRoleIds(body.manualXpRoleIds, 'manual XP staff roles', 25);
    const leaderboardExcludedRoleIds = parseRoleIds(body.leaderboardExcludedRoleIds, 'leaderboard exclusion roles', 25);
    const guildId = getDiscordGuildId();
    const supabase = getSupabaseServiceClient();
    const { data: roles, error: rolesError } = await supabase.from('discord_guild_roles')
      .select('role_id, assignable')
      .eq('guild_id', guildId)
      .returns<Array<Pick<StoredRoleRow, 'assignable' | 'role_id'>>>();
    if (rolesError) throw rolesError;

    const assignableRoleIds = new Set((roles ?? []).filter((role) => role.assignable).map((role) => role.role_id));
    if (roleRewards.some((reward) => reward.roleIds.some((roleId) => !assignableRoleIds.has(roleId)))) {
      throw new ApiError(400, 'Choose reward roles that are available below the KnowLeague bot role.');
    }
    const syncedRoleIds = new Set((roles ?? []).map((role) => role.role_id));
    if (manualXpRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose staff roles that are currently synced from Discord.');
    }
    if (leaderboardExcludedRoleIds.some((roleId) => !syncedRoleIds.has(roleId))) {
      throw new ApiError(400, 'Choose leaderboard exclusion roles that are currently synced from Discord.');
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

    const { error } = await supabase.rpc('replace_discord_leveling_settings', {
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
      p_updated_by: user.id,
      p_xp_per_message: xpPerMessage,
    });
    if (error) throw error;
    return NextResponse.json(await getLevelingData(guildId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
