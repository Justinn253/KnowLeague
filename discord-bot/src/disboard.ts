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
  reminderUserId: string | null;
};

type StoredDisboardBumpSettingsRow = {
  disboard_bump_channel_id: string | null;
  disboard_bump_reminder_user_id: string | null;
};

export function isDisboardBumpSuccessText(value: string) {
  return value.toLocaleLowerCase().includes('bump done');
}

export function isSuccessfulDisboardBump(config: DiscordBotConfig, message: Message, bumpChannelId: string | null) {
  if (!bumpChannelId
    || !message.inGuild()
    || message.guildId !== config.guildId
    || message.channelId !== bumpChannelId
    || message.author.id !== DISBOARD_BOT_ID) {
    return false;
  }

  const confirmationText = [
    message.content,
    ...message.embeds.flatMap((embed) => [embed.title ?? '', embed.description ?? '']),
  ].join('\n');
  return isDisboardBumpSuccessText(confirmationText);
}

async function getDisboardBumpSettings(config: DiscordBotConfig): Promise<DisboardBumpSettings> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_leveling_settings')
    .select('disboard_bump_channel_id, disboard_bump_reminder_user_id')
    .eq('guild_id', config.guildId)
    .maybeSingle<StoredDisboardBumpSettingsRow>();
  if (error) throw new Error(`Unable to load DISBOARD bump settings: ${error.message}`);
  return {
    channelId: data?.disboard_bump_channel_id ?? null,
    reminderUserId: data?.disboard_bump_reminder_user_id ?? null,
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

export function scheduleDisboardBumpReminder(config: DiscordBotConfig, channel: SendableChannels, bumpMessage: Pick<Message, 'createdTimestamp' | 'id'>) {
  if (bumpReminderTimer) clearTimeout(bumpReminderTimer);
  scheduledBumpMessageId = bumpMessage.id;

  const reminderDelay = Math.max(0, bumpMessage.createdTimestamp + DISBOARD_BUMP_REMINDER_DELAY_MS - Date.now());
  bumpReminderTimer = setTimeout(() => {
    if (scheduledBumpMessageId !== bumpMessage.id) return;
    bumpReminderTimer = null;
    scheduledBumpMessageId = null;

    void getDisboardBumpSettings(config)
      .then(async (settings) => {
        if (settings.channelId !== channel.id || !settings.reminderUserId) return;
        await channel.send({
          allowedMentions: { parse: [], users: [settings.reminderUserId] },
          content: `<@${settings.reminderUserId}> It has been two hours since the last successful DISBOARD bump. You can use /bump again.`,
        });
      })
      .catch((error: unknown) => console.error('DISBOARD bump reminder failed.', error));
  }, reminderDelay);
  bumpReminderTimer.unref();
}

export async function restoreDisboardBumpReminder(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId) return;
  const settings = await getDisboardBumpSettings(config);
  if (!settings.channelId || !settings.reminderUserId) return;

  const channel = await guild.channels.fetch(settings.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    console.warn(`DISBOARD bump reminder channel ${settings.channelId} is unavailable, not text-based, or not sendable.`);
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 });
  const lastSuccessfulBump = [...messages.values()].reduce<Message | null>((latest, message) => {
    if (!isSuccessfulDisboardBump(config, message, settings.channelId)) return latest;
    return !latest || message.createdTimestamp > latest.createdTimestamp ? message : latest;
  }, null);
  if (lastSuccessfulBump) {
    scheduleDisboardBumpReminder(config, channel, lastSuccessfulBump);
  }
}

export async function handleDisboardBump(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.id !== DISBOARD_BOT_ID) return;

  const settings = await getDisboardBumpSettings(config);
  if (!isSuccessfulDisboardBump(config, message, settings.channelId)) return;

  if (settings.reminderUserId && message.channel.isSendable()) {
    scheduleDisboardBumpReminder(config, message.channel, message);
  }
  await maybeAwardDisboardBump(config, message, settings.channelId!);
}

export function stopDisboardBumpReminder() {
  if (bumpReminderTimer) clearTimeout(bumpReminderTimer);
  bumpReminderTimer = null;
  scheduledBumpMessageId = null;
}
