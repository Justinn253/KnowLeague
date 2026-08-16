import { createHash, randomBytes } from 'node:crypto';
import { getRiftboundCardById } from '@/lib/riftbound';
import { RIFTBOUND_DECK_CATEGORY_ORDER, type RiftboundDeckCategory } from '@/lib/riftbound-decks';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import type {
  RiftboundShareDeck,
  RiftboundShareBinder,
  RiftboundShareDeckEntry,
  RiftboundShareInventoryRow,
  RiftboundShareKind,
  RiftboundShareSnapshot,
} from '@/lib/riftbound-share-types';

const SHARE_KEY_BYTES = 9;
const MAX_SHARE_ROWS = 5_000;
const MAX_SHARE_PAYLOAD_BYTES = 512 * 1024;
const SHARED_SNAPSHOT_CACHE_TTL_MS = 5 * 60_000;

type CreateRiftboundShareInput = {
  ownerId?: string | null;
  snapshot: unknown;
};

type SharedSnapshotRow = {
  share_key: string;
  dedupe_key: string;
  payload: RiftboundShareSnapshot;
  created_at: string;
};

function normalizeText(value: unknown, field: string, maxLength: number, required = false) {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  if (required && !text) throw new Error(`${field} is required.`);
  return text;
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeKind(value: unknown): RiftboundShareKind {
  if (value === 'collection' || value === 'set' || value === 'master-set' || value === 'deck' || value === 'binder') return value;
  throw new Error('Invalid Riftbound share type.');
}

function normalizeBinder(value: unknown): RiftboundShareBinder {
  if (!value || typeof value !== 'object') throw new Error('A shared binder snapshot is required.');
  const candidate = value as Partial<RiftboundShareBinder>;
  if (!Array.isArray(candidate.pages) || candidate.pages.length !== 20) throw new Error('A shared binder must contain all 20 pages.');
  const pageNumbers = new Set<number>();
  const pages = candidate.pages.map((rawPage) => {
    if (!rawPage || typeof rawPage !== 'object') throw new Error('Shared binder pages contain invalid values.');
    const page = rawPage as Partial<RiftboundShareBinder['pages'][number]>;
    const pageNumber = page.pageNumber;
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 20 || pageNumbers.has(pageNumber)) throw new Error('Shared binder contains invalid page numbers.');
    pageNumbers.add(pageNumber);
    const name = normalizeText(page.name, 'Shared binder page name', 80, true);
    if (!Array.isArray(page.slots) || page.slots.length > 9) throw new Error('A shared binder page cannot contain more than nine cards.');
    const slotIndexes = new Set<number>();
    const slots = page.slots.map((rawSlot) => {
      if (!rawSlot || typeof rawSlot !== 'object') throw new Error('Shared binder slots contain invalid values.');
      const slot = rawSlot as Partial<RiftboundShareBinder['pages'][number]['slots'][number]>;
      const slotIndex = slot.slotIndex;
      if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 8 || slotIndexes.has(slotIndex)) throw new Error('Shared binder contains invalid slot positions.');
      slotIndexes.add(slotIndex);
      const card = typeof slot.cardId === 'string' ? getRiftboundCardById(slot.cardId) : null;
      if (!card || (slot.finish !== 'normal' && slot.finish !== 'foil') || !card.finishOptions.includes(slot.finish)) throw new Error('Shared binder contains an invalid card or finish.');
      return { slotIndex, cardId: card.id, finish: slot.finish };
    });
    return { pageNumber, name, slots };
  }).sort((left, right) => left.pageNumber - right.pageNumber);

  return {
    name: normalizeText(candidate.name, 'Shared binder name', 80, true),
    description: normalizeText(candidate.description, 'Shared binder description', 500),
    pages,
  };
}

function normalizeRows(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_SHARE_ROWS) {
    throw new Error('A Riftbound share cannot contain more than 5000 card rows.');
  }

  const rows = new Map<string, RiftboundShareInventoryRow>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') throw new Error('Riftbound share rows contain invalid values.');
    const row = candidate as Partial<RiftboundShareInventoryRow>;
    const card = typeof row.card_id === 'string' ? getRiftboundCardById(row.card_id) : null;
    if (!card || (row.finish !== 'normal' && row.finish !== 'foil')) throw new Error('Riftbound share contains an invalid card or finish.');
    if (!card.finishOptions.includes(row.finish)) throw new Error('Riftbound share contains an unavailable finish.');
    if (typeof row.quantity !== 'number' || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 100_000) {
      throw new Error('Riftbound share contains an invalid quantity.');
    }

    const key = `${card.id}:${row.finish}`;
    const nextQuantity = (rows.get(key)?.quantity ?? 0) + row.quantity;
    if (nextQuantity > 100_000) throw new Error('Riftbound share contains too many copies of a card.');
    rows.set(key, { card_id: card.id, finish: row.finish, quantity: nextQuantity });
  }

  return Array.from(rows.values()).sort((left, right) => left.card_id.localeCompare(right.card_id) || left.finish.localeCompare(right.finish));
}

function normalizeDeck(value: unknown): RiftboundShareDeck {
  if (!value || typeof value !== 'object') throw new Error('A shared deck snapshot is required.');
  const candidate = value as Partial<RiftboundShareDeck>;
  const cardsValue = candidate.cards;
  if (!Array.isArray(cardsValue) || cardsValue.length === 0 || cardsValue.length > MAX_SHARE_ROWS) {
    throw new Error('A shared deck must contain between 1 and 5000 card rows.');
  }

  const cards = new Map<string, RiftboundShareDeckEntry>();
  for (const entryValue of cardsValue) {
    if (!entryValue || typeof entryValue !== 'object') throw new Error('Shared deck cards contain invalid values.');
    const entry = entryValue as Partial<RiftboundShareDeckEntry>;
    const card = typeof entry.card_id === 'string' ? getRiftboundCardById(entry.card_id) : null;
    if (!card || !RIFTBOUND_DECK_CATEGORY_ORDER.includes(entry.category as RiftboundDeckCategory)) throw new Error('Shared deck contains an invalid card or category.');
    if (typeof entry.quantity !== 'number' || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 1_000) throw new Error('Shared deck contains an invalid quantity.');
    const category = entry.category as RiftboundDeckCategory;
    const key = `${category}:${card.id}`;
    const nextQuantity = (cards.get(key)?.quantity ?? 0) + entry.quantity;
    if (nextQuantity > 1_000) throw new Error('Shared deck contains too many copies of a card.');
    cards.set(key, { card_id: card.id, category, quantity: nextQuantity });
  }

  const legendCardId = normalizeText(candidate.legendCardId, 'Shared deck legend', 120, true);
  const chosenChampionCardId = normalizeText(candidate.chosenChampionCardId, 'Shared deck champion', 120);
  if (!getRiftboundCardById(legendCardId)) throw new Error('Shared deck contains an unknown legend card.');
  if (chosenChampionCardId && !getRiftboundCardById(chosenChampionCardId)) throw new Error('Shared deck contains an unknown champion card.');

  return {
    name: normalizeText(candidate.name, 'Shared deck name', 120, true),
    description: normalizeText(candidate.description, 'Shared deck description', 500),
    legendCardId,
    chosenChampionCardId,
    createdAt: normalizeDate(candidate.createdAt),
    cards: Array.from(cards.values()).sort((left, right) => RIFTBOUND_DECK_CATEGORY_ORDER.indexOf(left.category) - RIFTBOUND_DECK_CATEGORY_ORDER.indexOf(right.category) || left.card_id.localeCompare(right.card_id)),
  };
}

export function normalizeRiftboundShareSnapshot(value: unknown): RiftboundShareSnapshot {
  if (!value || typeof value !== 'object') throw new Error('A Riftbound share snapshot is required.');
  const candidate = value as Partial<RiftboundShareSnapshot>;
  const kind = normalizeKind(candidate.kind);
  const snapshot: RiftboundShareSnapshot = {
    rows: normalizeRows(candidate.rows),
    kind,
    title: normalizeText(candidate.title, 'Riftbound share title', 160),
    createdBy: normalizeText(candidate.createdBy, 'Riftbound share creator', 120) || 'KnowLeague user',
    createdAt: normalizeDate(candidate.createdAt),
  };
  if (kind === 'deck') snapshot.deck = normalizeDeck(candidate.deck);
  if (kind === 'binder') snapshot.binder = normalizeBinder(candidate.binder);

  const payloadBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  if (payloadBytes > MAX_SHARE_PAYLOAD_BYTES) throw new Error('This Riftbound share is too large to store.');
  return snapshot;
}

function createShareKey() {
  return randomBytes(SHARE_KEY_BYTES).toString('base64url');
}

function createRiftboundShareDedupeKey(ownerId: string | null | undefined, snapshot: RiftboundShareSnapshot) {
  const canonicalSnapshot = {
    owner: ownerId ?? `anonymous:${snapshot.createdBy}`,
    kind: snapshot.kind,
    title: snapshot.title,
    rows: snapshot.rows,
    deck: snapshot.deck ?? null,
    binder: snapshot.binder ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonicalSnapshot)).digest('hex');
}

export async function createRiftboundShare({ ownerId = null, snapshot: rawSnapshot }: CreateRiftboundShareInput) {
  const snapshot = normalizeRiftboundShareSnapshot(rawSnapshot);
  const dedupeKey = createRiftboundShareDedupeKey(ownerId, snapshot);
  const supabase = getSupabaseServiceClient();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: existing, error: existingError } = await supabase
      .from('riftbound_shared_snapshots')
      .select('share_key, created_at')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle<{ share_key: string; created_at: string }>();
    if (existingError) throw existingError;
    if (existing) return { shareKey: existing.share_key, createdAt: existing.created_at, reused: true };

    const shareKey = createShareKey();
    const { data, error } = await supabase
      .from('riftbound_shared_snapshots')
      .insert({ share_key: shareKey, dedupe_key: dedupeKey, owner_id: ownerId, kind: snapshot.kind, title: snapshot.title, payload: snapshot })
      .select('share_key, created_at')
      .single<{ share_key: string; created_at: string }>();
    if (!error && data) return { shareKey: data.share_key, createdAt: data.created_at };
    if (error?.code !== '23505') throw error ?? new Error('Unable to create the Riftbound share.');
  }

  throw new Error('Unable to allocate a Riftbound share key.');
}

export function isRiftboundShareKey(value: string) {
  return /^[A-Za-z0-9_-]{12}$/.test(value);
}

export async function loadRiftboundShare(shareKey: string) {
  if (!isRiftboundShareKey(shareKey)) throw new Error('Riftbound share not found.');
  const cacheKey = `riftbound:shared-snapshot:${shareKey}`;
  const cached = getServerCache<RiftboundShareSnapshot>(cacheKey);
  if (cached) return cached;

  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_shared_snapshots')
    .select('share_key, payload, created_at')
    .eq('share_key', shareKey)
    .maybeSingle<SharedSnapshotRow>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound share not found.');

  const snapshot = normalizeRiftboundShareSnapshot(data.payload);
  setServerCache(cacheKey, snapshot, SHARED_SNAPSHOT_CACHE_TTL_MS);
  return snapshot;
}
