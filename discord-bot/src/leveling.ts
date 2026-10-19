import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember, type Message, type VoiceState } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { grantCurrentFishingLevelRoles, syncDiscordFishingTopRole } from './fishing.js';
import { createBotServiceClient } from './supabase.js';

export type XpUpdate = {
  current_level: number;
  previous_level: number;
  total_xp: number;
};

type XpAward = XpUpdate & {
  awarded: boolean;
  knowbucks_awarded: number;
};

type VoiceXpAward = XpAward & {
  xp_awarded: number;
};

type RoleReward = {
  discord_role_id: string;
  level: number;
};

type LevelUpAnnouncementSettings = {
  level_up_message_enabled: boolean;
  level_up_message_channel_id: string | null;
  level_up_message_template: string;
};

type StaffRole = {
  discord_role_id: string;
};

type RewardLevelMessage = {
  message_template: string;
};

type DiscordLevelProgressMember = {
  level: number;
  total_xp: number;
};

type XpAwardSettings = {
  cooldown_seconds: number;
  enabled: boolean;
};

type LeaderboardSettings = {
  leaderboard_top_role_id: string | null;
};

type LeaderboardExcludedRole = {
  discord_role_id: string;
};

type LeaderboardRoleAssignment = {
  discord_role_id: string;
  discord_user_id: string;
};

type LeaderboardMember = {
  discord_user_id: string;
  level: number;
  total_xp: number;
};

export type DiscordLevelProgress = {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemaining: number;
};

export type DiscordLeaderboardEntry = {
  displayName: string;
  level: number;
  totalXp: number;
  userId: string;
};

const XP_AWARD_SETTINGS_CACHE_DURATION_MS = 30_000;
const LEVEL_REWARDS_CACHE_DURATION_MS = 30_000;
const LEADERBOARD_CACHE_DURATION_MS = 30_000;
const LEADERBOARD_MESSAGE_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1_000;
const LEADERBOARD_MAX_MEMBER_SCAN = 500;

let cachedXpAwardSettings: { expiresAt: number; guildId: string; value: XpAwardSettings } | null = null;
let xpAwardSettingsLoad: Promise<XpAwardSettings> | null = null;
const xpAwardAttemptAfterByUserId = new Map<string, number>();
let xpAwardGatePruneAfter = 0;
let cachedLevelRewards: { expiresAt: number; guildId: string; value: RoleReward[] } | null = null;
let levelRewardsLoad: Promise<RoleReward[]> | null = null;
let cachedLeaderboard: {
  complete: boolean;
  expiresAt: number;
  guildId: string;
  value: DiscordLeaderboardEntry[];
} | null = null;
let leaderboardSyncInFlight: Promise<void> | null = null;
let lastLeaderboardMessageReconciliationAt = 0;

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function totalXpForLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.floor(level));
  return normalizedLevel === 0
    ? 0
    : 50 * normalizedLevel ** 2 - 100 * normalizedLevel + 150;
}

async function getXpAwardSettings(config: DiscordBotConfig): Promise<XpAwardSettings> {
  const now = Date.now();
  if (cachedXpAwardSettings
    && cachedXpAwardSettings.guildId === config.guildId
    && cachedXpAwardSettings.expiresAt > now) {
    return cachedXpAwardSettings.value;
  }
  if (xpAwardSettingsLoad) {
    return xpAwardSettingsLoad;
  }

  xpAwardSettingsLoad = (async () => {
    const { data, error } = await createBotServiceClient(config)
      .from('discord_leveling_settings')
      .select('cooldown_seconds, enabled')
      .eq('guild_id', config.guildId)
      .maybeSingle<XpAwardSettings>();
    if (error) {
      throw new Error(`Unable to load Discord chat leveling settings: ${error.message}`);
    }

    const value = data ?? { cooldown_seconds: 5, enabled: false };
    // Configuration is cached briefly to protect the database on busy servers.
    // Clear the local gate when it changes so a reduced cooldown never leaves a
    // member waiting for the prior, longer setting.
    if (cachedXpAwardSettings
      && cachedXpAwardSettings.guildId === config.guildId
      && (cachedXpAwardSettings.value.cooldown_seconds !== value.cooldown_seconds
        || cachedXpAwardSettings.value.enabled !== value.enabled)) {
      xpAwardAttemptAfterByUserId.clear();
    }
    cachedXpAwardSettings = {
      expiresAt: Date.now() + XP_AWARD_SETTINGS_CACHE_DURATION_MS,
      guildId: config.guildId,
      value,
    };
    return value;
  })();

  try {
    return await xpAwardSettingsLoad;
  } finally {
    xpAwardSettingsLoad = null;
  }
}

function shouldAttemptChatXp(discordUserId: string, cooldownSeconds: number): boolean {
  const now = Date.now();
  const nextAttemptAt = xpAwardAttemptAfterByUserId.get(discordUserId) ?? 0;
  if (nextAttemptAt > now) {
    return false;
  }

  xpAwardAttemptAfterByUserId.set(discordUserId, now + cooldownSeconds * 1_000);
  if (now >= xpAwardGatePruneAfter) {
    xpAwardGatePruneAfter = now + 5 * 60 * 1_000;
    for (const [userId, expiresAt] of xpAwardAttemptAfterByUserId) {
      if (expiresAt <= now) {
        xpAwardAttemptAfterByUserId.delete(userId);
      }
    }
  }
  return true;
}

async function getConfiguredLevelRewards(config: DiscordBotConfig, forceRefresh = false): Promise<RoleReward[]> {
  const now = Date.now();
  if (!forceRefresh
    && cachedLevelRewards
    && cachedLevelRewards.guildId === config.guildId
    && cachedLevelRewards.expiresAt > now) {
    return cachedLevelRewards.value;
  }
  if (!forceRefresh && levelRewardsLoad) {
    return levelRewardsLoad;
  }

  const load = async () => {
    const { data, error } = await createBotServiceClient(config)
      .from('discord_leveling_role_rewards')
      .select('discord_role_id, level')
      .eq('guild_id', config.guildId)
      .returns<RoleReward[]>();
    if (error) {
      throw new Error(`Unable to read Discord level rewards: ${error.message}`);
    }

    const value = data ?? [];
    cachedLevelRewards = {
      expiresAt: Date.now() + LEVEL_REWARDS_CACHE_DURATION_MS,
      guildId: config.guildId,
      value,
    };
    return value;
  };

  if (forceRefresh) {
    return load();
  }

  levelRewardsLoad = load();
  try {
    return await levelRewardsLoad;
  } finally {
    levelRewardsLoad = null;
  }
}

export async function getDiscordLevelProgress(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<DiscordLevelProgress> {
  const supabase = createBotServiceClient(config);
  const { data, error } = await supabase
    .from('discord_leveling_members')
    .select('level, total_xp')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .maybeSingle<DiscordLevelProgressMember>();
  if (error) {
    throw new Error(`Unable to load Discord chat leveling progress: ${error.message}`);
  }

  const level = data?.level ?? 0;
  const totalXp = data?.total_xp ?? 0;
  const currentLevelStartXp = totalXpForLevel(level);
  const nextLevelTotalXp = totalXpForLevel(level + 1);

  return {
    level,
    totalXp,
    xpIntoLevel: Math.max(0, totalXp - currentLevelStartXp),
    xpForNextLevel: nextLevelTotalXp - currentLevelStartXp,
    xpRemaining: Math.max(0, nextLevelTotalXp - totalXp),
  };
}

type ResolvedLeaderboardMember = LeaderboardMember & {
  member: GuildMember;
};

async function getResolvedLeaderboardMembers(
  config: DiscordBotConfig,
  guild: Guild,
  limit: number,
  excludedRoleIds: ReadonlySet<string> = new Set(),
): Promise<ResolvedLeaderboardMember[]> {
  const supabase = createBotServiceClient(config);
  const entries: ResolvedLeaderboardMember[] = [];
  const pageSize = Math.min(100, Math.max(25, limit));
  let start = 0;

  while (entries.length < limit && start < LEADERBOARD_MAX_MEMBER_SCAN) {
    const { data, error } = await supabase
      .from('discord_leveling_members')
      .select('discord_user_id, level, total_xp')
      .eq('guild_id', config.guildId)
      .gt('total_xp', 0)
      .order('total_xp', { ascending: false })
      .order('discord_user_id', { ascending: true })
      .range(start, Math.min(start + pageSize - 1, LEADERBOARD_MAX_MEMBER_SCAN - 1))
      .returns<LeaderboardMember[]>();
    if (error) {
      throw new Error(`Unable to load the Discord XP leaderboard: ${error.message}`);
    }
    if (!data?.length) {
      break;
    }

    for (const entry of data) {
      try {
        const member = await guild.members.fetch(entry.discord_user_id);
        if (member.user.bot || [...excludedRoleIds].some((roleId) => member.roles.cache.has(roleId))) {
          continue;
        }
        entries.push({ ...entry, member });
        if (entries.length === limit) {
          break;
        }
      } catch {
        // XP records are retained after a normal server departure, but departed
        // members should not occupy a visible rank or the champion role.
      }
    }

    if (data.length < pageSize) {
      break;
    }
    start += pageSize;
  }

  return entries;
}

export async function getDiscordXpLeaderboard(
  config: DiscordBotConfig,
  guild: Guild,
  limit: number,
): Promise<DiscordLeaderboardEntry[]> {
  const now = Date.now();
  if (cachedLeaderboard
    && cachedLeaderboard.guildId === config.guildId
    && cachedLeaderboard.expiresAt > now
    && (cachedLeaderboard.complete || cachedLeaderboard.value.length >= limit)) {
    return cachedLeaderboard.value.slice(0, limit);
  }

  const entries = await getResolvedLeaderboardMembers(config, guild, 25);
  const value = entries.map((entry) => ({
    displayName: entry.member.displayName,
    level: entry.level,
    totalXp: entry.total_xp,
    userId: entry.discord_user_id,
  }));
  cachedLeaderboard = {
    complete: value.length < 25,
    expiresAt: now + LEADERBOARD_CACHE_DURATION_MS,
    guildId: config.guildId,
    value,
  };
  return value.slice(0, limit);
}

async function removeTrackedLeaderboardRole(
  guild: Guild,
  assignment: LeaderboardRoleAssignment,
): Promise<boolean> {
  const role = await guild.roles.fetch(assignment.discord_role_id);
  if (!role) {
    return true;
  }
  if (!role.editable) {
    console.error('Discord leaderboard role synchronization could not remove a role above the bot.');
    return false;
  }

  try {
    const member = await guild.members.fetch(assignment.discord_user_id);
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'KnowLeague leaderboard champion changed');
    }
    return true;
  } catch {
    // Discord removes a member's server roles on departure and ban, so a
    // missing member can safely clear the bot's stale assignment record.
    return true;
  }
}

export function syncDiscordLeaderboardRole(config: DiscordBotConfig, guild: Guild): Promise<void> {
  if (guild.id !== config.guildId) {
    return Promise.resolve();
  }
  if (leaderboardSyncInFlight) {
    return leaderboardSyncInFlight;
  }

  const work = performDiscordLeaderboardRoleSync(config, guild);
  leaderboardSyncInFlight = work;
  void work.then(
    () => {
      lastLeaderboardMessageReconciliationAt = Date.now();
      if (leaderboardSyncInFlight === work) leaderboardSyncInFlight = null;
    },
    () => {
      if (leaderboardSyncInFlight === work) leaderboardSyncInFlight = null;
    },
  );
  return work;
}

export async function maybeSyncDiscordLeaderboardRoleOnMessage(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) {
    return;
  }
  if (Date.now() - lastLeaderboardMessageReconciliationAt < LEADERBOARD_MESSAGE_RECONCILIATION_INTERVAL_MS) {
    return;
  }

  await syncDiscordLeaderboardRole(config, guild);
}

async function performDiscordLeaderboardRoleSync(config: DiscordBotConfig, guild: Guild) {

  const supabase = createBotServiceClient(config);
  const [settingsResult, exclusionsResult, assignmentResult] = await Promise.all([
    supabase
      .from('discord_leveling_settings')
      .select('leaderboard_top_role_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<LeaderboardSettings>(),
    supabase
      .from('discord_leveling_leaderboard_excluded_roles')
      .select('discord_role_id')
      .eq('guild_id', config.guildId)
      .returns<LeaderboardExcludedRole[]>(),
    supabase
      .from('discord_leveling_leaderboard_role_assignments')
      .select('discord_role_id, discord_user_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<LeaderboardRoleAssignment>(),
  ]);
  if (settingsResult.error) throw new Error(`Unable to load leaderboard role settings: ${settingsResult.error.message}`);
  if (exclusionsResult.error) throw new Error(`Unable to load leaderboard role exclusions: ${exclusionsResult.error.message}`);
  if (assignmentResult.error) throw new Error(`Unable to load leaderboard role assignment: ${assignmentResult.error.message}`);

  const assigned = assignmentResult.data;
  const configuredRoleId = settingsResult.data?.leaderboard_top_role_id ?? null;
  if (!configuredRoleId) {
    if (!assigned || !(await removeTrackedLeaderboardRole(guild, assigned))) {
      return;
    }
    const { error } = await supabase
      .from('discord_leveling_leaderboard_role_assignments')
      .delete()
      .eq('guild_id', config.guildId);
    if (error) throw new Error(`Unable to clear the leaderboard role assignment: ${error.message}`);
    return;
  }

  const role = await guild.roles.fetch(configuredRoleId);
  if (!role) {
    console.error('Discord leaderboard role synchronization could not find the configured role.');
    return;
  }
  if (!role.editable) {
    console.error('Discord leaderboard role synchronization requires the configured role to be below the bot role.');
    return;
  }

  const excludedRoleIds = new Set((exclusionsResult.data ?? []).map((item) => item.discord_role_id));
  const [leader] = await getResolvedLeaderboardMembers(config, guild, 1, excludedRoleIds);

  if (assigned && (!leader || assigned.discord_role_id !== role.id || assigned.discord_user_id !== leader.discord_user_id)) {
    if (!(await removeTrackedLeaderboardRole(guild, assigned))) {
      return;
    }
    const { error } = await supabase
      .from('discord_leveling_leaderboard_role_assignments')
      .delete()
      .eq('guild_id', config.guildId);
    if (error) throw new Error(`Unable to clear the previous leaderboard role assignment: ${error.message}`);
  }

  if (!leader) {
    return;
  }

  if (!leader.member.roles.cache.has(role.id)) {
    await leader.member.roles.add(role, 'KnowLeague leaderboard leader');
  }
  const { error } = await supabase
    .from('discord_leveling_leaderboard_role_assignments')
    .upsert({
      discord_role_id: role.id,
      discord_user_id: leader.discord_user_id,
      guild_id: config.guildId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
  if (error) throw new Error(`Unable to save the leaderboard role assignment: ${error.message}`);
}

export async function syncDiscordGuildRoles(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) {
    return;
  }

  const [botMember, roles] = await Promise.all([guild.members.fetchMe(), guild.roles.fetch()]);
  const canManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
  const roleRows = roles
    .filter((role) => role.id !== guild.id)
    .map((role) => ({
      assignable: canManageRoles && !role.managed && role.position < botMember.roles.highest.position,
      guild_id: guild.id,
      position: role.position,
      role_id: role.id,
      role_name: role.name.slice(0, 100),
      updated_at: new Date().toISOString(),
    }));
  const supabase = createBotServiceClient(config);

  const { error: settingsError } = await supabase
    .from('discord_leveling_settings')
    .upsert({ guild_id: guild.id }, { onConflict: 'guild_id', ignoreDuplicates: true });
  if (settingsError) {
    throw new Error(`Unable to initialize Discord chat leveling: ${settingsError.message}`);
  }

  const { error: deleteError } = await supabase
    .from('discord_guild_roles')
    .delete()
    .eq('guild_id', guild.id);
  if (deleteError) {
    throw new Error(`Unable to replace Discord role metadata: ${deleteError.message}`);
  }

  if (roleRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('discord_guild_roles')
      .upsert(roleRows, { onConflict: 'guild_id,role_id' });
    if (upsertError) {
      throw new Error(`Unable to save Discord role metadata: ${upsertError.message}`);
    }
  }
}

export async function syncDiscordGuildTextChannels(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) {
    return;
  }

  const [botMember, channels] = await Promise.all([guild.members.fetchMe(), guild.channels.fetch()]);
  const channelRows = channels
    .filter((channel) => channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement)
    .map((channel) => {
      const permissions = channel!.permissionsFor(botMember);
      return {
        channel_id: channel!.id,
        channel_name: channel!.name.slice(0, 100),
        guild_id: guild.id,
        position: channel!.rawPosition,
        sendable: Boolean(permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])),
        updated_at: new Date().toISOString(),
      };
    });
  const supabase = createBotServiceClient(config);
  const { error: settingsError } = await supabase
    .from('discord_leveling_settings')
    .upsert({ guild_id: guild.id }, { onConflict: 'guild_id', ignoreDuplicates: true });
  if (settingsError) {
    throw new Error(`Unable to initialize Discord channel metadata: ${settingsError.message}`);
  }
  const { error: deleteError } = await supabase
    .from('discord_guild_text_channels')
    .delete()
    .eq('guild_id', guild.id);
  if (deleteError) {
    throw new Error(`Unable to replace Discord text-channel metadata: ${deleteError.message}`);
  }
  if (channelRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('discord_guild_text_channels')
      .upsert(channelRows, { onConflict: 'guild_id,channel_id' });
    if (upsertError) {
      throw new Error(`Unable to save Discord text-channel metadata: ${upsertError.message}`);
    }
  }
}

export async function grantEligibleLevelRoles(config: DiscordBotConfig, member: GuildMember, level: number) {
  const rewards = await getConfiguredLevelRewards(config);
  const missingRoleIds = rewards
    .filter((reward) => reward.level <= level)
    .map((reward) => reward.discord_role_id)
    .filter((roleId) => !member.roles.cache.has(roleId))
    .filter((roleId) => member.guild.roles.cache.get(roleId)?.editable);

  if (missingRoleIds.length > 0) {
    await member.roles.add(missingRoleIds, 'KnowLeague chat leveling reward');
  }
}

export async function reconcileLevelRewardRoles(config: DiscordBotConfig, member: GuildMember, level: number) {
  const rewards = await getConfiguredLevelRewards(config, true);
  const eligibleRoleIds = new Set(rewards
    .filter((reward) => reward.level <= level)
    .map((reward) => reward.discord_role_id));
  const managedRoleIds = new Set(rewards.map((reward) => reward.discord_role_id));
  const rolesToAdd = [...eligibleRoleIds]
    .filter((roleId) => !member.roles.cache.has(roleId))
    .filter((roleId) => member.guild.roles.cache.get(roleId)?.editable);
  const rolesToRemove = [...managedRoleIds]
    .filter((roleId) => !eligibleRoleIds.has(roleId))
    .filter((roleId) => member.roles.cache.has(roleId))
    .filter((roleId) => member.guild.roles.cache.get(roleId)?.editable);

  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd, 'KnowLeague chat leveling reward reconciliation');
  }
  if (rolesToRemove.length > 0) {
    await member.roles.remove(rolesToRemove, 'KnowLeague chat level was lowered');
  }
}

export function renderLevelUpMessage(
  template: string,
  recipient: { userId: string; username: string },
  update: XpUpdate,
) {
  return template
    .replace(/\{user\}/g, () => `<@${recipient.userId}>`)
    .replace(/\{username\}/g, () => recipient.username)
    .replace(/\{level\}/g, () => String(update.current_level))
    .replace(/\{xp\}/g, () => new Intl.NumberFormat().format(update.total_xp));
}

async function announceLevelUp(
  config: DiscordBotConfig,
  guild: Guild,
  member: GuildMember,
  update: XpUpdate,
  fallbackChannel?: Message['channel'],
) {
  if (update.current_level <= update.previous_level) {
    return;
  }

  const supabase = createBotServiceClient(config);
  const { data: settings, error } = await supabase
    .from('discord_leveling_settings')
    .select('level_up_message_enabled, level_up_message_channel_id, level_up_message_template')
    .eq('guild_id', config.guildId)
    .maybeSingle<LevelUpAnnouncementSettings>();
  if (error) {
    throw new Error(`Unable to read Discord level-up message settings: ${error.message}`);
  }
  if (!settings?.level_up_message_enabled) {
    return;
  }

  const { data: rewardLevelMessage, error: rewardLevelMessageError } = await supabase
    .from('discord_leveling_reward_level_messages')
    .select('message_template')
    .eq('guild_id', config.guildId)
    .eq('level', update.current_level)
    .maybeSingle<RewardLevelMessage>();
  if (rewardLevelMessageError) {
    throw new Error(`Unable to read Discord reward-level message settings: ${rewardLevelMessageError.message}`);
  }

  let announcementChannel = fallbackChannel?.isSendable() ? fallbackChannel : null;
  if (settings.level_up_message_channel_id) {
    let configuredChannel;
    try {
      configuredChannel = await guild.channels.fetch(settings.level_up_message_channel_id);
    } catch (error) {
      console.error('Discord level-up messages could not load the configured announcement channel.', error);
      return;
    }
    if (!configuredChannel?.isSendable()) {
      console.error('Discord level-up messages could not use the configured announcement channel.');
      return;
    }
    announcementChannel = configuredChannel;
  }
  if (!announcementChannel) {
    return;
  }

  try {
    await announcementChannel.send({
      allowedMentions: { parse: [], users: [member.id] },
      content: renderLevelUpMessage(
        rewardLevelMessage?.message_template ?? settings.level_up_message_template,
        { userId: member.id, username: member.user.username },
        update,
      ),
    });
  } catch (error) {
    console.error('Discord level-up message could not be sent.', error);
  }
}

export async function getManualXpStaffRoleIds(config: DiscordBotConfig) {
  const supabase = createBotServiceClient(config);
  const { data, error } = await supabase
    .from('discord_leveling_staff_roles')
    .select('discord_role_id')
    .eq('guild_id', config.guildId)
    .returns<StaffRole[]>();
  if (error) {
    throw new Error(`Unable to read Discord manual XP permissions: ${error.message}`);
  }
  return new Set((data ?? []).map((role) => role.discord_role_id));
}

async function updateXp(
  config: DiscordBotConfig,
  functionName: 'add_discord_chat_xp' | 'set_discord_chat_level',
  discordUserId: string,
  valueName: 'p_xp_amount' | 'p_level',
  value: number,
) {
  const supabase = createBotServiceClient(config);
  const { data, error } = await supabase.rpc(functionName, {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    [valueName]: value,
  });
  if (error) {
    throw new Error(`Unable to update Discord chat XP: ${error.message}`);
  }
  const update = getFirstResult(data as XpUpdate | XpUpdate[] | null);
  if (!update) {
    throw new Error('Discord chat XP update did not return a result.');
  }
  return update;
}

export function addManualXp(config: DiscordBotConfig, discordUserId: string, amount: number) {
  return updateXp(config, 'add_discord_chat_xp', discordUserId, 'p_xp_amount', amount);
}

export function setManualLevel(config: DiscordBotConfig, discordUserId: string, level: number) {
  return updateXp(config, 'set_discord_chat_level', discordUserId, 'p_level', level);
}

export async function resetBannedMemberXp(config: DiscordBotConfig, discordUserId: string) {
  const supabase = createBotServiceClient(config);
  const { error } = await supabase.rpc('reset_discord_chat_xp', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to reset Discord chat XP after a ban: ${error.message}`);
  }
}

async function startVoiceXpSession(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('start_discord_voice_xp_session', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to start Discord voice XP tracking: ${error.message}`);
  }
}

export async function reconcileDiscordVoiceXpSessions(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) {
    return;
  }

  const connectedDiscordUserIds = guild.voiceStates.cache
    .filter((voiceState) => voiceState.channelId !== null && voiceState.member !== null && !voiceState.member.user.bot)
    .map((voiceState) => voiceState.id);
  const { error } = await createBotServiceClient(config).rpc('reconcile_discord_voice_xp_sessions', {
    p_connected_discord_user_ids: connectedDiscordUserIds,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to reconcile Discord voice XP tracking: ${error.message}`);
  }
}

export async function handleDiscordVoiceStateUpdate(
  config: DiscordBotConfig,
  oldState: VoiceState,
  newState: VoiceState,
) {
  if (newState.guild.id !== config.guildId) {
    return;
  }

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) {
    return;
  }

  const wasInVoiceChannel = oldState.channelId !== null;
  const isInVoiceChannel = newState.channelId !== null;
  if (!wasInVoiceChannel && isInVoiceChannel) {
    await startVoiceXpSession(config, member.id);
    return;
  }
  if (!wasInVoiceChannel || isInVoiceChannel) {
    return;
  }

  const { data, error } = await createBotServiceClient(config).rpc('award_discord_voice_xp', {
    p_discord_user_id: member.id,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to award Discord voice XP: ${error.message}`);
  }

  const award = getFirstResult(data as VoiceXpAward | VoiceXpAward[] | null);
  if (!award?.awarded) {
    return;
  }

  await grantEligibleLevelRoles(config, member, award.current_level);
  if (award.current_level > award.previous_level) {
    await grantCurrentFishingLevelRoles(config, member);
    await syncDiscordFishingTopRole(config, newState.guild);
    await announceLevelUp(config, newState.guild, member, award);
  }
}

export async function awardMessageXp(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) {
    return;
  }

  const settings = await getXpAwardSettings(config);
  if (!settings.enabled || !shouldAttemptChatXp(message.author.id, settings.cooldown_seconds)) {
    return;
  }

  const supabase = createBotServiceClient(config);
  const { data, error } = await supabase.rpc('award_discord_chat_xp', {
    p_discord_user_id: message.author.id,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to award Discord chat XP: ${error.message}`);
  }

  const award = getFirstResult(data as XpAward | XpAward[] | null);
  if (!award?.awarded) {
    return;
  }

  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  await grantEligibleLevelRoles(config, member, award.current_level);
  if (award.current_level > award.previous_level) {
    await grantCurrentFishingLevelRoles(config, member);
    await syncDiscordFishingTopRole(config, message.guild!);
    await announceLevelUp(config, message.guild!, member, award, message.channel);
  }
}
