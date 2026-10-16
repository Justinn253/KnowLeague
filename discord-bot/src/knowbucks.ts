import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

type KnowBucksBalanceRow = {
  balance: number;
};

type KnowBucksUpdateRow = {
  applied_amount: number;
  current_balance: number;
  previous_balance: number;
};

type KnowBucksPaymentRow = {
  recipient_balance: number;
  sender_balance: number;
};

export type KnowBucksAdminOperation = 'add' | 'remove' | 'set';

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function getKnowBucksBalance(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_knowbucks_balances')
    .select('balance')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .maybeSingle<KnowBucksBalanceRow>();
  if (error) {
    throw new Error(`Unable to load KnowBucks balance: ${error.message}`);
  }
  return data?.balance ?? 0;
}

export async function updateKnowBucks(
  config: DiscordBotConfig,
  discordUserId: string,
  operation: KnowBucksAdminOperation,
  amount: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('update_discord_knowbucks', {
    p_amount: amount,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_operation: operation,
  });
  if (error) {
    throw new Error(`Unable to update KnowBucks: ${error.message}`);
  }
  const update = getFirstResult(data as KnowBucksUpdateRow | KnowBucksUpdateRow[] | null);
  if (!update) {
    throw new Error('KnowBucks update did not return a result.');
  }
  return update;
}

export async function payKnowBucks(
  config: DiscordBotConfig,
  senderDiscordUserId: string,
  recipientDiscordUserId: string,
  amount: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('pay_discord_knowbucks', {
    p_amount: amount,
    p_guild_id: config.guildId,
    p_recipient_discord_user_id: recipientDiscordUserId,
    p_sender_discord_user_id: senderDiscordUserId,
  });
  if (error) {
    throw new Error(`Unable to pay KnowBucks: ${error.message}`);
  }
  const payment = getFirstResult(data as KnowBucksPaymentRow | KnowBucksPaymentRow[] | null);
  if (!payment) {
    throw new Error('KnowBucks payment did not return a result.');
  }
  return payment;
}
