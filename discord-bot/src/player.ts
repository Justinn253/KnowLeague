import type { DiscordBotConfig } from './config.js';
import { getFishingUpgrade, getFishingUpgradeCost, getVisibleFishingShopItems } from './fishing.js';
import type { FishingUpgrade } from './fishing-catalog.js';
import { getKnowBucksBalance } from './knowbucks.js';
import { getDiscordLevelProgress } from './leveling.js';
import { PLAYER_SKILL_TIER_CONFIG } from './minigame-content-config.js';
import { getMiningGear } from './mining-catalog.js';
import { createBotServiceClient } from './supabase.js';

export type PlayerShopTab = 'skills' | 'items';

export type PlayerSkillLevels = {
  cheapskate: number;
  haste: number;
  lucky: number;
  moneyMouser: number;
};

export type PlayerEquipmentItem = {
  cost: number;
  description: string;
  id: 'mask' | 'knife' | 'gun' | 'safe' | 'bodyguard';
  name: string;
  replenishable?: boolean;
};

export type PlayerShopItem = FishingUpgrade | PlayerEquipmentItem;

export type PlayerShopState = {
  balance: number;
  itemIds: readonly string[];
  /** Includes Fishing relics that still reduce a shared-skill purchase price. */
  pricingItemIds: readonly string[];
  skillLevels: PlayerSkillLevels;
};

export type PlayerStats = {
  balance: number;
  chat: {
    level: number;
    totalXp: number;
    xpForNextLevel: number;
    xpIntoLevel: number;
  };
  fishing: {
    level: number;
    totalXp: number;
  };
  skills: PlayerSkillLevels;
};

export type PlayerShopPurchase = {
  balance: number;
  chargedCost: number;
  item: PlayerShopItem;
};

export type PlayerInventoryEquipment = {
  item: PlayerEquipmentItem;
  quantity: number;
};

export type PlayerInventoryGear = {
  item: {
    description: string;
    id: string;
    name: string;
  };
  quantity: number;
};

export type PlayerInventory = {
  equipment: readonly PlayerInventoryEquipment[];
  fishingGear: readonly PlayerInventoryGear[];
  miningGear: readonly PlayerInventoryGear[];
};

export type RobberyResult = {
  bodyguardCharges: number;
  bodyguardUsed: boolean;
  cooldownAvailableAt: string | null;
  failurePenalty: number;
  masked: boolean;
  outcome: 'cooldown' | 'failed' | 'success' | 'target-empty';
  revealed: boolean;
  robberBalance: number;
  robberyChancePercent: number;
  stolenAmount: number;
  targetBalance: number;
  theftPercent: number;
};

type PlayerInventoryRow = {
  item_id: string;
  quantity: number;
};

type PlayerSkillRow = {
  level: number;
  total_xp: number;
};

type PlayerShopPurchaseRow = {
  charged_cost: number;
  current_balance: number;
};

type RobberyResultRow = {
  bodyguard_charges: number;
  bodyguard_used: boolean;
  cooldown_available_at: string | null;
  failure_penalty: number;
  masked: boolean;
  outcome: RobberyResult['outcome'];
  revealed: boolean;
  robber_balance: number;
  robbery_chance_percent: number;
  stolen_amount: number;
  target_balance: number;
  theft_percent: number;
};

const PLAYER_EQUIPMENT_ITEMS: readonly PlayerEquipmentItem[] = [
  {
    id: 'mask',
    name: 'Mask',
    cost: 100_000,
    description: 'Hides your identity in public robbery results unless a defending Bodyguard exposes you after a failed robbery.',
  },
  {
    id: 'knife',
    name: 'Knife',
    cost: 250_000,
    description: 'Adds 3% robbery success chance and subtracts 1% from attempts against you.',
  },
  {
    id: 'gun',
    name: 'Gun',
    cost: 1_000_000,
    description: 'Adds 5% robbery success chance and subtracts 2% from attempts against you.',
  },
  {
    id: 'safe',
    name: 'Safe',
    cost: 250_000,
    description: 'On a failed robbery, lose only 25% of your balance unless a defending Bodyguard catches you. It also protects 25% of your balance from a successful robbery.',
  },
  {
    id: 'bodyguard',
    name: 'Bodyguard',
    cost: 1_000_000,
    replenishable: true,
    description: 'Adds 10 protection charges. Each charge subtracts 5% from a robbery attempt against you; a failed attempt forfeits half the robber’s balance and exposes a masked robber.',
  },
];

const PLAYER_SKILL_TRACKS = {
  cheapskate: PLAYER_SKILL_TIER_CONFIG.filter((skill) => skill.track === 'cheapskate').map((skill) => skill.id),
  haste: PLAYER_SKILL_TIER_CONFIG.filter((skill) => skill.track === 'haste').map((skill) => skill.id),
  lucky: PLAYER_SKILL_TIER_CONFIG.filter((skill) => skill.track === 'lucky').map((skill) => skill.id),
  moneyMouser: PLAYER_SKILL_TIER_CONFIG.filter((skill) => skill.track === 'moneyMouser').map((skill) => skill.id),
};

function firstResult<T>(data: T | T[] | null) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function countOwnedTiers(itemIds: readonly string[], tiers: readonly string[]) {
  const owned = new Set(itemIds);
  return tiers.filter((tier) => owned.has(tier)).length;
}

export function getPlayerSkillLevelsFromItemIds(itemIds: readonly string[]): PlayerSkillLevels {
  return {
    cheapskate: countOwnedTiers(itemIds, PLAYER_SKILL_TRACKS.cheapskate),
    haste: countOwnedTiers(itemIds, PLAYER_SKILL_TRACKS.haste),
    lucky: countOwnedTiers(itemIds, PLAYER_SKILL_TRACKS.lucky),
    moneyMouser: countOwnedTiers(itemIds, PLAYER_SKILL_TRACKS.moneyMouser),
  };
}

export function getPlayerEquipmentItem(itemId: string) {
  return PLAYER_EQUIPMENT_ITEMS.find((item) => item.id === itemId);
}

export function getPlayerShopItem(itemId: string): PlayerShopItem | undefined {
  const skill = getFishingUpgrade(itemId);
  return skill?.category === 'skill' ? skill : getPlayerEquipmentItem(itemId);
}

export function getPlayerShopItems(tab: PlayerShopTab, ownedItemIds: readonly string[]): readonly PlayerShopItem[] {
  if (tab === 'skills') return getVisibleFishingShopItems('skill', ownedItemIds);
  return PLAYER_EQUIPMENT_ITEMS;
}

async function getPlayerInventoryRows(config: DiscordBotConfig, discordUserId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_player_inventory')
    .select('item_id,quantity')
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .returns<PlayerInventoryRow[]>();
  if (error) throw new Error(`Unable to load player inventory: ${error.message}`);
  return data ?? [];
}

export async function getPlayerEquipmentInventory(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<readonly PlayerInventoryEquipment[]> {
  const quantities = new Map((await getPlayerInventoryRows(config, discordUserId))
    .map((entry) => [entry.item_id, entry.quantity]));
  return PLAYER_EQUIPMENT_ITEMS.flatMap((item) => {
    const quantity = quantities.get(item.id);
    return quantity ? [{ item, quantity }] : [];
  });
}

export async function getPlayerInventory(
  config: DiscordBotConfig,
  discordUserId: string,
): Promise<PlayerInventory> {
  const supabase = createBotServiceClient(config);
  const [inventoryRows, fishingInventoryResult] = await Promise.all([
    getPlayerInventoryRows(config, discordUserId),
    supabase
      .from('discord_fishing_inventory')
      .select('item_id,quantity')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .like('item_id', 'gear-%')
      .returns<PlayerInventoryRow[]>(),
  ]);
  if (fishingInventoryResult.error) throw new Error(`Unable to load Fishing gear inventory: ${fishingInventoryResult.error.message}`);

  const quantities = new Map(inventoryRows.map((entry) => [entry.item_id, entry.quantity]));
  return {
    equipment: PLAYER_EQUIPMENT_ITEMS.flatMap((item) => {
      const quantity = quantities.get(item.id);
      return quantity ? [{ item, quantity }] : [];
    }),
    fishingGear: (fishingInventoryResult.data ?? []).flatMap((entry) => {
      const item = getFishingUpgrade(entry.item_id);
      return item?.category === 'gear' && entry.quantity > 0 ? [{ item, quantity: entry.quantity }] : [];
    }),
    miningGear: inventoryRows.flatMap((entry) => {
      const item = getMiningGear(entry.item_id);
      return item && entry.quantity > 0 ? [{ item, quantity: entry.quantity }] : [];
    }),
  };
}

export async function getPlayerShopState(config: DiscordBotConfig, discordUserId: string): Promise<PlayerShopState> {
  const supabase = createBotServiceClient(config);
  const [balance, inventory, fishingPriceModifier] = await Promise.all([
    getKnowBucksBalance(config, discordUserId),
    getPlayerInventoryRows(config, discordUserId),
    supabase
      .from('discord_fishing_inventory')
      .select('item_id')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('item_id', 'gear-lost-pursasion-device')
      .returns<Pick<PlayerInventoryRow, 'item_id'>[]>(),
  ]);
  if (fishingPriceModifier.error) throw new Error(`Unable to load player-shop price modifiers: ${fishingPriceModifier.error.message}`);
  const itemIds = inventory.map((item) => item.item_id);
  return {
    balance,
    itemIds,
    pricingItemIds: [...itemIds, ...(fishingPriceModifier.data ?? []).map((item) => item.item_id)],
    skillLevels: getPlayerSkillLevelsFromItemIds(itemIds),
  };
}

export async function getPlayerStats(config: DiscordBotConfig, discordUserId: string): Promise<PlayerStats> {
  const supabase = createBotServiceClient(config);
  const [chat, balance, fishingResult, shop] = await Promise.all([
    getDiscordLevelProgress(config, discordUserId),
    getKnowBucksBalance(config, discordUserId),
    supabase
      .from('discord_game_skill_progress')
      .select('level,total_xp')
      .eq('guild_id', config.guildId)
      .eq('discord_user_id', discordUserId)
      .eq('skill_id', 'fishing')
      .maybeSingle<PlayerSkillRow>(),
    getPlayerShopState(config, discordUserId),
  ]);
  if (fishingResult.error) throw new Error(`Unable to load Fishing skill progress: ${fishingResult.error.message}`);
  return {
    balance,
    chat: {
      level: chat.level,
      totalXp: chat.totalXp,
      xpForNextLevel: chat.xpForNextLevel,
      xpIntoLevel: chat.xpIntoLevel,
    },
    fishing: {
      level: fishingResult.data?.level ?? 0,
      totalXp: fishingResult.data?.total_xp ?? 0,
    },
    skills: shop.skillLevels,
  };
}

export async function purchasePlayerShopItem(
  config: DiscordBotConfig,
  discordUserId: string,
  itemId: string,
): Promise<PlayerShopPurchase> {
  const item = getPlayerShopItem(itemId);
  if (!item) throw new Error('That player-shop item is unavailable.');
  const { data, error } = await createBotServiceClient(config).rpc('purchase_discord_player_shop_item', {
    p_discord_user_id: discordUserId,
    p_guild_id: config.guildId,
    p_item_id: item.id,
  });
  if (error) throw new Error(`Unable to purchase player-shop item: ${error.message}`);
  const purchase = firstResult(data as PlayerShopPurchaseRow | PlayerShopPurchaseRow[] | null);
  if (!purchase) throw new Error('Player-shop purchase did not return a result.');
  return {
    balance: purchase.current_balance,
    chargedCost: purchase.charged_cost,
    item,
  };
}

export async function attemptRobbery(
  config: DiscordBotConfig,
  robberDiscordUserId: string,
  targetDiscordUserId: string,
): Promise<RobberyResult> {
  const { data, error } = await createBotServiceClient(config).rpc('rob_discord_player', {
    p_robber_discord_user_id: robberDiscordUserId,
    p_guild_id: config.guildId,
    p_target_discord_user_id: targetDiscordUserId,
  });
  if (error) throw new Error(`Unable to complete robbery: ${error.message}`);
  const result = firstResult(data as RobberyResultRow | RobberyResultRow[] | null);
  if (!result) throw new Error('Robbery did not return a result.');
  return {
    bodyguardCharges: result.bodyguard_charges,
    bodyguardUsed: result.bodyguard_used,
    cooldownAvailableAt: result.cooldown_available_at,
    failurePenalty: result.failure_penalty,
    masked: result.masked,
    outcome: result.outcome,
    revealed: result.revealed,
    robberBalance: result.robber_balance,
    robberyChancePercent: result.robbery_chance_percent,
    stolenAmount: result.stolen_amount,
    targetBalance: result.target_balance,
    theftPercent: result.theft_percent,
  };
}

export function getPlayerShopDisplayCost(item: PlayerShopItem, ownedItemIds: readonly string[]) {
  return 'category' in item && item.category === 'skill' ? getFishingUpgradeCost(item, ownedItemIds) : item.cost;
}
