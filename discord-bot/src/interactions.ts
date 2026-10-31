import { randomInt } from 'node:crypto';
import { ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown, MessageFlags, PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type GuildMember, type Message } from 'discord.js';
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
import {
  attemptRobbery,
  getPlayerShopDisplayCost,
  getPlayerInventory,
  getPlayerShopItem,
  getPlayerShopItems,
  getPlayerShopState,
  getPlayerStats,
  purchasePlayerShopItem,
  type PlayerShopState,
  type PlayerShopTab,
  type PlayerInventory,
  type PlayerStats,
  type RobberyResult,
} from './player.js';
import { getDefaultCommandChannelIds, isDefaultCommandChannel, usesDefaultCommandChannel } from './general-settings.js';
import { getLinkedLeagueAccount, linkLeagueAccount } from './league-accounts.js';
import { formatSnipedMessage, getSnipeImageAttachments, getSnipedMessage } from './snipe.js';
import {
  captureChampionCatalogue,
  captureLeagueAccountViewer,
  ChampionCatalogueSnapshotError,
  getChampionCatalogueSnapshotRequestWeight,
  LEAGUE_ACCOUNT_VIEWER_SNAPSHOT_REQUEST_WEIGHT,
  LeagueAccountViewerSnapshotError,
  normalizeLeagueRiotId,
} from './league-account-viewer.js';
import {
  buildDiscordSkindleGuessEmbed,
  buildDiscordSkindleShareEmbed,
  buildDiscordSkindleSolvedEmbed,
  discordSkindleSessionStore,
  formatDiscordSkindleDate,
} from './skindle.js';
import {
  attachFishingExpeditionMessage,
  canUseFishingSimulation,
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
  getFishingEvent,
  getFishingPlayerState,
  getVisibleFishingShopItems,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingCommandChannelIds,
  purchaseFishingUpgrade,
  isFishingCommandAllowedInChannel,
  isFishingFishCaught,
  equipFishingUpgrade,
  parseFishingRepeatCustomId,
  reconcileDueFishingExpeditions,
  startFishingExpedition,
  simulateFishingExpeditions,
  summarizeFishingSettlement,
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
  formatMiningDuration,
  MINING_DEPTHS,
  MINING_GEAR,
  getMiningBestUpgrade,
  getMiningCraftingRecipe,
  getMiningDepth,
  getMiningGear,
  getMiningResource,
  getMiningUpgrade,
  getMiningUpgrades,
  resolveMiningExpedition,
  type MiningEventAction,
  type MiningExpeditionEventState,
  type MiningDepthId,
  type MiningResourceKind,
  type MiningUpgradeCategory,
} from './mining-catalog.js';
import {
  beginMiningReturn,
  canUseMiningSimulation,
  getActiveMiningExpedition,
  getMiningCatalogueProgress,
  getMiningCommandChannelIds,
  getMiningInventoryByKind,
  getMiningPlayerState,
  getMiningProcessorTier,
  isMiningCommandAllowedInChannel,
  purchaseMiningUpgrade,
  reconcileMiningExpeditionEvent,
  respondToMiningExpeditionEvent,
  sellMiningResource,
  settleDueMiningReturn,
  grantEligibleMiningLevelRoles,
  startMiningExpedition,
  simulateMiningExpeditions,
  syncDiscordMiningTopRole,
  type MiningPlayerState,
  type MiningCatalogueProgress,
} from './mining.js';
import {
  assignWoodcuttingWorker,
  assignWoodcuttingWorkersAutomatically,
  claimWoodcuttingRewards,
  craftWoodcuttingAxe,
  craftWoodcuttingUpgrade,
  formatWoodcuttingClaim,
  formatWoodcuttingRecipe,
  getWoodcuttingAssignmentIssue,
  getWoodcuttingCatalogueProgress,
  getWoodcuttingPlayerState,
  hireWoodcuttingWorker,
  purchaseWoodcuttingSaplings,
  WoodcuttingAssignmentIssueError,
  type WoodcuttingAssignmentIssue,
  type WoodcuttingPlayerState,
} from './woodcutting.js';
import {
  getWoodcuttingAxe,
  getWoodcuttingCritters,
  getWoodcuttingItemName,
  getWoodcuttingSapling,
  getWoodcuttingUpgrade,
  getWoodcuttingUpgrades,
  WOODCUTTING_AXES,
  WOODCUTTING_SAPLINGS,
  WOODCUTTING_WORKER_COSTS,
  type WoodcuttingTier,
} from './woodcutting-catalog.js';
import {
  buildSkinSearchEmbed,
  buildSkinCollectionEmbed,
  COLLECTION_UPKEEP_ALLOCATION_MAXIMUM,
  favoriteSkinClaim,
  findSkinCollectionSearchResult,
  fundSkinCollectionUpkeep,
  forceAddSkinCollectionCapacity,
  forceSkinClaimDrop,
  gambleSkinClaim,
  getSkinClaimAdminRoleIds,
  getSkinCollectionPage,
  getSkinCollectionUpkeepOverview,
  getSkinCollectionCommandChannelIds,
  isSkinCollectionCommandAllowedInChannel,
  purchaseSkinCollectionCapacity,
  reorderSkinCollection,
  sellSkinClaim,
  SKIN_CLAIM_ACTION_BUTTON_PREFIX,
  skinCollectionCode,
  stealSkinClaim,
  summonSkinClaimDrop,
  transferSkinClaim,
  type CollectionSpawnType,
  type CollectionUpkeepOverview,
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

function configuredChannelMentions(channelIds: readonly string[]) {
  return channelIds.map((channelId) => `<#${channelId}>`).join(', ');
}

async function replyWithCommandChannelLink(
  interaction: ChatInputCommandInteraction,
  scope: 'Collections' | 'Fishing' | 'General' | 'Mining',
  channelIds: readonly string[],
) {
  const destination = configuredChannelMentions(channelIds);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('Command unavailable in this channel')
      .setDescription(destination
        ? `${scope} commands are not enabled here. Use them in:\n${destination}`
        : `${scope} commands are not enabled in this channel. An administrator can update Discord Configuration.`)],
    flags: MessageFlags.Ephemeral,
  });
}

const LEAGUE_SNAPSHOT_CAPTURE_WINDOW_MS = 60_000;
const LEAGUE_SNAPSHOT_CAPTURE_WORK_LIMIT = 6;
const LEAGUE_SNAPSHOT_USER_COOLDOWN_MS = 30_000;
const leagueSnapshotCaptureReservations: Array<{ createdAt: number; work: number }> = [];
const leagueSnapshotUserCaptureTimes = new Map<string, number>();

function leagueSnapshotCaptureAvailability(discordUserId: string, requestedWork: number) {
  const now = Date.now();
  while (
    leagueSnapshotCaptureReservations[0]
    && now - leagueSnapshotCaptureReservations[0].createdAt >= LEAGUE_SNAPSHOT_CAPTURE_WINDOW_MS
  ) {
    leagueSnapshotCaptureReservations.shift();
  }
  for (const [userId, lastCaptureAt] of leagueSnapshotUserCaptureTimes) {
    if (now - lastCaptureAt >= LEAGUE_SNAPSHOT_USER_COOLDOWN_MS) {
      leagueSnapshotUserCaptureTimes.delete(userId);
    }
  }

  const priorUserCapture = leagueSnapshotUserCaptureTimes.get(discordUserId);
  if (priorUserCapture && now - priorUserCapture < LEAGUE_SNAPSHOT_USER_COOLDOWN_MS) {
    return Math.ceil((LEAGUE_SNAPSHOT_USER_COOLDOWN_MS - (now - priorUserCapture)) / 1_000);
  }

  const workInWindow = leagueSnapshotCaptureReservations.reduce((total, reservation) => total + reservation.work, 0);
  if (workInWindow + requestedWork > LEAGUE_SNAPSHOT_CAPTURE_WORK_LIMIT) {
    let releasedWork = 0;
    for (const reservation of leagueSnapshotCaptureReservations) {
      releasedWork += reservation.work;
      if (workInWindow - releasedWork + requestedWork <= LEAGUE_SNAPSHOT_CAPTURE_WORK_LIMIT) {
        return Math.max(1, Math.ceil(((reservation.createdAt + LEAGUE_SNAPSHOT_CAPTURE_WINDOW_MS) - now) / 1_000));
      }
    }
    return Math.ceil(LEAGUE_SNAPSHOT_CAPTURE_WINDOW_MS / 1_000);
  }

  leagueSnapshotCaptureReservations.push({ createdAt: now, work: requestedWork });
  leagueSnapshotUserCaptureTimes.set(discordUserId, now);
  return null;
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

function buildCollectionUpkeepEmbed(overview: CollectionUpkeepOverview) {
  const outstandingPayment = overview.outstandingAmount;
  const fundingAfterOutstanding = Math.max(0, overview.combinedFunds - outstandingPayment);
  const coveredPayments = overview.dailyCost > 0
    ? Math.floor(fundingAfterOutstanding / overview.dailyCost)
    : null;
  const dailyCost = formatXp(overview.dailyCost);
  const description = [
    `**Collection size:** ${formatXp(overview.totalSkins)} skin${overview.totalSkins === 1 ? '' : 's'}`,
    `**Daily upkeep:** ${overview.dailyCost > 0 ? `${dailyCost} KnowBucks` : 'Free (the first 10 skins are free)'}`,
    `**Upkeep allocation:** ${formatXp(overview.allocationBalance)} / ${formatXp(COLLECTION_UPKEEP_ALLOCATION_MAXIMUM)} KnowBucks`,
    `**Regular balance:** ${formatXp(overview.regularBalance)} KnowBucks`,
    `**Combined upkeep funds:** ${formatXp(overview.combinedFunds)} KnowBucks`,
    overview.dailyCost > 0
      ? `**Coverage:** ${formatXp(coveredPayments ?? 0)} full daily upkeep payment${coveredPayments === 1 ? '' : 's'}${outstandingPayment > 0 ? ' after the current overdue payment' : ''}.`
      : '**Coverage:** No daily upkeep is due while your collection has 10 or fewer skins.',
    ...(overview.graceExpiresAt
      ? [`**Payment due:** ${formatXp(outstandingPayment)} KnowBucks by <t:${Math.floor(new Date(overview.graceExpiresAt).getTime() / 1_000)}:F> (<t:${Math.floor(new Date(overview.graceExpiresAt).getTime() / 1_000)}:R>).`]
      : []),
    'Allocated KnowBucks are used before your regular balance and cannot be withdrawn.',
  ];

  return new EmbedBuilder()
    .setColor(0xF59E0B)
    .setTitle('Collection upkeep')
    .setDescription(description.join('\n\n'));
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
const MINING_BUTTON_PREFIX = 'mining';
const MINING_EXPEDITION_BUTTON_PREFIX = 'mining-expedition';
const WOODCUTTING_BUTTON_PREFIX = 'woodcutting';
const PLAYER_BUTTON_PREFIX = 'player';
const HELP_BUTTON_PREFIX = 'help';
const FISHING_SHOP_CATEGORIES: readonly FishingUpgradeCategory[] = ['rod', 'bait', 'boat', 'crew'];
const FISHING_INVENTORY_TABS = ['overview', 'rods', 'baits', 'gear', 'boats', 'titles'] as const;
type FishingInventoryTab = typeof FISHING_INVENTORY_TABS[number];
const MINING_SHOP_CATEGORIES: readonly MiningUpgradeCategory[] = ['tool', 'storage', 'processor', 'elevator', 'filter'];
const MINING_INVENTORY_TABS = ['overview', 'ores', 'gems', 'fossils'] as const;
type MiningInventoryTab = typeof MINING_INVENTORY_TABS[number];
const WOODCUTTING_SHOP_TABS = ['workers', 'axes', 'saplings', 'lodging', 'sharpening', 'meals'] as const;
type WoodcuttingShopTab = typeof WOODCUTTING_SHOP_TABS[number];
const WOODCUTTING_INVENTORY_TABS = ['workforce', 'resources', 'finds'] as const;
type WoodcuttingInventoryTab = typeof WOODCUTTING_INVENTORY_TABS[number];
const HELP_TABS = ['general', 'league', 'fishing', 'mining', 'woodcutting', 'collections'] as const;
type HelpTab = typeof HELP_TABS[number];

type HelpField = {
  name: string;
  value: string;
};

function helpTabLabel(tab: HelpTab) {
  return tab === 'general' ? 'General'
    : tab === 'league' ? 'League'
      : tab === 'fishing' ? 'Fishing'
        : tab === 'mining' ? 'Mining'
          : tab === 'woodcutting' ? 'Woodcutting'
            : 'Collections';
}

function helpFields(tab: HelpTab): HelpField[] {
  if (tab === 'league') {
    return [
      { name: '/league account riot-id region', value: 'Post League Account Viewer snapshots for any Riot ID and selected region.' },
      { name: '/league account-link, account-mine', value: 'Save your Riot ID and region privately, then open the linked account without entering them again.' },
      { name: '/league champion champion section', value: 'Post the requested Champion Catalogue image section from the local catalogue.' },
      { name: '/league skindle play', value: 'Post a Daily Skindle activity card with a link to play on KnowLeague.' },
      { name: '/league skindle guess skin', value: 'Submit an exact skin name. Champion names show that champion’s complete skin list.' },
      { name: '/league skindle status', value: 'View your private Daily Skindle progress.' },
    ];
  }
  if (tab === 'fishing') {
    return [
      { name: '/fish expedition-set biome length [crew]', value: 'Launch a Fishing expedition using an available crew slot.' },
      { name: '/fish expedition-progress', value: 'View active expeditions and your latest return; completed trips include Fish again.' },
      { name: '/fish shop', value: 'Browse and buy Fishing rods, bait, boats, and crew contracts.' },
      { name: '/fish inventory', value: 'Inspect owned Fishing equipment and equip a rod or bait.' },
      { name: '/fish catalogue, event-help, event-catalogue', value: 'Browse fish and event discoveries or review active Fishing event rules.' },
      { name: '/fish help', value: 'Open focused Fishing command and progression guidance.' },
    ];
  }
  if (tab === 'mining') {
    return [
      { name: '/mining expedition set depth', value: 'Descend to a tool-gated depth. Mine until your cart fills, then recall it when ready.' },
      { name: '/mining expedition view, return', value: 'Inspect live cart storage or freeze its haul and begin the ascent. Returns settle on your next Mining interaction once the ascent is over.' },
      { name: '/mining shop', value: 'Craft permanent tools, storage, processors, elevator upgrades, and filters. Shared skills are bought in `/player shop`.' },
      { name: '/mining inventory, catalogue', value: 'Browse held Mining resources and equipment, or permanent discoveries at each depth.' },
      { name: '/mining sell resource amount', value: 'Sell a chosen eligible gem or processor-ready ore by quantity or `all`.' },
      { name: '/mining help', value: 'Open focused Mining rules and progression guidance.' },
    ];
  }
  if (tab === 'woodcutting') {
    return [
      { name: '/woodcutting claim', value: 'Claim all work completed since your last claim; Woodcutting never needs an expedition.' },
      { name: '/woodcutting hire, craft-axe, buy-saplings', value: 'Build the worker, axe, and sapling supply needed for continuous chopping.' },
      { name: '/woodcutting assign, assign-auto', value: 'Equip each purchased lumberjack with an available axe and an eligible stocked sapling tier.' },
      { name: '/woodcutting shop, inventory, catalogue', value: 'Review recipes, assignments, owned materials, permanent upgrades, and collected wood, critters, and amber.' },
    ];
  }
  if (tab === 'collections') {
    return [
      { name: '/collections collection [member]', value: 'Browse a current member’s claimed skins and daily upkeep.' },
      { name: '/collections upkeep-view, upkeep-pay amount', value: 'Inspect or permanently reserve KnowBucks for collection upkeep.' },
      { name: '/collections give member skin-id', value: 'Transfer one of your claimed skins to a server member.' },
      { name: '/collections summon, summon-force', value: 'Spend KnowBucks to create a claimable skin drop in the current channel.' },
      { name: '/collections capacity-add slots', value: 'Buy collection capacity; authorized staff can use capacity-force-add.' },
      { name: '/collections steal, favorite, gamble, sell', value: 'Manage an owned skin or risk it for a new drop.' },
      { name: '/collections collection-reorder', value: 'Set up to ten consecutive skin IDs as the first collection slots.' },
      { name: '/collections search [skin-name] [skin-id]', value: 'Preview a local catalogue skin and its current owner, if assigned.' },
      { name: '/collections spawn [type]', value: 'Immediately post a skin, item, rune, or random drop. Requires a Collections administrator role.' },
    ];
  }
  return [
    { name: '/help', value: 'Open this command guide.' },
    { name: '/rc', value: 'Repeat your most recent slash command with the same options.' },
    { name: '/link, /profile', value: 'Link your Discord account to KnowLeague or open your linked public profile.' },
    { name: '/xp view [member]', value: 'View chat level and XP progress for yourself or a member.' },
    { name: '/xp add, /xp set-level', value: 'Manage chat XP. Requires a role selected in Discord Configuration.' },
    { name: '/leaderboard [count]', value: 'Show the server’s active chat-XP leaderboard.' },
    { name: '/knowbucks balance, pay, coinflip, leaderboard', value: 'View, transfer, wager, or rank KnowBucks.' },
    { name: '/knowbucks add, remove, set', value: 'Manage balances. Requires a role selected in Discord Configuration.' },
    { name: '/player stats, inventory, shop', value: 'View progression and equipment, or buy shared skills and robbery equipment.' },
    { name: '/rob user', value: 'Attempt a protected KnowBucks robbery against a current server member.' },
    { name: '/snipe', value: 'Spend 1,000 KnowBucks to show this channel’s latest cached deleted message.' },
    { name: '/steal-emoji message-id', value: 'Administrator only: import external custom emoji from a selected message.' },
  ];
}

function buildHelpPanel(tab: HelpTab) {
  return {
    components: [{
      type: 1 as const,
      components: HELP_TABS.map((entry) => new ButtonBuilder()
        .setCustomId(`${HELP_BUTTON_PREFIX}:${entry}`)
        .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setLabel(helpTabLabel(entry))),
    }],
    embeds: [new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle(`KnowLeague Discord bot help · ${helpTabLabel(tab)}`)
      .setDescription('Choose a category below to browse commands.')
      .addFields(helpFields(tab))],
  };
}
const FISHING_PANEL_TTL_MS = 60_000;
const MINING_PANEL_TTL_MS = 60_000;
const WOODCUTTING_PANEL_TTL_MS = 60_000;
const MINING_EXPEDITION_REFRESH_COOLDOWN_MS = 5_000;
const PLAYER_PANEL_TTL_MS = 60_000;
const leaderboardCommandAvailableAtByUserId = new Map<string, number>();
let leaderboardCommandCooldownPruneAfter = 0;
const fishingPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const miningPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const woodcuttingPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const miningExpeditionRefreshAvailableAtByUserId = new Map<string, number>();
const playerPanelExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  const ownedItemIds = new Set([...state.inventory.map((item) => item.item_id), ...state.playerItemIds]);
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
  const ownedItemIds = new Set([...state.inventory.map((item) => item.item_id), ...state.playerItemIds]);
  const items = getVisibleFishingShopItems(category, [...ownedItemIds]);
  return {
    components: fishingShopComponents(ownerDiscordUserId, category, state, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`Fishing shop · ${fishingShopCategoryLabel(category)}`)
        .setDescription(`${notice ? `${notice}\n\n` : ''}Character level: **${state.chatLevel}** · Fishing level: **${state.fishingLevel}** (${formatXp(state.fishingXpIntoLevel)}/${formatXp(state.fishingXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**`)
        .addFields(items.map((item) => ({
          name: `${ownedItemIds.has(item.id) ? 'Owned · ' : ''}${item.category === 'skill' ? `${getFishingShopSkillEmoji(item.id) ?? ''} ` : ''}${item.name} · ${formatXp(getFishingUpgradeCost(item, [...ownedItemIds]))} KnowBucks`,
          value: `${item.description}${item.requiredFishingLevel ? `\nRequires fishing level **${item.requiredFishingLevel}**.` : ''}${item.requiredUpgradeId ? `\nRequires **${getFishingUpgrade(item.requiredUpgradeId)?.name ?? item.requiredUpgradeId}**.` : ''}`,
        }))),
    ],
  };
}

function miningShopCategoryLabel(category: MiningUpgradeCategory) {
  const labels: Record<MiningUpgradeCategory, string> = {
    tool: 'Tools',
    storage: 'Storage',
    processor: 'Processing',
    elevator: 'Elevator',
    filter: 'Filters',
  };
  return labels[category];
}

function miningInventoryTabLabel(tab: MiningInventoryTab) {
  const labels: Record<MiningInventoryTab, string> = {
    overview: 'Overview',
    ores: 'Ores',
    gems: 'Gems',
    fossils: 'Fossils',
  };
  return labels[tab];
}

function miningPanelExpirationMessage() {
  return 'This mining panel has expired. Run `/mining shop`, `/mining inventory`, or `/mining catalogue` to open a new one.';
}

function scheduleMiningPanelExpiry(message: { edit: (options: { components: []; content: string }) => Promise<unknown>; id: string }, expiresAt: number) {
  const existingTimer = miningPanelExpiryTimers.get(message.id);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    void message.edit({ content: miningPanelExpirationMessage(), components: [] })
      .catch((error: unknown) => console.warn(`Discord mining panel ${message.id} could not be expired.`, error))
      .finally(() => {
        if (miningPanelExpiryTimers.get(message.id) === timer) miningPanelExpiryTimers.delete(message.id);
      });
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref();
  miningPanelExpiryTimers.set(message.id, timer);
}

function clearMiningPanelExpiry(messageId: string) {
  const existingTimer = miningPanelExpiryTimers.get(messageId);
  if (existingTimer) clearTimeout(existingTimer);
  miningPanelExpiryTimers.delete(messageId);
}

function expireMiningPanel(interaction: ButtonInteraction) {
  clearMiningPanelExpiry(interaction.message.id);
  return interaction.update({ content: miningPanelExpirationMessage(), components: [] });
}

function miningUpgradeCandidates(state: MiningPlayerState, category: MiningUpgradeCategory) {
  return getMiningUpgrades(category).filter((upgrade) => (
    !state.ownedUpgradeIds.includes(upgrade.id)
    && (!upgrade.previousUpgradeId || state.ownedUpgradeIds.includes(upgrade.previousUpgradeId))
  ));
}

function miningCanCraftUpgrade(state: MiningPlayerState, upgrade: NonNullable<ReturnType<typeof getMiningUpgrade>>) {
  const recipe = getMiningCraftingRecipe(upgrade, state.skills.cheapskate);
  const processorTier = getMiningProcessorTier(state);
  const inventory = new Map(state.inventory.map((item) => [item.resource_id, item.quantity]));
  const resourceReady = recipe.every((item) => {
    const resource = getMiningResource(item.resourceId);
    return (inventory.get(item.resourceId) ?? 0) >= item.quantity
      && (!resource || resource.kind !== 'ore' || (resource.processorTier ?? 0) <= processorTier);
  });
  return resourceReady;
}

function miningRecipeDescription(upgrade: NonNullable<ReturnType<typeof getMiningUpgrade>>, state: MiningPlayerState) {
  const recipe = getMiningCraftingRecipe(upgrade, state.skills.cheapskate);
  const ingredients = recipe.length === 0
    ? 'No materials required.'
    : recipe.map((item) => `${formatXp(item.quantity)} ${getMiningResource(item.resourceId)?.name ?? item.resourceId}`).join(' · ');
  return `${upgrade.description}\n**Crafting:** ${ingredients}`;
}

function miningShopComponents(ownerDiscordUserId: string, category: MiningUpgradeCategory, state: MiningPlayerState, expiresAt: number) {
  const navigation = MINING_SHOP_CATEGORIES.map((entry) => new ButtonBuilder()
    .setCustomId(`${MINING_BUTTON_PREFIX}-shop:${ownerDiscordUserId}:${expiresAt}:${entry}`)
    .setStyle(entry === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(miningShopCategoryLabel(entry)));
  const purchaseButtons = miningUpgradeCandidates(state, category).map((upgrade) => new ButtonBuilder()
    .setCustomId(`${MINING_BUTTON_PREFIX}-buy:${ownerDiscordUserId}:${expiresAt}:${upgrade.id}`)
    .setStyle(ButtonStyle.Success)
    .setLabel(`Craft ${upgrade.name}`)
    .setDisabled(!miningCanCraftUpgrade(state, upgrade)));
  return [...toComponentRows(navigation), ...toComponentRows(purchaseButtons)];
}

function buildMiningShopPanel(ownerDiscordUserId: string, category: MiningUpgradeCategory, state: MiningPlayerState, expiresAt: number, notice?: string) {
  const candidates = miningUpgradeCandidates(state, category);
  const fields = candidates.length > 0
    ? candidates.map((upgrade) => ({ name: upgrade.name, value: miningRecipeDescription(upgrade, state) }))
    : [{ name: 'No available upgrades', value: 'You own this category’s current upgrade. Continue exploring to unlock the materials for the next one.' }];
  return {
    components: miningShopComponents(ownerDiscordUserId, category, state, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x78716C)
        .setTitle(`Mining shop · ${miningShopCategoryLabel(category)}`)
        .setDescription(`${notice ? `${notice}\n\n` : ''}Balance: **${formatXp(state.balance)} KnowBucks** · Mining Level **${state.miningLevel}**\nShared player skills apply automatically: Luck ${Math.min(4, state.skills.lucky)}/4 · Cheapskate ${state.skills.cheapskate}/4 · Money Mouser ${state.skills.moneyMouser}/2 · Haste ${state.skills.haste}/4. Buy them in \`/player shop\`. Ores from Depth 2 onward need their matching processor before they can be crafted or sold.`)
        .addFields(fields),
    ],
  };
}

function miningInventoryComponents(ownerDiscordUserId: string, tab: MiningInventoryTab, expiresAt: number) {
  return toComponentRows(MINING_INVENTORY_TABS.map((entry) => new ButtonBuilder()
    .setCustomId(`${MINING_BUTTON_PREFIX}-inventory:${ownerDiscordUserId}:${expiresAt}:${entry}`)
    .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(miningInventoryTabLabel(entry))));
}

function splitMiningPanelField(name: string, values: readonly string[], emptyValue: string) {
  if (values.length === 0) return [{ name, value: emptyValue }];
  const fields: Array<{ name: string; value: string }> = [];
  let value = '';
  for (const line of values) {
    const next = value ? `${value}\n${line}` : line;
    if (next.length > 1024 && value) {
      fields.push({ name: fields.length === 0 ? name : `${name} (continued)`, value });
      value = line;
    } else value = next;
  }
  if (value) fields.push({ name: fields.length === 0 ? name : `${name} (continued)`, value });
  return fields;
}

function buildMiningInventoryPanel(ownerDiscordUserId: string, state: MiningPlayerState, expiresAt: number, tab: MiningInventoryTab = 'overview', notice?: string, readOnly = false) {
  const tool = getMiningBestUpgrade(state.ownedUpgradeIds, 'tool');
  const storage = getMiningBestUpgrade(state.ownedUpgradeIds, 'storage');
  const processor = getMiningBestUpgrade(state.ownedUpgradeIds, 'processor');
  const elevator = getMiningBestUpgrade(state.ownedUpgradeIds, 'elevator');
  const filter = getMiningBestUpgrade(state.ownedUpgradeIds, 'filter');
  const relics = state.passiveGearItemIds
    .map((itemId) => getMiningGear(itemId)?.name ?? getFishingUpgrade(itemId)?.name ?? itemId)
    .join(', ') || 'None';
  const inventorySummary = `${notice ? `${notice}\n\n` : ''}Mining level: **${state.miningLevel}** (${formatXp(state.miningXpIntoLevel)}/${formatXp(state.miningXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**`;
  let fields: Array<{ inline?: boolean; name: string; value: string }>;
  if (tab === 'overview') {
    fields = [
      { name: 'Equipment', value: `Tool: **${tool?.name ?? 'None'}** (${tool?.value ?? 0} stone/s)\nStorage: **${storage?.name ?? 'None'}** (${formatXp(storage?.value ?? 0)} items)\nProcessor: **${processor ? `Depth ${processor.value + 1}` : 'None'}**\nElevator: **${elevator?.name ?? 'None'}**\nFilter: **${filter?.name ?? 'None'}**`, inline: true },
      {
        name: 'Progression',
        value: `Relics: **${relics}**\nShared skills: Luck ${Math.min(4, state.skills.lucky)}/4 · Cheapskate ${state.skills.cheapskate}/4 · Money Mouser ${state.skills.moneyMouser}/2 · Haste ${state.skills.haste}/4`,
        inline: true,
      },
    ];
  } else {
    const kind: MiningResourceKind = tab === 'ores' ? 'ore' : tab === 'gems' ? 'gem' : 'fossil';
    const processorTier = getMiningProcessorTier(state);
    const lines = getMiningInventoryByKind(state, kind).map(({ resource, quantity }) => {
      const processingNote = resource.kind === 'ore' && (resource.processorTier ?? 0) > processorTier
        ? ` · needs Depth ${resource.processorTier} Processor`
        : '';
      return `**${resource.name}** ×${formatXp(quantity)}${processingNote}`;
    });
    fields = splitMiningPanelField(tab === 'ores' ? 'Ores' : tab === 'gems' ? 'Gems' : 'Fossil pieces', lines, `No ${tab} collected yet.`);
  }
  return {
    components: readOnly ? [] : miningInventoryComponents(ownerDiscordUserId, tab, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x78716C)
        .setTitle(`Mining inventory · ${miningInventoryTabLabel(tab)}`)
        .addFields(fields)
        .setDescription(inventorySummary),
    ],
  };
}

function miningCatalogueComponents(ownerDiscordUserId: string, depthId: MiningDepthId, expiresAt: number) {
  return toComponentRows(MINING_DEPTHS.map((depth) => new ButtonBuilder()
    .setCustomId(`${MINING_BUTTON_PREFIX}-catalogue:${ownerDiscordUserId}:${expiresAt}:${depth.id}`)
    .setStyle(depth.id === depthId ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(`Depth ${depth.id}`)));
}

/** Displays durable Mining discoveries, so sold or crafted materials stay catalogued. */
export function buildMiningCataloguePanel(
  ownerDiscordUserId: string,
  depthId: MiningDepthId,
  expiresAt: number,
  progress: MiningCatalogueProgress,
) {
  const depth = getMiningDepth(depthId);
  if (!depth) throw new Error('Mining catalogue depth is invalid.');
  const resourceStatus = (resourceId: string) => progress.acquiredResourceIds.has(resourceId) ? '✅ Acquired' : '⬜ Not acquired';
  const gearStatus = (itemId: string) => progress.acquiredGearItemIds.has(itemId) ? '✅ Found' : '⬜ Not found';
  const gear = MINING_GEAR.filter((item) => item.depth === depthId);

  return {
    components: miningCatalogueComponents(ownerDiscordUserId, depthId, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x78716C)
        .setTitle(`Mining catalogue · Depth ${depth.id}: ${depth.name}`)
        .setDescription('✅ marks resources or relics acquired at least once. Progress remains after resources are crafted or sold.')
        .addFields(
          { name: 'Ores', value: depth.ores.map((item) => `${resourceStatus(item.id)} — **${item.name}**`).join('\n'), inline: true },
          { name: 'Gems', value: depth.gems.map((item) => `${resourceStatus(item.id)} — **${item.name}**`).join('\n'), inline: true },
          // Discord places up to three inline fields on a row. This full-width spacer
          // keeps the fossil and relic fields on a second, two-column row.
          { name: '\u200B', value: '\u200B', inline: false },
          { name: 'Fossil fragments', value: depth.fossils.map((item) => `${resourceStatus(item.id)} — **${item.name}**`).join('\n'), inline: true },
          {
            name: 'Relics',
            value: gear.length > 0
              ? gear.map((item) => `${gearStatus(item.id)} — **${item.name}**`).join('\n')
              : 'No relics can be found at this depth.',
            inline: true,
          },
        ),
    ],
  };
}

function formatMiningCargo(result: { cargo: Array<{ name: string; quantity: number }>; stoneStored?: number }) {
  const contents = [
    ...(result.stoneStored ? [`**Stone** ×${formatXp(result.stoneStored)} · discarded on return`] : []),
    ...result.cargo.map((item) => `**${item.name}** ×${formatXp(item.quantity)}`),
  ];
  return contents.length > 0 ? contents.join('\n') : 'No cargo yet.';
}

function formatMiningRelics(result: { gearItems?: Array<{ itemId: string; quantity: number }> }) {
  const relics = result.gearItems ?? [];
  return relics.length
    ? relics.map((item) => `**${getMiningGear(item.itemId)?.name ?? getFishingUpgrade(item.itemId)?.name ?? item.itemId}**`).join('\n')
    : null;
}

function miningEventPanel(event: MiningExpeditionEventState) {
  const secondsLeft = event.expiresAt ? Math.max(0, new Date(event.expiresAt).getTime() - Date.now()) : 0;
  const responseWindow = `**${formatMiningDuration(secondsLeft)}** remaining`;
  switch (event.id) {
    case 'lost-temple': return {
      actions: [['attempt-relic', 'Attempt relic'] as const, ['continue', 'Leave it'] as const],
      text: `You found a Lost Temple with a sacred relic inside. Failing the 10% grab destroys this expedition. ${responseWindow}`,
      title: 'Lost Temple',
    };
    case 'ore-vein': return { actions: [['claim-ores', 'Secure ores'] as const], text: `You found a fragile ore cluster. Secure it to fill the rest of your cart with ores from this depth or below. ${responseWindow}`, title: 'Ore Vein' };
    case 'gem-cluster': return { actions: [['claim-gems', 'Secure gems'] as const], text: `You found an unstable cavern full of gems. Secure it to fill the rest of your Gem Bag. ${responseWindow}`, title: 'Gem Cluster' };
    case 'damaged-gear': return { actions: [['repair', 'Make repairs'] as const], text: `Your gear is damaged. Repair it now or mining speed is halved for the rest of this expedition. ${responseWindow}`, title: 'Damaged Gear' };
    case 'arcane-rift': return { actions: [['enter-rift', 'Enter rift'] as const], text: `A strange, fading rift leads to the top of the mine. Enter now to return instantly. ${responseWindow}`, title: 'Arcane Rift' };
    case 'energy-crystals': return { actions: [['claim-crystals', 'Claim crystals'] as const], text: `You found energized crystals. Claim them to mine 100% faster for the rest of this expedition. ${responseWindow}`, title: 'Energy Crystals' };
    case 'old-dynamite': return { actions: [['trigger-dynamite', 'Trigger dynamite'] as const], text: `You found old dynamite. Trigger it to fill the minecart with ores; you can still fill your Gem Bag. ${responseWindow}`, title: 'Old Dynamite' };
    case 'quantum-fluctuations': return { actions: [['embrace-fluctuations', 'Embrace rift'] as const], text: `The caves look different. Embrace the fluctuations for recursively upgradeable 5% ore and gem rolls. ${responseWindow}`, title: 'Quantum Fluctuations' };
  }
}

function reserveMiningExpeditionRefresh(discordUserId: string) {
  const now = Date.now();
  const availableAt = miningExpeditionRefreshAvailableAtByUserId.get(discordUserId) ?? 0;
  if (availableAt > now) return Math.ceil((availableAt - now) / 1_000);
  miningExpeditionRefreshAvailableAtByUserId.set(discordUserId, now + MINING_EXPEDITION_REFRESH_COOLDOWN_MS);
  return null;
}

function miningExpeditionComponents(ownerDiscordUserId: string, mode: 'launched' | 'view' | 'returning', depthId?: MiningDepthId, event?: MiningExpeditionEventState | null) {
  if (mode === 'returning') {
    if (!depthId) return [];
    return toComponentRows([
      new ButtonBuilder()
        .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:refresh:${ownerDiscordUserId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Refresh'),
      new ButtonBuilder()
        .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:repeat:${ownerDiscordUserId}:${depthId}`)
        .setStyle(ButtonStyle.Success)
        .setLabel('Mine again'),
    ]);
  }
  const buttons = [
    ...(mode === 'launched'
      ? [new ButtonBuilder()
        .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:view:${ownerDiscordUserId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('View minecart')]
      : []),
    new ButtonBuilder()
      .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:refresh:${ownerDiscordUserId}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Refresh'),
    new ButtonBuilder()
      .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:return:${ownerDiscordUserId}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Recall minecart'),
  ];
  const activeEvent = event?.status === 'active' ? miningEventPanel(event) : null;
  return toComponentRows([
    ...(activeEvent ? activeEvent.actions.map(([action, label]) => new ButtonBuilder()
      .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:event:${ownerDiscordUserId}:${action}`)
      .setStyle(action === 'continue' ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setLabel(label)) : []),
    ...buttons,
  ]);
}

/** Shared by slash-command replies and website-originated Discord panels. */
export function buildMiningLaunchPanel(ownerDiscordUserId: string, depthId: MiningDepthId, travelDurationMs: number) {
  const depth = getMiningDepth(depthId);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x78716C)
        .setTitle(`⛏️ ${depth?.name ?? `Depth ${depthId}`} expedition launched`)
        .setDescription(`Your minecart is descending. Descent duration: **${formatMiningDuration(travelDurationMs)}**. Collection continues until you recall the cart or its storage fills.`),
    ],
    components: miningExpeditionComponents(ownerDiscordUserId, 'launched'),
  };
}

function buildMiningReturnEmbed(result: { cargo: Array<{ name: string; quantity: number }>; discardedStone: number; gearItems?: Array<{ itemId: string; quantity: number }>; miningXpAwarded: number; stoneStored: number; storageUsed: number }, ascentDurationMs: number) {
  const relics = formatMiningRelics(result);
  return new EmbedBuilder()
    .setColor(0x78716C)
    .setTitle('Minecart recalled')
    .setDescription(`Your cargo is secured and the minecart is ascending. Ascent duration: **${formatMiningDuration(ascentDurationMs)}**. Rewards are added on your next Mining interaction after it arrives.`)
    .addFields(
      { name: `Secured cargo · ${formatXp(result.storageUsed)} stored`, value: formatMiningCargo(result) },
      { name: 'Expedition work', value: `${formatXp(result.discardedStone)} stone filtered out · ${formatXp(result.miningXpAwarded)} Mining XP secured` },
      ...(relics ? [{ name: 'Relics secured', value: relics }] : []),
    );
}

/** Shared by slash-command replies and website-originated Discord panels. */
export function buildMiningReturnPanel(
  ownerDiscordUserId: string,
  depthId: MiningDepthId,
  result: { cargo: Array<{ name: string; quantity: number }>; discardedStone: number; gearItems?: Array<{ itemId: string; quantity: number }>; miningXpAwarded: number; stoneStored: number; storageUsed: number },
  ascentDurationMs: number,
) {
  return {
    embeds: [buildMiningReturnEmbed(result, ascentDurationMs)],
    components: miningExpeditionComponents(ownerDiscordUserId, 'returning', depthId),
  };
}

/** Shared by the completed website-result share flow and Discord presentation. */
export function buildMiningCompletedPanel(
  ownerDiscordUserId: string,
  depthId: MiningDepthId,
  result: { cargo: Array<{ name: string; quantity: number }>; discardedStone: number; gearItems?: Array<{ itemId: string; quantity: number }>; miningXpAwarded: number; stoneStored: number; storageUsed: number },
) {
  const depth = getMiningDepth(depthId);
  const relics = formatMiningRelics(result);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x22C55E)
        .setTitle(`⛏️ ${depth?.name ?? `Depth ${depthId}`} expedition complete`)
        .setDescription('Your minecart returned safely and its cargo was added to inventory.')
        .addFields(
          { name: `Collected · ${formatXp(result.storageUsed)} stored`, value: formatMiningCargo(result) },
          { name: 'Expedition work', value: `${formatXp(result.discardedStone)} stone filtered out · ${formatXp(result.miningXpAwarded)} Mining XP earned` },
          ...(relics ? [{ name: 'Relics found', value: relics }] : []),
        ),
    ],
    components: toComponentRows([
      new ButtonBuilder()
        .setCustomId(`${MINING_EXPEDITION_BUTTON_PREFIX}:repeat:${ownerDiscordUserId}:${depthId}`)
        .setStyle(ButtonStyle.Success)
        .setLabel('Mine again'),
    ]),
  };
}

function buildMiningSettlementEmbed(settlement: NonNullable<Awaited<ReturnType<typeof settleDueMiningReturn>>>) {
  const relics = formatMiningRelics(settlement.result);
  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setTitle('Mining return complete')
    .setDescription(`Your minecart cargo was added to inventory. Earned **${formatXp(settlement.xpAwarded)} Mining XP** · Level **${settlement.currentLevel}**${settlement.currentLevel > settlement.previousLevel ? ' (level up!)' : ''}.`)
    .addFields(
      { name: 'Collected', value: formatMiningCargo(settlement.result) },
      ...(relics ? [{ name: 'Relics found', value: relics }] : []),
    );
}

function buildMiningProgressEmbed(username: string, expedition: NonNullable<Awaited<ReturnType<typeof getActiveMiningExpedition>>>) {
  const depth = getMiningDepth(expedition.depth);
  const now = Date.now();
  if (expedition.status === 'descending' && new Date(expedition.mining_started_at).getTime() > now) {
    return new EmbedBuilder()
      .setColor(0x78716C)
      .setTitle(`${username}'s mining expedition`)
      .setDescription(`Descending toward **${depth?.name ?? `Depth ${expedition.depth}`}**. Descent duration: **${formatMiningDuration(expedition.equipment_snapshot.descendDurationMs)}**.`);
  }
  if (expedition.status === 'returning') {
    const result = expedition.result ?? (expedition.return_started_at
      ? resolveMiningExpedition(
        expedition.depth,
        expedition.equipment_snapshot,
        expedition.outcome_seed,
        Math.max(0, new Date(expedition.return_started_at).getTime() - new Date(expedition.mining_started_at).getTime()),
        expedition.event_state ?? undefined,
        new Date(expedition.mining_started_at).getTime(),
      )
      : null);
    const relics = result ? formatMiningRelics(result) : null;
    return new EmbedBuilder()
      .setColor(0x78716C)
      .setTitle(`${username}'s mining expedition`)
      .setDescription(`Returning from **${depth?.name ?? `Depth ${expedition.depth}`}**. Ascent duration: **${formatMiningDuration(expedition.equipment_snapshot.descendDurationMs)}**.`)
      .addFields(
        { name: `Secured cargo · ${formatXp(result?.storageUsed ?? 0)} stored`, value: result ? formatMiningCargo(result) : 'Cargo is being secured.' },
        ...(relics ? [{ name: 'Relics secured', value: relics }] : []),
      );
  }
  const result = resolveMiningExpedition(
    expedition.depth,
    expedition.equipment_snapshot,
    expedition.outcome_seed,
    Math.max(0, now - new Date(expedition.mining_started_at).getTime()),
    expedition.event_state ?? undefined,
    new Date(expedition.mining_started_at).getTime(),
  );
  const activeEvent = expedition.event_state?.status === 'active' ? miningEventPanel(expedition.event_state) : null;
  return new EmbedBuilder()
    .setColor(0x78716C)
    .setTitle(`${username}'s mining expedition`)
    .setDescription(`Mining in **${depth?.name ?? `Depth ${expedition.depth}`}** with **${getMiningUpgrade(expedition.equipment_snapshot.toolId)?.name ?? expedition.equipment_snapshot.toolId}**. Recall with \`/mining expedition return\` when you are ready.`)
    .addFields(
      { name: `Minecart storage · ${formatXp(result.storageUsed)}/${formatXp(expedition.equipment_snapshot.storageCapacity)}`, value: formatMiningCargo(result) },
      { name: 'Expedition work', value: `${formatXp(result.stoneBroken)} stone broken · ${formatXp(result.discardedStone)} stone filtered out · ${formatXp(result.miningXpAwarded)} Mining XP on return` },
      ...(activeEvent ? [{ name: `Event · ${activeEvent.title}`, value: activeEvent.text }] : []),
      ...(expedition.event_state?.status === 'expired' && expedition.event_state.id === 'lost-temple'
        ? [{ name: 'Lost Temple', value: 'The traps destroyed this expedition. Recall the minecart to return with no cargo.' }]
        : []),
    );
}

function playerPanelExpirationMessage() {
  return 'This player panel has expired. Run `/player shop` or `/player stats` to open a new one.';
}

function schedulePlayerPanelExpiry(message: { edit: (options: { components: []; content: string }) => Promise<unknown>; id: string }, expiresAt: number) {
  const existingTimer = playerPanelExpiryTimers.get(message.id);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    void message.edit({ content: playerPanelExpirationMessage(), components: [] })
      .catch((error: unknown) => console.warn(`Discord player panel ${message.id} could not be expired.`, error))
      .finally(() => {
        if (playerPanelExpiryTimers.get(message.id) === timer) playerPanelExpiryTimers.delete(message.id);
      });
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref();
  playerPanelExpiryTimers.set(message.id, timer);
}

function clearPlayerPanelExpiry(messageId: string) {
  const existingTimer = playerPanelExpiryTimers.get(messageId);
  if (existingTimer) clearTimeout(existingTimer);
  playerPanelExpiryTimers.delete(messageId);
}

function expirePlayerPanel(interaction: ButtonInteraction) {
  clearPlayerPanelExpiry(interaction.message.id);
  return interaction.update({ content: playerPanelExpirationMessage(), components: [] });
}

function playerShopTabLabel(tab: PlayerShopTab) {
  return tab === 'skills' ? 'Skills' : 'Equipment';
}

function playerShopComponents(ownerDiscordUserId: string, tab: PlayerShopTab, state: PlayerShopState, expiresAt: number) {
  const navigation = (['skills', 'items'] as const).map((entry) => new ButtonBuilder()
    .setCustomId(`${PLAYER_BUTTON_PREFIX}-shop:${ownerDiscordUserId}:${expiresAt}:tab:${entry}`)
    .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(playerShopTabLabel(entry)));
  const ownedItemIds = new Set(state.itemIds);
  const purchaseButtons = getPlayerShopItems(tab, state.itemIds).map((item) => {
    const cost = getPlayerShopDisplayCost(item, state.pricingItemIds);
    const requiredItemId = 'category' in item ? item.requiredUpgradeId : undefined;
    const missingRequiredItem = Boolean(requiredItemId && !ownedItemIds.has(requiredItemId));
    const permanentlyOwned = !('replenishable' in item && item.replenishable) && ownedItemIds.has(item.id);
    return new ButtonBuilder()
      .setCustomId(`${PLAYER_BUTTON_PREFIX}-shop:${ownerDiscordUserId}:${expiresAt}:buy:${item.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(`Buy ${item.name} (${formatXp(cost)})`)
      .setDisabled(permanentlyOwned || missingRequiredItem || state.balance < cost);
  });
  return [...toComponentRows(navigation), ...toComponentRows(purchaseButtons)];
}

function buildPlayerShopPanel(ownerDiscordUserId: string, tab: PlayerShopTab, state: PlayerShopState, expiresAt: number, notice?: string) {
  const ownedItemIds = new Set(state.itemIds);
  const items = getPlayerShopItems(tab, state.itemIds);
  const skillSummary = `Lucky ${state.skillLevels.lucky}/5 · Haste ${state.skillLevels.haste}/4 · Cheapskate ${state.skillLevels.cheapskate}/4 · Money Mouser ${state.skillLevels.moneyMouser}/2`;
  return {
    components: playerShopComponents(ownerDiscordUserId, tab, state, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle(`Player shop · ${playerShopTabLabel(tab)}`)
        .setDescription(`${notice ? `${notice}\n\n` : ''}Balance: **${formatXp(state.balance)} KnowBucks**\n${tab === 'skills'
          ? `Current levels: **${skillSummary}**.`
          : ''}`)
        .addFields(items.map((item) => {
          const skillEmoji = tab === 'skills' ? getFishingShopSkillEmoji(item.id) : undefined;
          return {
            name: `${ownedItemIds.has(item.id) && item.id !== 'bodyguard' ? 'Owned · ' : ''}${skillEmoji ? `${skillEmoji} ` : ''}${item.name} · ${formatXp(getPlayerShopDisplayCost(item, state.pricingItemIds))} KnowBucks`,
            value: item.description,
          };
        })),
    ],
  };
}

type PlayerInventoryTab = 'equipment' | 'fishing-gear' | 'mining-gear';

const PLAYER_INVENTORY_TABS: readonly PlayerInventoryTab[] = ['equipment', 'fishing-gear', 'mining-gear'];

function playerInventoryTabLabel(tab: PlayerInventoryTab) {
  if (tab === 'fishing-gear') return 'Fishing relics';
  return tab === 'mining-gear' ? 'Mining relics' : 'Equipment';
}

function playerInventoryComponents(
  viewerDiscordUserId: string,
  targetDiscordUserId: string,
  tab: PlayerInventoryTab,
  expiresAt: number,
) {
  return [{
    type: 1 as const,
    components: PLAYER_INVENTORY_TABS.map((entry) => new ButtonBuilder()
      .setCustomId(`${PLAYER_BUTTON_PREFIX}-inventory:${viewerDiscordUserId}:${expiresAt}:${entry}:${targetDiscordUserId}`)
      .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setLabel(playerInventoryTabLabel(entry))),
  }];
}

function buildPlayerInventoryPanel(
  viewerDiscordUserId: string,
  targetDiscordUserId: string,
  targetDisplayName: string,
  inventory: PlayerInventory,
  tab: PlayerInventoryTab,
  expiresAt: number,
) {
  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(`${targetDisplayName}'s inventory · ${playerInventoryTabLabel(tab)}`);

  if (tab === 'equipment') {
    embed.setDescription(inventory.equipment.length > 0
      ? 'Purchased player-shop equipment.'
      : 'No player-shop equipment purchased yet.');
    if (inventory.equipment.length > 0) {
      embed.addFields(inventory.equipment.map(({ item, quantity }) => ({
        name: item.id === 'bodyguard' ? `${item.name} · ${formatXp(quantity)} charges` : item.name,
        value: item.description,
      })));
    }
  } else {
    const gear = tab === 'fishing-gear' ? inventory.fishingGear : inventory.miningGear;
    const gameLabel = tab === 'fishing-gear' ? 'Fishing' : 'Mining';
    embed.setDescription(gear.length > 0
      ? `${gameLabel} relics are permanent and activate automatically where their effect applies.`
      : `No ${gameLabel.toLowerCase()} relics found yet.`);
    if (gear.length > 0) {
      embed.addFields(gear.map(({ item, quantity }) => ({
        name: quantity > 1 ? `${item.name} · x${formatXp(quantity)}` : item.name,
        value: item.description,
      })));
    }
  }

  return {
    components: playerInventoryComponents(viewerDiscordUserId, targetDiscordUserId, tab, expiresAt),
    embeds: [embed],
  };
}

type PlayerStatsTab = 'stats' | 'skills';

function playerStatsComponents(viewerDiscordUserId: string, targetDiscordUserId: string, tab: PlayerStatsTab, expiresAt: number) {
  return [{
    type: 1 as const,
    components: (['stats', 'skills'] as const).map((entry) => new ButtonBuilder()
      .setCustomId(`${PLAYER_BUTTON_PREFIX}-stats:${viewerDiscordUserId}:${expiresAt}:${entry}:${targetDiscordUserId}`)
      .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setLabel(entry === 'stats' ? 'Stats' : 'Skills')),
  }];
}

function buildPlayerStatsPanel(
  viewerDiscordUserId: string,
  targetDiscordUserId: string,
  targetDisplayName: string,
  stats: PlayerStats,
  tab: PlayerStatsTab,
  expiresAt: number,
) {
  const title = `${targetDisplayName}'s player ${tab}`;
  const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(title);
  if (tab === 'stats') {
    embed
      .setDescription('More player statistics will be added here as new bot systems are released.')
      .addFields(
        { name: 'Chat', value: `Level **${stats.chat.level}** · **${formatXp(stats.chat.totalXp)}** total XP\n**${formatXp(stats.chat.xpIntoLevel)}/${formatXp(stats.chat.xpForNextLevel)} XP**`, inline: true },
        { name: 'KnowBucks', value: `**${formatXp(stats.balance)} KnowBucks**`, inline: true },
        { name: 'Fishing', value: `Level **${stats.fishing.level}** · **${formatXp(stats.fishing.totalXp)}** Fishing XP`, inline: true },
      );
  } else {
    embed
      .setDescription('Player skills are permanent upgrades that apply automatically wherever their effect is supported.')
      .addFields(
        { name: 'Lucky', value: `Level **${stats.skills.lucky}/5**\n+2% robbery chance per level; -1% robbery chance against you per level.`, inline: false },
        { name: 'Haste', value: `Level **${stats.skills.haste}/4**\n-5% robbery cooldown per level.`, inline: false },
        { name: 'Cheapskate', value: `Level **${stats.skills.cheapskate}/4**\n-5% Fishing shop cost per level.`, inline: false },
        { name: 'Money Mouser', value: `Level **${stats.skills.moneyMouser}/2**\n+10% Fishing payout per level.`, inline: false },
      );
  }
  return {
    components: playerStatsComponents(viewerDiscordUserId, targetDiscordUserId, tab, expiresAt),
    embeds: [embed],
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
  readOnly = false,
) {
  const equipment = describeFishingEquipment(state.equipment);
  const sharedDescription = `${notice ? `${notice}\n\n` : ''}Character level: **${state.chatLevel}** · Fishing level: **${state.fishingLevel}** (${formatXp(state.fishingXpIntoLevel)}/${formatXp(state.fishingXpToNextLevel)} XP) · Balance: **${formatXp(state.balance)} KnowBucks**`;
  const embed = new EmbedBuilder()
    .setColor(0x0EA5E9)
    .setTitle(`Fishing inventory · ${fishingInventoryTabLabel(tab)}`);

  if (tab === 'overview') {
    embed
      .setDescription(sharedDescription)
      .addFields(
        { name: 'Equipped', value: `Rod: **${equipment.rod}**\nBait: **${equipment.bait}**`, inline: true },
        { name: 'Progression', value: `Crew slots: **${state.crewSlots}**\nRelics: **${equipment.relics}**`, inline: true },
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
    components: readOnly ? [] : fishingInventoryComponents(ownerDiscordUserId, state, expiresAt, tab),
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
    && (!entry.foundBiomeIds || entry.foundBiomeIds.includes(biomeId)))
    .sort((left, right) => Number(Boolean(left.foundBiomeIds)) - Number(Boolean(right.foundBiomeIds)) || left.name.localeCompare(right.name));
  return {
    components: fishingCatalogueComponents(ownerDiscordUserId, biomeId, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x0EA5E9)
        .setTitle(`Fishing catalogue · ${biome.name}`)
        .setDescription(`${biome.description}\n✅ marks fish you have caught and relics you have found. ⬜ marks entries still to discover.`)
        .addFields(
          ...splitFishingPanelField('Fish caught', fish.map((entry) => `${isFishingFishCaught(progress, entry) ? '✅ Caught' : '⬜ Not caught'} — **${entry.name}** (${entry.rarity})`), 'No fish recorded.').map((field) => ({ ...field, inline: true })),
          ...splitFishingPanelField('Relics found', gear.map((entry) => `${progress.ownedGearItemIds.has(entry.id) ? '✅ Found' : '⬜ Not found'} — **${entry.name}**`), 'No relics recorded.').map((field) => ({ ...field, inline: true })),
        ),
    ],
  };
}

function buildFishingSimulationPanel(biomeId: FishingBiomeId, durationTier: FishingDurationTier, results: Awaited<ReturnType<typeof simulateFishingExpeditions>>['results']) {
  const catches = new Map<string, number>();
  const relics = new Map<string, number>();
  let knowBucks = 0;
  let xp = 0;
  let crateCount = 0;
  for (const result of results) {
    knowBucks += result.fishSaleValue + result.crateSaleValue + result.knowBucksFound;
    xp += result.fishingXpAwarded;
    for (const catchItem of result.catches) {
      if (catchItem.kind === 'gear') relics.set(catchItem.name, (relics.get(catchItem.name) ?? 0) + catchItem.quantity);
      else {
        catches.set(catchItem.name, (catches.get(catchItem.name) ?? 0) + catchItem.quantity);
        if (catchItem.kind === 'crate') crateCount += catchItem.quantity;
      }
    }
  }
  const biome = getFishingBiome(biomeId);
  const topCatches = [...catches.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8).map(([name, quantity]) => `**${name}** ×${formatXp(quantity)}`);
  const relicSummary = [...relics.entries()].map(([name, quantity]) => `**${name}** ×${formatXp(quantity)}`);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x0EA5E9)
      .setTitle(`Fishing simulation · ${biome?.name ?? biomeId}`)
      .setDescription(`**${formatXp(results.length)}** length-${durationTier} expeditions resolved instantly. This testing panel is read-only: no rewards, XP, inventory, expedition, or Genesys Loop relaunches were created.`)
      .addFields(
        { name: 'Total simulated return', value: `**${formatXp(knowBucks)} KnowBucks** · **${formatXp(xp)} Fishing XP** · **${formatXp(crateCount)}** automatic crate opening${crateCount === 1 ? '' : 's'}`, inline: true },
        { name: 'Relics found', value: relicSummary.join('\n') || 'None', inline: true },
        { name: 'Most common returns', value: topCatches.join('\n') || 'No catches.', inline: false },
      )],
  };
}

function buildMiningSimulationPanel(depthId: MiningDepthId, results: Awaited<ReturnType<typeof simulateMiningExpeditions>>['results']) {
  const cargo = new Map<string, number>();
  const relics = new Map<string, number>();
  let xp = 0;
  let stone = 0;
  for (const result of results) {
    xp += result.miningXpAwarded;
    stone += result.stoneStored;
    for (const item of result.cargo) cargo.set(item.name, (cargo.get(item.name) ?? 0) + item.quantity);
    for (const item of result.gearItems ?? []) {
      const name = getMiningGear(item.itemId)?.name ?? item.itemId;
      relics.set(name, (relics.get(name) ?? 0) + item.quantity);
    }
  }
  const depth = getMiningDepth(depthId);
  const topCargo = [...cargo.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 10).map(([name, quantity]) => `**${name}** ×${formatXp(quantity)}`);
  const relicSummary = [...relics.entries()].map(([name, quantity]) => `**${name}** ×${formatXp(quantity)}`);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x78716C)
      .setTitle(`Mining simulation · Depth ${depthId}: ${depth?.name ?? 'Unknown'}`)
      .setDescription(`**${formatXp(results.length)}** full-cart expeditions resolved instantly. This testing panel is read-only: no rewards, XP, inventory, or expedition state was created.`)
      .addFields(
        { name: 'Total simulated return', value: `**${formatXp(xp)} Mining XP** · **${formatXp(stone)} Stone**`, inline: true },
        { name: 'Relics found', value: relicSummary.join('\n') || 'None', inline: true },
        { name: 'Cargo', value: topCargo.join('\n') || 'No cargo.', inline: false },
      )],
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

async function getCurrentNonBotMember(interaction: ChatInputCommandInteraction, userId: string) {
  if (!interaction.guild) return null;
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  return member && !member.user.bot ? member : null;
}

async function handlePlayerCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'shop') {
    await interaction.deferReply();
    const state = await getPlayerShopState(config, interaction.user.id);
    const expiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    await interaction.editReply(buildPlayerShopPanel(interaction.user.id, 'skills', state, expiresAt));
    schedulePlayerPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const targetMember = await getCurrentNonBotMember(interaction, targetUser.id);
  if (!targetMember) {
    await interaction.reply({ content: 'Choose a current server member who is not a bot.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === 'inventory') {
    await interaction.deferReply();
    const inventory = await getPlayerInventory(config, targetUser.id);
    const expiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    await interaction.editReply(buildPlayerInventoryPanel(
      interaction.user.id,
      targetUser.id,
      targetMember.displayName,
      inventory,
      'equipment',
      expiresAt,
    ));
    schedulePlayerPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  if (subcommand === 'stats') {
    await interaction.deferReply();
    const stats = await getPlayerStats(config, targetUser.id);
    const expiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    await interaction.editReply(buildPlayerStatsPanel(interaction.user.id, targetUser.id, targetMember.displayName, stats, 'stats', expiresAt));
    schedulePlayerPanelExpiry(await interaction.fetchReply(), expiresAt);
    return;
  }

  throw new Error(`Unsupported player command: ${subcommand}`);
}

function robberyCooldownRelativeTime(value: string | null) {
  if (!value) return 'shortly';
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? `<t:${Math.floor(milliseconds / 1_000)}:R>` : 'shortly';
}

function robberyBodyguardDetail(targetUser: { toString(): string }, result: RobberyResult) {
  return result.bodyguardUsed
    ? `\n${targetUser}’s Bodyguard used a charge (**${formatXp(result.bodyguardCharges)}** remaining).`
    : '';
}

async function handleRobCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  const targetUser = interaction.options.getUser('user', true);
  if (targetUser.bot) {
    await interaction.reply({ content: 'Bot accounts cannot be robbed.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: 'You cannot rob yourself.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await getCurrentNonBotMember(interaction, targetUser.id))) {
    await interaction.reply({ content: 'You can only rob a current server member.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();
  try {
    const result = await attemptRobbery(config, interaction.user.id, targetUser.id);
    if (result.outcome === 'cooldown') {
      await interaction.editReply({ content: `Your next robbery attempt is available ${robberyCooldownRelativeTime(result.cooldownAvailableAt)}.` });
      return;
    }
    if (result.outcome === 'target-empty') {
      await interaction.editReply({ content: `${targetUser} has no KnowBucks available to rob. No cooldown was used.` });
      return;
    }

    const robberIdentity = result.masked ? 'An unknown robber' : `${interaction.user}`;
    if (result.outcome === 'success') {
      const outcome = result.stolenAmount > 0
        ? `${robberIdentity} robbed ${targetUser} for **${formatXp(result.stolenAmount)} KnowBucks** (${result.theftPercent}% outcome).`
        : `${robberIdentity} got past ${targetUser}’s defenses, but their Safe protected every available KnowBuck.`;
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle(result.stolenAmount > 0 ? 'Robbery succeeded' : 'Robbery found no unprotected funds')
            .setDescription(`${outcome}${robberyBodyguardDetail(targetUser, result)}\nRobber balance: **${formatXp(result.robberBalance)} KnowBucks**. Next attempt: ${robberyCooldownRelativeTime(result.cooldownAvailableAt)}.`),
        ],
      });
      return;
    }

    const failureIdentity = result.revealed ? `${interaction.user}` : robberIdentity;
    const loss = result.failurePenalty > 0
      ? `${failureIdentity} failed to rob ${targetUser} and forfeited **${formatXp(result.failurePenalty)} KnowBucks** to them.`
      : `${failureIdentity} failed to rob ${targetUser}, but had no KnowBucks to forfeit.`;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xEF4444)
          .setTitle('Robbery failed')
          .setDescription(`${loss}${robberyBodyguardDetail(targetUser, result)}\nRobber balance: **${formatXp(result.robberBalance)} KnowBucks**. Next attempt: ${robberyCooldownRelativeTime(result.cooldownAvailableAt)}.`),
      ],
    });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('Unable to complete robbery:')
      ? 'That robbery could not be completed. Please try again shortly.'
      : 'That robbery could not be completed. Please try again shortly.';
    await interaction.editReply({ content: message });
  }
}

async function handleFishingCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  if (!(await isFishingCommandAllowedInChannel(config, interaction.channelId))) {
    await replyWithCommandChannelLink(interaction, 'Fishing', await getFishingCommandChannelIds(config));
    return;
  }
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'simulate') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!(await canUseFishingSimulation(config, [...member.roles.cache.keys()]))) {
      await interaction.reply({ content: 'Fishing simulation is limited to roles selected in Discord Configuration.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const biomeId = interaction.options.getString('biome', true) as FishingBiomeId;
      const durationTier = interaction.options.getInteger('length', true) as FishingDurationTier;
      const runs = interaction.options.getInteger('x', true);
      const simulation = await simulateFishingExpeditions(config, interaction.user.id, biomeId, durationTier, runs, [...member.roles.cache.keys()]);
      await interaction.editReply(buildFishingSimulationPanel(biomeId, durationTier, simulation.results));
    } catch (error) {
      await interaction.editReply({ content: error instanceof Error ? error.message : 'Fishing simulation could not be completed.', embeds: [] });
    }
    return;
  }

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
              value: '`/fish shop` spends KnowBucks on rods, bait, boat upgrades, and crew contracts. Use `/player shop` for shared player skills.',
            },
            {
              name: 'Inventory, crates, and catalogue',
              value: '`/fish inventory` has focused equipment, relic-description, and boat tabs. Crates open automatically during expeditions, while `/fish catalogue` tracks fish catches and found relics by biome.',
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
      ? `Latest: **${getFishingEvent(progress.mostRecent.equipment_snapshot?.eventId)?.biomeName ?? getFishingBiome(progress.mostRecent.biome_id)?.name ?? progress.mostRecent.biome_id}** · ${formatXp(progress.mostRecent.result.fishSaleValue + (progress.mostRecent.result.crateSaleValue ?? 0) + progress.mostRecent.result.knowBucksFound)} KnowBucks earned · ${summarizeFishingSettlement(progress.mostRecent.result)}`
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
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const viewingAnotherPlayer = targetUser.id !== interaction.user.id;
    const state = await getFishingPlayerState(config, targetUser.id);
    const expiresAt = Date.now() + FISHING_PANEL_TTL_MS;
    await interaction.editReply(buildFishingInventoryTabbedPanel(interaction.user.id, state, expiresAt, 'overview', viewingAnotherPlayer ? `Viewing **${escapeMarkdown(targetUser.username)}**'s inventory. Equipment controls are available only in your own inventory.` : undefined, viewingAnotherPlayer));
    if (!viewingAnotherPlayer) scheduleFishingPanelExpiry(await interaction.fetchReply(), expiresAt);
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

function woodcuttingCommandErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'KnowLeague could not complete that Woodcutting request. Please try again shortly.';
  const message = error.message.replace(/^Unable to (initialize Discord Woodcutting|load Woodcutting [a-z ]+|claim Woodcutting rewards|hire a lumberjack|buy Woodcutting saplings|craft a Woodcutting (axe|upgrade)|assign the lumberjack|auto-assign lumberjacks): /, '');
  return message.includes('PostgREST') || message.includes('permission denied') || message.includes('relation')
    ? 'KnowLeague could not complete that Woodcutting request. Please try again shortly.'
    : message;
}

function woodcuttingCommandErrorReply(error: unknown, action: string) {
  const reply = woodcuttingCommandErrorMessage(error);
  if (reply === 'KnowLeague could not complete that Woodcutting request. Please try again shortly.') {
    const details = typeof error === 'object' && error !== null ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
    console.error('Woodcutting request failed.', {
      action,
      code: typeof details.code === 'string' ? details.code : undefined,
      errorName: typeof details.name === 'string' ? details.name : typeof error,
      message: typeof details.message === 'string' ? details.message : undefined,
    });
  }
  return reply;
}

function woodcuttingAxeSummary(axes: readonly { id: number; tier: WoodcuttingTier }[]) {
  if (!axes.length) return 'No crafted axes yet.';
  return [1, 2, 3, 4, 5, 6, 7].flatMap((tier) => {
    const matching = axes.filter((axe) => axe.tier === tier);
    return matching.length ? [`**${getWoodcuttingAxe(tier)?.name ?? `Tier ${tier}`}** ×${formatXp(matching.length)} (${matching.map((axe) => `#${axe.id}`).join(', ')})`] : [];
  }).join('\n');
}

function woodcuttingAssignmentIssuePanel(issue: WoodcuttingAssignmentIssue) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xDC2626)
        .setTitle('Woodcutting assignment unavailable')
        .setDescription(issue.message)
        .addFields([
          { name: 'Available axes', value: woodcuttingAxeSummary(issue.availableAxes) },
          ...(issue.command ? [{ name: 'Next command', value: `\`${issue.command}\`` }] : []),
        ]),
    ],
  };
}

function buildWoodcuttingClaimPanel(username: string, result: Awaited<ReturnType<typeof claimWoodcuttingRewards>>['result']) {
  const consumed = result.saplingsConsumed.length
    ? result.saplingsConsumed.map((entry) => `${getWoodcuttingItemName(entry.itemId)} ×${formatXp(entry.quantity)}`).join(' · ')
    : 'No saplings consumed.';
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x166534)
        .setTitle(`🌲 ${username}'s Woodcutting claim`)
        .setDescription(formatWoodcuttingClaim(result))
        .addFields(
          { name: 'Trees chopped', value: `${formatXp(result.finishedChops)} finished · ${formatXp(result.successfulChops)} successful`, inline: true },
          { name: 'Saplings used', value: consumed, inline: true },
        ),
    ],
  };
}

function woodcuttingPanelExpirationMessage() {
  return 'This Woodcutting panel has expired. Run `/woodcutting shop` or `/woodcutting inventory` to open a new one.';
}

function scheduleWoodcuttingPanelExpiry(message: { edit: (options: { components: []; content: string }) => Promise<unknown>; id: string }, expiresAt: number) {
  const existingTimer = woodcuttingPanelExpiryTimers.get(message.id);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    void message.edit({ content: woodcuttingPanelExpirationMessage(), components: [] })
      .catch((error: unknown) => console.warn(`Discord Woodcutting panel ${message.id} could not be expired.`, error))
      .finally(() => {
        if (woodcuttingPanelExpiryTimers.get(message.id) === timer) woodcuttingPanelExpiryTimers.delete(message.id);
      });
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref();
  woodcuttingPanelExpiryTimers.set(message.id, timer);
}

function clearWoodcuttingPanelExpiry(messageId: string) {
  const existingTimer = woodcuttingPanelExpiryTimers.get(messageId);
  if (existingTimer) clearTimeout(existingTimer);
  woodcuttingPanelExpiryTimers.delete(messageId);
}

function expireWoodcuttingPanel(interaction: ButtonInteraction) {
  clearWoodcuttingPanelExpiry(interaction.message.id);
  return interaction.update({ content: woodcuttingPanelExpirationMessage(), components: [] });
}

function woodcuttingShopTabLabel(tab: WoodcuttingShopTab) {
  const labels: Record<WoodcuttingShopTab, string> = {
    workers: 'Workers',
    axes: 'Axes',
    saplings: 'Saplings',
    lodging: 'Lodging',
    sharpening: 'Sharpening',
    meals: 'Meals',
  };
  return labels[tab];
}

function woodcuttingInventoryTabLabel(tab: WoodcuttingInventoryTab) {
  const labels: Record<WoodcuttingInventoryTab, string> = {
    workforce: 'Workforce',
    resources: 'Saplings & Wood',
    finds: 'Critters & Amber',
  };
  return labels[tab];
}

function woodcuttingShopComponents(ownerDiscordUserId: string, tab: WoodcuttingShopTab, expiresAt: number) {
  return toComponentRows(WOODCUTTING_SHOP_TABS.map((entry) => new ButtonBuilder()
    .setCustomId(`${WOODCUTTING_BUTTON_PREFIX}-shop:${ownerDiscordUserId}:${expiresAt}:${entry}`)
    .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(woodcuttingShopTabLabel(entry))));
}

function woodcuttingInventoryComponents(ownerDiscordUserId: string, tab: WoodcuttingInventoryTab, expiresAt: number) {
  return toComponentRows(WOODCUTTING_INVENTORY_TABS.map((entry) => new ButtonBuilder()
    .setCustomId(`${WOODCUTTING_BUTTON_PREFIX}-inventory:${ownerDiscordUserId}:${expiresAt}:${entry}`)
    .setStyle(entry === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setLabel(woodcuttingInventoryTabLabel(entry))));
}

function woodcuttingUpgradeLines(state: WoodcuttingPlayerState, category: 'lodging' | 'meal' | 'sharpening') {
  return getWoodcuttingUpgrades(category).map((upgrade) => `${state.ownedUpgradeIds.includes(upgrade.id) ? '✅ ' : ''}**${upgrade.name}** — ${formatWoodcuttingRecipe(upgrade.recipe)}\n${upgrade.description}`).join('\n\n');
}

export function buildWoodcuttingShopPanel(ownerDiscordUserId: string, state: WoodcuttingPlayerState, expiresAt: number, tab: WoodcuttingShopTab) {
  const nextWorkerCost = WOODCUTTING_WORKER_COSTS[state.workers.length];
  const axes = WOODCUTTING_AXES.map((axe) => `**T${axe.tier} · ${axe.name}** — ${formatWoodcuttingRecipe(axe.recipe)}`).join('\n');
  const saplings = WOODCUTTING_SAPLINGS.map((sapling) => `**T${sapling.tier} · ${sapling.name}** — ${formatXp(sapling.saplingCost)} KnowBucks · ${sapling.woodName}${sapling.processorUpgradeId ? ` · ${sapling.processorUpgradeId.replace('processor-depth-', 'Resource ')} Processor` : ''}`).join('\n');
  const fields = tab === 'workers'
    ? [
      { name: 'Lumberjack roster', value: `You have **${state.workers.length}/10** lumberjacks. ${nextWorkerCost ? `Your next lumberjack costs **${formatXp(nextWorkerCost)} KnowBucks**${state.workers.length === 0 ? ' and includes a Quartz Axe' : ''}.` : 'All ten lumberjacks are hired.'}` },
      { name: 'Purchase command', value: '`/woodcutting hire`' },
    ]
    : tab === 'axes'
      ? [{ name: 'Individual worker axes', value: axes }, { name: 'Craft command', value: '`/woodcutting craft-axe tier:<1–7>`' }]
      : tab === 'saplings'
        ? [{ name: 'Sapling stock', value: saplings }, { name: 'Purchase command', value: '`/woodcutting buy-saplings type:<sapling type> quantity:<amount>` · Each type stores up to 1,000,000.' }]
        : tab === 'lodging'
          ? [{ name: 'Lodging upgrades', value: woodcuttingUpgradeLines(state, 'lodging') }, { name: 'Craft command', value: '`/woodcutting craft-upgrade upgrade:<lodging upgrade>`' }]
          : tab === 'sharpening'
            ? [{ name: 'Sharpening Station', value: woodcuttingUpgradeLines(state, 'sharpening') }, { name: 'Craft command', value: '`/woodcutting craft-upgrade upgrade:<Sharpening Station tier>`' }]
            : [{ name: 'Permanent meals', value: woodcuttingUpgradeLines(state, 'meal') }, { name: 'Craft command', value: '`/woodcutting craft-upgrade upgrade:<meal>`' }];
  return {
    components: woodcuttingShopComponents(ownerDiscordUserId, tab, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x166534)
        .setTitle(`Woodcutting shop · ${woodcuttingShopTabLabel(tab)}`)
        .setDescription(`Balance: **${formatXp(state.balance)} KnowBucks** · Lumberjacks: **${state.workers.length}/10**`)
        .addFields(fields),
    ],
  };
}

export function buildWoodcuttingInventoryPanel(ownerDiscordUserId: string, username: string, state: WoodcuttingPlayerState, expiresAt: number, tab: WoodcuttingInventoryTab) {
  const inventory = new Map(state.inventory.map((entry) => [entry.item_id, entry.quantity]));
  const workers = state.workers.length
    ? state.workers.map((worker) => `**#${worker.workerNumber}** — ${worker.axeTier ? getWoodcuttingAxe(worker.axeTier)?.name : 'Unassigned axe'}${worker.saplingTier ? ` → ${getWoodcuttingSapling(worker.saplingTier)?.name}` : ''}`).join('\n')
    : 'No lumberjacks hired. Your first hire includes a Quartz Axe.';
  const saplings = WOODCUTTING_SAPLINGS.map((sapling) => `**${sapling.name}** ×${formatXp(inventory.get(sapling.id) ?? 0)}`).join('\n');
  const woods = WOODCUTTING_SAPLINGS.map((sapling) => `**${sapling.woodName}** ×${formatXp(inventory.get(sapling.woodItemId) ?? 0)}`).join('\n');
  const critters = [1, 2, 3, 4, 5, 6, 7].flatMap((tier) => getWoodcuttingCritters(tier as WoodcuttingTier).map((critter) => ({ ...critter, tier }))).filter((critter) => (inventory.get(critter.id) ?? 0) > 0);
  const critterFields = critters.length
    ? Array.from({ length: Math.ceil(critters.length / 14) }, (_, index) => ({
      name: index === 0 ? 'Critters' : 'Critters (continued)',
      value: critters.slice(index * 14, (index + 1) * 14).map((critter) => `**${critter.name}** ×${formatXp(inventory.get(critter.id) ?? 0)}`).join('\n'),
      inline: false,
    }))
    : [{ name: 'Critters', value: 'No critters collected yet.', inline: false }];
  const amber = WOODCUTTING_SAPLINGS.map((sapling) => `${getWoodcuttingItemName(sapling.amberItemId)} ×${formatXp(inventory.get(sapling.amberItemId) ?? 0)}`).join('\n');
  const fields = tab === 'workforce'
    ? [
      { name: 'Lumberjacks', value: workers, inline: true },
      { name: 'Axes', value: woodcuttingAxeSummary(state.axes), inline: true },
      { name: 'Permanent upgrades', value: state.ownedUpgradeIds.length ? state.ownedUpgradeIds.map((id) => getWoodcuttingUpgrade(id)?.name ?? id).join('\n') : 'No upgrades crafted yet.', inline: true },
    ]
    : tab === 'resources'
      ? [{ name: 'Saplings', value: saplings, inline: true }, { name: 'Wood', value: woods, inline: true }]
      : [...critterFields, { name: 'Amber finds', value: amber, inline: true }];
  return {
    components: woodcuttingInventoryComponents(ownerDiscordUserId, tab, expiresAt),
    embeds: [
      new EmbedBuilder()
        .setColor(0x166534)
        .setTitle(`${username}'s Woodcutting inventory · ${woodcuttingInventoryTabLabel(tab)}`)
        .setDescription(`Last claim started from **${new Date(state.lastClaimedAt).toLocaleString()}**. Claim again whenever you want with \`/woodcutting claim\`.`)
        .addFields(fields),
    ],
  };
}

function buildWoodcuttingCataloguePanel(progress: Awaited<ReturnType<typeof getWoodcuttingCatalogueProgress>>) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x166534)
        .setTitle('Woodcutting catalogue')
        .setDescription('✅ marks wood, critters, and amber found at least once.')
        .addFields(([1, 2, 3, 4, 5, 6, 7] as const).map((tier) => {
          const sapling = getWoodcuttingSapling(tier)!;
          const status = (itemId: string) => progress.discoveredItemIds.has(itemId) ? '✅' : '⬜';
          return {
            name: `Tier ${tier} · ${sapling.woodName}`,
            value: `${status(sapling.woodItemId)} **${sapling.woodName}**\n${getWoodcuttingCritters(tier).map((critter) => `${status(critter.id)} ${critter.name}`).join(' · ')}\n${status(sapling.amberItemId)} **${getWoodcuttingItemName(sapling.amberItemId)}**`,
          };
        })),
    ],
  };
}

async function handleWoodcuttingCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'assign') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const workerNumber = interaction.options.getInteger('worker', true);
      const axeTier = interaction.options.getInteger('axe-tier', true) as WoodcuttingTier;
      const saplingTier = interaction.options.getInteger('sapling-tier', true) as WoodcuttingTier;
      const currentState = await getWoodcuttingPlayerState(config, interaction.user.id);
      const issue = getWoodcuttingAssignmentIssue(currentState, workerNumber, axeTier, saplingTier);
      if (issue) {
        await interaction.editReply(woodcuttingAssignmentIssuePanel(issue));
        return;
      }
      await assignWoodcuttingWorker(config, interaction.user.id, workerNumber, axeTier, saplingTier);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Lumberjack assigned').setDescription(`Lumberjack **#${workerNumber}** now uses **${getWoodcuttingAxe(axeTier)?.name}** on **${getWoodcuttingSapling(saplingTier)?.name}**.\nClaim any time with \`/woodcutting claim\`.`)] });
    } catch (error) {
      await interaction.editReply(error instanceof WoodcuttingAssignmentIssueError
        ? woodcuttingAssignmentIssuePanel(error.issue)
        : { content: woodcuttingCommandErrorReply(error, 'assign'), embeds: [] });
    }
    return;
  }

  await interaction.deferReply();
  try {
    if (subcommand === 'help') {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x166534)
          .setTitle('KnowLeague Woodcutting help')
          .setDescription('Woodcutting is continuous: assigned lumberjacks work while you are away, and rewards are calculated only when you claim or make a production change.')
          .addFields(
            { name: 'Build a crew', value: '`/woodcutting hire` buys a lumberjack. The first costs 500 KnowBucks and includes a Quartz Axe; later workers require separately crafted axes before they can work.' },
            { name: 'Equip workers', value: '`/woodcutting assign worker axe-tier sapling-tier` equips one lumberjack. Axe and Resource Processor gates apply. `/woodcutting assign-auto` uses the highest owned axes on the highest stocked eligible saplings.' },
            { name: 'Supply and claim', value: '`/woodcutting buy-saplings type quantity` lists each sapling type (up to 1,000,000 per type). Every finished chop uses a sapling unless Sap-Saver’s Stew preserves it; use `/woodcutting claim` for wood, critters, and amber.' },
            { name: 'Progression', value: '`/woodcutting craft-axe` creates individual worker tools. `/woodcutting craft-upgrade` creates lodging, Sharpening Station, and permanent meal upgrades. `/woodcutting shop`, `inventory`, and `catalogue` show the full state.' },
          )],
      });
      return;
    }
    if (subcommand === 'claim') {
      const settlement = await claimWoodcuttingRewards(config, interaction.user.id);
      await interaction.editReply(buildWoodcuttingClaimPanel(interaction.user.username, settlement.result));
      return;
    }
    if (subcommand === 'hire') {
      const hired = await hireWoodcuttingWorker(config, interaction.user.id);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Lumberjack hired').setDescription(`Hired lumberjack **#${hired.worker_number}** for **${formatXp(hired.cost)} KnowBucks**.${hired.starter_axe_id ? ` They received your starter **Quartz Axe #${hired.starter_axe_id}**; assign it with \`/woodcutting assign\`.` : ' Craft an axe and assign it before they can work.'}`)] });
      return;
    }
    if (subcommand === 'craft-axe') {
      const crafted = await craftWoodcuttingAxe(config, interaction.user.id, interaction.options.getInteger('tier', true) as WoodcuttingTier);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Axe crafted').setDescription(`Crafted **${crafted.axe.name} #${crafted.axeId}**. Assign it to a lumberjack with \`/woodcutting assign\`.`)] });
      return;
    }
    if (subcommand === 'buy-saplings') {
      const bought = await purchaseWoodcuttingSaplings(config, interaction.user.id, interaction.options.getInteger('type', true) as WoodcuttingTier, interaction.options.getInteger('quantity', true));
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Saplings purchased').setDescription(`Bought **${formatXp(interaction.options.getInteger('quantity', true))} ${bought.sapling.name}** for **${formatXp(bought.cost)} KnowBucks**. New balance: **${formatXp(bought.balance)} KnowBucks**.`)] });
      return;
    }
    if (subcommand === 'assign-auto') {
      const assigned = await assignWoodcuttingWorkersAutomatically(config, interaction.user.id);
      const state = await getWoodcuttingPlayerState(config, interaction.user.id);
      const axesById = new Map(state.axes.map((axe) => [axe.id, axe]));
      const saplingQuantities = new Map(state.inventory.map((item) => [item.item_id, item.quantity]));
      const assignmentText = assigned.assignments.length ? assigned.assignments.map((entry) => {
        const sapling = getWoodcuttingSapling(entry.sapling_tier);
        return `Lumberjack #${entry.worker_number}: **${getWoodcuttingAxe(axesById.get(entry.axe_id)?.tier ?? 1)?.name ?? `Axe #${entry.axe_id}`}** → **${sapling?.name}** (${formatXp(saplingQuantities.get(sapling?.id ?? '') ?? 0)} left)`;
      }).join('\n') : 'No assignment was possible. Buy saplings and make sure you have axes.';
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Lumberjacks auto-assigned').setDescription(assignmentText)] });
      return;
    }
    if (subcommand === 'craft-upgrade') {
      const crafted = await craftWoodcuttingUpgrade(config, interaction.user.id, interaction.options.getString('upgrade', true));
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x166534).setTitle('Woodcutting upgrade crafted').setDescription(`Crafted **${crafted.upgrade.name}**. ${crafted.upgrade.description}`)] });
      return;
    }
    if (subcommand === 'shop') {
      const state = await getWoodcuttingPlayerState(config, interaction.user.id);
      const expiresAt = Date.now() + WOODCUTTING_PANEL_TTL_MS;
      await interaction.editReply(buildWoodcuttingShopPanel(interaction.user.id, state, expiresAt, 'workers'));
      scheduleWoodcuttingPanelExpiry(await interaction.fetchReply(), expiresAt);
      return;
    }
    if (subcommand === 'inventory') {
      const state = await getWoodcuttingPlayerState(config, interaction.user.id);
      const expiresAt = Date.now() + WOODCUTTING_PANEL_TTL_MS;
      await interaction.editReply(buildWoodcuttingInventoryPanel(interaction.user.id, interaction.user.username, state, expiresAt, 'workforce'));
      scheduleWoodcuttingPanelExpiry(await interaction.fetchReply(), expiresAt);
      return;
    }
    if (subcommand === 'catalogue') {
      await interaction.editReply(buildWoodcuttingCataloguePanel(await getWoodcuttingCatalogueProgress(config, interaction.user.id)));
      return;
    }
    throw new Error(`Unsupported Woodcutting command: ${subcommand}`);
  } catch (error) {
    await interaction.editReply({ content: woodcuttingCommandErrorReply(error, subcommand), embeds: [] });
  }
}

function miningCommandErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'KnowLeague could not complete that mining request. Please try again shortly.';
  const message = error.message
    .replace(/^Unable to (initialize Discord mining|load Discord mining [a-z ]+|start Discord mining expedition|recall mining expedition|secure mining expedition results|settle mining expedition|craft mining upgrade|sell mining resources): /, '');
  return message.includes('PostgREST') || message.includes('permission denied') || message.includes('relation')
    ? 'KnowLeague could not complete that mining request. Please try again shortly.'
    : message;
}

async function handleMiningCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  if (!interaction.guild) return;
  if (!(await isMiningCommandAllowedInChannel(config, interaction.channelId))) {
    await replyWithCommandChannelLink(interaction, 'Mining', await getMiningCommandChannelIds(config));
    return;
  }
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'simulate') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!(await canUseMiningSimulation(config, [...member.roles.cache.keys()]))) {
      await interaction.reply({ content: 'Mining simulation is limited to roles selected in Discord Configuration.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const depthId = interaction.options.getInteger('depth', true) as MiningDepthId;
      const runs = interaction.options.getInteger('x', true);
      const simulation = await simulateMiningExpeditions(config, interaction.user.id, depthId, runs);
      await interaction.editReply(buildMiningSimulationPanel(depthId, simulation.results));
    } catch (error) {
      await interaction.editReply({ content: miningCommandErrorMessage(error), embeds: [] });
    }
    return;
  }
  await interaction.deferReply();
  try {
    const settlement = await settleDueMiningReturn(config, interaction.user.id);
    if (settlement) {
      await grantEligibleMiningLevelRoles(config, await interaction.guild.members.fetch(interaction.user.id), settlement.currentLevel);
      void syncDiscordMiningTopRole(config, interaction.guild)
        .catch((error: unknown) => console.error('Discord Mining top-role synchronization failed after settlement.', error));
    }

    if (subcommand === 'help') {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x78716C)
            .setTitle('KnowLeague mining help')
            .setDescription('Mine indefinitely at a chosen depth until you recall the cart.')
            .addFields(
              { name: 'Start and recall', value: '`/mining expedition set depth:<1–7>` begins the descent. Tool upgrades gate deeper depths. Once the cart reaches depth, `/mining expedition return` freezes its cargo and begins the ascent.' },
              { name: 'Track the cart', value: '`/mining expedition view` shows descent, current storage, or secured return cargo with Refresh and Recall minecart buttons. Refresh is limited to once every five seconds. A completed return settles on your next Mining interaction.' },
              { name: 'Crafting and processing', value: '`/mining shop` has tabs for tools, storage, processors, elevators, and filters. Ores from Depth 2 onward need the matching processor before crafting or sale.' },
              { name: 'Inventory, catalogue, and sales', value: '`/mining inventory` tabs held ores, gems, and five collectible dinosaur fossils per depth. `/mining catalogue` records every ore, gem, fossil fragment, and relic acquired at each depth. `/mining sell resource:<ore or gem> amount:<number or all>` sells one processor-ready resource at a time.' },
              { name: 'Skills and levels', value: 'Mining XP is earned from expedition work and is displayed for now without unlock gates. Shared Luck, Cheapskate, Money Mouser, and Haste skills from `/player shop` apply automatically.' },
            ),
        ],
      });
      return;
    }

    if (group === 'expedition' && subcommand === 'set') {
      const depthId = interaction.options.getInteger('depth', true) as MiningDepthId;
      const started = await startMiningExpedition(config, interaction.user.id, depthId);
      await interaction.editReply(buildMiningLaunchPanel(interaction.user.id, started.depth.id, started.travelDurationMs));
      return;
    }

    if (group === 'expedition' && subcommand === 'view') {
      const active = await reconcileMiningExpeditionEvent(config, interaction.user.id);
      if (!active) {
        await interaction.editReply({
          embeds: settlement
            ? [buildMiningSettlementEmbed(settlement)]
            : [new EmbedBuilder().setColor(0x78716C).setTitle(`${interaction.user.username}'s mining expedition`).setDescription('No active minecart expedition. Start one with `/mining expedition set`.')],
        });
        return;
      }
      await interaction.editReply({
        embeds: [buildMiningProgressEmbed(interaction.user.username, active)],
        components: active.status === 'returning'
          ? miningExpeditionComponents(interaction.user.id, 'returning', active.depth)
          : miningExpeditionComponents(interaction.user.id, 'view', undefined, active.event_state),
      });
      return;
    }

    if (group === 'expedition' && subcommand === 'return') {
      const returning = await beginMiningReturn(config, interaction.user.id);
      await interaction.editReply(buildMiningReturnPanel(
        interaction.user.id,
        returning.depth,
        returning.result,
        returning.travelDurationMs,
      ));
      return;
    }

    if (subcommand === 'shop') {
      const state = await getMiningPlayerState(config, interaction.user.id);
      const expiresAt = Date.now() + MINING_PANEL_TTL_MS;
      await interaction.editReply(buildMiningShopPanel(interaction.user.id, 'tool', state, expiresAt));
      scheduleMiningPanelExpiry(await interaction.fetchReply(), expiresAt);
      return;
    }

    if (subcommand === 'inventory') {
      const targetUser = interaction.options.getUser('user') ?? interaction.user;
      const viewingAnotherPlayer = targetUser.id !== interaction.user.id;
      const state = await getMiningPlayerState(config, targetUser.id);
      const expiresAt = Date.now() + MINING_PANEL_TTL_MS;
      await interaction.editReply(buildMiningInventoryPanel(interaction.user.id, state, expiresAt, 'overview', viewingAnotherPlayer ? `Viewing **${escapeMarkdown(targetUser.username)}**'s inventory. Inventory controls are available only in your own inventory.` : undefined, viewingAnotherPlayer));
      if (!viewingAnotherPlayer) scheduleMiningPanelExpiry(await interaction.fetchReply(), expiresAt);
      return;
    }

    if (subcommand === 'catalogue') {
      const progress = await getMiningCatalogueProgress(config, interaction.user.id);
      const expiresAt = Date.now() + MINING_PANEL_TTL_MS;
      await interaction.editReply(buildMiningCataloguePanel(interaction.user.id, 1, expiresAt, progress));
      scheduleMiningPanelExpiry(await interaction.fetchReply(), expiresAt);
      return;
    }

    if (subcommand === 'sell') {
      const resource = interaction.options.getString('resource', true);
      const amount = interaction.options.getString('amount', true);
      const sale = await sellMiningResource(config, interaction.user.id, resource, amount);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle('Mining resources sold')
            .setDescription(`Sold **${formatXp(sale.soldCount)}** ${resource} for **${formatXp(sale.totalSaleValue)} KnowBucks**. New balance: **${formatXp(sale.balance)} KnowBucks**.`),
        ],
      });
      return;
    }

    throw new Error(`Unsupported mining command: ${subcommand}`);
  } catch (error) {
    await interaction.editReply({ content: miningCommandErrorMessage(error), embeds: [] });
  }
}

async function postLeagueAccountViewer(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
  submittedRiotId: string,
  submittedPlatform: string,
) {
  const retryAfterSeconds = leagueSnapshotCaptureAvailability(interaction.user.id, LEAGUE_ACCOUNT_VIEWER_SNAPSHOT_REQUEST_WEIGHT);
  if (retryAfterSeconds !== null) {
    await interaction.reply({
      content: `League Account Viewer snapshots are limited while this test is running. Please try again in ${retryAfterSeconds} seconds.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  try {
    const snapshot = await captureLeagueAccountViewer(config, submittedRiotId, submittedPlatform);
    await interaction.editReply({
      allowedMentions: { parse: [] },
      components: [{
        type: 1,
        components: [new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open interactive viewer')
          .setURL(snapshot.viewerUrl)],
      }],
      content: `League Account Viewer snapshots for **${escapeMarkdown(snapshot.riotId)}** (${submittedPlatform}).`,
      files: snapshot.files.map((file) => ({ attachment: file.buffer, name: file.fileName })),
    });
  } catch (error) {
    const message = error instanceof LeagueAccountViewerSnapshotError
      ? error.message
      : 'KnowLeague could not create the League Account Viewer snapshot. Please try again shortly.';
    await interaction.editReply({ content: message });
  }
}

async function handleLeagueCommand(interaction: ChatInputCommandInteraction, config: DiscordBotConfig) {
  const group = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();
  if (group === null && subcommand === 'account') {
    await postLeagueAccountViewer(
      interaction,
      config,
      interaction.options.getString('riot-id', true),
      interaction.options.getString('region', true),
    );
    return;
  }

  if (group === null && subcommand === 'account-link') {
    try {
      const riotId = normalizeLeagueRiotId(interaction.options.getString('riot-id', true));
      const region = interaction.options.getString('region', true);
      await linkLeagueAccount(config, interaction.user.id, { region, riotId });
      await interaction.reply({
        content: `Linked **${escapeMarkdown(riotId)}** (${region}) to this Discord account. Use \`/league account-mine\` to open it.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      const message = error instanceof LeagueAccountViewerSnapshotError
        ? error.message
        : 'KnowLeague could not save that League account. Please try again shortly.';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (group === null && subcommand === 'account-mine') {
    const linkedAccount = await getLinkedLeagueAccount(config, interaction.user.id);
    if (!linkedAccount) {
      await interaction.reply({
        content: 'You have not linked a League account yet. Use `/league account-link` with your Riot ID and region first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await postLeagueAccountViewer(interaction, config, linkedAccount.riotId, linkedAccount.region);
    return;
  }

  if (group === null && subcommand === 'champion') {
    // Supports the short rollout window where Discord may still serve the prior command shape.
    const submittedSection = interaction.options.getString('section', false) ?? 'all';
    const requestWeight = getChampionCatalogueSnapshotRequestWeight(
      submittedSection === 'overview' || submittedSection === 'stats' || submittedSection === 'abilities' || submittedSection === 'skins'
        ? submittedSection
        : 'all',
    );
    const retryAfterSeconds = leagueSnapshotCaptureAvailability(interaction.user.id, requestWeight);
    if (retryAfterSeconds !== null) {
      await interaction.reply({
        content: `Champion Catalogue snapshots are limited while this test is running. Please try again in ${retryAfterSeconds} seconds.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const submittedChampion = interaction.options.getString('champion', true);
    await interaction.deferReply();
    try {
      const snapshot = await captureChampionCatalogue(config, submittedChampion, submittedSection);
      await interaction.editReply({
        allowedMentions: { parse: [] },
        components: [{
          type: 1,
          components: [new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Open Champion Catalogue')
            .setURL(snapshot.viewerUrl)],
        }],
        content: `Champion Catalogue ${snapshot.section === 'all' ? 'snapshots' : `${snapshot.section} snapshots`} for **${escapeMarkdown(snapshot.championName)}**.`,
        files: snapshot.files.map((file) => ({ attachment: file.buffer, name: file.fileName })),
      });
    } catch (error) {
      const message = error instanceof ChampionCatalogueSnapshotError
        ? error.message
        : 'KnowLeague could not create the Champion Catalogue snapshots. Please try again shortly.';
      await interaction.editReply({ content: message });
    }
    return;
  }

  if (group !== 'skindle') {
    throw new Error(`Unsupported League command group: ${group ?? 'none'}`);
  }

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
    const suggestions = result.suggestions.map((suggestion) => `**${suggestion}**`).join(', ');
    if (suggestions.length <= 1_800) {
      await interaction.reply({
        content: `Use an exact skin name. Possible matches: ${suggestions}.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const chunks: string[] = [];
      let chunk = '';
      for (const suggestion of result.suggestions) {
        const rendered = `**${suggestion}**`;
        if (chunk && chunk.length + rendered.length + 2 > 950) {
          chunks.push(chunk);
          chunk = rendered;
        } else {
          chunk += `${chunk ? ', ' : ''}${rendered}`;
        }
      }
      if (chunk) chunks.push(chunk);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x0EA5E9)
          .setTitle('Choose an exact skin name')
          .setDescription('That is a champion name. Here is the complete list of their skins:')
          .addFields(chunks.slice(0, 25).map((value, index) => ({ name: `Skins ${index + 1}`, value })))],
        flags: MessageFlags.Ephemeral,
      });
    }
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
    await replyWithCommandChannelLink(interaction, 'Collections', await getSkinCollectionCommandChannelIds(config));
    return;
  }

  if (subcommand === 'upkeep-view') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const overview = await getSkinCollectionUpkeepOverview(config, interaction.user.id);
    await interaction.editReply({ embeds: [buildCollectionUpkeepEmbed(overview)] });
    return;
  }

  if (subcommand === 'upkeep-pay') {
    const amount = interaction.options.getInteger('amount', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const funding = await fundSkinCollectionUpkeep(config, interaction.user.id, amount);
    if (funding.outcome === 'allocation-full') {
      await interaction.editReply({ content: `Your Collection upkeep allocation is already at its ${formatXp(COLLECTION_UPKEEP_ALLOCATION_MAXIMUM)} KnowBucks maximum. Allocated KnowBucks cannot be withdrawn.` });
      return;
    }
    if (funding.outcome === 'insufficient-funds') {
      await interaction.editReply({ content: `You need ${formatXp(funding.capped_amount)} KnowBucks to reserve that amount for upkeep. Your current balance is ${formatXp(funding.remaining_balance)} KnowBucks and your upkeep allocation is ${formatXp(funding.allocation_balance)} / ${formatXp(COLLECTION_UPKEEP_ALLOCATION_MAXIMUM)}.` });
      return;
    }
    const unallocatedAmount = amount - funding.allocated_amount;
    const overview = await getSkinCollectionUpkeepOverview(config, interaction.user.id);
    await interaction.editReply({
      content: `Set aside ${formatXp(funding.allocated_amount)} KnowBucks for Collection upkeep. Your allocation is now ${formatXp(funding.allocation_balance)} / ${formatXp(COLLECTION_UPKEEP_ALLOCATION_MAXIMUM)} and your regular balance is ${formatXp(funding.remaining_balance)}.${unallocatedAmount > 0 ? ` The remaining ${formatXp(unallocatedAmount)} KnowBucks stayed in your regular balance because the allocation is capped.` : ''}`,
      embeds: [buildCollectionUpkeepEmbed(overview)],
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
    const requestedType = interaction.options.getString('type') as CollectionSpawnType | null;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await forceSkinClaimDrop(config, interaction.guild, interaction.channelId, requestedType ?? undefined);
    if (result.status === 'spawned') {
      await interaction.editReply({ content: `A ${result.collectionType ?? requestedType ?? 'random'} drop was posted in this channel.` });
      return;
    }
    if (result.status === 'active-drop') {
      await interaction.editReply({ content: 'A live skin drop already exists. Wait for it to be claimed or expire before spawning another.' });
      return;
    }
    if (result.status === 'disabled') {
      await interaction.editReply({ content: 'Collection drops are disabled in Discord Configuration.' });
      return;
    }
    await interaction.editReply({ content: 'Enable collection drops before using /collections spawn. The bot must also be able to post in this channel.' });
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
          const content = `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance and won.`;
          const message = await interaction.editReply({ content });
          return { content, message };
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

async function handlePlayerButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, ownerDiscordUserId, expiresAtRaw, action, argument] = interaction.customId.split(':');
  if (!prefix.startsWith(`${PLAYER_BUTTON_PREFIX}-`) || !ownerDiscordUserId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || !action || !argument || Date.now() >= expiresAt) {
    await expirePlayerPanel(interaction);
    return true;
  }
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this player panel can use its controls.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await isDefaultCommandChannel(config, interaction.channelId))) {
    clearPlayerPanelExpiry(interaction.message.id);
    await interaction.update({ content: 'This channel is no longer configured for General commands, so this player panel has expired.', components: [] });
    return true;
  }

  if (prefix === `${PLAYER_BUTTON_PREFIX}-shop`) {
    if (action === 'tab') {
      if (argument !== 'skills' && argument !== 'items') {
        await interaction.reply({ content: 'This player shop panel is outdated. Run /player shop to open the current shop.', flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.deferUpdate();
      const state = await getPlayerShopState(config, ownerDiscordUserId);
      const nextExpiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
      await interaction.editReply(buildPlayerShopPanel(ownerDiscordUserId, argument, state, nextExpiresAt));
      schedulePlayerPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }

    if (action !== 'buy') {
      await interaction.reply({ content: 'This player shop panel is outdated. Run /player shop to open the current shop.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const item = getPlayerShopItem(argument);
    if (!item) {
      await interaction.reply({ content: 'That player-shop item is no longer available. Run /player shop to open the current shop.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const nextExpiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    const tab: PlayerShopTab = 'category' in item && item.category === 'skill' ? 'skills' : 'items';
    try {
      const purchase = await purchasePlayerShopItem(config, ownerDiscordUserId, item.id);
      const state = await getPlayerShopState(config, ownerDiscordUserId);
      await interaction.editReply(buildPlayerShopPanel(
        ownerDiscordUserId,
        tab,
        state,
        nextExpiresAt,
        `Purchased **${purchase.item.name}** for **${formatXp(purchase.chargedCost)} KnowBucks**.`,
      ));
    } catch (error) {
      const state = await getPlayerShopState(config, ownerDiscordUserId);
      const message = error instanceof Error && error.message.includes('Insufficient KnowBucks balance')
        ? 'You do not have enough KnowBucks for that item.'
        : error instanceof Error && error.message.includes('already own')
          ? 'You already own that item.'
          : error instanceof Error && error.message.includes('requires')
            ? error.message.replace(/^Unable to purchase player-shop item: /, '')
            : 'That player-shop purchase could not be completed.';
      await interaction.editReply(buildPlayerShopPanel(ownerDiscordUserId, tab, state, nextExpiresAt, message));
    }
    schedulePlayerPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${PLAYER_BUTTON_PREFIX}-stats`) {
    if ((action !== 'stats' && action !== 'skills') || !interaction.guild) {
      await interaction.reply({ content: 'This player stats panel is outdated. Run /player stats to open a new one.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const targetMember = await interaction.guild.members.fetch(argument).catch(() => null);
    if (!targetMember || targetMember.user.bot) {
      await interaction.update({ content: 'This member is no longer available, so this player stats panel has expired.', components: [] });
      clearPlayerPanelExpiry(interaction.message.id);
      return true;
    }
    await interaction.deferUpdate();
    const stats = await getPlayerStats(config, targetMember.id);
    const nextExpiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    await interaction.editReply(buildPlayerStatsPanel(ownerDiscordUserId, targetMember.id, targetMember.displayName, stats, action, nextExpiresAt));
    schedulePlayerPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  if (prefix === `${PLAYER_BUTTON_PREFIX}-inventory`) {
    if (!PLAYER_INVENTORY_TABS.includes(action as PlayerInventoryTab) || !interaction.guild) {
      await interaction.reply({ content: 'This player inventory panel is outdated. Run /player inventory to open a new one.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const targetMember = await interaction.guild.members.fetch(argument).catch(() => null);
    if (!targetMember || targetMember.user.bot) {
      await interaction.update({ content: 'This member is no longer available, so this player inventory panel has expired.', components: [] });
      clearPlayerPanelExpiry(interaction.message.id);
      return true;
    }
    await interaction.deferUpdate();
    const inventory = await getPlayerInventory(config, targetMember.id);
    const nextExpiresAt = Date.now() + PLAYER_PANEL_TTL_MS;
    await interaction.editReply(buildPlayerInventoryPanel(
      ownerDiscordUserId,
      targetMember.id,
      targetMember.displayName,
      inventory,
      action as PlayerInventoryTab,
      nextExpiresAt,
    ));
    schedulePlayerPanelExpiry(interaction.message, nextExpiresAt);
    return true;
  }

  return false;
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

async function handleWoodcuttingButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, ownerDiscordUserId, expiresAtRaw, tab] = interaction.customId.split(':');
  if (!prefix.startsWith(`${WOODCUTTING_BUTTON_PREFIX}-`) || !ownerDiscordUserId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || !tab || Date.now() >= expiresAt) {
    await expireWoodcuttingPanel(interaction);
    return true;
  }
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this Woodcutting panel can use its tabs.', flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferUpdate();
  try {
    const nextExpiresAt = Date.now() + WOODCUTTING_PANEL_TTL_MS;
    if (prefix === `${WOODCUTTING_BUTTON_PREFIX}-shop`) {
      if (!WOODCUTTING_SHOP_TABS.includes(tab as WoodcuttingShopTab)) {
        await interaction.followUp({ content: 'This Woodcutting shop panel is outdated. Run `/woodcutting shop` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const state = await getWoodcuttingPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildWoodcuttingShopPanel(ownerDiscordUserId, state, nextExpiresAt, tab as WoodcuttingShopTab));
      scheduleWoodcuttingPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    if (prefix === `${WOODCUTTING_BUTTON_PREFIX}-inventory`) {
      if (!WOODCUTTING_INVENTORY_TABS.includes(tab as WoodcuttingInventoryTab)) {
        await interaction.followUp({ content: 'This Woodcutting inventory panel is outdated. Run `/woodcutting inventory` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const state = await getWoodcuttingPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildWoodcuttingInventoryPanel(ownerDiscordUserId, interaction.user.username, state, nextExpiresAt, tab as WoodcuttingInventoryTab));
      scheduleWoodcuttingPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    await interaction.followUp({ content: 'This Woodcutting panel is outdated. Run `/woodcutting shop` or `/woodcutting inventory` to open a new one.', flags: MessageFlags.Ephemeral });
    return true;
  } catch (error) {
    await interaction.followUp({ content: woodcuttingCommandErrorReply(error, prefix), flags: MessageFlags.Ephemeral });
    return true;
  }
}

async function handleMiningExpeditionButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, action, ownerDiscordUserId, depthText, ...extra] = interaction.customId.split(':');
  if (prefix !== MINING_EXPEDITION_BUTTON_PREFIX) return false;
  const eventAction = depthText as MiningEventAction;
  const validAction = action === 'view' || action === 'refresh' || action === 'return' || action === 'repeat' || action === 'event';
  const validEventAction = ['attempt-relic', 'continue', 'claim-ores', 'claim-gems', 'repair', 'enter-rift', 'claim-crystals', 'trigger-dynamite', 'embrace-fluctuations'].includes(eventAction);
  if (!validAction || !ownerDiscordUserId || extra.length > 0 || ((action === 'repeat' || action === 'event') !== Boolean(depthText)) || (action === 'event' && !validEventAction)) {
    await interaction.reply({ content: 'This mining expedition control is outdated. Run `/mining expedition view` to open a current panel.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who started this mining expedition can use its controls.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await isMiningCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({ content: 'Mining commands are not enabled in this channel. An administrator can change this in Discord Configuration.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === 'refresh') {
    const cooldownSeconds = reserveMiningExpeditionRefresh(ownerDiscordUserId);
    if (cooldownSeconds !== null) {
      await interaction.reply({ content: `You can refresh this minecart again in ${cooldownSeconds} second${cooldownSeconds === 1 ? '' : 's'}.`, flags: MessageFlags.Ephemeral });
      return true;
    }
  }

  await interaction.deferUpdate();
  try {
    const settlement = await settleDueMiningReturn(config, ownerDiscordUserId);
    if (action === 'event') {
      const response = await respondToMiningExpeditionEvent(config, ownerDiscordUserId, eventAction);
      if (response.shouldReturn) {
        const returning = await beginMiningReturn(config, ownerDiscordUserId, response.instantReturn);
        if (response.instantReturn) {
          const settled = await settleDueMiningReturn(config, ownerDiscordUserId);
          if (settled) {
            await interaction.editReply({ embeds: [buildMiningSettlementEmbed(settled)], components: [] });
            return true;
          }
        }
        await interaction.editReply(buildMiningReturnPanel(ownerDiscordUserId, returning.depth, returning.result, returning.travelDurationMs));
        return true;
      }
      const active = await reconcileMiningExpeditionEvent(config, ownerDiscordUserId);
      await interaction.editReply(active ? {
        embeds: [buildMiningProgressEmbed(interaction.user.username, active)],
        components: miningExpeditionComponents(ownerDiscordUserId, 'view', undefined, active.event_state),
      } : { content: response.event.id === 'lost-temple' ? 'You left the Lost Temple behind and continued mining.' : 'Mining event resolved.', embeds: [], components: [] });
      return true;
    }
    if (action === 'view' || action === 'refresh') {
      const active = await reconcileMiningExpeditionEvent(config, ownerDiscordUserId);
      await interaction.editReply(active
        ? {
          embeds: [buildMiningProgressEmbed(interaction.user.username, active)],
          components: active.status === 'returning'
            ? miningExpeditionComponents(ownerDiscordUserId, 'returning', active.depth)
            : miningExpeditionComponents(ownerDiscordUserId, 'view', undefined, active.event_state),
        }
        : {
          embeds: settlement
            ? [buildMiningSettlementEmbed(settlement)]
            : [new EmbedBuilder().setColor(0x78716C).setTitle(`${interaction.user.username}'s mining expedition`).setDescription('No active minecart expedition. Start one with `/mining expedition set`.')],
          components: [],
        });
      return true;
    }
    if (action === 'return') {
      const returning = await beginMiningReturn(config, ownerDiscordUserId);
      await interaction.editReply(buildMiningReturnPanel(
        ownerDiscordUserId,
        returning.depth,
        returning.result,
        returning.travelDurationMs,
      ));
      return true;
    }

    const depth = Number(depthText) as MiningDepthId;
    if (!getMiningDepth(depth)) {
      await interaction.followUp({ content: 'This mining expedition control is outdated. Run `/mining expedition set` to choose a depth.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const active = await getActiveMiningExpedition(config, ownerDiscordUserId);
    if (active) {
      await interaction.followUp({ content: 'Your minecart is still ascending. Use Mine again once its return has completed.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const started = await startMiningExpedition(config, ownerDiscordUserId, depth);
    await interaction.editReply(buildMiningLaunchPanel(ownerDiscordUserId, started.depth.id, started.travelDurationMs));
    return true;
  } catch (error) {
    await interaction.followUp({ content: miningCommandErrorMessage(error), flags: MessageFlags.Ephemeral });
    return true;
  }
}

async function handleMiningButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  const [prefix, ownerDiscordUserId, expiresAtRaw, argument] = interaction.customId.split(':');
  if (!prefix.startsWith(`${MINING_BUTTON_PREFIX}-`) || !ownerDiscordUserId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || !argument || Date.now() >= expiresAt) {
    await expireMiningPanel(interaction);
    return true;
  }
  if (interaction.user.id !== ownerDiscordUserId) {
    await interaction.reply({ content: 'Only the member who opened this mining panel can use its controls.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await isMiningCommandAllowedInChannel(config, interaction.channelId))) {
    await interaction.reply({ content: 'Mining commands are not enabled in this channel. An administrator can change this in Discord Configuration.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();
  try {
    await settleDueMiningReturn(config, ownerDiscordUserId);
    const nextExpiresAt = Date.now() + MINING_PANEL_TTL_MS;
    if (prefix === `${MINING_BUTTON_PREFIX}-shop`) {
      if (!MINING_SHOP_CATEGORIES.includes(argument as MiningUpgradeCategory)) {
        await interaction.followUp({ content: 'This mining shop panel is outdated. Run `/mining shop` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const state = await getMiningPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildMiningShopPanel(ownerDiscordUserId, argument as MiningUpgradeCategory, state, nextExpiresAt));
      scheduleMiningPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    if (prefix === `${MINING_BUTTON_PREFIX}-inventory`) {
      if (!MINING_INVENTORY_TABS.includes(argument as MiningInventoryTab)) {
        await interaction.followUp({ content: 'This mining inventory panel is outdated. Run `/mining inventory` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const state = await getMiningPlayerState(config, ownerDiscordUserId);
      await interaction.editReply(buildMiningInventoryPanel(ownerDiscordUserId, state, nextExpiresAt, argument as MiningInventoryTab));
      scheduleMiningPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    if (prefix === `${MINING_BUTTON_PREFIX}-catalogue`) {
      const depthId = Number(argument) as MiningDepthId;
      if (!Number.isSafeInteger(depthId) || !getMiningDepth(depthId)) {
        await interaction.followUp({ content: 'This mining catalogue panel is outdated. Run `/mining catalogue` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const progress = await getMiningCatalogueProgress(config, ownerDiscordUserId);
      await interaction.editReply(buildMiningCataloguePanel(ownerDiscordUserId, depthId, nextExpiresAt, progress));
      scheduleMiningPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    if (prefix === `${MINING_BUTTON_PREFIX}-buy`) {
      const upgrade = getMiningUpgrade(argument);
      if (!upgrade || upgrade.id === 'wooden-pickaxe' || upgrade.id === 'shabby-bin') {
        await interaction.followUp({ content: 'This mining crafting control is outdated. Run `/mining shop` to open a new one.', flags: MessageFlags.Ephemeral });
        return true;
      }
      try {
        const purchase = await purchaseMiningUpgrade(config, ownerDiscordUserId, upgrade.id);
        const state = await getMiningPlayerState(config, ownerDiscordUserId);
        const costText = [
          purchase.recipe.map((item) => `${formatXp(item.quantity)} ${getMiningResource(item.resourceId)?.name ?? item.resourceId}`).join(', '),
        ].filter(Boolean).join(' · ');
        await interaction.editReply(buildMiningShopPanel(
          ownerDiscordUserId,
          purchase.upgrade.category,
          state,
          nextExpiresAt,
          `Crafted **${purchase.upgrade.name}**${costText ? ` for ${costText}` : ''}.`,
        ));
      } catch (error) {
        const state = await getMiningPlayerState(config, ownerDiscordUserId);
        await interaction.editReply(buildMiningShopPanel(ownerDiscordUserId, upgrade.category, state, nextExpiresAt, miningCommandErrorMessage(error)));
      }
      scheduleMiningPanelExpiry(interaction.message, nextExpiresAt);
      return true;
    }
    await interaction.followUp({ content: 'This mining panel is outdated. Run `/mining shop`, `/mining inventory`, or `/mining catalogue` to open a new one.', flags: MessageFlags.Ephemeral });
    return true;
  } catch (error) {
    await interaction.followUp({ content: miningCommandErrorMessage(error), flags: MessageFlags.Ephemeral });
    return true;
  }
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
  if (action === 'gamble' && !interaction.appPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({
      content: 'The KnowLeague bot needs the **Manage Messages** permission in this channel to clear the old claim reaction before opening the gamble drop.',
      flags: MessageFlags.Ephemeral,
    });
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

    try {
      // The old reaction is still present when this claimed-drop panel becomes
      // a new drop. Clear it before the gamble can consume the skin so a fresh
      // human reaction triggers the normal claim path without manual cleanup.
      await interaction.message.reactions.removeAll();
    } catch (error) {
      console.error('Could not clear reactions before converting a claimed Collection drop into a gamble drop.', error);
      await interaction.followUp({
        content: 'The existing claim reaction could not be cleared, so your skin was not gambled. Please ask a server admin to grant KnowLeague **Manage Messages** in this channel and try again.',
        flags: MessageFlags.Ephemeral,
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
        const content = `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance and won.`;
        const message = await interaction.editReply({
          components: [],
          content,
          embeds: [],
        });
        return { content, message };
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
          const content = `**${interaction.user.username}** gambled **${gamble.skinName}** - #${skinCollectionCode(skinCode)} at a ${gamble.successChancePercent ?? 25}% chance and won.`;
          const message = await interaction.followUp({ content });
          return { content, message };
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

async function handleHelpButtonInteraction(interaction: ButtonInteraction) {
  const [prefix, tab, ...extra] = interaction.customId.split(':');
  if (prefix !== HELP_BUTTON_PREFIX) return false;
  if (extra.length > 0 || !HELP_TABS.includes(tab as HelpTab)) {
    await interaction.reply({ content: 'This help panel is outdated. Run `/help` to open a new one.', flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferUpdate();
  await interaction.editReply(buildHelpPanel(tab as HelpTab));
  return true;
}

export async function handleButtonInteraction(interaction: ButtonInteraction, config: DiscordBotConfig) {
  if (interaction.guildId !== config.guildId) return;
  if (await handleHelpButtonInteraction(interaction)) return;
  if (await handlePlayerButtonInteraction(interaction, config)) return;
  if (await handleFishingButtonInteraction(interaction, config)) return;
  if (await handleWoodcuttingButtonInteraction(interaction, config)) return;
  if (await handleMiningExpeditionButtonInteraction(interaction, config)) return;
  if (await handleMiningButtonInteraction(interaction, config)) return;
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

type StoredSlashCommand = {
  commandName: string;
  optionValues: Record<string, boolean | number | string>;
  subcommand: string | null;
  subcommandGroup: string | null;
};

const mostRecentCommands = new Map<string, StoredSlashCommand>();

function collectSlashOptionValues(options: readonly unknown[], values: Record<string, boolean | number | string> = {}) {
  for (const option of options) {
    if (!option || typeof option !== 'object') continue;
    const entry = option as { name?: unknown; options?: unknown; value?: unknown };
    if (typeof entry.name === 'string' && (
      typeof entry.value === 'boolean'
      || typeof entry.value === 'number'
      || typeof entry.value === 'string'
    )) {
      values[entry.name] = entry.value;
    }
    if (Array.isArray(entry.options)) collectSlashOptionValues(entry.options, values);
  }
  return values;
}

function storeMostRecentCommand(interaction: ChatInputCommandInteraction) {
  mostRecentCommands.set(interaction.user.id, {
    commandName: interaction.commandName,
    optionValues: collectSlashOptionValues(interaction.options.data),
    subcommand: interaction.options.getSubcommand(false),
    subcommandGroup: interaction.options.getSubcommandGroup(false),
  });
}

function repeatedInteraction(interaction: ChatInputCommandInteraction, command: StoredSlashCommand) {
  const replayOptions = new Proxy(interaction.options, {
    get(target, property, receiver) {
      if (property === 'getSubcommand') return () => command.subcommand;
      if (property === 'getSubcommandGroup') return () => command.subcommandGroup;
      if (property === 'getString') return (name: string, required = false) => {
        const value = command.optionValues[name];
        if (typeof value === 'string') return value;
        if (required) throw new Error(`The repeated command is missing its ${name} option.`);
        return null;
      };
      if (property === 'getInteger') return (name: string, required = false) => {
        const value = command.optionValues[name];
        if (typeof value === 'number' && Number.isInteger(value)) return value;
        if (required) throw new Error(`The repeated command is missing its ${name} option.`);
        return null;
      };
      if (property === 'getBoolean') return (name: string, required = false) => {
        const value = command.optionValues[name];
        if (typeof value === 'boolean') return value;
        if (required) throw new Error(`The repeated command is missing its ${name} option.`);
        return null;
      };
      if (property === 'getUser') return (name: string, required = false) => {
        const value = command.optionValues[name];
        if (typeof value === 'string') {
          return interaction.client.users.cache.get(value) ?? {
            bot: false,
            id: value,
            toString: () => `<@${value}>`,
          };
        }
        if (required) throw new Error(`The repeated command is missing its ${name} option.`);
        return null;
      };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return new Proxy(interaction, {
    get(target, property, receiver) {
      if (property === 'commandName') return command.commandName;
      if (property === 'options') return replayOptions;
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as ChatInputCommandInteraction;
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
  storeAsMostRecent = true,
) {
  if (usesDefaultCommandChannel(interaction.commandName)
    && !(await isDefaultCommandChannel(config, interaction.channelId))) {
    await replyWithCommandChannelLink(interaction, 'General', await getDefaultCommandChannelIds(config));
    return;
  }

  if (interaction.commandName === 'rc') {
    const command = mostRecentCommands.get(interaction.user.id);
    if (!command) {
      await interaction.reply({ content: 'There is no command to repeat yet. Run another slash command first.', flags: MessageFlags.Ephemeral });
      return;
    }
    await handleChatInputCommand(repeatedInteraction(interaction, command), config, false);
    return;
  }

  if (storeAsMostRecent) storeMostRecentCommand(interaction);

  if (interaction.commandName === 'help') {
    await interaction.reply(buildHelpPanel('general'));
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

  if (interaction.commandName === 'player') {
    await handlePlayerCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'rob') {
    await handleRobCommand(interaction, config);
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

  if (interaction.commandName === 'mining') {
    await handleMiningCommand(interaction, config);
    return;
  }

  if (interaction.commandName === 'woodcutting') {
    await handleWoodcuttingCommand(interaction, config);
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
