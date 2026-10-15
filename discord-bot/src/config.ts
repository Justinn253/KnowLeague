import 'dotenv/config';

export type DiscordBotConfig = {
  applicationId: string;
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

export function loadBotConfig(): DiscordBotConfig {
  return {
    applicationId: requiredEnvironmentVariable('DISCORD_APPLICATION_ID'),
    guildId: requiredEnvironmentVariable('DISCORD_GUILD_ID'),
    siteUrl: canonicalSiteUrl(requiredEnvironmentVariable('KNOWLEAGUE_SITE_URL')),
    supabaseServiceRoleKey: requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: requiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    token: requiredEnvironmentVariable('DISCORD_BOT_TOKEN'),
  };
}
