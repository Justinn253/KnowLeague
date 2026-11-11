import type { Guild, Message, SendableChannels } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

const DISBOARD_BOT_ID = '302050872383242240';
const DISBOARD_BUMP_REMINDER_DELAY_MS = 2 * 60 * 60 * 1_000;
const DISBOARD_RECONCILIATION_INTERVAL_MS = 30_000;
const DISBOARD_RECONCILIATION_WINDOW_MS = 3 * 60 * 60 * 1_000;
const DISBOARD_RECONCILIATION_MESSAGE_LIMIT = 25;
const DISBOARD_MESSAGE_SETTLE_DELAY_MS = 3_000;

let bumpReminderTimer: NodeJS.Timeout | null = null;
let bumpReconciliationTimer: NodeJS.Timeout | null = null;
let scheduledBumpMessageId: string | null = null;
let lastDisboardObservation: { at: number; detail: string } | null = null;

type DisboardBumpSettings = {
  channelId: string | null;
  reminderDueAt: Date | null;
  reminderSourceMessageId: string | null;
  reminderUserId: string | null;
};

type StoredDisboardBumpSettingsRow = {
  disboard_bump_channel_id: string | null;
  disboard_bump_reminder_due_at: string | null;
  disboard_bump_reminder_source_message_id: string | null;
  disboard_bump_reminder_user_id: string | null;
};

export type DisboardBumpReminderStatus = {
  channelId: string | null;
  dueAt: Date | null;
  lastObservation: string | null;
  reconciliationActive: boolean;
  reminderUserId: string | null;
  sourceMessageId: string | null;
  timerArmed: boolean;
};

function recordDisboardObservation(detail: string) {
  lastDisboardObservation = { at: Date.now(), detail };
}

function isDisboardMessage(message: Message) {
  return message.author.id === DISBOARD_BOT_ID
    || message.applicationId === DISBOARD_BOT_ID
    || message.author.username.toLocaleLowerCase() === 'disboard';
}

export function isDisboardBumpSuccessText(value: string) {
  const normalized = value.toLocaleLowerCase();
  return normalized.includes('bump done') || /\bbumped\b/.test(normalized);
}

function messageText(message: Message) {
  return [
    message.content,
    ...message.embeds.flatMap((embed) => [
      embed.author?.name ?? '',
      embed.description ?? '',
      embed.footer?.text ?? '',
      embed.title ?? '',
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ]),
  ].join('\n');
}

export function isSuccessfulDisboardBump(config: DiscordBotConfig, message: Message, bumpChannelId: string | null) {
  return Boolean(
    bumpChannelId
    && message.inGuild()
    && message.guildId === config.guildId
    && message.channelId === bumpChannelId
    && isDisboardBumpSuccessText(messageText(message)),
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function settleDisboardMessage(message: Message) {
  const elapsed = Date.now() - message.createdTimestamp;
  if (elapsed < DISBOARD_MESSAGE_SETTLE_DELAY_MS) {
    await delay(DISBOARD_MESSAGE_SETTLE_DELAY_MS - elapsed);
  }
  return message.fetch().catch(() => message);
}

async function getDisboardBumpSettings(config: DiscordBotConfig): Promise<DisboardBumpSettings> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_leveling_settings')
    .select('disboard_bump_channel_id, disboard_bump_reminder_due_at, disboard_bump_reminder_source_message_id, disboard_bump_reminder_user_id')
    .eq('guild_id', config.guildId)
    .maybeSingle<StoredDisboardBumpSettingsRow>();
  if (error) throw new Error(`Unable to load DISBOARD bump settings: ${error.message}`);
  return {
    channelId: data?.disboard_bump_channel_id ?? null,
    reminderDueAt: data?.disboard_bump_reminder_due_at ? new Date(data.disboard_bump_reminder_due_at) : null,
    reminderSourceMessageId: data?.disboard_bump_reminder_source_message_id ?? null,
    reminderUserId: data?.disboard_bump_reminder_user_id ?? null,
  };
}

export async function getDisboardBumpReminderStatus(config: DiscordBotConfig): Promise<DisboardBumpReminderStatus> {
  const settings = await getDisboardBumpSettings(config);
  return {
    channelId: settings.channelId,
    dueAt: settings.reminderDueAt,
    lastObservation: lastDisboardObservation
      ? `${lastDisboardObservation.detail} <t:${Math.floor(lastDisboardObservation.at / 1_000)}:R>`
      : null,
    reconciliationActive: bumpReconciliationTimer !== null,
    reminderUserId: settings.reminderUserId,
    sourceMessageId: settings.reminderSourceMessageId,
    timerArmed: Boolean(
      bumpReminderTimer
      && settings.reminderSourceMessageId
      && scheduledBumpMessageId === settings.reminderSourceMessageId,
    ),
  };
}

function armDisboardBumpReminder(config: DiscordBotConfig, channel: SendableChannels, sourceMessageId: string, dueAt: Date) {
  if (bumpReminderTimer) clearTimeout(bumpReminderTimer);
  scheduledBumpMessageId = sourceMessageId;

  const reminderDelay = Math.max(0, dueAt.getTime() - Date.now());
  bumpReminderTimer = setTimeout(() => {
    if (scheduledBumpMessageId !== sourceMessageId) return;
    bumpReminderTimer = null;
    scheduledBumpMessageId = null;

    void getDisboardBumpSettings(config)
      .then(async (settings) => {
        if (settings.channelId !== channel.id || !settings.reminderDueAt || settings.reminderSourceMessageId !== sourceMessageId) return;
        const { data: claimed, error } = await createBotServiceClient(config).rpc('claim_disboard_bump_reminder', {
          p_due_at: dueAt.toISOString(),
          p_guild_id: config.guildId,
          p_source_message_id: sourceMessageId,
        });
        if (error) throw new Error(`Unable to claim DISBOARD bump reminder: ${error.message}`);
        if (claimed !== true) return;
        if (!settings.reminderUserId) {
          await channel.send({ content: 'The scheduled DISBOARD reminder was not sent because no reminder user is configured.' });
          return;
        }
        await channel.send({
          allowedMentions: { parse: [], users: [settings.reminderUserId] },
          content: `<@${settings.reminderUserId}> It has been two hours since the last successful DISBOARD bump. You can use /bump again.`,
        });
      })
      .catch((error: unknown) => console.error('DISBOARD bump reminder failed.', error));
  }, reminderDelay);
  bumpReminderTimer.unref();
}

export async function scheduleDisboardBumpReminder(
  config: DiscordBotConfig,
  channel: SendableChannels,
  bumpMessage: Pick<Message, 'createdTimestamp' | 'id'>,
  announce = true,
) {
  const dueAt = new Date(bumpMessage.createdTimestamp + DISBOARD_BUMP_REMINDER_DELAY_MS);
  const { data: recorded, error } = await createBotServiceClient(config).rpc('record_disboard_bump_reminder', {
    p_bumped_at: new Date(bumpMessage.createdTimestamp).toISOString(),
    p_guild_id: config.guildId,
    p_reminder_due_at: dueAt.toISOString(),
    p_source_message_id: bumpMessage.id,
  });
  if (error) throw new Error(`Unable to persist DISBOARD bump reminder: ${error.message}`);
  if (recorded !== true) return false;

  armDisboardBumpReminder(config, channel, bumpMessage.id, dueAt);
  if (!announce) return true;
  const settings = await getDisboardBumpSettings(config);
  const recipient = settings.reminderUserId
    ? `The configured reminder will be sent <t:${Math.floor(dueAt.getTime() / 1_000)}:F> (<t:${Math.floor(dueAt.getTime() / 1_000)}:R>).`
    : `The next reminder time is <t:${Math.floor(dueAt.getTime() / 1_000)}:F>, but no reminder user is configured yet.`;
  await channel.send({
    allowedMentions: { parse: [] },
    content: `DISBOARD bump confirmed. ${recipient}`,
  });
  return true;
}

export async function handleDisboardBump(config: DiscordBotConfig, message: Message) {
  const settledMessage = await settleDisboardMessage(message);
  if (!settledMessage.inGuild() || settledMessage.guildId !== config.guildId || !isDisboardMessage(settledMessage)) return false;
  const settings = await getDisboardBumpSettings(config);
  if (!settings.channelId || settledMessage.channelId !== settings.channelId) return false;
  if (!settledMessage.channel.isSendable()) {
    recordDisboardObservation('DISBOARD message detected, but the configured channel is not sendable');
    return false;
  }
  const scheduled = await scheduleDisboardBumpReminder(config, settledMessage.channel, settledMessage);
  recordDisboardObservation(scheduled
    ? 'DISBOARD message detected and reminder scheduled'
    : 'DISBOARD message was already recorded');
  return scheduled;
}

export async function reconcileDisboardBumpHistory(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return 0;
  const settings = await getDisboardBumpSettings(config);
  if (!settings.channelId) return 0;
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`DISBOARD bump reminder channel ${settings.channelId} is unavailable, not text-based, or not sendable.`);
    return 0;
  }

  const cutoff = Date.now() - DISBOARD_RECONCILIATION_WINDOW_MS;
  const messages = [...(await channel.messages.fetch({ limit: DISBOARD_RECONCILIATION_MESSAGE_LIMIT })).values()]
    .filter((message) => isDisboardMessage(message)
      && message.createdTimestamp >= cutoff
      && message.createdTimestamp + DISBOARD_BUMP_REMINDER_DELAY_MS > Date.now())
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  let scheduled = 0;
  for (const message of messages) {
    if (await handleDisboardBump(config, message)) scheduled += 1;
  }
  return scheduled;
}

export async function restoreDisboardBumpReminder(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  const settings = await getDisboardBumpSettings(config);
  if (!settings.channelId) return;

  const channel = await guild.channels.fetch(settings.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`DISBOARD bump reminder channel ${settings.channelId} is unavailable, not text-based, or not sendable.`);
    return;
  }
  if (settings.reminderDueAt && settings.reminderSourceMessageId) {
    armDisboardBumpReminder(config, channel, settings.reminderSourceMessageId, settings.reminderDueAt);
    return;
  }
  await reconcileDisboardBumpHistory(config, guild);
}

export function startDisboardBumpReconciliation(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  if (bumpReconciliationTimer) clearInterval(bumpReconciliationTimer);
  bumpReconciliationTimer = setInterval(() => {
    void reconcileDisboardBumpHistory(config, guild)
      .catch((error: unknown) => console.error('DISBOARD bump history reconciliation failed.', error));
  }, DISBOARD_RECONCILIATION_INTERVAL_MS);
  bumpReconciliationTimer.unref();
}

export function stopDisboardBumpReminder() {
  if (bumpReminderTimer) clearTimeout(bumpReminderTimer);
  if (bumpReconciliationTimer) clearInterval(bumpReconciliationTimer);
  bumpReminderTimer = null;
  bumpReconciliationTimer = null;
  scheduledBumpMessageId = null;
}
