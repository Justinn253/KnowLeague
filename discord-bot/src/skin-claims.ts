import { readFileSync } from 'node:fs';
import {
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

type SkinClaimCommandSettingsRow = {
  command_channel_id: string | null;
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

type TransferredSkin = {
  skin_code: number;
  skin_name: string;
};

type SummonedSkinDrop = ReservedSkinDrop & {
  remaining_balance: number;
};

type GambledSkinDrop = {
  drop_id: number | null;
  expires_at: string | null;
  new_skin_code: number | null;
  outcome: 'blocked' | 'lost' | 'spawned';
  skin_name: string;
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

let catalogCache: CatalogSkin[] | null = null;
let cachedSettings: { expiresAt: number; guildId: string; value: SkinClaimRuntimeSettings } | null = null;
let settingsLoad: Promise<SkinClaimRuntimeSettings | null> | null = null;
let scheduler: NodeJS.Timeout | null = null;
let timedDropInFlight: Promise<void> | null = null;

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

function chooseWeightedSkin(rarityWeights: Map<string, number>) {
  const candidates = loadSkinCatalog().map((skin) => ({ skin, weight: rarityWeights.get(normalizeRarity(skin.rarity)) ?? 0 }))
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

function getSkinDisplayImageUrl(skin: Pick<CatalogSkin, 'centeredImageUrl' | 'imageUrl'>) {
  return skin.centeredImageUrl && /^https:\/\//.test(skin.centeredImageUrl)
    ? skin.centeredImageUrl
    : skin.imageUrl;
}

function getClaimedSkinDisplayImageUrl(drop: Pick<ClaimedSkinDrop, 'image_url' | 'skin_catalog_id'>) {
  const catalogSkin = drop.skin_catalog_id
    ? loadSkinCatalog().find((skin) => skin.id === drop.skin_catalog_id)
    : null;
  return catalogSkin ? getSkinDisplayImageUrl(catalogSkin) : drop.image_url;
}

function skinDropEmbed(
  drop: Omit<ClaimedSkinDrop, 'claimed'>,
  claimedByUserId?: string,
  collection = false,
  raritySpawnPercent?: number,
) {
  const claimed = Boolean(claimedByUserId) || collection;
  const details = [
    `**${drop.skin_name}**`,
    `Rarity: **${drop.rarity}**`,
    ...(raritySpawnPercent === undefined ? [] : [`Rarity spawn chance: **${formatRaritySpawnPercent(raritySpawnPercent)}**`]),
  ];
  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[drop.rarity] ?? 0xF59E0B)
    .setTitle(`${claimed ? 'Claimed skin' : 'Skin drop'} · #${formatSkinCode(drop.skin_code)}`)
    .setDescription(details.join('\n'))
    .setImage(drop.image_url);
  if (!collection) {
    embed.setDescription([
      claimed ? `<@${claimedByUserId}> claimed this skin.` : 'React to this message first to add this skin to your collection.',
      '',
      ...details,
    ].join('\n'));
  }
  return embed.setFooter({ text: claimed ? 'Use /collections collection to browse your collection.' : 'The first human reaction wins.' });
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

function toSkinDrop(skin: CatalogSkin, reserved: ReservedSkinDrop) {
  return {
    champion_name: skin.champion,
    image_url: getSkinDisplayImageUrl(skin),
    rarity: normalizeRarity(skin.rarity),
    release_date: skin.releaseDate,
    skin_code: reserved.skin_code,
    skin_line: skin.skinLine,
    skin_name: skin.answer,
  };
}

async function sendReservedSkinDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  skin: CatalogSkin,
  reserved: ReservedSkinDrop,
  raritySpawnPercent: number,
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
      content: `React to claim this skin. Will expire <t:${expiresAtSeconds}:R>.`,
      embeds: [skinDropEmbed(toSkinDrop(skin, reserved), undefined, false, raritySpawnPercent)],
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
) {
  const skin = chooseWeightedSkin(settings.rarityWeights);
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
    calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights),
  );
}

export type SkinClaimSpawnResult = {
  channelId?: string;
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
): Promise<SkinClaimSpawnResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings) return { status: 'not-configured' };
  if (!settings.enabled) return { status: 'disabled' };

  const spawned = await reserveAndSendSkinDrop(
    config,
    guild,
    channelId,
    'manual',
    settings,
  );
  return spawned
    ? { channelId, status: 'spawned' }
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
 * A configured command channel applies to every member-facing collection
 * command except the staff-only spawn command. An absent settings row keeps
 * the default open-channel behavior for guilds that have not configured drops.
 */
export async function isSkinCollectionCommandAllowedInChannel(config: DiscordBotConfig, channelId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_skin_claim_settings')
    .select('command_channel_id')
    .eq('guild_id', config.guildId)
    .maybeSingle<SkinClaimCommandSettingsRow>();
  if (error) throw new Error(`Unable to load Discord collection command channel: ${error.message}`);
  return !data?.command_channel_id || data.command_channel_id === channelId;
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
  channelId?: string;
  remainingBalance?: number;
  status: 'active-drop' | 'disabled' | 'insufficient-funds' | 'not-configured' | 'spawned';
};

export async function summonSkinClaimDrop(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  discordUserId: string,
): Promise<SummonSkinClaimResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings) return { status: 'not-configured' };
  if (!settings.enabled) return { status: 'disabled' };
  if (!settings.eligibleChannelIds.has(channelId)) return { status: 'not-configured' };

  const skin = chooseWeightedSkin(settings.rarityWeights);
  const { data, error } = await createBotServiceClient(config).rpc('summon_discord_skin_claim_drop', {
    ...skinDropArguments(config, channelId, skin),
    p_discord_user_id: discordUserId,
  });
  if (error) {
    if (error.message.includes('Insufficient KnowBucks balance')) return { status: 'insufficient-funds' };
    throw new Error(`Unable to summon Discord skin-claim drop: ${error.message}`);
  }
  const reserved = getFirstResult(data as SummonedSkinDrop | SummonedSkinDrop[] | null);
  if (!reserved) return { status: 'active-drop' };
  recordDropReservation(config);
  const spawned = await sendReservedSkinDrop(
    config,
    guild,
    channelId,
    skin,
    reserved,
    calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights),
  );
  return spawned
    ? { channelId, remainingBalance: reserved.remaining_balance, status: 'spawned' }
    : { status: 'active-drop' };
}

export type GambleSkinClaimResult = {
  status: 'active-drop' | 'lost' | 'not-configured' | 'spawned';
  skinName?: string;
};

export async function gambleSkinClaim(
  config: DiscordBotConfig,
  guild: Guild,
  channelId: string,
  discordUserId: string,
  skinCode: number,
): Promise<GambleSkinClaimResult> {
  const settings = await getSkinClaimSettings(config, true);
  if (!settings?.enabled || !settings.eligibleChannelIds.has(channelId)) return { status: 'not-configured' };

  const skin = chooseWeightedSkin(settings.rarityWeights);
  const { data, error } = await createBotServiceClient(config).rpc('gamble_discord_skin_claim', {
    ...skinDropArguments(config, channelId, skin),
    p_discord_user_id: discordUserId,
    p_skin_code: skinCode,
  });
  if (error) throw new Error(`Unable to gamble Discord skin: ${error.message}`);
  const result = getFirstResult(data as GambledSkinDrop | GambledSkinDrop[] | null);
  if (!result) return { status: 'active-drop' };
  if (result.outcome === 'blocked') return { status: 'active-drop', skinName: result.skin_name };
  if (result.outcome === 'lost') return { status: 'lost', skinName: result.skin_name };
  if (!result.drop_id || !result.new_skin_code || !result.expires_at) {
    throw new Error('Skin gamble did not return its reserved drop.');
  }
  recordDropReservation(config);
  const spawned = await sendReservedSkinDrop(config, guild, channelId, skin, {
    drop_id: result.drop_id,
    expires_at: result.expires_at,
    skin_code: result.new_skin_code,
  }, calculateSkinRaritySpawnPercent(skin.rarity, settings.rarityWeights));
  return spawned
    ? { status: 'spawned', skinName: result.skin_name }
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
  await message.edit({ content: 'This skin has been claimed.', embeds: [skinDropEmbed(claim, resolvedUser.id)] });
  await message.reply({
    allowedMentions: { parse: [], users: [resolvedUser.id] },
    content: `<@${resolvedUser.id}> claimed **${claim.skin_name}** · #${formatSkinCode(claim.skin_code)}.`,
  });
}

export async function getSkinCollectionPage(config: DiscordBotConfig, discordUserId: string, requestedPage: number): Promise<SkinCollectionPage> {
  const supabase = createBotServiceClient(config);
  const page = Math.max(0, Math.floor(requestedPage));
  const [collectionResult, settingsResult, capacityResult, sellValuesResult] = await Promise.all([
    supabase
      .from('discord_skin_claim_drops')
      .select('skin_code, skin_catalog_id, skin_name, champion_name, rarity, release_date, skin_line, image_url, owner_acquired_at, ownership_method, is_favorite', { count: 'exact' })
      .eq('guild_id', config.guildId)
      .eq('owner_discord_user_id', discordUserId)
      .eq('status', 'claimed')
      .order('is_favorite', { ascending: false })
      .order('owner_acquired_at', { ascending: false })
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
  ]);
  if (collectionResult.error) throw new Error(`Unable to read Discord skin collection: ${collectionResult.error.message}`);
  if (settingsResult.error) throw new Error(`Unable to read Discord collection capacity: ${settingsResult.error.message}`);
  if (capacityResult.error) throw new Error(`Unable to read Discord collection capacity: ${capacityResult.error.message}`);
  if (sellValuesResult.error) throw new Error(`Unable to read Discord skin sell values: ${sellValuesResult.error.message}`);
  if (!settingsResult.data) throw new Error('Discord collection economy has not been configured.');
  const total = collectionResult.count ?? 0;
  const capacity = settingsResult.data.default_collection_capacity + (capacityResult.data?.extra_slots ?? 0);
  const normalizedPage = total ? Math.min(page, total - 1) : 0;
  if (normalizedPage !== page) {
    return getSkinCollectionPage(config, discordUserId, normalizedPage);
  }
  const item = collectionResult.data?.[0] ? { ...collectionResult.data[0], claimed: true } : null;
  const sellValue = item
    ? (sellValuesResult.data ?? []).find((entry) => entry.rarity === item.rarity)?.amount ?? null
    : null;
  return { capacity, item, page: normalizedPage, sellValue, total };
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

export function buildSkinSearchEmbed(skin: CatalogSkin) {
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
      { name: 'KnowLeague ID', value: `#${skin.id}`, inline: true },
    );
}

export function buildSkinCollectionEmbed(page: SkinCollectionPage, ownerName: string, showDetails = false) {
  if (!page.item) {
    return new EmbedBuilder()
      .setColor(0x64748B)
      .setTitle(`${ownerName}'s skin collection (max ${page.capacity})`)
      .setDescription('No skins claimed yet. Watch for a skin drop and react first to claim it.');
  }
  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[page.item.rarity] ?? 0xF59E0B)
    .setTitle(`${ownerName}'s skin collection · ${page.page + 1} of ${page.total} (max ${page.capacity})`)
    .setDescription(`**${page.item.skin_name}** · **${page.item.rarity}**`)
    .setImage(getClaimedSkinDisplayImageUrl(page.item))
    .setFooter({ text: `Skin ${page.page + 1} of ${page.total} · Use /collections give to transfer #${formatSkinCode(page.item.skin_code)}.` });

  if (!showDetails) return embed;

  return embed.addFields(
    {
      name: 'Skin',
      value: [
        `**Champion**\n${page.item.champion_name}`,
        `**Skin line**\n${page.item.skin_line}`,
        `**Release date**\n${formatReleaseDate(page.item.release_date)}`,
      ].join('\n\n'),
      inline: true,
    },
    {
      name: 'Collection details',
      value: [
        `**KnowLeague ID**\n#${formatSkinCode(page.item.skin_code)}`,
        `**Sells for**\n${formatKnowBucks(page.sellValue)}`,
        `**Acquired**\n${formatAcquiredDate(page.item.owner_acquired_at)}`,
        `**Method**\n${formatOwnershipMethod(page.item.ownership_method)}`,
      ].join('\n\n'),
      inline: true,
    },
  );
}

export function skinCollectionCode(skinCode: number) {
  return formatSkinCode(skinCode);
}
