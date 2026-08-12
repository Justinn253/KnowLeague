import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { deleteServerCache, getServerCache, setServerCache } from '@/lib/server-memory-cache';
import type { RiftboundCardTierRating } from '@/lib/riftbound';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';
import { loadRiftboundCardTierRatingMap } from '@/lib/riftbound-card-tiers';

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

export type RiftboundSetCard = {
  card_id: string;
  quantity: number;
};

export type RiftboundSet = {
  id: string;
  name: string;
  created_at: string;
  cards: RiftboundSetCard[];
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

type SetRow = {
  id: string;
  name: string;
  created_at: string;
};

type SetCardRow = {
  set_id: string;
  card_id: string;
  quantity: number;
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

export async function loadRiftboundSets(
  userId: string,
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
): Promise<RiftboundSet[]> {
  const { data: setData, error: setError } = await supabase
    .from('riftbound_sets')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<SetRow[]>();

  if (setError) throw setError;
  const sets = setData ?? [];
  if (sets.length === 0) return [];

  const { data: cardData, error: cardError } = await supabase
    .from('riftbound_set_cards')
    .select('set_id, card_id, quantity')
    .in('set_id', sets.map((set) => set.id))
    .returns<SetCardRow[]>();

  if (cardError) throw cardError;

  const cardsBySetId = new Map<string, SetCardRow[]>();
  (cardData ?? []).forEach((card) => {
    const rows = cardsBySetId.get(card.set_id) ?? [];
    rows.push(card);
    cardsBySetId.set(card.set_id, rows);
  });

  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    created_at: set.created_at,
    cards: (cardsBySetId.get(set.id) ?? [])
      .map(({ card_id, quantity }) => ({ card_id, quantity })),
  }));
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
  const [prices, inventory, sets, decks] = await Promise.all([
    loadLatestRiftboundPrices(supabase, userId),
    userId ? loadRiftboundInventory(userId, supabase) : Promise.resolve([] as RiftboundInventoryRow[]),
    userId ? loadRiftboundSets(userId, supabase) : Promise.resolve([] as RiftboundSet[]),
    deckPromise,
  ]);

  return {
    ...prices,
    inventory: { items: inventory },
    sets: { sets },
    decks: { decks },
  };
}
