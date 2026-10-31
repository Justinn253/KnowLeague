import { ApiError } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type DiscordGameIdentity = {
  discordUserId: string;
  guildId: string;
};

function getDiscordGuildId() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(guildId)) {
    throw new ApiError(503, 'Discord server configuration is unavailable.');
  }
  return guildId;
}

/**
 * Resolves the one existing account link shared by the website and Discord
 * companion games. Game routes must never accept a Discord user ID from the
 * browser or create a parallel link.
 */
export async function getDiscordGameIdentity(userId: string, gameName: string): Promise<DiscordGameIdentity> {
  const { data, error } = await getSupabaseServiceClient()
    .from('profile_private_details')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle<{ discord_user_id: string | null }>();
  if (error) throw error;

  const discordUserId = data?.discord_user_id?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(discordUserId)) {
    throw new ApiError(409, `Link your Discord account in Profile before managing ${gameName} on the website.`);
  }

  return { discordUserId, guildId: getDiscordGuildId() };
}
