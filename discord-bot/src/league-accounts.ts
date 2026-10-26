import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

export type LinkedLeagueAccount = {
  region: string;
  riotId: string;
};

type LinkedLeagueAccountRow = {
  region: string;
  riot_id: string;
};

export async function linkLeagueAccount(
  config: DiscordBotConfig,
  discordUserId: string,
  account: LinkedLeagueAccount,
) {
  const { error } = await createBotServiceClient(config)
    .from('discord_linked_league_accounts')
    .upsert({
      discord_user_id: discordUserId,
      guild_id: config.guildId,
      region: account.region,
      riot_id: account.riotId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,discord_user_id' });
  if (error) throw new Error(`Unable to save the linked League account: ${error.message}`);
}

export async function getLinkedLeagueAccount(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<LinkedLeagueAccount | null> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_linked_league_accounts')
    .select('riot_id,region')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .maybeSingle<LinkedLeagueAccountRow>();
  if (error) throw new Error(`Unable to load the linked League account: ${error.message}`);
  return data ? { region: data.region, riotId: data.riot_id } : null;
}
