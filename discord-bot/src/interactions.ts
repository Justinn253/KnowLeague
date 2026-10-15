import { ButtonBuilder, ButtonStyle, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { findLinkedProfile } from './profiles.js';

function profileUrl(config: DiscordBotConfig, username?: string) {
  return new URL(username ? `/profile/${encodeURIComponent(username)}` : '/profile', config.siteUrl).toString();
}

function profileButton(config: DiscordBotConfig, username?: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(username ? 'Open public profile' : 'Open profile settings')
    .setURL(profileUrl(config, username));
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
) {
  if (interaction.commandName === 'link') {
    await interaction.reply({
      components: [{ type: 1, components: [profileButton(config)] }],
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setDescription('Open your KnowLeague profile, choose **Link Discord**, and approve the Discord account connection. Then use `/profile` here to confirm it.'),
      ],
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'profile') {
    const profile = await findLinkedProfile(config, interaction.user.id);
    if (!profile) {
      await interaction.reply({
        components: [{ type: 1, components: [profileButton(config)] }],
        embeds: [
          new EmbedBuilder()
            .setColor(0xEF4444)
            .setDescription('This Discord account is not linked to a KnowLeague profile yet. Link it from your profile settings, then try `/profile` again.'),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      components: [{ type: 1, components: [profileButton(config, profile.username)] }],
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle(profile.displayName)
          .setDescription(`Linked as \`@${profile.username}\` on KnowLeague.`),
      ],
      ephemeral: true,
    });
  }
}
