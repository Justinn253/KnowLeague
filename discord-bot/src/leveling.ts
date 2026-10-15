import { PermissionFlagsBits, type Guild, type GuildMember, type Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

type XpUpdate = {
  current_level: number;
  previous_level: number;
  total_xp: number;
};

type XpAward = XpUpdate & {
  awarded: boolean;
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

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function totalXpForLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.floor(level));
  return normalizedLevel === 0
    ? 0
    : 50 * normalizedLevel ** 2 - 100 * normalizedLevel + 150;
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
  const pageSize = 100;
  let start = 0;

  while (entries.length < limit) {
    const { data, error } = await supabase
      .from('discord_leveling_members')
      .select('discord_user_id, level, total_xp')
      .eq('guild_id', config.guildId)
      .gt('total_xp', 0)
      .order('total_xp', { ascending: false })
      .order('discord_user_id', { ascending: true })
      .range(start, start + pageSize - 1)
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
  const entries = await getResolvedLeaderboardMembers(config, guild, limit);
  return entries.map((entry) => ({
    displayName: entry.member.displayName,
    level: entry.level,
    totalXp: entry.total_xp,
    userId: entry.discord_user_id,
  }));
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

export async function syncDiscordLeaderboardRole(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) {
    return;
  }

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

export async function grantEligibleLevelRoles(config: DiscordBotConfig, member: GuildMember, level: number) {
  const supabase = createBotServiceClient(config);
  const { data: rewards, error } = await supabase
    .from('discord_leveling_role_rewards')
    .select('discord_role_id, level')
    .eq('guild_id', config.guildId)
    .lte('level', level)
    .returns<RoleReward[]>();
  if (error) {
    throw new Error(`Unable to read Discord level rewards: ${error.message}`);
  }

  const missingRoleIds = (rewards ?? [])
    .map((reward) => reward.discord_role_id)
    .filter((roleId) => !member.roles.cache.has(roleId))
    .filter((roleId) => member.guild.roles.cache.get(roleId)?.editable);

  if (missingRoleIds.length > 0) {
    await member.roles.add(missingRoleIds, 'KnowLeague chat leveling reward');
  }
}

export async function reconcileLevelRewardRoles(config: DiscordBotConfig, member: GuildMember, level: number) {
  const supabase = createBotServiceClient(config);
  const { data: rewards, error } = await supabase
    .from('discord_leveling_role_rewards')
    .select('discord_role_id, level')
    .eq('guild_id', config.guildId)
    .returns<RoleReward[]>();
  if (error) {
    throw new Error(`Unable to read Discord level rewards: ${error.message}`);
  }

  const eligibleRoleIds = new Set((rewards ?? [])
    .filter((reward) => reward.level <= level)
    .map((reward) => reward.discord_role_id));
  const managedRoleIds = new Set((rewards ?? []).map((reward) => reward.discord_role_id));
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

function renderLevelUpMessage(template: string, member: GuildMember, update: XpUpdate) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{level}', String(update.current_level))
    .replaceAll('{xp}', new Intl.NumberFormat().format(update.total_xp));
}

async function announceLevelUp(config: DiscordBotConfig, message: Message, member: GuildMember, update: XpUpdate) {
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

  let announcementChannel = message.channel.isSendable() ? message.channel : null;
  if (settings.level_up_message_channel_id) {
    let configuredChannel;
    try {
      configuredChannel = await message.guild!.channels.fetch(settings.level_up_message_channel_id);
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
      content: renderLevelUpMessage(rewardLevelMessage?.message_template ?? settings.level_up_message_template, member, update),
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

export async function awardMessageXp(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) {
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
  await announceLevelUp(config, message, member, award);
  await syncDiscordLeaderboardRole(config, message.guild!);
}
