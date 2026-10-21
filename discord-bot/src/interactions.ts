import { randomInt } from 'node:crypto';
import { ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type GuildMember, type Message } from 'discord.js';
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
import { flipKnowBucks, getKnowBucksBalance, getKnowBucksLeaderboard, payKnowBucks, purchaseSnipe, updateKnowBucks } from './knowbucks.js';
import { importExternalMessageEmojis } from './emoji-import.js';
import { findLinkedProfile } from './profiles.js';
import { isDefaultCommandChannel, usesDefaultCommandChannel } from './general-settings.js';
import { formatSnipedMessage, getSnipeImageAttachments, getSnipedMessage } from './snipe.js';
import {
  buildDiscordSkindleGuessEmbed,
  buildDiscordSkindleShareEmbed,
  buildDiscordSkindleSolvedEmbed,
  discordSkindleSessionStore,
  formatDiscordSkindleDate,
} from './skindle.js';
import {
  attachFishingExpeditionMessage,
  describeFishingEquipment,
  FISHING_REPEAT_BUTTON_PREFIX,
  FISHING_BIOMES,
  FISHING_EVENTS,
  FISHING_FISH,
  FISHING_UPGRADES,
  formatFishingDuration,
  getFishingBiome,
  getFishingCatalogueProgress,
  getFishingEventCatalogueProgress,
  getFishingCrate,
  getFishingEvent,
  getFishingPlayerState,
  getVisibleFishingShopItems,
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
  type FishingEventCatalogueProgress,
  type FishingDurationTier,
  type FishingPlayerState,
  type StartedFishingExpedition,
  type FishingUpgradeCategory,
} from './fishing.js';
import {
  buildSkinSearchEmbed,
  buildSkinCollectionEmbed,
  favoriteSkinClaim,
  findSkinCollectionSearchResult,
  forceAddSkinCollectionCapacity,
  forceSkinClaimDrop,
  gambleSkinClaim,
  getSkinClaimAdminRoleIds,
  getSkinCollectionPage,
  isSkinCollectionCommandAllowedInChannel,
  purchaseSkinCollectionCapacity,
  reorderSkinCollection,
  sellSkinClaim,
  SKIN_CLAIM_ACTION_BUTTON_PREFIX,
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

function skindleButton(config: DiscordBotConfig) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('Play Skindle on KnowLeague')
    .setURL(new URL('/skindle', config.siteUrl).toString());
}

function skindleComponents(config: DiscordBotConfig) {
  return [{ type: 1 as const, components: [skindleButton(config)] }];
}

export function isDiscordAdministrativeCommand(commandName: string, subcommand: string | null) {
  return (commandName === 'xp' && (subcommand === 'add' || subcommand === 'set-level'))
    || (commandName === 'knowbucks' && (subcommand === 'add' || subcommand === 'remove' || subcommand === 'set'))
    || (commandName === 'collections' && (subcommand === 'spawn' || subcommand === 'capacity-force-add'))
    || commandName === 'steal-emoji';
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
const SKIN_COLLECTION_ACTION_BUTTON_PREFIX = 'skin-collection-action';
const FISHING_BUTTON_PREFIX = 'fish';
const FISHING_SHOP_CATEGORIES: readonly FishingUpgradeCategory[] = ['rod', 'bait', 'boat', 'skill', 'crew'];
const FISHING_INVENTORY_TABS = ['overview', 'rods', 'baits', 'skills', 'gear', 'boats', 'titles'] as const;
type FishingInventoryTab = typeof FISHING_INVENTORY_TABS[number];
const FISHING_PANEL_TTL_MS = 60_000;
const leaderboardCommandAvailableAtByUserId = new Map<string, number>();
let leaderboardCommandCooldownPruneAfter = 0;
const fishingPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function buildFishingLaunchResponse(expedition: StartedFishingExpedition) {
  const modifierDescription = expedition.activeModifierLabels?.length
    ? `\n\nActive modifiers: ${expedition.activeModifierLabels.map((label) => `**${label}**`).join(' · ')}`
    : '';
  const eventDescription = expedition.eventName && expedition.selectedBiomeName
    ? `\n\n🎃 **${expedition.eventName}:** ${expedition.biomeName} has replaced your selected ${expedition.selectedBiomeName} waters. Fish and crate values still follow ${expedition.selectedBiomeName}.`
    : '';
  return {
    components: [],
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`🚣 ${expedition.biomeName} expedition launched 🚣`)
        .setDescription(expedition.instantCompletion
          ? `Crew slot **${expedition.crewSlot}** triggered the Teleporter and is returning immediately.${eventDescription}${modifierDescription}`
          : `Crew slot **${expedition.crewSlot}** is now fishing. This trip takes about **${formatFishingDuration(expedition.durationSeconds)}**.${eventDescription}${modifierDescription}`),
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
  skinCode: number | null,
) {
  const customId = (requestedPage: number, view: 'details' | 'summary') => (
    `${SKIN_COLLECTION_BUTTON_PREFIX}:${viewerDiscordUserId}:${ownerDiscordUserId}:${requestedPage}:${view}`
  );
  const rows = [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(customId(page - 1, showDetails ? 'details' : 'summary'))
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Previous')
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(customId(page + 1, showDetails ? 'details' : 'summary'))
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Next')
        .setDisabled(total === 0 || page >= total - 1),
      new ButtonBuilder()
        .setCustomId(customId(page, showDetails ? 'summary' : 'details'))
        .setStyle(ButtonStyle.Primary)
        .setLabel(showDetails ? 'Hide details' : 'Show details')
        .setDisabled(total === 0),
    ],
  }];
  if (viewerDiscordUserId === ownerDiscordUserId && skinCode !== null) {
    const actionId = (action: 'favorite' | 'gamble' | 'sell') => (
      `${SKIN_COLLECTION_ACTION_BUTTON_PREFIX}:${viewerDiscordUserId}:${ownerDiscordUserId}:${page}:${showDetails ? 'details' : 'summary'}:${skinCode}:${action}`
    );
    rows.push({
      type: 1 as const,
      components: [
        new ButtonBuilder().setCustomId(actionId('favorite')).setStyle(ButtonStyle.Success).setLabel('Favorite'),
        new ButtonBuilder().setCustomId(actionId('gamble')).setStyle(ButtonStyle.Danger).setLabel('Gamble'),
        new ButtonBuilder().setCustomId(actionId('sell')).setStyle(ButtonStyle.Danger).setLabel('Sell'),
      ],
    });
  }
  return rows;
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
  const purchaseButtons = getVisibleFishingShopItems(category, [...ownedItemIds]).map((item) => {
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
    gear: 'Relics',
    boats: 'Boats',
    titles: 'Titles',
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

export function getFishingShopSkillEmoji(itemId: string) {
  const emojiByTrack: Record<string, string> = {
    haste: '⏩',
    lucky: '🍀',
    cheapskate: '📉',
    'money-mouser': '💰',
  };
  return emojiByTrack[itemId.replace(/-\d+$/, '')];
}

function buildFishingShopPanel(ownerDiscordUserId: string, category: FishingUpgradeCategory, state: FishingPlayerState, expiresAt: number, notice?: string) {
  const ownedItemIds = new Set(state.inventory.map((item) => item.item_id));
  const items = getVisibleFishingShopItems(category, [...ownedItemIds]);
  return {
    components: fishingShopComponents(ownerDiscordUserId, category, state, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`Fishing shop · ${fishingShopCategoryLabel(category)}`)
        .setDescription(`${notice ? `${notice}\n\n` : ''}Character level: **${state.chatLevel}** · Fishing level: **${state.fishingLevel}** (${formatXp(state.fishingXpIntoLevel)}/${formatXp(state.fishingXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**\nUse the category buttons to browse and buy permanent upgrades. Skills show only the next available tier in each track. Boat upgrades unlock travel and never need equipping.`)
        .addFields(items.map((item) => ({
          name: `${ownedItemIds.has(item.id) ? 'Owned · ' : ''}${item.category === 'skill' ? `${getFishingShopSkillEmoji(item.id) ?? ''} ` : ''}${item.name} · ${formatXp(getFishingUpgradeCost(item, [...ownedItemIds]))} KnowBucks`,
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
  } else if (tab === 'titles') {
    const titles = FISHING_EVENTS.map((event) => event.title);
    embed
      .setDescription(`${sharedDescription}\nTitles are permanent event achievements. They do not change your fishing bonuses.`)
      .addFields(...splitFishingPanelField(
        'Owned titles',
        titles
          .filter((title) => state.inventory.some((item) => item.item_id === title.itemId))
          .map((title) => `🏷️ **${title.name}**`),
        'No titles earned yet.',
      ));
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
          ? 'Relics are permanent and activate automatically. Their descriptions below state each active benefit.'
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
        .setDescription(`${biome.description}\n✅ marks fish you have caught and relics you have found. ⬜ marks entries still to discover.`)
        .addFields(
          ...splitFishingPanelField('Fish caught', fish.map((entry) => `${isFishingFishCaught(progress, entry) ? '✅ Caught' : '⬜ Not caught'} — **${entry.name}** (${entry.rarity})`), 'No fish recorded.'),
          ...splitFishingPanelField('Relics found', gear.map((entry) => `${progress.ownedGearItemIds.has(entry.id) ? '✅ Found' : '⬜ Not found'} — **${entry.name}**`), 'No relics recorded.'),
        ),
    ],
  };
}

export function buildFishingEventHelpPanel() {
  const event = FISHING_EVENTS[0];
  if (!event) {
    return { embeds: [new EmbedBuilder().setColor(0x64748B).setTitle('Fishing events').setDescription('There is no active fishing event right now.')] };
  }
  const fishByRarity = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xF97316)
        .setTitle(`${event.name} · ${event.biomeName}`)
        .setDescription(`Each new expedition has a **${Math.round(event.replacementChance * 100)}%** chance to enter the ${event.biomeName} instead of its selected biome. Expedition length and fish/crate sale values still use the selected biome. This event remains active until it is rotated out.`)
        .addFields(
          ...splitFishingPanelField(
            'Event fish',
            fishByRarity.map((rarity) => {
              const fish = event.fish.filter((entry) => entry.rarity === rarity);
              const names = fish.map((entry) => entry.nonSellable ? `${entry.name} (non-sellable; stored)` : entry.name).join(', ');
              return `**${rarity}** — ${names}`;
            }),
            'No event fish are active.',
          ),
          ...splitFishingPanelField(
            'Event crates',
            event.crates.map((crate) => `**${crate.rarity} · ${crate.name}** — ${crate.items.join(', ')}`),
            'No event crates are active.',
          ),
          {
            name: 'Event title',
            value: `🏷️ **${event.title.name}** — weight 1, ${(event.title.dropRate * 100).toFixed(1)}% chance per fish caught. It is a permanent title and is announced when found.`,
          },
        ),
    ],
  };
}

export function buildFishingEventCataloguePanel(progress: FishingEventCatalogueProgress) {
  const event = FISHING_EVENTS[0];
  if (!event) {
    return { embeds: [new EmbedBuilder().setColor(0x64748B).setTitle('Fishing event catalogue').setDescription('There is no active fishing event right now.')] };
  }
  const caught = (name: string, rarity: string) => progress.caughtFish.some((fish) => fish.name === name && fish.rarity === rarity);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xF97316)
        .setTitle(`${event.name} catalogue · ${event.biomeName}`)
        .setDescription('✅ marks event fish you have caught. ⬜ marks entries still to discover.')
        .addFields(
          ...splitFishingPanelField(
            'Event fish',
            event.fish.map((fish) => `${caught(fish.name, fish.rarity) ? '✅ Caught' : '⬜ Not caught'} — **${fish.name}** (${fish.rarity})`),
            'No event fish are active.',
          ),
          {
            name: 'Event title',
            value: `${progress.ownedTitleItemIds.has(event.title.itemId) ? '✅ Earned' : '⬜ Not earned'} — **${event.title.name}**`,
          },
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
  const cooldownKey = `${interaction.commandName}:${interaction.user.id}`;
  const availableAt = leaderboardCommandAvailableAtByUserId.get(cooldownKey) ?? 0;
  if (availableAt > now) {
    const seconds = Math.ceil((availableAt - now) / 1_000);
    await interaction.reply({ content: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before using /leaderboard again.` });
    return;
  }
  leaderboardCommandAvailableAtByUserId.set(cooldownKey, now + LEADERBOARD_COMMAND_COOLDOWN_MS);

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

async function handleKnowBucksLeaderboardCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;

  const now = Date.now();
  if (now >= leaderboardCommandCooldownPruneAfter) {
    leaderboardCommandCooldownPruneAfter = now + 5 * 60 * 1_000;
    for (const [key, expiry] of leaderboardCommandAvailableAtByUserId) {
      if (expiry <= now) leaderboardCommandAvailableAtByUserId.delete(key);
    }
  }
  const cooldownKey = `${interaction.commandName}:${interaction.options.getSubcommand()}:${interaction.user.id}`;
  const availableAt = leaderboardCommandAvailableAtByUserId.get(cooldownKey) ?? 0;
  if (availableAt > now) {
    const seconds = Math.ceil((availableAt - now) / 1_000);
    await interaction.reply({ content: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before using /knowbucks leaderboard again.` });
    return;
  }
  leaderboardCommandAvailableAtByUserId.set(cooldownKey, now + LEADERBOARD_COMMAND_COOLDOWN_MS);

  const count = interaction.options.getInteger('count') ?? 10;
  await interaction.deferReply();
  const entries = await getKnowBucksLeaderboard(config, interaction.guild, count);
  if (!entries.length) {
    await interaction.editReply({ content: 'No current server members hold KnowBucks yet.' });
    return;
  }

  await interaction.editReply({
    allowedMentions: { parse: [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('KnowLeague KnowBucks leaderboard')
        .setDescription(entries.map((entry, index) => (
          `**${index + 1}.** <@${entry.userId}> - **${formatXp(entry.balance)} KnowBucks**`
        )).join('\n'))
        .setFooter({ text: `Top ${entries.length} active server member${entries.length === 1 ? '' : 's'} by KnowBucks` }),
    ],
  });
}

async function handleKnowBucksCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'leaderboard') {
    await handleKnowBucksLeaderboardCommand(interaction, config);
    return;
  }

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

  if (subcommand === 'coinflip') {
    const amount = interaction.options.getInteger('amount', true);
    const won = randomInt(2) === 0;
    try {
      const result = await flipKnowBucks(config, interaction.user.id, amount, won);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(result.won ? 0x22C55E : 0xEF4444)
            .setTitle(result.won ? 'Coinflip won!' : 'Coinflip lost')
            .setDescription(result.won
              ? `You won **${formatXp(result.wager_amount)} KnowBucks** on the **${formatXp(result.wager_amount)} KnowBucks** wager.\nBalance: **${formatXp(result.current_balance)} KnowBucks**.`
              : `You lost **${formatXp(result.wager_amount)} KnowBucks**.\nBalance: **${formatXp(result.current_balance)} KnowBucks**.`),
        ],
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.reply({ content: 'You do not have enough KnowBucks for that coinflip.' });
        return;
      }
      throw error;
    }
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

async function handleSnipeCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  const sniped = getSnipedMessage(interaction.channelId);
  if (!sniped) {
    await interaction.reply({ content: 'There is no cached deleted message in this channel. No KnowBucks were spent.' });
    return;
  }

  try {
    const purchase = await purchaseSnipe(config, interaction.user.id);
    const imageAttachments = getSnipeImageAttachments(sniped);
    const snipeEmbed = new EmbedBuilder()
      .setColor(0x64748B)
      .setTitle('Last deleted message')
      .setDescription(formatSnipedMessage(sniped))
      .setFooter({ text: `1,000 KnowBucks spent | Your balance: ${formatXp(purchase.current_balance)} KnowBucks` })
      .setTimestamp(sniped.deletedAt);
    if (imageAttachments[0]) snipeEmbed.setImage(imageAttachments[0].url);

    await interaction.reply({
      allowedMentions: { parse: [] },
      embeds: [
        snipeEmbed,
        ...imageAttachments.slice(1).map((attachment, index) => new EmbedBuilder()
          .setColor(0x64748B)
          .setTitle(`Image attachment ${index + 2}`)
          .setImage(attachment.url)),
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
      await interaction.reply({ content: 'You need at least 1,000 KnowBucks to use /snipe.' });
      return;
    }
    throw error;
  }
}

type EmojiMessageReference =
  | { channelId: string; messageId: string; status: 'ok' }
  | { status: 'different-guild' | 'invalid' };

function parseEmojiMessageReference(value: string, currentChannelId: string, guildId: string): EmojiMessageReference {
  const trimmed = value.trim();
  if (/^[0-9]{17,20}$/.test(trimmed)) {
    return { channelId: currentChannelId, messageId: trimmed, status: 'ok' };
  }

  try {
    const url = new URL(trimmed);
    if (!['discord.com', 'www.discord.com', 'discordapp.com', 'www.discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(url.hostname)) {
      return { status: 'invalid' };
    }
    const [, route, linkGuildId, channelId, messageId] = url.pathname.split('/');
    if (route !== 'channels' || !/^[0-9]{17,20}$/.test(linkGuildId ?? '') || !/^[0-9]{17,20}$/.test(channelId ?? '') || !/^[0-9]{17,20}$/.test(messageId ?? '')) {
      return { status: 'invalid' };
    }
    if (linkGuildId !== guildId) {
      return { status: 'different-guild' };
    }
    return { channelId: channelId!, messageId: messageId!, status: 'ok' };
  } catch {
    return { status: 'invalid' };
  }
}

async function fetchEmojiSourceMessage(
  interaction: ChatInputCommandInteraction,
  reference: Extract<EmojiMessageReference, { status: 'ok' }>,
): Promise<Message | null> {
  if (!interaction.guild) return null;
  const channel = reference.channelId === interaction.channelId
    ? interaction.channel
    : await interaction.guild.channels.fetch(reference.channelId);
  if (!channel || !channel.isTextBased() || !('messages' in channel)) {
    return null;
  }
  return channel.messages.fetch(reference.messageId).catch(() => null);
}

async function handleStealEmojiCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only server administrators can use /steal-emoji.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botMember = await interaction.guild.members.fetchMe();
  const canCreateExpressions = botMember.permissions.has(PermissionFlagsBits.CreateGuildExpressions)
    || botMember.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
  if (!canCreateExpressions) {
    await interaction.editReply({ content: 'KnowLeague needs the Create Expressions permission before it can import emoji.' });
    return;
  }

  const reference = parseEmojiMessageReference(
    interaction.options.getString('message-id', true),
    interaction.channelId,
    config.guildId,
  );
  if (reference.status !== 'ok') {
    await interaction.editReply({
      content: reference.status === 'different-guild'
        ? 'The source message must be from this server. KnowLeague cannot read messages in another server.'
        : 'Enter a message ID from this channel, or paste a Discord message link from this server.',
    });
    return;
  }

  const sourceMessage = await fetchEmojiSourceMessage(interaction, reference);
  if (!sourceMessage) {
    await interaction.editReply({ content: 'KnowLeague could not read that message. Check the ID or link and its Read Message History permission.' });
    return;
  }

  const result = await importExternalMessageEmojis(
    interaction.guild,
    sourceMessage,
    `Imported by ${interaction.user.tag} through KnowLeague /steal-emoji`,
  );
  if (result.imported.length === 0 && result.skippedExisting.length === 0 && result.failed.length === 0) {
    await interaction.editReply({ content: 'That message does not contain custom emoji from another server.' });
    return;
  }

  const details = [
    result.imported.length > 0 ? `Imported: ${result.imported.map((name) => `:${name}:`).join(', ')}` : null,
    result.skippedExisting.length > 0 ? `Already in this server: ${result.skippedExisting.map((name) => `:${name}:`).join(', ')}` : null,
    result.failed.length > 0 ? `Could not import: ${result.failed.map((name) => `:${name}:`).join(', ')}` : null,
  ].filter((value): value is string => value !== null);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(result.failed.length > 0 ? 0xF59E0B : 0x22C55E)
        .setTitle('External emoji import complete')
        .setDescription(details.join('\n')),
    ],
  });
}

async function handleFishingCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  if (!(await isFishingCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({
      content: 'Fishing commands are not enabled in this channel. An administrator can change this in Discord Configuration.',
      flags: MessageFlags.Ephemeral,
    });
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
              value: '`/fish inventory` has focused equipment, skill, relic-description, and boat tabs. Newly caught crates open automatically. `/fish chests-open` redeems all held legacy crates, while `/fish catalogue` tracks fish catches and found relics by biome.',
            },
            {
              name: 'Crew expeditions',
              value: 'Crew 1 and Crew 2 unlock at higher fishing levels. Their trips take three times as long, with normal expedition rewards.',
            },
            {
              name: 'Active events',
              value: '`/fish event-help` explains the active event and its rewards. `/fish event-catalogue` tracks its fish and title discoveries.',
            },
          ),
      ],
    });
    return;
  }

  if (subcommand === 'event-help') {
    await interaction.reply(buildFishingEventHelpPanel());
    return;
  }

  if (subcommand === 'event-catalogue') {
    await interaction.deferReply();
    const progress = await getFishingEventCatalogueProgress(config, interaction.user.id);
    await interaction.editReply(buildFishingEventCataloguePanel(progress));
    return;
  }

  if (subcommand === 'expedition-set') {
    const biomeId = interaction.options.getString('biome', true) as FishingBiomeId;
    const durationTier = interaction.options.getInteger('length', true) as FishingDurationTier;
    const requestedCrewSlot = interaction.options.getInteger('crew') ?? undefined;
    await interaction.deferReply();
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const expedition = await startFishingExpedition(
        config,
        interaction.user.id,
        biomeId,
        durationTier,
        interaction.channelId,
        requestedCrewSlot,
        [...member.roles.cache.keys()],
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
        const event = getFishingEvent(expedition.equipment_snapshot?.eventId);
        const durationSeconds = Math.max(0, Math.round((new Date(expedition.completes_at).getTime() - new Date(expedition.started_at).getTime()) / 1_000));
        const displayBiomeName = event?.biomeName ?? biome?.name ?? expedition.biome_id;
        const selectedBiome = event ? ` (event · selected ${biome?.name ?? expedition.biome_id})` : '';
        return `Crew ${expedition.crew_slot}: **${displayBiomeName}**${selectedBiome} · trip duration: **${formatFishingDuration(durationSeconds)}**`;
      }).join('\n')
      : 'No active expeditions.';
    const recent = progress.mostRecent?.result
      ? `Latest: **${getFishingEvent(progress.mostRecent.equipment_snapshot?.eventId)?.biomeName ?? getFishingBiome(progress.mostRecent.biome_id)?.name ?? progress.mostRecent.biome_id}** · ${formatXp(progress.mostRecent.result.fishSaleValue + (progress.mostRecent.result.crateSaleValue ?? 0) + progress.mostRecent.result.knowBucksFound)} KnowBucks earned`
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

async function handleLeagueCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  const group = interaction.options.getSubcommandGroup();
  if (group !== 'skindle') {
    throw new Error(`Unsupported League command group: ${group ?? 'none'}`);
  }

  const subcommand = interaction.options.getSubcommand();
  const currentStatus = () => discordSkindleSessionStore.getStatus(interaction.user.id);
  if (subcommand === 'play') {
    const status = currentStatus();
    const activity = status.solved
      ? `**${interaction.user.username}** has already completed today's Daily Skindle.`
      : `**${interaction.user.username}** is playing today's Daily Skindle.`;
    await interaction.reply({
      components: skindleComponents(config),
      embeds: [
        new EmbedBuilder()
          .setColor(status.solved ? 0x22C55E : 0x0EA5E9)
          .setTitle('Daily Skindle')
          .setDescription(`${activity}\n\nUse \`/league skindle guess\` with an exact skin name to make a guess.`),
      ],
    });
    return;
  }

  if (subcommand === 'status') {
    const status = currentStatus();
    const progress = status.solved
      ? `You have already solved today's Skindle in **${status.guessCount}** ${status.guessCount === 1 ? 'guess' : 'guesses'}. Your private solved card was shown when you completed it.`
      : status.guessCount > 0
        ? `You have made **${status.guessCount}** ${status.guessCount === 1 ? 'guess' : 'guesses'} so far. Use \`/league skindle guess\` to continue.`
        : 'Your daily run is ready. Use `/league skindle guess` with an exact skin name to make your first guess.';
    await interaction.reply({
      components: skindleComponents(config),
      embeds: [
        new EmbedBuilder()
          .setColor(status.solved ? 0x22C55E : 0x0EA5E9)
          .setTitle('Daily Skindle')
          .setDescription(progress),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand !== 'guess') {
    throw new Error(`Unsupported League Skindle command: ${subcommand}`);
  }

  const result = discordSkindleSessionStore.guess(interaction.user.id, interaction.options.getString('skin', true));
  if (result.kind === 'correct') {
    await interaction.reply({
      components: skindleComponents(config),
      embeds: [buildDiscordSkindleSolvedEmbed(interaction.user.username, result)],
      flags: MessageFlags.Ephemeral,
    });
    await interaction.followUp({
      components: skindleComponents(config),
      embeds: [buildDiscordSkindleShareEmbed(interaction.user.username, result)],
    });
    return;
  }

  if (result.kind === 'incorrect') {
    await interaction.reply({
      components: skindleComponents(config),
      embeds: [buildDiscordSkindleGuessEmbed(result)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (result.kind === 'already-solved') {
    await interaction.reply({
      content: `You already solved the ${formatDiscordSkindleDate(result.status.dateKey)} Daily Skindle in ${result.status.guessCount} ${result.status.guessCount === 1 ? 'guess' : 'guesses'}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (result.kind === 'duplicate') {
    await interaction.reply({
      content: `You already guessed **${result.guess.answer}** today. Choose a different skin.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (result.kind === 'ambiguous') {
    await interaction.reply({
      content: `Use an exact skin name. Possible matches: ${result.suggestions.map((suggestion) => `**${suggestion}**`).join(', ')}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: 'I could not find that skin. Use its exact name, such as `Spirit Blossom Ahri`.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCollectionsCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  const guild = interaction.guild;
  if (!guild) return;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'spawn' && !(await isSkinCollectionCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({
      content: 'Collections commands are not enabled in this channel. An administrator can change the Collections commands channel in Discord Configuration. `/collections spawn` remains available to collection administrators in any channel where the bot can post.',
      flags: MessageFlags.Ephemeral,
    });
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
      components: skinCollectionButtons(interaction.user.id, targetUser.id, page.page, page.total, false, page.item?.skin_code ?? null),
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
      await interaction.editReply({ content: `A skin drop was summoned in this channel. Your remaining balance is ${formatXp(result.remainingBalance ?? 0)} KnowBucks. You can summon again <t:${Math.floor(new Date(result.availableAt ?? Date.now()).getTime() / 1_000)}:R>.` });
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
    if (result.status === 'cooldown' && result.availableAt) {
      await interaction.editReply({ content: `Your next regular summon is available <t:${Math.floor(new Date(result.availableAt).getTime() / 1_000)}:R>. Use /collections summon-force to force a drop while this cooldown is active.` });
      return;
    }
    await interaction.editReply({ content: 'Skin claims are not enabled for this channel.' });
    return;
  }

  if (subcommand === 'summon-force') {
    await interaction.deferReply();
    const result = await summonSkinClaimDrop(config, interaction.guild, interaction.channelId, interaction.user.id, true);
    if (result.status === 'spawned') {
      await interaction.editReply({ content: `A skin drop was force-summoned in this channel for ${formatXp(result.cost ?? 0)} KnowBucks. Your remaining balance is ${formatXp(result.remainingBalance ?? 0)} KnowBucks. The next force-summon costs 50% more until the weekly reset.` });
      return;
    }
    if (result.status === 'not-on-cooldown') {
      await interaction.editReply({ content: 'Your regular summon is ready, so use `/collections summon` instead.' });
      return;
    }
    if (result.status === 'insufficient-funds') {
      await interaction.editReply({ content: `You need ${formatXp(result.cost ?? 0)} KnowBucks to force-summon a skin drop. Your balance is ${formatXp(result.remainingBalance ?? 0)} KnowBucks.` });
      return;
    }
    if (result.status === 'active-drop') {
      await interaction.editReply({ content: 'A live skin drop already exists. Wait for it to be claimed or expire before force-summoning another.' });
      return;
    }
    await interaction.editReply({ content: 'Skin claims are not enabled for this channel.' });
    return;
  }

  if (subcommand === 'capacity-add') {
    const slots = interaction.options.getInteger('slots', true);
    await interaction.deferReply();
    try {
      const purchase = await purchaseSkinCollectionCapacity(config, interaction.user.id, slots);
      await interaction.editReply({ content: `Added ${slots} collection slots for ${formatXp(purchase.cost)} KnowBucks. Your capacity is now ${formatXp(purchase.capacity)} and your balance is ${formatXp(purchase.remaining_balance)} KnowBucks.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient KnowBucks balance')) {
        await interaction.editReply({ content: 'You do not have enough KnowBucks for that collection capacity upgrade.' });
        return;
      }
      if (error instanceof Error && error.message.includes('Collection capacity cannot exceed 50 slots')) {
        await interaction.editReply({ content: 'Collection capacity cannot exceed 50 slots.' });
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
    try {
      const capacity = await forceAddSkinCollectionCapacity(config, targetUser.id, interaction.options.getInteger('slots', true));
      await interaction.editReply({ content: `Added collection capacity for ${targetUser}. Their capacity is now ${formatXp(capacity)} slots.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Collection capacity cannot exceed 50 slots')) {
        await interaction.editReply({ content: `${targetUser}'s collection capacity cannot exceed 50 slots.` });
        return;
      }
      throw error;
    }
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

  if (subcommand === 'collection-reorder') {
    const skinCodes = Array.from({ length: 10 }, (_, index) => interaction.options.getInteger(`slot-${index + 1}`));
    const firstMissingSlot = skinCodes.findIndex((skinCode) => skinCode === null);
    const requestedSkinCodes = skinCodes.slice(0, firstMissingSlot < 0 ? skinCodes.length : firstMissingSlot);
    if (!requestedSkinCodes.length || skinCodes.slice(requestedSkinCodes.length).some((skinCode) => skinCode !== null)) {
      await interaction.reply({ content: 'Provide consecutive skin IDs starting with slot 1, with no gaps.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (new Set(requestedSkinCodes).size !== requestedSkinCodes.length) {
      await interaction.reply({ content: 'Use each skin ID only once when reordering your collection.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    try {
      await reorderSkinCollection(config, interaction.user.id, requestedSkinCodes as number[]);
      await interaction.editReply({ content: `Updated the first ${requestedSkinCodes.length} collection slot${requestedSkinCodes.length === 1 ? '' : 's'}.` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('do not own every requested skin')) {
        await interaction.editReply({ content: 'You can only use skin IDs currently in your collection.' });
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
      const result = await gambleSkinClaim(
        config,
        interaction.guild,
        interaction.channelId,
        interaction.user.id,
        skinCode,
        async (gamble) => {
          await interaction.editReply({
            content: `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance. A new skin drop is appearing now.`,
          });
        },
      );
      if (result.status === 'spawned') {
        return;
      }
      if (result.status === 'lost') {
        await interaction.editReply({ content: `**${interaction.user.username}** gambled **${result.skinName}** - #${skinCollectionCode(skinCode)} at a ${result.successChancePercent ?? 25}% chance, but no new skin spawned.` });
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
    const skinName = interaction.options.getString('skin-name');
    const skinCode = interaction.options.getInteger('skin-id');
    if ((skinName && skinCode !== null) || (!skinName && skinCode === null)) {
      await interaction.reply({ content: 'Search by either a skin name or a four-digit KnowLeague ID.' });
      return;
    }
    await interaction.deferReply();
    const result = await findSkinCollectionSearchResult(config, { skinCode, skinName });
    if (!result) {
      await interaction.editReply({ content: 'No matching skin was found in the local KnowLeague catalogue or active collection.' });
      return;
    }
    const owners = await Promise.all(result.claims.map(async (claim) => {
      if (!claim.owner_discord_user_id) return { skinCode: claim.skin_code, username: null };
      try {
        const member = await guild.members.fetch(claim.owner_discord_user_id);
        return { skinCode: claim.skin_code, username: member.user.username };
      } catch {
        return { skinCode: claim.skin_code, username: 'Former member' };
      }
    }));
    await interaction.editReply({ embeds: [buildSkinSearchEmbed(result.skin, owners)] });
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
      const member = interaction.guild
        ? await interaction.guild.members.fetch(preset.ownerDiscordUserId)
        : null;
      const expedition = await startFishingExpedition(
        config,
        preset.ownerDiscordUserId,
        preset.biomeId,
        preset.durationTier,
        interaction.channelId,
        preset.crewSlot,
        member ? [...member.roles.cache.keys()] : [],
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

async function handleClaimedSkinActionButton(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, ownerDiscordUserId, skinCodeText, action] = interaction.customId.split(':');
  if (
    prefix !== SKIN_CLAIM_ACTION_BUTTON_PREFIX
    || !ownerDiscordUserId
    || !/^\d{4}$/.test(skinCodeText ?? '')
    || !['favorite', 'gamble', 'sell'].includes(action ?? '')
  ) return false;
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who claimed this skin can use its collection actions.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const skinCode = Number(skinCodeText);
  await interaction.deferUpdate();
  try {
    if (action === 'favorite') {
      const skinName = await favoriteSkinClaim(config, ownerDiscordUserId, skinCode);
      await interaction.followUp({ content: `**${skinName}** is now first in your collection.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === 'sell') {
      const sale = await sellSkinClaim(config, ownerDiscordUserId, skinCode);
      await interaction.editReply({
        components: [],
        content: `**${interaction.user.username}** sold **${sale.skin_name}** - #${skinCollectionCode(skinCode)} for ${formatXp(sale.amount)} KnowBucks. Their balance is ${formatXp(sale.current_balance)} KnowBucks.`,
        embeds: [],
      });
      return true;
    }

    const result = await gambleSkinClaim(
      config,
      interaction.guild!,
      interaction.channelId,
      ownerDiscordUserId,
      skinCode,
      async (gamble) => {
        await interaction.editReply({
          components: [],
          content: `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance. A new skin drop is appearing now.`,
          embeds: [],
        });
      },
    );
    if (result.status === 'spawned') {
      return true;
    }
    if (result.status === 'lost') {
      await interaction.editReply({
        components: [],
        content: `**${interaction.user.username}** gambled **${result.skinName}** - #${skinCollectionCode(skinCode)} at a ${result.successChancePercent ?? 25}% chance, but no new skin spawned.`,
        embeds: [],
      });
      return true;
    }
    if (result.status === 'active-drop') {
      await interaction.followUp({ content: 'A live skin drop already exists, so this skin was not consumed.' });
      return true;
    }
    await interaction.followUp({ content: 'Skin claims are not enabled for this channel, so this skin was not consumed.' });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
      await interaction.editReply({ components: [], content: 'This skin is no longer in a collection.' });
      await interaction.followUp({ content: 'That skin is no longer in your collection.', flags: MessageFlags.Ephemeral });
      return true;
    }
    throw error;
  }
}

async function refreshSkinCollectionPanel(
  interaction: ButtonInteraction,
  config: DiscordBotConfig,
  viewerDiscordUserId: string,
  ownerDiscordUserId: string,
  requestedPage: number,
  showDetails: boolean,
) {
  const page = await getSkinCollectionPage(config, ownerDiscordUserId, requestedPage);
  const ownerMember = interaction.guild ? await interaction.guild.members.fetch(ownerDiscordUserId).catch(() => null) : null;
  await interaction.editReply({
    components: skinCollectionButtons(viewerDiscordUserId, ownerDiscordUserId, page.page, page.total, showDetails, page.item?.skin_code ?? null),
    embeds: [buildSkinCollectionEmbed(page, ownerMember?.displayName ?? 'Member', showDetails)],
  });
}

async function handleSkinCollectionActionButton(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, viewerDiscordUserId, ownerDiscordUserId, requestedPageText, view, skinCodeText, action] = interaction.customId.split(':');
  if (
    prefix !== SKIN_COLLECTION_ACTION_BUTTON_PREFIX
    || !viewerDiscordUserId
    || !ownerDiscordUserId
    || !/^\d+$/.test(requestedPageText ?? '')
    || !/^\d{4}$/.test(skinCodeText ?? '')
    || (view !== 'details' && view !== 'summary')
    || !['favorite', 'gamble', 'sell'].includes(action ?? '')
  ) return false;
  if (interaction.user.id !== viewerDiscordUserId || viewerDiscordUserId !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the collection owner can use these collection actions.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const skinCode = Number(skinCodeText);
  const requestedPage = Number(requestedPageText);
  await interaction.deferUpdate();
  try {
    let notice: string | null = null;
    let nextPage = requestedPage;
    if (action === 'favorite') {
      const skinName = await favoriteSkinClaim(config, ownerDiscordUserId, skinCode);
      notice = `**${skinName}** is now first in your collection.`;
      nextPage = 0;
    } else if (action === 'sell') {
      const sale = await sellSkinClaim(config, ownerDiscordUserId, skinCode);
      notice = `Sold **${sale.skin_name}** for ${formatXp(sale.amount)} KnowBucks. Your balance is ${formatXp(sale.current_balance)} KnowBucks.`;
    } else {
      const result = await gambleSkinClaim(
        config,
        interaction.guild!,
        interaction.channelId,
        ownerDiscordUserId,
        skinCode,
        async (gamble) => {
          await interaction.followUp({
            content: `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance. A new skin drop is appearing now.`,
          });
        },
      );
      if (result.status === 'spawned') {
        notice = null;
      } else if (result.status === 'lost') {
        notice = `**${interaction.user.username}** gambled **${result.skinName}** - #${skinCollectionCode(skinCode)} at a ${result.successChancePercent ?? 25}% chance, but no new skin spawned.`;
      } else if (result.status === 'active-drop') {
        notice = 'A live skin drop already exists, so this skin was not consumed.';
      } else {
        notice = 'Skin claims are not enabled for this channel, so this skin was not consumed.';
      }
    }
    await refreshSkinCollectionPanel(interaction, config, viewerDiscordUserId, ownerDiscordUserId, nextPage, view === 'details');
    if (notice) {
      await interaction.followUp({ content: notice, ...(action === 'favorite' ? { flags: MessageFlags.Ephemeral } : {}) });
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('do not own a claimed skin')) {
      await refreshSkinCollectionPanel(interaction, config, viewerDiscordUserId, ownerDiscordUserId, requestedPage, view === 'details');
      await interaction.followUp({ content: 'That skin is no longer in your collection.', flags: MessageFlags.Ephemeral });
      return true;
    }
    throw error;
  }
}

export async function handleButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  if (interaction.guildId !== config.guildId) return;
  if (await handleFishingButtonInteraction(interaction, config)) return;
  if (await handleClaimedSkinActionButton(interaction, config)) return;
  if (await handleSkinCollectionActionButton(interaction, config)) return;
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
    components: skinCollectionButtons(viewerDiscordUserId, ownerDiscordUserId, page.page, page.total, view === 'details', page.item?.skin_code ?? null),
    embeds: [buildSkinCollectionEmbed(page, ownerMember?.displayName ?? 'Member', view === 'details')],
  });
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
) {
  if (usesDefaultCommandChannel(interaction.commandName)
    && !(await isDefaultCommandChannel(config, interaction.channelId))) {
    await interaction.reply({
      content: 'This command is only available in the server\'s configured General commands channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
            { name: '/knowbucks coinflip amount', value: 'Wager KnowBucks on a 50/50 coinflip. A win returns double the wager.' },
            { name: '/knowbucks leaderboard [count]', value: 'Show the top 10 current server members by KnowBucks, or request from 1 to 25 members.' },
            { name: '/knowbucks add/remove/set', value: 'Manage a member\'s KnowBucks. Requires a role selected in Discord Configuration.' },
            { name: '/snipe', value: 'Spend 1,000 KnowBucks to show this channel\'s latest cached deleted message.' },
            { name: '/steal-emoji message-id', value: 'Administrator only: import external custom emoji used in a message. A copied message link can target another channel in this server.' },
            { name: '/fish expedition-set biome length [crew]', value: 'Launch one of four level-gated expedition lengths to an unlocked biome. Rod rarity, bait, skills, and permanent relics apply to the saved trip; crew runs take three times as long with normal rewards.' },
            { name: '/fish expedition-progress, shop, inventory', value: 'Check active trips, buy rods, bait, boat upgrades, and skill levels, or use the inventory tabs to inspect relic descriptions and equip an owned rod or bait.' },
            { name: '/fish chests-open, catalogue, help', value: 'Redeem all held legacy chests, browse the biome-filtered field guide, or open focused fishing help. Newly caught crates open automatically during expeditions.' },
            { name: '/collections collection [member]', value: 'Post your own or another current member\'s claimed skin collection for the server to view, one skin at a time. Use Show details to see collection metadata and the skin\'s sell value.' },
            { name: '/collections give member skin-id', value: 'Give one of your claimed skins to another current server member by its four-digit ID.' },
            { name: '/collections summon/summon-force', value: 'Summon a claimable drop for the configured cost (5,000 KnowBucks by default) every four hours, reduced by Haste. While on cooldown, force-summon for 5,000 KnowBucks with a 50% increase per successful force summon until the Monday UTC weekly reset; Cheapskate reduces either cost.' },
            { name: '/collections capacity-add slots', value: 'Buy one or more collection slots for the configured per-slot rate (500 KnowBucks per slot by default), up to 50 total slots. Staff can use `capacity-force-add` for a free member upgrade within that limit.' },
            { name: '/collections steal/favorite/gamble/sell', value: 'Attempt a steal for 3x the configured sell value (with a 30-minute cooldown), choose your first collection item, gamble a skin, or sell one by its four-digit ID. Lucky improves steal and gamble odds, while Money Mouser increases only sale payouts.' },
            { name: '/collections collection-reorder', value: 'Set one to ten consecutive skin IDs as the first collection slots. Favoriting a skin also moves it to slot one.' },
            { name: '/collections search [skin-name] [skin-id]', value: 'Preview a catalogue skin by name or four-digit KnowLeague ID, including its current owner when assigned. The preview cannot be claimed.' },
            { name: '/collections spawn', value: 'Immediately post a skin drop in this channel. Requires a role selected in Discord Configuration.' },
            { name: '/league skindle play/guess/status', value: 'Start a public Daily Skindle activity card, keep clue and solution cards private, and share a spoiler-free result in the channel.' },
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

  if (interaction.commandName === 'league') {
    await handleLeagueCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'knowbucks') {
    await handleKnowBucksCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'snipe') {
    await handleSnipeCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'steal-emoji') {
    await handleStealEmojiCommand(interaction, config);
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
