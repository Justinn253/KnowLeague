import type { Guild, GuildMember } from 'discord.js';
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

type KnowBucksCoinflipRow = {
  current_balance: number;
  wager_amount: number;
  won: boolean;
};

type KnowBucksSnipeRow = {
  current_balance: number;
};

type KnowBucksMessageRewardRow = {
  awarded: boolean;
  award_amount: number;
  current_balance: number | null;
};

type KnowBucksLeaderboardMember = {
  balance: number;
  discord_user_id: string;
};

export type KnowBucksLeaderboardEntry = {
  balance: number;
  displayName: string;
  userId: string;
};

export type KnowBucksMessageRewardType =
  | 'message_lottery_1000'
  | 'message_lottery_2500'
  | 'message_lottery_5000'
  | 'message_lottery_10000'
  | 'message_lottery_25000'
  | 'disboard_bump';

const LEADERBOARD_CACHE_DURATION_MS = 30_000;
const LEADERBOARD_MAX_MEMBER_SCAN = 500;
let cachedLeaderboard: {
  complete: boolean;
  expiresAt: number;
  guildId: string;
  value: KnowBucksLeaderboardEntry[];
} | null = null;

function invalidateKnowBucksLeaderboardCache() {
  cachedLeaderboard = null;
}

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
  invalidateKnowBucksLeaderboardCache();
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
  invalidateKnowBucksLeaderboardCache();
  return payment;
}

export async function flipKnowBucks(
  config: DiscordBotConfig,
  discordUserId: string,
  amount: number,
  won: boolean,
) {
  const { data, error } = await createBotServiceClient(config).rpc('flip_discord_knowbucks', {
    p_amount: amount,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_won: won,
  });
  if (error) {
    throw new Error(`Unable to flip KnowBucks: ${error.message}`);
  }
  const result = getFirstResult(data as KnowBucksCoinflipRow | KnowBucksCoinflipRow[] | null);
  if (!result) {
    throw new Error('KnowBucks coinflip did not return a result.');
  }
  invalidateKnowBucksLeaderboardCache();
  return result;
}

export async function purchaseSnipe(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_snipe', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) {
    throw new Error(`Unable to purchase /snipe: ${error.message}`);
  }
  const result = getFirstResult(data as KnowBucksSnipeRow | KnowBucksSnipeRow[] | null);
  if (!result) {
    throw new Error('/snipe purchase did not return a result.');
  }
  invalidateKnowBucksLeaderboardCache();
  return result;
}

export async function awardKnowBucksMessageReward(
  config: DiscordBotConfig,
  discordUserId: string,
  sourceMessageId: string,
  rewardType: KnowBucksMessageRewardType,
) {
  const { data, error } = await createBotServiceClient(config).rpc('award_discord_knowbucks_message_reward', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_reward_type: rewardType,
    p_source_message_id: sourceMessageId,
  });
  if (error) {
    throw new Error(`Unable to award KnowBucks message reward: ${error.message}`);
  }
  const result = getFirstResult(data as KnowBucksMessageRewardRow | KnowBucksMessageRewardRow[] | null);
  if (!result) {
    throw new Error('KnowBucks message reward did not return a result.');
  }
  if (result.awarded) invalidateKnowBucksLeaderboardCache();
  return result;
}

type ResolvedKnowBucksLeaderboardMember = KnowBucksLeaderboardMember & {
  member: GuildMember;
};

async function getResolvedKnowBucksLeaderboardMembers(
  config: DiscordBotConfig,
  guild: Guild,
  limit: number,
): Promise<ResolvedKnowBucksLeaderboardMember[]> {
  const supabase = createBotServiceClient(config);
  const entries: ResolvedKnowBucksLeaderboardMember[] = [];
  const pageSize = Math.min(100, Math.max(25, limit));
  let start = 0;

  while (entries.length < limit && start < LEADERBOARD_MAX_MEMBER_SCAN) {
    const { data, error } = await supabase
      .from('discord_knowbucks_balances')
      .select('balance, discord_user_id')
      .eq('guild_id', config.guildId)
      .gt('balance', 0)
      .order('balance', { ascending: false })
      .order('discord_user_id', { ascending: true })
      .range(start, Math.min(start + pageSize - 1, LEADERBOARD_MAX_MEMBER_SCAN - 1))
      .returns<KnowBucksLeaderboardMember[]>();
    if (error) {
      throw new Error(`Unable to load the KnowBucks leaderboard: ${error.message}`);
    }
    if (!data?.length) break;

    for (const entry of data) {
      try {
        const member = await guild.members.fetch(entry.discord_user_id);
        if (member.user.bot) continue;
        entries.push({ ...entry, member });
        if (entries.length === limit) break;
      } catch {
        // Balances remain auditable after a member leaves, but former members
        // should not occupy a visible server leaderboard rank.
      }
    }

    if (data.length < pageSize) break;
    start += pageSize;
  }

  return entries;
}

export async function getKnowBucksLeaderboard(
  config: DiscordBotConfig,
  guild: Guild,
  limit: number,
): Promise<KnowBucksLeaderboardEntry[]> {
  const now = Date.now();
  if (cachedLeaderboard
    && cachedLeaderboard.guildId === config.guildId
    && cachedLeaderboard.expiresAt > now
    && (cachedLeaderboard.complete || cachedLeaderboard.value.length >= limit)) {
    return cachedLeaderboard.value.slice(0, limit);
  }

  const entries = await getResolvedKnowBucksLeaderboardMembers(config, guild, 25);
  const value = entries.map((entry) => ({
    balance: entry.balance,
    displayName: entry.member.displayName,
    userId: entry.discord_user_id,
  }));
  cachedLeaderboard = {
    complete: value.length < 25,
    expiresAt: now + LEADERBOARD_CACHE_DURATION_MS,
    guildId: config.guildId,
    value,
  };
  return value.slice(0, limit);
}
