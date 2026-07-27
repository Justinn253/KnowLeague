import { getSupabaseServiceClient } from '@/lib/supabaseClient';

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

export type RiftboundLatestPricesPayload = {
  snapshotDate: string | null;
  sourceSnapshotAt: string | null;
  capturedAt: string | null;
  prices: Record<string, RiftboundLatestPrice>;
};

type LatestSnapshotDateRow = {
  snapshot_date: string;
};

type LatestSnapshotRow = {
  card_id: string;
  finish: 'normal' | 'foil';
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

type RiftboundSupabaseClient = ReturnType<typeof getSupabaseServiceClient>;

export async function loadLatestRiftboundPrices(
  supabase: RiftboundSupabaseClient = getSupabaseServiceClient(),
): Promise<RiftboundLatestPricesPayload> {
  const { data: latestDateRow, error: latestDateError } = await supabase
    .from('riftbound_card_price_snapshots')
    .select('snapshot_date')
    .eq('source', 'tcgcsv')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle<LatestSnapshotDateRow>();

  if (latestDateError) throw latestDateError;

  if (!latestDateRow) {
    return {
      snapshotDate: null,
      sourceSnapshotAt: null,
      capturedAt: null,
      prices: {},
    };
  }

  const { data, error } = await supabase
    .from('riftbound_card_price_snapshots')
    .select('card_id, finish, price_cents, source_snapshot_at, captured_at')
    .eq('source', 'tcgcsv')
    .eq('snapshot_date', latestDateRow.snapshot_date)
    .returns<LatestSnapshotRow[]>();

  if (error) throw error;

  const prices: Record<string, RiftboundLatestPrice> = {};
  let sourceSnapshotAt: string | null = null;
  let capturedAt: string | null = null;

  (data ?? []).forEach((row) => {
    const current = prices[row.card_id] ?? { normal: null, foil: null, updatedAt: null };
    current[row.finish] = row.price_cents === null ? null : row.price_cents / 100;
    current.updatedAt = row.source_snapshot_at ?? row.captured_at;
    prices[row.card_id] = current;
    if (!sourceSnapshotAt && row.source_snapshot_at) sourceSnapshotAt = row.source_snapshot_at;
    if (!capturedAt || row.captured_at > capturedAt) capturedAt = row.captured_at;
  });

  return {
    snapshotDate: latestDateRow.snapshot_date,
    sourceSnapshotAt,
    capturedAt,
    prices,
  };
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

  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    created_at: set.created_at,
    cards: (cardData ?? [])
      .filter((card) => card.set_id === set.id)
      .map(({ card_id, quantity }) => ({ card_id, quantity })),
  }));
}

export async function loadRiftboundBootstrap(userId: string | null) {
  const supabase = getSupabaseServiceClient();
  const [prices, inventory, sets] = await Promise.all([
    loadLatestRiftboundPrices(supabase),
    userId ? loadRiftboundInventory(userId, supabase) : Promise.resolve([] as RiftboundInventoryRow[]),
    userId ? loadRiftboundSets(userId, supabase) : Promise.resolve([] as RiftboundSet[]),
  ]);

  return {
    ...prices,
    inventory: { items: inventory },
    sets: { sets },
  };
}
