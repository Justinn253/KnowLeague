import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { loadBotConfig } from './config.js';
import { handleButtonInteraction, handleChatInputCommand, isDiscordAdministrativeCommand } from './interactions.js';
import { closeLeagueAccountViewerBrowser } from './league-account-viewer.js';
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
import { attemptSkinClaimDropFromMessage, clearSkinCollection, handleSkinClaimReaction, startDiscordSkinClaimScheduler, startDiscordSkinCollectionUpkeepScheduler } from './skin-claims.js';
import { startDiscordFishingScheduler } from './fishing.js';
import { startMiningWebsitePanelDeliveryScheduler } from './mining-website-panels.js';
import { startDiscordMiningTopRoleScheduler } from './mining.js';
import { startDiscordSkindleShareScheduler } from './skindle-shares.js';
import { handleDisboardBump, restoreDisboardBumpReminder, stopDisboardBumpReminder } from './disboard.js';
import { handleDiscordMemberJoin, handleDiscordMemberLeave, refreshDiscordInviteCache, resolveDiscordJoinSource, trackDiscordMemberLastMessage } from './member-lifecycle.js';
import { maybeAwardMessageKnowBucks } from './message-rewards.js';
import { writeDiscordMinigameTierReferences } from './minigame-tier-references.js';
import { trackDeletedSnipeMessage, trackSnipeMessage } from './snipe.js';

if (process.env.NODE_ENV !== 'production') {
  try {
    const outputPaths = await writeDiscordMinigameTierReferences();
    console.info(`Updated local Discord minigame tier references:\n${outputPaths.map((path) => `- ${path}`).join('\n')}`);
  } catch (error) {
    console.error('Discord minigame tier reference generation failed.', error);
  }
}

const config = loadBotConfig();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  // Tracks invite creation and deletion so member joins can be attributed to
  // the invite whose use count increased.
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildModeration,
  // Required only to release claimed skins when a member leaves or is kicked.
  // This is the collection lifecycle contract; no member profiles are stored.
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
  // Required for the deliberately narrow snipe, external-expression import, and
  // DISBOARD confirmation flows. See discord-bot/AGENTS.md for retention.
  GatewayIntentBits.MessageContent,
], partials: [Partials.Channel, Partials.Message, Partials.Reaction] });
let voiceXpInitialReconciliation: Promise<void> = Promise.resolve();

async function replyWithFailure(interaction: Parameters<typeof handleChatInputCommand>[0] | Parameters<typeof handleButtonInteraction>[0]) {
  const message = 'KnowLeague could not complete that request. Please try again shortly.';
  const ephemeral = !interaction.isChatInputCommand()
    || isDiscordAdministrativeCommand(interaction.commandName, interaction.options.getSubcommand(false));
  if (interaction.deferred) {
    await interaction.editReply({ content: message });
    return;
  }
  if (interaction.replied) {
    await interaction.followUp({ content: message, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
    return;
  }

  await interaction.reply({ content: message, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
}

async function shutdown(signal: NodeJS.Signals) {
  console.info(`Received ${signal}; disconnecting KnowLeague Discord bot.`);
  stopDisboardBumpReminder();
  client.destroy();
  await closeLeagueAccountViewerBrowser();
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
  // Completion reconciliation does not depend on the role/channel metadata
  // sync. Start it immediately so a transient sync failure cannot leave an
  // otherwise valid expedition active past its completion time.
  startDiscordSkinClaimScheduler(config, guild);
  startDiscordSkinCollectionUpkeepScheduler(config);
  startDiscordFishingScheduler(config, guild);
  startDiscordMiningTopRoleScheduler(config, guild);
  startMiningWebsitePanelDeliveryScheduler(config, guild);
  startDiscordSkindleShareScheduler(config, guild);
  void restoreDisboardBumpReminder(config, guild)
    .catch((error: unknown) => console.error('DISBOARD bump reminder restoration failed.', error));
  void refreshDiscordInviteCache(config, guild)
    .catch((error: unknown) => console.error('Discord invite cache initialization failed.', error));
  void syncDiscordGuildRoles(config, guild)
    .then(() => syncDiscordGuildTextChannels(config, guild))
    .then(() => syncDiscordLeaderboardRole(config, guild))
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
  if (!message.inGuild() || message.guildId !== config.guildId) {
    return;
  }

  trackSnipeMessage(config, message);

  void trackDiscordMemberLastMessage(config, message)
    .catch((error: unknown) => console.error('Discord member last-message tracking failed.', error));

  void awardMessageXp(config, message)
    .catch((error: unknown) => console.error('Discord chat leveling failed.', error));

  void maybeAwardMessageKnowBucks(config, message)
    .catch((error: unknown) => console.error('Discord message KnowBucks reward failed.', error));

  void handleDisboardBump(config, message)
    .catch((error: unknown) => console.error('DISBOARD bump processing failed.', error));

  void attemptSkinClaimDropFromMessage(config, message)
    .catch((error: unknown) => console.error('Discord skin-claim message trigger failed.', error));

  if (message.inGuild() && message.guildId === config.guildId && !message.author.bot && !message.system) {
    void maybeSyncDiscordLeaderboardRoleOnMessage(config, message.guild!)
      .catch((error: unknown) => console.error('Discord leaderboard role synchronization failed.', error));
  }
});

client.on(Events.MessageDelete, (message) => {
  if (message.guildId !== config.guildId) {
    return;
  }
  trackDeletedSnipeMessage(config, message.id);
});

client.on(Events.MessageUpdate, (_, message) => {
  if (!message.inGuild() || message.guildId !== config.guildId) {
    return;
  }
  trackSnipeMessage(config, message);
});

client.on(Events.MessageBulkDelete, (messages) => {
  const deletedMessages = [...messages.values()].sort((first, second) => first.createdTimestamp - second.createdTimestamp);
  for (const message of deletedMessages) {
    if (message.guildId !== config.guildId) continue;
    trackDeletedSnipeMessage(config, message.id);
  }
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  if (reaction.message.guildId !== config.guildId) {
    return;
  }
  void handleSkinClaimReaction(config, reaction, user)
    .catch((error: unknown) => console.error('Discord skin-claim reaction failed.', error));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (newState.guild.id !== config.guildId) {
    return;
  }
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
  void clearSkinCollection(config, ban.user.id)
    .catch((error: unknown) => console.error('Discord ban collection cleanup failed.', error));
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== config.guildId) {
    return;
  }

  void clearSkinCollection(config, member.id)
    .catch((error: unknown) => console.error('Discord member collection cleanup failed.', error));
  void handleDiscordMemberLeave(config, member)
    .catch((error: unknown) => console.error('Discord member leave processing failed.', error));
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== config.guildId) return;
  void resolveDiscordJoinSource(config, member.guild)
    .then((source) => handleDiscordMemberJoin(config, member, source))
    .catch((error: unknown) => console.error('Discord member join processing failed.', error));
});

client.on(Events.InviteCreate, (invite) => {
  if (invite.guild?.id !== config.guildId) return;
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  void refreshDiscordInviteCache(config, guild)
    .catch((error: unknown) => console.error('Discord invite cache refresh failed.', error));
});

client.on(Events.InviteDelete, (invite) => {
  if (invite.guild?.id !== config.guildId) return;
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  void refreshDiscordInviteCache(config, guild)
    .catch((error: unknown) => console.error('Discord invite cache refresh failed.', error));
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

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

void client.login(config.token);
