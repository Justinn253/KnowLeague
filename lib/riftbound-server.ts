import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { deleteServerCache, getServerCache, setServerCache } from '@/lib/server-memory-cache';
import type { RiftboundCardTierRating } from '@/lib/riftbound';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';
import { loadRiftboundCardTierRatingMap } from '@/lib/riftbound-card-tiers';
import { RIFTBOUND_FREE_BINDER_LIMIT, RIFTBOUND_PREMIUM_BINDER_LIMIT, type RiftboundBinder, type RiftboundBinderFinish } from '@/lib/riftbound-binders';

export type RiftboundLatestPrice = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

export type RiftboundInventoryRow = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

export type RiftboundDeckCard = {
  card_id: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

export type RiftboundDeck = {
  id: string;
  name: string;
  description: string;
  legend_card_id: string;
  chosen_champion_card_id: string;
  created_at: string;
  updated_at: string;
  cards: RiftboundDeckCard[];
};

export type RiftboundLatestPricesPayload = {
  snapshotDate: string | null;
  sourceSnapshotAt: string | null;
  capturedAt: string | null;
  prices: Record<string, RiftboundLatestPrice>;
  cardTiers?: Record<string, RiftboundCardTierRating>;
};

type LatestSnapshotRow = {
  card_id: string;
  finish: 'normal' | 'foil';
  snapshot_date?: string;
  price_cents: number | null;
  source_snapshot_at: string | null;
  captured_at: string;
};

type BinderRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type BinderPageRow = {
  id: string;
  binder_id: string;
  page_number: number;
  name: string;
};

type BinderSlotRow = {
  page_id: string;
  slot_index: number;
  card_id: string;
  finish: RiftboundBinderFinish;
};

type DeckRow = {
  id: string;
  name: string;
  description: string;
  legend_card_id: string;
  chosen_champion_card_id: string;
  created_at: string;
  updated_at: string;
};

type DeckCardRow = {
  deck_id: string;
  card_id: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

type RiftboundSupabaseClient = ReturnType<typeof getSupabaseServiceClient>;

const RIFTBOUND_LATEST_PRICES_CACHE_KEY = 'riftbound:latest-prices:tcgcsv';
const RIFTBOUND_LATEST_PRICES_CACHE_TTL_MS = 60_000;
const latestPricesInFlight = new Map<string, Promise<RiftboundLatestPricesPayload>>();
let latestPricesCacheGeneration = 0;

export function invalidateLatestRiftboundPrices() {
  latestPricesCacheGeneration += 1;
  latestPricesInFlight.clear();
  deleteServerCache(RIFTBOUND_LATEST_PRICES_CACHE_KEY);
}

function buildLatestPricesPayload(rows: LatestSnapshotRow[], snapshotDate: string | null = null): RiftboundLatestPricesPayload {
  const prices: Record<string, RiftboundLatestPrice> = {};
  let resolvedSnapshotDate = snapshotDate;
  let sourceSnapshotAt: string | null = null;
  let capturedAt: string | null = null;

  rows.forEach((row) => {
    const current = prices[row.card_id] ?? { normal: null, foil: null, updatedAt: null };
    current[row.finish] = row.price_cents === null ? null : row.price_cents / 100;
    current.updatedAt = row.source_snapshot_at ?? row.captured_at;
    prices[row.card_id] = current;
    if (row.snapshot_date && (!resolvedSnapshotDate || row.snapshot_date > resolvedSnapshotDate)) resolvedSnapshotDate = row.snapshot_date;
    if (row.source_snapshot_at && (!sourceSnapshotAt || row.source_snapshot_at > sourceSnapshotAt)) sourceSnapshotAt = row.source_snapshot_at;
    if (!capturedAt || row.captured_at > capturedAt) capturedAt = row.captured_at;
  });

  return { snapshotDate: resolvedSnapshotDate, sourceSnapshotAt, capturedAt, prices };
}

function isMissingRiftboundDeckStorage(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return candidate.code === '42P01' || (/riftbound_deck/.test(message) && /does not exist|relation/.test(message));
}

async function loadLatestRiftboundPricePayload(
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
): Promise<RiftboundLatestPricesPayload> {
  const cached = getServerCache<RiftboundLatestPricesPayload>(RIFTBOUND_LATEST_PRICES_CACHE_KEY);
  if (cached) return cached;

  const existingRequest = latestPricesInFlight.get(RIFTBOUND_LATEST_PRICES_CACHE_KEY);
  if (existingRequest) return existingRequest;

  const requestGeneration = latestPricesCacheGeneration;
  const request = (async () => {

  // This function is read-only and identical for every user. Once the read
  // RPC migration is installed, this is one indexed database round trip
  // instead of a max-date query followed by a second table scan.
  const latestRowsResult = await supabase
    .rpc('get_riftbound_latest_price_snapshots', { p_source: 'tcgcsv' })
    .returns<LatestSnapshotRow[]>();

  if (!latestRowsResult.error) {
    const latestRows = Array.isArray(latestRowsResult.data)
      ? latestRowsResult.data as LatestSnapshotRow[]
      : [];
    const payload = buildLatestPricesPayload(latestRows);
    if (latestPricesCacheGeneration === requestGeneration) {
      setServerCache(RIFTBOUND_LATEST_PRICES_CACHE_KEY, payload, RIFTBOUND_LATEST_PRICES_CACHE_TTL_MS);
    }
    return payload;
  }

  // The fallback keeps a deployment usable while the append-only migration
  // is being applied across environments.
  const rpcError = latestRowsResult.error as { code?: string; message?: string };
  const functionMissing = rpcError.code === '42883' || rpcError.code === 'PGRST202'
    || Boolean(rpcError.message && /get_riftbound_latest_price_snapshots|could not find the function|does not exist/i.test(rpcError.message));
  if (!functionMissing) throw latestRowsResult.error;

  const { data, error } = await supabase
    .from('riftbound_card_price_snapshots')
    .select('card_id, finish, snapshot_date, price_cents, source_snapshot_at, captured_at')
    .eq('source', 'tcgcsv')
    .order('snapshot_date', { ascending: false })
    .order('captured_at', { ascending: false })
    .limit(5000)
    .returns<LatestSnapshotRow[]>();

  if (error) throw error;

  if (!data || data.length === 0) {
    const payload = {
      snapshotDate: null,
      sourceSnapshotAt: null,
      capturedAt: null,
      prices: {},
    };
    if (latestPricesCacheGeneration === requestGeneration) {
      setServerCache(RIFTBOUND_LATEST_PRICES_CACHE_KEY, payload, RIFTBOUND_LATEST_PRICES_CACHE_TTL_MS);
    }
    return payload;
  }

  const latestRowsByCardFinish = new Map<string, LatestSnapshotRow>();
  data.forEach((row) => {
    const key = `${row.card_id}:${row.finish}`;
    if (!latestRowsByCardFinish.has(key)) latestRowsByCardFinish.set(key, row);
  });
  const payload = buildLatestPricesPayload(Array.from(latestRowsByCardFinish.values()));
  if (latestPricesCacheGeneration === requestGeneration) {
    setServerCache(RIFTBOUND_LATEST_PRICES_CACHE_KEY, payload, RIFTBOUND_LATEST_PRICES_CACHE_TTL_MS);
  }
  return payload;
  })();
  latestPricesInFlight.set(RIFTBOUND_LATEST_PRICES_CACHE_KEY, request);
  void request.then(() => {
    if (latestPricesInFlight.get(RIFTBOUND_LATEST_PRICES_CACHE_KEY) === request) {
      latestPricesInFlight.delete(RIFTBOUND_LATEST_PRICES_CACHE_KEY);
    }
  }, () => {
    if (latestPricesInFlight.get(RIFTBOUND_LATEST_PRICES_CACHE_KEY) === request) {
      latestPricesInFlight.delete(RIFTBOUND_LATEST_PRICES_CACHE_KEY);
    }
  });
  return request;
}

export async function loadLatestRiftboundPrices(
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
  viewerId: string | null = null,
): Promise<RiftboundLatestPricesPayload> {
  const [payload, cardTiers] = await Promise.all([
    loadLatestRiftboundPricePayload(supabase),
    loadRiftboundCardTierRatingMap(viewerId),
  ]);
  return { ...payload, cardTiers };
}

export async function loadRiftboundInventory(
  userId: string,
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
) {
  const { data, error } = await supabase
    .from('riftbound_inventory')
    .select('card_id, finish, quantity, updated_at')
    .eq('user_id', userId)
    .gt('quantity', 0)
    .order('updated_at', { ascending: false })
    .returns<RiftboundInventoryRow[]>();

  if (error) throw error;
  return data ?? [];
}

export async function loadRiftboundBinders(
  userId: string,
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
): Promise<RiftboundBinder[]> {
  const { data: binderData, error: binderError } = await supabase
    .from('riftbound_binders')
    .select('id, name, description, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<BinderRow[]>();

  if (binderError) throw binderError;
  let binders = binderData ?? [];
  if (binders.length < 4) {
    for (let index = binders.length; index < 4; index += 1) {
      const { error: createError } = await supabase.rpc('create_riftbound_binder', {
        p_user_id: userId,
        p_name: `Binder ${index + 1}`,
        p_description: '',
      });
      if (createError && !/up to|maximum|limit/i.test(createError.message ?? '')) throw createError;
    }
    const { data: refreshedBinders, error: refreshError } = await supabase
      .from('riftbound_binders')
      .select('id, name, description, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<BinderRow[]>();
    if (refreshError) throw refreshError;
    binders = refreshedBinders ?? [];
  }
  if (binders.length === 0) return [];

  const { data: pageData, error: pageError } = await supabase
    .from('riftbound_binder_pages')
    .select('id, binder_id, page_number, name')
    .in('binder_id', binders.map((binder) => binder.id))
    .order('page_number', { ascending: true })
    .returns<BinderPageRow[]>();
  if (pageError) throw pageError;

  const pages = pageData ?? [];
  const { data: slotData, error: slotError } = await supabase
    .from('riftbound_binder_slots')
    .select('page_id, slot_index, card_id, finish')
    .in('page_id', pages.map((page) => page.id))
    .order('slot_index', { ascending: true })
    .returns<BinderSlotRow[]>();
  if (slotError) throw slotError;

  const slotsByPageId = new Map<string, BinderSlotRow[]>();
  (slotData ?? []).forEach((slot) => {
    const slots = slotsByPageId.get(slot.page_id) ?? [];
    slots.push(slot);
    slotsByPageId.set(slot.page_id, slots);
  });
  const pagesByBinderId = new Map<string, BinderPageRow[]>();
  pages.forEach((page) => {
    const binderPages = pagesByBinderId.get(page.binder_id) ?? [];
    binderPages.push(page);
    pagesByBinderId.set(page.binder_id, binderPages);
  });

  return binders.map((binder) => ({
    id: binder.id,
    name: binder.name,
    description: binder.description,
    created_at: binder.created_at,
    updated_at: binder.updated_at,
    pages: (pagesByBinderId.get(binder.id) ?? []).map((page) => ({
      id: page.id,
      page_number: page.page_number,
      name: page.name,
      slots: (slotsByPageId.get(page.id) ?? []).map(({ slot_index, card_id, finish }) => ({ slot_index, card_id, finish })),
    })),
  }));
}

export async function getRiftboundBinderLimit(
  userId: string,
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
) {
  const { data, error } = await supabase
    .from('riftbound_entitlements')
    .select('plan, status, premium_until')
    .eq('user_id', userId)
    .maybeSingle<{ plan: 'free' | 'premium'; status: 'active' | 'inactive' | 'past_due' | 'canceled'; premium_until: string | null }>();
  if (error) throw error;
  const premium = data?.plan === 'premium'
    && data.status === 'active'
    && (!data.premium_until || new Date(data.premium_until).getTime() > Date.now());
  return premium ? RIFTBOUND_PREMIUM_BINDER_LIMIT : RIFTBOUND_FREE_BINDER_LIMIT;
}

export async function loadRiftboundDecks(
  userId: string,
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
): Promise<RiftboundDeck[]> {
  const { data: deckData, error: deckError } = await supabase
    .from('riftbound_decks')
    .select('id, name, description, legend_card_id, chosen_champion_card_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<DeckRow[]>();

  if (deckError) throw deckError;
  const decks = deckData ?? [];
  if (decks.length === 0) return [];

  const { data: cardData, error: cardError } = await supabase
    .from('riftbound_deck_cards')
    .select('deck_id, card_id, category, quantity')
    .in('deck_id', decks.map((deck) => deck.id))
    .returns<DeckCardRow[]>();

  if (cardError) throw cardError;

  const cardsByDeckId = new Map<string, DeckCardRow[]>();
  (cardData ?? []).forEach((card) => {
    const rows = cardsByDeckId.get(card.deck_id) ?? [];
    rows.push(card);
    cardsByDeckId.set(card.deck_id, rows);
  });

  return decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    legend_card_id: deck.legend_card_id,
    chosen_champion_card_id: deck.chosen_champion_card_id,
    created_at: deck.created_at,
    updated_at: deck.updated_at,
    cards: (cardsByDeckId.get(deck.id) ?? [])
      .map(({ card_id, category, quantity }) => ({ card_id, category, quantity })),
  }));
}

export async function loadRiftboundBootstrap(userId: string | null) {
  const supabase = getSupabaseServiceClient();
  const deckPromise = userId
    ? loadRiftboundDecks(userId, supabase).catch((error: unknown) => {
      // Keep the existing inventory screen available while the deck migration is being rolled out.
      if (isMissingRiftboundDeckStorage(error)) return [] as RiftboundDeck[];
      throw error;
    })
    : Promise.resolve([] as RiftboundDeck[]);
  const [prices, inventory, binders, binderLimit, decks] = await Promise.all([
    loadLatestRiftboundPrices(supabase, userId),
    userId ? loadRiftboundInventory(userId, supabase) : Promise.resolve([] as RiftboundInventoryRow[]),
    userId ? loadRiftboundBinders(userId, supabase) : Promise.resolve([] as RiftboundBinder[]),
    userId ? getRiftboundBinderLimit(userId, supabase) : Promise.resolve(RIFTBOUND_FREE_BINDER_LIMIT),
    deckPromise,
  ]);

  return {
    ...prices,
    inventory: { items: inventory },
    binders: { binders, limit: binderLimit },
    decks: { decks },
  };
}
