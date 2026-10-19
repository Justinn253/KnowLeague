import { ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type GuildMember } from 'discord.js';
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
  attachFishingExpeditionMessage,
  describeFishingEquipment,
  FISHING_REPEAT_BUTTON_PREFIX,
  FISHING_BIOMES,
  FISHING_FISH,
  FISHING_UPGRADES,
  formatFishingDuration,
  getFishingBiome,
  getFishingCatalogueProgress,
  getFishingCrate,
  getFishingPlayerState,
  getFishingShopItems,
  getFishingUpgrade,
  getFishingUpgradeCost,
  openAllFishingCrates,
  purchaseFishingUpgrade,
  isFishingCommandAllowedInChannel,
  isFishingFishCaught,
  equipFishingUpgrade,
  parseFishingRepeatCustomId,
  reconcileDueFishingExpeditions,
  startFishingExpedition,
  syncDiscordFishingTopRole,
  getFishingProgress,
  grantCurrentFishingLevelRoles,
  type FishingBiomeId,
  type FishingCatalogueProgress,
  type FishingDurationTier,
  type FishingPlayerState,
  type StartedFishingExpedition,
  type FishingUpgradeCategory,
} from './fishing.js';
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
  isSkinCollectionCommandAllowedInChannel,
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

export function isDiscordAdministrativeCommand(commandName: string, subcommand: string | null) {
  return (commandName === 'xp' && (subcommand === 'add' || subcommand === 'set-level'))
    || (commandName === 'knowbucks' && (subcommand === 'add' || subcommand === 'remove' || subcommand === 'set'))
    || (commandName === 'collections' && (subcommand === 'spawn' || subcommand === 'capacity-force-add'));
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
const FISHING_BUTTON_PREFIX = 'fish';
const FISHING_SHOP_CATEGORIES: readonly FishingUpgradeCategory[] = ['rod', 'bait', 'boat', 'skill', 'crew'];
const FISHING_INVENTORY_TABS = ['overview', 'rods', 'baits', 'skills', 'gear', 'boats'] as const;
type FishingInventoryTab = typeof FISHING_INVENTORY_TABS[number];
const FISHING_PANEL_TTL_MS = 60_000;
const leaderboardCommandAvailableAtByUserId = new Map<string, number>();
let leaderboardCommandCooldownPruneAfter = 0;
const fishingPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function buildFishingLaunchResponse(expedition: StartedFishingExpedition) {
  return {
    components: [],
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`${expedition.biomeName} expedition launched`)
        .setDescription(expedition.instantCompletion
          ? `Crew slot **${expedition.crewSlot}** triggered the Teleporter and is returning immediately.`
          : `Crew slot **${expedition.crewSlot}** is now fishing. This trip takes about **${formatFishingDuration(expedition.durationSeconds)}**.`),
    ],
  };
}

async function attachFishingLaunchMessage(
  config: DiscordBotConfig,
  discordUserId: string,
  expedition: StartedFishingExpedition,
  messageId: string,
  guild: Guild | null,
) {
  try {
    await attachFishingExpeditionMessage(config, discordUserId, expedition.expeditionId, messageId);
    if (expedition.instantCompletion && guild) await reconcileDueFishingExpeditions(config, guild);
  } catch (error) {
    // Settlement still succeeds and falls back to a completion notice if the
    // launch message cannot be persisted for later editing.
    console.warn(`Discord fishing expedition ${expedition.expeditionId} launch message could not be attached.`, error);
  }
}

function skinCollectionButtons(
  viewerDiscordUserId: string,
  ownerDiscordUserId: string,
  page: number,
  total: number,
  showDetails: boolean,
) {
  const customId = (requestedPage: number, view: 'details' | 'summary') => (
    `${SKIN_COLLECTION_BUTTON_PREFIX}:${viewerDiscordUserId}:${ownerDiscordUserId}:${requestedPage}:${view}`
  );
  return [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(customId(page - 1, showDetails ? 'details' : 'summary'))
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Previous')
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(customId(page, showDetails ? 'summary' : 'details'))
        .setStyle(ButtonStyle.Primary)
        .setLabel(showDetails ? 'Hide details' : 'Show details')
        .setDisabled(total === 0),
      new ButtonBuilder()
        .setCustomId(customId(page + 1, showDetails ? 'details' : 'summary'))
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Next')
        .setDisabled(total === 0 || page >= total - 1),
    ],
  }];
}

function fishingShopCategoryLabel(category: FishingUpgradeCategory) {
  if (category === 'boat') return 'Boat upgrades';
  return category === 'crew' ? 'Crew' : `${category.slice(0, 1).toUpperCase()}${category.slice(1)}s`;
}

function fishingPanelExpirationMessage() {
  return 'This fishing panel has expired. Run `/fish shop`, `/fish inventory`, or `/fish catalogue` to open a new one.';
}

function scheduleFishingPanelExpiry(message: { edit: (options: { components: []; content: string }) => Promise<unknown>; id: string }, expiresAt: number) {
  const existingTimer = fishingPanelExpiryTimers.get(message.id);
  if (existingTimer) clearTimeout(existingTimer);
  const delay = Math.max(0, expiresAt - Date.now());
  const timer = setTimeout(() => {
    void message.edit({ content: fishingPanelExpirationMessage(), components: [] })
      .catch((error: unknown) => console.warn(`Discord fishing panel ${message.id} could not be expired.`, error))
      .finally(() => {
        if (fishingPanelExpiryTimers.get(message.id) === timer) fishingPanelExpiryTimers.delete(message.id);
      });
  }, delay);
  timer.unref();
  fishingPanelExpiryTimers.set(message.id, timer);
}

function clearFishingPanelExpiry(messageId: string) {
  const existingTimer = fishingPanelExpiryTimers.get(messageId);
  if (existingTimer) clearTimeout(existingTimer);
  fishingPanelExpiryTimers.delete(messageId);
}

function expireFishingPanel(interaction: ButtonInteraction) {
  clearFishingPanelExpiry(interaction.message.id);
  return interaction.update({ content: fishingPanelExpirationMessage(), components: [] });
}

function toComponentRows(buttons: ButtonBuilder[]) {
  return Array.from({ length: Math.ceil(buttons.length / 5) }, (_, index) => ({
    type: 1 as const,
    components: buttons.slice(index * 5, (index + 1) * 5),
  })).filter((row) => row.components.length > 0);
}

function fishingShopComponents(ownerDiscordUserId: string, category: FishingUpgradeCategory, state: FishingPlayerState, expiresAt: number) {
  const categoryRows = [FISHING_SHOP_CATEGORIES.slice(0, 5)]
    .filter((categories) => categories.length > 0)
    .map((categories) => ({
      type: 1 as const,
      components: categories.map((entry) => new ButtonBuilder()
        .setCustomId(`${FISHING_BUTTON_PREFIX}-shop:${ownerDiscordUserId}:${expiresAt}:${entry}`)
        .setStyle(entry === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setLabel(fishingShopCategoryLabel(entry))),
    }));
  const ownedItemIds = new Set(state.inventory.map((item) => item.item_id));
  const purchaseButtons = getFishingShopItems(category).map((item) => {
    const cost = getFishingUpgradeCost(item, [...ownedItemIds]);
    const missingRequiredUpgrade = Boolean(item.requiredUpgradeId && !ownedItemIds.has(item.requiredUpgradeId));
    return new ButtonBuilder()
      .setCustomId(`${FISHING_BUTTON_PREFIX}-buy:${ownerDiscordUserId}:${expiresAt}:${item.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(`Buy ${item.name} (${formatXp(cost)})`)
      .setDisabled(ownedItemIds.has(item.id) || missingRequiredUpgrade || state.balance < cost || state.fishingLevel < (item.requiredFishingLevel ?? 0));
  });
  return [...categoryRows, ...toComponentRows(purchaseButtons)];
}

function fishingInventoryTabLabel(tab: FishingInventoryTab) {
  const labels: Record<FishingInventoryTab, string> = {
    overview: 'Overview',
    rods: 'Rods',
    baits: 'Baits',
    skills: 'Skills',
    gear: 'Gear',
    boats: 'Boats',
  };
  return labels[tab];
}

function ownedFishingUpgrades(state: FishingPlayerState, category?: FishingUpgradeCategory) {
  return state.inventory
    .map((entry) => getFishingUpgrade(entry.item_id))
    .filter((item): item is NonNullable<ReturnType<typeof getFishingUpgrade>> => Boolean(item))
    .filter((item) => !category || item.category === category);
}

function fishingInventoryComponents(ownerDiscordUserId: string, state: FishingPlayerState, expiresAt: number, tab: FishingInventoryTab) {
  const navigationButtons = FISHING_INVENTORY_TABS.map((entry) => new ButtonBuilder()
    .setCustomId(`${FISHING_BUTTON_PREFIX}-inventory:${ownerDiscordUserId}:${expiresAt}:${entry}`)
    .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(fishingInventoryTabLabel(entry)));
  const equipCategory = tab === 'rods' ? 'rod' : tab === 'baits' ? 'bait' : null;
  const equipableItems = equipCategory ? ownedFishingUpgrades(state, equipCategory) : [];
  const equippedItemIds = new Set([
    state.equipment.rodItemId,
    state.equipment.baitItemId,
  ]);
  const buttons = equipableItems.map((item) => new ButtonBuilder()
    .setCustomId(`${FISHING_BUTTON_PREFIX}-equip:${ownerDiscordUserId}:${expiresAt}:${item.id}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(equippedItemIds.has(item.id) ? `${item.name} equipped` : `Equip ${item.name}`)
    .setDisabled(equippedItemIds.has(item.id)));
  return [...toComponentRows(navigationButtons), ...toComponentRows(buttons)];
}

function buildFishingShopPanel(ownerDiscordUserId: string, category: FishingUpgradeCategory, state: FishingPlayerState, expiresAt: number, notice?: string) {
  const items = getFishingShopItems(category);
  const ownedItemIds = new Set(state.inventory.map((item) => item.item_id));
  return {
    components: fishingShopComponents(ownerDiscordUserId, category, state, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`Fishing shop · ${fishingShopCategoryLabel(category)}`)
        .setDescription(`${notice ? `${notice}\n\n` : ''}Character level: **${state.chatLevel}** · Fishing level: **${state.fishingLevel}** (${formatXp(state.fishingXpIntoLevel)}/${formatXp(state.fishingXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**\nUse the category buttons to browse and buy permanent upgrades. Boat upgrades unlock travel and never need equipping.`)
        .addFields(items.map((item) => ({
          name: `${ownedItemIds.has(item.id) ? 'Owned · ' : ''}${item.name} · ${formatXp(getFishingUpgradeCost(item, [...ownedItemIds]))} KnowBucks`,
          value: `${item.description}${item.requiredFishingLevel ? `\nRequires fishing level **${item.requiredFishingLevel}**.` : ''}${item.requiredUpgradeId ? `\nRequires **${getFishingUpgrade(item.requiredUpgradeId)?.name ?? item.requiredUpgradeId}**.` : ''}`,
        }))),
    ],
  };
}

function splitFishingPanelField(name: string, lines: readonly string[], emptyValue: string) {
  const values: string[] = [];
  let currentValue = '';
  for (const line of lines) {
    const nextValue = currentValue ? `${currentValue}\n${line}` : line;
    if (nextValue.length > 1_024 && currentValue) {
      values.push(currentValue);
      currentValue = line;
    } else {
      currentValue = nextValue;
    }
  }
  if (currentValue) values.push(currentValue);
  return values.length > 0
    ? values.map((value, index) => ({ name: index === 0 ? name : `${name} (continued)`, value }))
    : [{ name, value: emptyValue }];
}

function buildFishingInventoryTabbedPanel(
  ownerDiscordUserId: string,
  state: FishingPlayerState,
  expiresAt: number,
  tab: FishingInventoryTab = 'overview',
  notice?: string,
) {
  const equipment = describeFishingEquipment(state.equipment);
  const legacyCrates = state.inventory
    .map((entry) => ({ crate: getFishingCrate(entry.item_id), quantity: entry.quantity }))
    .filter((entry): entry is { crate: NonNullable<ReturnType<typeof getFishingCrate>>; quantity: number } => Boolean(entry.crate));
  const sharedDescription = `${notice ? `${notice}\n\n` : ''}Character level: **${state.chatLevel}** · Fishing level: **${state.fishingLevel}** (${formatXp(state.fishingXpIntoLevel)}/${formatXp(state.fishingXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**`;
  const embed = new EmbedBuilder()
    .setColor(0x0EA5E9)
    .setTitle(`Fishing inventory · ${fishingInventoryTabLabel(tab)}`);

  if (tab === 'overview') {
    embed
      .setDescription(`${sharedDescription}\nUse the category buttons to inspect your items. Rod and bait tabs include their own equip controls.`)
      .addFields(
        { name: 'Equipped', value: `Rod: **${equipment.rod}**\nBait: **${equipment.bait}**`, inline: true },
        { name: 'Progression', value: `Crew slots: **${state.crewSlots}**\nPassives: **${equipment.passives}**`, inline: true },
        ...splitFishingPanelField(
          'Legacy crates',
          legacyCrates.map(({ crate, quantity }) => `${crate.name} (${crate.rarity} · ${getFishingBiome(crate.biomeId)?.name ?? crate.biomeId}) x**${formatXp(quantity)}**`),
          'No legacy crates. Newly caught crates open automatically during expeditions.',
        ),
      );
  } else {
    const categoryByTab: Partial<Record<FishingInventoryTab, FishingUpgradeCategory>> = {
      rods: 'rod',
      baits: 'bait',
      skills: 'skill',
      gear: 'gear',
      boats: 'boat',
    };
    const category = categoryByTab[tab];
    const ownedItems = category ? ownedFishingUpgrades(state, category) : [];
    const categoryDescription = tab === 'rods'
      ? 'Choose an owned rod below to equip it.'
      : tab === 'baits'
        ? 'Choose one owned bait below to equip it.'
        : tab === 'gear'
          ? 'Gear is permanent and activates automatically. Its descriptions below state each active benefit.'
          : tab === 'skills'
            ? 'Skills are permanent player-stat upgrades and apply automatically.'
            : 'Boat upgrades are permanent and unlock expedition biomes automatically.';
    embed
      .setDescription(`${sharedDescription}\n${categoryDescription}`)
      .addFields(...splitFishingPanelField(
        `Owned ${fishingInventoryTabLabel(tab)}`,
        ownedItems.map((item) => {
          const isEquipped = item.id === state.equipment.rodItemId || item.id === state.equipment.baitItemId;
          return `**${item.name}**${isEquipped ? ' (equipped)' : ''} — ${item.description}`;
        }),
        `No ${fishingInventoryTabLabel(tab).toLowerCase()} owned yet.`,
      ));
  }

  return {
    components: fishingInventoryComponents(ownerDiscordUserId, state, expiresAt, tab),
    embeds: [embed],
  };
}

function fishingCatalogueComponents(ownerDiscordUserId: string, biomeId: FishingBiomeId, expiresAt: number) {
  return toComponentRows(FISHING_BIOMES.map((biome) => new ButtonBuilder()
    .setCustomId(`${FISHING_BUTTON_PREFIX}-catalogue:${ownerDiscordUserId}:${expiresAt}:${biome.id}`)
    .setStyle(biome.id === biomeId ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(biome.name)));
}

export function buildFishingCataloguePanel(
  ownerDiscordUserId: string,
  biomeId: FishingBiomeId,
  expiresAt: number,
  progress: FishingCatalogueProgress,
) {
  const biome = getFishingBiome(biomeId);
  if (!biome) throw new Error('Fishing catalogue biome is invalid.');
  const fish = FISHING_FISH.filter((entry) => entry.biomeId === biomeId);
  const gear = FISHING_UPGRADES.filter((entry) => entry.category === 'gear'
    && (!entry.foundBiomeIds || entry.foundBiomeIds.includes(biomeId)));
  return {
    components: fishingCatalogueComponents(ownerDiscordUserId, biomeId, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`Fishing catalogue · ${biome.name}`)
        .setDescription(`${biome.description}\n✅ marks fish you have caught and gear you have found. ⬜ marks entries still to discover.`)
        .addFields(
          ...splitFishingPanelField('Fish caught', fish.map((entry) => `${isFishingFishCaught(progress, entry) ? '✅ Caught' : '⬜ Not caught'} — **${entry.name}** (${entry.rarity})`), 'No fish recorded.'),
          ...splitFishingPanelField('Gear found', gear.map((entry) => `${progress.ownedGearItemIds.has(entry.id) ? '✅ Found' : '⬜ Not found'} — **${entry.name}**`), 'No gear recorded.'),
        ),
    ],
  };
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
  await grantCurrentFishingLevelRoles(config, targetMember);
  await syncDiscordFishingTopRole(config, interaction.guild);
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
    await interaction.reply({ content: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before using /leaderboard again.` });
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
      await interaction.reply({ content: 'Bot accounts do not hold KnowBucks.' });
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
    });
    return;
  }

  if (subcommand === 'pay') {
    const targetUser = interaction.options.getUser('member', true);
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bot accounts cannot hold KnowBucks.' });
      return;
    }
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: 'You cannot pay KnowBucks to yourself.' });
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
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.reply({ content: 'You do not have enough KnowBucks for that payment.' });
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

  const targetUser = interaction.options.getUser('member', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot hold KnowBucks.', flags: MessageFlags.Ephemeral });
    return;
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

async function handleFishingCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  if (!(await isFishingCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({ content: 'Fishing commands are not enabled in this channel. An administrator can change this in Discord Configuration.' });
    return;
  }
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'help') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0EA5E9)
          .setTitle('KnowLeague fishing help')
          .setDescription('Send expeditions to catch fish, earn KnowBucks, unlock new waters, and discover automatically opened crates.')
          .addFields(
            {
              name: 'Start an expedition',
              value: '`/fish expedition-set biome:<biome> length:<1–4> [crew]` launches an available crew slot. Higher lengths require fishing levels and catch more fish.',
            },
            {
              name: 'Track your trips',
              value: '`/fish expedition-progress` shows active expeditions, your latest return, and Fishing XP progress. Character level sets a minimum Fishing level; expeditions and crates can take it higher.',
            },
            {
              name: 'Build progression',
              value: '`/fish shop` spends KnowBucks on rods, bait, boat upgrades, skills, and crew contracts. Boat upgrades unlock their matching biomes.',
            },
            {
              name: 'Inventory, crates, and catalogue',
              value: '`/fish inventory` has focused equipment, skill, gear-description, and boat tabs. Newly caught crates open automatically. `/fish chests-open` redeems all held legacy crates, while `/fish catalogue` tracks fish catches and found gear by biome.',
            },
            {
              name: 'Crew expeditions',
              value: 'Crew 1 and Crew 2 unlock at higher fishing levels. Their trips take three times as long and earn half the normal fish-sale reward.',
            },
          ),
      ],
    });
    return;
  }

  if (subcommand === 'expedition-set') {
    const biomeId = interaction.options.getString('biome', true) as FishingBiomeId;
    const durationTier = interaction.options.getInteger('length', true) as FishingDurationTier;
    const requestedCrewSlot = interaction.options.getInteger('crew') ?? undefined;
    await interaction.deferReply();
    try {
      const expedition = await startFishingExpedition(
        config,
        interaction.user.id,
        biomeId,
        durationTier,
        interaction.channelId,
        requestedCrewSlot,
      );
      await interaction.editReply(buildFishingLaunchResponse(expedition));
      try {
        const launchMessage = await interaction.fetchReply();
        await attachFishingLaunchMessage(config, interaction.user.id, expedition, launchMessage.id, interaction.guild);
      } catch (messageAttachmentError) {
        console.warn(`Discord fishing expedition ${expedition.expeditionId} launch message could not be attached.`, messageAttachmentError);
      }
    } catch (error) {
      if (error instanceof Error) {
        await interaction.editReply({ content: error.message.replace(/^Unable to start Discord fishing expedition: /, '') });
        return;
      }
      throw error;
    }
    return;
  }

  if (subcommand === 'expedition-progress') {
    await interaction.deferReply();
    await reconcileDueFishingExpeditions(config, interaction.guild);
    const progress = await getFishingProgress(config, interaction.user.id);
    const active = progress.active.length > 0
      ? progress.active.map((expedition) => {
        const biome = getFishingBiome(expedition.biome_id);
        const durationSeconds = Math.max(0, Math.round((new Date(expedition.completes_at).getTime() - new Date(expedition.started_at).getTime()) / 1_000));
        return `Crew ${expedition.crew_slot}: **${biome?.name ?? expedition.biome_id}** · trip duration: **${formatFishingDuration(durationSeconds)}**`;
      }).join('\n')
      : 'No active expeditions.';
    const recent = progress.mostRecent?.result
      ? `Latest: **${getFishingBiome(progress.mostRecent.biome_id)?.name ?? progress.mostRecent.biome_id}** · ${formatXp(progress.mostRecent.result.fishSaleValue + (progress.mostRecent.result.crateSaleValue ?? 0) + progress.mostRecent.result.knowBucksFound)} KnowBucks earned`
      : 'No completed expeditions yet.';
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0EA5E9)
          .setTitle(`${interaction.user.username}'s fishing progress`)
          .addFields(
            { name: `Active expeditions (${progress.active.length}/${progress.state.crewSlots})`, value: active },
            { name: 'Most recent return', value: recent },
            { name: 'Fishing skill', value: `Level **${progress.state.fishingLevel}** · **${formatXp(progress.state.fishingXpIntoLevel)}/${formatXp(progress.state.fishingXpToNextLevel)} XP** to next level\nCharacter level: **${progress.state.chatLevel}**` },
            { name: 'Current balance', value: `**${formatXp(progress.state.balance)} KnowBucks**` },
          ),
      ],
    });
    return;
  }

  if (subcommand === 'shop') {
    await interaction.deferReply();
    const state = await getFishingPlayerState(config, interaction.user.id);
    const expiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingShopPanel(interaction.user.id, 'rod', state, expiresAt));
    scheduleFishingPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  if (subcommand === 'inventory') {
    await interaction.deferReply();
    const state = await getFishingPlayerState(config, interaction.user.id);
    const expiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingInventoryTabbedPanel(interaction.user.id, state, expiresAt));
    scheduleFishingPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  if (subcommand === 'chests-open') {
    await interaction.deferReply();
    try {
      const opening = await openAllFishingCrates(config, interaction.user.id);
      await interaction.editReply(buildFishingCrateOpeningResult(opening));
    } catch (error) {
      const message = error instanceof Error && error.message.includes('do not have any legacy fishing chests')
        ? 'You do not have any legacy chests to open. Newly caught crates open automatically during expeditions.'
        : 'Your legacy chests could not be opened. Please try again shortly.';
      await interaction.editReply({ content: message });
    }
    return;
  }

  if (subcommand === 'catalogue') {
    await interaction.deferReply();
    const progress = await getFishingCatalogueProgress(config, interaction.user.id);
    const expiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingCataloguePanel(interaction.user.id, 'harbor', expiresAt, progress));
    scheduleFishingPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  throw new Error(`Unsupported fishing command: ${subcommand}`);
}

async function handleCollectionsCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'spawn' && !(await isSkinCollectionCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({ content: 'Collections commands are not enabled in this channel. An administrator can change the Collections commands channel in Discord Configuration. `/collections spawn` remains available to collection administrators in any channel where the bot can post.' });
    return;
  }

  if (subcommand === 'collection') {
    const targetUser = interaction.options.getUser('member') ?? interaction.user;
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bot accounts do not have skin collections.' });
      return;
    }
    let targetMember: GuildMember;
    try {
      targetMember = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      await interaction.reply({ content: 'Choose a current server member to view their collection.' });
      return;
    }
    await interaction.deferReply();
    const page = await getSkinCollectionPage(config, targetUser.id, 0);
    await interaction.editReply({
      components: skinCollectionButtons(interaction.user.id, targetUser.id, page.page, page.total, false),
      embeds: [buildSkinCollectionEmbed(page, targetMember.displayName)],
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
    await interaction.editReply({ content: 'Enable skin claims before using /collections spawn. The bot must also be able to post in this channel.' });
    return;
  }

  if (subcommand === 'summon') {
    await interaction.deferReply();
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
      await interaction.reply({ content: 'Collection capacity must be added in multiples of five slots.' });
      return;
    }
    await interaction.deferReply();
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
    await interaction.deferReply();
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
    await interaction.deferReply();
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
    await interaction.deferReply();
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
      await interaction.reply({ content: 'No matching skin was found in the local KnowLeague catalogue.' });
      return;
    }
    await interaction.reply({ embeds: [buildSkinSearchEmbed(skin)] });
    return;
  }

  if (subcommand === 'sell') {
    const skinCode = interaction.options.getInteger('skin-id', true);
    await interaction.deferReply();
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
    await interaction.reply({ content: 'Bot accounts cannot receive claimed skins.' });
    return;
  }
  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: 'You cannot give a skin to yourself.' });
    return;
  }
  try {
    await interaction.guild.members.fetch(targetUser.id);
  } catch {
    await interaction.reply({ content: 'Choose a current server member to receive this skin.' });
    return;
  }
  await interaction.deferReply();
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

async function handleFishingButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  if (interaction.customId === FISHING_REPEAT_BUTTON_PREFIX || interaction.customId.startsWith(`${FISHING_REPEAT_BUTTON_PREFIX}:`)) {
    const preset = parseFishingRepeatCustomId(interaction.customId);
    if (!preset) {
      await interaction.reply({ content: 'This fishing repeat control is no longer valid. Run `/fish expedition-set` to launch a new trip.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.user.id !== preset.ownerDiscordUserId) {
      await interaction.reply({ content: 'Only the member who completed this expedition can repeat it.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!(await isFishingCommandAllowedInChannel(config, interaction.channelId))) {
      await interaction.reply({ content: 'Fishing commands are not enabled in this channel. An administrator can change this in Discord Configuration.', flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferUpdate();
    try {
      const expedition = await startFishingExpedition(
        config,
        preset.ownerDiscordUserId,
        preset.biomeId,
        preset.durationTier,
        interaction.channelId,
        preset.crewSlot,
      );
      await interaction.editReply(buildFishingLaunchResponse(expedition));
      await attachFishingLaunchMessage(config, preset.ownerDiscordUserId, expedition, interaction.message.id, interaction.guild);
    } catch (error) {
      const message = error instanceof Error
        ? error.message.replace(/^Unable to start Discord fishing expedition: /, '')
        : 'KnowLeague could not start that fishing expedition. Please try again shortly.';
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  const [prefix, ownerDiscordUserId, expiresAtRaw, argument] = interaction.customId.split(':');
  if (!prefix.startsWith(`${FISHING_BUTTON_PREFIX}-`) || !ownerDiscordUserId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || !argument || Date.now() >= expiresAt) {
    await expireFishingPanel(interaction);
    return true;
  }
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this fishing panel can use its controls.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await isFishingCommandAllowedInChannel(config, interaction.channelId))) {
    clearFishingPanelExpiry(interaction.message.id);
    await interaction.update({ content: 'Fishing commands are no longer enabled in this channel, so this panel has expired.', components: [] });
    return true;
  }

  if (prefix === `${FISHING_BUTTON_PREFIX}-shop`) {
    if (!FISHING_SHOP_CATEGORIES.includes(argument as FishingUpgradeCategory)) {
      await interaction.reply({ content: 'This fishing shop panel is outdated. Run /fish shop to open the current progression shop.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const state = await getFishingPlayerState(config, ownerDiscordUserId);
    const nextExpiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingShopPanel(ownerDiscordUserId, argument as FishingUpgradeCategory, state, nextExpiresAt));
    scheduleFishingPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${FISHING_BUTTON_PREFIX}-inventory`) {
    if (!FISHING_INVENTORY_TABS.includes(argument as FishingInventoryTab)) {
      await interaction.reply({ content: 'This fishing inventory panel is outdated. Run /fish inventory to open the current inventory.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const state = await getFishingPlayerState(config, ownerDiscordUserId);
    const nextExpiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingInventoryTabbedPanel(ownerDiscordUserId, state, nextExpiresAt, argument as FishingInventoryTab));
    scheduleFishingPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${FISHING_BUTTON_PREFIX}-catalogue`) {
    if (!FISHING_BIOMES.some((biome) => biome.id === argument)) {
      await interaction.reply({ content: 'This fishing catalogue panel is outdated. Run /fish catalogue to open the current field guide.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const progress = await getFishingCatalogueProgress(config, ownerDiscordUserId);
    const nextExpiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingCataloguePanel(ownerDiscordUserId, argument as FishingBiomeId, nextExpiresAt, progress));
    scheduleFishingPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${FISHING_BUTTON_PREFIX}-buy`) {
    const upgrade = getFishingUpgrade(argument);
    if (!upgrade || upgrade.cost <= 0) {
      await interaction.reply({ content: 'This fishing shop item is no longer available. Run /fish shop to open the current progression shop.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const nextExpiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    try {
      const purchase = await purchaseFishingUpgrade(config, ownerDiscordUserId, argument);
      const state = await getFishingPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildFishingShopPanel(
        ownerDiscordUserId,
        purchase.upgrade.category,
        state,
        nextExpiresAt,
        `Purchased **${purchase.upgrade.name}** for **${formatXp(purchase.cost)} KnowBucks**.`,
      ));
    } catch (error) {
      const state = await getFishingPlayerState(config, ownerDiscordUserId);
      const notice = error instanceof Error && error.message.includes('Insufficient KnowBucks balance')
        ? 'You do not have enough KnowBucks for that upgrade.'
        : error instanceof Error && error.message.includes('already own')
          ? 'You already own that upgrade.'
          : error instanceof Error && error.message.includes('requires')
            ? error.message
          : 'That fishing shop purchase could not be completed.';
      await interaction.editReply(buildFishingShopPanel(ownerDiscordUserId, upgrade.category, state, nextExpiresAt, notice));
    }
    scheduleFishingPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${FISHING_BUTTON_PREFIX}-equip`) {
    const upgrade = getFishingUpgrade(argument);
    if (!upgrade || (upgrade.category !== 'rod' && upgrade.category !== 'bait')) {
      await interaction.reply({ content: 'This equipment control is outdated. Run /fish inventory to open the current inventory.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const nextExpiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    try {
      const equipped = await equipFishingUpgrade(config, ownerDiscordUserId, argument);
      const state = await getFishingPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildFishingInventoryTabbedPanel(ownerDiscordUserId, state, nextExpiresAt, equipped.category === 'rod' ? 'rods' : 'baits', `Equipped **${equipped.name}**.`));
    } catch (error) {
      const state = await getFishingPlayerState(config, ownerDiscordUserId);
      const notice = error instanceof Error && error.message.includes('do not own')
        ? 'You no longer own that upgrade.'
        : 'That upgrade could not be equipped.';
      await interaction.editReply(buildFishingInventoryTabbedPanel(ownerDiscordUserId, state, nextExpiresAt, upgrade.category === 'rod' ? 'rods' : 'baits', notice));
    }
    scheduleFishingPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  return false;
}

function buildFishingCrateOpeningResult(opening: Awaited<ReturnType<typeof openAllFishingCrates>>) {
  const foundItems = opening.items
    .map((item) => `**${item.name}** (${item.rarity})${item.quantity > 1 ? ` x${formatXp(item.quantity)}` : ''} — sold for ${formatXp(item.saleValue)} KnowBucks`);
  return {
    components: [],
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle('Legacy fishing chests opened')
        .setDescription(`Opened **${formatXp(opening.openedCount)}** legacy chest${opening.openedCount === 1 ? '' : 's'}. You earned **${formatXp(opening.totalSaleValue)} KnowBucks**. New balance: **${formatXp(opening.currentBalance)} KnowBucks**.`)
        .addFields(...splitFishingPanelField('Found', foundItems, 'No crate items found.')),
    ],
  };
}

export async function handleButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  if (interaction.guildId !== config.guildId) return;
  if (await handleFishingButtonInteraction(interaction, config)) return;
  const parts = interaction.customId.split(':');
  const [prefix, viewerDiscordUserId, ownerOrRequestedPage, requestedPageOrView, requestedView] = parts;
  const legacyCollectionPanel = parts.length === 3;
  const ownerDiscordUserId = legacyCollectionPanel ? viewerDiscordUserId : ownerOrRequestedPage;
  const requestedPage = legacyCollectionPanel ? ownerOrRequestedPage : requestedPageOrView;
  const view = legacyCollectionPanel ? 'summary' : requestedView;
  if (
    prefix !== SKIN_COLLECTION_BUTTON_PREFIX
    || !viewerDiscordUserId
    || !ownerDiscordUserId
    || !/^\d+$/.test(requestedPage ?? '')
    || (view !== 'details' && view !== 'summary')
  ) return;
  if (interaction.user.id !== viewerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this collection can browse it.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const page = await getSkinCollectionPage(config, ownerDiscordUserId, Number(requestedPage));
  const ownerMember = interaction.guild ? await interaction.guild.members.fetch(ownerDiscordUserId).catch(() => null) : null;
  await interaction.editReply({
    components: skinCollectionButtons(viewerDiscordUserId, ownerDiscordUserId, page.page, page.total, view === 'details'),
    embeds: [buildSkinCollectionEmbed(page, ownerMember?.displayName ?? 'Member', view === 'details')],
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
            { name: '/fish expedition-set biome length [crew]', value: 'Launch one of four level-gated expedition lengths to an unlocked biome. Rod rarity, bait, skills, and permanent gear apply to the saved trip; crew runs take three times as long and return half fish-sale rewards.' },
            { name: '/fish expedition-progress, shop, inventory', value: 'Check active trips, buy rods, bait, boat upgrades, and skill levels, or use the inventory tabs to inspect gear descriptions and equip an owned rod or bait.' },
            { name: '/fish chests-open, catalogue, help', value: 'Redeem all held legacy chests, browse the biome-filtered field guide, or open focused fishing help. Newly caught crates open automatically during expeditions.' },
            { name: '/collections collection [member]', value: 'Post your own or another current member\'s claimed skin collection for the server to view, one skin at a time. Use Show details to see collection metadata and the skin\'s sell value.' },
            { name: '/collections give member skin-id', value: 'Give one of your claimed skins to another current server member by its four-digit ID.' },
            { name: '/collections summon', value: 'Spend the configured summon cost (5,000 KnowBucks by default) to summon a claimable drop in this channel, with your grace period first.' },
            { name: '/collections capacity-add slots', value: 'Buy collection space in multiples of five slots for the configured rate (500 KnowBucks per five slots by default). Staff can use `capacity-force-add` for a free member upgrade.' },
            { name: '/collections steal/favorite/gamble/sell', value: 'Attempt a steal for 3x the skin’s configured sell value (with a 30-minute cooldown), choose your first collection item, gamble a skin, or sell one by its four-digit ID.' },
            { name: '/collections search skin-name', value: 'Preview a catalogue skin. The preview cannot be claimed.' },
            { name: '/collections spawn', value: 'Immediately post a skin drop in this channel. Requires a role selected in Discord Configuration.' },
            { name: 'Chat leveling', value: 'Eligible non-bot messages earn XP. Level rewards and messages are configured on the website.' },
          ),
      ],
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

  if (interaction.commandName === 'fish') {
    await handleFishingCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'collections') {
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
    });
  }
}
