import { ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
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
import {
  buildSkinSearchEmbed,
  buildSkinCollectionEmbed,
  favoriteSkinClaim,
  findSkinCatalogEntry,
  forceAddSkinCollectionCapacity,
  forceSkinClaimDrop,
  gambleSkinClaim,
  getSkinClaimAdminRoleIds,
  getSkinCollectionPage,
  purchaseSkinCollectionCapacity,
  sellSkinClaim,
  skinCollectionCode,
  stealSkinClaim,
  summonSkinClaimDrop,
  transferSkinClaim,
} from './skin-claims.js';

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
const SKIN_COLLECTION_BUTTON_PREFIX = 'skin-collection';
const leaderboardCommandAvailableAtByUserId = new Map<string, number>();
let leaderboardCommandCooldownPruneAfter = 0;

function skinCollectionButtons(ownerDiscordUserId: string, page: number, total: number) {
  return [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(`${SKIN_COLLECTION_BUTTON_PREFIX}:${ownerDiscordUserId}:${page - 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Previous')
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`${SKIN_COLLECTION_BUTTON_PREFIX}:${ownerDiscordUserId}:${page + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Next')
        .setDisabled(total === 0 || page >= total - 1),
    ],
  }];
}

async function canManageLevelingStaffCommands(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return false;
  }
  const staffRoleIds = await getManualXpStaffRoleIds(config);
  if (staffRoleIds.size === 0) {
    await interaction.reply({ content: 'Discord staff controls have not been configured for this server yet.', flags: MessageFlags.Ephemeral });
    return false;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (![...staffRoleIds].some((roleId) => member.roles.cache.has(roleId))) {
    await interaction.reply({ content: 'You do not have a Discord role authorized for this server staff command.', flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

async function canManageCollectionAdminCommands(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return false;
  const adminRoleIds = await getSkinClaimAdminRoleIds(config);
  if (adminRoleIds.size === 0) {
    await interaction.reply({ content: 'Collection admin controls have not been configured for this server yet.', flags: MessageFlags.Ephemeral });
    return false;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (![...adminRoleIds].some((roleId) => member.roles.cache.has(roleId))) {
    await interaction.reply({ content: 'You do not have a Discord role authorized for this collection admin command.', flags: MessageFlags.Ephemeral });
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await canManageLevelingStaffCommands(interaction, config))) {
    return;
  }

  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot receive chat XP.', flags: MessageFlags.Ephemeral });
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
    flags: MessageFlags.Ephemeral,
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
    await interaction.reply({ content: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before using /leaderboard again.`, flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: 'Bot accounts do not hold KnowBucks.', flags: MessageFlags.Ephemeral });
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot hold KnowBucks.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === 'pay') {
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: 'You cannot pay KnowBucks to yourself.', flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.reply({ content: 'You do not have enough KnowBucks for that payment.', flags: MessageFlags.Ephemeral });
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
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCollectionsCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'collection') {
    await interaction.deferReply();
    const page = await getSkinCollectionPage(config, interaction.user.id, 0);
    await interaction.editReply({
      components: skinCollectionButtons(interaction.user.id, page.page, page.total),
      embeds: [buildSkinCollectionEmbed(page, interaction.user.username)],
    });
    return;
  }

  if (subcommand === 'spawn') {
    if (!(await canManageCollectionAdminCommands(interaction, config))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await forceSkinClaimDrop(config, interaction.guild, interaction.channelId);
    if (result.status === 'spawned') {
      await interaction.editReply({ content: 'A skin drop was posted in this channel.' });
      return;
    }
    if (result.status === 'active-drop') {
      await interaction.editReply({ content: 'A live skin drop already exists. Wait for it to be claimed or expire before spawning another.' });
      return;
    }
    if (result.status === 'disabled') {
      await interaction.editReply({ content: 'Skin claim drops are disabled in Discord Configuration.' });
      return;
    }
    await interaction.editReply({ content: 'Enable skin claims and allow this text channel in Discord Configuration before using /collections spawn.' });
    return;
  }

  if (subcommand === 'summon') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await summonSkinClaimDrop(config, interaction.guild, interaction.channelId, interaction.user.id);
    if (result.status === 'spawned') {
      await interaction.editReply({ content: `A skin drop was summoned in this channel. Your remaining balance is ${formatXp(result.remainingBalance ?? 0)} KnowBucks.` });
      return;
    }
    if (result.status === 'insufficient-funds') {
      await interaction.editReply({ content: 'You do not have enough KnowBucks to summon a skin drop.' });
      return;
    }
    if (result.status === 'active-drop') {
      await interaction.editReply({ content: 'A live skin drop already exists. Wait for it to be claimed or expire before summoning another.' });
      return;
    }
    await interaction.editReply({ content: 'Skin claims are not enabled for this channel.' });
    return;
  }

  if (subcommand === 'capacity-add') {
    const slots = interaction.options.getInteger('slots', true);
    if (slots % 5 !== 0) {
      await interaction.reply({ content: 'Collection capacity must be added in multiples of five slots.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const purchase = await purchaseSkinCollectionCapacity(config, interaction.user.id, slots);
      await interaction.editReply({ content: `Added ${slots} collection slots for ${formatXp(purchase.cost)} KnowBucks. Your capacity is now ${formatXp(purchase.capacity)} and your balance is ${formatXp(purchase.remaining_balance)} KnowBucks.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.editReply({ content: 'You do not have enough KnowBucks for that collection capacity upgrade.' });
        return;
      }
      throw error;
    }
    return;
  }

  if (subcommand === 'capacity-force-add') {
    if (!(await canManageCollectionAdminCommands(interaction, config))) return;
    const targetUser = interaction.options.getUser('member', true);
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bot accounts cannot hold skin collections.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const capacity = await forceAddSkinCollectionCapacity(config, targetUser.id, interaction.options.getInteger('slots', true));
    await interaction.editReply({ content: `Added collection capacity for ${targetUser}. Their capacity is now ${formatXp(capacity)} slots.` });
    return;
  }

  if (subcommand === 'steal') {
    const skinCode = interaction.options.getInteger('skin-id', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await stealSkinClaim(config, interaction.user.id, skinCode);
    if (result.outcome === 'stolen' && result.cost !== null && result.remaining_balance !== null && result.available_at) {
      await interaction.editReply({ content: `You stole **${result.skin_name}** for ${formatXp(result.cost)} KnowBucks. Your balance is ${formatXp(result.remaining_balance)} KnowBucks. You can steal again <t:${Math.floor(new Date(result.available_at).getTime() / 1_000)}:R>.` });
      return;
    }
    if (result.outcome === 'stolen') {
      await interaction.editReply({ content: `You stole **${result.skin_name}** · #${skinCollectionCode(skinCode)}.` });
      return;
    }
    if (result.outcome === 'full') {
      await interaction.editReply({ content: 'Your collection is full, so you cannot attempt to steal a skin.' });
      return;
    }
    if (result.outcome === 'own') {
      await interaction.editReply({ content: `You already own **${result.skin_name}** · #${skinCollectionCode(skinCode)}.` });
      return;
    }
    if (result.outcome === 'missing') {
      await interaction.editReply({ content: `No claimed skin with ID #${skinCollectionCode(skinCode)} is available to steal.` });
      return;
    }
    if (result.outcome === 'cooldown' && result.available_at) {
      await interaction.editReply({ content: `You can attempt another steal <t:${Math.floor(new Date(result.available_at).getTime() / 1_000)}:R>.` });
      return;
    }
    if (result.outcome === 'insufficient-funds') {
      await interaction.editReply({ content: `Stealing **${result.skin_name}** costs ${formatXp(result.cost ?? 0)} KnowBucks. Your balance is ${formatXp(result.remaining_balance ?? 0)} KnowBucks.` });
      return;
    }
    if (result.outcome === 'failed' && result.cost !== null && result.remaining_balance !== null && result.available_at) {
      await interaction.editReply({ content: `Your attempt to steal #${skinCollectionCode(skinCode)} failed and cost ${formatXp(result.cost)} KnowBucks. Your balance is ${formatXp(result.remaining_balance)} KnowBucks. You can try again <t:${Math.floor(new Date(result.available_at).getTime() / 1_000)}:R>.` });
      return;
    }
    await interaction.editReply({ content: `Your attempt to steal #${skinCollectionCode(skinCode)} failed.` });
    return;
  }

  if (subcommand === 'favorite') {
    const skinCode = interaction.options.getInteger('skin-id', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const skinName = await favoriteSkinClaim(config, interaction.user.id, skinCode);
      await interaction.editReply({ content: `**${skinName}** · #${skinCollectionCode(skinCode)} will now appear first in your collection.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
        await interaction.editReply({ content: `You do not own a claimed skin with ID #${skinCollectionCode(skinCode)}.` });
        return;
      }
      throw error;
    }
    return;
  }

  if (subcommand === 'gamble') {
    const skinCode = interaction.options.getInteger('skin-id', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await gambleSkinClaim(config, interaction.guild, interaction.channelId, interaction.user.id, skinCode);
      if (result.status === 'spawned') {
        await interaction.editReply({ content: `Your gamble consumed **${result.skinName}** and spawned a new skin in this channel. You have the configured grace period to claim it first.` });
        return;
      }
      if (result.status === 'lost') {
        await interaction.editReply({ content: `Your gamble consumed **${result.skinName}**, but the 25% spawn chance did not succeed.` });
        return;
      }
      if (result.status === 'active-drop') {
        await interaction.editReply({ content: 'A live skin drop already exists, so your skin was not consumed. Try again after it is claimed or expires.' });
        return;
      }
      await interaction.editReply({ content: 'Skin claims are not enabled for this channel, so your skin was not consumed.' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
        await interaction.editReply({ content: `You do not own a claimed skin with ID #${skinCollectionCode(skinCode)}.` });
        return;
      }
      throw error;
    }
    return;
  }

  if (subcommand === 'search') {
    const skin = findSkinCatalogEntry(interaction.options.getString('skin-name', true));
    if (!skin) {
      await interaction.reply({ content: 'No matching skin was found in the local KnowLeague catalogue.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [buildSkinSearchEmbed(skin)] });
    return;
  }

  if (subcommand === 'sell') {
    const skinCode = interaction.options.getInteger('skin-id', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const sale = await sellSkinClaim(config, interaction.user.id, skinCode);
      await interaction.editReply({ content: `Sold **${sale.skin_name}** · #${skinCollectionCode(skinCode)} for ${formatXp(sale.amount)} KnowBucks. Your balance is ${formatXp(sale.current_balance)} KnowBucks.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
        await interaction.editReply({ content: `You do not own a claimed skin with ID #${skinCollectionCode(skinCode)}.` });
        return;
      }
      throw error;
    }
    return;
  }

  if (subcommand !== 'give') {
    throw new Error(`Unsupported collections command: ${subcommand}`);
  }
  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot receive claimed skins.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: 'You cannot give a skin to yourself.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await interaction.guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: 'Choose a current server member to receive this skin.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const skinCode = interaction.options.getInteger('skin-id', true);
  try {
    const transfer = await transferSkinClaim(config, interaction.user.id, targetUser.id, skinCode);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle('Skin transferred')
          .setDescription(`Gave **${transfer.skin_name}** · #${skinCollectionCode(transfer.skin_code)} to ${targetUser}.`),
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
      await interaction.editReply({ content: `You do not own a claimed skin with ID #${skinCollectionCode(skinCode)}.` });
      return;
    }
    if (error instanceof Error && error.message.includes('recipient collection is full')) {
      await interaction.editReply({ content: `${targetUser}'s collection is full, so they cannot receive another skin.` });
      return;
    }
    throw error;
  }
}

export async function handleButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, ownerDiscordUserId, requestedPage] = interaction.customId.split(':');
  if (prefix !== SKIN_COLLECTION_BUTTON_PREFIX || !ownerDiscordUserId || !/^\d+$/.test(requestedPage ?? '')) return;
  if (interaction.guildId !== config.guildId) return;
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this collection can browse it.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const page = await getSkinCollectionPage(config, ownerDiscordUserId, Number(requestedPage));
  await interaction.editReply({
    components: skinCollectionButtons(ownerDiscordUserId, page.page, page.total),
    embeds: [buildSkinCollectionEmbed(page, interaction.user.username)],
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
            { name: '/collections collection', value: 'Post your claimed skin collection for the server to view, one skin at a time. `/cl` offers the same collection commands.' },
            { name: '/collections give member skin-id', value: 'Give one of your claimed skins to another current server member by its four-digit ID.' },
            { name: '/collections summon', value: 'Spend the configured summon cost (5,000 KnowBucks by default) to summon a claimable drop in this channel, with your grace period first.' },
            { name: '/collections capacity-add slots', value: 'Buy collection space in multiples of five slots for the configured rate (500 KnowBucks per five slots by default). Staff can use `capacity-force-add` for a free member upgrade.' },
            { name: '/collections steal/favorite/gamble/sell', value: 'Attempt a steal for 3x the skin’s configured sell value (with a 30-minute cooldown), choose your first collection item, gamble a skin, or sell one by its four-digit ID.' },
            { name: '/collections search skin-name', value: 'Preview a catalogue skin. The preview cannot be claimed.' },
            { name: '/collections spawn', value: 'Immediately post a skin drop in this channel. Requires a role selected in Discord Configuration.' },
            { name: 'Chat leveling', value: 'Eligible non-bot messages earn XP. Level rewards and messages are configured on the website.' },
          ),
      ],
      flags: MessageFlags.Ephemeral,
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

  if (interaction.commandName === 'collections' || interaction.commandName === 'cl') {
    await handleCollectionsCommand(interaction, config);
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
      flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });
  }
}
