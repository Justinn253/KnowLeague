import 'dotenv/config';

export type DiscordBotConfig = {
  applicationId: string;
  bumpChannelId: string | null;
  guildId: string;
  siteUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  token: string;
};

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function canonicalSiteUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('KNOWLEAGUE_SITE_URL must use http or https.');
  }

  return url.origin;
}

function optionalSnowflakeEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim() ?? '';
  if (!value) return null;
  if (!/^[0-9]{17,20}$/.test(value)) {
    throw new Error(`${name} must be a Discord snowflake when configured.`);
  }
  return value;
}

export function loadBotConfig(): DiscordBotConfig {
  return {
    applicationId: requiredEnvironmentVariable('DISCORD_APPLICATION_ID'),
    bumpChannelId: optionalSnowflakeEnvironmentVariable('DISCORD_BUMP_CHANNEL_ID'),
    guildId: requiredEnvironmentVariable('DISCORD_GUILD_ID'),
    siteUrl: canonicalSiteUrl(requiredEnvironmentVariable('KNOWLEAGUE_SITE_URL')),
    supabaseServiceRoleKey: requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: requiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    token: requiredEnvironmentVariable('DISCORD_BOT_TOKEN'),
  };
}
