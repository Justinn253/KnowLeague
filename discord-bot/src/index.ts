import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { loadBotConfig } from './config.js';
import { handleButtonInteraction, handleChatInputCommand } from './interactions.js';
import {
  awardMessageXp,
  handleDiscordVoiceStateUpdate,
  maybeSyncDiscordLeaderboardRoleOnMessage,
  reconcileDiscordVoiceXpSessions,
  resetBannedMemberXp,
  syncDiscordGuildRoles,
  syncDiscordGuildTextChannels,
  syncDiscordLeaderboardRole,
} from './leveling.js';
import { attemptSkinClaimDropFromMessage, handleSkinClaimReaction, startDiscordSkinClaimScheduler } from './skin-claims.js';

const config = loadBotConfig();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildVoiceStates,
], partials: [Partials.Channel, Partials.Message, Partials.Reaction] });
let voiceXpInitialReconciliation: Promise<void> = Promise.resolve();

async function replyWithFailure(interaction: Parameters<typeof handleChatInputCommand>[0] | Parameters<typeof handleButtonInteraction>[0]) {
  const message = 'KnowLeague could not complete that request. Please try again shortly.';
  if (interaction.deferred) {
    await interaction.editReply({ content: message });
    return;
  }
  if (interaction.replied) {
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
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
    .then(() => syncDiscordGuildTextChannels(config, guild))
    .then(async () => {
      startDiscordSkinClaimScheduler(config, guild);
      await syncDiscordLeaderboardRole(config, guild);
    })
    .catch((error: unknown) => console.error('Discord role synchronization failed.', error));
  voiceXpInitialReconciliation = reconcileDiscordVoiceXpSessions(config, guild)
    .catch((error: unknown) => console.error('Discord voice XP session reconciliation failed.', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== config.guildId || (!interaction.isChatInputCommand() && !interaction.isButton())) {
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, config);
    } else {
      await handleButtonInteraction(interaction, config);
    }
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

  void attemptSkinClaimDropFromMessage(config, message)
    .catch((error: unknown) => console.error('Discord skin-claim message trigger failed.', error));

  if (message.inGuild() && message.guildId === config.guildId && !message.author.bot && !message.system) {
    void maybeSyncDiscordLeaderboardRoleOnMessage(config, message.guild!)
      .catch((error: unknown) => console.error('Discord leaderboard role synchronization failed.', error));
  }
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleSkinClaimReaction(config, reaction, user)
    .catch((error: unknown) => console.error('Discord skin-claim reaction failed.', error));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  void voiceXpInitialReconciliation
    .then(() => handleDiscordVoiceStateUpdate(config, oldState, newState))
    .catch((error: unknown) => console.error('Discord voice XP tracking failed.', error));
});

client.on(Events.GuildBanAdd, (ban) => {
  if (ban.guild.id !== config.guildId) {
    return;
  }

  void resetBannedMemberXp(config, ban.user.id)
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

function syncGuildTextChannelsOnChange(guildId: string) {
  if (guildId !== config.guildId) {
    return;
  }
  const guild = client.guilds.cache.get(guildId);
  if (guild) {
    void syncDiscordGuildTextChannels(config, guild)
      .catch((error: unknown) => console.error('Discord text-channel synchronization failed.', error));
  }
}

client.on(Events.GuildRoleCreate, (role) => syncGuildRolesOnChange(role.guild.id));
client.on(Events.GuildRoleUpdate, (_, role) => syncGuildRolesOnChange(role.guild.id));
client.on(Events.GuildRoleDelete, (role) => syncGuildRolesOnChange(role.guild.id));
client.on(Events.ChannelCreate, (channel) => {
  if ('guild' in channel) syncGuildTextChannelsOnChange(channel.guild.id);
});
client.on(Events.ChannelUpdate, (_, channel) => {
  if ('guild' in channel) syncGuildTextChannelsOnChange(channel.guild.id);
});
client.on(Events.ChannelDelete, (channel) => {
  if ('guild' in channel) syncGuildTextChannelsOnChange(channel.guild.id);
});

client.on(Events.Error, (error) => {
  console.error('Discord client error.', error);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void client.login(config.token);
