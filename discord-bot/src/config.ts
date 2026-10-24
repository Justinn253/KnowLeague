import 'dotenv/config';

export type DiscordBotConfig = {
  applicationId: string;
  bumpChannelId: string | null;
  guildId: string;
  leagueAccountViewerBrowserWsEndpoint: string | null;
  leagueAccountViewerChromeExecutablePath: string | null;
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
  if (url.username || url.password) {
    throw new Error('KNOWLEAGUE_SITE_URL must not include credentials.');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('KNOWLEAGUE_SITE_URL must use https in production.');
  }
  if (process.env.NODE_ENV === 'production' && isPrivateOrLoopbackHostname(url.hostname)) {
    throw new Error('KNOWLEAGUE_SITE_URL must not resolve to a private or loopback host in production.');
  }

  return url.origin;
}

function isPrivateOrLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost') || normalizedHostname === '::1') {
    return true;
  }

  const octets = normalizedHostname.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function optionalSnowflakeEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim() ?? '';
  if (!value) return null;
  if (!/^[0-9]{17,20}$/.test(value)) {
    throw new Error(`${name} must be a Discord snowflake when configured.`);
  }
  return value;
}

function leagueAccountViewerChromeExecutablePath() {
  const configuredPath = process.env.LEAGUE_ACCOUNT_VIEWER_CHROME_EXECUTABLE_PATH?.trim();
  if (configuredPath) return configuredPath;

  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  return '/usr/bin/chromium';
}

function leagueAccountViewerBrowserWsEndpoint() {
  const value = process.env.LEAGUE_ACCOUNT_VIEWER_BROWSER_WS_ENDPOINT?.trim();
  if (!value) return null;

  const url = new URL(value);
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('LEAGUE_ACCOUNT_VIEWER_BROWSER_WS_ENDPOINT must use ws or wss.');
  }
  if (url.username || url.password) {
    throw new Error('LEAGUE_ACCOUNT_VIEWER_BROWSER_WS_ENDPOINT must not include URL credentials.');
  }

  return url.toString();
}

export function loadBotConfig(): DiscordBotConfig {
  return {
    applicationId: requiredEnvironmentVariable('DISCORD_APPLICATION_ID'),
    bumpChannelId: optionalSnowflakeEnvironmentVariable('DISCORD_BUMP_CHANNEL_ID'),
    guildId: requiredEnvironmentVariable('DISCORD_GUILD_ID'),
    leagueAccountViewerBrowserWsEndpoint: leagueAccountViewerBrowserWsEndpoint(),
    leagueAccountViewerChromeExecutablePath: leagueAccountViewerChromeExecutablePath(),
    siteUrl: canonicalSiteUrl(requiredEnvironmentVariable('KNOWLEAGUE_SITE_URL')),
    supabaseServiceRoleKey: requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: requiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL'),
    token: requiredEnvironmentVariable('DISCORD_BOT_TOKEN'),
  };
}
