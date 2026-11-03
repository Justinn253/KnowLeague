import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

type RiftboundCommandChannelRow = {
  channel_id: string;
};

const RIFTBOUND_COMMAND_SETTINGS_CACHE_MS = 30_000;
let cachedRiftboundCommandChannels: { allowedChannelIds: Set<string> | null; expiresAt: number; guildId: string } | null = null;

/** Returns whether Riftbound commands are allowed in a channel. No configured channels means every guild channel is allowed. */
export async function isRiftboundCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const now = Date.now();
  if (!cachedRiftboundCommandChannels
    || cachedRiftboundCommandChannels.guildId !== config.guildId
    || cachedRiftboundCommandChannels.expiresAt <= now) {
    const { data, error } = await createBotServiceClient(config)
      .from('discord_riftbound_command_channels')
      .select('channel_id')
      .eq('guild_id', config.guildId)
      .returns<RiftboundCommandChannelRow[]>();
    if (error) throw new Error(`Unable to load Riftbound command channels: ${error.message}`);

    const allowedChannelIds = new Set((data ?? []).map((entry) => entry.channel_id));
    cachedRiftboundCommandChannels = {
      allowedChannelIds: allowedChannelIds.size ? allowedChannelIds : null,
      expiresAt: now + RIFTBOUND_COMMAND_SETTINGS_CACHE_MS,
      guildId: config.guildId,
    };
  }

  return cachedRiftboundCommandChannels.allowedChannelIds === null
    || cachedRiftboundCommandChannels.allowedChannelIds.has(channelId);
}

/** Returns configured Riftbound command channels, or an empty array when Riftbound is open everywhere. */
export async function getRiftboundCommandChannelIds(config: DiscordBotConfig): Promise<readonly string[]> {
  await isRiftboundCommandAllowedInChannel(config, '0');
  return cachedRiftboundCommandChannels?.allowedChannelIds
    ? [...cachedRiftboundCommandChannels.allowedChannelIds]
    : [];
}
