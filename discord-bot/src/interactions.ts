import { ButtonBuilder, ButtonStyle, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import {
  addManualXp,
  getDiscordXpLeaderboard,
  getDiscordLevelProgress,
  getManualXpStaffRoleIds,
  grantEligibleLevelRoles,
  reconcileLevelRewardRoles,
  setManualLevel,
} from './leveling.js';
import { getKnowBucksBalance, payKnowBucks, updateKnowBucks } from './knowbucks.js';
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

function formatXp(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getProgressBar(percent: number) {
  const segmentCount = 12;
  const filled = Math.max(0, Math.min(segmentCount, Math.round((percent / 100) * segmentCount)));
  return `${'▓'.repeat(filled)}${'░'.repeat(segmentCount - filled)}`;
}

const LEADERBOARD_COMMAND_COOLDOWN_MS = 10_000;
const leaderboardCommandAvailableAtByUserId = new Map<string, number>();
let leaderboardCommandCooldownPruneAfter = 0;

async function canManageLevelingStaffCommands(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return false;
  }
  const staffRoleIds = await getManualXpStaffRoleIds(config);
  if (staffRoleIds.size === 0) {
    await interaction.reply({ content: 'Discord staff controls have not been configured for this server yet.', ephemeral: true });
    return false;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (![...staffRoleIds].some((roleId) => member.roles.cache.has(roleId))) {
    await interaction.reply({ content: 'You do not have a Discord role authorized to manage server leveling rewards.', ephemeral: true });
    return false;
  }
  return true;
}

async function handleXpCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'view') {
    const targetUser = interaction.options.getUser('member') ?? interaction.user;
    const progress = await getDiscordLevelProgress(config, targetUser.id);
    const percent = progress.xpForNextLevel > 0
      ? Math.min(100, Math.floor((progress.xpIntoLevel / progress.xpForNextLevel) * 100))
      : 100;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle(`${targetUser.username}'s chat level`)
          .setDescription(
            `**Level ${progress.level}** · **${formatXp(progress.totalXp)} total XP**\n`
            + `\`${getProgressBar(percent)}\` **${percent}%** to Level ${progress.level + 1}\n`
            + `Progress: **${formatXp(progress.xpIntoLevel)} / ${formatXp(progress.xpForNextLevel)} XP**\n`
            + `**${formatXp(progress.xpRemaining)} XP** remaining`,
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!(await canManageLevelingStaffCommands(interaction, config))) {
    return;
  }

  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot receive chat XP.', ephemeral: true });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id);
  const update = subcommand === 'add'
    ? await addManualXp(config, targetUser.id, interaction.options.getInteger('amount', true))
    : await setManualLevel(config, targetUser.id, interaction.options.getInteger('level', true));

  if (subcommand === 'set-level') {
    await reconcileLevelRewardRoles(config, targetMember, update.current_level);
  } else {
    await grantEligibleLevelRoles(config, targetMember, update.current_level);
  }
  const detail = subcommand === 'add'
    ? `Added ${formatXp(interaction.options.getInteger('amount', true))} XP to ${targetUser}.`
    : `Set ${targetUser} to level ${update.current_level}.`;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('Chat XP updated')
        .setDescription(`${detail}\nThey now have ${formatXp(update.total_xp)} XP at level ${update.current_level}.`),
    ],
    ephemeral: true,
  });
}

async function handleLeaderboardCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return;
  }

  const now = Date.now();
  if (now >= leaderboardCommandCooldownPruneAfter) {
    leaderboardCommandCooldownPruneAfter = now + 5 * 60 * 1_000;
    for (const [userId, expiry] of leaderboardCommandAvailableAtByUserId) {
      if (expiry <= now) leaderboardCommandAvailableAtByUserId.delete(userId);
    }
  }
  const availableAt = leaderboardCommandAvailableAtByUserId.get(interaction.user.id) ?? 0;
  if (availableAt > now) {
    const seconds = Math.ceil((availableAt - now) / 1_000);
    await interaction.reply({ content: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before using /leaderboard again.`, ephemeral: true });
    return;
  }
  leaderboardCommandAvailableAtByUserId.set(interaction.user.id, now + LEADERBOARD_COMMAND_COOLDOWN_MS);

  const count = interaction.options.getInteger('count') ?? 10;
  await interaction.deferReply();
  const entries = await getDiscordXpLeaderboard(config, interaction.guild, count);
  if (!entries.length) {
    await interaction.editReply({ content: 'No server members have earned chat XP yet.' });
    return;
  }

  await interaction.editReply({
    allowedMentions: { parse: [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('KnowLeague chat XP leaderboard')
        .setDescription(entries.map((entry, index) => (
          `**${index + 1}.** <@${entry.userId}> — Level **${entry.level}** · **${formatXp(entry.totalXp)} XP**`
        )).join('\n'))
        .setFooter({ text: `Top ${entries.length} active server member${entries.length === 1 ? '' : 's'} by XP` }),
    ],
  });
}

async function handleKnowBucksCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'balance') {
    const targetUser = interaction.options.getUser('member') ?? interaction.user;
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bot accounts do not hold KnowBucks.', ephemeral: true });
      return;
    }
    const balance = await getKnowBucksBalance(config, targetUser.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle(`${targetUser.username}'s KnowBucks`)
          .setDescription(`**${formatXp(balance)} KnowBucks**`),
      ],
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot hold KnowBucks.', ephemeral: true });
    return;
  }

  if (subcommand === 'pay') {
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: 'You cannot pay KnowBucks to yourself.', ephemeral: true });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    try {
      const payment = await payKnowBucks(config, interaction.user.id, targetUser.id, amount);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle('KnowBucks payment complete')
            .setDescription(`Paid **${formatXp(amount)} KnowBucks** to ${targetUser}.\nYour balance: **${formatXp(payment.sender_balance)} KnowBucks**.`),
        ],
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.reply({ content: 'You do not have enough KnowBucks for that payment.', ephemeral: true });
        return;
      }
      throw error;
    }
    return;
  }

  if (!(await canManageLevelingStaffCommands(interaction, config))) {
    return;
  }
  if (subcommand !== 'add' && subcommand !== 'remove' && subcommand !== 'set') {
    throw new Error(`Unsupported KnowBucks command: ${subcommand}`);
  }

  const amount = interaction.options.getInteger('amount', true);
  const update = await updateKnowBucks(config, targetUser.id, subcommand, amount);
  const detail = subcommand === 'add'
    ? `Added **${formatXp(update.applied_amount)} KnowBucks** to ${targetUser}.`
    : subcommand === 'remove'
      ? `Removed **${formatXp(Math.abs(update.applied_amount))} KnowBucks** from ${targetUser}.`
      : `Set ${targetUser}'s balance to **${formatXp(update.current_balance)} KnowBucks**.`;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('KnowBucks updated')
        .setDescription(`${detail}\nCurrent balance: **${formatXp(update.current_balance)} KnowBucks**.`),
    ],
    ephemeral: true,
  });
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
) {
  if (interaction.commandName === 'help') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle('KnowLeague Discord bot help')
          .addFields(
            { name: '/link', value: 'Open the existing KnowLeague profile flow to link this Discord account.' },
            { name: '/profile', value: 'Confirm your linked KnowLeague profile and open it.' },
            { name: '/leaderboard [count]', value: 'Show the top 10 active server members by chat XP, or request from 1 to 25 members.' },
            { name: '/xp add member amount', value: 'Give a member chat XP. Requires a role selected in Discord Configuration.' },
            { name: '/xp set-level member level', value: 'Set a member to a specific chat level. Requires a configured staff role.' },
            { name: '/xp view [member]', value: 'View your chat level and XP progress, or select another member to view theirs.' },
            { name: '/knowbucks balance [member]', value: 'View your KnowBucks balance or another member\'s balance.' },
            { name: '/knowbucks pay member amount', value: 'Pay KnowBucks to another server member.' },
            { name: '/knowbucks add/remove/set', value: 'Manage a member\'s KnowBucks. Requires a role selected in Discord Configuration.' },
            { name: 'Chat leveling', value: 'Eligible non-bot messages earn XP. Level rewards and messages are configured on the website.' },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'xp') {
    await handleXpCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'knowbucks') {
    await handleKnowBucksCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    await handleLeaderboardCommand(interaction, config);
    return;
  }

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
