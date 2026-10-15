import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadBotConfig } from './config.js';
import { handleChatInputCommand } from './interactions.js';
import {
  awardMessageXp,
  resetBannedMemberXp,
  syncDiscordGuildRoles,
  syncDiscordLeaderboardRole,
} from './leveling.js';

const config = loadBotConfig();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
] });

async function replyWithFailure(interaction: Parameters<typeof handleChatInputCommand>[0]) {
  const message = 'KnowLeague could not complete that request. Please try again shortly.';
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: message, ephemeral: true });
    return;
  }

  await interaction.reply({ content: message, ephemeral: true });
}

function shutdown(signal: NodeJS.Signals) {
  console.info(`Received ${signal}; disconnecting KnowLeague Discord bot.`);
  client.destroy();
}

client.once(Events.ClientReady, (readyClient) => {
  if (!readyClient.guilds.cache.has(config.guildId)) {
    console.error(`KnowLeague bot is not a member of configured guild ${config.guildId}.`);
    readyClient.destroy();
    process.exitCode = 1;
    return;
  }

  console.info(`KnowLeague Discord bot connected as ${readyClient.user.tag} for guild ${config.guildId}.`);
  const guild = readyClient.guilds.cache.get(config.guildId)!;
  void syncDiscordGuildRoles(config, guild)
    .then(() => syncDiscordLeaderboardRole(config, guild))
    .catch((error: unknown) => console.error('Discord role synchronization failed.', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) {
    return;
  }

  try {
    await handleChatInputCommand(interaction, config);
  } catch (error) {
    console.error('Discord command failed.', error);
    try {
      await replyWithFailure(interaction);
    } catch (replyError) {
      console.error('Discord command failure reply could not be sent.', replyError);
    }
  }
});

client.on(Events.MessageCreate, (message) => {
  void awardMessageXp(config, message)
    .catch((error: unknown) => console.error('Discord chat leveling failed.', error));
});

client.on(Events.GuildBanAdd, (ban) => {
  if (ban.guild.id !== config.guildId) {
    return;
  }

  void resetBannedMemberXp(config, ban.user.id)
    .then(() => syncDiscordLeaderboardRole(config, ban.guild))
    .catch((error: unknown) => console.error('Discord ban XP reset failed.', error));
});

function syncGuildRolesOnChange(guildId: string) {
  if (guildId !== config.guildId) {
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (guild) {
    void syncDiscordGuildRoles(config, guild)
      .catch((error: unknown) => console.error('Discord role synchronization failed.', error));
  }
}

client.on(Events.GuildRoleCreate, (role) => syncGuildRolesOnChange(role.guild.id));
client.on(Events.GuildRoleUpdate, (_, role) => syncGuildRolesOnChange(role.guild.id));
client.on(Events.GuildRoleDelete, (role) => syncGuildRolesOnChange(role.guild.id));

const leaderboardReconciliationInterval = setInterval(() => {
  const guild = client.guilds.cache.get(config.guildId);
  if (guild) {
    void syncDiscordLeaderboardRole(config, guild)
      .catch((error: unknown) => console.error('Discord leaderboard role synchronization failed.', error));
  }
}, 60_000);
leaderboardReconciliationInterval.unref();

client.on(Events.Error, (error) => {
  console.error('Discord client error.', error);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void client.login(config.token);
