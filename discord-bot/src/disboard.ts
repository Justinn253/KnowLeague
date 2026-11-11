import { EmbedBuilder, type Guild, type Message, type SendableChannels } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { awardKnowBucksMessageReward } from './knowbucks.js';
import { createBotServiceClient } from './supabase.js';

const DISBOARD_BOT_ID = '302050872383242240';
const DISBOARD_BUMP_REMINDER_DELAY_MS = 2 * 60 * 60 * 1000;

let bumpReminderTimer: NodeJS.Timeout | null = null;
let scheduledBumpMessageId: string | null = null;

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
  reminderUserId: string | null;
  sourceMessageId: string | null;
  timerArmed: boolean;
};

export function isDisboardBumpSuccessText(value: string) {
  return value.toLocaleLowerCase().includes('bump done');
}

function isDisboardApplicationMessage(message: Message) {
  return message.author.id === DISBOARD_BOT_ID || message.applicationId === DISBOARD_BOT_ID;
}

export function isSuccessfulDisboardBump(config: DiscordBotConfig, message: Message, bumpChannelId: string | null) {
  if (!bumpChannelId
    || !message.inGuild()
    || message.guildId !== config.guildId
    || message.channelId !== bumpChannelId
    || !isDisboardApplicationMessage(message)) {
    return false;
  }

  const confirmationText = [
    message.content,
    ...message.embeds.flatMap((embed) => [embed.title ?? '', embed.description ?? '']),
  ].join('\n');
  return isDisboardBumpSuccessText(confirmationText);
}

/**
 * Discord can redact message content and embeds when Message Content Intent is
 * disabled in the Developer Portal. A DISBOARD application-command response
 * still identifies its application and command, which is enough to schedule a
 * reminder but deliberately not enough to award KnowBucks.
 */
export function isDisboardBumpReminderCandidate(config: DiscordBotConfig, message: Message, bumpChannelId: string | null) {
  if (isSuccessfulDisboardBump(config, message, bumpChannelId)) return true;
  return Boolean(
    bumpChannelId
    && message.inGuild()
    && message.guildId === config.guildId
    && message.channelId === bumpChannelId
    && message.applicationId === DISBOARD_BOT_ID
    && message.interaction?.commandName.toLocaleLowerCase().split(/\s+/)[0] === 'bump',
  );
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
    reminderUserId: settings.reminderUserId,
    sourceMessageId: settings.reminderSourceMessageId,
    timerArmed: Boolean(
      bumpReminderTimer
      && settings.reminderSourceMessageId
      && scheduledBumpMessageId === settings.reminderSourceMessageId,
    ),
  };
}

function successfulBumpUserId(message: Message) {
  const interactionUserId = message.interactionMetadata?.user.id;
  if (interactionUserId) return interactionUserId;

  return message.mentions.users.first()?.id ?? null;
}

async function maybeAwardDisboardBump(config: DiscordBotConfig, message: Message, bumpChannelId: string) {
  if (!isSuccessfulDisboardBump(config, message, bumpChannelId)) return;

  const userId = successfulBumpUserId(message);
  if (!userId) {
    console.warn(`DISBOARD bump confirmation ${message.id} did not identify the member who bumped.`);
    return;
  }

  const award = await awardKnowBucksMessageReward(config, userId, message.id, 'disboard_bump');
  if (!award.awarded) {
    return;
  }

  await message.reply({
    allowedMentions: { repliedUser: false },
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('DISBOARD bump rewarded')
        .setDescription(`<@${userId}> earned **2,500 KnowBucks** for the successful server bump!\nNew balance: **${new Intl.NumberFormat().format(award.current_balance ?? 0)} KnowBucks**.`),
    ],
  });
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
  const { error } = await createBotServiceClient(config)
    .from('discord_leveling_settings')
    .update({
      disboard_bump_reminder_due_at: dueAt.toISOString(),
      disboard_bump_reminder_source_message_id: bumpMessage.id,
    })
    .eq('guild_id', config.guildId);
  if (error) throw new Error(`Unable to persist DISBOARD bump reminder: ${error.message}`);

  armDisboardBumpReminder(config, channel, bumpMessage.id, dueAt);
  if (!announce) return;
  const settings = await getDisboardBumpSettings(config);
  const recipient = settings.reminderUserId
    ? `The configured reminder will be sent <t:${Math.floor(dueAt.getTime() / 1_000)}:F> (<t:${Math.floor(dueAt.getTime() / 1_000)}:R>).`
    : `The next reminder time is <t:${Math.floor(dueAt.getTime() / 1_000)}:F>, but no reminder user is configured yet.`;
  await channel.send({
    allowedMentions: { parse: [] },
    content: `DISBOARD bump confirmed. ${recipient}`,
  });
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

  // Preserve one existing in-memory schedule across the first deployment of
  // durable reminder state. All later reminders restore from the stored due
  // time above, so high message volume cannot hide the successful bump.
  const messages = await channel.messages.fetch({ limit: 100 });
  const lastSuccessfulBump = [...messages.values()].reduce<Message | null>((latest, message) => {
    if (!isSuccessfulDisboardBump(config, message, settings.channelId)) return latest;
    return !latest || message.createdTimestamp > latest.createdTimestamp ? message : latest;
  }, null);
  if (lastSuccessfulBump) {
    await scheduleDisboardBumpReminder(config, channel, lastSuccessfulBump, false);
  }
}

export async function handleDisboardBump(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || !isDisboardApplicationMessage(message)) return;

  const settings = await getDisboardBumpSettings(config);
  const confirmedSuccess = isSuccessfulDisboardBump(config, message, settings.channelId);
  if (!isDisboardBumpReminderCandidate(config, message, settings.channelId)) return;

  if (message.channel.isSendable()) {
    await scheduleDisboardBumpReminder(config, message.channel, message);
  }
  if (confirmedSuccess) await maybeAwardDisboardBump(config, message, settings.channelId!);
}

export function stopDisboardBumpReminder() {
  if (bumpReminderTimer) clearTimeout(bumpReminderTimer);
  bumpReminderTimer = null;
  scheduledBumpMessageId = null;
}
