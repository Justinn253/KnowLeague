import type { Guild } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { buildWebsiteSkindleShareEmbed } from './skindle.js';
import { createBotServiceClient } from './supabase.js';

const SKINDLE_SHARE_SCHEDULER_INTERVAL_MS = 15_000;

type PendingSkindleShare = {
  channel_id: string;
  date_key: string;
  discord_user_id: string;
  guess_count: number;
  id: string;
  progress_rows: string[];
  user_id: string;
};

type ProfileDiscordLink = {
  discord_user_id: string | null;
};

let scheduler: NodeJS.Timeout | null = null;
let sharesInFlight: Promise<void> | null = null;
let shareStorageUnavailable = false;

function isMissingShareStorage(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === 'PGRST205'
    || (typeof candidate.message === 'string' && candidate.message.includes('discord_skindle_share_outbox'));
}

async function markShare(config: DiscordBotConfig, id: string, status: 'discarded' | 'sent') {
  const { error } = await createBotServiceClient(config)
    .from('discord_skindle_share_outbox')
    .update({ status, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) })
    .eq('id', id);
  if (error) throw new Error(`Unable to update website Skindle share: ${error.message}`);
}

async function hasCurrentDiscordLink(config: DiscordBotConfig, share: PendingSkindleShare) {
  const { data, error } = await createBotServiceClient(config)
    .from('profile_private_details')
    .select('discord_user_id')
    .eq('user_id', share.user_id)
    .maybeSingle<ProfileDiscordLink>();
  if (error) throw new Error(`Unable to verify website Skindle share identity: ${error.message}`);
  return data?.discord_user_id === share.discord_user_id;
}

async function publishPendingSkindleShares(config: DiscordBotConfig, guild: Guild) {
  if (shareStorageUnavailable) return;
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skindle_share_outbox')
    .select('id,user_id,discord_user_id,channel_id,date_key,guess_count,progress_rows')
    .eq('guild_id', config.guildId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)
    .returns<PendingSkindleShare[]>();
  if (error) {
    if (isMissingShareStorage(error)) {
      shareStorageUnavailable = true;
      console.info('Website Skindle sharing is waiting for migration 182; reconciliation will resume after the bot restarts.');
      return;
    }
    throw new Error(`Unable to load pending website Skindle shares: ${error.message}`);
  }

  for (const share of data ?? []) {
    try {
      if (!(await hasCurrentDiscordLink(config, share))) {
        await markShare(config, share.id, 'discarded');
        continue;
      }

      const channel = await guild.channels.fetch(share.channel_id).catch(() => null);
      if (!channel?.isTextBased() || !('send' in channel)) {
        await markShare(config, share.id, 'discarded');
        continue;
      }

      const member = await guild.members.fetch(share.discord_user_id).catch(() => null);
      await channel.send({
        allowedMentions: { parse: [] },
        embeds: [buildWebsiteSkindleShareEmbed(
          member?.displayName ?? 'A KnowLeague player',
          share.date_key,
          share.guess_count,
          share.progress_rows,
        )],
      });
      await markShare(config, share.id, 'sent');
    } catch (error) {
      // Keep a transient Discord or database failure pending for the next
      // reconciliation tick. The outbox's unique key prevents duplicates.
      console.error(`Website Skindle share ${share.id} could not be published.`, error);
    }
  }
}

export async function reconcileDiscordSkindleShares(config: DiscordBotConfig, guild: Guild) {
  if (sharesInFlight) return sharesInFlight;
  const run = publishPendingSkindleShares(config, guild);
  sharesInFlight = run;
  try {
    await run;
  } finally {
    if (sharesInFlight === run) sharesInFlight = null;
  }
}

export function startDiscordSkindleShareScheduler(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId || scheduler) return;
  const tick = () => {
    void reconcileDiscordSkindleShares(config, guild)
      .catch((error: unknown) => console.error('Website Skindle share reconciliation failed.', error));
  };
  tick();
  scheduler = setInterval(tick, SKINDLE_SHARE_SCHEDULER_INTERVAL_MS);
  scheduler.unref();
}
