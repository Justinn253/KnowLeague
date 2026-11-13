import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildMember, type Invite, type Message, type PartialGuildMember } from 'discord.js';
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
  createdAt: number;
  expiresAt: number | null;
  inviterId: string | null;
  inviterUsername: string | null;
  maxUses: number;
  uses: number;
};

type InviteCache = {
  capturedAt: number;
  invites: Map<string, InviteSnapshot>;
  vanityUses: number | null;
};

type DeletedInviteSnapshot = {
  invite: InviteSnapshot;
  deletedAt: number;
};

type PendingInviteAttribution = {
  expiresAt: number;
  invite: InviteSnapshot;
};

type StoredInviteLeaderboardEntry = {
  discord_user_id: string;
  inviter_username: string | null;
  invite_count: number;
};

export type InviteLeaderboardEntry = {
  inviteCount: number;
  userId: string;
  username: string | null;
};

export type InviteTrackerInvitee = {
  joinedAt: Date;
  userId: string;
};

export type InviteMemberImport = {
  joinedAt: Date;
  memberDisplayName: string;
  memberUsername: string;
  roleSnapshot: Array<{ id: string; name: string }>;
  userId: string;
};

export type DiscordInviteTrackingStatus = {
  activeInviteCount: number | null;
  cacheAgeMilliseconds: number | null;
  canReceiveInviteEvents: boolean;
  canReadInviteUses: boolean;
  lastResolution: string | null;
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

type StoredSingleUseInviteClaim = {
  invite_code: string | null;
  inviter_discord_user_id: string | null;
  inviter_username: string | null;
  status: 'ambiguous' | 'matched' | 'none';
};

let cachedSettings: { expiresAt: number; guildId: string; value: MemberLifecycleSettings } | null = null;
const inviteCacheByGuildId = new Map<string, InviteCache>();
// InviteCreate can arrive while the first ready-time REST snapshot is still
// being fetched. Keep the event's zero-use state so that snapshot cannot turn
// a just-consumed direct invite into its own baseline.
const pendingInviteCreationsByGuildId = new Map<string, Map<string, InviteSnapshot>>();
const deletedInviteSnapshotsByGuildId = new Map<string, Map<string, DeletedInviteSnapshot>>();
const inviteCacheQueuesByGuildId = new Map<string, Promise<void>>();
const pendingInviteAttributionsByGuildId = new Map<string, PendingInviteAttribution[]>();
const lastInviteResolutionByGuildId = new Map<string, { at: number; detail: string }>();
const DELETED_INVITE_FALLBACK_WINDOW_MS = 5 * 60_000;
const PENDING_INVITE_ATTRIBUTION_WINDOW_MS = 30_000;
const SINGLE_USE_INVITE_PRE_JOIN_GRACE_MS = 5_000;
const SINGLE_USE_INVITE_POST_JOIN_WINDOW_MS = 20_000;
const INVITE_RESOLUTION_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000] as const;

function enqueueInviteCacheTask<T>(guildId: string, task: () => Promise<T>) {
  const previous = inviteCacheQueuesByGuildId.get(guildId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  const tail = current.then(() => undefined, () => undefined);
  inviteCacheQueuesByGuildId.set(guildId, tail);
  void tail.then(() => {
    if (inviteCacheQueuesByGuildId.get(guildId) === tail) inviteCacheQueuesByGuildId.delete(guildId);
  });
  return current;
}

function recordInviteResolution(guildId: string, detail: string) {
  lastInviteResolutionByGuildId.set(guildId, { at: Date.now(), detail });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

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

export async function getDiscordInviteLeaderboard(config: DiscordBotConfig, userId?: string): Promise<InviteLeaderboardEntry[]> {
  const { data, error } = await createBotServiceClient(config).rpc('get_discord_invite_leaderboard', {
    p_discord_user_id: userId ?? null,
    p_guild_id: config.guildId,
    p_limit: 10,
  });
  if (error) throw new Error(`Unable to load Discord invite leaderboard: ${error.message}`);
  return (data ?? []).flatMap((entry: unknown): InviteLeaderboardEntry[] => {
    const result = entry as Partial<StoredInviteLeaderboardEntry>;
    return typeof result.discord_user_id === 'string' && typeof result.invite_count === 'number'
      ? [{ inviteCount: result.invite_count, userId: result.discord_user_id, username: result.inviter_username ?? null }]
      : [];
  });
}

/**
 * Stores an administrator-supplied total as a baseline. New verified joins
 * remain additive, and verified departures still decrement the total, just as
 * they do for an imported Invite Tracker baseline.
 */
export async function setDiscordInviteCount(
  config: DiscordBotConfig,
  inviter: Pick<InviteLeaderboardEntry, 'userId' | 'username'>,
  inviteCount: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('set_discord_invite_count', {
    p_guild_id: config.guildId,
    p_invite_count: inviteCount,
    p_inviter_discord_user_id: inviter.userId,
    p_inviter_username: inviter.username,
  });
  if (error) throw new Error(`Unable to set Discord invite count: ${error.message}`);
  if (typeof data !== 'number') throw new Error('Discord invite count update did not return a total.');
  return data;
}

export async function importDiscordInviteLeaderboard(config: DiscordBotConfig, entries: readonly InviteLeaderboardEntry[]) {
  const { data, error } = await createBotServiceClient(config).rpc('import_discord_invite_leaderboard', {
    p_entries: entries.map((entry) => ({
      discord_user_id: entry.userId,
      invite_count: entry.inviteCount,
      inviter_username: entry.username,
    })),
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to import Discord invite leaderboard: ${error.message}`);
  return typeof data === 'number' ? data : entries.length;
}

export async function importDiscordInvitedMembers(
  config: DiscordBotConfig,
  inviter: { userId: string; username: string },
  members: readonly InviteMemberImport[],
) {
  const { data, error } = await createBotServiceClient(config).rpc('import_discord_invited_members', {
    p_guild_id: config.guildId,
    p_inviter_discord_user_id: inviter.userId,
    p_inviter_username: inviter.username,
    p_members: members.map((member) => ({
      discord_user_id: member.userId,
      joined_at: member.joinedAt.toISOString(),
      member_display_name: member.memberDisplayName,
      member_username: member.memberUsername,
      role_snapshot: member.roleSnapshot,
    })),
  });
  if (error) throw new Error(`Unable to import Discord invited members: ${error.message}`);
  return typeof data === 'number' ? data : members.length;
}

export function formatMemberLifecycleTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(user|inviter|inviteCount)\}/g, (placeholder, key: keyof typeof values) => String(values[key] ?? placeholder));
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (!quoted && character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.');
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function parseInviteTrackerCsv(csv: string) {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error('The CSV does not contain any invite entries.');
  const header = rows[0].map((value) => value.replace(/^\uFEFF/, '').trim().toLowerCase());
  const entries = rows.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ''])));
  return entries;
}

function parseNonNegativeInteger(value: string, description: string) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error(`${description} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 1_000_000) throw new Error(`${description} is outside the supported range.`);
  return parsed;
}

function requireInviteTrackerColumn(rows: Array<Record<string, string>>, column: string) {
  if (!rows.length || !(column in rows[0])) throw new Error(`The CSV must include an \`${column}\` column from Invite Tracker.`);
}

export function parseInviteTrackerLeaderboardCsv(csv: string): InviteLeaderboardEntry[] {
  const rows = parseInviteTrackerCsv(csv);
  requireInviteTrackerColumn(rows, 'user_id');
  requireInviteTrackerColumn(rows, 'invites');
  const userIds = new Set<string>();
  return rows.map((row, index) => {
    const userId = row.user_id;
    if (!/^\d{17,20}$/.test(userId)) throw new Error(`Row ${index + 2} has an invalid Discord user ID.`);
    if (userIds.has(userId)) throw new Error(`The CSV has duplicate entries for Discord user ${userId}.`);
    userIds.add(userId);
    return {
      inviteCount: parseNonNegativeInteger(row.invites, `Row ${index + 2} invite count`),
      userId,
      username: null,
    };
  });
}

export function parseInviteTrackerInvitedMembersCsv(csv: string): InviteTrackerInvitee[] {
  const rows = parseInviteTrackerCsv(csv);
  requireInviteTrackerColumn(rows, 'user_id');
  requireInviteTrackerColumn(rows, 'joined_at');
  requireInviteTrackerColumn(rows, 'fake');
  const userIds = new Set<string>();
  return rows.flatMap((row, index) => {
    const userId = row.user_id;
    if (!/^\d{17,20}$/.test(userId)) throw new Error(`Row ${index + 2} has an invalid Discord user ID.`);
    if (userIds.has(userId)) throw new Error(`The CSV has duplicate entries for Discord user ${userId}.`);
    userIds.add(userId);
    const fake = row.fake.toLowerCase();
    if (!['0', 'false', 'no', '1', 'true', 'yes'].includes(fake)) throw new Error(`Row ${index + 2} has an invalid fake-invite value.`);
    if (['1', 'true', 'yes'].includes(fake)) return [];
    const joinedAt = new Date(row.joined_at);
    if (Number.isNaN(joinedAt.getTime())) throw new Error(`Row ${index + 2} has an invalid joined_at timestamp.`);
    return [{ joinedAt, userId }];
  });
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

export function buildDiscordLeaveFailurePanel(member: GuildMember | PartialGuildMember) {
  return new EmbedBuilder()
    .setColor(0xF59E0B)
    .setTitle('Member left - details unavailable')
    .setDescription([
      `**Member:** <@${member.id}>`,
      `**Username:** ${member.user.username}`,
      'The bot could not generate the complete leave-information panel. Server administrators should check the bot deployment logs and database migrations.',
    ].join('\n'))
    .setTimestamp();
}

export async function postDiscordMemberLeaveFailure(config: DiscordBotConfig, member: GuildMember | PartialGuildMember) {
  if (member.guild.id !== config.guildId || member.user.bot) return false;
  const settings = await getMemberLifecycleSettings(config);
  if (!settings.leaveMessageChannelId) return false;
  const channel = await member.guild.channels.fetch(settings.leaveMessageChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`Discord leave-panel fallback channel ${settings.leaveMessageChannelId} is unavailable, not text-based, or not sendable.`);
    return false;
  }
  await channel.send({
    allowedMentions: { parse: [] },
    embeds: [buildDiscordLeaveFailurePanel(member)],
  });
  return true;
}

export async function handleDiscordMemberLeave(config: DiscordBotConfig, member: GuildMember | PartialGuildMember) {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  // Resolve the configured destination first. This also caches it so the
  // guarded fallback can still post if a later database write fails.
  const settings = await getMemberLifecycleSettings(config);
  const [identity, level] = await Promise.all([
    Promise.resolve(memberIdentity(member)),
    getDiscordLevelProgress(config, member.id)
      .then((progress) => progress.level)
      .catch((error: unknown) => {
        console.error(`Unable to load chat XP for departing Discord member ${member.id}; using level 0 in the leave panel.`, error);
        return 0;
      }),
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

function inviteSnapshotFromInvite(invite: Invite, previous?: InviteSnapshot): InviteSnapshot {
  return {
    code: invite.code,
    createdAt: invite.createdAt?.getTime() ?? previous?.createdAt ?? Date.now(),
    expiresAt: invite.expiresAt?.getTime() ?? previous?.expiresAt ?? null,
    inviterId: invite.inviter?.id ?? previous?.inviterId ?? null,
    inviterUsername: invite.inviter?.username ?? previous?.inviterUsername ?? null,
    maxUses: invite.maxUses ?? previous?.maxUses ?? 0,
    uses: invite.uses ?? previous?.uses ?? 0,
  };
}

function inviteCacheFromGuild(invites: Awaited<ReturnType<Guild['invites']['fetch']>>, vanityUses: number | null): InviteCache {
  return {
    capturedAt: Date.now(),
    invites: new Map([...invites.values()].map((invite) => [invite.code, inviteSnapshotFromInvite(invite)])),
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
  await enqueueInviteCacheTask(guild.id, async () => {
    const cache = await readGuildInvites(guild);
    if (!cache) return;
    const pendingCreations = pendingInviteCreationsByGuildId.get(guild.id);
    if (pendingCreations) {
      for (const invite of pendingCreations.values()) cache.invites.set(invite.code, invite);
      pendingInviteCreationsByGuildId.delete(guild.id);
    }
    inviteCacheByGuildId.set(guild.id, cache);
  });
}

/**
 * Keep the use count observed at Discord's invite-create event. Refetching at
 * this point is racy for a one-use direct invite: the recipient may join and
 * consume it before REST returns, incorrectly making use #1 the baseline.
 */
export async function rememberDiscordInviteCreation(config: DiscordBotConfig, invite: Invite) {
  const guild = invite.guild;
  if (!guild || guild.id !== config.guildId) return;
  await enqueueInviteCacheTask(guild.id, async () => {
    const cache = inviteCacheByGuildId.get(guild.id);
    const snapshot = inviteSnapshotFromInvite(invite, cache?.invites.get(invite.code));
    if (!cache) {
      const pendingCreations = pendingInviteCreationsByGuildId.get(guild.id) ?? new Map<string, InviteSnapshot>();
      pendingCreations.set(invite.code, snapshot);
      pendingInviteCreationsByGuildId.set(guild.id, pendingCreations);
      return;
    }
    cache.invites.set(invite.code, snapshot);
    cache.capturedAt = Date.now();
  });
}

export async function getDiscordInviteTrackingStatus(config: DiscordBotConfig, guild: Guild): Promise<DiscordInviteTrackingStatus> {
  if (guild.id !== config.guildId) {
    return {
      activeInviteCount: null,
      cacheAgeMilliseconds: null,
      canReceiveInviteEvents: false,
      canReadInviteUses: false,
      lastResolution: null,
    };
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const cache = inviteCacheByGuildId.get(guild.id);
  const latest = lastInviteResolutionByGuildId.get(guild.id);
  return {
    activeInviteCount: cache?.invites.size ?? null,
    cacheAgeMilliseconds: cache ? Math.max(0, Date.now() - cache.capturedAt) : null,
    canReceiveInviteEvents: Boolean(botMember?.permissions.has(PermissionFlagsBits.ManageChannels)),
    canReadInviteUses: Boolean(botMember?.permissions.has(PermissionFlagsBits.ManageGuild)),
    lastResolution: latest ? `${latest.detail} <t:${Math.floor(latest.at / 1_000)}:R>` : null,
  };
}

function inviteSource(invite: InviteSnapshot): DiscordJoinSource {
  return {
    kind: 'invite',
    inviteCode: invite.code,
    inviterId: invite.inviterId,
    inviterUsername: invite.inviterUsername,
  };
}

function pruneDeletedInviteSnapshots(guildId: string, now: number) {
  const deleted = deletedInviteSnapshotsByGuildId.get(guildId);
  if (!deleted) return;
  for (const [code, snapshot] of deleted) {
    if (now - snapshot.deletedAt > DELETED_INVITE_FALLBACK_WINDOW_MS) deleted.delete(code);
  }
  if (!deleted.size) deletedInviteSnapshotsByGuildId.delete(guildId);
}

function queuePendingInviteAttributions(guildId: string, invite: InviteSnapshot, count: number, now: number) {
  if (count < 1) return;
  const pending = pendingInviteAttributionsByGuildId.get(guildId) ?? [];
  for (let index = 0; index < count; index += 1) {
    pending.push({ expiresAt: now + PENDING_INVITE_ATTRIBUTION_WINDOW_MS, invite });
  }
  pendingInviteAttributionsByGuildId.set(guildId, pending);
}

function takePendingInviteAttribution(guildId: string, now: number) {
  const pending = pendingInviteAttributionsByGuildId.get(guildId);
  if (!pending) return null;
  while (pending[0]?.expiresAt <= now) pending.shift();
  const attribution = pending.shift() ?? null;
  if (!pending.length) pendingInviteAttributionsByGuildId.delete(guildId);
  return attribution?.invite ?? null;
}

export function isSafeSingleUseUnavailableInviteMatch(
  invite: Pick<InviteSnapshot, 'createdAt' | 'expiresAt' | 'maxUses'>,
  joinedAt: number,
  unavailableAt: number,
) {
  return invite.maxUses === 1
    && invite.createdAt <= joinedAt + SINGLE_USE_INVITE_PRE_JOIN_GRACE_MS
    && (invite.expiresAt === null || invite.expiresAt >= joinedAt - SINGLE_USE_INVITE_PRE_JOIN_GRACE_MS)
    && unavailableAt >= joinedAt - SINGLE_USE_INVITE_PRE_JOIN_GRACE_MS
    && unavailableAt <= joinedAt + SINGLE_USE_INVITE_POST_JOIN_WINDOW_MS;
}

function takeDeletedInviteAttribution(
  guildId: string,
  previous: InviteCache,
  current: InviteCache,
  joinedAt: number,
  now: number,
) {
  pruneDeletedInviteSnapshots(guildId, now);
  const candidates = new Map<string, InviteSnapshot>();
  for (const invite of previous.invites.values()) {
    if (!current.invites.has(invite.code) && isSafeSingleUseUnavailableInviteMatch(invite, joinedAt, now)) {
      candidates.set(invite.code, invite);
    }
  }
  for (const deleted of deletedInviteSnapshotsByGuildId.get(guildId)?.values() ?? []) {
    if (isSafeSingleUseUnavailableInviteMatch(deleted.invite, joinedAt, deleted.deletedAt)) {
      candidates.set(deleted.invite.code, deleted.invite);
    }
  }
  if (candidates.size !== 1) return null;
  const invite = candidates.values().next().value as InviteSnapshot;
  deletedInviteSnapshotsByGuildId.get(guildId)?.delete(invite.code);
  return invite;
}

export async function rememberDiscordInviteDeletion(config: DiscordBotConfig, invite: Invite) {
  const guild = invite.guild;
  if (!guild || guild.id !== config.guildId) return;
  const unavailableAt = Date.now();
  await enqueueInviteCacheTask(guild.id, async () => {
    const cache = inviteCacheByGuildId.get(guild.id);
    const previous = cache?.invites.get(invite.code);
    const deleted = deletedInviteSnapshotsByGuildId.get(guild.id) ?? new Map<string, DeletedInviteSnapshot>();
    deleted.set(invite.code, {
      deletedAt: unavailableAt,
      invite: inviteSnapshotFromInvite(invite, previous),
    });
    deletedInviteSnapshotsByGuildId.set(guild.id, deleted);
    cache?.invites.delete(invite.code);
    if (cache) cache.capturedAt = Date.now();
    pruneDeletedInviteSnapshots(guild.id, unavailableAt);
  });
  const { error } = await createBotServiceClient(config).rpc('mark_discord_single_use_invite_deleted', {
    p_guild_id: guild.id,
    p_invite_code: invite.code,
  });
  if (error) throw new Error(`Unable to mark a Discord single-use invite as deleted: ${error.message}`);
}

export async function trackDiscordSingleUseInvite(config: DiscordBotConfig, invite: Invite) {
  const guild = invite.guild;
  if (!guild || guild.id !== config.guildId || invite.maxUses !== 1) return;
  const { error } = await createBotServiceClient(config).rpc('record_discord_single_use_invite', {
    p_created_at: (invite.createdAt ?? new Date()).toISOString(),
    p_expires_at: invite.expiresAt?.toISOString() ?? null,
    p_guild_id: guild.id,
    p_invite_code: invite.code,
    p_inviter_discord_user_id: invite.inviter?.id ?? null,
    p_inviter_username: invite.inviter?.username ?? null,
  });
  if (error) throw new Error(`Unable to record a Discord single-use invite: ${error.message}`);
}

async function resolveStoredSingleUseInvite(config: DiscordBotConfig, member: GuildMember) {
  try {
    const { data, error } = await createBotServiceClient(config).rpc('claim_discord_single_use_invite', {
      p_guild_id: member.guild.id,
      p_joining_discord_user_id: member.id,
      p_joined_at: memberJoinedAt(member).toISOString(),
    });
    if (error) throw new Error(error.message);
    const result = (Array.isArray(data) ? data[0] : data) as Partial<StoredSingleUseInviteClaim> | null;
    if (result?.status === 'matched' && result.invite_code && result.inviter_discord_user_id) {
      return {
        kind: 'invite' as const,
        inviteCode: result.invite_code,
        inviterId: result.inviter_discord_user_id,
        inviterUsername: result.inviter_username ?? null,
      };
    }
    return result?.status === 'ambiguous' ? 'ambiguous' as const : null;
  } catch (error) {
    console.error(`Unable to resolve stored Discord single-use invite for joining member ${member.id}.`, error);
    return null;
  }
}

async function markStoredSingleUseInviteConsumed(config: DiscordBotConfig, member: GuildMember, inviteCode: string) {
  const { error } = await createBotServiceClient(config).rpc('consume_discord_single_use_invite', {
    p_guild_id: member.guild.id,
    p_invite_code: inviteCode,
    p_joining_discord_user_id: member.id,
  });
  if (error) throw new Error(`Unable to mark a Discord single-use invite as consumed: ${error.message}`);
}

export async function resolveDiscordJoinSource(config: DiscordBotConfig, member: GuildMember): Promise<DiscordJoinSource> {
  const guild = member.guild;
  if (guild.id !== config.guildId) return { kind: 'unknown' };
  return enqueueInviteCacheTask(guild.id, async () => {
    const previous = inviteCacheByGuildId.get(guild.id);
    if (!previous) {
      const storedInvite = await resolveStoredSingleUseInvite(config, member);
      if (storedInvite && storedInvite !== 'ambiguous') {
        recordInviteResolution(guild.id, 'Matched stored single-use invite while the normal invite cache was unavailable');
        return storedInvite;
      }
      recordInviteResolution(guild.id, 'Unknown: the invite cache was not ready');
      return { kind: 'unknown' };
    }

    for (const retryDelay of INVITE_RESOLUTION_RETRY_DELAYS_MS) {
      if (retryDelay) await delay(retryDelay);
      const current = await readGuildInvites(guild);
      if (!current) {
        recordInviteResolution(guild.id, 'Unknown: Discord invite uses could not be read');
        return { kind: 'unknown' };
      }

      const increasedInvites = [...current.invites.values()]
        .filter((candidate) => candidate.uses > (previous.invites.get(candidate.code)?.uses ?? 0));
      if (increasedInvites.length === 1) {
        const invite = increasedInvites[0];
        const priorUses = previous.invites.get(invite.code)?.uses ?? 0;
        queuePendingInviteAttributions(guild.id, invite, Math.max(0, invite.uses - priorUses - 1), Date.now());
        inviteCacheByGuildId.set(guild.id, current);
        recordInviteResolution(guild.id, `Matched active server invite (${invite.uses - priorUses} new use${invite.uses - priorUses === 1 ? '' : 's'})`);
        return inviteSource(invite);
      }
      if (current.vanityUses !== null && previous.vanityUses !== null && current.vanityUses > previous.vanityUses) {
        inviteCacheByGuildId.set(guild.id, current);
        recordInviteResolution(guild.id, 'Matched the server vanity URL');
        return { kind: 'vanity' };
      }

      // Discord can remove a consumed one-use invite before a use-count
      // increment is readable. Only use it as a fallback if it was active at
      // this member's join, disappeared in the narrow join window, and is the
      // sole candidate. Never match an active or merely recent invite.
      const now = Date.now();
      if (increasedInvites.length === 0) {
        const deletedInvite = takeDeletedInviteAttribution(
          guild.id,
          previous,
          current,
          memberJoinedAt(member).getTime(),
          now,
        );
        if (deletedInvite) {
          inviteCacheByGuildId.set(guild.id, current);
          await markStoredSingleUseInviteConsumed(config, member, deletedInvite.code)
            .catch((error: unknown) => console.warn('Unable to persist a directly matched single-use invite consumption.', error));
          recordInviteResolution(guild.id, 'Matched the sole single-use invite that became unavailable at this join');
          return inviteSource(deletedInvite);
        }
        const pendingInvite = takePendingInviteAttribution(guild.id, now);
        if (pendingInvite) {
          inviteCacheByGuildId.set(guild.id, current);
          recordInviteResolution(guild.id, 'Matched a queued use of an active server invite');
          return inviteSource(pendingInvite);
        }
      }
      if (increasedInvites.length > 1) {
        inviteCacheByGuildId.set(guild.id, current);
        recordInviteResolution(guild.id, 'Unknown: multiple server invite use counts changed together');
        return { kind: 'unknown' };
      }
      if (retryDelay === INVITE_RESOLUTION_RETRY_DELAYS_MS[INVITE_RESOLUTION_RETRY_DELAYS_MS.length - 1]) {
        inviteCacheByGuildId.set(guild.id, current);
      }
    }
    const storedInvite = await resolveStoredSingleUseInvite(config, member);
    if (storedInvite && storedInvite !== 'ambiguous') {
      recordInviteResolution(guild.id, 'Matched the only eligible stored single-use invite');
      return storedInvite;
    }
    if (storedInvite === 'ambiguous') {
      recordInviteResolution(guild.id, 'Unknown: multiple stored single-use invites are eligible');
      return { kind: 'unknown' };
    }
    recordInviteResolution(guild.id, 'Unknown: no active server invite use changed after retries');
    return { kind: 'unknown' };
  });
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
