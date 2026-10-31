import { randomInt } from 'node:crypto';
import { ApiError } from '@/lib/api-utils';
import { getDiscordGameIdentity, type DiscordGameIdentity } from '@/lib/discord-game-identity';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_EXPEDITION_LENGTHS,
  FISHING_UPGRADES,
  getFishingEventForOutcomeSeed,
  getFishingExpeditionLength,
  getFishingTimeReductionPercent,
  getFishingTotalXpForLevel,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingXpToNextLevel,
  shouldInstantlyCompleteFishingExpedition,
  type FishingBiomeId,
  type FishingDurationTier,
  type FishingEquipmentSnapshot,
  type FishingExpeditionModifiers,
  type FishingExpeditionResult,
  type FishingUpgrade,
} from '../discord-bot/src/fishing-catalog';

type FishingPlayerRow = {
  crew_one_unlocked: boolean;
  crew_two_unlocked: boolean;
  equipped_bait_id: string;
  equipped_rod_id: string;
};
type FishingInventoryRow = { item_id: string; quantity: number };
type FishingSkillRow = { level: number; total_xp: number };
type FishingExpeditionRow = {
  biome_id: FishingBiomeId;
  completes_at: string;
  crew_slot: number;
  duration_tier: FishingDurationTier;
  id: number;
  notification_channel_id: string;
  result: FishingExpeditionResult | null;
  started_at: string;
  status: 'active' | 'completed';
};
type FishingWeekdayRow = { phenomenon: string; weekday: number };

type FishingIdentity = DiscordGameIdentity;
type FishingState = {
  activeExpeditions: FishingExpeditionRow[];
  balance: number;
  crewSlots: number;
  fishingLevel: number;
  fishingTotalXp: number;
  inventory: FishingInventoryRow[];
  passiveItemIds: string[];
  playerItemIds: string[];
  rodId: string;
  baitId: string;
};

export type FishingDashboard = {
  activeExpeditions: Array<{
    biomeId: FishingBiomeId;
    biomeName: string;
    completesAt: string;
    crewSlot: number;
    durationTier: FishingDurationTier;
    id: number;
    startedAt: string;
  }>;
  balance: number;
  biomes: Array<{ description: string; id: FishingBiomeId; name: string; requiredBoatName: string | null; unlocked: boolean }>;
  crewSlots: number;
  durations: Array<{ durationSeconds: number; requiredFishingLevel: number; tier: FishingDurationTier; unlocked: boolean }>;
  equipment: { baitName: string; passiveItems: Array<{ description: string; name: string }>; rodName: string };
  fishing: { level: number; totalXp: number; xpIntoLevel: number; xpToNextLevel: number };
  inventory: Array<{ category: FishingUpgrade['category'] | 'collectible'; id: string; name: string; quantity: number }>;
  mostRecent: null | { catches: Array<{ kind: string; name: string; quantity: number; rarity?: string }>; completedAt: string; fishingXpAwarded: number; knowBucksAwarded: number };
  shop: Array<{
    canBuy: boolean;
    category: FishingUpgrade['category'];
    cost: number;
    description: string;
    id: string;
    name: string;
    owned: boolean;
    requiredFishingLevel: number;
    requiredUpgradeName: string | null;
  }>;
};

async function getFishingIdentity(userId: string): Promise<FishingIdentity> {
  return getDiscordGameIdentity(userId, 'Fishing');
}

async function ensureFishingPlayer(identity: FishingIdentity) {
  const { error } = await getSupabaseServiceClient().rpc('ensure_discord_fishing_player', {
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
  });
  if (error) throw error;
}

async function getFishingState(identity: FishingIdentity): Promise<FishingState> {
  await ensureFishingPlayer(identity);
  const supabase = getSupabaseServiceClient();
  const [player, inventory, playerInventory, balance, fishingSkill, active] = await Promise.all([
    supabase.from('discord_fishing_players').select('crew_one_unlocked,crew_two_unlocked,equipped_bait_id,equipped_rod_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).single<FishingPlayerRow>(),
    supabase.from('discord_fishing_inventory').select('item_id,quantity')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('item_id').returns<FishingInventoryRow[]>(),
    supabase.from('discord_player_inventory').select('item_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<Array<{ item_id: string }>>(),
    supabase.from('discord_knowbucks_balances').select('balance')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).maybeSingle<{ balance: number }>(),
    supabase.from('discord_game_skill_progress').select('level,total_xp')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).eq('skill_id', 'fishing').maybeSingle<FishingSkillRow>(),
    supabase.from('discord_fishing_expeditions')
      .select('id,biome_id,completes_at,crew_slot,duration_tier,notification_channel_id,result,started_at,status')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).eq('status', 'active').order('completes_at').returns<FishingExpeditionRow[]>(),
  ]);
  if (player.error || inventory.error || playerInventory.error || balance.error || fishingSkill.error || active.error) {
    throw player.error ?? inventory.error ?? playerInventory.error ?? balance.error ?? fishingSkill.error ?? active.error;
  }
  if (!player.data) throw new Error('Fishing profile was not created.');

  const inventoryItems = inventory.data ?? [];
  const playerItemIds = (playerInventory.data ?? []).map((entry) => entry.item_id);
  return {
    activeExpeditions: active.data ?? [],
    balance: balance.data?.balance ?? 0,
    crewSlots: 1 + Number(player.data.crew_one_unlocked) + Number(player.data.crew_two_unlocked),
    fishingLevel: fishingSkill.data?.level ?? 0,
    fishingTotalXp: fishingSkill.data?.total_xp ?? 0,
    inventory: inventoryItems,
    passiveItemIds: inventoryItems.map((item) => item.item_id)
      .filter((itemId) => getFishingUpgrade(itemId)?.category === 'gear')
      .concat(playerItemIds.filter((itemId) => getFishingUpgrade(itemId)?.category === 'skill')),
    playerItemIds,
    rodId: player.data.equipped_rod_id,
    baitId: player.data.equipped_bait_id,
  };
}

async function getMostRecentExpedition(identity: FishingIdentity) {
  const { data, error } = await getSupabaseServiceClient().from('discord_fishing_expeditions')
    .select('id,biome_id,completes_at,crew_slot,duration_tier,notification_channel_id,result,started_at,status')
    .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).eq('status', 'completed')
    .order('settled_at', { ascending: false }).limit(1).returns<FishingExpeditionRow[]>();
  if (error) throw error;
  return data?.[0] ?? null;
}

async function getFishingNotificationChannel(identity: FishingIdentity) {
  const configured = process.env.DISCORD_FISHING_WEB_NOTIFICATION_CHANNEL_ID?.trim() ?? '';
  if (/^[0-9]{17,20}$/.test(configured)) return configured;

  const supabase = getSupabaseServiceClient();
  const [recent, commandChannels] = await Promise.all([
    supabase.from('discord_fishing_expeditions').select('notification_channel_id')
      .eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId)
      .order('started_at', { ascending: false }).limit(1).maybeSingle<{ notification_channel_id: string }>(),
    supabase.from('discord_fishing_command_channels').select('channel_id')
      .eq('guild_id', identity.guildId).order('channel_id').limit(1).returns<Array<{ channel_id: string }>>(),
  ]);
  if (recent.error || commandChannels.error) throw recent.error ?? commandChannels.error;
  const channelId = recent.data?.notification_channel_id ?? commandChannels.data?.[0]?.channel_id ?? '';
  if (!/^[0-9]{17,20}$/.test(channelId)) {
    throw new ApiError(409, 'Set a Fishing web notification channel or launch one Fishing expedition from Discord first.');
  }
  return channelId;
}

async function getFishingLaunchRelicState(identity: FishingIdentity, biomeId: FishingBiomeId, passiveItemIds: readonly string[]) {
  const hasStreakCharm = passiveItemIds.includes('gear-streak-charm');
  const hasEarlyBirdBell = passiveItemIds.includes('gear-early-bird-bell');
  const hasPearlDiversLog = passiveItemIds.includes('gear-pearl-divers-log');
  if (!hasStreakCharm && !hasEarlyBirdBell && !hasPearlDiversLog) {
    return { catalogueFishKeys: [], earlyBirdBonus: false, streakSaleBonusPercent: 0 };
  }

  const supabase = getSupabaseServiceClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [recent, today, catches] = await Promise.all([
    hasStreakCharm
      ? supabase.from('discord_fishing_expeditions').select('biome_id').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).order('started_at', { ascending: false }).limit(20).returns<Array<{ biome_id: FishingBiomeId }>>()
      : Promise.resolve({ data: [] as Array<{ biome_id: FishingBiomeId }>, error: null }),
    hasEarlyBirdBell
      ? supabase.from('discord_fishing_expeditions').select('id').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).gte('started_at', dayStart.toISOString()).limit(1).returns<Array<{ id: number }>>()
      : Promise.resolve({ data: [] as Array<{ id: number }>, error: null }),
    hasPearlDiversLog
      ? supabase.from('discord_fishing_catalogue_catches').select('biome_id,fish_name,fish_rarity').eq('guild_id', identity.guildId).eq('discord_user_id', identity.discordUserId).returns<Array<{ biome_id: string; fish_name: string; fish_rarity: string }>>()
      : Promise.resolve({ data: [] as Array<{ biome_id: string; fish_name: string; fish_rarity: string }>, error: null }),
  ]);
  if (recent.error || today.error || catches.error) throw recent.error ?? today.error ?? catches.error;
  let consecutiveMatches = 0;
  for (const expedition of recent.data ?? []) {
    if (expedition.biome_id !== biomeId) break;
    consecutiveMatches += 1;
  }
  return {
    catalogueFishKeys: (catches.data ?? []).map((entry) => `${entry.biome_id}:${entry.fish_name}:${entry.fish_rarity}`),
    earlyBirdBonus: hasEarlyBirdBell && (today.data?.length ?? 0) === 0,
    streakSaleBonusPercent: Math.min(10, consecutiveMatches * 0.5),
  };
}

async function getWeekdayModifiers(identity: FishingIdentity): Promise<FishingExpeditionModifiers> {
  const { data, error } = await getSupabaseServiceClient().from('discord_fishing_weekday_phenomena')
    .select('phenomenon,weekday').eq('guild_id', identity.guildId).returns<FishingWeekdayRow[]>();
  if (error?.code === '42P01' || error?.code === 'PGRST205') return {};
  if (error) throw error;
  const phenomena = new Set((data ?? []).filter((row) => row.weekday === new Date().getUTCDay()).map((row) => row.phenomenon));
  return {
    doubleKnowBucks: phenomena.has('double-knowbucks'),
    doubleXp: phenomena.has('double-xp'),
    extraCrateLoot: phenomena.has('extra-crate-loot'),
    higherFishRarity: phenomena.has('higher-fish-rarity'),
    shorterExpeditions: phenomena.has('shorter-expeditions'),
  };
}

function buildEquipmentSnapshot(state: FishingState, relicState: Awaited<ReturnType<typeof getFishingLaunchRelicState>>, modifiers: FishingExpeditionModifiers, outcomeSeed: number): FishingEquipmentSnapshot {
  const event = getFishingEventForOutcomeSeed(outcomeSeed);
  return {
    baitItemId: state.baitId,
    catalogueFishKeys: relicState.catalogueFishKeys,
    catalogueVersion: 7,
    eventId: event?.id,
    modifiers: { ...modifiers, earlyBirdBonus: relicState.earlyBirdBonus, streakSaleBonusPercent: relicState.streakSaleBonusPercent },
    passiveItemIds: state.passiveItemIds,
    rodItemId: state.rodId,
  };
}

async function buildFishingDashboard(identity: FishingIdentity): Promise<FishingDashboard> {
  const [state, mostRecent] = await Promise.all([getFishingState(identity), getMostRecentExpedition(identity)]);
  const ownedItemIds = new Set([...state.inventory.map((item) => item.item_id), ...state.playerItemIds]);
  const inventory = state.inventory.map((item) => {
    const upgrade = getFishingUpgrade(item.item_id);
    return { category: upgrade?.category ?? 'collectible' as const, id: item.item_id, name: upgrade?.name ?? item.item_id.replace(/-/g, ' '), quantity: item.quantity };
  });
  const equipmentRod = getFishingUpgrade(state.rodId)?.name ?? 'Unknown rod';
  const equipmentBait = getFishingUpgrade(state.baitId)?.name ?? 'Unknown bait';

  return {
    activeExpeditions: state.activeExpeditions.map((expedition) => ({
      biomeId: expedition.biome_id,
      biomeName: getFishingBiomeName(expedition.biome_id),
      completesAt: expedition.completes_at,
      crewSlot: expedition.crew_slot,
      durationTier: expedition.duration_tier,
      id: expedition.id,
      startedAt: expedition.started_at,
    })),
    balance: state.balance,
    biomes: FISHING_BIOMES.map((biome) => ({
      description: biome.description,
      id: biome.id,
      name: biome.name,
      requiredBoatName: biome.requiredBoatUpgradeId ? getFishingUpgrade(biome.requiredBoatUpgradeId)?.name ?? null : null,
      unlocked: !biome.requiredBoatUpgradeId || ownedItemIds.has(biome.requiredBoatUpgradeId),
    })),
    crewSlots: state.crewSlots,
    durations: FISHING_EXPEDITION_LENGTHS.map((duration) => ({ ...duration, unlocked: state.fishingLevel >= duration.requiredFishingLevel })),
    equipment: {
      baitName: equipmentBait,
      passiveItems: state.passiveItemIds.flatMap((id) => {
        const item = getFishingUpgrade(id);
        return item ? [{ description: item.description, name: item.name }] : [];
      }),
      rodName: equipmentRod,
    },
    fishing: {
      level: state.fishingLevel,
      totalXp: state.fishingTotalXp,
      xpIntoLevel: Math.max(0, state.fishingTotalXp - getFishingTotalXpForLevel(state.fishingLevel)),
      xpToNextLevel: getFishingXpToNextLevel(state.fishingLevel),
    },
    inventory,
    mostRecent: mostRecent?.result ? {
      catches: mostRecent.result.catches.map((catchItem) => ({ kind: catchItem.kind, name: catchItem.name, quantity: catchItem.quantity, ...(catchItem.kind === 'fish' || catchItem.kind === 'crate' ? { rarity: catchItem.rarity } : {}) })),
      completedAt: mostRecent.completes_at,
      fishingXpAwarded: mostRecent.result.fishingXpAwarded,
      knowBucksAwarded: mostRecent.result.fishSaleValue + mostRecent.result.crateSaleValue + mostRecent.result.knowBucksFound,
    } : null,
    shop: FISHING_UPGRADES.filter((item) => item.category !== 'gear' && item.category !== 'skill').map((item) => {
      const cost = getFishingUpgradeCost(item, [...ownedItemIds]);
      const owned = ownedItemIds.has(item.id);
      const requiredOwned = !item.requiredUpgradeId || ownedItemIds.has(item.requiredUpgradeId);
      return {
        canBuy: !owned && state.balance >= cost && state.fishingLevel >= (item.requiredFishingLevel ?? 0) && requiredOwned,
        category: item.category,
        cost,
        description: item.description,
        id: item.id,
        name: item.name,
        owned,
        requiredFishingLevel: item.requiredFishingLevel ?? 0,
        requiredUpgradeName: item.requiredUpgradeId ? getFishingUpgrade(item.requiredUpgradeId)?.name ?? item.requiredUpgradeId : null,
      };
    }),
  };
}

function getFishingBiomeName(biomeId: FishingBiomeId) {
  return FISHING_BIOMES.find((biome) => biome.id === biomeId)?.name ?? biomeId;
}

export async function getFishingDashboard(userId: string) {
  return buildFishingDashboard(await getFishingIdentity(userId));
}

export async function startFishingWebsiteExpedition(userId: string, biomeId: FishingBiomeId, durationTier: FishingDurationTier, crewSlot?: number) {
  const identity = await getFishingIdentity(userId);
  const [state, notificationChannel] = await Promise.all([getFishingState(identity), getFishingNotificationChannel(identity)]);
  const biome = FISHING_BIOMES.find((entry) => entry.id === biomeId);
  const duration = getFishingExpeditionLength(durationTier);
  if (!biome || !duration) throw new ApiError(400, 'Choose a valid Fishing destination and duration.');
  if (state.fishingLevel < duration.requiredFishingLevel) throw new ApiError(409, `This expedition unlocks at Fishing level ${duration.requiredFishingLevel}.`);
  const ownedItemIds = new Set([...state.inventory.map((item) => item.item_id), ...state.playerItemIds]);
  if (biome.requiredBoatUpgradeId && !ownedItemIds.has(biome.requiredBoatUpgradeId)) {
    throw new ApiError(409, `${biome.name} requires the ${getFishingUpgrade(biome.requiredBoatUpgradeId)?.name ?? 'required boat'}.`);
  }
  const activeSlots = new Set(state.activeExpeditions.map((expedition) => expedition.crew_slot));
  const selectedCrewSlot = crewSlot ?? Array.from({ length: state.crewSlots }, (_, index) => index + 1).find((slot) => !activeSlots.has(slot));
  if (!Number.isInteger(selectedCrewSlot) || !selectedCrewSlot || selectedCrewSlot < 1 || selectedCrewSlot > state.crewSlots || activeSlots.has(selectedCrewSlot)) {
    throw new ApiError(409, 'Choose an available Fishing crew slot.');
  }

  const outcomeSeed = randomInt(1, 2_147_483_648);
  const [relicState, weekdayModifiers] = await Promise.all([
    getFishingLaunchRelicState(identity, biomeId, state.passiveItemIds),
    getWeekdayModifiers(identity),
  ]);
  const equipment = buildEquipmentSnapshot(state, relicState, weekdayModifiers, outcomeSeed);
  const instantCompletion = shouldInstantlyCompleteFishingExpedition(equipment, outcomeSeed, selectedCrewSlot > 1);
  const durationSeconds = instantCompletion ? 0 : calculateFishingDurationSeconds(
    durationTier,
    selectedCrewSlot > 1,
    getFishingTimeReductionPercent(equipment)
      + (selectedCrewSlot > 1 && state.passiveItemIds.includes('gear-autopilot-relay') ? 10 : 0),
    equipment.modifiers?.shorterExpeditions ? 25 : 0,
  );
  if (durationSeconds === null) throw new ApiError(400, 'Fishing duration is invalid.');

  const { error } = await getSupabaseServiceClient().rpc('start_discord_fishing_expedition', {
    p_biome_id: biomeId,
    p_crew_slot: selectedCrewSlot,
    p_discord_user_id: identity.discordUserId,
    p_duration_seconds: durationSeconds,
    p_duration_tier: durationTier,
    p_equipment_snapshot: equipment,
    p_guild_id: identity.guildId,
    p_notification_channel_id: notificationChannel,
    p_outcome_seed: outcomeSeed,
  });
  if (error) throw error;
  return buildFishingDashboard(identity);
}

export async function purchaseFishingWebsiteUpgrade(userId: string, upgradeId: string) {
  const identity = await getFishingIdentity(userId);
  const item = getFishingUpgrade(upgradeId);
  if (!item || item.category === 'gear' || item.category === 'skill' || item.cost <= 0) throw new ApiError(400, 'Choose a valid Fishing shop item.');
  const state = await getFishingState(identity);
  const ownedItemIds = [...state.inventory.map((entry) => entry.item_id), ...state.playerItemIds];
  if (ownedItemIds.includes(item.id)) throw new ApiError(409, 'You already own this Fishing upgrade.');
  if (item.requiredUpgradeId && !ownedItemIds.includes(item.requiredUpgradeId)) {
    throw new ApiError(409, `This upgrade requires ${getFishingUpgrade(item.requiredUpgradeId)?.name ?? 'the previous upgrade'} first.`);
  }
  const cost = getFishingUpgradeCost(item, ownedItemIds);
  const { error } = await getSupabaseServiceClient().rpc('purchase_discord_fishing_upgrade', {
    p_category: item.category,
    p_cost: cost,
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
    p_item_id: item.id,
    p_required_fishing_level: item.requiredFishingLevel ?? 0,
  });
  if (error) throw error;
  return buildFishingDashboard(identity);
}

export async function equipFishingWebsiteUpgrade(userId: string, upgradeId: string) {
  const identity = await getFishingIdentity(userId);
  const item = getFishingUpgrade(upgradeId);
  if (!item || (item.category !== 'rod' && item.category !== 'bait')) throw new ApiError(400, 'Choose an owned rod or bait item.');
  const { error } = await getSupabaseServiceClient().rpc('equip_discord_fishing_upgrade', {
    p_category: item.category,
    p_discord_user_id: identity.discordUserId,
    p_guild_id: identity.guildId,
    p_item_id: item.id,
  });
  if (error) throw error;
  return buildFishingDashboard(identity);
}
