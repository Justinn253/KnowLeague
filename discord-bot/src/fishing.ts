import { randomInt } from 'node:crypto';
import { ButtonBuilder, ButtonStyle, EmbedBuilder, type Guild } from 'discord.js';
import type { DiscordBotConfig } from './config.js';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_CRATES,
  FISHING_CRATE_LOOT,
  FISHING_EXPEDITION_LENGTHS,
  FISHING_FISH,
  FISHING_UPGRADES,
  formatFishingDuration,
  getFishingBiome,
  getFishingCrate,
  getFishingExpeditionLength,
  getFishingSaleBonusPercent,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingTimeReductionPercent,
  resolveFishingExpedition,
  resolveFishingCrateOpenings,
  shouldInstantlyCompleteFishingExpedition,
  type FishingBiomeId,
  type FishingCrateOpeningResult,
  type FishingCrateRarity,
  type FishingDurationTier,
  type FishingEquipmentSnapshot,
  type FishingExpeditionResult,
  type FishingFish,
  type FishingRarity,
  type FishingUpgrade,
  type FishingUpgradeCategory,
} from './fishing-catalog.js';
import { createBotServiceClient } from './supabase.js';

type FishingPlayerRow = {
  crew_one_unlocked: boolean;
  crew_two_unlocked: boolean;
  equipped_bait_id: string;
  equipped_rod_id: string;
};

type FishingInventoryRow = {
  item_id: string;
  quantity: number;
};

type FishingExpeditionRow = {
  biome_id: FishingBiomeId;
  completes_at: string;
  crew_slot: number;
  discord_user_id: string;
  duration_tier: FishingDurationTier;
  equipment_snapshot: FishingEquipmentSnapshot;
  id: number;
  notification_channel_id: string;
  notification_message_id: string | null;
  outcome_seed: number;
  result: FishingExpeditionResult | null;
  started_at: string;
  status: 'active' | 'completed';
};

type FishingCommandSettingsRow = {
  command_all_channels: boolean;
};

type FishingCommandChannelRow = {
  channel_id: string;
};

type FishingCatalogueCatchRow = {
  biome_id: FishingBiomeId;
  fish_name: string;
  fish_rarity: FishingRarity;
};

type StartedExpeditionRow = { completes_at: string; expedition_id: number };
type PurchaseUpgradeRow = { crew_slots: number; current_balance: number };
type OpenAllFishingCratesRow = { current_balance: number; opened_count: number };
type SettledExpeditionRow = {
  awarded_gear_item_ids: string[];
  current_balance: number | null;
  discord_user_id: string | null;
  knowbucks_awarded: number;
  notification_channel_id: string | null;
  result: FishingExpeditionResult | null;
  settled: boolean;
};

export type FishingPlayerState = {
  balance: number;
  chatLevel: number;
  crewSlots: number;
  equipment: FishingEquipmentSnapshot;
  inventory: FishingInventoryRow[];
};

export type FishingCatalogueProgress = {
  caughtFish: readonly Pick<FishingFish, 'biomeId' | 'name' | 'rarity'>[];
  ownedGearItemIds: ReadonlySet<string>;
};

export type StartedFishingExpedition = {
  biomeName: string;
  crewSlot: number;
  durationSeconds: number;
  expeditionId: number;
  instantCompletion: boolean;
};

export type FishingRepeatPreset = {
  biomeId: FishingBiomeId;
  crewSlot: number;
  durationTier: FishingDurationTier;
  ownerDiscordUserId: string;
};

export const FISHING_REPEAT_BUTTON_PREFIX = 'fish-repeat';

export type FishingShopPurchase = {
  balance: number;
  cost: number;
  crewSlots: number;
  upgrade: FishingUpgrade;
};

export type OpenedFishingCrates = {
  currentBalance: number;
  items: FishingCrateOpeningResult['items'];
  openedCount: number;
  totalSaleValue: number;
};

const FISHING_SCHEDULER_INTERVAL_MS = 5_000;
const FISHING_COMMAND_SETTINGS_CACHE_MS = 30_000;
let scheduler: ReturnType<typeof setInterval> | null = null;
let settlementInFlight: Promise<void> | null = null;
let cachedFishingCommandSettings: { allowedChannelIds: Set<string> | null; expiresAt: number } | null = null;

function getFirstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function normalizeEquipmentSnapshot(snapshot: FishingEquipmentSnapshot): FishingEquipmentSnapshot {
  const rod = getFishingUpgrade(snapshot.rodItemId);
  const bait = getFishingUpgrade(snapshot.baitItemId);
  if (rod?.category !== 'rod' || bait?.category !== 'bait') {
    throw new Error('Fishing equipment contains an invalid upgrade.');
  }
  const passiveItemIds = [...new Set(snapshot.passiveItemIds ?? [])]
    .filter((itemId) => {
      const item = getFishingUpgrade(itemId);
      return item?.category === 'gear' || item?.category === 'skill';
    });
  const catalogueVersion = snapshot.catalogueVersion === 2 || snapshot.catalogueVersion === 3
    ? snapshot.catalogueVersion
    : 4;
  return { catalogueVersion, rodItemId: rod.id, baitItemId: bait.id, passiveItemIds };
}

async function ensureFishingPlayer(config: DiscordBotConfig, discordUserId: string) {
  const { error } = await createBotServiceClient(config).rpc('ensure_discord_fishing_player', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
  });
  if (error) throw new Error(`Unable to initialize Discord fishing: ${error.message}`);
}

export async function getFishingPlayerState(config: DiscordBotConfig, discordUserId: string): Promise<FishingPlayerState> {
  await ensureFishingPlayer(config, discordUserId);
  const supabase = createBotServiceClient(config);
  const [playerResult, inventoryResult, balanceResult, levelResult] = await Promise.all([
    supabase
      .from('discord_fishing_players')
      .select('crew_one_unlocked,crew_two_unlocked,equipped_bait_id,equipped_rod_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .single<FishingPlayerRow>(),
    supabase
      .from('discord_fishing_inventory')
      .select('item_id,quantity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .order('item_id', { ascending: true })
      .returns<FishingInventoryRow[]>(),
    supabase
      .from('discord_knowbucks_balances')
      .select('balance')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<{ balance: number }>(),
    supabase
      .from('discord_leveling_members')
      .select('level')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle<{ level: number }>(),
  ]);
  if (playerResult.error) throw new Error(`Unable to load Discord fishing profile: ${playerResult.error.message}`);
  if (inventoryResult.error) throw new Error(`Unable to load Discord fishing inventory: ${inventoryResult.error.message}`);
  if (balanceResult.error) throw new Error(`Unable to load Discord fishing balance: ${balanceResult.error.message}`);
  if (levelResult.error) throw new Error(`Unable to load Discord chat level for fishing: ${levelResult.error.message}`);
  if (!playerResult.data) throw new Error('Discord fishing profile was not created.');

  const inventory = inventoryResult.data ?? [];
  return {
    balance: balanceResult.data?.balance ?? 0,
    chatLevel: levelResult.data?.level ?? 1,
    crewSlots: 1 + Number(playerResult.data.crew_one_unlocked) + Number(playerResult.data.crew_two_unlocked),
    equipment: normalizeEquipmentSnapshot({
      catalogueVersion: 4,
      rodItemId: playerResult.data.equipped_rod_id,
      baitItemId: playerResult.data.equipped_bait_id,
      passiveItemIds: inventory
        .map((item) => item.item_id)
        .filter((itemId) => {
          const item = getFishingUpgrade(itemId);
          return item?.category === 'gear' || item?.category === 'skill';
        }),
    }),
    inventory,
  };
}

async function getActiveExpeditions(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_fishing_expeditions')
    .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .eq('status', 'active')
    .order('completes_at', { ascending: true })
    .returns<FishingExpeditionRow[]>();
  if (error) throw new Error(`Unable to load active fishing expeditions: ${error.message}`);
  return data ?? [];
}

export function selectFishingCrewSlot(
  crewSlots: number,
  activeCrewSlots: readonly number[],
  requestedCrewSlot?: number,
) {
  const crewSlot = requestedCrewSlot ?? Array.from({ length: crewSlots }, (_, index) => index + 1)
    .find((slot) => !activeCrewSlots.includes(slot));
  if (!Number.isInteger(crewSlot) || !crewSlot || crewSlot < 1 || crewSlot > crewSlots) {
    throw new Error('Every unlocked crew slot is already on an expedition.');
  }
  if (activeCrewSlots.includes(crewSlot)) {
    throw new Error(`Crew slot ${crewSlot} is already on an expedition.`);
  }
  return crewSlot;
}

export function buildFishingRepeatCustomId(preset: FishingRepeatPreset) {
  return [
    FISHING_REPEAT_BUTTON_PREFIX,
    preset.ownerDiscordUserId,
    preset.biomeId,
    preset.durationTier,
    preset.crewSlot,
  ].join(':');
}

export function parseFishingRepeatCustomId(customId: string): FishingRepeatPreset | null {
  const [prefix, ownerDiscordUserId, biomeId, durationTierRaw, crewSlotRaw, ...extra] = customId.split(':');
  if (prefix !== FISHING_REPEAT_BUTTON_PREFIX || !ownerDiscordUserId || !biomeId || !durationTierRaw || !crewSlotRaw || extra.length > 0) {
    return null;
  }

  const durationTier = Number(durationTierRaw);
  const crewSlot = Number(crewSlotRaw);
  if (
    !Number.isSafeInteger(durationTier)
    || !Number.isSafeInteger(crewSlot)
    || !getFishingBiome(biomeId as FishingBiomeId)
    || !getFishingExpeditionLength(durationTier as FishingDurationTier)
    || crewSlot < 1
    || crewSlot > 3
  ) {
    return null;
  }

  return {
    biomeId: biomeId as FishingBiomeId,
    crewSlot,
    durationTier: durationTier as FishingDurationTier,
    ownerDiscordUserId,
  };
}

export async function isFishingCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const now = Date.now();
  if (!cachedFishingCommandSettings || cachedFishingCommandSettings.expiresAt <= now) {
    const supabase = createBotServiceClient(config);
    const { data: settings, error: settingsError } = await supabase
      .from('discord_fishing_settings')
      .select('command_all_channels')
      .eq('guild_id', config.guildId)
      .maybeSingle<FishingCommandSettingsRow>();
    if (settingsError) throw new Error(`Unable to load fishing command settings: ${settingsError.message}`);

    if (!settings || settings.command_all_channels) {
      cachedFishingCommandSettings = { allowedChannelIds: null, expiresAt: now + FISHING_COMMAND_SETTINGS_CACHE_MS };
    } else {
      const { data: channels, error: channelsError } = await supabase
        .from('discord_fishing_command_channels')
        .select('channel_id')
        .eq('guild_id', config.guildId)
        .returns<FishingCommandChannelRow[]>();
      if (channelsError) throw new Error(`Unable to load fishing command channels: ${channelsError.message}`);
      cachedFishingCommandSettings = {
        allowedChannelIds: new Set((channels ?? []).map((channel) => channel.channel_id)),
        expiresAt: now + FISHING_COMMAND_SETTINGS_CACHE_MS,
      };
    }
  }

  return cachedFishingCommandSettings.allowedChannelIds === null
    || cachedFishingCommandSettings.allowedChannelIds.has(channelId);
}

export async function startFishingExpedition(
  config: DiscordBotConfig,
  discordUserId: string,
  biomeId: FishingBiomeId,
  durationTier: FishingDurationTier,
  notificationChannelId: string,
  requestedCrewSlot?: number,
): Promise<StartedFishingExpedition> {
  const biome = getFishingBiome(biomeId);
  const expeditionLength = getFishingExpeditionLength(durationTier);
  if (!biome || !expeditionLength) throw new Error('Choose a valid fishing biome and expedition length.');
  const [state, activeExpeditions] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    getActiveExpeditions(config, discordUserId),
  ]);
  const crewSlot = selectFishingCrewSlot(
    state.crewSlots,
    activeExpeditions.map((expedition) => expedition.crew_slot),
    requestedCrewSlot,
  );
  if (state.chatLevel < expeditionLength.requiredChatLevel) {
    throw new Error(`Expedition length ${durationTier} unlocks at chat level ${expeditionLength.requiredChatLevel}.`);
  }
  if (biome.requiredBoatUpgradeId && !state.inventory.some((item) => item.item_id === biome.requiredBoatUpgradeId)) {
    const upgrade = getFishingUpgrade(biome.requiredBoatUpgradeId);
    throw new Error(`${biome.name} requires the ${upgrade?.name ?? 'required boat upgrade'}.`);
  }
  const outcomeSeed = randomInt(1, 2_147_483_648);
  const instantCompletion = shouldInstantlyCompleteFishingExpedition(state.equipment, outcomeSeed, crewSlot > 1);
  const durationSeconds = instantCompletion
    ? 0
    : calculateFishingDurationSeconds(durationTier, crewSlot > 1, getFishingTimeReductionPercent(state.equipment));
  if (durationSeconds === null) throw new Error('Fishing expedition duration is invalid.');

  const { data, error } = await createBotServiceClient(config).rpc('start_discord_fishing_expedition', {
    p_biome_id: biomeId,
    p_crew_slot: crewSlot,
    p_discord_user_id: discordUserId,
    p_duration_seconds: durationSeconds,
    p_duration_tier: durationTier,
    p_equipment_snapshot: state.equipment,
    p_guild_id: config.guildId,
    p_notification_channel_id: notificationChannelId,
    p_outcome_seed: outcomeSeed,
  });
  if (error) throw new Error(`Unable to start Discord fishing expedition: ${error.message}`);
  const started = getFirstResult(data as StartedExpeditionRow | StartedExpeditionRow[] | null);
  if (!started) throw new Error('Discord fishing expedition did not return a result.');
  return { biomeName: biome.name, crewSlot, durationSeconds, expeditionId: started.expedition_id, instantCompletion };
}

export async function attachFishingExpeditionMessage(
  config: DiscordBotConfig,
  discordUserId: string,
  expeditionId: number,
  messageId: string,
) {
  const { data, error } = await createBotServiceClient(config).rpc('attach_discord_fishing_expedition_message', {
    p_discord_user_id: discordUserId,
    p_expedition_id: expeditionId,
    p_guild_id: config.guildId,
    p_notification_message_id: messageId,
  });
  if (error) throw new Error(`Unable to attach Discord fishing expedition message: ${error.message}`);
  if (data !== true) throw new Error('Fishing expedition is no longer active, so its launch message could not be attached.');
}

export async function getFishingProgress(config: DiscordBotConfig, discordUserId: string) {
  const [state, activeResult, completedResult] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    getActiveExpeditions(config, discordUserId),
    createBotServiceClient(config)
      .from('discord_fishing_expeditions')
      .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('status', 'completed')
      .order('settled_at', { ascending: false })
      .limit(1)
      .returns<FishingExpeditionRow[]>(),
  ]);
  if (completedResult.error) throw new Error(`Unable to load recent fishing expedition: ${completedResult.error.message}`);
  return { state, active: activeResult, mostRecent: completedResult.data?.[0] ?? null };
}

export async function getFishingCatalogueProgress(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<FishingCatalogueProgress> {
  const [state, catchesResult] = await Promise.all([
    getFishingPlayerState(config, discordUserId),
    createBotServiceClient(config)
      .from('discord_fishing_catalogue_catches')
      .select('biome_id,fish_name,fish_rarity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .returns<FishingCatalogueCatchRow[]>(),
  ]);
  if (catchesResult.error) throw new Error(`Unable to load fishing catalogue progress: ${catchesResult.error.message}`);

  return {
    caughtFish: (catchesResult.data ?? []).map((entry) => ({
      biomeId: entry.biome_id,
      name: entry.fish_name,
      rarity: entry.fish_rarity,
    })),
    ownedGearItemIds: new Set(
      state.inventory
        .map((entry) => getFishingUpgrade(entry.item_id))
        .filter((item): item is FishingUpgrade => item?.category === 'gear')
        .map((item) => item.id),
    ),
  };
}

export function isFishingFishCaught(progress: FishingCatalogueProgress, fish: Pick<FishingFish, 'biomeId' | 'name' | 'rarity'>) {
  return progress.caughtFish.some((caughtFish) => (
    caughtFish.biomeId === fish.biomeId
    && caughtFish.name === fish.name
    && caughtFish.rarity === fish.rarity
  ));
}

export async function purchaseFishingUpgrade(config: DiscordBotConfig, discordUserId: string, itemId: string): Promise<FishingShopPurchase> {
  const upgrade = getFishingUpgrade(itemId);
  if (!upgrade || upgrade.cost <= 0) throw new Error('That fishing shop item is unavailable.');
  const state = await getFishingPlayerState(config, discordUserId);
  const ownedItemIds = state.inventory.map((item) => item.item_id);
  if (upgrade.requiredUpgradeId && !ownedItemIds.includes(upgrade.requiredUpgradeId)) {
    const requiredUpgrade = getFishingUpgrade(upgrade.requiredUpgradeId);
    throw new Error(`This upgrade requires ${requiredUpgrade?.name ?? 'the previous level'} first.`);
  }
  const cost = getFishingUpgradeCost(upgrade, ownedItemIds);
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_fishing_upgrade', {
    p_category: upgrade.category,
    p_cost: cost,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_item_id: upgrade.id,
    p_required_chat_level: upgrade.requiredChatLevel ?? 1,
  });
  if (error) throw new Error(`Unable to purchase fishing upgrade: ${error.message}`);
  const purchase = getFirstResult(data as PurchaseUpgradeRow | PurchaseUpgradeRow[] | null);
  if (!purchase) throw new Error('Fishing shop purchase did not return a result.');
  return { balance: purchase.current_balance, cost, crewSlots: purchase.crew_slots, upgrade };
}

export async function equipFishingUpgrade(config: DiscordBotConfig, discordUserId: string, itemId: string) {
  const upgrade = getFishingUpgrade(itemId);
  if (!upgrade || !['rod', 'bait'].includes(upgrade.category)) throw new Error('Only owned rods and bait can be equipped.');
  const { error } = await createBotServiceClient(config).rpc('equip_discord_fishing_upgrade', {
    p_category: upgrade.category,
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_item_id: upgrade.id,
  });
  if (error) throw new Error(`Unable to equip fishing upgrade: ${error.message}`);
  return upgrade;
}

export async function openAllFishingCrates(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<OpenedFishingCrates> {
  const state = await getFishingPlayerState(config, discordUserId);
  const heldCrates = state.inventory
    .map((entry) => ({ crate: getFishingCrate(entry.item_id), quantity: entry.quantity }))
    .filter((entry): entry is { crate: NonNullable<ReturnType<typeof getFishingCrate>>; quantity: number } => Boolean(entry.crate));
  if (heldCrates.length === 0) throw new Error('You do not have any legacy fishing chests to open.');

  const saleBonusPercent = getFishingSaleBonusPercent(state.equipment);
  const openedItems = new Map<string, FishingCrateOpeningResult['items'][number]>();
  let totalSaleValue = 0;
  let openedCount = 0;
  for (const { crate, quantity } of heldCrates) {
    const opening = resolveFishingCrateOpenings(crate.id, quantity, saleBonusPercent, randomInt(1, 2_147_483_648));
    openedCount += quantity;
    totalSaleValue += opening.totalSaleValue;
    for (const item of opening.items) {
      const existingItem = openedItems.get(item.itemId);
      if (existingItem) {
        existingItem.quantity += item.quantity;
        existingItem.saleValue += item.saleValue;
      } else {
        openedItems.set(item.itemId, { ...item });
      }
    }
  }

  const { data, error } = await createBotServiceClient(config).rpc('open_all_discord_fishing_crates', {
    p_crates: heldCrates.map(({ crate, quantity }) => ({ item_id: crate.id, quantity })),
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_knowbucks_awarded: totalSaleValue,
  });
  if (error) throw new Error(`Unable to open legacy fishing chests: ${error.message}`);
  const opened = getFirstResult(data as OpenAllFishingCratesRow | OpenAllFishingCratesRow[] | null);
  if (!opened || opened.opened_count !== openedCount) throw new Error('Legacy fishing chest opening did not return a result.');
  return { currentBalance: opened.current_balance, items: [...openedItems.values()], openedCount: opened.opened_count, totalSaleValue };
}

const FISHING_CRATE_RARITY_MARKERS: Record<FishingCrateRarity, string> = {
  Common: '⬜',
  Uncommon: '🟩',
  Rare: '🟦',
  Epic: '🟪',
  Legendary: '🟨',
};

function formatCatch(catchItem: FishingExpeditionResult['catches'][number]) {
  const quantity = catchItem.quantity > 1 ? ` x${formatNumber(catchItem.quantity)}` : '';
  if (catchItem.kind === 'fish') {
    return `**${catchItem.name}** (${catchItem.rarity})${quantity} — sold for ${formatNumber(catchItem.saleValue)} KnowBucks`;
  }
  if (catchItem.kind === 'crate') {
    return `${FISHING_CRATE_RARITY_MARKERS[catchItem.rarity]} **${catchItem.name}** -> **${catchItem.lootName}** (${catchItem.lootRarity})${quantity} — sold for ${formatNumber(catchItem.saleValue)} KnowBucks`;
  }
  return `✨ **GEAR FOUND: ${catchItem.name}** — permanently added to inventory`;
}

function buildFishingCatchFields(name: string, catches: FishingExpeditionResult['catches']) {
  const values: string[] = [];
  let currentValue = '';
  for (const catchItem of catches) {
    const line = formatCatch(catchItem);
    const nextValue = currentValue ? `${currentValue}\n${line}` : line;
    if (nextValue.length > 1_024 && currentValue) {
      values.push(currentValue);
      currentValue = line;
    } else {
      currentValue = nextValue;
    }
  }
  if (currentValue) values.push(currentValue);
  return values.map((value, index) => ({ name: index === 0 ? name : `${name} (continued)`, value }));
}

export function buildFishingCompletionEmbed(biomeId: FishingBiomeId, result: FishingExpeditionResult, reward: number, balance: number) {
  const biome = getFishingBiome(biomeId);
  return new EmbedBuilder()
    .setColor(0x0EA5E9)
    .setTitle(`${biome?.name ?? 'Fishing'} expedition complete`)
    .setDescription(result.crateSaleValue > 0
      ? `You earned ${formatNumber(result.fishSaleValue)} KnowBucks from your sold fish. Crate items earned ${formatNumber(result.crateSaleValue)} KnowBucks. New balance: ${formatNumber(balance)} KnowBucks.`
      : `You earned ${formatNumber(reward)} KnowBucks from your sold fish. New balance: ${formatNumber(balance)} KnowBucks.`)
    .addFields(
      ...buildFishingCatchFields('Fish caught', result.catches.filter((catchItem) => catchItem.kind === 'fish')),
      ...buildFishingCatchFields('Crates opened', result.catches.filter((catchItem) => catchItem.kind === 'crate')),
      ...buildFishingCatchFields('Gear found', result.catches.filter((catchItem) => catchItem.kind === 'gear')),
    );
}

function buildFishingCompletionComponents(preset: FishingRepeatPreset) {
  return [{
    type: 1 as const,
    components: [
      new ButtonBuilder()
        .setCustomId(buildFishingRepeatCustomId(preset))
        .setStyle(ButtonStyle.Primary)
        .setLabel('Fish again'),
    ],
  }];
}

async function settleFishingExpedition(config: DiscordBotConfig, guild: Guild, expedition: FishingExpeditionRow) {
  const equipment = normalizeEquipmentSnapshot(expedition.equipment_snapshot);
  const result = resolveFishingExpedition(
    expedition.biome_id,
    expedition.duration_tier,
    equipment,
    expedition.outcome_seed,
    expedition.crew_slot > 1,
  );
  const reward = result.fishSaleValue + result.crateSaleValue + result.knowBucksFound;
  const { data, error } = await createBotServiceClient(config).rpc('settle_discord_fishing_expedition', {
    p_expedition_id: expedition.id,
    p_knowbucks_awarded: reward,
    p_result: result,
    p_special_items: result.gearItems ?? [],
  });
  if (error) throw new Error(`Unable to settle Discord fishing expedition: ${error.message}`);
  const settled = getFirstResult(data as SettledExpeditionRow | SettledExpeditionRow[] | null);
  if (!settled?.settled || !settled.discord_user_id || !settled.notification_channel_id || !settled.result) return;

  const channel = await guild.channels.fetch(settled.notification_channel_id).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error(`Discord fishing expedition ${expedition.id} completed, but its notification channel is unavailable.`);
    return;
  }

  const awardedGearItemIds = new Set(settled.awarded_gear_item_ids ?? []);
  const displayedResult: FishingExpeditionResult = {
    ...settled.result,
    catches: settled.result.catches.filter((catchItem) => catchItem.kind !== 'gear' || awardedGearItemIds.has(catchItem.itemId)),
    gearItems: (settled.result.gearItems ?? []).filter((gear) => awardedGearItemIds.has(gear.itemId)),
  };
  const completion = {
    allowedMentions: { parse: [] as const },
    components: buildFishingCompletionComponents({
      biomeId: expedition.biome_id,
      crewSlot: expedition.crew_slot,
      durationTier: expedition.duration_tier,
      ownerDiscordUserId: settled.discord_user_id,
    }),
    content: `<@${settled.discord_user_id}> your fishing expedition is complete!`,
    embeds: [buildFishingCompletionEmbed(expedition.biome_id, displayedResult, settled.knowbucks_awarded, settled.current_balance ?? settled.knowbucks_awarded)],
  };

  if (expedition.notification_message_id) {
    try {
      const message = await channel.messages.fetch(expedition.notification_message_id);
      await message.edit(completion);
      return;
    } catch (error) {
      console.warn(`Discord fishing expedition ${expedition.id} could not update its launch message; sending a completion notice instead.`, error);
    }
  }

  await channel.send({
    allowedMentions: { users: [settled.discord_user_id] },
    components: buildFishingCompletionComponents({
      biomeId: expedition.biome_id,
      crewSlot: expedition.crew_slot,
      durationTier: expedition.duration_tier,
      ownerDiscordUserId: settled.discord_user_id,
    }),
    content: `<@${settled.discord_user_id}> your fishing expedition is complete!`,
    embeds: [buildFishingCompletionEmbed(expedition.biome_id, displayedResult, settled.knowbucks_awarded, settled.current_balance ?? settled.knowbucks_awarded)],
  });
}

async function settleDueFishingExpeditions(config: DiscordBotConfig, guild: Guild) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_fishing_expeditions')
    .select('id,biome_id,completes_at,crew_slot,discord_user_id,duration_tier,equipment_snapshot,notification_channel_id,notification_message_id,outcome_seed,result,started_at,status')
    .eq('guild_id', config.guildId)
    .eq('status', 'active')
    .lte('completes_at', new Date().toISOString())
    .order('completes_at', { ascending: true })
    .limit(25)
    .returns<FishingExpeditionRow[]>();
  if (error) throw new Error(`Unable to find completed Discord fishing expeditions: ${error.message}`);
  for (const expedition of data ?? []) {
    try {
      await settleFishingExpedition(config, guild, expedition);
    } catch (error) {
      console.error(`Discord fishing expedition ${expedition.id} settlement failed.`, error);
    }
  }
}

export async function reconcileDueFishingExpeditions(config: DiscordBotConfig, guild: Guild) {
  if (settlementInFlight) return settlementInFlight;
  const run = settleDueFishingExpeditions(config, guild);
  settlementInFlight = run;
  try {
    await run;
  } finally {
    if (settlementInFlight === run) settlementInFlight = null;
  }
}

export function startDiscordFishingScheduler(config: DiscordBotConfig, guild: Guild) {
  if (guild.id !== config.guildId || scheduler) return;
  const tick = () => {
    void reconcileDueFishingExpeditions(config, guild)
      .catch((error: unknown) => console.error('Discord fishing expedition reconciliation failed.', error));
  };
  tick();
  scheduler = setInterval(tick, FISHING_SCHEDULER_INTERVAL_MS);
  scheduler.unref();
}

export function getFishingShopItems(category: FishingUpgradeCategory) {
  return FISHING_UPGRADES.filter((upgrade) => upgrade.category === category && upgrade.cost > 0);
}

export function describeFishingEquipment(equipment: FishingEquipmentSnapshot) {
  const display = (itemId: string) => getFishingUpgrade(itemId)?.name ?? itemId;
  return {
    bait: display(equipment.baitItemId),
    passives: equipment.passiveItemIds.length > 0 ? equipment.passiveItemIds.map(display).join(', ') : 'None',
    rod: display(equipment.rodItemId),
  };
}

export { FISHING_BIOMES, FISHING_CRATES, FISHING_CRATE_LOOT, FISHING_EXPEDITION_LENGTHS, FISHING_FISH, FISHING_UPGRADES, formatFishingDuration, getFishingBiome, getFishingCrate, getFishingExpeditionLength, getFishingUpgrade, getFishingUpgradeCost };
export type { FishingBiomeId, FishingDurationTier, FishingUpgradeCategory };
