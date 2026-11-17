import { ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type VoiceChannel, type VoiceState } from 'discord.js';
import { Routes } from 'discord-api-types/v10';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

const TEMPORARY_VOICE_CONFIGURATION_CACHE_MS = 30_000;
const COMMAND_EMPTY_EXPIRY_MS = 60_000;
const TEMPORARY_VOICE_STATUS_MAX_LENGTH = 500;
const TEMPORARY_VOICE_USER_LIMIT_MAXIMUM = 99;

type TemporaryVoiceSettingsRow = {
  join_to_create_channel_id: string | null;
};

type TemporaryVoiceRoleRow = {
  discord_role_id: string;
};

type TemporaryVoiceChannelRow = {
  category_id: string;
  channel_id: string;
  creation_source: 'command' | 'join_to_create';
  empty_expires_at: string | null;
  excluded_user_ids: unknown;
  is_locked: boolean;
  maximum_users: number;
  owner_discord_user_id: string;
  status: string | null;
};

export type DiscordTemporaryVoiceConfiguration = {
  creatorRoleIds: ReadonlySet<string>;
  joinToCreateChannelId: string | null;
};

export type DiscordTemporaryVoiceChannel = {
  categoryId: string;
  channelId: string;
  creationSource: 'command' | 'join_to_create';
  emptyExpiresAt: string | null;
  excludedUserIds: readonly string[];
  isLocked: boolean;
  maximumUsers: number;
  ownerDiscordUserId: string;
  status: string | null;
};

export type TemporaryVoiceChannelUpdate = {
  excludedUserIds?: readonly string[];
  isLocked?: boolean;
  maximumUsers?: number;
  name?: string;
  status?: string;
};

let cachedConfiguration: { expiresAt: number; guildId: string; value: DiscordTemporaryVoiceConfiguration } | null = null;
const emptyChannelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const joinToCreateReservations = new Map<string, Promise<void>>();

function parseExcludedUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((userId) => typeof userId === 'string' && /^[0-9]{17,20}$/.test(userId) ? [userId] : []);
}

function toTemporaryVoiceChannel(row: TemporaryVoiceChannelRow): DiscordTemporaryVoiceChannel {
  return {
    categoryId: row.category_id,
    channelId: row.channel_id,
    creationSource: row.creation_source,
    emptyExpiresAt: row.empty_expires_at,
    excludedUserIds: parseExcludedUserIds(row.excluded_user_ids),
    isLocked: row.is_locked,
    maximumUsers: row.maximum_users,
    ownerDiscordUserId: row.owner_discord_user_id,
    status: row.status,
  };
}

function temporaryVoiceChannelName(member: GuildMember) {
  const suffix = "'s Voice Channel";
  return `${member.displayName.slice(0, 100 - suffix.length)}${suffix}`;
}

function normalizeTemporaryVoiceChannelName(value: string) {
  const name = value.trim();
  if (!name || name.length > 100) throw new Error('Voice channel names must contain between 1 and 100 characters.');
  return name;
}

function normalizeStatus(value: string) {
  const status = value.trim();
  if (!status || status.length > TEMPORARY_VOICE_STATUS_MAX_LENGTH) {
    throw new Error(`Voice channel status must contain between 1 and ${TEMPORARY_VOICE_STATUS_MAX_LENGTH} characters.`);
  }
  return status;
}

function normalizeExcludedUserIds(userIds: readonly string[], ownerDiscordUserId: string) {
  if (userIds.length > 10) throw new Error('You can exclude up to ten members from a temporary voice channel.');
  const normalized = [...new Set(userIds)];
  if (normalized.length !== userIds.length) throw new Error('Choose each excluded member only once.');
  if (normalized.some((userId) => !/^[0-9]{17,20}$/.test(userId))) throw new Error('Every excluded member must be a valid Discord user.');
  if (normalized.includes(ownerDiscordUserId)) throw new Error('You cannot exclude the owner of a temporary voice channel.');
  return normalized;
}

function normalizeMaximumUsers(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > TEMPORARY_VOICE_USER_LIMIT_MAXIMUM) {
    throw new Error(`Voice channel maximum users must be between 0 and ${TEMPORARY_VOICE_USER_LIMIT_MAXIMUM}.`);
  }
  return value;
}

export function temporaryVoiceMemberHasCreatorRole(memberRoleIds: Iterable<string>, creatorRoleIds: ReadonlySet<string>) {
  for (const roleId of memberRoleIds) {
    if (creatorRoleIds.has(roleId)) return true;
  }
  return false;
}

export async function getDiscordTemporaryVoiceConfiguration(config: DiscordBotConfig): Promise<DiscordTemporaryVoiceConfiguration> {
  const now = Date.now();
  if (cachedConfiguration && cachedConfiguration.guildId === config.guildId && cachedConfiguration.expiresAt > now) {
    return cachedConfiguration.value;
  }

  const supabase = createBotServiceClient(config);
  const [settingsResult, rolesResult] = await Promise.all([
    supabase.from('discord_temporary_voice_settings')
      .select('join_to_create_channel_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<TemporaryVoiceSettingsRow>(),
    supabase.from('discord_temporary_voice_creator_roles')
      .select('discord_role_id')
      .eq('guild_id', config.guildId)
      .returns<TemporaryVoiceRoleRow[]>(),
  ]);
  if (settingsResult.error) throw new Error(`Unable to load temporary voice settings: ${settingsResult.error.message}`);
  if (rolesResult.error) throw new Error(`Unable to load temporary voice creator roles: ${rolesResult.error.message}`);

  const value: DiscordTemporaryVoiceConfiguration = {
    creatorRoleIds: new Set((rolesResult.data ?? []).map((entry) => entry.discord_role_id)),
    joinToCreateChannelId: settingsResult.data?.join_to_create_channel_id ?? null,
  };
  cachedConfiguration = { expiresAt: now + TEMPORARY_VOICE_CONFIGURATION_CACHE_MS, guildId: config.guildId, value };
  return value;
}

async function getTemporaryVoiceChannel(config: DiscordBotConfig, channelId: string): Promise<DiscordTemporaryVoiceChannel | null> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_temporary_voice_channels')
    .select('category_id, channel_id, creation_source, empty_expires_at, excluded_user_ids, is_locked, maximum_users, owner_discord_user_id, status')
    .eq('guild_id', config.guildId)
    .eq('channel_id', channelId)
    .maybeSingle<TemporaryVoiceChannelRow>();
  if (error) throw new Error(`Unable to load temporary voice channel: ${error.message}`);
  return data ? toTemporaryVoiceChannel(data) : null;
}

async function getAllTemporaryVoiceChannels(config: DiscordBotConfig): Promise<DiscordTemporaryVoiceChannel[]> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_temporary_voice_channels')
    .select('category_id, channel_id, creation_source, empty_expires_at, excluded_user_ids, is_locked, maximum_users, owner_discord_user_id, status')
    .eq('guild_id', config.guildId)
    .returns<TemporaryVoiceChannelRow[]>();
  if (error) throw new Error(`Unable to load temporary voice channels: ${error.message}`);
  return (data ?? []).map(toTemporaryVoiceChannel);
}

async function storeTemporaryVoiceChannel(config: DiscordBotConfig, channel: DiscordTemporaryVoiceChannel) {
  const { error } = await createBotServiceClient(config)
    .from('discord_temporary_voice_channels')
    .upsert({
      category_id: channel.categoryId,
      channel_id: channel.channelId,
      creation_source: channel.creationSource,
      empty_expires_at: channel.emptyExpiresAt,
      excluded_user_ids: channel.excludedUserIds,
      guild_id: config.guildId,
      is_locked: channel.isLocked,
      maximum_users: channel.maximumUsers,
      owner_discord_user_id: channel.ownerDiscordUserId,
      status: channel.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id' });
  if (error) throw new Error(`Unable to save temporary voice channel: ${error.message}`);
}

async function removeTemporaryVoiceChannel(config: DiscordBotConfig, channelId: string) {
  const { error } = await createBotServiceClient(config)
    .from('discord_temporary_voice_channels')
    .delete()
    .eq('guild_id', config.guildId)
    .eq('channel_id', channelId);
  if (error) throw new Error(`Unable to remove temporary voice channel: ${error.message}`);
}

async function setTemporaryVoiceChannelExpiry(config: DiscordBotConfig, channelId: string, emptyExpiresAt: string | null) {
  const { error } = await createBotServiceClient(config)
    .from('discord_temporary_voice_channels')
    .update({ empty_expires_at: emptyExpiresAt, updated_at: new Date().toISOString() })
    .eq('guild_id', config.guildId)
    .eq('channel_id', channelId);
  if (error) throw new Error(`Unable to update temporary voice channel expiry: ${error.message}`);
}

async function getManagedCreationSource(guild: Guild, channelId: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice || !channel.parentId) {
    throw new Error('The configured Join to Create voice channel is unavailable or is not inside a category.');
  }
  const botMember = await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
  ])) {
    throw new Error('KnowLeague needs View Channel, Manage Channels, and Move Members in the configured Join to Create channel.');
  }
  return channel;
}

async function setVoiceChannelStatus(channel: VoiceChannel, status: string) {
  const botMember = await channel.guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SetVoiceChannelStatus)) {
    throw new Error('KnowLeague needs Set Voice Channel Status to set a temporary voice-channel status.');
  }
  await channel.guild.client.rest.put(Routes.channelVoiceStatus(channel.id), { body: { status } });
}

async function applyTemporaryVoicePermissions(
  channel: VoiceChannel,
  record: Pick<DiscordTemporaryVoiceChannel, 'excludedUserIds' | 'isLocked' | 'ownerDiscordUserId'>,
) {
  if (record.isLocked) {
    const botMember = await channel.guild.members.fetchMe();
    await channel.permissionOverwrites.set([
      { id: channel.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.SetVoiceChannelStatus] },
      { id: record.ownerDiscordUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      ...record.excludedUserIds.map((userId) => ({ id: userId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
    ], 'KnowLeague temporary voice channel locked');
    return;
  }

  await channel.lockPermissions();
  for (const userId of record.excludedUserIds) {
    await channel.permissionOverwrites.edit(userId, {
      Connect: false,
      ViewChannel: false,
    }, { reason: 'KnowLeague temporary voice channel exclusion' });
  }
}

async function positionTemporaryVoiceChannelAtCategoryBottom(channel: VoiceChannel) {
  const siblingPositions = [...channel.guild.channels.cache.values()]
    .filter((candidate): candidate is VoiceChannel => candidate.type === ChannelType.GuildVoice && candidate.parentId === channel.parentId)
    .map((candidate) => candidate.rawPosition);
  const finalPosition = siblingPositions.length ? Math.max(...siblingPositions) + 1 : channel.rawPosition;
  await channel.setPosition(finalPosition).catch((error: unknown) => {
    console.warn(`Unable to move temporary voice channel ${channel.id} to the category bottom.`, error);
  });
}

type CreateTemporaryVoiceChannelOptions = {
  creationSource: DiscordTemporaryVoiceChannel['creationSource'];
  emptyExpiresAt: string | null;
  excludedUserIds: readonly string[];
  maximumUsers: number;
  name: string;
  owner: GuildMember;
  source: VoiceChannel;
  status: string | null;
};

async function createTemporaryVoiceChannel(config: DiscordBotConfig, options: CreateTemporaryVoiceChannelOptions) {
  const name = normalizeTemporaryVoiceChannelName(options.name);
  const excludedUserIds = normalizeExcludedUserIds(options.excludedUserIds, options.owner.id);
  if (options.owner.guild.client.user && excludedUserIds.includes(options.owner.guild.client.user.id)) {
    throw new Error('You cannot exclude KnowLeague from a temporary voice channel.');
  }
  const maximumUsers = normalizeMaximumUsers(options.maximumUsers);
  const channel = await options.owner.guild.channels.create({
    name,
    parent: options.source.parentId,
    type: ChannelType.GuildVoice,
    userLimit: maximumUsers,
    reason: `KnowLeague temporary voice channel for ${options.owner.user.username}`,
  });
  try {
    const record: DiscordTemporaryVoiceChannel = {
      categoryId: options.source.parentId!,
      channelId: channel.id,
      creationSource: options.creationSource,
      emptyExpiresAt: options.emptyExpiresAt,
      excludedUserIds,
      isLocked: false,
      maximumUsers,
      ownerDiscordUserId: options.owner.id,
      status: options.status,
    };
    await applyTemporaryVoicePermissions(channel, record);
    if (options.status) await setVoiceChannelStatus(channel, normalizeStatus(options.status));
    await storeTemporaryVoiceChannel(config, record);
    await positionTemporaryVoiceChannelAtCategoryBottom(channel);
    return { channel, record };
  } catch (error) {
    await channel.delete('KnowLeague temporary voice setup failed.').catch((deleteError: unknown) => {
      console.error(`Unable to delete failed temporary voice channel ${channel.id}.`, deleteError);
    });
    throw error;
  }
}

async function deleteTemporaryVoiceChannel(config: DiscordBotConfig, guild: Guild, channelId: string, reason: string) {
  const timer = emptyChannelExpiryTimers.get(channelId);
  if (timer) clearTimeout(timer);
  emptyChannelExpiryTimers.delete(channelId);

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.type === ChannelType.GuildVoice) {
    if (!channel.deletable) {
      console.warn(`Unable to delete temporary voice channel ${channelId}: the bot cannot delete it.`);
      return;
    }
    try {
      await channel.delete(reason);
    } catch (error) {
      console.warn(`Unable to delete temporary voice channel ${channelId}.`, error);
      return;
    }
  }
  await removeTemporaryVoiceChannel(config, channelId);
}

async function expireTemporaryVoiceChannelIfStillEmpty(config: DiscordBotConfig, guild: Guild, channelId: string) {
  const record = await getTemporaryVoiceChannel(config, channelId);
  if (!record) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.type !== ChannelType.GuildVoice) {
    await removeTemporaryVoiceChannel(config, channelId);
    return;
  }
  if (channel.members.size > 0) {
    await setTemporaryVoiceChannelExpiry(config, channelId, null);
    return;
  }
  await deleteTemporaryVoiceChannel(config, guild, channelId, 'KnowLeague temporary voice channel was not joined in time.');
}

function scheduleEmptyChannelExpiry(config: DiscordBotConfig, guild: Guild, channelId: string, emptyExpiresAt: string | null) {
  const existingTimer = emptyChannelExpiryTimers.get(channelId);
  if (existingTimer) clearTimeout(existingTimer);
  emptyChannelExpiryTimers.delete(channelId);
  if (!emptyExpiresAt) return;
  const delay = Math.max(0, new Date(emptyExpiresAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    emptyChannelExpiryTimers.delete(channelId);
    void expireTemporaryVoiceChannelIfStillEmpty(config, guild, channelId)
      .catch((error: unknown) => console.error(`Temporary voice expiry failed for ${channelId}.`, error));
  }, delay);
  timer.unref();
  emptyChannelExpiryTimers.set(channelId, timer);
}

export async function createDiscordTemporaryVoiceChannelFromCommand(
  config: DiscordBotConfig,
  interaction: ChatInputCommandInteraction,
  options: { excludedUserIds: readonly string[]; maximumUsers: number; name: string; status: string | null },
) {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const settings = await getDiscordTemporaryVoiceConfiguration(config);
  if (!settings.joinToCreateChannelId) throw new Error('Temporary voice channels have not been configured for this server yet.');
  if (settings.creatorRoleIds.size === 0) throw new Error('No Discord roles have been configured to create temporary voice channels.');
  const owner = await guild.members.fetch(interaction.user.id);
  if (!temporaryVoiceMemberHasCreatorRole(owner.roles.cache.keys(), settings.creatorRoleIds)) {
    throw new Error('You do not have a Discord role allowed to create a temporary voice channel.');
  }
  const source = await getManagedCreationSource(guild, settings.joinToCreateChannelId);
  const emptyExpiresAt = new Date(Date.now() + COMMAND_EMPTY_EXPIRY_MS).toISOString();
  const created = await createTemporaryVoiceChannel(config, {
    creationSource: 'command',
    emptyExpiresAt,
    excludedUserIds: options.excludedUserIds,
    maximumUsers: options.maximumUsers,
    name: options.name,
    owner,
    source,
    status: options.status,
  });
  scheduleEmptyChannelExpiry(config, guild, created.channel.id, emptyExpiresAt);
  return created.channel;
}

export async function configureDiscordTemporaryVoiceChannel(
  config: DiscordBotConfig,
  interaction: ChatInputCommandInteraction,
  update: TemporaryVoiceChannelUpdate,
) {
  const guild = interaction.guild;
  if (!guild) throw new Error('This command is only available in the configured Discord server.');
  const owner = await guild.members.fetch(interaction.user.id);
  const voiceChannel = owner.voice.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    throw new Error('Join one of your temporary voice channels before using /config-vc.');
  }
  const existing = await getTemporaryVoiceChannel(config, voiceChannel.id);
  if (!existing) throw new Error('You can only configure a temporary voice channel created by KnowLeague.');
  if (existing.ownerDiscordUserId !== owner.id) throw new Error('Only the owner can configure this temporary voice channel.');

  const excludedUserIds = update.excludedUserIds === undefined
    ? existing.excludedUserIds
    : normalizeExcludedUserIds(update.excludedUserIds, owner.id);
  if (guild.client.user && excludedUserIds.includes(guild.client.user.id)) {
    throw new Error('You cannot exclude KnowLeague from a temporary voice channel.');
  }
  const maximumUsers = update.maximumUsers === undefined
    ? existing.maximumUsers
    : normalizeMaximumUsers(update.maximumUsers);
  const isLocked = update.isLocked ?? existing.isLocked;
  const status = update.status === undefined ? existing.status : normalizeStatus(update.status);
  const next: DiscordTemporaryVoiceChannel = {
    ...existing,
    excludedUserIds,
    isLocked,
    maximumUsers,
    status,
  };

  if (update.name !== undefined) await voiceChannel.setName(normalizeTemporaryVoiceChannelName(update.name), 'KnowLeague temporary voice owner configuration');
  if (update.maximumUsers !== undefined) await voiceChannel.setUserLimit(maximumUsers, 'KnowLeague temporary voice owner configuration');
  if (update.status !== undefined) await setVoiceChannelStatus(voiceChannel, status!);
  if (update.excludedUserIds !== undefined || update.isLocked !== undefined) {
    await applyTemporaryVoicePermissions(voiceChannel, next);
  }
  await storeTemporaryVoiceChannel(config, next);
  return next;
}

async function handleJoinToCreate(config: DiscordBotConfig, newState: VoiceState, sourceChannelId: string) {
  const member = newState.member;
  if (!member || member.user.bot || newState.channelId !== sourceChannelId) return;
  if (joinToCreateReservations.has(member.id)) return;
  const reservation = (async () => {
    const source = await getManagedCreationSource(newState.guild, sourceChannelId);
    if (newState.channelId !== source.id) return;
    const created = await createTemporaryVoiceChannel(config, {
      creationSource: 'join_to_create',
      emptyExpiresAt: null,
      excludedUserIds: [],
      maximumUsers: 0,
      name: temporaryVoiceChannelName(member),
      owner: member,
      source,
      status: null,
    });
    try {
      if (member.voice.channelId !== source.id) {
        await deleteTemporaryVoiceChannel(config, newState.guild, created.channel.id, 'KnowLeague Join to Create creator left before the channel was ready.');
        return;
      }
      await member.voice.setChannel(created.channel, 'KnowLeague Join to Create temporary voice channel');
    } catch (error) {
      await deleteTemporaryVoiceChannel(config, newState.guild, created.channel.id, 'KnowLeague could not move the creator into their temporary voice channel.');
      throw error;
    }
  })();
  joinToCreateReservations.set(member.id, reservation);
  try {
    await reservation;
  } finally {
    joinToCreateReservations.delete(member.id);
  }
}

export async function handleDiscordTemporaryVoiceStateUpdate(
  config: DiscordBotConfig,
  oldState: VoiceState,
  newState: VoiceState,
) {
  if (newState.guild.id !== config.guildId || oldState.channelId === newState.channelId) return;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  if (oldState.channelId) {
    const oldTemporaryChannel = await getTemporaryVoiceChannel(config, oldState.channelId);
    if (oldTemporaryChannel) {
      const oldChannel = await newState.guild.channels.fetch(oldState.channelId).catch(() => null);
      if (oldChannel?.type !== ChannelType.GuildVoice) {
        await removeTemporaryVoiceChannel(config, oldState.channelId);
      } else if (oldChannel.members.size === 0) {
        await deleteTemporaryVoiceChannel(config, newState.guild, oldState.channelId, 'KnowLeague temporary voice channel became empty.');
      }
    }
  }

  if (newState.channelId) {
    const newTemporaryChannel = await getTemporaryVoiceChannel(config, newState.channelId);
    if (newTemporaryChannel?.emptyExpiresAt) {
      await setTemporaryVoiceChannelExpiry(config, newTemporaryChannel.channelId, null);
      scheduleEmptyChannelExpiry(config, newState.guild, newTemporaryChannel.channelId, null);
    }
  }

  const settings = await getDiscordTemporaryVoiceConfiguration(config);
  if (settings.joinToCreateChannelId && newState.channelId === settings.joinToCreateChannelId) {
    await handleJoinToCreate(config, newState, settings.joinToCreateChannelId);
  }
}

export async function reconcileDiscordTemporaryVoiceChannels(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  const records = await getAllTemporaryVoiceChannels(config);
  for (const record of records) {
    const channel = await guild.channels.fetch(record.channelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildVoice) {
      await removeTemporaryVoiceChannel(config, record.channelId);
      continue;
    }
    if (channel.members.size > 0) {
      if (record.emptyExpiresAt) await setTemporaryVoiceChannelExpiry(config, record.channelId, null);
      continue;
    }
    if (record.emptyExpiresAt && new Date(record.emptyExpiresAt).getTime() > Date.now()) {
      scheduleEmptyChannelExpiry(config, guild, record.channelId, record.emptyExpiresAt);
      continue;
    }
    await deleteTemporaryVoiceChannel(config, guild, record.channelId, 'KnowLeague temporary voice reconciliation found an empty channel.');
  }
}

export async function forgetDiscordTemporaryVoiceChannel(config: DiscordBotConfig, channelId: string) {
  const timer = emptyChannelExpiryTimers.get(channelId);
  if (timer) clearTimeout(timer);
  emptyChannelExpiryTimers.delete(channelId);
  await removeTemporaryVoiceChannel(config, channelId);
}
