import { randomUUID } from 'node:crypto';
import type { Guild } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { buildMiningCompletedPanel } from './interactions.js';
import type { MiningDepthId, MiningResult } from './mining-catalog.js';
import { createBotServiceClient } from './supabase.js';

// This is delivery-only (not expedition progress polling); keeping it at
// thirty seconds minimizes idle database reads while still feeling prompt.
const MINING_WEBSITE_PANEL_DELIVERY_INTERVAL_MS = 30_000;
const MINING_WEBSITE_PANEL_DELIVERY_BATCH_SIZE = 10;
const miningWebsitePanelWorkerId = randomUUID();

type PendingMiningWebsitePanel = {
  channel_id: string;
  discord_user_id: string;
  event_kind: 'completed';
  expedition_id: number;
  id: number;
};

type MiningPanelExpeditionRow = {
  depth: MiningDepthId;
  result: MiningResult | null;
};

let deliveryInFlight = false;

function deliveryFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown Discord delivery failure.';
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 500) || 'Unknown Discord delivery failure.';
}

async function markMiningWebsitePanelFailed(config: DiscordBotConfig, panel: PendingMiningWebsitePanel, error: unknown) {
  const { error: updateError } = await createBotServiceClient(config).rpc('fail_discord_mining_website_panel_event', {
    p_claim_id: miningWebsitePanelWorkerId,
    p_error: deliveryFailureMessage(error),
    p_event_id: panel.id,
  });
  if (updateError) {
    console.error(`Discord Mining website panel ${panel.id} could not record its delivery failure.`, updateError);
  }
}

async function getMiningWebsitePanelExpedition(config: DiscordBotConfig, panel: PendingMiningWebsitePanel) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_mining_expeditions')
    .select('depth,result')
    .eq('id', panel.expedition_id)
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', panel.discord_user_id)
    .maybeSingle<MiningPanelExpeditionRow>();
  if (error) throw new Error(`Unable to load Mining website panel expedition: ${error.message}`);
  if (!data) throw new Error('Mining website panel expedition is no longer available.');
  return data;
}

async function deliverMiningWebsitePanel(config: DiscordBotConfig, guild: Guild, panel: PendingMiningWebsitePanel) {
  try {
    const [channel, expedition] = await Promise.all([
      guild.channels.fetch(panel.channel_id).catch(() => null),
      getMiningWebsitePanelExpedition(config, panel),
    ]);
    if (!channel?.isSendable()) {
      throw new Error('The configured Mining website panel channel is unavailable or not sendable.');
    }

    if (!expedition.result) throw new Error('The completed Mining result is unavailable for its website panel.');
    const panelMessage = buildMiningCompletedPanel(panel.discord_user_id, expedition.depth, expedition.result);

    const message = await channel.send({
      ...panelMessage,
      allowedMentions: { parse: [] },
    });
    const { error } = await createBotServiceClient(config).rpc('complete_discord_mining_website_panel_event', {
      p_claim_id: miningWebsitePanelWorkerId,
      p_discord_message_id: message.id,
      p_event_id: panel.id,
    });
    if (error) throw new Error(`Unable to mark Mining website panel delivery complete: ${error.message}`);
  } catch (error) {
    console.error(`Discord Mining website panel ${panel.id} delivery failed.`, error);
    await markMiningWebsitePanelFailed(config, panel, error);
  }
}

/** Sends durable website-originated Mining panels through the configured bot. */
export async function deliverPendingMiningWebsitePanels(config: DiscordBotConfig, guild: Guild) {
  if (deliveryInFlight) return;
  deliveryInFlight = true;
  try {
    const { data, error } = await createBotServiceClient(config).rpc('claim_discord_mining_website_panel_events', {
      p_claim_id: miningWebsitePanelWorkerId,
      p_guild_id: config.guildId,
      p_limit: MINING_WEBSITE_PANEL_DELIVERY_BATCH_SIZE,
    });
    if (error) throw new Error(`Unable to claim Mining website panels: ${error.message}`);
    for (const panel of (data ?? []) as PendingMiningWebsitePanel[]) {
      await deliverMiningWebsitePanel(config, guild, panel);
    }
  } finally {
    deliveryInFlight = false;
  }
}

export function startMiningWebsitePanelDeliveryScheduler(config: DiscordBotConfig, guild: Guild) {
  const run = () => {
    void deliverPendingMiningWebsitePanels(config, guild)
      .catch((error: unknown) => console.error('Discord Mining website panel delivery failed.', error));
  };
  run();
  const timer = setInterval(run, MINING_WEBSITE_PANEL_DELIVERY_INTERVAL_MS);
  timer.unref();
}
