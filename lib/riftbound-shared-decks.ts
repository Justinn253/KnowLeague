import { createHash } from 'node:crypto';
import { getRiftboundCardById } from '@/lib/riftbound';
import { RIFTBOUND_DECK_CATEGORY_ORDER, type RiftboundDeckCategory } from '@/lib/riftbound-decks';
import { getServerCache, deleteServerCache, setServerCache } from '@/lib/server-memory-cache';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import type {
  RiftboundPostReaction,
  RiftboundSharedDeckCard,
  RiftboundSharedDeckDetail,
  RiftboundSharedDeckSummary,
} from '@/lib/riftbound-community-types';

type SharedDeckRow = {
  id: string;
  deck_key: string;
  name: string;
  description: string;
  created_by: string;
  created_by_chat_color: string;
  created_by_username: string | null;
  created_by_avatar_url: string | null;
  deck_created_at: string | null;
  legend_card_id: string | null;
  chosen_champion_card_id: string | null;
  cards: RiftboundSharedDeckCard[];
  preview_card_ids: string[];
  total_card_count: number;
  total_copy_count: number;
  like_count: number;
  dislike_count: number;
  share_count: number;
  created_at: string;
};

type SharedDeckReactionRow = {
  shared_deck_id: string;
  reaction_type: RiftboundPostReaction;
};

type SharedDeckInput = {
  ownerId?: string | null;
  name: unknown;
  description: unknown;
  createdBy: unknown;
  createdByChatColor?: unknown;
  createdByUsername?: unknown;
  createdByAvatarUrl?: unknown;
  createdAt?: unknown;
  deckCreatedAt?: unknown;
  legendCardId?: unknown;
  chosenChampionCardId?: unknown;
  cards: unknown;
};

type SharedDeckCursor = {
  createdAt: string;
  id: string;
};

const sharedDeckCacheKeys = new Set<string>();
const sharedDeckInFlight = new Map<string, Promise<unknown>>();
const SHARED_DECK_CACHE_TTL_MS = 45_000;
const SHARED_DECK_CATEGORY_ORDER: RiftboundDeckCategory[] = RIFTBOUND_DECK_CATEGORY_ORDER;

function asNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown, field: string, maxLength: number, required = false) {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  if (required && !text) throw new Error(`${field} is required.`);
  return text;
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCardId(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !getRiftboundCardById(value)) throw new Error('Shared deck contains an unknown card.');
  return value;
}

function normalizeCards(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5000) {
    throw new Error('A shared deck must contain between 1 and 5000 card rows.');
  }

  const cards = new Map<string, RiftboundSharedDeckCard>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') throw new Error('Shared deck cards contain invalid values.');
    const row = candidate as Partial<RiftboundSharedDeckCard>;
    if (typeof row.card_id !== 'string' || !getRiftboundCardById(row.card_id)) throw new Error('Shared deck contains an unknown card.');
    if (!SHARED_DECK_CATEGORY_ORDER.includes(row.category as RiftboundDeckCategory)) throw new Error('Shared deck contains an invalid category.');
    const quantityValue = row.quantity;
    if (typeof quantityValue !== 'number' || !Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > 1000) throw new Error('Shared deck contains an invalid quantity.');
    const quantity = quantityValue;
    const category = row.category as RiftboundDeckCategory;
    const key = `${category}:${row.card_id}`;
    const existing = cards.get(key);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > 1000) throw new Error('Shared deck contains too many copies of a card.');
    cards.set(key, { card_id: row.card_id, category, quantity: nextQuantity });
  }

  const normalized = Array.from(cards.values()).sort((left, right) => {
    const categoryDifference = SHARED_DECK_CATEGORY_ORDER.indexOf(left.category) - SHARED_DECK_CATEGORY_ORDER.indexOf(right.category);
    return categoryDifference || left.card_id.localeCompare(right.card_id);
  });
  const totalCopyCount = normalized.reduce((total, row) => total + row.quantity, 0);
  if (totalCopyCount > 5000) throw new Error('A shared deck cannot contain more than 5000 cards.');
  return { cards: normalized, totalCopyCount };
}

export function buildRiftboundSharedDeckKey(cards: RiftboundSharedDeckCard[]) {
  const canonical = cards
    .slice()
    .sort((left, right) => SHARED_DECK_CATEGORY_ORDER.indexOf(left.category) - SHARED_DECK_CATEGORY_ORDER.indexOf(right.category) || left.card_id.localeCompare(right.card_id))
    .map((row) => `${row.category}:${row.card_id}:${row.quantity}`)
    .join('|');
  // PostgreSQL's built-in md5(text) keeps the migration independent of the
  // pgcrypto extension while remaining a stable content identity here.
  return createHash('md5').update(canonical).digest('hex');
}

function mapSummary(row: SharedDeckRow, viewerReaction: RiftboundPostReaction | null): RiftboundSharedDeckSummary {
  return {
    id: row.id,
    deckKey: row.deck_key,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdByChatColor: row.created_by_chat_color,
    createdByUsername: row.created_by_username,
    createdByAvatarUrl: row.created_by_avatar_url,
    createdAt: row.created_at,
    deckCreatedAt: row.deck_created_at,
    legendCardId: row.legend_card_id,
    chosenChampionCardId: row.chosen_champion_card_id,
    previewCardIds: row.preview_card_ids ?? [],
    totalCardCount: asNumber(row.total_card_count),
    totalCopyCount: asNumber(row.total_copy_count),
    likeCount: asNumber(row.like_count),
    dislikeCount: asNumber(row.dislike_count),
    shareCount: asNumber(row.share_count),
    viewerReaction,
  };
}

function mapDetail(row: SharedDeckRow, viewerReaction: RiftboundPostReaction | null): RiftboundSharedDeckDetail {
  return {
    ...mapSummary(row, viewerReaction),
    cards: Array.isArray(row.cards) ? row.cards : [],
  };
}

function encodeCursor(cursor: SharedDeckCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeRiftboundSharedDeckCursor(value: string | null | undefined): SharedDeckCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<SharedDeckCursor>;
    if (typeof parsed.id !== 'string' || !parsed.id || typeof parsed.createdAt !== 'string' || !parsed.createdAt) return null;
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

async function loadViewerReactions(deckIds: string[], viewerId: string | null) {
  if (!viewerId || deckIds.length === 0) return new Map<string, RiftboundPostReaction>();
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_shared_deck_reactions')
    .select('shared_deck_id, reaction_type')
    .eq('user_id', viewerId)
    .in('shared_deck_id', deckIds)
    .returns<SharedDeckReactionRow[]>();
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.shared_deck_id, row.reaction_type]));
}

async function loadSharedDeckDetailUncached(deckId: string, viewerId: string | null) {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_shared_decks')
    .select('id, deck_key, name, description, created_by, created_by_chat_color, created_by_username, created_by_avatar_url, deck_created_at, legend_card_id, chosen_champion_card_id, cards, preview_card_ids, total_card_count, total_copy_count, like_count, dislike_count, share_count, created_at')
    .eq('id', deckId)
    .maybeSingle<SharedDeckRow>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound shared deck not found.');
  const reactions = await loadViewerReactions([data.id], viewerId);
  return mapDetail(data, reactions.get(data.id) ?? null);
}

export async function loadRiftboundSharedDeck(deckId: string, viewerId: string | null = null) {
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) throw new Error('Riftbound shared deck not found.');
  const key = `riftbound:shared-deck:${deckId}:${viewerId ?? 'guest'}`;
  const cached = getServerCache<RiftboundSharedDeckDetail>(key);
  if (cached) return cached;
  const existing = sharedDeckInFlight.get(key);
  if (existing) return existing as Promise<RiftboundSharedDeckDetail>;
  sharedDeckCacheKeys.add(key);
  const request = loadSharedDeckDetailUncached(deckId, viewerId)
    .then((value) => {
      setServerCache(key, value, SHARED_DECK_CACHE_TTL_MS);
      return value;
    })
    .finally(() => {
      if (sharedDeckInFlight.get(key) === request) sharedDeckInFlight.delete(key);
    });
  sharedDeckInFlight.set(key, request);
  return request;
}

export async function upsertRiftboundSharedDeck(input: SharedDeckInput) {
  const name = normalizeText(input.name, 'Deck name', 80, true);
  const description = normalizeText(input.description, 'Deck description', 500);
  const createdBy = normalizeText(input.createdBy, 'Deck creator', 120) || 'Unknown user';
  const createdByChatColor = normalizeText(input.createdByChatColor, 'Deck creator color', 20) || 'amber';
  const createdByUsername = normalizeText(input.createdByUsername, 'Deck creator username', 40) || null;
  const createdByAvatarUrl = normalizeText(input.createdByAvatarUrl, 'Deck creator avatar', 500) || null;
  const legendCardId = normalizeCardId(input.legendCardId);
  const chosenChampionCardId = normalizeCardId(input.chosenChampionCardId);
  const { cards, totalCopyCount } = normalizeCards(input.cards);
  const deckKey = buildRiftboundSharedDeckKey(cards);
  const previewCardIds = Array.from(new Set(cards.map((row) => row.card_id))).slice(0, 8);
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('riftbound_shared_decks').upsert({
    deck_key: deckKey,
    name,
    description,
    created_by: createdBy,
    created_by_chat_color: createdByChatColor,
    created_by_username: createdByUsername,
    created_by_avatar_url: createdByAvatarUrl,
    owner_id: input.ownerId ?? null,
    deck_created_at: normalizeDate(input.deckCreatedAt ?? input.createdAt),
    legend_card_id: legendCardId,
    chosen_champion_card_id: chosenChampionCardId,
    cards,
    preview_card_ids: previewCardIds,
    total_card_count: new Set(cards.map((row) => row.card_id)).size,
    total_copy_count: totalCopyCount,
    share_data: null,
  }, { onConflict: 'deck_key', ignoreDuplicates: true });
  if (error) throw error;

  const { data, error: loadError } = await supabase
    .from('riftbound_shared_decks')
    .select('id')
    .eq('deck_key', deckKey)
    .single<{ id: string }>();
  if (loadError) throw loadError;
  invalidateRiftboundSharedDeckCaches(data.id);
  return loadRiftboundSharedDeck(data.id, input.ownerId ?? null);
}

export async function loadRiftboundSharedDecks(input: {
  limit: number;
  cursor: SharedDeckCursor | null;
  viewerId: string | null;
}) {
  const limit = Math.max(1, Math.min(input.limit, 50));
  const cacheKey = `riftbound:shared-decks:recent:${limit}:${input.cursor ? `${input.cursor.createdAt}:${input.cursor.id}` : 'first'}:${input.viewerId ?? 'guest'}`;
  const cached = getServerCache<{ decks: RiftboundSharedDeckSummary[]; nextCursor: string | null }>(cacheKey);
  if (cached) return cached;
  const existing = sharedDeckInFlight.get(cacheKey);
  if (existing) return existing as Promise<{ decks: RiftboundSharedDeckSummary[]; nextCursor: string | null }>;
  sharedDeckCacheKeys.add(cacheKey);
  const request = (async () => {
    let query = getSupabaseServiceClient()
      .from('riftbound_shared_decks')
    .select('id, deck_key, name, description, created_by, created_by_chat_color, created_by_username, created_by_avatar_url, deck_created_at, legend_card_id, chosen_champion_card_id, cards, preview_card_ids, total_card_count, total_copy_count, like_count, dislike_count, share_count, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (input.cursor) {
      query = query.or(`created_at.lt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.lt.${input.cursor.id})`);
    }
    const { data, error } = await query.returns<SharedDeckRow[]>();
    if (error) throw error;
    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);
    const reactions = await loadViewerReactions(pageRows.map((row) => row.id), input.viewerId);
    const result = {
      decks: pageRows.map((row) => mapSummary(row, reactions.get(row.id) ?? null)),
      nextCursor: rows.length > limit && pageRows.length > 0
        ? encodeCursor({ createdAt: pageRows[pageRows.length - 1].created_at, id: pageRows[pageRows.length - 1].id })
        : null,
    };
    setServerCache(cacheKey, result, SHARED_DECK_CACHE_TTL_MS);
    return result;
  })().finally(() => {
    if (sharedDeckInFlight.get(cacheKey) === request) sharedDeckInFlight.delete(cacheKey);
  });
  sharedDeckInFlight.set(cacheKey, request);
  return request;
}

export async function reactToRiftboundSharedDeck(deckId: string, userId: string, reaction: RiftboundPostReaction | null) {
  const { data, error } = await getSupabaseServiceClient().rpc('react_riftbound_shared_deck', {
    p_shared_deck_id: deckId,
    p_user_id: userId,
    p_reaction: reaction,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data as unknown as Array<{ like_count: number; dislike_count: number; reaction: RiftboundPostReaction | null }> : [];
  const row = rows[0];
  if (!row) throw new Error('Unable to update the shared deck reaction.');
  invalidateRiftboundSharedDeckCaches(deckId);
  return { likeCount: row.like_count, dislikeCount: row.dislike_count, reaction: row.reaction ?? null };
}

export async function recordRiftboundSharedDeckShare(deckId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc('record_riftbound_shared_deck_share', {
    p_shared_deck_id: deckId,
  });
  if (error) throw error;
  if (typeof data === 'number') return data;
  const rows = Array.isArray(data) ? data as unknown as number[] : [];
  return Number(rows[0] ?? 0);
}

export async function attachRiftboundPostSharedDeck(postId: string, deckId: string) {
  const { error } = await getSupabaseServiceClient()
    .from('riftbound_posts')
    .update({ shared_deck_id: deckId, updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
  invalidateRiftboundSharedDeckCaches(deckId);
}

function invalidateRiftboundSharedDeckCaches(deckId?: string) {
  sharedDeckCacheKeys.forEach((key) => {
    if (!deckId || key.includes(`shared-deck:${deckId}:`) || key.includes('shared-decks:')) {
      deleteServerCache(key);
      sharedDeckCacheKeys.delete(key);
    }
  });
}
