import { ChannelType, EmbedBuilder, OverwriteType, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type VoiceChannel, type VoiceState } from 'discord.js';
import { Routes } from 'discord-api-types/v10';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

const CONFIG_CACHE_MS = 30_000;
const COMMAND_EMPTY_EXPIRY_MS = 60_000;
const STATUS_MAX_LENGTH = 500;
const USER_LIMIT_MAXIMUM = 99;
const USER_LIST_MAXIMUM = 97;
const OVERWRITE_MAXIMUM = 100;
const AUTO_PING_MAXIMUM = 25;
const AUTO_PING_MESSAGE_MAX_LENGTH = 1_500;
const USER_ID_PATTERN = /^[0-9]{17,20}$/;
const USER_MENTION_PATTERN = /^<@!?(?<userId>[0-9]{17,20})>$/;

type SettingsRow = { join_to_create_channel_id: string | null };
type RoleRow = { discord_role_id: string };
type ChannelRow = {
  category_id: string; channel_id: string; creation_source: 'command' | 'join_to_create'; empty_expires_at: string | null;
  admin_user_ids: unknown; auto_pings: unknown; deafened_all: boolean; deafened_user_ids: unknown; excluded_all: boolean; excluded_user_ids: unknown;
  included_user_ids: unknown; is_locked: boolean; maximum_users: number; muted_all: boolean; muted_user_ids: unknown; priority_speaker_user_ids: unknown;
  owner_discord_user_id: string; status: string | null;
  undeafened_user_ids: unknown; unmuted_user_ids: unknown;
};
type PresetRow = {
  admin_user_ids: unknown; auto_pings: unknown; channel_name: string; deafened_all: boolean; deafened_user_ids: unknown;
  excluded_all: boolean; excluded_user_ids: unknown; included_user_ids: unknown; is_locked: boolean; maximum_users: number;
  muted_all: boolean; muted_user_ids: unknown; priority_speaker_user_ids: unknown; status: string | null;
  undeafened_user_ids: unknown; unmuted_user_ids: unknown;
};
type DeafenStateRow = { discord_user_id: string };
type Overwrite = { allow?: bigint; deny?: bigint; id: string; type: OverwriteType };

export type DiscordTemporaryVoiceConfiguration = {
  creatorRoleIds: ReadonlySet<string>;
  joinToCreateChannelId: string | null;
  nonExcludableRoleIds: ReadonlySet<string>;
};

export type DiscordTemporaryVoiceChannel = {
  adminUserIds: readonly string[];
  autoPings: readonly DiscordTemporaryVoiceAutoPing[];
  categoryId: string;
  channelId: string;
  creationSource: 'command' | 'join_to_create';
  deafenedAll: boolean;
  deafenedUserIds: readonly string[];
  emptyExpiresAt: string | null;
  excludedAll: boolean;
  excludedUserIds: readonly string[];
  includedUserIds: readonly string[];
  isLocked: boolean;
  maximumUsers: number;
  mutedAll: boolean;
  mutedUserIds: readonly string[];
  ownerDiscordUserId: string;
  prioritySpeakerUserIds: readonly string[];
  status: string | null;
  undeafenedUserIds: readonly string[];
  unmutedUserIds: readonly string[];
};

export type DiscordTemporaryVoiceAutoPing = {
  kind: 'role' | 'user';
  message: string;
  targetId: string;
};

export type DiscordTemporaryVoiceMemberAction =
  | 'ban'
  | 'deafen'
  | 'deafen-all'
  | 'kick'
  | 'mute'
  | 'mute-all'
  | 'remove-admin'
  | 'remove-priority-speaker'
  | 'set-admin'
  | 'set-priority-speaker'
  | 'undeafen'
  | 'undeafen-all'
  | 'unmute'
  | 'unmute-all';

export type TemporaryVoiceUserList = { all: boolean; userIds: readonly string[] };
export type TemporaryVoiceChannelUpdate = {
  addExcludedUserIds?: readonly string[];
  addIncludedUserIds?: readonly string[];
  clearAllExclusions?: boolean;
  clearAllInclusions?: boolean;
  excludeAll?: boolean;
  isLocked?: boolean;
  maximumUsers?: number;
  name?: string;
  removeExcludedUserIds?: readonly string[];
  removeIncludedUserIds?: readonly string[];
  status?: string;
};

let cachedConfiguration: { expiresAt: number; guildId: string; value: DiscordTemporaryVoiceConfiguration } | null = null;
const emptyExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const joinToCreateReservations = new Map<string, Promise<void>>();

function storedUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((userId) => typeof userId === 'string' && USER_ID_PATTERN.test(userId) ? [userId] : []))];
}

function storedAutoPings(value: unknown): DiscordTemporaryVoiceAutoPing[] {
  if (!Array.isArray(value)) return [];
  const pings = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { kind, message, targetId } = entry as Partial<DiscordTemporaryVoiceAutoPing>;
    if ((kind !== 'role' && kind !== 'user') || typeof targetId !== 'string' || !USER_ID_PATTERN.test(targetId) || typeof message !== 'string') return [];
    const normalizedMessage = message.trim();
    return normalizedMessage && normalizedMessage.length <= AUTO_PING_MESSAGE_MAX_LENGTH
      ? [{ kind, message: normalizedMessage, targetId }]
      : [];
  });
  return pings.filter((ping, index) => index === pings.findIndex((candidate) => candidate.kind === ping.kind && candidate.targetId === ping.targetId && candidate.message === ping.message)).slice(0, AUTO_PING_MAXIMUM);
}

function toChannel(row: ChannelRow): DiscordTemporaryVoiceChannel {
  return {
    categoryId: row.category_id, channelId: row.channel_id, creationSource: row.creation_source, emptyExpiresAt: row.empty_expires_at,
    adminUserIds: storedUserIds(row.admin_user_ids), autoPings: storedAutoPings(row.auto_pings), deafenedAll: row.deafened_all,
    deafenedUserIds: storedUserIds(row.deafened_user_ids),
    excludedAll: row.excluded_all, excludedUserIds: storedUserIds(row.excluded_user_ids), includedUserIds: storedUserIds(row.included_user_ids),
    isLocked: row.is_locked, maximumUsers: row.maximum_users, mutedAll: row.muted_all, mutedUserIds: storedUserIds(row.muted_user_ids),
    ownerDiscordUserId: row.owner_discord_user_id, prioritySpeakerUserIds: storedUserIds(row.priority_speaker_user_ids), status: row.status,
    undeafenedUserIds: storedUserIds(row.undeafened_user_ids), unmutedUserIds: storedUserIds(row.unmuted_user_ids),
  };
}

function normalizeName(value: string) {
  const name = value.trim();
  if (!name || name.length > 100) throw new Error('Voice channel names must contain between 1 and 100 characters.');
  return name;
}

function normalizeStatus(value: string) {
  const status = value.trim();
  if (!status || status.length > STATUS_MAX_LENGTH) throw new Error(`Voice channel status must contain between 1 and ${STATUS_MAX_LENGTH} characters.`);
  return status;
}

function normalizeLimit(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > USER_LIMIT_MAXIMUM) throw new Error(`Voice channel maximum users must be between 0 and ${USER_LIMIT_MAXIMUM}.`);
  return value;
}

function normalizeUserIds(userIds: readonly string[], ownerId: string, label: string) {
  const normalized = [...new Set(userIds)];
  if (normalized.length !== userIds.length) throw new Error(`Choose each member only once in the ${label} list.`);
  if (normalized.length > USER_LIST_MAXIMUM) throw new Error(`Discord supports up to ${USER_LIST_MAXIMUM} members in a temporary voice access list.`);
  if (normalized.some((userId) => !USER_ID_PATTERN.test(userId))) throw new Error(`Every ${label} member must be a valid Discord user.`);
  if (normalized.includes(ownerId)) throw new Error(`You do not need to add the channel owner to the ${label} list.`);
  return normalized;
}

function assertDistinctLists(excludedUserIds: readonly string[], includedUserIds: readonly string[]) {
  if (excludedUserIds.some((userId) => includedUserIds.includes(userId))) throw new Error('A member cannot be both included and excluded from a temporary voice channel.');
}

export function parseTemporaryVoiceUserList(value: string | null): TemporaryVoiceUserList {
  if (!value?.trim()) return { all: false, userIds: [] };
  if (value.trim().toLowerCase() === 'all') return { all: true, userIds: [] };
  const userIds = value.trim().split(/[\s,]+/).map((entry) => {
    const userId = USER_MENTION_PATTERN.exec(entry)?.groups?.userId ?? entry;
    if (!USER_ID_PATTERN.test(userId)) throw new Error('Enter Discord @mentions or user IDs separated by spaces or commas, or enter All.');
    return userId;
  });
  if (new Set(userIds).size !== userIds.length) throw new Error('Choose each member only once in an access list.');
  return { all: false, userIds };
}

export function temporaryVoiceMemberHasCreatorRole(memberRoleIds: Iterable<string>, creatorRoleIds: ReadonlySet<string>) {
  for (const roleId of memberRoleIds) if (creatorRoleIds.has(roleId)) return true;
  return false;
}

export async function getDiscordTemporaryVoiceConfiguration(config: DiscordBotConfig): Promise<DiscordTemporaryVoiceConfiguration> {
  const now = Date.now();
  if (cachedConfiguration?.guildId === config.guildId && cachedConfiguration.expiresAt > now) return cachedConfiguration.value;
  const supabase = createBotServiceClient(config);
  const [settings, creators, protectedRoles] = await Promise.all([
    supabase.from('discord_temporary_voice_settings').select('join_to_create_channel_id').eq('guild_id', config.guildId).maybeSingle<SettingsRow>(),
    supabase.from('discord_temporary_voice_creator_roles').select('discord_role_id').eq('guild_id', config.guildId).returns<RoleRow[]>(),
    supabase.from('discord_temporary_voice_non_excludable_roles').select('discord_role_id').eq('guild_id', config.guildId).returns<RoleRow[]>(),
  ]);
  if (settings.error) throw new Error(`Unable to load temporary voice settings: ${settings.error.message}`);
  if (creators.error) throw new Error(`Unable to load temporary voice creator roles: ${creators.error.message}`);
  if (protectedRoles.error) throw new Error(`Unable to load temporary voice protected roles: ${protectedRoles.error.message}`);
  const value = {
    creatorRoleIds: new Set((creators.data ?? []).map((entry) => entry.discord_role_id)),
    joinToCreateChannelId: settings.data?.join_to_create_channel_id ?? null,
    nonExcludableRoleIds: new Set((protectedRoles.data ?? []).map((entry) => entry.discord_role_id)),
  };
  cachedConfiguration = { expiresAt: now + CONFIG_CACHE_MS, guildId: config.guildId, value };
  return value;
}

async function getChannel(config: DiscordBotConfig, channelId: string) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_channels')
    .select('admin_user_ids, auto_pings, category_id, channel_id, creation_source, deafened_all, deafened_user_ids, empty_expires_at, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, muted_all, muted_user_ids, owner_discord_user_id, priority_speaker_user_ids, status, undeafened_user_ids, unmuted_user_ids')
    .eq('guild_id', config.guildId).eq('channel_id', channelId).maybeSingle<ChannelRow>();
  if (error) throw new Error(`Unable to load temporary voice channel: ${error.message}`);
  return data ? toChannel(data) : null;
}

async function getChannels(config: DiscordBotConfig) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_channels')
    .select('admin_user_ids, auto_pings, category_id, channel_id, creation_source, deafened_all, deafened_user_ids, empty_expires_at, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, muted_all, muted_user_ids, owner_discord_user_id, priority_speaker_user_ids, status, undeafened_user_ids, unmuted_user_ids')
    .eq('guild_id', config.guildId).returns<ChannelRow[]>();
  if (error) throw new Error(`Unable to load temporary voice channels: ${error.message}`);
  return (data ?? []).map(toChannel);
}

async function storeChannel(config: DiscordBotConfig, channel: DiscordTemporaryVoiceChannel) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_channels').upsert({
    category_id: channel.categoryId, channel_id: channel.channelId, creation_source: channel.creationSource, empty_expires_at: channel.emptyExpiresAt,
    admin_user_ids: channel.adminUserIds, auto_pings: channel.autoPings, deafened_all: channel.deafenedAll, deafened_user_ids: channel.deafenedUserIds,
    excluded_all: channel.excludedAll, excluded_user_ids: channel.excludedUserIds, guild_id: config.guildId, included_user_ids: channel.includedUserIds,
    is_locked: channel.isLocked, maximum_users: channel.maximumUsers, muted_all: channel.mutedAll, muted_user_ids: channel.mutedUserIds,
    owner_discord_user_id: channel.ownerDiscordUserId, priority_speaker_user_ids: channel.prioritySpeakerUserIds, status: channel.status,
    undeafened_user_ids: channel.undeafenedUserIds, unmuted_user_ids: channel.unmutedUserIds, updated_at: new Date().toISOString(),
  }, { onConflict: 'channel_id' });
  if (error) throw new Error(`Unable to save temporary voice channel: ${error.message}`);
}

async function removeChannel(config: DiscordBotConfig, channelId: string) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_channels').delete().eq('guild_id', config.guildId).eq('channel_id', channelId);
  if (error) throw new Error(`Unable to remove temporary voice channel: ${error.message}`);
}

async function setExpiry(config: DiscordBotConfig, channelId: string, emptyExpiresAt: string | null) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_channels')
    .update({ empty_expires_at: emptyExpiresAt, updated_at: new Date().toISOString() }).eq('guild_id', config.guildId).eq('channel_id', channelId);
  if (error) throw new Error(`Unable to update temporary voice channel expiry: ${error.message}`);
}

async function getManagedSource(guild: Guild, channelId: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice || !channel.parentId) throw new Error('The configured Join to Create voice channel is unavailable or is not inside a category.');
  const botMember = await guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.DeafenMembers])) {
    throw new Error('KnowLeague needs View Channel, Send Messages, Manage Channels, Move Members, and Deafen Members in the configured Join to Create channel.');
  }
  return channel;
}

async function setStatus(channel: VoiceChannel, status: string) {
  const botMember = await channel.guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SetVoiceChannelStatus)) throw new Error('KnowLeague needs Set Voice Channel Status to set a temporary voice-channel status.');
  await channel.guild.client.rest.put(Routes.channelVoiceStatus(channel.id), { body: { status } });
}

async function assertExcludable(guild: Guild, userIds: readonly string[], protectedRoleIds: ReadonlySet<string>) {
  if (!userIds.length || !protectedRoleIds.size) return;
  const members = await Promise.all(userIds.map((userId) => guild.members.fetch(userId).catch(() => null)));
  if (members.some((member) => member && temporaryVoiceMemberHasCreatorRole(member.roles.cache.keys(), protectedRoleIds))) {
    throw new Error('Members with a role protected from temporary voice exclusions cannot be excluded.');
  }
}

function restrictedAccess(channel: Pick<DiscordTemporaryVoiceChannel, 'excludedAll' | 'includedUserIds' | 'isLocked'>) {
  return channel.isLocked || channel.excludedAll || channel.includedUserIds.length > 0;
}

function put(overwrites: Map<string, Overwrite>, id: string, type: OverwriteType, allow = 0n, deny = 0n) {
  overwrites.set(id, { allow, deny, id, type });
}

function grant(overwrites: Map<string, Overwrite>, id: string, type: OverwriteType, permissions: bigint) {
  const current = overwrites.get(id) ?? { id, type };
  put(overwrites, id, type, ((current.allow ?? 0n) | permissions) & ~(current.deny ?? 0n), (current.deny ?? 0n) & ~permissions);
}

function deny(overwrites: Map<string, Overwrite>, id: string, type: OverwriteType, permissions: bigint) {
  const current = overwrites.get(id) ?? { id, type };
  const allow = (current.allow ?? 0n) & ~permissions;
  put(overwrites, id, type, allow, ((current.deny ?? 0n) | permissions) & ~allow);
}

function memberIsDeafened(channel: Pick<DiscordTemporaryVoiceChannel, 'deafenedAll' | 'deafenedUserIds' | 'undeafenedUserIds'>, userId: string) {
  return channel.deafenedAll ? !channel.undeafenedUserIds.includes(userId) : channel.deafenedUserIds.includes(userId);
}

function buildOverwrites(source: VoiceChannel, channel: Pick<DiscordTemporaryVoiceChannel, 'excludedAll' | 'excludedUserIds' | 'includedUserIds' | 'isLocked' | 'mutedAll' | 'mutedUserIds' | 'ownerDiscordUserId' | 'prioritySpeakerUserIds' | 'unmutedUserIds'>, botUserId: string, protectedRoleIds: ReadonlySet<string>) {
  const overwrites = new Map<string, Overwrite>();
  if (restrictedAccess(channel)) {
    deny(overwrites, source.guild.roles.everyone.id, OverwriteType.Role, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect);
    grant(overwrites, botUserId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers | PermissionFlagsBits.DeafenMembers | PermissionFlagsBits.SetVoiceChannelStatus);
    grant(overwrites, channel.ownerDiscordUserId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
    if (!channel.isLocked) {
      for (const roleId of protectedRoleIds) {
        if (roleId !== source.guild.roles.everyone.id) grant(overwrites, roleId, OverwriteType.Role, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
      }
      for (const userId of channel.includedUserIds) grant(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
    }
  } else {
    for (const overwrite of source.parent?.permissionOverwrites.cache.values() ?? []) put(overwrites, overwrite.id, overwrite.type, overwrite.allow.bitfield, overwrite.deny.bitfield);
  }
  for (const userId of channel.excludedUserIds) deny(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect);
  if (channel.mutedAll) {
    deny(overwrites, source.guild.roles.everyone.id, OverwriteType.Role, PermissionFlagsBits.Speak);
    for (const userId of channel.unmutedUserIds) grant(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.Speak);
  } else {
    for (const userId of channel.mutedUserIds) deny(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.Speak);
  }
  for (const userId of channel.prioritySpeakerUserIds) grant(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.PrioritySpeaker);
  if (overwrites.size > OVERWRITE_MAXIMUM) throw new Error('This temporary voice channel exceeds Discord’s 100 permission-overwrite limit.');
  return [...overwrites.values()];
}

async function applyAccess(channel: VoiceChannel, record: DiscordTemporaryVoiceChannel, protectedRoleIds: ReadonlySet<string>) {
  const botMember = await channel.guild.members.fetchMe();
  await channel.permissionOverwrites.set(buildOverwrites(channel, record, botMember.id, protectedRoleIds), 'KnowLeague temporary voice channel access configuration');
}

async function positionAtBottom(channel: VoiceChannel) {
  const positions = [...channel.guild.channels.cache.values()].filter((candidate): candidate is VoiceChannel => candidate.type === ChannelType.GuildVoice && candidate.parentId === channel.parentId).map((candidate) => candidate.rawPosition);
  await channel.setPosition(positions.length ? Math.max(...positions) + 1 : channel.rawPosition).catch((error: unknown) => console.warn(`Unable to move temporary voice channel ${channel.id} to the category bottom.`, error));
}

type VoiceControls = Pick<DiscordTemporaryVoiceChannel,
  'adminUserIds' | 'autoPings' | 'deafenedAll' | 'deafenedUserIds' | 'mutedAll' | 'mutedUserIds' | 'prioritySpeakerUserIds' | 'undeafenedUserIds' | 'unmutedUserIds'>;

function defaultVoiceControls(): VoiceControls {
  return {
    adminUserIds: [], autoPings: [], deafenedAll: false, deafenedUserIds: [], mutedAll: false, mutedUserIds: [],
    prioritySpeakerUserIds: [], undeafenedUserIds: [], unmutedUserIds: [],
  };
}

type CreateOptions = {
  creationSource: DiscordTemporaryVoiceChannel['creationSource']; emptyExpiresAt: string | null; excludedAll: boolean; excludedUserIds: readonly string[]; includedUserIds: readonly string[];
  controls: VoiceControls; isLocked: boolean; maximumUsers: number; name: string; owner: GuildMember; protectedRoleIds: ReadonlySet<string>; source: VoiceChannel; status: string | null;
};

async function createChannel(config: DiscordBotConfig, options: CreateOptions) {
  const excludedUserIds = normalizeUserIds(options.excludedUserIds, options.owner.id, 'excluded');
  const includedUserIds = normalizeUserIds(options.includedUserIds, options.owner.id, 'included');
  assertDistinctLists(excludedUserIds, includedUserIds);
  const botUserId = options.owner.guild.client.user?.id;
  if (botUserId && [...excludedUserIds, ...includedUserIds].includes(botUserId)) throw new Error('You cannot add KnowLeague to a temporary voice access list.');
  await assertExcludable(options.owner.guild, excludedUserIds, options.protectedRoleIds);
  const recordWithoutId: Omit<DiscordTemporaryVoiceChannel, 'channelId'> = {
    categoryId: options.source.parentId!, creationSource: options.creationSource, emptyExpiresAt: options.emptyExpiresAt, excludedAll: options.excludedAll,
    excludedUserIds, includedUserIds, ...options.controls, isLocked: options.isLocked, maximumUsers: normalizeLimit(options.maximumUsers), ownerDiscordUserId: options.owner.id,
    status: options.status === null ? null : normalizeStatus(options.status),
  };
  const botMember = await options.owner.guild.members.fetchMe();
  const channel = await options.owner.guild.channels.create({
    name: normalizeName(options.name), parent: options.source.parentId, permissionOverwrites: buildOverwrites(options.source, recordWithoutId, botMember.id, options.protectedRoleIds),
    reason: `KnowLeague temporary voice channel for ${options.owner.user.username}`, type: ChannelType.GuildVoice, userLimit: recordWithoutId.maximumUsers,
  });
  try {
    const record = { ...recordWithoutId, channelId: channel.id };
    if (record.status) await setStatus(channel, record.status);
    await storeChannel(config, record);
    await positionAtBottom(channel);
    return { channel, record };
  } catch (error) {
    await channel.delete('KnowLeague temporary voice setup failed.').catch((deleteError: unknown) => console.error(`Unable to delete failed temporary voice channel ${channel.id}.`, deleteError));
    throw error;
  }
}

async function deleteChannel(config: DiscordBotConfig, guild: Guild, channelId: string, reason: string) {
  const timer = emptyExpiryTimers.get(channelId);
  if (timer) clearTimeout(timer);
  emptyExpiryTimers.delete(channelId);
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.type === ChannelType.GuildVoice) {
    if (!channel.deletable) return console.warn(`Unable to delete temporary voice channel ${channelId}: the bot cannot delete it.`);
    for (const member of channel.members.values()) {
      await releaseTemporaryVoiceDeafen(config, channelId, member).catch((error: unknown) => console.warn(`Unable to release temporary voice deafen for ${member.id}.`, error));
    }
    try { await channel.delete(reason); } catch (error) { console.warn(`Unable to delete temporary voice channel ${channelId}.`, error); return; }
  }
  await removeChannel(config, channelId);
}

async function expireIfEmpty(config: DiscordBotConfig, guild: Guild, channelId: string) {
  const record = await getChannel(config, channelId);
  if (!record) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.type !== ChannelType.GuildVoice) return removeChannel(config, channelId);
  if (channel.members.size > 0) return setExpiry(config, channelId, null);
  await deleteChannel(config, guild, channelId, 'KnowLeague temporary voice channel was not joined in time.');
}

function scheduleExpiry(config: DiscordBotConfig, guild: Guild, channelId: string, emptyExpiresAt: string | null) {
  const current = emptyExpiryTimers.get(channelId);
  if (current) clearTimeout(current);
  emptyExpiryTimers.delete(channelId);
  if (!emptyExpiresAt) return;
  const timer = setTimeout(() => {
    emptyExpiryTimers.delete(channelId);
    void expireIfEmpty(config, guild, channelId).catch((error: unknown) => console.error(`Temporary voice expiry failed for ${channelId}.`, error));
  }, Math.max(0, new Date(emptyExpiresAt).getTime() - Date.now()));
  timer.unref();
  emptyExpiryTimers.set(channelId, timer);
}

async function getCommandOwner(config: DiscordBotConfig, interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const settings = await getDiscordTemporaryVoiceConfiguration(config);
  if (!settings.joinToCreateChannelId) throw new Error('Temporary voice channels have not been configured for this server yet.');
  if (!settings.creatorRoleIds.size) throw new Error('No Discord roles have been configured to create temporary voice channels.');
  const owner = await guild.members.fetch(interaction.user.id);
  if (!temporaryVoiceMemberHasCreatorRole(owner.roles.cache.keys(), settings.creatorRoleIds)) throw new Error('You do not have a Discord role allowed to create a temporary voice channel.');
  return { guild, owner, settings, source: await getManagedSource(guild, settings.joinToCreateChannelId) };
}

type VoiceCommandContext = {
  channel: VoiceChannel;
  member: GuildMember;
  record: DiscordTemporaryVoiceChannel;
  settings: DiscordTemporaryVoiceConfiguration;
};

async function getVoiceCommandContext(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, commandName: string, allowDelegatedAdministrator: boolean): Promise<VoiceCommandContext> {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const member = await guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error(`Join your temporary voice channel before using /${commandName}.`);
  if (interaction.channelId !== channel.id) throw new Error(`Use /${commandName} in the chat for the temporary voice channel you are in.`);
  const record = await getChannel(config, channel.id);
  if (!record) throw new Error('You can only use this command in a temporary voice channel created by KnowLeague.');
  const isOwner = record.ownerDiscordUserId === member.id;
  if (!isOwner && (!allowDelegatedAdministrator || !record.adminUserIds.includes(member.id))) {
    throw new Error('Only the temporary voice channel owner can use this command.');
  }
  return { channel, member, record, settings: await getDiscordTemporaryVoiceConfiguration(config) };
}

export async function createDiscordTemporaryVoiceChannelFromCommand(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, options: { excludedAll: boolean; excludedUserIds: readonly string[]; includedUserIds: readonly string[]; maximumUsers: number; name: string; status: string | null }) {
  const { guild, owner, settings, source } = await getCommandOwner(config, interaction);
  const emptyExpiresAt = new Date(Date.now() + COMMAND_EMPTY_EXPIRY_MS).toISOString();
  const created = await createChannel(config, { creationSource: 'command', controls: defaultVoiceControls(), emptyExpiresAt, excludedAll: options.excludedAll, excludedUserIds: options.excludedUserIds, includedUserIds: options.includedUserIds, isLocked: false, maximumUsers: options.maximumUsers, name: options.name, owner, protectedRoleIds: settings.nonExcludableRoleIds, source, status: options.status });
  scheduleExpiry(config, guild, created.channel.id, emptyExpiresAt);
  await publishCreatedVoiceChannel(created.channel, created.record, false);
  return created;
}

export async function configureDiscordTemporaryVoiceChannel(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, update: TemporaryVoiceChannelUpdate) {
  const { channel: voiceChannel, member: owner, record: existing, settings } = await getVoiceCommandContext(config, interaction, 'config-vc', false);
  const guild = voiceChannel.guild;
  if (update.excludeAll && update.clearAllExclusions) throw new Error('Use All in either excluded-users or clear-exclusions, not both.');
  const addExcluded = normalizeUserIds(update.addExcludedUserIds ?? [], owner.id, 'excluded');
  const removeExcluded = normalizeUserIds(update.removeExcludedUserIds ?? [], owner.id, 'excluded');
  const addIncluded = normalizeUserIds(update.addIncludedUserIds ?? [], owner.id, 'included');
  const removeIncluded = normalizeUserIds(update.removeIncludedUserIds ?? [], owner.id, 'included');
  if (addExcluded.some((id) => removeExcluded.includes(id)) || addIncluded.some((id) => removeIncluded.includes(id))) throw new Error('A member cannot be added to and cleared from the same temporary voice list in one update.');
  const oldExcluded = update.clearAllExclusions ? [] : existing.excludedUserIds.filter((id) => !removeExcluded.includes(id));
  const oldIncluded = update.clearAllInclusions ? [] : existing.includedUserIds.filter((id) => !removeIncluded.includes(id));
  const excludedUserIds = normalizeUserIds([...oldExcluded, ...addExcluded.filter((id) => !oldExcluded.includes(id))], owner.id, 'excluded');
  const includedUserIds = normalizeUserIds([...oldIncluded, ...addIncluded.filter((id) => !oldIncluded.includes(id))], owner.id, 'included');
  assertDistinctLists(excludedUserIds, includedUserIds);
  const botUserId = guild.client.user?.id;
  if (botUserId && [...excludedUserIds, ...includedUserIds].includes(botUserId)) throw new Error('You cannot add KnowLeague to a temporary voice access list.');
  await assertExcludable(guild, addExcluded, settings.nonExcludableRoleIds);
  const next: DiscordTemporaryVoiceChannel = {
    ...existing, excludedAll: update.clearAllExclusions ? false : update.excludeAll ?? existing.excludedAll, excludedUserIds, includedUserIds,
    isLocked: update.isLocked ?? existing.isLocked, maximumUsers: update.maximumUsers === undefined ? existing.maximumUsers : normalizeLimit(update.maximumUsers),
    status: update.status === undefined ? existing.status : normalizeStatus(update.status),
  };
  if (update.name !== undefined) await voiceChannel.setName(normalizeName(update.name), 'KnowLeague temporary voice owner configuration');
  if (update.maximumUsers !== undefined) await voiceChannel.setUserLimit(next.maximumUsers, 'KnowLeague temporary voice owner configuration');
  if (update.status !== undefined) await setStatus(voiceChannel, next.status!);
  if (update.addExcludedUserIds !== undefined || update.addIncludedUserIds !== undefined || update.clearAllExclusions || update.clearAllInclusions || update.excludeAll !== undefined || update.isLocked !== undefined || update.removeExcludedUserIds !== undefined || update.removeIncludedUserIds !== undefined) await applyAccess(voiceChannel, next, settings.nonExcludableRoleIds);
  await storeChannel(config, next);
  return next;
}

function userListLabel(userIds: readonly string[]) {
  if (!userIds.length) return 'None';
  const shown = userIds.slice(0, 12).map((userId) => `<@${userId}>`);
  return userIds.length > shown.length ? `${shown.join(', ')} and ${userIds.length - shown.length} more` : shown.join(', ');
}

function autoPingLabel(autoPings: readonly DiscordTemporaryVoiceAutoPing[]) {
  if (!autoPings.length) return 'None';
  return autoPings.slice(0, 8).map((ping) => `${ping.kind === 'role' ? `<@&${ping.targetId}>` : `<@${ping.targetId}>`}: ${ping.message}`).join('\n');
}

function voiceAudienceLabel(all: boolean, affectedIds: readonly string[], exceptionIds: readonly string[]) {
  if (all) return exceptionIds.length ? `Everyone except ${userListLabel(exceptionIds)}` : 'Everyone';
  return affectedIds.length ? userListLabel(affectedIds) : 'None';
}

export function buildDiscordTemporaryVoiceSettingsPanel(record: DiscordTemporaryVoiceChannel) {
  const access = [
    `Lock: ${record.isLocked ? 'Enabled' : 'Disabled'}`,
    `Excluded: ${record.excludedAll ? 'Everyone' : userListLabel(record.excludedUserIds)}`,
    `Included: ${userListLabel(record.includedUserIds)}`,
  ].join('\n');
  const voice = [
    `User limit: ${record.maximumUsers || 'No limit'}`,
    `Status: ${record.status ?? 'None'}`,
    `Muted: ${voiceAudienceLabel(record.mutedAll, record.mutedUserIds, record.unmutedUserIds)}`,
    `Deafened: ${voiceAudienceLabel(record.deafenedAll, record.deafenedUserIds, record.undeafenedUserIds)}`,
  ].join('\n');
  return new EmbedBuilder()
    .setColor(0x64748B)
    .setTitle('Temporary voice channel settings')
    .addFields(
      { name: 'Access', value: access.slice(0, 1_024), inline: true },
      { name: 'Voice controls', value: voice.slice(0, 1_024), inline: true },
      { name: 'Channel administrators', value: userListLabel(record.adminUserIds).slice(0, 1_024) },
      { name: 'Priority speakers', value: userListLabel(record.prioritySpeakerUserIds).slice(0, 1_024) },
      { name: 'Auto pings', value: autoPingLabel(record.autoPings).slice(0, 1_024) },
    );
}

function buildDiscordTemporaryVoiceCommandsPanel() {
  return new EmbedBuilder()
    .setColor(0x64748B)
    .setTitle('Temporary voice channel controls')
    .setDescription([
      'Use these commands in this voice channel chat. The owner can delegate moderation controls with `/config-vc-set-admin`.',
      '',
      '`/config-vc` · `/config-vc-save`',
      '`/config-vc-kick` · `/config-vc-ban`',
      '`/config-vc-mute` · `/config-vc-unmute` · `/config-vc-mute-all` · `/config-vc-unmute-all`',
      '`/config-vc-deafen` · `/config-vc-undeafen` · `/config-vc-deafen-all` · `/config-vc-undeafen-all`',
      '`/config-vc-set-admin` · `/config-vc-remove-admin`',
      '`/config-vc-set-priority-speaker` · `/config-vc-unset-priority-speaker`',
      '`/config-vc-set-autoping` · `/config-vc-remove-autoping`',
    ].join('\n'));
}

async function sendVoiceChannelMessage(channel: VoiceChannel, body: Record<string, unknown>) {
  await channel.guild.client.rest.post(Routes.channelMessages(channel.id), { body });
}

async function publishCreatedVoiceChannel(channel: VoiceChannel, record: DiscordTemporaryVoiceChannel, sendAutoPings: boolean) {
  await sendVoiceChannelMessage(channel, { allowed_mentions: { parse: [] }, embeds: [buildDiscordTemporaryVoiceSettingsPanel(record).toJSON()] })
    .catch((error: unknown) => console.warn(`Unable to post temporary voice settings in ${channel.id}.`, error));
  await sendVoiceChannelMessage(channel, { allowed_mentions: { parse: [] }, embeds: [buildDiscordTemporaryVoiceCommandsPanel().toJSON()] })
    .catch((error: unknown) => console.warn(`Unable to post temporary voice controls in ${channel.id}.`, error));
  if (sendAutoPings) {
    for (const ping of record.autoPings) {
      const mention = ping.kind === 'role' ? `<@&${ping.targetId}>` : `<@${ping.targetId}>`;
      await sendVoiceChannelMessage(channel, {
        allowed_mentions: ping.kind === 'role' ? { parse: [], roles: [ping.targetId] } : { parse: [], users: [ping.targetId] },
        content: `${mention} ${ping.message}`,
      }).catch((error: unknown) => console.warn(`Unable to post a temporary voice auto ping in ${channel.id}.`, error));
    }
  }
}

async function addAppliedDeafen(config: DiscordBotConfig, channelId: string, userId: string) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_deafen_states').upsert({ channel_id: channelId, discord_user_id: userId }, { onConflict: 'channel_id,discord_user_id' });
  if (error) throw new Error(`Unable to track temporary voice deafen: ${error.message}`);
}

async function removeAppliedDeafen(config: DiscordBotConfig, channelId: string, userId: string) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_deafen_states').delete().eq('channel_id', channelId).eq('discord_user_id', userId);
  if (error) throw new Error(`Unable to clear temporary voice deafen: ${error.message}`);
}

async function hasAppliedDeafen(config: DiscordBotConfig, channelId: string, userId: string) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_deafen_states')
    .select('discord_user_id').eq('channel_id', channelId).eq('discord_user_id', userId).maybeSingle<DeafenStateRow>();
  if (error) throw new Error(`Unable to load temporary voice deafen state: ${error.message}`);
  return Boolean(data);
}

async function releaseTemporaryVoiceDeafen(config: DiscordBotConfig, channelId: string, member: GuildMember) {
  if (!await hasAppliedDeafen(config, channelId, member.id)) return;
  if (member.voice.serverDeaf) await member.voice.setDeaf(false, 'KnowLeague temporary voice-channel deafen ended.');
  await removeAppliedDeafen(config, channelId, member.id);
}

async function syncTemporaryVoiceMemberDeafen(config: DiscordBotConfig, record: DiscordTemporaryVoiceChannel, member: GuildMember) {
  if (member.voice.channelId !== record.channelId || !memberIsDeafened(record, member.id)) {
    await releaseTemporaryVoiceDeafen(config, record.channelId, member);
    return;
  }
  if (member.voice.serverDeaf) return;
  await addAppliedDeafen(config, record.channelId, member.id);
  try {
    await member.voice.setDeaf(true, 'KnowLeague temporary voice-channel deafen');
  } catch (error) {
    await removeAppliedDeafen(config, record.channelId, member.id).catch(() => undefined);
    throw error;
  }
}

async function syncTemporaryVoiceChannelDeafens(config: DiscordBotConfig, channel: VoiceChannel, record: DiscordTemporaryVoiceChannel) {
  for (const member of channel.members.values()) await syncTemporaryVoiceMemberDeafen(config, record, member);
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_deafen_states')
    .select('discord_user_id').eq('channel_id', record.channelId).returns<DeafenStateRow[]>();
  if (error) throw new Error(`Unable to reconcile temporary voice deafens: ${error.message}`);
  for (const state of data ?? []) {
    if (channel.members.has(state.discord_user_id)) continue;
    const member = await channel.guild.members.fetch(state.discord_user_id).catch(() => null);
    if (member) await releaseTemporaryVoiceDeafen(config, record.channelId, member);
    else await removeAppliedDeafen(config, record.channelId, state.discord_user_id);
  }
}

function addUserId(userIds: readonly string[], userId: string, label: string) {
  if (userIds.includes(userId)) return [...userIds];
  if (userIds.length >= USER_LIST_MAXIMUM) throw new Error(`Discord supports up to ${USER_LIST_MAXIMUM} members in the ${label} list.`);
  return [...userIds, userId];
}

function removeUserId(userIds: readonly string[], userId: string) {
  return userIds.filter((candidate) => candidate !== userId);
}

async function persistVoiceControlUpdate(config: DiscordBotConfig, context: VoiceCommandContext, next: DiscordTemporaryVoiceChannel, updatePermissions: boolean) {
  if (updatePermissions) await applyAccess(context.channel, next, context.settings.nonExcludableRoleIds);
  await storeChannel(config, next);
  await syncTemporaryVoiceChannelDeafens(config, context.channel, next);
  return next;
}

async function validateVoiceControlTarget(context: VoiceCommandContext, userId: string, action: DiscordTemporaryVoiceMemberAction) {
  if (!USER_ID_PATTERN.test(userId)) throw new Error('Choose a valid Discord user.');
  const target = await context.channel.guild.members.fetch(userId).catch(() => null);
  if (!target || target.user.bot) throw new Error('Choose a current human server member.');
  if (target.id === context.record.ownerDiscordUserId && context.member.id !== target.id) throw new Error('A temporary voice channel administrator cannot change the owner’s voice controls.');
  if ((action === 'ban' || action === 'set-admin') && target.id === context.record.ownerDiscordUserId) throw new Error('The temporary voice channel owner cannot be selected for this command.');
  return target;
}

export async function runDiscordTemporaryVoiceMemberAction(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, action: DiscordTemporaryVoiceMemberAction, targetUserId?: string) {
  const ownerOnly = action === 'set-admin' || action === 'remove-admin' || action === 'set-priority-speaker' || action === 'remove-priority-speaker';
  const context = await getVoiceCommandContext(config, interaction, `config-vc-${action}`, !ownerOnly);
  const target = targetUserId ? await validateVoiceControlTarget(context, targetUserId, action) : null;
  const record = context.record;
  if (action === 'kick') {
    if (!target || target.voice.channelId !== context.channel.id) throw new Error('That member is not in this temporary voice channel.');
    await target.voice.setChannel(null, 'KnowLeague temporary voice-channel owner kick');
    return { configurationChanged: false, record };
  }
  let next = record;
  let updatePermissions = false;
  if (action === 'ban') {
    if (!target) throw new Error('Choose a Discord user to ban from this temporary voice channel.');
    await assertExcludable(context.channel.guild, [target.id], context.settings.nonExcludableRoleIds);
    const excludedUserIds = addUserId(removeUserId(record.excludedUserIds, target.id), target.id, 'excluded');
    next = { ...record, excludedUserIds, includedUserIds: removeUserId(record.includedUserIds, target.id) };
    updatePermissions = true;
  } else if (action === 'mute-all') {
    next = { ...record, mutedAll: true, mutedUserIds: [], unmutedUserIds: [] };
    updatePermissions = true;
  } else if (action === 'unmute-all') {
    next = { ...record, mutedAll: false, mutedUserIds: [], unmutedUserIds: [] };
    updatePermissions = true;
  } else if (action === 'deafen-all') {
    next = { ...record, deafenedAll: true, deafenedUserIds: [], undeafenedUserIds: [] };
  } else if (action === 'undeafen-all') {
    next = { ...record, deafenedAll: false, deafenedUserIds: [], undeafenedUserIds: [] };
  } else if (target) {
    if (action === 'mute') {
      next = record.mutedAll
        ? { ...record, unmutedUserIds: removeUserId(record.unmutedUserIds, target.id) }
        : { ...record, mutedUserIds: addUserId(record.mutedUserIds, target.id, 'muted') };
      updatePermissions = true;
    } else if (action === 'unmute') {
      next = record.mutedAll
        ? { ...record, unmutedUserIds: addUserId(record.unmutedUserIds, target.id, 'unmuted') }
        : { ...record, mutedUserIds: removeUserId(record.mutedUserIds, target.id) };
      updatePermissions = true;
    } else if (action === 'deafen') {
      next = record.deafenedAll
        ? { ...record, undeafenedUserIds: removeUserId(record.undeafenedUserIds, target.id) }
        : { ...record, deafenedUserIds: addUserId(record.deafenedUserIds, target.id, 'deafened') };
    } else if (action === 'undeafen') {
      next = record.deafenedAll
        ? { ...record, undeafenedUserIds: addUserId(record.undeafenedUserIds, target.id, 'undeafened') }
        : { ...record, deafenedUserIds: removeUserId(record.deafenedUserIds, target.id) };
    } else if (action === 'set-admin') {
      next = { ...record, adminUserIds: addUserId(record.adminUserIds, target.id, 'temporary voice administrators') };
    } else if (action === 'remove-admin') {
      next = { ...record, adminUserIds: removeUserId(record.adminUserIds, target.id) };
    } else if (action === 'set-priority-speaker') {
      next = { ...record, prioritySpeakerUserIds: addUserId(record.prioritySpeakerUserIds, target.id, 'priority speakers') };
      updatePermissions = true;
    } else if (action === 'remove-priority-speaker') {
      next = { ...record, prioritySpeakerUserIds: removeUserId(record.prioritySpeakerUserIds, target.id) };
      updatePermissions = true;
    }
  }
  const saved = await persistVoiceControlUpdate(config, context, next, updatePermissions);
  if (action === 'ban' && target?.voice.channelId === context.channel.id) {
    await target.voice.setChannel(null, 'KnowLeague temporary voice-channel ban').catch(() => undefined);
  }
  return { configurationChanged: true, record: saved };
}

export async function updateDiscordTemporaryVoiceAutoPing(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, action: 'remove' | 'set', ping: DiscordTemporaryVoiceAutoPing) {
  const context = await getVoiceCommandContext(config, interaction, `config-vc-${action}-autoping`, false);
  if (!USER_ID_PATTERN.test(ping.targetId) || (ping.kind !== 'role' && ping.kind !== 'user')) throw new Error('Choose a valid Discord user or role.');
  if (ping.kind === 'role' && ping.targetId === context.channel.guild.id) throw new Error('The @everyone role cannot be used for a temporary voice automatic ping.');
  const message = ping.message.trim();
  if (!message || message.length > AUTO_PING_MESSAGE_MAX_LENGTH) throw new Error(`Auto-ping messages must contain between 1 and ${AUTO_PING_MESSAGE_MAX_LENGTH} characters.`);
  const normalized = { ...ping, message };
  const hasPing = context.record.autoPings.some((candidate) => candidate.kind === normalized.kind && candidate.targetId === normalized.targetId && candidate.message === normalized.message);
  if (action === 'set' && hasPing) throw new Error('That automatic ping is already configured for this temporary voice channel.');
  if (action === 'remove' && !hasPing) throw new Error('That automatic ping is not configured for this temporary voice channel.');
  const autoPings = action === 'set'
    ? [...context.record.autoPings, normalized]
    : context.record.autoPings.filter((candidate) => candidate.kind !== normalized.kind || candidate.targetId !== normalized.targetId || candidate.message !== normalized.message);
  if (autoPings.length > AUTO_PING_MAXIMUM) throw new Error(`You can configure up to ${AUTO_PING_MAXIMUM} automatic pings.`);
  const next = { ...context.record, autoPings };
  await storeChannel(config, next);
  return next;
}

async function getPreset(config: DiscordBotConfig, ownerId: string) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_presets')
    .select('admin_user_ids, auto_pings, channel_name, deafened_all, deafened_user_ids, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, muted_all, muted_user_ids, priority_speaker_user_ids, status, undeafened_user_ids, unmuted_user_ids')
    .eq('guild_id', config.guildId).eq('owner_discord_user_id', ownerId).maybeSingle<PresetRow>();
  if (error) throw new Error(`Unable to load temporary voice preset: ${error.message}`);
  return data;
}

function controlsFromPreset(preset: PresetRow): VoiceControls {
  return {
    adminUserIds: storedUserIds(preset.admin_user_ids), autoPings: storedAutoPings(preset.auto_pings), deafenedAll: preset.deafened_all,
    deafenedUserIds: storedUserIds(preset.deafened_user_ids), mutedAll: preset.muted_all, mutedUserIds: storedUserIds(preset.muted_user_ids),
    prioritySpeakerUserIds: storedUserIds(preset.priority_speaker_user_ids), undeafenedUserIds: storedUserIds(preset.undeafened_user_ids), unmutedUserIds: storedUserIds(preset.unmuted_user_ids),
  };
}

export async function saveDiscordTemporaryVoiceChannelPreset(config: DiscordBotConfig, interaction: ChatInputCommandInteraction) {
  const { channel: voiceChannel, member: owner, record } = await getVoiceCommandContext(config, interaction, 'config-vc-save', false);
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_presets').upsert({
    admin_user_ids: record.adminUserIds, auto_pings: record.autoPings, channel_name: voiceChannel.name, deafened_all: record.deafenedAll,
    deafened_user_ids: record.deafenedUserIds, excluded_all: record.excludedAll, excluded_user_ids: record.excludedUserIds, guild_id: config.guildId,
    included_user_ids: record.includedUserIds, is_locked: record.isLocked, maximum_users: record.maximumUsers, muted_all: record.mutedAll,
    muted_user_ids: record.mutedUserIds, owner_discord_user_id: owner.id, priority_speaker_user_ids: record.prioritySpeakerUserIds,
    status: record.status, undeafened_user_ids: record.undeafenedUserIds, unmuted_user_ids: record.unmutedUserIds, updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,owner_discord_user_id' });
  if (error) throw new Error(`Unable to save temporary voice preset: ${error.message}`);
  return record;
}

export async function createDiscordTemporaryVoiceChannelFromPreset(config: DiscordBotConfig, interaction: ChatInputCommandInteraction) {
  const { guild, owner, settings, source } = await getCommandOwner(config, interaction);
  const preset = await getPreset(config, owner.id);
  if (!preset) throw new Error('Save a temporary voice configuration with /config-vc-save before using /create-vc-preset.');
  const emptyExpiresAt = new Date(Date.now() + COMMAND_EMPTY_EXPIRY_MS).toISOString();
  const created = await createChannel(config, {
    creationSource: 'command', emptyExpiresAt, excludedAll: preset.excluded_all, excludedUserIds: storedUserIds(preset.excluded_user_ids), includedUserIds: storedUserIds(preset.included_user_ids),
    controls: controlsFromPreset(preset),
    isLocked: preset.is_locked, maximumUsers: preset.maximum_users, name: preset.channel_name, owner, protectedRoleIds: settings.nonExcludableRoleIds, source, status: preset.status,
  });
  scheduleExpiry(config, guild, created.channel.id, emptyExpiresAt);
  await publishCreatedVoiceChannel(created.channel, created.record, true);
  return created;
}

async function handleJoinToCreate(config: DiscordBotConfig, newState: VoiceState, sourceChannelId: string, settings: DiscordTemporaryVoiceConfiguration) {
  const member = newState.member;
  if (!member || member.user.bot || newState.channelId !== sourceChannelId || joinToCreateReservations.has(member.id)) return;
  const reservation = (async () => {
    const source = await getManagedSource(newState.guild, sourceChannelId);
    if (newState.channelId !== source.id) return;
    const preset = temporaryVoiceMemberHasCreatorRole(member.roles.cache.keys(), settings.creatorRoleIds)
      ? await getPreset(config, member.id)
      : null;
    const created = await createChannel(config, {
      creationSource: 'join_to_create', controls: preset ? controlsFromPreset(preset) : defaultVoiceControls(), emptyExpiresAt: null,
      excludedAll: preset?.excluded_all ?? false, excludedUserIds: preset ? storedUserIds(preset.excluded_user_ids) : [],
      includedUserIds: preset ? storedUserIds(preset.included_user_ids) : [], isLocked: preset?.is_locked ?? false,
      maximumUsers: preset?.maximum_users ?? 0, name: preset?.channel_name ?? `${member.displayName.slice(0, 84)}'s Voice Channel`, owner: member,
      protectedRoleIds: settings.nonExcludableRoleIds, source, status: preset?.status ?? null,
    });
    try {
      await publishCreatedVoiceChannel(created.channel, created.record, Boolean(preset));
      if (member.voice.channelId !== source.id) return deleteChannel(config, newState.guild, created.channel.id, 'KnowLeague Join to Create creator left before the channel was ready.');
      await member.voice.setChannel(created.channel, 'KnowLeague Join to Create temporary voice channel');
    } catch (error) {
      await deleteChannel(config, newState.guild, created.channel.id, 'KnowLeague could not move the creator into their temporary voice channel.');
      throw error;
    }
  })();
  joinToCreateReservations.set(member.id, reservation);
  try { await reservation; } finally { joinToCreateReservations.delete(member.id); }
}

export async function handleDiscordTemporaryVoiceStateUpdate(config: DiscordBotConfig, oldState: VoiceState, newState: VoiceState) {
  if (newState.guild.id !== config.guildId) return;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  if (oldState.channelId === newState.channelId) {
    if (newState.channelId && oldState.serverDeaf !== newState.serverDeaf) {
      const record = await getChannel(config, newState.channelId);
      if (record) await syncTemporaryVoiceMemberDeafen(config, record, member);
    }
    return;
  }
  if (oldState.channelId) {
    const oldRecord = await getChannel(config, oldState.channelId);
    if (oldRecord) {
      await releaseTemporaryVoiceDeafen(config, oldRecord.channelId, member);
      const oldChannel = await newState.guild.channels.fetch(oldState.channelId).catch(() => null);
      if (oldChannel?.type !== ChannelType.GuildVoice) await removeChannel(config, oldState.channelId);
      else if (oldChannel.members.size === 0) await deleteChannel(config, newState.guild, oldState.channelId, 'KnowLeague temporary voice channel became empty.');
    }
  }
  if (newState.channelId) {
    const record = await getChannel(config, newState.channelId);
    if (record?.emptyExpiresAt) { await setExpiry(config, record.channelId, null); scheduleExpiry(config, newState.guild, record.channelId, null); }
    if (record) await syncTemporaryVoiceMemberDeafen(config, record, member);
  }
  if (newState.channelId) {
    const settings = await getDiscordTemporaryVoiceConfiguration(config);
    if (settings.joinToCreateChannelId === newState.channelId) await handleJoinToCreate(config, newState, settings.joinToCreateChannelId, settings);
  }
}

export async function reconcileDiscordTemporaryVoiceChannels(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  for (const record of await getChannels(config)) {
    const channel = await guild.channels.fetch(record.channelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildVoice) { await removeChannel(config, record.channelId); continue; }
    if (channel.members.size > 0) {
      if (record.emptyExpiresAt) await setExpiry(config, record.channelId, null);
      await syncTemporaryVoiceChannelDeafens(config, channel, record);
      continue;
    }
    if (record.emptyExpiresAt && new Date(record.emptyExpiresAt).getTime() > Date.now()) scheduleExpiry(config, guild, record.channelId, record.emptyExpiresAt);
    else await deleteChannel(config, guild, record.channelId, 'KnowLeague temporary voice reconciliation found an empty channel.');
  }
}

export async function forgetDiscordTemporaryVoiceChannel(config: DiscordBotConfig, channelId: string) {
  const timer = emptyExpiryTimers.get(channelId);
  if (timer) clearTimeout(timer);
  emptyExpiryTimers.delete(channelId);
  await removeChannel(config, channelId);
}
