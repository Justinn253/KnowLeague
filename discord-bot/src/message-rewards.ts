import { randomInt } from 'node:crypto';
import { EmbedBuilder, type Message } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { awardKnowBucksMessageReward, type KnowBucksMessageRewardType } from './knowbucks.js';

export type MessageLotteryReward = {
  amount: number;
  type: KnowBucksMessageRewardType;
};

const MESSAGE_LOTTERY_REWARDS: readonly MessageLotteryReward[] = [
  { amount: 10_000, type: 'message_lottery_10000' },
  { amount: 25_000, type: 'message_lottery_25000' },
  { amount: 50_000, type: 'message_lottery_50000' },
  { amount: 250_000, type: 'message_lottery_250000' },
  { amount: 1_000_000, type: 'message_lottery_1000000' },
];

const MESSAGE_LOTTERY_REWARD_WEIGHTS = [100, 50, 20, 5, 1] as const;
const MESSAGE_LOTTERY_TOTAL_WEIGHT = MESSAGE_LOTTERY_REWARD_WEIGHTS.reduce((total, weight) => total + weight, 0);

export function isMessageLotteryWinner(roll: number) {
  return roll === 0;
}

export function messageLotteryRewardForRoll(roll: number): MessageLotteryReward {
  if (!Number.isInteger(roll) || roll < 0 || roll >= MESSAGE_LOTTERY_TOTAL_WEIGHT) {
    throw new Error(`Message reward roll must be an integer from 0 through ${MESSAGE_LOTTERY_TOTAL_WEIGHT - 1}.`);
  }
  let remaining = roll;
  for (let index = 0; index < MESSAGE_LOTTERY_REWARDS.length; index += 1) {
    const weight = MESSAGE_LOTTERY_REWARD_WEIGHTS[index]!;
    if (remaining < weight) return MESSAGE_LOTTERY_REWARDS[index]!;
    remaining -= weight;
  }
  return MESSAGE_LOTTERY_REWARDS[MESSAGE_LOTTERY_REWARDS.length - 1]!;
}

function formatKnowBucks(value: number) {
  return new Intl.NumberFormat().format(value);
}

export async function maybeAwardMessageKnowBucks(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) {
    return;
  }
  if (!isMessageLotteryWinner(randomInt(1_000))) {
    return;
  }

  const reward = messageLotteryRewardForRoll(randomInt(MESSAGE_LOTTERY_TOTAL_WEIGHT));
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
