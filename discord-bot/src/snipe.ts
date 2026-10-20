import type { Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';

export type SnipedAttachment = {
  isImage: boolean;
  name: string;
  url: string;
};

export type SnipedMessage = {
  attachments: readonly SnipedAttachment[];
  authorDisplayName: string;
  content: string;
  deletedAt: number;
  sentAt: number;
};

type TrackedMessage = SnipedMessage & {
  channelId: string;
  guildId: string;
  expiresAt: number;
};

const TRACKED_MESSAGE_RETENTION_MS = 6 * 60 * 60 * 1_000;
const SNIPED_MESSAGE_RETENTION_MS = 60 * 60 * 1_000;
const MAX_TRACKED_MESSAGES = 5_000;
const trackedMessagesById = new Map<string, TrackedMessage>();
const lastDeletedMessageByChannelId = new Map<string, SnipedMessage & { expiresAt: number }>();

function isImageAttachment(contentType: string | null, name: string | null) {
  return contentType?.startsWith('image/')
    || /\.(avif|gif|jpe?g|png|webp)$/i.test(name ?? '');
}

function pruneExpiredMessages(now: number) {
  for (const [messageId, tracked] of trackedMessagesById) {
    if (tracked.expiresAt <= now) trackedMessagesById.delete(messageId);
  }
  for (const [channelId, sniped] of lastDeletedMessageByChannelId) {
    if (sniped.expiresAt <= now) lastDeletedMessageByChannelId.delete(channelId);
  }
}

export function trackSnipeMessage(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.system || message.partial) {
    return;
  }

  const now = Date.now();
  pruneExpiredMessages(now);
  trackedMessagesById.set(message.id, {
    attachments: [...message.attachments.values()].slice(0, 3).map((attachment) => ({
      isImage: isImageAttachment(attachment.contentType, attachment.name),
      name: attachment.name ?? 'Attachment',
      url: attachment.url,
    })),
    authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
    channelId: message.channelId,
    content: message.content,
    deletedAt: 0,
    expiresAt: now + TRACKED_MESSAGE_RETENTION_MS,
    guildId: config.guildId,
    sentAt: message.createdTimestamp,
  });

  while (trackedMessagesById.size > MAX_TRACKED_MESSAGES) {
    const oldestMessageId = trackedMessagesById.keys().next().value;
    if (!oldestMessageId) break;
    trackedMessagesById.delete(oldestMessageId);
  }
}

export function trackDeletedSnipeMessage(config: DiscordBotConfig, messageId: string) {
  const now = Date.now();
  pruneExpiredMessages(now);
  const tracked = trackedMessagesById.get(messageId);
  if (!tracked || tracked.guildId !== config.guildId) {
    return;
  }

  trackedMessagesById.delete(messageId);
  lastDeletedMessageByChannelId.set(tracked.channelId, {
    attachments: tracked.attachments,
    authorDisplayName: tracked.authorDisplayName,
    content: tracked.content,
    deletedAt: now,
    expiresAt: now + SNIPED_MESSAGE_RETENTION_MS,
    sentAt: tracked.sentAt,
  });
}

export function getSnipedMessage(channelId: string): SnipedMessage | null {
  const now = Date.now();
  pruneExpiredMessages(now);
  const sniped = lastDeletedMessageByChannelId.get(channelId);
  if (!sniped) return null;

  return {
    attachments: sniped.attachments,
    authorDisplayName: sniped.authorDisplayName,
    content: sniped.content,
    deletedAt: sniped.deletedAt,
    sentAt: sniped.sentAt,
  };
}

function truncate(value: string, maximumLength: number) {
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 3)}...`;
}

export function formatSnipedMessage(sniped: SnipedMessage) {
  const content = sniped.content.trim() ? truncate(sniped.content, 2_200) : '_No text content._';
  const nonImageAttachments = sniped.attachments.filter((attachment) => !attachment.isImage);
  const attachmentLines = nonImageAttachments.length > 0
    ? `\n\n**Attachments**\n${nonImageAttachments.map((attachment) => `[${truncate(attachment.name, 80)}](${attachment.url})`).join('\n')}`
    : '';
  return truncate(`**${truncate(sniped.authorDisplayName, 120)}**\n${content}${attachmentLines}`, 4_000);
}

export function getSnipeImageAttachments(sniped: SnipedMessage) {
  return sniped.attachments.filter((attachment) => attachment.isImage);
}
