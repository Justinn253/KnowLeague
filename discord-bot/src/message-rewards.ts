import { randomInt } from 'node:crypto';
import { EmbedBuilder, type Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { awardKnowBucksMessageReward, type KnowBucksMessageRewardType } from './knowbucks.js';

export type MessageLotteryReward = {
  amount: number;
  type: Exclude<KnowBucksMessageRewardType, 'disboard_bump'>;
};

const MESSAGE_LOTTERY_REWARDS: readonly MessageLotteryReward[] = [
  { amount: 1_000, type: 'message_lottery_1000' },
  { amount: 2_500, type: 'message_lottery_2500' },
  { amount: 5_000, type: 'message_lottery_5000' },
  { amount: 10_000, type: 'message_lottery_10000' },
  { amount: 25_000, type: 'message_lottery_25000' },
];

export function isMessageLotteryWinner(roll: number) {
  return roll === 0;
}

export function messageLotteryRewardForRoll(roll: number): MessageLotteryReward {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) {
    throw new Error('Message reward roll must be an integer from 0 through 99.');
  }
  if (roll < 75) return MESSAGE_LOTTERY_REWARDS[0];
  if (roll < 90) return MESSAGE_LOTTERY_REWARDS[1];
  if (roll < 95) return MESSAGE_LOTTERY_REWARDS[2];
  if (roll < 99) return MESSAGE_LOTTERY_REWARDS[3];
  return MESSAGE_LOTTERY_REWARDS[4];
}

function formatKnowBucks(value: number) {
  return new Intl.NumberFormat().format(value);
}

export async function maybeAwardMessageKnowBucks(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) {
    return;
  }
  if (!isMessageLotteryWinner(randomInt(100))) {
    return;
  }

  const reward = messageLotteryRewardForRoll(randomInt(100));
  const award = await awardKnowBucksMessageReward(config, message.author.id, message.id, reward.type);
  if (!award.awarded) {
    return;
  }

  await message.reply({
    allowedMentions: { repliedUser: false },
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('KnowBucks surprise!')
        .setDescription(`${message.author} received **${formatKnowBucks(reward.amount)} KnowBucks**!\nNew balance: **${formatKnowBucks(award.current_balance ?? 0)} KnowBucks**.`),
    ],
  });
}
