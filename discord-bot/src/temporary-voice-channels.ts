import { ChannelType, OverwriteType, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type VoiceChannel, type VoiceState } from 'discord.js';
import { Routes } from 'discord-api-types/v10';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

const CONFIG_CACHE_MS = 30_000;
const COMMAND_EMPTY_EXPIRY_MS = 60_000;
const STATUS_MAX_LENGTH = 500;
const USER_LIMIT_MAXIMUM = 99;
const USER_LIST_MAXIMUM = 97;
const OVERWRITE_MAXIMUM = 100;
const USER_ID_PATTERN = /^[0-9]{17,20}$/;
const USER_MENTION_PATTERN = /^<@!?(?<userId>[0-9]{17,20})>$/;

type SettingsRow = { join_to_create_channel_id: string | null };
type RoleRow = { discord_role_id: string };
type ChannelRow = {
  category_id: string; channel_id: string; creation_source: 'command' | 'join_to_create'; empty_expires_at: string | null;
  excluded_all: boolean; excluded_user_ids: unknown; included_user_ids: unknown; is_locked: boolean; maximum_users: number;
  owner_discord_user_id: string; status: string | null;
};
type PresetRow = {
  channel_name: string; excluded_all: boolean; excluded_user_ids: unknown; included_user_ids: unknown;
  is_locked: boolean; maximum_users: number; status: string | null;
};
type Overwrite = { allow?: bigint; deny?: bigint; id: string; type: OverwriteType };

export type DiscordTemporaryVoiceConfiguration = {
  creatorRoleIds: ReadonlySet<string>;
  joinToCreateChannelId: string | null;
  nonExcludableRoleIds: ReadonlySet<string>;
};

export type DiscordTemporaryVoiceChannel = {
  categoryId: string;
  channelId: string;
  creationSource: 'command' | 'join_to_create';
  emptyExpiresAt: string | null;
  excludedAll: boolean;
  excludedUserIds: readonly string[];
  includedUserIds: readonly string[];
  isLocked: boolean;
  maximumUsers: number;
  ownerDiscordUserId: string;
  status: string | null;
};

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
  return Array.isArray(value) ? value.flatMap((userId) => typeof userId === 'string' && USER_ID_PATTERN.test(userId) ? [userId] : []) : [];
}

function toChannel(row: ChannelRow): DiscordTemporaryVoiceChannel {
  return {
    categoryId: row.category_id, channelId: row.channel_id, creationSource: row.creation_source, emptyExpiresAt: row.empty_expires_at,
    excludedAll: row.excluded_all, excludedUserIds: storedUserIds(row.excluded_user_ids), includedUserIds: storedUserIds(row.included_user_ids),
    isLocked: row.is_locked, maximumUsers: row.maximum_users, ownerDiscordUserId: row.owner_discord_user_id, status: row.status,
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
    .select('category_id, channel_id, creation_source, empty_expires_at, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, owner_discord_user_id, status')
    .eq('guild_id', config.guildId).eq('channel_id', channelId).maybeSingle<ChannelRow>();
  if (error) throw new Error(`Unable to load temporary voice channel: ${error.message}`);
  return data ? toChannel(data) : null;
}

async function getChannels(config: DiscordBotConfig) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_channels')
    .select('category_id, channel_id, creation_source, empty_expires_at, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, owner_discord_user_id, status')
    .eq('guild_id', config.guildId).returns<ChannelRow[]>();
  if (error) throw new Error(`Unable to load temporary voice channels: ${error.message}`);
  return (data ?? []).map(toChannel);
}

async function storeChannel(config: DiscordBotConfig, channel: DiscordTemporaryVoiceChannel) {
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_channels').upsert({
    category_id: channel.categoryId, channel_id: channel.channelId, creation_source: channel.creationSource, empty_expires_at: channel.emptyExpiresAt,
    excluded_all: channel.excludedAll, excluded_user_ids: channel.excludedUserIds, guild_id: config.guildId, included_user_ids: channel.includedUserIds,
    is_locked: channel.isLocked, maximum_users: channel.maximumUsers, owner_discord_user_id: channel.ownerDiscordUserId, status: channel.status, updated_at: new Date().toISOString(),
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
  if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers])) {
    throw new Error('KnowLeague needs View Channel, Manage Channels, and Move Members in the configured Join to Create channel.');
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

function buildOverwrites(source: VoiceChannel, channel: Pick<DiscordTemporaryVoiceChannel, 'excludedAll' | 'excludedUserIds' | 'includedUserIds' | 'isLocked' | 'ownerDiscordUserId'>, botUserId: string, protectedRoleIds: ReadonlySet<string>) {
  const overwrites = new Map<string, Overwrite>();
  if (restrictedAccess(channel)) {
    put(overwrites, source.guild.roles.everyone.id, OverwriteType.Role, 0n, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect);
    put(overwrites, botUserId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers | PermissionFlagsBits.SetVoiceChannelStatus);
    put(overwrites, channel.ownerDiscordUserId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
    if (!channel.isLocked) {
      for (const roleId of protectedRoleIds) {
        if (roleId !== source.guild.roles.everyone.id) put(overwrites, roleId, OverwriteType.Role, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
      }
      for (const userId of channel.includedUserIds) put(overwrites, userId, OverwriteType.Member, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak);
    }
  } else {
    for (const overwrite of source.parent?.permissionOverwrites.cache.values() ?? []) put(overwrites, overwrite.id, overwrite.type, overwrite.allow.bitfield, overwrite.deny.bitfield);
  }
  for (const userId of channel.excludedUserIds) put(overwrites, userId, OverwriteType.Member, 0n, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect);
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

type CreateOptions = {
  creationSource: DiscordTemporaryVoiceChannel['creationSource']; emptyExpiresAt: string | null; excludedAll: boolean; excludedUserIds: readonly string[]; includedUserIds: readonly string[];
  isLocked: boolean; maximumUsers: number; name: string; owner: GuildMember; protectedRoleIds: ReadonlySet<string>; source: VoiceChannel; status: string | null;
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
    excludedUserIds, includedUserIds, isLocked: options.isLocked, maximumUsers: normalizeLimit(options.maximumUsers), ownerDiscordUserId: options.owner.id,
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

export async function createDiscordTemporaryVoiceChannelFromCommand(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, options: { excludedAll: boolean; excludedUserIds: readonly string[]; includedUserIds: readonly string[]; maximumUsers: number; name: string; status: string | null }) {
  const { guild, owner, settings, source } = await getCommandOwner(config, interaction);
  const emptyExpiresAt = new Date(Date.now() + COMMAND_EMPTY_EXPIRY_MS).toISOString();
  const created = await createChannel(config, { creationSource: 'command', emptyExpiresAt, excludedAll: options.excludedAll, excludedUserIds: options.excludedUserIds, includedUserIds: options.includedUserIds, isLocked: false, maximumUsers: options.maximumUsers, name: options.name, owner, protectedRoleIds: settings.nonExcludableRoleIds, source, status: options.status });
  scheduleExpiry(config, guild, created.channel.id, emptyExpiresAt);
  return created.channel;
}

export async function configureDiscordTemporaryVoiceChannel(config: DiscordBotConfig, interaction: ChatInputCommandInteraction, update: TemporaryVoiceChannelUpdate) {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const owner = await guild.members.fetch(interaction.user.id);
  const voiceChannel = owner.voice.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) throw new Error('Join one of your temporary voice channels before using /config-vc.');
  const existing = await getChannel(config, voiceChannel.id);
  if (!existing) throw new Error('You can only configure a temporary voice channel created by KnowLeague.');
  if (existing.ownerDiscordUserId !== owner.id) throw new Error('Only the owner can configure this temporary voice channel.');
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
  const settings = await getDiscordTemporaryVoiceConfiguration(config);
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

async function getPreset(config: DiscordBotConfig, ownerId: string) {
  const { data, error } = await createBotServiceClient(config).from('discord_temporary_voice_presets')
    .select('channel_name, excluded_all, excluded_user_ids, included_user_ids, is_locked, maximum_users, status')
    .eq('guild_id', config.guildId).eq('owner_discord_user_id', ownerId).maybeSingle<PresetRow>();
  if (error) throw new Error(`Unable to load temporary voice preset: ${error.message}`);
  return data;
}

export async function saveDiscordTemporaryVoiceChannelPreset(config: DiscordBotConfig, interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const owner = await guild.members.fetch(interaction.user.id);
  const voiceChannel = owner.voice.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) throw new Error('Join one of your temporary voice channels before using /config-vc-save.');
  const record = await getChannel(config, voiceChannel.id);
  if (!record || record.ownerDiscordUserId !== owner.id) throw new Error('Only the owner can save a preset from a KnowLeague temporary voice channel.');
  const { error } = await createBotServiceClient(config).from('discord_temporary_voice_presets').upsert({
    channel_name: voiceChannel.name, excluded_all: record.excludedAll, excluded_user_ids: record.excludedUserIds, guild_id: config.guildId,
    included_user_ids: record.includedUserIds, is_locked: record.isLocked, maximum_users: record.maximumUsers, owner_discord_user_id: owner.id,
    status: record.status, updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,owner_discord_user_id' });
  if (error) throw new Error(`Unable to save temporary voice preset: ${error.message}`);
}

export async function createDiscordTemporaryVoiceChannelFromPreset(config: DiscordBotConfig, interaction: ChatInputCommandInteraction) {
  const { guild, owner, settings, source } = await getCommandOwner(config, interaction);
  const preset = await getPreset(config, owner.id);
  if (!preset) throw new Error('Save a temporary voice configuration with /config-vc-save before using /create-vc-preset.');
  const emptyExpiresAt = new Date(Date.now() + COMMAND_EMPTY_EXPIRY_MS).toISOString();
  const created = await createChannel(config, {
    creationSource: 'command', emptyExpiresAt, excludedAll: preset.excluded_all, excludedUserIds: storedUserIds(preset.excluded_user_ids), includedUserIds: storedUserIds(preset.included_user_ids),
    isLocked: preset.is_locked, maximumUsers: preset.maximum_users, name: preset.channel_name, owner, protectedRoleIds: settings.nonExcludableRoleIds, source, status: preset.status,
  });
  scheduleExpiry(config, guild, created.channel.id, emptyExpiresAt);
  return created.channel;
}

async function handleJoinToCreate(config: DiscordBotConfig, newState: VoiceState, sourceChannelId: string) {
  const member = newState.member;
  if (!member || member.user.bot || newState.channelId !== sourceChannelId || joinToCreateReservations.has(member.id)) return;
  const reservation = (async () => {
    const source = await getManagedSource(newState.guild, sourceChannelId);
    if (newState.channelId !== source.id) return;
    const created = await createChannel(config, {
      creationSource: 'join_to_create', emptyExpiresAt: null, excludedAll: false, excludedUserIds: [], includedUserIds: [], isLocked: false,
      maximumUsers: 0, name: `${member.displayName.slice(0, 84)}'s Voice Channel`, owner: member, protectedRoleIds: new Set(), source, status: null,
    });
    try {
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
  if (newState.guild.id !== config.guildId || oldState.channelId === newState.channelId) return;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  if (oldState.channelId) {
    const oldRecord = await getChannel(config, oldState.channelId);
    if (oldRecord) {
      const oldChannel = await newState.guild.channels.fetch(oldState.channelId).catch(() => null);
      if (oldChannel?.type !== ChannelType.GuildVoice) await removeChannel(config, oldState.channelId);
      else if (oldChannel.members.size === 0) await deleteChannel(config, newState.guild, oldState.channelId, 'KnowLeague temporary voice channel became empty.');
    }
  }
  if (newState.channelId) {
    const record = await getChannel(config, newState.channelId);
    if (record?.emptyExpiresAt) { await setExpiry(config, record.channelId, null); scheduleExpiry(config, newState.guild, record.channelId, null); }
  }
  const settings = await getDiscordTemporaryVoiceConfiguration(config);
  if (settings.joinToCreateChannelId && newState.channelId === settings.joinToCreateChannelId) await handleJoinToCreate(config, newState, settings.joinToCreateChannelId);
}

export async function reconcileDiscordTemporaryVoiceChannels(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  for (const record of await getChannels(config)) {
    const channel = await guild.channels.fetch(record.channelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildVoice) { await removeChannel(config, record.channelId); continue; }
    if (channel.members.size > 0) { if (record.emptyExpiresAt) await setExpiry(config, record.channelId, null); continue; }
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
