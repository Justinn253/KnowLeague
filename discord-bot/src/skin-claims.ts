import { readFileSync } from 'node:fs';
import {
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

type CatalogSkin = {
  answer: string;
  champion: string;
  centeredImageUrl?: string;
  id: string;
  imageUrl: string;
  rarity: string;
  releaseDate: string;
  skinLine: string;
  type: 'skin';
};

export type CollectionSpawnType = 'item' | 'rune' | 'skin';
type CollectionRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

type CollectionItemCatalogEntry = {
  catalogId: string;
  cost: number | null;
  firstSeenVersion: string;
  gameModes: string[];
  id: string;
  imageUrl: string;
  lastSeenVersion: string;
  name: string;
  rarity: CollectionRarity;
  tier: number;
  type: 'item';
};

type CollectionRuneCatalogEntry = {
  catalogId: string;
  id: string;
  imageUrl: string;
  name: string;
  rarity: CollectionRarity;
  runeKind: 'keystone' | 'style' | 'sub-rune';
  style: string;
  tier: number;
  type: 'rune';
};

type CollectionCatalogEntry = CatalogSkin | CollectionItemCatalogEntry | CollectionRuneCatalogEntry;

type CollectionMetadata = {
  cost?: number | null;
  firstSeenVersion?: string;
  gameModes?: string[];
  lastSeenVersion?: string;
  runeKind?: CollectionRuneCatalogEntry['runeKind'];
  style?: string;
};

type SkinClaimSettingsRow = {
  all_channels: boolean;
  claim_window_minutes: number;
  enabled: boolean;
  last_drop_at: string | null;
  maximum_interval_minutes: number;
  minimum_interval_minutes: number;
  schedule_started_at: string;
};

type SkinClaimChannelRow = {
  channel_id: string;
};

type SkinClaimAvailableChannelRow = {
  channel_id: string;
};

type SkinClaimRarityWeightRow = {
  rarity: string;
  weight: number;
};

type SkinClaimAdminRoleRow = {
  discord_role_id: string;
};

type SkinClaimCommandChannelRow = {
  channel_id: string;
};

type SkinClaimCatalogLockRow = {
  skin_catalog_id: string;
};

type SkinSearchClaimRow = {
  owner_discord_user_id: string | null;
  skin_catalog_id: string;
  skin_code: number;
};

type SkinClaimRuntimeSettings = {
  claimWindowMinutes: number;
  eligibleChannelIds: Set<string>;
  enabled: boolean;
  lastDropAt: Date | null;
  maximumIntervalMinutes: number;
  minimumIntervalMinutes: number;
  rarityWeights: Map<string, number>;
  scheduleStartedAt: Date;
};

type ReservedSkinDrop = {
  drop_id: number;
  expires_at: string;
  skin_code: number;
};

type ClaimedSkinDrop = {
  champion_name: string;
  claimed: boolean;
  collection_metadata?: CollectionMetadata;
  collection_tier?: number | null;
  collection_type?: CollectionSpawnType;
  image_url: string;
  is_favorite?: boolean;
  owner_acquired_at?: string | null;
  ownership_method?: 'claimed' | 'stolen' | 'transferred' | null;
  rarity: string;
  release_date: string;
  skin_code: number;
  skin_catalog_id?: string;
  skin_line: string;
  skin_name: string;
};

export type SkinCollectionPage = {
  capacity: number;
  item: ClaimedSkinDrop | null;
  page: number;
  sellValue: number | null;
  total: number;
  upkeep: {
    dailyCost: number;
    excessSkinCount: number;
    graceExpiresAt: string | null;
    outstandingAmount: number;
  };
};

export type SkinSearchResult = {
  claims: Array<Pick<SkinSearchClaimRow, 'owner_discord_user_id' | 'skin_code'>>;
  skin: CatalogSkin;
};

type CollectionCapacitySettingsRow = {
  default_collection_capacity: number;
};

type CollectionCapacityRow = {
  extra_slots: number;
};

type CollectionSellValueRow = {
  amount: number;
  rarity: string;
};

type CollectionUpkeepRow = {
  grace_expires_at: string | null;
  outstanding_amount: number;
};

type CollectionUpkeepAllocationRow = {
  balance: number;
};

type KnowBucksBalanceRow = {
  balance: number;
};

type CollectionUpkeepFunding = {
  allocated_amount: number;
  allocation_balance: number;
  capped_amount: number;
  outcome: 'allocation-full' | 'funded' | 'insufficient-funds';
  remaining_balance: number;
};

export type CollectionUpkeepOverview = {
  allocationBalance: number;
  combinedFunds: number;
  dailyCost: number;
  graceExpiresAt: string | null;
  outstandingAmount: number;
  regularBalance: number;
  totalSkins: number;
};

type CollectionUpkeepSettlement = {
  amount: number;
  discord_user_id: string;
  grace_expires_at: string | null;
  outcome: 'charged' | 'grace-opened' | 'grace-pending' | 'paid-after-grace' | 'released';
  released_count: number;
};

type TransferredSkin = {
  skin_code: number;
  skin_name: string;
};

type SummonedSkinDrop = ReservedSkinDrop & {
  available_at: string | null;
  charged_cost: number | null;
  outcome: 'active-drop' | 'cooldown' | 'insufficient-funds' | 'not-on-cooldown' | 'spawned';
  remaining_balance: number;
};

type GambledSkinDrop = {
  drop_id: number | null;
  expires_at: string | null;
  new_skin_code: number | null;
  outcome: 'blocked' | 'lost' | 'spawned';
  skin_name: string;
  success_chance_percent: number | null;
};

type CollectionFishingSkillLevels = {
  cheapskate_level: number;
  haste_level: number;
  lucky_level: number;
  money_mouser_level: number;
};

type CollectionCapacityPurchase = {
  capacity: number;
  cost: number;
  remaining_balance: number;
};

type StolenSkinClaim = {
  available_at: string | null;
  cost: number | null;
  outcome: 'cooldown' | 'failed' | 'full' | 'insufficient-funds' | 'missing' | 'own' | 'stolen';
  previous_owner_discord_user_id: string | null;
  remaining_balance: number | null;
  skin_name: string | null;
};

type SoldSkinClaim = {
  amount: number;
  current_balance: number;
  skin_name: string;
};

const SKIN_CLAIM_SETTINGS_CACHE_DURATION_MS = 15_000;
const SKIN_CLAIM_TIMER_INTERVAL_MS = 30_000;
const COLLECTION_UPKEEP_FREE_SKIN_COUNT = 10;
export const COLLECTION_UPKEEP_ALLOCATION_MAXIMUM = 100_000;
export const SKIN_CLAIM_ACTION_BUTTON_PREFIX = 'skin-claim-action';
const RARITY_ALIASES: Record<string, string> = {
  kExalted: 'Exalted',
  kEpic: 'Epic',
  kLegendary: 'Legendary',
  kMythic: 'Mythic',
  kNoRarity: 'Common',
  kRare: 'Rare',
  kTranscendent: 'Transcendent',
  kUltimate: 'Ultimate',
};
const RARITY_COLORS: Record<string, number> = {
  Common: 0x94A3B8,
  Epic: 0xA855F7,
  Exalted: 0xF43F5E,
  Legendary: 0xF59E0B,
  Mythic: 0xEC4899,
  Rare: 0x38BDF8,
  Transcendent: 0xF97316,
  Ultimate: 0x14B8A6,
};
const COLLECTION_TIER_RARITIES: Record<number, CollectionRarity> = {
  1: 'Common',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary',
  5: 'Mythic',
};
const SUMMON_UPGRADE_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;

let catalogCache: CatalogSkin[] | null = null;
let collectionItemCatalogCache: CollectionItemCatalogEntry[] | null = null;
let collectionRuneCatalogCache: CollectionRuneCatalogEntry[] | null = null;
let cachedSettings: { expiresAt: number; guildId: string; value: SkinClaimRuntimeSettings } | null = null;
let settingsLoad: Promise<SkinClaimRuntimeSettings | null> | null = null;
let scheduler: NodeJS.Timeout | null = null;
let timedDropInFlight: Promise<void> | null = null;
let collectionUpkeepScheduler: NodeJS.Timeout | null = null;
let collectionUpkeepInFlight: Promise<CollectionUpkeepSettlement[]> | null = null;

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function normalizeRarity(rarity: string) {
  return RARITY_ALIASES[rarity] ?? rarity;
}

function loadSkinCatalog() {
  if (catalogCache) return catalogCache;
  const catalogUrl = new URL('../../data/catalogs/skin-items.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(catalogUrl, 'utf8')) as CatalogSkin[];
  catalogCache = parsed.filter((skin) => (
    /^\d{1,20}$/.test(skin.id)
    && Boolean(skin.answer)
    && Boolean(skin.champion)
    && /^https:\/\//.test(skin.imageUrl)
    && /^\d{4}-\d{2}-\d{2}$/.test(skin.releaseDate)
    && Boolean(skin.skinLine)
    && ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted'].includes(normalizeRarity(skin.rarity))
  ));
  if (!catalogCache.length) {
    throw new Error('The generated skin catalogue has no claimable skins.');
  }
  return catalogCache;
}

function loadCollectionItemCatalog() {
  if (collectionItemCatalogCache) return collectionItemCatalogCache;
  const catalogUrl = new URL('../../data/catalogs/discord-collection-items.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(catalogUrl, 'utf8')) as { items?: CollectionItemCatalogEntry[] };
  collectionItemCatalogCache = (parsed.items ?? []).filter((item) => (
    /^item:[a-z0-9:_-]{1,190}$/.test(item.catalogId)
    && Boolean(item.name)
    && /^https:\/\//.test(item.imageUrl)
    && Number.isInteger(item.tier)
    && item.tier >= 1
    && item.tier <= 5
    && item.rarity === COLLECTION_TIER_RARITIES[item.tier]
  ));
  if (!collectionItemCatalogCache.length) {
    throw new Error('The generated collection item catalogue has no claimable items.');
  }
  return collectionItemCatalogCache;
}

function loadCollectionRuneCatalog() {
  if (collectionRuneCatalogCache) return collectionRuneCatalogCache;
  const catalogUrl = new URL('../../data/catalogs/discord-collection-runes.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(catalogUrl, 'utf8')) as { runes?: CollectionRuneCatalogEntry[] };
  collectionRuneCatalogCache = (parsed.runes ?? []).filter((rune) => (
    /^rune-(?:keystone|style|sub-rune):[a-z0-9:_-]{1,180}$/.test(rune.catalogId)
    && Boolean(rune.name)
    && /^https:\/\//.test(rune.imageUrl)
    && Number.isInteger(rune.tier)
    && rune.tier >= 2
    && rune.tier <= 4
    && rune.rarity === COLLECTION_TIER_RARITIES[rune.tier]
  ));
  if (!collectionRuneCatalogCache.length) {
    throw new Error('The generated collection rune catalogue has no claimable runes.');
  }
  return collectionRuneCatalogCache;
}

function collectionCatalogId(entry: CollectionCatalogEntry) {
  return entry.type === 'skin' ? entry.id : entry.catalogId;
}

function collectionTypeLabel(type: CollectionSpawnType | undefined) {
  if (type === 'item') return 'item';
  if (type === 'rune') return 'rune';
  return 'skin';
}

function collectionTypeTitle(type: CollectionSpawnType | undefined) {
  return collectionTypeLabel(type).replace(/^./, (letter) => letter.toUpperCase());
}

function collectionEntryImageUrl(entry: CollectionCatalogEntry) {
  return entry.type === 'skin' ? getSkinDisplayImageUrl(entry) : entry.imageUrl;
}

function collectionTierRarity(tier: number | null | undefined) {
  return tier ? COLLECTION_TIER_RARITIES[tier] ?? 'Common' : 'Common';
}

function collectionEntryRarity(entry: CollectionCatalogEntry) {
  return entry.type === 'skin' ? normalizeRarity(entry.rarity) : entry.rarity;
}

function collectionEntryMetadata(entry: CollectionCatalogEntry): CollectionMetadata {
  if (entry.type === 'item') {
    return {
      cost: entry.cost,
      firstSeenVersion: entry.firstSeenVersion,
      gameModes: entry.gameModes,
      lastSeenVersion: entry.lastSeenVersion,
    };
  }
  if (entry.type === 'rune') {
    return { runeKind: entry.runeKind, style: entry.style };
  }
  return {};
}

function getCollectionEntryCatalog(type: CollectionSpawnType): readonly CollectionCatalogEntry[] {
  if (type === 'item') return loadCollectionItemCatalog();
  if (type === 'rune') return loadCollectionRuneCatalog();
  return loadSkinCatalog();
}

function chooseWeightedSkin(rarityWeights: ReadonlyMap<string, number>, catalog: readonly CatalogSkin[] = loadSkinCatalog()) {
  const candidates = catalog.map((skin) => ({ skin, weight: rarityWeights.get(normalizeRarity(skin.rarity)) ?? 0 }))
    .filter((candidate) => candidate.weight > 0);
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Skin-claim rarity settings do not include a positive eligible weight.');
  }
  let selection = Math.random() * totalWeight;
  for (const candidate of candidates) {
    selection -= candidate.weight;
    if (selection < 0) return candidate.skin;
  }
  return candidates[candidates.length - 1]!.skin;
}

function chooseWeightedCollectionEntry<T extends CollectionItemCatalogEntry | CollectionRuneCatalogEntry>(
  rarityWeights: ReadonlyMap<string, number>,
  catalog: readonly T[],
) {
  const candidates = catalog.map((entry) => ({ entry, weight: rarityWeights.get(entry.rarity) ?? 0 }))
    .filter((candidate) => candidate.weight > 0);
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Collection rarity settings do not include a positive eligible weight for this entry type.');
  }
  let selection = Math.random() * totalWeight;
  for (const candidate of candidates) {
    selection -= candidate.weight;
    if (selection < 0) return candidate.entry;
  }
  return candidates[candidates.length - 1]!.entry;
}

async function chooseAvailableWeightedSkin(config: DiscordBotConfig, rarityWeights: ReadonlyMap<string, number>) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skin_claim_catalog_locks')
    .select('skin_catalog_id')
    .eq('guild_id', config.guildId)
    .returns<SkinClaimCatalogLockRow[]>();
  if (error) throw new Error(`Unable to load claimed Discord collection skins: ${error.message}`);

  const lockedCatalogIds = new Set((data ?? []).map((entry) => entry.skin_catalog_id));
  const catalog = loadSkinCatalog().filter((skin) => !lockedCatalogIds.has(skin.id));
  if (!catalog.length) throw new Error('Every skin in the local KnowLeague catalogue is already in a collection.');
  return { catalog, skin: chooseWeightedSkin(rarityWeights, catalog) };
}

async function chooseAvailableCollectionEntry(
  config: DiscordBotConfig,
  requestedType: CollectionSpawnType | undefined,
  rarityWeights: ReadonlyMap<string, number>,
) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skin_claim_catalog_locks')
    .select('skin_catalog_id')
    .eq('guild_id', config.guildId)
    .returns<SkinClaimCatalogLockRow[]>();
  if (error) throw new Error(`Unable to load claimed Discord collection entries: ${error.message}`);

  const lockedCatalogIds = new Set((data ?? []).map((entry) => entry.skin_catalog_id));
  const types = requestedType
    ? [requestedType]
    : (['skin', 'item', 'rune'] as CollectionSpawnType[]).sort(() => Math.random() - 0.5);

  for (const type of types) {
    const catalog = getCollectionEntryCatalog(type).filter((entry) => !lockedCatalogIds.has(collectionCatalogId(entry)));
    if (!catalog.length) continue;
    if (type === 'skin') {
      return {
        entry: chooseWeightedSkin(rarityWeights, catalog as CatalogSkin[]),
        collectionCatalog: null,
        skinCatalog: catalog as CatalogSkin[],
      };
    }
    const collectionCatalog = catalog as (CollectionItemCatalogEntry | CollectionRuneCatalogEntry)[];
    return {
      entry: chooseWeightedCollectionEntry(rarityWeights, collectionCatalog),
      collectionCatalog,
      skinCatalog: null,
    };
  }

  throw new Error(requestedType
    ? `Every ${collectionTypeLabel(requestedType)} in the local KnowLeague catalogue is already in a collection.`
    : 'Every collection entry in the local KnowLeague catalogues is already claimed.');
}

function maybeUpgradeSummonedSkin(skin: CatalogSkin, catalog: readonly CatalogSkin[], luckyLevel: number) {
  if (luckyLevel <= 0 || Math.random() * 100 >= luckyLevel) return skin;
  const rarityIndex = SUMMON_UPGRADE_RARITIES.indexOf(normalizeRarity(skin.rarity) as (typeof SUMMON_UPGRADE_RARITIES)[number]);
  if (rarityIndex < 0 || rarityIndex >= SUMMON_UPGRADE_RARITIES.length - 1) return skin;
  const upgradedRarity = SUMMON_UPGRADE_RARITIES[rarityIndex + 1];
  const upgradedCandidates = catalog.filter((candidate) => normalizeRarity(candidate.rarity) === upgradedRarity);
  return upgradedCandidates.length
    ? upgradedCandidates[Math.floor(Math.random() * upgradedCandidates.length)]!
    : skin;
}

async function getCollectionFishingSkillLevels(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config).rpc('get_discord_collection_fishing_skill_levels', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to load collection fishing skills: ${error.message}`);
  const levels = getFirstResult(data as CollectionFishingSkillLevels | CollectionFishingSkillLevels[] | null);
  if (!levels) throw new Error('Collection fishing skills did not return a result.');
  return levels;
}

export function calculateSkinRaritySpawnPercent(
  rarity: string,
  rarityWeights: ReadonlyMap<string, number>,
  catalog: readonly Pick<CatalogSkin, 'rarity'>[] = loadSkinCatalog(),
) {
  const targetRarity = normalizeRarity(rarity);
  let totalWeight = 0;
  let rarityWeight = 0;

  for (const skin of catalog) {
    const skinRarity = normalizeRarity(skin.rarity);
    const weight = rarityWeights.get(skinRarity) ?? 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    if (skinRarity === targetRarity) rarityWeight += weight;
  }

  return totalWeight > 0 ? (rarityWeight / totalWeight) * 100 : 0;
}

function calculateCollectionRaritySpawnPercent(
  rarity: string,
  rarityWeights: ReadonlyMap<string, number>,
  catalog: readonly (CollectionItemCatalogEntry | CollectionRuneCatalogEntry)[],
) {
  const targetRarity = normalizeRarity(rarity);
  let totalWeight = 0;
  let rarityWeight = 0;
  for (const entry of catalog) {
    const weight = rarityWeights.get(entry.rarity) ?? 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    if (entry.rarity === targetRarity) rarityWeight += weight;
  }
  return totalWeight > 0 ? (rarityWeight / totalWeight) * 100 : 0;
}

function formatRaritySpawnPercent(percent: number) {
  if (percent > 0 && percent < 0.01) return '<0.01%';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(percent)}%`;
}

function formatSkinCode(skinCode: number) {
  return String(skinCode).padStart(4, '0');
}

function formatReleaseDate(releaseDate: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${releaseDate}T00:00:00.000Z`));
}

function formatOwnershipMethod(method: ClaimedSkinDrop['ownership_method']) {
  if (method === 'stolen') return 'Stolen';
  if (method === 'transferred') return 'Transferred';
  return 'Claimed';
}

function formatAcquiredDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1_000)}:D>`;
}

function formatKnowBucks(value: number | null) {
  return value === null ? 'Not configured' : `${new Intl.NumberFormat('en-US').format(value)} KnowBucks`;
}

/**
 * Collection upkeep is marginal by ten-skin tier. Lucky's upkeep discount is
 * applied to the full tiered amount and rounded up, matching the authoritative
 * database settlement function.
 */
export function calculateCollectionDailyUpkeep(ownedSkinCount: number, luckyLevel: number) {
  const owned = Math.max(0, Math.floor(ownedSkinCount));
  const tieredAmount = (
    Math.max(0, Math.min(owned, 20) - 10) * 100
    + Math.max(0, Math.min(owned, 30) - 20) * 500
    + Math.max(0, Math.min(owned, 40) - 30) * 1000
    + Math.max(0, owned - 40) * 2500
  );
  return Math.ceil(tieredAmount * Math.max(0, 1 - (Math.max(0, luckyLevel) * 0.05)));
}

function getSkinDisplayImageUrl(skin: Pick<CatalogSkin, 'centeredImageUrl' | 'imageUrl'>) {
  return skin.centeredImageUrl && /^https:\/\//.test(skin.centeredImageUrl)
    ? skin.centeredImageUrl
    : skin.imageUrl;
}

function getClaimedSkinDisplayImageUrl(drop: Pick<ClaimedSkinDrop, 'collection_type' | 'image_url' | 'skin_catalog_id'>) {
  if (drop.collection_type && drop.collection_type !== 'skin') return drop.image_url;
  const catalogSkin = drop.skin_catalog_id
    ? loadSkinCatalog().find((skin) => skin.id === drop.skin_catalog_id)
    : null;
  return catalogSkin ? getSkinDisplayImageUrl(catalogSkin) : drop.image_url;
}

function collectionDropRarity(drop: Pick<ClaimedSkinDrop, 'collection_tier' | 'collection_type' | 'rarity'>) {
  return drop.collection_type && drop.collection_type !== 'skin' && drop.collection_tier
    ? collectionTierRarity(drop.collection_tier)
    : drop.rarity;
}

function collectionDropColor(drop: Pick<ClaimedSkinDrop, 'collection_tier' | 'collection_type' | 'rarity'>) {
  return RARITY_COLORS[collectionDropRarity(drop)] ?? 0xF59E0B;
}

function skinDropEmbed(
  drop: Omit<ClaimedSkinDrop, 'claimed'>,
  claimedByUserId?: string,
  collection = false,
  raritySpawnPercent?: number,
) {
  const claimed = Boolean(claimedByUserId) || collection;
  const type = collectionTypeLabel(drop.collection_type);
  const typeTitle = collectionTypeTitle(drop.collection_type);
  const details = [
    `**${drop.skin_name}**`,
    `Type: **${typeTitle}**`,
    `Rarity: **${collectionDropRarity(drop)}**`,
    ...(raritySpawnPercent === undefined ? [] : [`Rarity spawn chance: **${formatRaritySpawnPercent(raritySpawnPercent)}**`]),
  ];
  const embed = new EmbedBuilder()
    .setColor(collectionDropColor(drop))
    .setTitle(`${claimed ? `Claimed ${type}` : `${typeTitle} drop`} · #${formatSkinCode(drop.skin_code)}`)
    .setDescription(details.join('\n'))
    .setImage(drop.image_url);
  if (!collection) {
    embed.setDescription([
      claimed ? `<@${claimedByUserId}> claimed this ${type}.` : `React to this message first to add this ${type} to your collection.`,
      '',
      ...details,
    ].join('\n'));
  }
  return embed.setFooter({ text: claimed ? 'Use /collections collection to browse the collection.' : 'The first human reaction wins.' });
}

export function skinClaimActionButtons(ownerDiscordUserId: string, skinCode: number, disabled = false) {
  const customId = (action: 'favorite' | 'gamble' | 'sell') => (
    `${SKIN_CLAIM_ACTION_BUTTON_PREFIX}:${ownerDiscordUserId}:${skinCode}:${action}`
  );
  return [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(customId('favorite'))
        .setStyle(ButtonStyle.Success)
        .setLabel('Favorite')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customId('gamble'))
        .setStyle(ButtonStyle.Danger)
        .setLabel('Gamble')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customId('sell'))
        .setStyle(ButtonStyle.Danger)
        .setLabel('Sell')
        .setDisabled(disabled),
    ],
  }];
}

async function getSkinClaimSettings(
  config: DiscordBotConfig,
  forceRefresh = false,
): Promise<SkinClaimRuntimeSettings | null> {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && cachedSettings.guildId === config.guildId && cachedSettings.expiresAt > now) {
    return cachedSettings.value;
  }
  if (settingsLoad) return settingsLoad;
  settingsLoad = (async () => {
    const supabase = createBotServiceClient(config);
    const [settingsResult, channelsResult, availableChannelsResult, weightsResult] = await Promise.all([
      supabase.from('discord_skin_claim_settings')
        .select('enabled, minimum_interval_minutes, maximum_interval_minutes, claim_window_minutes, all_channels, schedule_started_at, last_drop_at')
        .eq('guild_id', config.guildId)
        .maybeSingle<SkinClaimSettingsRow>(),
      supabase.from('discord_skin_claim_channels')
        .select('channel_id')
        .eq('guild_id', config.guildId)
        .returns<SkinClaimChannelRow[]>(),
      supabase.from('discord_guild_text_channels')
        .select('channel_id')
        .eq('guild_id', config.guildId)
        .eq('sendable', true)
        .returns<SkinClaimAvailableChannelRow[]>(),
      supabase.from('discord_skin_claim_rarity_weights')
        .select('rarity, weight')
        .eq('guild_id', config.guildId)
        .returns<SkinClaimRarityWeightRow[]>(),
    ]);
    if (settingsResult.error) throw new Error(`Unable to load Discord skin-claim settings: ${settingsResult.error.message}`);
    if (channelsResult.error) throw new Error(`Unable to load Discord skin-claim channels: ${channelsResult.error.message}`);
    if (availableChannelsResult.error) throw new Error(`Unable to load available Discord skin-claim channels: ${availableChannelsResult.error.message}`);
    if (weightsResult.error) throw new Error(`Unable to load Discord skin-claim rarity weights: ${weightsResult.error.message}`);
    if (!settingsResult.data) return null;
    const selectedChannelIds = new Set((channelsResult.data ?? []).map((channel) => channel.channel_id));
    const allSendableChannelIds = new Set((availableChannelsResult.data ?? []).map((channel) => channel.channel_id));
    const value: SkinClaimRuntimeSettings = {
      claimWindowMinutes: settingsResult.data.claim_window_minutes,
      eligibleChannelIds: settingsResult.data.all_channels ? allSendableChannelIds : selectedChannelIds,
      enabled: settingsResult.data.enabled,
      lastDropAt: settingsResult.data.last_drop_at ? new Date(settingsResult.data.last_drop_at) : null,
      maximumIntervalMinutes: settingsResult.data.maximum_interval_minutes,
      minimumIntervalMinutes: settingsResult.data.minimum_interval_minutes,
      rarityWeights: new Map((weightsResult.data ?? []).map((weight) => [weight.rarity, weight.weight])),
      scheduleStartedAt: new Date(settingsResult.data.schedule_started_at),
    };
    cachedSettings = { expiresAt: Date.now() + SKIN_CLAIM_SETTINGS_CACHE_DURATION_MS, guildId: config.guildId, value };
    return value;
  })();
  try {
    return await settingsLoad;
  } finally {
    settingsLoad = null;
  }
}

function recordDropReservation(config: DiscordBotConfig) {
  if (cachedSettings?.guildId === config.guildId) {
    cachedSettings.value.lastDropAt = new Date();
  }
}

function chooseEligibleChannelId(settings: SkinClaimRuntimeSettings) {
  const channelIds = [...settings.eligibleChannelIds];
  if (!channelIds.length) return null;
  return channelIds[Math.floor(Math.random() * channelIds.length)]!;
}

async function abandonUnsentDrop(config: DiscordBotConfig, dropId: number) {
  const { error } = await createBotServiceClient(config).rpc('abandon_discord_skin_claim_drop', {
    p_drop_id: dropId,
    p_guild_id: config.guildId,
  });
  if (error) {
    console.error('Discord skin-claim drop could not be marked as unsent.', error);
  }
}

function toCollectionDrop(entry: CollectionCatalogEntry, reserved: ReservedSkinDrop) {
  const isSkin = entry.type === 'skin';
  return {
    champion_name: isSkin ? entry.champion : collectionTypeTitle(entry.type),
    collection_metadata: collectionEntryMetadata(entry),
    collection_tier: isSkin ? null : entry.tier,
    collection_type: entry.type,
    image_url: collectionEntryImageUrl(entry),
    rarity: collectionEntryRarity(entry),
    release_date: isSkin ? entry.releaseDate : '2009-10-27',
    skin_code: reserved.skin_code,
    skin_line: isSkin ? entry.skinLine : collectionTypeTitle(entry.type),
    skin_name: isSkin ? entry.answer : entry.name,
  };
}

async function sendReservedSkinDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  entry: CollectionCatalogEntry,
  reserved: ReservedSkinDrop,
  raritySpawnPercent?: number,
) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isSendable()) {
    await abandonUnsentDrop(config, reserved.drop_id);
    console.error('Discord skin-claim drop could not use its configured channel.');
    return false;
  }

  try {
    const expiresAtSeconds = Math.floor(new Date(reserved.expires_at).getTime() / 1_000);
    const message = await channel.send({
      content: `React to claim this ${collectionTypeLabel(entry.type)}. Will expire <t:${expiresAtSeconds}:R>.`,
      embeds: [skinDropEmbed(toCollectionDrop(entry, reserved), undefined, false, raritySpawnPercent)],
    });
    const { error: attachError } = await createBotServiceClient(config).rpc('attach_discord_skin_claim_message', {
      p_drop_id: reserved.drop_id,
      p_guild_id: config.guildId,
      p_message_id: message.id,
    });
    if (attachError) {
      await message.delete().catch(() => undefined);
      throw new Error(`Unable to attach Discord skin-claim message: ${attachError.message}`);
    }
    return true;
  } catch (error) {
    await abandonUnsentDrop(config, reserved.drop_id);
    throw error;
  }
}

async function reserveAndSendSkinDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  triggerType: 'manual' | 'message' | 'timer',
  settings: SkinClaimRuntimeSettings,
  selectedSkin?: { catalog: CatalogSkin[]; skin: CatalogSkin },
) {
  const { catalog, skin } = selectedSkin ?? await chooseAvailableWeightedSkin(config, settings.rarityWeights);
  const dropArguments = {
    p_channel_id: channelId,
    p_champion_name: skin.champion,
    p_guild_id: config.guildId,
    p_image_url: getSkinDisplayImageUrl(skin),
    p_rarity: normalizeRarity(skin.rarity),
    p_release_date: skin.releaseDate,
    p_skin_catalog_id: skin.id,
    p_skin_line: skin.skinLine,
    p_skin_name: skin.answer,
  };
  const supabase = createBotServiceClient(config);
  const { data, error } = triggerType === 'manual'
    ? await supabase.rpc('force_reserve_discord_skin_claim_drop', dropArguments)
    : await supabase.rpc('reserve_discord_skin_claim_drop', { ...dropArguments, p_trigger_type: triggerType });
  if (error) throw new Error(`Unable to reserve Discord skin-claim drop: ${error.message}`);
  const reserved = getFirstResult(data as ReservedSkinDrop | ReservedSkinDrop[] | null);
  if (!reserved) return false;
  recordDropReservation(config);
  return sendReservedSkinDrop(
    config,
    guild,
    channelId,
    skin,
    reserved,
    calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights, catalog),
  );
}

async function reserveAndSendCollectionEntryDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  entry: Exclude<CollectionCatalogEntry, CatalogSkin>,
  raritySpawnPercent: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('force_reserve_discord_collection_drop', {
    p_catalog_id: collectionCatalogId(entry),
    p_channel_id: channelId,
    p_collection_metadata: collectionEntryMetadata(entry),
    p_collection_tier: entry.tier,
    p_collection_type: entry.type,
    p_guild_id: config.guildId,
    p_image_url: entry.imageUrl,
    p_name: entry.name,
  });
  if (error) throw new Error(`Unable to reserve Discord collection ${collectionTypeLabel(entry.type)} drop: ${error.message}`);
  const reserved = getFirstResult(data as ReservedSkinDrop | ReservedSkinDrop[] | null);
  if (!reserved) return false;
  return sendReservedSkinDrop(config, guild, channelId, entry, reserved, raritySpawnPercent);
}

export type SkinClaimSpawnResult = {
  channelId?: string;
  collectionType?: CollectionSpawnType;
  status: 'active-drop' | 'disabled' | 'not-configured' | 'spawned';
};

/**
 * Force a drop into the invoking channel without bypassing the database's
 * one-live-drop invariant. Settings are refreshed so a staff member can use
 * the command immediately after saving the website form.
 */
export async function forceSkinClaimDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  requestedType?: CollectionSpawnType,
): Promise<SkinClaimSpawnResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings) return { status: 'not-configured' };
  if (!settings.enabled) return { status: 'disabled' };

  const selection = await chooseAvailableCollectionEntry(config, requestedType, settings.rarityWeights);
  const spawned = selection.entry.type === 'skin'
    ? await reserveAndSendSkinDrop(config, guild, channelId, 'manual', settings, {
      catalog: selection.skinCatalog!,
      skin: selection.entry,
    })
    : await reserveAndSendCollectionEntryDrop(
      config,
      guild,
      channelId,
      selection.entry,
      calculateCollectionRaritySpawnPercent(
        selection.entry.rarity,
        settings.rarityWeights,
        selection.collectionCatalog!,
      ),
    );
  return spawned
    ? { channelId, collectionType: selection.entry.type, status: 'spawned' }
    : { status: 'active-drop' };
}

export async function getSkinClaimAdminRoleIds(config: DiscordBotConfig) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skin_claim_admin_roles')
    .select('discord_role_id')
    .eq('guild_id', config.guildId)
    .returns<SkinClaimAdminRoleRow[]>();
  if (error) throw new Error(`Unable to load Discord collection admin roles: ${error.message}`);
  return new Set((data ?? []).map((role) => role.discord_role_id));
}

/**
 * Configured command channels apply to every member-facing collection
 * command except the staff-only spawn command. An absent settings row keeps
 * the default open-channel behavior for guilds that have not configured drops.
 */
export async function isSkinCollectionCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const allowedChannelIds = await getSkinCollectionCommandChannelIds(config);
  return allowedChannelIds.length === 0 || allowedChannelIds.includes(channelId);
}

/** Returns the configured Collections command channels, or an empty array when Collections are open everywhere. */
export async function getSkinCollectionCommandChannelIds(config: DiscordBotConfig): Promise<readonly string[]> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skin_claim_command_channels')
    .select('channel_id')
    .eq('guild_id', config.guildId)
    .returns<SkinClaimCommandChannelRow[]>();
  if (error) throw new Error(`Unable to load Discord collection command channels: ${error.message}`);
  return [...new Set((data ?? []).map((entry) => entry.channel_id))];
}

function skinDropArguments(config: DiscordBotConfig, channelId: string, skin: CatalogSkin) {
  return {
    p_channel_id: channelId,
    p_champion_name: skin.champion,
    p_guild_id: config.guildId,
    p_image_url: getSkinDisplayImageUrl(skin),
    p_rarity: normalizeRarity(skin.rarity),
    p_release_date: skin.releaseDate,
    p_skin_catalog_id: skin.id,
    p_skin_line: skin.skinLine,
    p_skin_name: skin.answer,
  };
}

export type SummonSkinClaimResult = {
  availableAt?: string | null;
  channelId?: string;
  cost?: number | null;
  remainingBalance?: number;
  status: 'active-drop' | 'cooldown' | 'disabled' | 'insufficient-funds' | 'not-configured' | 'not-on-cooldown' | 'spawned';
};

export async function summonSkinClaimDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  discordUserId: string,
  force = false,
): Promise<SummonSkinClaimResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings) return { status: 'not-configured' };
  if (!settings.enabled) return { status: 'disabled' };
  if (!settings.eligibleChannelIds.has(channelId)) return { status: 'not-configured' };

  const skillLevels = await getCollectionFishingSkillLevels(config, discordUserId);
  const availableSkin = await chooseAvailableWeightedSkin(config, settings.rarityWeights);
  const { catalog } = availableSkin;
  const skin = maybeUpgradeSummonedSkin(availableSkin.skin, catalog, skillLevels.lucky_level);
  const { data, error } = await createBotServiceClient(config).rpc('summon_discord_skin_claim_drop', {
    ...skinDropArguments(config, channelId, skin),
    p_discord_user_id: discordUserId,
    p_force: force,
  });
  if (error) throw new Error(`Unable to summon Discord skin-claim drop: ${error.message}`);
  const reserved = getFirstResult(data as SummonedSkinDrop | SummonedSkinDrop[] | null);
  if (!reserved) return { status: 'active-drop' };
  if (reserved.outcome !== 'spawned') {
    return {
      availableAt: reserved.available_at,
      cost: reserved.charged_cost,
      remainingBalance: reserved.remaining_balance,
      status: reserved.outcome,
    };
  }
  recordDropReservation(config);
  const spawned = await sendReservedSkinDrop(
    config,
    guild,
    channelId,
    skin,
    reserved,
    calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights, catalog),
  );
  return spawned
    ? { availableAt: reserved.available_at, channelId, cost: reserved.charged_cost, remainingBalance: reserved.remaining_balance, status: 'spawned' }
    : { status: 'active-drop' };
}

export type GambleSkinClaimResult = {
  successChancePercent?: number;
  status: 'active-drop' | 'lost' | 'not-configured' | 'spawned';
  skinName?: string;
};

export async function gambleSkinClaim(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  discordUserId: string,
  skinCode: number,
  beforeSpawn?: (result: Pick<GambleSkinClaimResult, 'skinName' | 'successChancePercent'>) => Promise<void>,
): Promise<GambleSkinClaimResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings?.enabled || !settings.eligibleChannelIds.has(channelId)) return { status: 'not-configured' };

  const { catalog, skin } = await chooseAvailableWeightedSkin(config, settings.rarityWeights);
  const { data, error } = await createBotServiceClient(config).rpc('gamble_discord_skin_claim', {
    ...skinDropArguments(config, channelId, skin),
    p_discord_user_id: discordUserId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to gamble Discord skin: ${error.message}`);
  const result = getFirstResult(data as GambledSkinDrop | GambledSkinDrop[] | null);
  if (!result) return { status: 'active-drop' };
  if (result.outcome === 'blocked') return { status: 'active-drop', skinName: result.skin_name };
  if (result.outcome === 'lost') return { status: 'lost', skinName: result.skin_name, successChancePercent: result.success_chance_percent ?? undefined };
  if (!result.drop_id || !result.new_skin_code || !result.expires_at) {
    throw new Error('Skin gamble did not return its reserved drop.');
  }
  try {
    await beforeSpawn?.({
      skinName: result.skin_name,
      successChancePercent: result.success_chance_percent ?? undefined,
    });
  } catch (error) {
    await abandonUnsentDrop(config, result.drop_id);
    throw error;
  }
  recordDropReservation(config);
  const spawned = await sendReservedSkinDrop(config, guild, channelId, skin, {
    drop_id: result.drop_id,
    expires_at: result.expires_at,
    skin_code: result.new_skin_code,
  }, calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights, catalog));
  return spawned
    ? { status: 'spawned', skinName: result.skin_name, successChancePercent: result.success_chance_percent ?? undefined }
    : { status: 'active-drop', skinName: result.skin_name };
}

export async function attemptSkinClaimDropFromMessage(config: DiscordBotConfig, message: Message) {
  if (!message.inGuild() || message.guildId !== config.guildId || message.author.bot || message.system) return;
  const settings = await getSkinClaimSettings(config);
  if (!settings?.enabled || !settings.eligibleChannelIds.has(message.channelId)) return;
  const baseTime = settings.lastDropAt ?? settings.scheduleStartedAt;
  if (Date.now() < baseTime.getTime() + settings.minimumIntervalMinutes * 60_000) return;
  await reserveAndSendSkinDrop(config, message.guild, message.channelId, 'message', settings);
}

async function attemptTimedSkinClaimDrop(config: DiscordBotConfig, guild: Guild) {
  const settings = await getSkinClaimSettings(config);
  if (!settings?.enabled) return;
  const baseTime = settings.lastDropAt ?? settings.scheduleStartedAt;
  if (Date.now() < baseTime.getTime() + settings.maximumIntervalMinutes * 60_000) return;
  const channelId = chooseEligibleChannelId(settings);
  if (!channelId) return;
  await reserveAndSendSkinDrop(config, guild, channelId, 'timer', settings);
}

export function startDiscordSkinClaimScheduler(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId || scheduler) return;
  const tick = () => {
    if (timedDropInFlight) return;
    timedDropInFlight = attemptTimedSkinClaimDrop(config, guild)
      .catch((error: unknown) => console.error('Discord timed skin-claim drop failed.', error))
      .finally(() => { timedDropInFlight = null; });
  };
  tick();
  scheduler = setInterval(tick, SKIN_CLAIM_TIMER_INTERVAL_MS);
  scheduler.unref();
}

export async function reconcileDiscordSkinCollectionUpkeep(config: DiscordBotConfig) {
  const { data, error } = await createBotServiceClient(config).rpc('process_discord_skin_collection_upkeep', {
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to settle Discord collection upkeep: ${error.message}`);
  return (data ?? []) as CollectionUpkeepSettlement[];
}

function millisecondsUntilNextCollectionUpkeepRun(settlements: readonly CollectionUpkeepSettlement[] = []) {
  const now = new Date();
  const nextDailyRun = new Date(now);
  nextDailyRun.setUTCDate(now.getUTCDate() + 1);
  nextDailyRun.setUTCHours(0, 5, 0, 0);
  const nextGraceDeadline = settlements
    .filter((settlement) => settlement.grace_expires_at)
    .map((settlement) => new Date(settlement.grace_expires_at!).getTime())
    .filter((deadline) => Number.isFinite(deadline) && deadline > now.getTime())
    .sort((left, right) => left - right)[0];
  const nextRunAt = nextGraceDeadline === undefined
    ? nextDailyRun.getTime()
    : Math.min(nextDailyRun.getTime(), nextGraceDeadline + 1_000);
  return Math.max(1_000, nextRunAt - now.getTime());
}

function scheduleNextCollectionUpkeepRun(config: DiscordBotConfig, settlements: readonly CollectionUpkeepSettlement[] = []) {
  if (collectionUpkeepScheduler) clearTimeout(collectionUpkeepScheduler);
  collectionUpkeepScheduler = setTimeout(() => {
    collectionUpkeepScheduler = null;
    void runDiscordSkinCollectionUpkeep(config)
      .then((nextSettlements) => scheduleNextCollectionUpkeepRun(config, nextSettlements))
      .catch((error: unknown) => {
        console.error('Discord collection upkeep settlement failed.', error);
        scheduleNextCollectionUpkeepRun(config);
      });
  }, millisecondsUntilNextCollectionUpkeepRun(settlements));
  collectionUpkeepScheduler.unref();
}

async function runDiscordSkinCollectionUpkeep(config: DiscordBotConfig) {
  if (collectionUpkeepInFlight) return collectionUpkeepInFlight;
  collectionUpkeepInFlight = reconcileDiscordSkinCollectionUpkeep(config)
    .then((settlements) => {
      const openedGracePeriods = settlements.filter((settlement) => settlement.outcome === 'grace-opened').length;
      const releasedCollections = settlements.filter((settlement) => settlement.outcome === 'released').length;
      if (openedGracePeriods || releasedCollections) {
        console.info(`Discord collection upkeep settled: ${openedGracePeriods} grace period(s) opened, ${releasedCollections} collection(s) released.`);
      }
      return settlements;
    })
    .finally(() => { collectionUpkeepInFlight = null; });
  return collectionUpkeepInFlight;
}

/**
 * Reconciles once at startup to recover from downtime, then runs shortly after
 * each UTC midnight or at the next grace deadline. The database stores the
 * last assessed date, so restarts cannot charge a member twice.
 */
export function startDiscordSkinCollectionUpkeepScheduler(config: DiscordBotConfig) {
  if (collectionUpkeepScheduler || collectionUpkeepInFlight) return;
  void runDiscordSkinCollectionUpkeep(config)
    .then((settlements) => scheduleNextCollectionUpkeepRun(config, settlements))
    .catch((error: unknown) => {
      console.error('Discord collection upkeep startup reconciliation failed.', error);
      scheduleNextCollectionUpkeepRun(config);
    });
}

export async function handleSkinClaimReaction(
  config: DiscordBotConfig,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
) {
  const resolvedUser = user.partial ? await user.fetch() : user;
  if (resolvedUser.bot) return;
  const resolvedReaction = reaction.partial ? await reaction.fetch() : reaction;
  const message = resolvedReaction.message.partial ? await resolvedReaction.message.fetch() : resolvedReaction.message;
  if (!message.inGuild() || message.guildId !== config.guildId) return;
  const { data, error } = await createBotServiceClient(config).rpc('claim_discord_skin_drop', {
    p_discord_user_id: resolvedUser.id,
    p_guild_id: config.guildId,
    p_message_id: message.id,
  });
  if (error) throw new Error(`Unable to claim Discord skin drop: ${error.message}`);
  const claim = getFirstResult(data as ClaimedSkinDrop | ClaimedSkinDrop[] | null);
  if (!claim?.claimed) return;
  const type = collectionTypeLabel(claim.collection_type);
  await message.edit({
    components: skinClaimActionButtons(resolvedUser.id, claim.skin_code),
    content: `This ${type} has been claimed.`,
    embeds: [skinDropEmbed(claim, resolvedUser.id)],
  });
  await message.reply({
    allowedMentions: { parse: [], users: [resolvedUser.id] },
    content: `<@${resolvedUser.id}> claimed **${claim.skin_name}** · #${formatSkinCode(claim.skin_code)}.`,
  });
}

export async function getSkinCollectionPage(config: DiscordBotConfig, discordUserId: string, requestedPage: number): Promise<SkinCollectionPage> {
  const supabase = createBotServiceClient(config);
  const page = Math.max(0, Math.floor(requestedPage));
  const [collectionResult, settingsResult, capacityResult, sellValuesResult, upkeepResult, skillLevels] = await Promise.all([
    supabase
      .from('discord_skin_claim_drops')
      .select('skin_code, skin_catalog_id, skin_name, champion_name, rarity, release_date, skin_line, image_url, owner_acquired_at, ownership_method, is_favorite, collection_type, collection_tier, collection_metadata', { count: 'exact' })
      .eq('guild_id', config.guildId)
      .eq('owner_discord_user_id', discordUserId)
      .eq('status', 'claimed')
      .order('collection_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false })
      .range(page, page)
      .returns<Omit<ClaimedSkinDrop, 'claimed'>[]>(),
    supabase
      .from('discord_skin_claim_economy_settings')
      .select('default_collection_capacity')
      .eq('guild_id', config.guildId)
      .maybeSingle<CollectionCapacitySettingsRow>(),
    supabase
      .from('discord_skin_claim_collection_capacities')
      .select('extra_slots')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<CollectionCapacityRow>(),
    supabase
      .from('discord_skin_claim_sell_values')
      .select('rarity, amount')
      .eq('guild_id', config.guildId)
      .returns<CollectionSellValueRow[]>(),
    supabase
      .from('discord_skin_claim_collection_upkeep')
      .select('grace_expires_at, outstanding_amount')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<CollectionUpkeepRow>(),
    getCollectionFishingSkillLevels(config, discordUserId),
  ]);
  if (collectionResult.error) throw new Error(`Unable to read Discord skin collection: ${collectionResult.error.message}`);
  if (settingsResult.error) throw new Error(`Unable to read Discord collection capacity: ${settingsResult.error.message}`);
  if (capacityResult.error) throw new Error(`Unable to read Discord collection capacity: ${capacityResult.error.message}`);
  if (sellValuesResult.error) throw new Error(`Unable to read Discord skin sell values: ${sellValuesResult.error.message}`);
  if (upkeepResult.error) throw new Error(`Unable to read Discord collection upkeep: ${upkeepResult.error.message}`);
  if (!settingsResult.data) throw new Error('Discord collection economy has not been configured.');
  const total = collectionResult.count ?? 0;
  const capacity = settingsResult.data.default_collection_capacity + (capacityResult.data?.extra_slots ?? 0);
  const normalizedPage = total ? Math.min(page, total - 1) : 0;
  if (normalizedPage !== page) {
    return getSkinCollectionPage(config, discordUserId, normalizedPage);
  }
  const item = collectionResult.data?.[0] ? { ...collectionResult.data[0], claimed: true } : null;
  const baseSellValue = item
    ? (sellValuesResult.data ?? []).find((entry) => entry.rarity === item.rarity)?.amount ?? null
    : null;
  const sellValue = baseSellValue === null
    ? null
    : Math.ceil(baseSellValue * (1 + (skillLevels.money_mouser_level * 0.5)));
  const excessSkinCount = Math.max(0, total - COLLECTION_UPKEEP_FREE_SKIN_COUNT);
  const dailyCost = calculateCollectionDailyUpkeep(total, skillLevels.lucky_level);
  return {
    capacity,
    item,
    page: normalizedPage,
    sellValue,
    total,
    upkeep: {
      dailyCost,
      excessSkinCount,
      graceExpiresAt: upkeepResult.data?.grace_expires_at ?? null,
      outstandingAmount: upkeepResult.data?.outstanding_amount ?? 0,
    },
  };
}

export async function getSkinCollectionUpkeepOverview(config: DiscordBotConfig, discordUserId: string): Promise<CollectionUpkeepOverview> {
  const supabase = createBotServiceClient(config);
  const [page, balanceResult, allocationResult] = await Promise.all([
    getSkinCollectionPage(config, discordUserId, 0),
    supabase
      .from('discord_knowbucks_balances')
      .select('balance')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<KnowBucksBalanceRow>(),
    supabase
      .from('discord_skin_claim_collection_upkeep_allocations')
      .select('balance')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<CollectionUpkeepAllocationRow>(),
  ]);
  if (balanceResult.error) throw new Error(`Unable to read Discord KnowBucks balance: ${balanceResult.error.message}`);
  if (allocationResult.error) throw new Error(`Unable to read Discord collection upkeep allocation: ${allocationResult.error.message}`);
  const regularBalance = balanceResult.data?.balance ?? 0;
  const allocationBalance = allocationResult.data?.balance ?? 0;
  return {
    allocationBalance,
    combinedFunds: regularBalance + allocationBalance,
    dailyCost: page.upkeep.dailyCost,
    graceExpiresAt: page.upkeep.graceExpiresAt,
    outstandingAmount: page.upkeep.outstandingAmount,
    regularBalance,
    totalSkins: page.total,
  };
}

export async function fundSkinCollectionUpkeep(config: DiscordBotConfig, discordUserId: string, amount: number) {
  const { data, error } = await createBotServiceClient(config).rpc('fund_discord_skin_collection_upkeep', {
    p_amount: amount,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to fund Discord collection upkeep: ${error.message}`);
  const funding = getFirstResult(data as CollectionUpkeepFunding | CollectionUpkeepFunding[] | null);
  if (!funding) throw new Error('Collection upkeep funding did not return a result.');
  return funding;
}

export async function transferSkinClaim(
  config: DiscordBotConfig,
  senderDiscordUserId: string,
  recipientDiscordUserId: string,
  skinCode: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('transfer_discord_skin_claim', {
    p_guild_id: config.guildId,
    p_recipient_discord_user_id: recipientDiscordUserId,
    p_sender_discord_user_id: senderDiscordUserId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to transfer Discord skin: ${error.message}`);
  const transfer = getFirstResult(data as TransferredSkin | TransferredSkin[] | null);
  if (!transfer) throw new Error('Skin transfer did not return a result.');
  return transfer;
}

export async function purchaseSkinCollectionCapacity(
  config: DiscordBotConfig,
  discordUserId: string,
  slots: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_skin_collection_capacity', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_slots: slots,
  });
  if (error) throw new Error(`Unable to add Discord collection capacity: ${error.message}`);
  const purchase = getFirstResult(data as CollectionCapacityPurchase | CollectionCapacityPurchase[] | null);
  if (!purchase) throw new Error('Collection capacity purchase did not return a result.');
  return purchase;
}

export async function forceAddSkinCollectionCapacity(
  config: DiscordBotConfig,
  discordUserId: string,
  slots: number,
) {
  const { data, error } = await createBotServiceClient(config).rpc('force_add_discord_skin_collection_capacity', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_slots: slots,
  });
  if (error) throw new Error(`Unable to add Discord collection capacity: ${error.message}`);
  const capacity = getFirstResult(data as number | number[] | null);
  if (typeof capacity !== 'number') throw new Error('Collection capacity update did not return a result.');
  return capacity;
}

export async function stealSkinClaim(config: DiscordBotConfig, discordUserId: string, skinCode: number) {
  const { data, error } = await createBotServiceClient(config).rpc('steal_discord_skin_claim', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to steal Discord skin: ${error.message}`);
  const result = getFirstResult(data as StolenSkinClaim | StolenSkinClaim[] | null);
  if (!result) throw new Error('Skin steal did not return a result.');
  return result;
}

export async function favoriteSkinClaim(config: DiscordBotConfig, discordUserId: string, skinCode: number) {
  const { data, error } = await createBotServiceClient(config).rpc('favorite_discord_skin_claim', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to favorite Discord skin: ${error.message}`);
  const skinName = getFirstResult(data as string | string[] | null);
  if (!skinName) throw new Error('Favorite update did not return a result.');
  return skinName;
}

export async function reorderSkinCollection(config: DiscordBotConfig, discordUserId: string, skinCodes: readonly number[]) {
  const { error } = await createBotServiceClient(config).rpc('reorder_discord_skin_collection', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_skin_codes: skinCodes,
  });
  if (error) throw new Error(`Unable to reorder Discord skin collection: ${error.message}`);
}

export async function clearSkinCollection(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('clear_discord_skin_collection', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to clear Discord skin collection: ${error.message}`);
}

export async function sellSkinClaim(config: DiscordBotConfig, discordUserId: string, skinCode: number) {
  const { data, error } = await createBotServiceClient(config).rpc('sell_discord_skin_claim', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to sell Discord skin: ${error.message}`);
  const sale = getFirstResult(data as SoldSkinClaim | SoldSkinClaim[] | null);
  if (!sale) throw new Error('Skin sale did not return a result.');
  return sale;
}

export function findSkinCatalogEntry(query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return null;
  const matches = loadSkinCatalog().filter((skin) => (
    skin.answer.toLocaleLowerCase().includes(normalizedQuery)
    || skin.champion.toLocaleLowerCase().includes(normalizedQuery)
  ));
  return matches.sort((left, right) => {
    const leftName = left.answer.toLocaleLowerCase();
    const rightName = right.answer.toLocaleLowerCase();
    const leftRank = leftName === normalizedQuery ? 0 : leftName.startsWith(normalizedQuery) ? 1 : 2;
    const rightRank = rightName === normalizedQuery ? 0 : rightName.startsWith(normalizedQuery) ? 1 : 2;
    return leftRank - rightRank || left.answer.localeCompare(right.answer);
  })[0] ?? null;
}

export async function findSkinCollectionSearchResult(
  config: DiscordBotConfig,
  input: { skinCode?: number | null; skinName?: string | null },
): Promise<SkinSearchResult | null> {
  const skinName = input.skinName?.trim() ?? '';
  const skinCode = input.skinCode ?? null;
  if ((skinName && skinCode !== null) || (!skinName && skinCode === null)) {
    throw new Error('Search for a skin by either its name or its four-digit KnowLeague ID.');
  }

  const supabase = createBotServiceClient(config);
  if (skinCode !== null) {
    const { data, error } = await supabase
      .from('discord_skin_claim_drops')
      .select('skin_catalog_id, skin_code, owner_discord_user_id')
      .eq('guild_id', config.guildId)
      .eq('skin_code', skinCode)
      .in('status', ['pending', 'claimed'])
      .returns<SkinSearchClaimRow[]>();
    if (error) throw new Error(`Unable to search Discord collection skins: ${error.message}`);
    const claim = data?.[0];
    if (!claim) return null;
    const skin = loadSkinCatalog().find((entry) => entry.id === claim.skin_catalog_id);
    return skin ? { claims: [claim], skin } : null;
  }

  const skin = findSkinCatalogEntry(skinName);
  if (!skin) return null;
  const { data, error } = await supabase
    .from('discord_skin_claim_drops')
    .select('skin_catalog_id, skin_code, owner_discord_user_id')
    .eq('guild_id', config.guildId)
    .eq('skin_catalog_id', skin.id)
    .in('status', ['pending', 'claimed'])
    .order('skin_code', { ascending: true })
    .returns<SkinSearchClaimRow[]>();
  if (error) throw new Error(`Unable to search Discord collection skins: ${error.message}`);
  return { claims: data ?? [], skin };
}

export type SkinSearchOwner = {
  skinCode: number;
  username: string | null;
};

export function buildSkinSearchEmbed(skin: CatalogSkin, owners: readonly SkinSearchOwner[] = []) {
  const knowLeagueIds = owners.length
    ? owners.map((owner) => `#${formatSkinCode(owner.skinCode)}`).join(', ')
    : 'Not assigned yet';
  const ownerValue = owners.length
    ? owners.map((owner) => owner.username ?? 'Unclaimed').join('\n')
    : 'Unclaimed';
  return new EmbedBuilder()
    .setColor(RARITY_COLORS[normalizeRarity(skin.rarity)] ?? 0xF59E0B)
    .setTitle(`Skin preview · ${skin.answer}`)
    .setDescription('Catalogue preview only — this skin cannot be claimed from this message.')
    .setImage(getSkinDisplayImageUrl(skin))
    .addFields(
      { name: 'Champion', value: skin.champion, inline: true },
      { name: 'Rarity', value: normalizeRarity(skin.rarity), inline: true },
      { name: 'Release date', value: formatReleaseDate(skin.releaseDate), inline: true },
      { name: 'Skin line', value: skin.skinLine, inline: true },
      { name: 'KnowLeague ID', value: knowLeagueIds, inline: true },
      { name: owners.length > 1 ? 'Owners' : 'Owner', value: ownerValue, inline: true },
    );
}

export function buildSkinCollectionEmbed(page: SkinCollectionPage, ownerName: string, showDetails = false) {
  const upkeepSummary = page.upkeep.excessSkinCount
    ? `${formatKnowBucks(page.upkeep.dailyCost)} daily for ${page.upkeep.excessSkinCount} collection entr${page.upkeep.excessSkinCount === 1 ? 'y' : 'ies'} over 10`
    : 'Free (the first 10 collection entries are free)';
  if (!page.item) {
    return new EmbedBuilder()
      .setColor(0x64748B)
      .setTitle(`${ownerName}'s collection (max ${page.capacity})`)
      .setDescription(`No collection entries claimed yet. Watch for a drop and react first to claim it.\n\n**Daily collection upkeep:** ${upkeepSummary}`);
  }
  const type = collectionTypeLabel(page.item.collection_type);
  const typeTitle = collectionTypeTitle(page.item.collection_type);
  const isSkin = type === 'skin';
  const metadata = page.item.collection_metadata ?? {};
  const itemDetails = isSkin
    ? [
      `**Champion**\n${page.item.champion_name}`,
      `**Skin line**\n${page.item.skin_line}`,
      `**Release date**\n${formatReleaseDate(page.item.release_date)}`,
    ]
    : [
      `**Type**\n${typeTitle}`,
      `**Rarity**\n${collectionDropRarity(page.item)}`,
      ...(type === 'item'
        ? [
          `**Cost**\n${metadata.cost === null || metadata.cost === undefined ? 'No listed price' : `${new Intl.NumberFormat('en-US').format(metadata.cost)} gold`}`,
          `**Game modes**\n${metadata.gameModes?.join(', ') || 'Unspecified'}`,
          `**Available**\n${metadata.firstSeenVersion ?? 'Unknown'} to ${metadata.lastSeenVersion ?? 'Unknown'}`,
        ]
        : [
          `**Rune kind**\n${metadata.runeKind === 'sub-rune' ? 'Sub rune' : metadata.runeKind === 'keystone' ? 'Keystone' : 'Rune style'}`,
          `**Rune style**\n${metadata.style ?? 'Unknown'}`,
        ]),
    ];
  const embed = new EmbedBuilder()
    .setColor(collectionDropColor(page.item))
    .setTitle(`${ownerName}'s collection · ${page.page + 1} of ${page.total} (max ${page.capacity})`)
    .setDescription(`**${page.item.skin_name} (#${formatSkinCode(page.item.skin_code)})** · **${typeTitle} · ${collectionDropRarity(page.item)}**`)
    .setImage(getClaimedSkinDisplayImageUrl(page.item))
    .setFooter({ text: `Entry ${page.page + 1} of ${page.total} · Use /collections give to transfer #${formatSkinCode(page.item.skin_code)}.` });

  embed.setDescription(`${embed.data.description ?? ''}\n**Daily collection upkeep:** ${upkeepSummary}`);
  if (!showDetails) return embed;

  return embed.addFields(
    {
      name: typeTitle,
      value: itemDetails.join('\n\n'),
      inline: true,
    },
    {
      name: 'Collection details',
      value: [
        `**KnowLeague ID**\n#${formatSkinCode(page.item.skin_code)}`,
        `**Sells for**\n${formatKnowBucks(page.sellValue)}`,
        `**Acquired**\n${formatAcquiredDate(page.item.owner_acquired_at)}`,
        `**Method**\n${formatOwnershipMethod(page.item.ownership_method)}`,
        `**Daily upkeep**\n${page.upkeep.excessSkinCount
          ? `${formatKnowBucks(page.upkeep.dailyCost)} for ${page.upkeep.excessSkinCount} collection entr${page.upkeep.excessSkinCount === 1 ? 'y' : 'ies'} over 10`
          : 'None — your first 10 collection entries are free.'}`,
        ...(page.upkeep.graceExpiresAt
          ? [`**Payment due**\n${formatKnowBucks(page.upkeep.outstandingAmount)} by <t:${Math.floor(new Date(page.upkeep.graceExpiresAt).getTime() / 1_000)}:R>`]
          : []),
      ].join('\n\n'),
      inline: true,
    },
  );
}

export function skinCollectionCode(skinCode: number) {
  return formatSkinCode(skinCode);
}
