import type { RiftboundCard, RiftboundFinish } from '@/lib/riftbound';

/** The single source used by both current-value and card-history reads. */
export const RIFTBOUND_MARKET_VALUE_SOURCE = 'tcgcsv' as const;

export type RiftboundLatestPrice = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

export type RiftboundLatestSnapshotRow = {
  card_id: string;
  finish: RiftboundFinish;
  snapshot_date?: string;
  price_cents: number | null;
  source_snapshot_at: string | null;
  captured_at: string;
};

export type RiftboundLatestPricesPayload = {
  snapshotDate: string | null;
  sourceSnapshotAt: string | null;
  capturedAt: string | null;
  prices: Record<string, RiftboundLatestPrice>;
};

export function createEmptyRiftboundLatestPrice(): RiftboundLatestPrice {
  return { normal: null, foil: null, updatedAt: null };
}

function getSnapshotTimestamp(row: RiftboundLatestSnapshotRow) {
  return row.source_snapshot_at ?? row.captured_at;
}

function compareSnapshotRows(left: RiftboundLatestSnapshotRow, right: RiftboundLatestSnapshotRow) {
  const dateComparison = (left.snapshot_date ?? '').localeCompare(right.snapshot_date ?? '');
  if (dateComparison !== 0) return dateComparison;
  return getSnapshotTimestamp(left).localeCompare(getSnapshotTimestamp(right));
}

export function buildRiftboundLatestPricesPayload(
  cards: readonly Pick<RiftboundCard, 'id'>[],
  rows: readonly RiftboundLatestSnapshotRow[],
  snapshotDate: string | null = null,
): RiftboundLatestPricesPayload {
  const prices: Record<string, RiftboundLatestPrice> = {};
  const selectedRows = new Map<string, RiftboundLatestSnapshotRow>();
  let resolvedSnapshotDate = snapshotDate;
  let sourceSnapshotAt: string | null = null;
  let capturedAt: string | null = null;

  cards.forEach((card) => {
    prices[card.id] = createEmptyRiftboundLatestPrice();
  });

  rows.forEach((row) => {
    const key = `${row.card_id}:${row.finish}`;
    const existing = selectedRows.get(key);

    // Null source captures document an unavailable listing but must not erase
    // an older known value when both rows are present in a compatibility read.
    if (existing?.price_cents !== null && row.price_cents === null) return;
    if (existing && existing.price_cents === null && row.price_cents !== null) {
      selectedRows.set(key, row);
      return;
    }
    if (!existing || compareSnapshotRows(row, existing) > 0) selectedRows.set(key, row);
  });

  selectedRows.forEach((row) => {
    const current = prices[row.card_id] ?? createEmptyRiftboundLatestPrice();
    const rowTimestamp = getSnapshotTimestamp(row);
    current[row.finish] = row.price_cents === null ? null : row.price_cents / 100;
    if (!current.updatedAt || rowTimestamp > current.updatedAt) current.updatedAt = rowTimestamp;
    prices[row.card_id] = current;

    if (row.snapshot_date && (!resolvedSnapshotDate || row.snapshot_date > resolvedSnapshotDate)) {
      resolvedSnapshotDate = row.snapshot_date;
    }
    if (row.source_snapshot_at && (!sourceSnapshotAt || row.source_snapshot_at > sourceSnapshotAt)) {
      sourceSnapshotAt = row.source_snapshot_at;
    }
    if (!capturedAt || row.captured_at > capturedAt) capturedAt = row.captured_at;
  });

  return { snapshotDate: resolvedSnapshotDate, sourceSnapshotAt, capturedAt, prices };
}
