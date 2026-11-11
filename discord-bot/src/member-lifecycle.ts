import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildMember, type Message, type PartialGuildMember } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { getDiscordLevelProgress } from './leveling.js';
import { createBotServiceClient } from './supabase.js';

const MEMBER_LIFECYCLE_SETTINGS_CACHE_MS = 30_000;
const DEFAULT_INVITE_JOIN_MESSAGE_TEMPLATE = '**{user}** has been invited by {inviter}! They now have {inviteCount} invites.';
const DEFAULT_WELCOME_JOIN_MESSAGE_TEMPLATE = '**{user}** joined the server! Check out <#1541690751132500008> and <#1539079954153865246> for server information. Also, please assign your extra roles in <#1558207698548293754>!';

type MemberLifecycleSettings = {
  inviteJoinMessageChannelId: string | null;
  inviteJoinMessageTemplate: string;
  leaveMessageChannelId: string | null;
  welcomeJoinMessageChannelId: string | null;
  welcomeJoinMessageTemplate: string;
};

type StoredMemberLifecycleSettings = {
  invite_join_message_channel_id: string | null;
  invite_join_message_template: string;
  leave_message_channel_id: string | null;
  welcome_join_message_channel_id: string | null;
  welcome_join_message_template: string;
};

type InviteSnapshot = {
  code: string;
  inviterId: string | null;
  inviterUsername: string | null;
  uses: number;
};

type InviteCache = {
  invites: Map<string, InviteSnapshot>;
  vanityUses: number | null;
};

export type DiscordJoinSource =
  | { kind: 'invite'; inviteCode: string; inviterId: string | null; inviterUsername: string | null }
  | { kind: 'vanity' }
  | { kind: 'unknown' };

type StoredLeaveSnapshot = {
  chat_xp_level: number;
  invite_code: string | null;
  inviter_discord_user_id: string | null;
  inviter_username: string | null;
  joined_at: string;
  join_source: 'invite' | 'vanity' | 'unknown';
  last_message_at: string | null;
  last_message_channel_id: string | null;
  last_message_id: string | null;
  role_snapshot: unknown;
};

type StoredLevel = {
  discord_user_id: string;
  level: number;
};

let cachedSettings: { expiresAt: number; guildId: string; value: MemberLifecycleSettings } | null = null;
const inviteCacheByGuildId = new Map<string, InviteCache>();

function defaultSettings(): MemberLifecycleSettings {
  return {
    inviteJoinMessageChannelId: null,
    inviteJoinMessageTemplate: DEFAULT_INVITE_JOIN_MESSAGE_TEMPLATE,
    leaveMessageChannelId: null,
    welcomeJoinMessageChannelId: null,
    welcomeJoinMessageTemplate: DEFAULT_WELCOME_JOIN_MESSAGE_TEMPLATE,
  };
}

async function getMemberLifecycleSettings(config: DiscordBotConfig): Promise<MemberLifecycleSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.guildId === config.guildId && cachedSettings.expiresAt > now) {
    return cachedSettings.value;
  }

  const { data, error } = await createBotServiceClient(config)
    .from('discord_leveling_settings')
    .select('invite_join_message_channel_id, invite_join_message_template, leave_message_channel_id, welcome_join_message_channel_id, welcome_join_message_template')
    .eq('guild_id', config.guildId)
    .maybeSingle<StoredMemberLifecycleSettings>();
  if (error) throw new Error(`Unable to load Discord member lifecycle settings: ${error.message}`);

  const value: MemberLifecycleSettings = data ? {
    inviteJoinMessageChannelId: data.invite_join_message_channel_id,
    inviteJoinMessageTemplate: data.invite_join_message_template,
    leaveMessageChannelId: data.leave_message_channel_id,
    welcomeJoinMessageChannelId: data.welcome_join_message_channel_id,
    welcomeJoinMessageTemplate: data.welcome_join_message_template,
  } : defaultSettings();
  cachedSettings = { expiresAt: now + MEMBER_LIFECYCLE_SETTINGS_CACHE_MS, guildId: config.guildId, value };
  return value;
}

function memberJoinedAt(member: GuildMember | PartialGuildMember) {
  return member.joinedAt ?? new Date();
}

function memberRoles(member: GuildMember | PartialGuildMember) {
  return [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .sort((left, right) => right.position - left.position || left.name.localeCompare(right.name))
    .map((role) => ({ id: role.id, name: role.name }));
}

function memberIdentity(member: GuildMember | PartialGuildMember) {
  return {
    displayName: member.displayName || member.user.username || member.id,
    username: member.user.username || member.id,
  };
}

export function formatMemberLifecycleTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(user|inviter|inviteCount)\}/g, (placeholder, key: keyof typeof values) => String(values[key] ?? placeholder));
}

function joinSourceDatabaseFields(source: DiscordJoinSource) {
  switch (source.kind) {
    case 'invite': return {
      inviteCode: source.inviteCode,
      inviterId: source.inviterId,
      inviterUsername: source.inviterUsername,
      source: 'invite',
    } as const;
    case 'vanity': return { inviteCode: null, inviterId: null, inviterUsername: null, source: 'vanity' } as const;
    default: return { inviteCode: null, inviterId: null, inviterUsername: null, source: 'unknown' } as const;
  }
}

function joinSourceLabel(source: DiscordJoinSource) {
  if (source.kind === 'invite') return source.inviterUsername ?? (source.inviterId ? `<@${source.inviterId}>` : `invite \`${source.inviteCode}\``);
  if (source.kind === 'vanity') return 'the server vanity URL';
  return 'an unknown source';
}

async function sendLifecycleMessage(guild: Guild, channelId: string | null, content: string, mentionedUserId: string) {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`Discord lifecycle channel ${channelId} is unavailable, not text-based, or not sendable.`);
    return;
  }
  await channel.send({
    allowedMentions: { parse: [], users: [mentionedUserId] },
    content,
  });
}

export async function handleDiscordMemberJoin(config: DiscordBotConfig, member: GuildMember, source: DiscordJoinSource) {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  const identity = memberIdentity(member);
  const fields = joinSourceDatabaseFields(source);
  const { data, error } = await createBotServiceClient(config).rpc('record_discord_member_join', {
    p_discord_user_id: member.id,
    p_guild_id: config.guildId,
    p_invite_code: fields.inviteCode,
    p_inviter_discord_user_id: fields.inviterId,
    p_inviter_username: fields.inviterUsername,
    p_join_source: fields.source,
    p_joined_at: memberJoinedAt(member).toISOString(),
    p_member_display_name: identity.displayName,
    p_member_username: identity.username,
    p_role_snapshot: memberRoles(member),
  });
  if (error) throw new Error(`Unable to record Discord member join: ${error.message}`);

  const inviteCountRow = Array.isArray(data) ? data[0] as { invite_count?: number } | undefined : undefined;
  const inviteCount = typeof inviteCountRow?.invite_count === 'number' ? inviteCountRow.invite_count : 0;
  const settings = await getMemberLifecycleSettings(config);
  const userMention = `<@${member.id}>`;
  await Promise.all([
    sendLifecycleMessage(
      member.guild,
      settings.welcomeJoinMessageChannelId,
      formatMemberLifecycleTemplate(settings.welcomeJoinMessageTemplate, { user: userMention }),
      member.id,
    ),
    sendLifecycleMessage(
      member.guild,
      settings.inviteJoinMessageChannelId,
      formatMemberLifecycleTemplate(settings.inviteJoinMessageTemplate, {
        inviteCount,
        inviter: joinSourceLabel(source),
        user: userMention,
      }),
      member.id,
    ),
  ]);
}

function deserializeRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((role) => {
    if (!role || typeof role !== 'object') return [];
    const { id, name } = role as { id?: unknown; name?: unknown };
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name }] : [];
  });
}

function leaveSourceDescription(snapshot: StoredLeaveSnapshot) {
  if (snapshot.join_source === 'invite') {
    const inviter = snapshot.inviter_username ?? (snapshot.inviter_discord_user_id ? `<@${snapshot.inviter_discord_user_id}>` : 'Unknown inviter');
    return snapshot.invite_code ? `Invite \`${snapshot.invite_code}\` by ${inviter}` : `Invite by ${inviter}`;
  }
  if (snapshot.join_source === 'vanity') return 'Server vanity URL';
  return 'Unknown';
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}

function buildLeavePanel(guild: Guild, member: GuildMember | PartialGuildMember, snapshot: StoredLeaveSnapshot) {
  const joinedAtSeconds = Math.floor(new Date(snapshot.joined_at).getTime() / 1_000);
  const roles = deserializeRoles(snapshot.role_snapshot);
  const roleText = roles.length ? roles.map((role) => `<@&${role.id}>`).join(' · ') : 'No roles beyond @everyone';
  const lastMessage = snapshot.last_message_id && snapshot.last_message_channel_id
    ? `[Open message](https://discord.com/channels/${guild.id}/${snapshot.last_message_channel_id}/${snapshot.last_message_id})${snapshot.last_message_at ? ` · <t:${Math.floor(new Date(snapshot.last_message_at).getTime() / 1_000)}:R>` : ''}`
    : 'Not available (the bot had not yet observed a message)';
  return new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle('Member left')
    .setDescription(`**Member:** <@${member.id}>\n**Username:** ${member.user.username}\n**Join source:** ${leaveSourceDescription(snapshot)}`)
    .addFields(
      { name: 'Joined server', value: `<t:${joinedAtSeconds}:F> · <t:${joinedAtSeconds}:R>`, inline: true },
      { name: 'Chat XP level', value: String(snapshot.chat_xp_level), inline: true },
      { name: 'Last observed message', value: lastMessage, inline: false },
      { name: `Roles (${roles.length})`, value: truncate(roleText, 1_024), inline: false },
    )
    .setTimestamp();
}

export async function handleDiscordMemberLeave(config: DiscordBotConfig, member: GuildMember | PartialGuildMember) {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  const [identity, level] = await Promise.all([
    Promise.resolve(memberIdentity(member)),
    getDiscordLevelProgress(config, member.id).then((progress) => progress.level),
  ]);
  const { data, error } = await createBotServiceClient(config).rpc('record_discord_member_leave', {
    p_chat_xp_level: level,
    p_discord_user_id: member.id,
    p_guild_id: config.guildId,
    p_joined_at: memberJoinedAt(member).toISOString(),
    p_member_display_name: identity.displayName,
    p_member_username: identity.username,
    p_role_snapshot: memberRoles(member),
  });
  if (error) throw new Error(`Unable to record Discord member leave: ${error.message}`);
  const snapshot = Array.isArray(data) ? data[0] as StoredLeaveSnapshot | undefined : undefined;
  if (!snapshot) throw new Error('Discord member leave snapshot did not return a result.');

  const settings = await getMemberLifecycleSettings(config);
  if (!settings.leaveMessageChannelId) return;
  const channel = await member.guild.channels.fetch(settings.leaveMessageChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`Discord leave-panel channel ${settings.leaveMessageChannelId} is unavailable, not text-based, or not sendable.`);
    return;
  }
  await channel.send({
    allowedMentions: { parse: [] },
    embeds: [buildLeavePanel(member.guild, member, snapshot)],
  });
}

export async function trackDiscordMemberLastMessage(config: DiscordBotConfig, message: Message<true>) {
  if (message.author.bot || message.system) return;
  const member = message.member;
  if (!member) return;
  const identity = memberIdentity(member);
  const { error } = await createBotServiceClient(config).rpc('track_discord_member_last_message', {
    p_channel_id: message.channelId,
    p_discord_user_id: message.author.id,
    p_guild_id: config.guildId,
    p_joined_at: memberJoinedAt(member).toISOString(),
    p_member_display_name: identity.displayName,
    p_member_username: identity.username,
    p_message_at: message.createdAt.toISOString(),
    p_message_id: message.id,
  });
  if (error) throw new Error(`Unable to record Discord member last message: ${error.message}`);
}

function inviteCacheFromGuild(invites: Awaited<ReturnType<Guild['invites']['fetch']>>, vanityUses: number | null): InviteCache {
  return {
    invites: new Map([...invites.values()].map((invite) => [invite.code, {
      code: invite.code,
      inviterId: invite.inviter?.id ?? null,
      inviterUsername: invite.inviter?.username ?? null,
      uses: invite.uses ?? 0,
    }])),
    vanityUses,
  };
}

async function readGuildInvites(guild: Guild): Promise<InviteCache | null> {
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    console.warn(`KnowLeague cannot track Discord invite uses in guild ${guild.id}; grant the bot Manage Server.`);
    return null;
  }
  try {
    const [invites, vanity] = await Promise.all([
      guild.invites.fetch(),
      guild.fetchVanityData().catch(() => null),
    ]);
    return inviteCacheFromGuild(invites, vanity?.uses ?? null);
  } catch (error) {
    console.error(`Could not read Discord invites for guild ${guild.id}.`, error);
    return null;
  }
}

export async function refreshDiscordInviteCache(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  const cache = await readGuildInvites(guild);
  if (cache) inviteCacheByGuildId.set(guild.id, cache);
}

export async function resolveDiscordJoinSource(config: DiscordBotConfig, guild: Guild): Promise<DiscordJoinSource> {
  if (guild.id !== config.guildId) return { kind: 'unknown' };
  const previous = inviteCacheByGuildId.get(guild.id);
  const current = await readGuildInvites(guild);
  if (!current) return { kind: 'unknown' };
  inviteCacheByGuildId.set(guild.id, current);
  if (!previous) return { kind: 'unknown' };

  const increasedInvites = [...current.invites.values()]
    .filter((invite) => invite.uses > (previous.invites.get(invite.code)?.uses ?? 0));
  if (increasedInvites.length === 1) {
    const invite = increasedInvites[0];
    return {
      kind: 'invite',
      inviteCode: invite.code,
      inviterId: invite.inviterId,
      inviterUsername: invite.inviterUsername,
    };
  }
  if (current.vanityUses !== null && previous.vanityUses !== null && current.vanityUses > previous.vanityUses) {
    return { kind: 'vanity' };
  }
  return { kind: 'unknown' };
}

function batches<T>(entries: readonly T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < entries.length; index += size) output.push(entries.slice(index, index + size));
  return output;
}

export async function backfillDiscordMemberLeaveInfo(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return 0;
  const members = [...(await guild.members.fetch()).values()].filter((member) => !member.user.bot);
  const supabase = createBotServiceClient(config);
  let updated = 0;
  for (const memberBatch of batches(members, 100)) {
    const memberIds = memberBatch.map((member) => member.id);
    const { data: levels, error: levelsError } = await supabase
      .from('discord_leveling_members')
      .select('discord_user_id, level')
      .eq('guild_id', config.guildId)
      .in('discord_user_id', memberIds)
      .returns<StoredLevel[]>();
    if (levelsError) throw new Error(`Unable to load Discord levels for leave backfill: ${levelsError.message}`);
    const levelByMemberId = new Map((levels ?? []).map((entry) => [entry.discord_user_id, entry.level]));
    const snapshots = memberBatch.map((member) => {
      const identity = memberIdentity(member);
      return {
        chat_xp_level: levelByMemberId.get(member.id) ?? 0,
        discord_user_id: member.id,
        joined_at: memberJoinedAt(member).toISOString(),
        member_display_name: identity.displayName,
        member_username: identity.username,
        role_snapshot: memberRoles(member),
      };
    });
    const { data, error } = await supabase.rpc('backfill_discord_member_lifecycle_snapshots', {
      p_guild_id: config.guildId,
      p_members: snapshots,
    });
    if (error) throw new Error(`Unable to backfill Discord member leave snapshots: ${error.message}`);
    updated += typeof data === 'number' ? data : snapshots.length;
  }
  return updated;
}
