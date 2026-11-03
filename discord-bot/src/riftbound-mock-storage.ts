import type { DiscordBotConfig } from './config.js';
import type { RiftboundMockOpenedCard, RiftboundMockSetCode } from './riftbound-mock.js';
import { createBotServiceClient } from './supabase.js';

export type RiftboundMockBoxPrice = {
  box_cost_knowbucks: number;
  box_market_cents: number;
  pack_cost_knowbucks: number;
  set_code: RiftboundMockSetCode;
  source_product_name: string;
  week_start: string;
};

export type RiftboundMockSealedInventory = {
  box_quantity: number;
  pack_quantity: number;
  set_code: RiftboundMockSetCode;
};

export type RiftboundMockOpeningRecord = {
  cards: RiftboundMockOpenedCard[];
  opening_kind: 'pack' | 'box';
  packs_opened: number;
  set_code: RiftboundMockSetCode;
};

type PurchaseResult = {
  balance_after: number;
  box_quantity: number;
  charged_knowbucks: number;
  pack_quantity: number;
};

type OpenResult = {
  box_quantity: number;
  opening_id: string;
  pack_quantity: number;
  packs_opened: number;
};

function isOpeningCard(value: unknown): value is RiftboundMockOpenedCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<RiftboundMockOpenedCard>;
  return typeof card.card_id === 'string'
    && (card.finish === 'normal' || card.finish === 'foil')
    && (card.slot === 'common' || card.slot === 'uncommon' || card.slot === 'foil' || card.slot === 'rare' || card.slot === 'premium')
    && (card.treatment === 'standard' || card.treatment === 'alt_art' || card.treatment === 'special_alt' || card.treatment === 'overnumbered' || card.treatment === 'signature' || card.treatment === 'ultimate');
}

function isSetCode(value: string): value is RiftboundMockSetCode {
  return value === 'OGN' || value === 'SFD' || value === 'UNL' || value === 'VEN' || value === 'RAD';
}

export async function getRiftboundMockBoxPrices(config: DiscordBotConfig) {
  const { data, error } = await createBotServiceClient(config)
    .from('riftbound_mock_box_price_snapshots')
    .select('set_code,week_start,source_product_name,box_market_cents,box_cost_knowbucks,pack_cost_knowbucks')
    .order('week_start', { ascending: false })
    .order('captured_at', { ascending: false })
    .returns<Array<RiftboundMockBoxPrice & { set_code: string }>>();
  if (error) throw new Error(`Unable to load Riftbound mock box prices: ${error.message}`);

  const latestBySet = new Map<RiftboundMockSetCode, RiftboundMockBoxPrice>();
  for (const row of data ?? []) {
    if (!isSetCode(row.set_code) || latestBySet.has(row.set_code)) continue;
    latestBySet.set(row.set_code, { ...row, set_code: row.set_code });
  }
  return latestBySet;
}

export async function getRiftboundMockSealedInventory(config: DiscordBotConfig, userId: string) {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_riftbound_mock_sealed_products')
    .select('set_code,pack_quantity,box_quantity')
    .eq('guild_id', config.guildId)
    .eq('user_id', userId)
    .order('set_code', { ascending: true })
    .returns<Array<RiftboundMockSealedInventory & { set_code: string }>>();
  if (error) throw new Error(`Unable to load Riftbound mock sealed products: ${error.message}`);
  return (data ?? []).flatMap((row): RiftboundMockSealedInventory[] => isSetCode(row.set_code) ? [{ ...row, set_code: row.set_code }] : []);
}

export async function purchaseRiftboundMockProduct(
  config: DiscordBotConfig,
  discordUserId: string,
  setCode: RiftboundMockSetCode,
  productKind: 'pack' | 'box',
  quantity: number,
) {
  const { data, error } = await createBotServiceClient(config)
    .rpc('purchase_discord_riftbound_mock_product', {
      p_guild_id: config.guildId,
      p_discord_user_id: discordUserId,
      p_set_code: setCode,
      p_product_kind: productKind,
      p_quantity: quantity,
    })
    .returns<PurchaseResult[]>();
  if (error) throw new Error(error.message);
  const result = (data as unknown as PurchaseResult[] | null)?.[0];
  if (!result) throw new Error('Riftbound mock purchase did not return an updated balance.');
  return result;
}

export async function openRiftboundMockProduct(
  config: DiscordBotConfig,
  openingId: string,
  discordUserId: string,
  setCode: RiftboundMockSetCode,
  openingKind: 'pack' | 'box',
  quantity: number,
  cards: readonly RiftboundMockOpenedCard[],
) {
  const { data, error } = await createBotServiceClient(config)
    .rpc('open_discord_riftbound_mock_product', {
      p_opening_id: openingId,
      p_guild_id: config.guildId,
      p_discord_user_id: discordUserId,
      p_set_code: setCode,
      p_opening_kind: openingKind,
      p_product_quantity: quantity,
      p_cards: cards,
    })
    .returns<OpenResult[]>();
  if (error) throw new Error(error.message);
  const result = (data as unknown as OpenResult[] | null)?.[0];
  if (!result) throw new Error('Riftbound mock opening did not return updated sealed inventory.');
  return result;
}

export async function getRiftboundMockOpening(
  config: DiscordBotConfig,
  openingId: string,
  discordUserId: string,
) {
  const { data, error } = await createBotServiceClient(config)
    .from('riftbound_mock_openings')
    .select('set_code,opening_kind,packs_opened,cards')
    .eq('id', openingId)
    .eq('guild_id', config.guildId)
    .eq('discord_user_id', discordUserId)
    .maybeSingle<{ set_code: string; opening_kind: string; packs_opened: number; cards: unknown }>();
  if (error) throw new Error(`Unable to load Riftbound mock opening: ${error.message}`);
  if (!data || !isSetCode(data.set_code) || (data.opening_kind !== 'pack' && data.opening_kind !== 'box') || !Array.isArray(data.cards) || !data.cards.every(isOpeningCard)) {
    return null;
  }
  return {
    set_code: data.set_code,
    opening_kind: data.opening_kind,
    packs_opened: data.packs_opened,
    cards: data.cards,
  } satisfies RiftboundMockOpeningRecord;
}
