import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-utils';
import {
  generateRiftboundMockOpening,
  isRiftboundMockSetCode,
  RIFTBOUND_MOCK_SET_CODES,
  type RiftboundMockOpeningCard,
  type RiftboundMockSetCode,
  type RiftboundMockTreatment,
} from '@/lib/riftbound-mock-opening-engine';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type RiftboundMockOpeningKind = 'pack' | 'box';

export type RiftboundMockCartItem = {
  productKind: RiftboundMockOpeningKind;
  quantity: number;
  setCode: RiftboundMockSetCode;
};

export type RiftboundMockShopPrice = {
  box_cost_knowbucks: number;
  box_market_cents: number;
  pack_cost_knowbucks: number;
  set_code: RiftboundMockSetCode;
  source_product_name: string;
  week_start: string;
};

export type RiftboundMockSealedProduct = {
  box_quantity: number;
  pack_quantity: number;
  set_code: RiftboundMockSetCode;
};

export type RiftboundMockOpeningRecord = {
  cards: RiftboundMockOpeningCard[];
  id: string;
  opening_kind: RiftboundMockOpeningKind;
  opening_source: 'discord' | 'website';
  opened_at: string;
  packs_opened: number;
  reveal_expires_at: string | null;
  revealed_at: string | null;
  set_code: RiftboundMockSetCode;
};

type OpeningRow = Omit<RiftboundMockOpeningRecord, 'cards' | 'opening_kind' | 'opening_source' | 'set_code'> & {
  cards: unknown;
  opening_kind: string;
  opening_source: string;
  set_code: string;
};

type OpeningTotalRow = {
  packs_opened: number;
  set_code: string;
};

type PurchaseCartResult = {
  balance_after: number;
  charged_knowbucks: number;
  sealed_products: unknown;
};

type WebOpenResult = {
  box_quantity: number;
  opening_id: string;
  pack_quantity: number;
  packs_opened: number;
  reveal_expires_at: string;
};

function isTreatment(value: unknown): value is RiftboundMockTreatment {
  return value === 'standard'
    || value === 'alt_art'
    || value === 'special_alt'
    || value === 'overnumbered'
    || value === 'signature'
    || value === 'ultimate';
}

type StoredOpeningCard = Partial<RiftboundMockOpeningCard> & {
  card_id?: unknown;
  finish?: unknown;
  slot?: unknown;
  treatment?: unknown;
};

const cardsById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));

function isMissingMockOpeningWorkspaceFunction(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === '42883'
    || candidate.code === 'PGRST202'
    || (typeof candidate.message === 'string' && /get_riftbound_mock_opening_(history|totals)|could not find the function|does not exist/i.test(candidate.message));
}

function hydrateOpeningCard(value: unknown): RiftboundMockOpeningCard | null {
  if (!value || typeof value !== 'object') return null;
  const card = value as StoredOpeningCard;
  if (!(typeof card.card_id === 'string'
    && (card.finish === 'normal' || card.finish === 'foil')
    && (card.slot === 'common' || card.slot === 'uncommon' || card.slot === 'foil' || card.slot === 'rare' || card.slot === 'premium')
    && isTreatment(card.treatment))) return null;

  const catalogueCard = cardsById.get(card.card_id);
  const displayName = typeof card.display_name === 'string' ? card.display_name : catalogueCard?.displayName;
  const imageUrl = card.image_url === null || typeof card.image_url === 'string' ? card.image_url : catalogueCard?.imageUrl ?? null;
  const marketPriceUsd = card.market_price_usd === null || typeof card.market_price_usd === 'number'
    ? card.market_price_usd
    : catalogueCard?.marketPrices[card.finish] ?? null;
  const rarity = typeof card.rarity === 'string' ? card.rarity : catalogueCard?.rarity;
  if (!displayName || !rarity) return null;

  return {
    card_id: card.card_id,
    display_name: displayName,
    finish: card.finish,
    image_url: imageUrl,
    market_price_usd: marketPriceUsd,
    rarity,
    slot: card.slot,
    treatment: card.treatment,
  };
}

function parseOpeningRow(row: OpeningRow): RiftboundMockOpeningRecord | null {
  if (!isRiftboundMockSetCode(row.set_code)
    || (row.opening_kind !== 'pack' && row.opening_kind !== 'box')
    || (row.opening_source !== 'discord' && row.opening_source !== 'website')
    || !Number.isSafeInteger(row.packs_opened)
    || row.packs_opened < 1
    || !Array.isArray(row.cards)
    || row.cards.length !== row.packs_opened * 13) return null;
  const cards: RiftboundMockOpeningCard[] = [];
  for (const value of row.cards) {
    const card = hydrateOpeningCard(value);
    if (!card) return null;
    cards.push(card);
  }
  return { ...row, cards, opening_kind: row.opening_kind, opening_source: row.opening_source, set_code: row.set_code };
}

function isHistoryOpening(opening: RiftboundMockOpeningRecord, now: number) {
  return opening.opening_source === 'discord'
    || opening.revealed_at !== null
    || (opening.reveal_expires_at !== null && Date.parse(opening.reveal_expires_at) <= now);
}

function limitOpeningHistoryToPacks(openings: readonly RiftboundMockOpeningRecord[], maxPacks = 96) {
  let remainingPacks = maxPacks;
  const history: RiftboundMockOpeningRecord[] = [];
  for (const opening of openings) {
    if (remainingPacks <= 0) break;
    const packsToInclude = Math.min(opening.packs_opened, remainingPacks);
    history.push({
      ...opening,
      cards: opening.cards.slice(0, packsToInclude * 13),
      packs_opened: packsToInclude,
    });
    remainingPacks -= packsToInclude;
  }
  return history;
}

function toMockActionError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('insufficient knowbucks')) {
    throw new ApiError(400, 'You do not have enough KnowBucks for this mock cart.');
  }
  if (normalized.includes('no current mock box price')) {
    throw new ApiError(503, 'This set has no current mock box price. Please try again after the next market refresh.');
  }
  if (normalized.includes('finish revealing your current mock opening')) {
    throw new ApiError(409, 'You must finish revealing your current mock opening before opening another product.');
  }
  if (normalized.includes('do not have unopened riftbound') || normalized.includes('do not have an unopened riftbound')) {
    throw new ApiError(400, 'You do not have enough unopened packs or boxes from this set.');
  }
  throw error;
}

async function loadMockPrices() {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_mock_box_price_snapshots')
    .select('set_code,week_start,source_product_name,box_market_cents,box_cost_knowbucks,pack_cost_knowbucks,captured_at')
    .order('week_start', { ascending: false })
    .order('captured_at', { ascending: false })
    .returns<Array<RiftboundMockShopPrice & { captured_at: string; set_code: string }>>();
  if (error) throw error;
  const bySet = new Map<RiftboundMockSetCode, RiftboundMockShopPrice>();
  for (const row of data ?? []) {
    if (!isRiftboundMockSetCode(row.set_code) || bySet.has(row.set_code)) continue;
    bySet.set(row.set_code, { ...row, set_code: row.set_code });
  }
  return RIFTBOUND_MOCK_SET_CODES.flatMap((setCode) => {
    const price = bySet.get(setCode);
    return price ? [price] : [];
  });
}

async function getLinkedDiscordIdentity(userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('profile_private_details')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle<{ discord_user_id: string | null }>();
  if (error) throw error;
  return data?.discord_user_id ?? null;
}

async function getCurrentKnowBucks(userId: string) {
  const discordUserId = await getLinkedDiscordIdentity(userId);
  if (!discordUserId) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from('discord_knowbucks_balances')
    .select('balance')
    .eq('discord_user_id', discordUserId)
    .maybeSingle<{ balance: number }>();
  if (error) throw error;
  return data?.balance ?? 0;
}

async function loadRiftboundMockOpeningHistory(userId: string): Promise<OpeningRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc('get_riftbound_mock_opening_history', {
      p_max_openings: 96,
      p_max_packs: 96,
      p_user_id: userId,
    })
    .returns<OpeningRow[]>();

  if (!error) return Array.isArray(data) ? data : [];
  if (!isMissingMockOpeningWorkspaceFunction(error)) throw error;

  // Compatibility path while migration 214 is rolled out. The current UI
  // renders no more than 96 packs, so avoid retrieving the former 240-row
  // window even in an environment that has not received the bounded RPC yet.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('riftbound_mock_openings')
    .select('id,set_code,opening_kind,packs_opened,cards,opened_at,opening_source,reveal_expires_at,revealed_at')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })
    .limit(96)
    .returns<OpeningRow[]>();
  if (fallbackError) throw fallbackError;
  return fallbackData ?? [];
}

async function loadRiftboundMockOpeningTotals(userId: string): Promise<OpeningTotalRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc('get_riftbound_mock_opening_totals', { p_user_id: userId })
    .returns<OpeningTotalRow[]>();

  if (!error) return Array.isArray(data) ? data : [];
  if (!isMissingMockOpeningWorkspaceFunction(error)) throw error;

  // Compatibility path for deployments that have not applied migration 214.
  // The RPC removes this 10,000-row transfer and retains exact totals.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('riftbound_mock_openings')
    .select('set_code,packs_opened')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })
    .limit(10_000)
    .returns<OpeningTotalRow[]>();
  if (fallbackError) throw fallbackError;
  return fallbackData ?? [];
}

export async function loadRiftboundMockOpeningWorkspace(userId: string) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const [prices, sealedResult, activeResult, historyRows, totalRows, knowBucks] = await Promise.all([
    loadMockPrices(),
    supabase.from('discord_riftbound_mock_sealed_products')
      .select('set_code,pack_quantity,box_quantity')
      .eq('user_id', userId)
      .order('set_code', { ascending: true })
      .returns<Array<RiftboundMockSealedProduct & { set_code: string }>>(),
    supabase.from('riftbound_mock_openings')
      .select('id,set_code,opening_kind,packs_opened,cards,opened_at,opening_source,reveal_expires_at,revealed_at')
      .eq('user_id', userId)
      .eq('opening_source', 'website')
      .is('revealed_at', null)
      .gt('reveal_expires_at', now)
      .order('opened_at', { ascending: false })
      .limit(1)
      .returns<OpeningRow[]>(),
    loadRiftboundMockOpeningHistory(userId),
    loadRiftboundMockOpeningTotals(userId),
    getCurrentKnowBucks(userId),
  ]);
  if (sealedResult.error) throw sealedResult.error;
  if (activeResult.error) throw activeResult.error;

  const sealedProducts = (sealedResult.data ?? []).flatMap((row): RiftboundMockSealedProduct[] => (
    isRiftboundMockSetCode(row.set_code) ? [{ ...row, set_code: row.set_code }] : []
  ));
  const activeOpening = (activeResult.data ?? []).map(parseOpeningRow).find((opening): opening is RiftboundMockOpeningRecord => opening !== null) ?? null;
  const history = limitOpeningHistoryToPacks(
    historyRows
      .map(parseOpeningRow)
      .flatMap((opening): RiftboundMockOpeningRecord[] => opening ? [opening] : [])
      .filter((opening) => isHistoryOpening(opening, Date.parse(now))),
  );
  const packsOpenedBySet = RIFTBOUND_MOCK_SET_CODES.reduce<Record<RiftboundMockSetCode, number>>((totals, setCode) => {
    totals[setCode] = totalRows.reduce((total, row) => (
      row.set_code === setCode && Number.isSafeInteger(row.packs_opened) && row.packs_opened >= 0
        ? total + row.packs_opened
        : total
    ), 0);
    return totals;
  }, {} as Record<RiftboundMockSetCode, number>);

  return { activeOpening, history, knowBucks, packsOpenedBySet, prices, sealedProducts };
}

export async function purchaseRiftboundMockWebsiteCart(
  userId: string,
  products: readonly RiftboundMockCartItem[],
) {
  if (products.length < 1 || products.length > 10 || products.some((product) => product.quantity < 1 || product.quantity > 120)) {
    throw new ApiError(400, 'Choose between one and 120 of each mock product.');
  }
  const discordUserId = await getLinkedDiscordIdentity(userId);
  if (!discordUserId) {
    throw new ApiError(400, 'KnowBucks are not available on this account yet. Link Discord to use your current KnowBucks; website-earned KnowBucks will work here when they launch.');
  }
  const { data: guildRows, error: guildError } = await getSupabaseServiceClient()
    .from('discord_leveling_settings')
    .select('guild_id')
    .limit(1)
    .returns<Array<{ guild_id: string }>>();
  if (guildError) throw guildError;
  const guildId = guildRows?.[0]?.guild_id;
  if (!guildId) throw new ApiError(503, 'Mock Riftbound purchases are not configured yet.');
  const { data, error } = await getSupabaseServiceClient()
    .rpc('purchase_discord_riftbound_mock_cart', {
      p_discord_user_id: discordUserId,
      p_guild_id: guildId,
      p_products: products.map((product) => ({
        product_kind: product.productKind,
        quantity: product.quantity,
        set_code: product.setCode,
      })),
    })
    .returns<PurchaseCartResult[]>();
  if (error) toMockActionError(error);
  const result = (data as unknown as PurchaseCartResult[] | null)?.[0];
  if (!result || !Number.isSafeInteger(result.balance_after) || !Array.isArray(result.sealed_products)) {
    throw new Error('Riftbound mock cart purchase did not return updated inventory.');
  }
  const sealedProducts = result.sealed_products.flatMap((product): RiftboundMockSealedProduct[] => (
    product && typeof product === 'object'
      && 'set_code' in product
      && 'pack_quantity' in product
      && 'box_quantity' in product
      && typeof product.set_code === 'string'
      && isRiftboundMockSetCode(product.set_code)
      && Number.isSafeInteger(product.pack_quantity)
      && product.pack_quantity >= 0
      && Number.isSafeInteger(product.box_quantity)
      && product.box_quantity >= 0
      ? [{
        set_code: product.set_code,
        pack_quantity: product.pack_quantity,
        box_quantity: product.box_quantity,
      }]
      : []
  ));
  if (sealedProducts.length === 0) throw new Error('Riftbound mock cart purchase did not return updated inventory.');
  return { balance_after: result.balance_after, sealed_products: sealedProducts };
}

export async function openRiftboundMockWebsiteProduct(
  userId: string,
  setCode: RiftboundMockSetCode,
  openingKind: RiftboundMockOpeningKind,
) {
  const opening = generateRiftboundMockOpening(setCode, openingKind);
  const openingId = randomUUID();
  const { data, error } = await getSupabaseServiceClient()
    .rpc('open_riftbound_mock_web_product', {
      p_cards: opening.cards,
      p_opening_id: openingId,
      p_opening_kind: openingKind,
      p_set_code: setCode,
      p_user_id: userId,
    })
    .returns<WebOpenResult[]>();
  if (error) toMockActionError(error);
  const result = (data as unknown as WebOpenResult[] | null)?.[0];
  if (!result) throw new Error('Riftbound mock opening did not return updated sealed inventory.');
  const createdOpening = {
    cards: opening.cards,
    id: result.opening_id,
    opening_kind: openingKind,
    opening_source: 'website' as const,
    opened_at: new Date().toISOString(),
    packs_opened: result.packs_opened,
    reveal_expires_at: result.reveal_expires_at,
    revealed_at: null,
    set_code: setCode,
  } satisfies RiftboundMockOpeningRecord;
  return {
    opening: createdOpening,
    sealedProduct: {
      box_quantity: result.box_quantity,
      pack_quantity: result.pack_quantity,
      set_code: setCode,
    } satisfies RiftboundMockSealedProduct,
  };
}

export async function completeRiftboundMockWebsiteOpening(userId: string, openingId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_mock_openings')
    .update({ revealed_at: new Date().toISOString() })
    .eq('id', openingId)
    .eq('user_id', userId)
    .eq('opening_source', 'website')
    .is('revealed_at', null)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'This mock opening is no longer available.');
}
