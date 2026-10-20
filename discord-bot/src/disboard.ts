import { EmbedBuilder, type Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { awardKnowBucksMessageReward } from './knowbucks.js';

const DISBOARD_BOT_ID = '302050872383242240';

export function isDisboardBumpSuccessText(value: string) {
  return value.toLocaleLowerCase().includes('bump done');
}

function successfulBumpUserId(message: Message) {
  const interactionUserId = message.interactionMetadata?.user.id;
  if (interactionUserId) return interactionUserId;

  return message.mentions.users.first()?.id ?? null;
}

export async function maybeAwardDisboardBump(config: DiscordBotConfig, message: Message) {
  if (!config.bumpChannelId
    || !message.inGuild()
    || message.guildId !== config.guildId
    || message.channelId !== config.bumpChannelId
    || message.author.id !== DISBOARD_BOT_ID) {
    return;
  }

  const confirmationText = [
    message.content,
    ...message.embeds.flatMap((embed) => [embed.title ?? '', embed.description ?? '']),
  ].join('\n');
  if (!isDisboardBumpSuccessText(confirmationText)) {
    return;
  }

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
