import { EmbedBuilder, type Guild, type Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import {
  getRecentlyBannedDiscordUserIds,
  resolveDiscordBulkMessageDeletionReason,
  resolveDiscordMessageDeletionReason,
  type DiscordAuditReason,
} from './audit-log-reasons.js';
import { createBotServiceClient } from './supabase.js';
import { getTrackedSnipeMessage, type TrackedSnipeMessage } from './snipe.js';

type MessageLogSettings = {
  deletedMessageChannelId: string | null;
  editedMessageChannelId: string | null;
};

type StoredMessageLogSettings = {
  message_delete_log_channel_id: string | null;
  message_edit_log_channel_id: string | null;
};

const MESSAGE_LOG_RETENTION_MS = 60 * 60 * 1_000;
const MESSAGE_LOG_SETTINGS_CACHE_MS = 30_000;
let cachedSettings: { expiresAt: number; guildId: string; value: MessageLogSettings } | null = null;

function truncate(value: string, maximum: number) {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}

function messageText(value: string, maximum = 1_000) {
  const content = value.trim();
  return content ? truncate(content, maximum) : '_No text content._';
}

function canLogSnapshot(snapshot: TrackedSnipeMessage) {
  return !snapshot.authorIsBot && Date.now() - snapshot.sentAt <= MESSAGE_LOG_RETENTION_MS;
}

async function getMessageLogSettings(config: DiscordBotConfig): Promise<MessageLogSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.guildId === config.guildId && cachedSettings.expiresAt > now) {
    return cachedSettings.value;
  }

  const { data, error } = await createBotServiceClient(config)
    .from('discord_leveling_settings')
    .select('message_delete_log_channel_id, message_edit_log_channel_id')
    .eq('guild_id', config.guildId)
    .maybeSingle<StoredMessageLogSettings>();
  if (error) throw new Error(`Unable to load Discord message-log settings: ${error.message}`);

  const value = {
    deletedMessageChannelId: data?.message_delete_log_channel_id ?? null,
    editedMessageChannelId: data?.message_edit_log_channel_id ?? null,
  };
  cachedSettings = { expiresAt: now + MESSAGE_LOG_SETTINGS_CACHE_MS, guildId: config.guildId, value };
  return value;
}

async function sendMessageLog(guild: Guild, channelId: string, embed: EmbedBuilder) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`Discord message-log channel ${channelId} is unavailable, not text-based, or not sendable.`);
    return;
  }
  await channel.send({ allowedMentions: { parse: [] }, embeds: [embed] });
}

function authorLine(snapshot: TrackedSnipeMessage) {
  return `<@${snapshot.authorId}>\n${truncate(snapshot.authorDisplayName, 120)}`;
}

function affectedMemberList(snapshots: readonly TrackedSnipeMessage[]) {
  const affectedMembers = new Map<string, { count: number; displayName: string }>();
  for (const snapshot of snapshots) {
    const member = affectedMembers.get(snapshot.authorId) ?? { count: 0, displayName: snapshot.authorDisplayName };
    member.count += 1;
    affectedMembers.set(snapshot.authorId, member);
  }
  return truncate([...affectedMembers.entries()]
    .map(([userId, member]) => `<@${userId}> (${truncate(member.displayName, 80)}) · ${member.count} message${member.count === 1 ? '' : 's'}`)
    .join('\n'), 1_024);
}

export function buildDiscordDeletedMessagePanel(snapshot: TrackedSnipeMessage, reason: DiscordAuditReason) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: 'Message deleted', iconURL: snapshot.authorAvatarUrl })
    .setDescription(messageText(snapshot.content, 3_500))
    .addFields(
      { name: 'Author', value: authorLine(snapshot), inline: true },
      { name: 'Channel', value: `<#${snapshot.channelId}>`, inline: true },
      { name: reason.label, value: truncate(reason.detail, 1_024), inline: false },
    )
    .setFooter({ text: `Message ID: ${snapshot.messageId}` })
    .setTimestamp();
}

export function buildDiscordEditedMessagePanel(snapshot: TrackedSnipeMessage, updatedContent: string) {
  const messageUrl = `https://discord.com/channels/${snapshot.guildId}/${snapshot.channelId}/${snapshot.messageId}`;
  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setAuthor({ name: 'Message edited', iconURL: snapshot.authorAvatarUrl })
    .setDescription(`**Author:** ${authorLine(snapshot)}\n**Channel:** <#${snapshot.channelId}> · [Open message](${messageUrl})`)
    .addFields(
      { name: 'Before', value: messageText(snapshot.content), inline: false },
      { name: 'After', value: messageText(updatedContent), inline: false },
    )
    .setFooter({ text: `Message ID: ${snapshot.messageId}` })
    .setTimestamp();
}

export async function logDiscordMessageEdit(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) return;
  const snapshot = getTrackedSnipeMessage(message.id);
  if (!snapshot || !canLogSnapshot(snapshot) || snapshot.content === message.content) return;

  const settings = await getMessageLogSettings(config);
  if (!settings.editedMessageChannelId) return;
  await sendMessageLog(message.guild, settings.editedMessageChannelId, buildDiscordEditedMessagePanel(snapshot, message.content));
}

export async function logDiscordMessageDeletion(config: DiscordBotConfig, guild: Guild, messageId: string) {
  const snapshot = getTrackedSnipeMessage(messageId);
  if (!snapshot || snapshot.guildId !== config.guildId || !canLogSnapshot(snapshot)) return;

  const settings = await getMessageLogSettings(config);
  if (!settings.deletedMessageChannelId) return;
  const reason = await resolveDiscordMessageDeletionReason(guild, snapshot.authorId, snapshot.channelId);
  await sendMessageLog(guild, settings.deletedMessageChannelId, buildDiscordDeletedMessagePanel(snapshot, reason));
}

export async function logDiscordBulkMessageDeletion(config: DiscordBotConfig, guild: Guild, messageIds: readonly string[]) {
  const snapshots = messageIds
    .map((messageId) => getTrackedSnipeMessage(messageId))
    .filter((snapshot): snapshot is TrackedSnipeMessage => Boolean(snapshot && snapshot.guildId === config.guildId && canLogSnapshot(snapshot)));
  if (!snapshots.length) return;

  const settings = await getMessageLogSettings(config);
  if (!settings.deletedMessageChannelId) return;
  const byChannel = new Map<string, TrackedSnipeMessage[]>();
  for (const snapshot of snapshots) {
    const group = byChannel.get(snapshot.channelId) ?? [];
    group.push(snapshot);
    byChannel.set(snapshot.channelId, group);
  }

  for (const [channelId, channelSnapshots] of byChannel) {
    const reason = await resolveDiscordBulkMessageDeletionReason(guild, channelId);
    const bannedMemberIds = getRecentlyBannedDiscordUserIds(guild.id, channelSnapshots.map((snapshot) => snapshot.authorId));
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: 'Messages bulk deleted' })
      .setDescription(`**${channelSnapshots.length}** cached member message${channelSnapshots.length === 1 ? '' : 's'} deleted from <#${channelId}>.`)
      .addFields(
        { name: 'Members affected', value: affectedMemberList(channelSnapshots), inline: false },
        { name: reason.label, value: truncate(reason.detail, 1_024), inline: false },
      )
      .setTimestamp();
    await sendMessageLog(guild, settings.deletedMessageChannelId, embed);
    for (const snapshot of channelSnapshots) {
      const messageReason = bannedMemberIds.has(snapshot.authorId)
        ? { label: 'Deleted as part of a ban', detail: 'A Discord ban event was observed.' }
        : reason;
      await sendMessageLog(guild, settings.deletedMessageChannelId, buildDiscordDeletedMessagePanel(snapshot, messageReason));
    }
  }
}
