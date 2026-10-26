import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

type GeneralCommandChannelRow = {
  channel_id: string;
};

const GENERAL_COMMAND_SETTINGS_CACHE_MS = 30_000;
const FEATURE_SCOPED_COMMAND_NAMES = new Set(['collections', 'fish', 'league']);
let cachedGeneralCommandChannels: { allowedChannelIds: Set<string> | null; expiresAt: number; guildId: string } | null = null;

/**
 * Commands with their own feature boundary deliberately do not inherit the
 * server-wide General channel. Their feature configuration remains the source
 * of truth, and future feature channel controls can follow the same pattern.
 */
export function usesDefaultCommandChannel(commandName: string) {
  return !FEATURE_SCOPED_COMMAND_NAMES.has(commandName);
}

export function isAllowedCommandChannel(channelId: string, allowedChannelIds: ReadonlySet<string>) {
  return allowedChannelIds.size === 0 || allowedChannelIds.has(channelId);
}

export async function isDefaultCommandChannel(config: DiscordBotConfig, channelId: string) {
  const now = Date.now();
  if (!cachedGeneralCommandChannels
    || cachedGeneralCommandChannels.guildId !== config.guildId
    || cachedGeneralCommandChannels.expiresAt <= now) {
    const { data, error } = await createBotServiceClient(config)
      .from('discord_general_command_channels')
      .select('channel_id')
      .eq('guild_id', config.guildId)
      .returns<GeneralCommandChannelRow[]>();
    if (error) throw new Error(`Unable to load Discord General command channels: ${error.message}`);
    const allowedChannelIds = new Set((data ?? []).map((entry) => entry.channel_id));
    cachedGeneralCommandChannels = {
      allowedChannelIds: allowedChannelIds.size ? allowedChannelIds : null,
      expiresAt: now + GENERAL_COMMAND_SETTINGS_CACHE_MS,
      guildId: config.guildId,
    };
  }

  return cachedGeneralCommandChannels.allowedChannelIds === null
    || isAllowedCommandChannel(channelId, cachedGeneralCommandChannels.allowedChannelIds);
}

/** Returns the configured General command channels, or an empty array when General commands are open everywhere. */
export async function getDefaultCommandChannelIds(config: DiscordBotConfig): Promise<readonly string[]> {
  await isDefaultCommandChannel(config, '0');
  return cachedGeneralCommandChannels?.allowedChannelIds
    ? [...cachedGeneralCommandChannels.allowedChannelIds]
    : [];
}
