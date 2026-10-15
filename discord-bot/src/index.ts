import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadBotConfig } from './config.js';
import { handleChatInputCommand } from './interactions.js';

const config = loadBotConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

client.on(Events.Error, (error) => {
  console.error('Discord client error.', error);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void client.login(config.token);
