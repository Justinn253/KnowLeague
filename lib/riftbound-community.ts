import { createHash } from 'node:crypto';
import { getFriendRelationship } from '@/lib/friends';
import { getRiftboundCardById, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { sanitizeChatMessage } from '@/lib/chat-filter';
import { loadLatestRiftboundPrices, loadRiftboundDecks, loadRiftboundInventory } from '@/lib/riftbound-server';
import type { RiftboundLatestPrice } from '@/lib/riftbound-market-values';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { loadRiftboundCardTierRatingMap } from '@/lib/riftbound-card-tiers';
import { attachRiftboundPostSharedDeck, loadRiftboundSharedDeck, upsertRiftboundSharedDeck } from '@/lib/riftbound-shared-decks';
import {
  RIFTBOUND_POST_SORTS,
  RIFTBOUND_POST_BODY_MAX_LENGTH,
  RIFTBOUND_POST_TYPES,
  RIFTBOUND_SOURCE_TYPES,
  type RiftboundCommunityAuthor,
  type RiftboundCommunityComment,
  type RiftboundCommunityPostDetail,
  type RiftboundCommunityPostSort,
  type RiftboundCommunityPostSummary,
  type RiftboundCommunityPostType,
  type RiftboundPostSourceType,
  type RiftboundPostReaction,
  type RiftboundPostSnapshotCard,
  type RiftboundProfileData,
  type RiftboundWishlistCard,
} from '@/lib/riftbound-community-types';

type RiftboundSupabaseClient = ReturnType<typeof getSupabaseServiceClient>;

type PostRow = {
  id: string;
  author_id: string;
  snapshot_id: string;
  post_type: RiftboundCommunityPostType;
  title: string;
  body: string;
  visibility: 'public' | 'friends' | 'unlisted' | 'archived' | 'removed';
  archived_by_staff: boolean;
  archived_from_visibility: 'public' | 'friends' | 'unlisted' | null;
  total_card_count: number;
  total_copy_count: number;
  total_value_cents: number | string;
  set_codes: string[];
  legend_card_id: string | null;
  champion_card_ids: string[];
  battlefield_card_ids: string[];
  unit_card_ids: string[];
  has_sideboard: boolean;
  preview_card_ids: string[];
  like_count: number;
  dislike_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  updated_at: string;
  shared_deck_id: string | null;
};

type FeedRow = PostRow & {
  username: string;
  display_name: string;
  avatar_url: string | null;
  chat_color: string;
  viewer_reaction: RiftboundPostReaction | null;
  sort_value: number | string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  about_me: string;
  avatar_url: string | null;
  chat_color: string;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  source_id: string | null;
  title: string;
  description: string;
};

type SnapshotCardRow = RiftboundPostSnapshotCard & {
  snapshot_id: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'deleted';
  created_at: string;
  updated_at: string;
  like_count: number;
  dislike_count: number;
};

type Cursor = {
  value: number;
  id: string;
};

type CommentCursor = {
  createdAt: string;
  id: string;
};

type BuildRow = {
  cardId: string;
  finish: 'normal' | 'foil';
  category: RiftboundPostSnapshotCard['category'];
  quantity: number;
};

type BuiltSnapshot = {
  sourceType: RiftboundPostSourceType;
  sourceId: string | null;
  title: string;
  description: string;
  rows: BuildRow[];
  snapshot: {
    title: string;
    description: string;
    totalCardCount: number;
    totalCopyCount: number;
    totalValueCents: number;
    setCodes: string[];
    legendCardId: string | null;
    championCardIds: string[];
    battlefieldCardIds: string[];
    unitCardIds: string[];
    hasSideboard: boolean;
    previewCardIds: string[];
  };
  contentHash: string;
};

const RIFTBOUND_FREE_POST_LIMIT = 10;
const RIFTBOUND_PREMIUM_POST_LIMIT = 100;
const RIFTBOUND_FAVORITE_CARD_LIMIT = 4;
const RIFTBOUND_FAVORITE_SOURCE_LIMIT = 4;
const RIFTBOUND_WISHLIST_LIMIT = 8;

function asNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeRiftboundFeedCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.id !== 'string' || !parsed.id || typeof parsed.value !== 'number' || !Number.isFinite(parsed.value)) return null;
    return { id: parsed.id, value: parsed.value };
  } catch {
    return null;
  }
}

function encodeCommentCursor(cursor: CommentCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeRiftboundCommentCursor(value: string | null | undefined): CommentCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CommentCursor>;
    if (typeof parsed.id !== 'string' || !parsed.id || typeof parsed.createdAt !== 'string' || !parsed.createdAt) return null;
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function normalizePostType(value: unknown): RiftboundCommunityPostType {
  if (typeof value !== 'string' || !RIFTBOUND_POST_TYPES.includes(value as RiftboundCommunityPostType)) {
    throw new Error('Invalid Riftbound post type.');
  }
  return value as RiftboundCommunityPostType;
}

function normalizeSourceType(value: unknown): RiftboundPostSourceType {
  if (typeof value !== 'string' || !RIFTBOUND_SOURCE_TYPES.includes(value as RiftboundPostSourceType)) {
    throw new Error('Invalid Riftbound post source.');
  }
  return value as RiftboundPostSourceType;
}

export function normalizeRiftboundPostSort(value: string | null): RiftboundCommunityPostSort {
  return RIFTBOUND_POST_SORTS.includes(value as RiftboundCommunityPostSort)
    ? value as RiftboundCommunityPostSort
    : 'recent';
}

function getCardPrice(card: RiftboundCard, finish: 'normal' | 'foil', prices: Record<string, RiftboundLatestPrice>) {
  const latest = prices[card.id];
  const value = latest?.updatedAt ? latest[finish] : card.marketPrices[finish];
  return value ?? 0;
}

function buildSnapshotSummary(rows: BuildRow[], title: string, description: string, prices: Record<string, RiftboundLatestPrice>) {
  const cards = rows.flatMap((row) => {
    const card = getRiftboundCardById(row.cardId);
    return card ? [{ row, card }] : [];
  });
  const cardIds = unique(cards.map(({ card }) => card.id));
  const setCodes = unique(cards.map(({ card }) => card.setCode)).sort();
  const legendCardId = cards.find(({ card }) => card.cardType === 'Legend')?.card.id ?? null;
  const championCardIds = unique(cards.filter(({ card }) => card.cardTypeLabels.includes('Champion')).map(({ card }) => card.id)).sort();
  const battlefieldCardIds = unique(cards.filter(({ row, card }) => row.category === 'battlefields' || card.cardType === 'Battlefield').map(({ card }) => card.id)).sort();
  const unitCardIds = unique(cards.filter(({ card }) => card.cardType === 'Unit').map(({ card }) => card.id)).sort();
  const totalCopyCount = rows.reduce((total, row) => total + row.quantity, 0);
  const totalValueCents = Math.round(cards.reduce((total, { row, card }) => total + (getCardPrice(card, row.finish, prices) * row.quantity), 0) * 100);

  return {
    title,
    description,
    totalCardCount: cardIds.length,
    totalCopyCount,
    totalValueCents,
    setCodes,
    legendCardId,
    championCardIds,
    battlefieldCardIds,
    unitCardIds,
    hasSideboard: rows.some((row) => row.category === 'sideboard' && row.quantity > 0),
    previewCardIds: cardIds.slice(0, 4),
  };
}

async function buildPostSnapshot(userId: string, sourceTypeValue: unknown, sourceIdValue: unknown, titleValue: unknown, allowSourceTitleFallback = true): Promise<BuiltSnapshot> {
  const sourceType = normalizeSourceType(sourceTypeValue);
  const sourceId = sourceType === 'collection'
    ? null
    : typeof sourceIdValue === 'string' && sourceIdValue.trim() ? sourceIdValue.trim() : null;
  if (sourceType !== 'collection' && sourceType !== 'deck') throw new Error('Riftbound sets have been replaced by binders.');
  if (sourceType !== 'collection' && !sourceId) throw new Error('Choose a Riftbound deck to publish.');

  const pricesPayload = await loadLatestRiftboundPrices();
  const prices = pricesPayload.prices;
  let title = typeof titleValue === 'string' ? titleValue.trim().slice(0, 80) : '';
  let snapshotTitle = title;
  let description = '';
  let rows: BuildRow[] = [];

  if (sourceType === 'collection') {
    const inventory = await loadRiftboundInventory(userId);
    rows = inventory.map((row) => ({
      cardId: row.card_id,
      finish: row.finish,
      category: 'collection' as const,
      quantity: row.quantity,
    }));
    if (!title) title = 'My Riftbound Collection';
    snapshotTitle = title;
  } else {
    const decks = await loadRiftboundDecks(userId);
    const source = decks.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error('Riftbound deck not found.');
    snapshotTitle = source.name;
    if (allowSourceTitleFallback) title = title || source.name;
    description = source.description;
    rows = source.cards.map((row) => ({
      cardId: row.card_id,
      finish: getRiftboundCardById(row.card_id)?.defaultFinish ?? 'normal',
      category: row.category,
      quantity: row.quantity,
    }));
  }

  if (!title) throw new Error('Enter a post title.');
  if (title.length > 80) throw new Error('Post titles must be 80 characters or fewer.');
  if (rows.length === 0) throw new Error('This Riftbound source does not contain any cards.');
  if (rows.length > 5000) throw new Error('A post cannot contain more than 5000 card rows.');
  if (rows.some((row) => !getRiftboundCardById(row.cardId))) throw new Error('The Riftbound source contains an unknown card.');

  const snapshot = buildSnapshotSummary(rows, snapshotTitle, description, prices);
  const contentHash = createHash('sha256')
    .update(JSON.stringify({ userId, sourceType, sourceId, rows }))
    .digest('hex');

  return {
    sourceType,
    sourceId,
    title,
    description,
    rows,
    snapshot,
    contentHash,
  };
}

function buildTextPostSnapshot(userId: string, titleValue: unknown, body: string): BuiltSnapshot {
  const title = typeof titleValue === 'string' ? titleValue.trim().slice(0, 80) : '';
  if (!title) throw new Error('Enter a post title.');
  if (title.length > 80) throw new Error('Post titles must be 80 characters or fewer.');
  const contentHash = createHash('sha256')
    .update(JSON.stringify({ userId, title, body }))
    .digest('hex');
  return {
    sourceType: 'collection',
    sourceId: null,
    title,
    description: '',
    rows: [],
    snapshot: {
      title,
      description: '',
      totalCardCount: 0,
      totalCopyCount: 0,
      totalValueCents: 0,
      setCodes: [],
      legendCardId: null,
      championCardIds: [],
      battlefieldCardIds: [],
      unitCardIds: [],
      hasSideboard: false,
      previewCardIds: [],
    },
    contentHash,
  };
}

export async function getRiftboundEntitlement(userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_entitlements')
    .select('plan, status, premium_until')
    .eq('user_id', userId)
    .maybeSingle<{ plan: 'free' | 'premium'; status: 'active' | 'inactive' | 'past_due' | 'canceled'; premium_until: string | null }>();
  if (error) throw error;

  const premium = data?.plan === 'premium'
    && data.status === 'active'
    && (!data.premium_until || new Date(data.premium_until).getTime() > Date.now());
  return {
    plan: premium ? 'premium' as const : 'free' as const,
    status: data?.status ?? 'inactive' as const,
    postLimit: premium ? RIFTBOUND_PREMIUM_POST_LIMIT : RIFTBOUND_FREE_POST_LIMIT,
    favoriteCardLimit: RIFTBOUND_FAVORITE_CARD_LIMIT,
    favoriteSourceLimit: RIFTBOUND_FAVORITE_SOURCE_LIMIT,
    wishlistLimit: RIFTBOUND_WISHLIST_LIMIT,
  };
}

export async function createRiftboundPost(input: {
  userId: string;
  postType?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  title: unknown;
  body: unknown;
  visibility: unknown;
}) {
  const postType = normalizePostType(input.postType ?? input.sourceType);
  const sourceType = postType === 'general' || postType === 'question'
    ? 'collection'
    : postType === 'deck_build'
      ? 'deck'
      : normalizeSourceType(input.sourceType);
  const visibility = input.visibility === 'friends' ? 'friends' : input.visibility === 'unlisted' ? 'unlisted' : 'public';
  const body = typeof input.body === 'string' ? sanitizeChatMessage(input.body.trim().slice(0, RIFTBOUND_POST_BODY_MAX_LENGTH)) : '';
  const built = postType === 'general' || postType === 'question'
    ? buildTextPostSnapshot(input.userId, input.title, body)
    : await buildPostSnapshot(input.userId, sourceType, input.sourceId, input.title, postType !== 'deck_build');
  const { data, error } = postType === 'general' || postType === 'question'
    ? await getSupabaseServiceClient().rpc('create_riftbound_text_post', {
      p_author_id: input.userId,
      p_post_type: postType,
      p_title: built.title,
      p_body: body,
      p_content_hash: built.contentHash,
      p_snapshot: built.snapshot,
      p_visibility: visibility,
    })
    : await getSupabaseServiceClient().rpc('create_riftbound_post', {
      p_author_id: input.userId,
      p_source_type: built.sourceType,
      p_source_id: built.sourceId,
      p_title: built.title,
      p_body: body,
      p_content_hash: built.contentHash,
      p_snapshot: built.snapshot,
      p_cards: built.rows.map((row) => ({ card_id: row.cardId, finish: row.finish, category: row.category, quantity: row.quantity })),
      p_visibility: visibility,
      p_post_type: postType,
    });
  if (error) throw error;
  const postRows = Array.isArray(data) ? data as unknown as Array<{ post_id: string }> : [];
  const postId = postRows[0]?.post_id;
  if (!postId) throw new Error('Unable to publish the Riftbound post.');
  if (built.sourceType === 'deck') {
    const author = await loadAuthor(input.userId);
    const sharedDeck = await upsertRiftboundSharedDeck({
      ownerId: input.userId,
      name: built.snapshot.title,
      description: built.description,
      createdBy: author.displayName || author.username,
      createdByChatColor: author.chatColor,
      createdByUsername: author.username,
      createdByAvatarUrl: author.avatarUrl,
      legendCardId: built.snapshot.legendCardId,
      chosenChampionCardId: built.snapshot.championCardIds[0] ?? null,
      cards: built.rows
        .filter((row) => ['legend', 'runes', 'battlefields', 'main', 'sideboard'].includes(row.category))
        .map((row) => ({ card_id: row.cardId, category: row.category, quantity: row.quantity })),
    });
    await attachRiftboundPostSharedDeck(postId, sharedDeck.id);
  }
  return loadRiftboundPost(postId, input.userId);
}

function mapAuthor(row: { id: string; username: string; display_name: string; avatar_url: string | null; chat_color: string | null }): RiftboundCommunityAuthor {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    chatColor: row.chat_color ?? 'amber',
  };
}

function mapSummary(row: FeedRow, author?: RiftboundCommunityAuthor): RiftboundCommunityPostSummary {
  return {
    id: row.id,
    author: author ?? mapAuthor({ id: row.author_id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url, chat_color: row.chat_color }),
    postType: row.post_type,
    title: row.title,
    body: row.body,
    visibility: row.visibility === 'friends'
      ? 'friends'
      : row.visibility === 'unlisted'
        ? 'unlisted'
        : row.visibility === 'archived'
          ? 'archived'
          : 'public',
    archivedByStaff: Boolean(row.archived_by_staff),
    totalCardCount: row.total_card_count,
    totalCopyCount: row.total_copy_count,
    totalValueCents: asNumber(row.total_value_cents),
    setCodes: row.set_codes ?? [],
    legendCardId: row.legend_card_id,
    championCardIds: row.champion_card_ids ?? [],
    battlefieldCardIds: row.battlefield_card_ids ?? [],
    unitCardIds: row.unit_card_ids ?? [],
    hasSideboard: Boolean(row.has_sideboard),
    previewCardIds: row.preview_card_ids ?? [],
    likeCount: row.like_count,
    dislikeCount: row.dislike_count,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    viewerReaction: row.viewer_reaction ?? null,
    sharedDeckId: row.shared_deck_id ?? null,
  };
}

function mapPostRow(row: PostRow, author: RiftboundCommunityAuthor, viewerReaction: RiftboundPostReaction | null = null): RiftboundCommunityPostSummary {
  return mapSummary({ ...row, username: author.username, display_name: author.displayName, avatar_url: author.avatarUrl, chat_color: author.chatColor, viewer_reaction: viewerReaction, sort_value: 0 }, author);
}

async function canViewRiftboundPost(post: Pick<PostRow, 'author_id' | 'visibility' | 'archived_by_staff'>, viewerId: string | null, allowArchived = false) {
  if (post.visibility === 'archived') return allowArchived || post.author_id === viewerId;
  if (post.visibility === 'public' || post.visibility === 'unlisted') return true;
  if (post.visibility !== 'friends' || !viewerId) return false;
  if (post.author_id === viewerId) return true;
  return (await getFriendRelationship(viewerId, post.author_id)) === 'friend';
}

export async function loadRiftboundCommunityFeed(input: {
  sort: RiftboundCommunityPostSort;
  limit: number;
  cursor: Cursor | null;
  viewerId: string | null;
  postType: string | null;
  setCode: string | null;
  legendCardId: string | null;
  championCardId: string | null;
  battlefieldCardId: string | null;
  unitCardId: string | null;
  hasSideboard: boolean | null;
  includeArchived?: boolean;
}) {
  const { data, error } = await getSupabaseServiceClient()
    .rpc('get_riftbound_community_feed', {
      p_sort: input.sort,
      p_limit: Math.max(1, Math.min(input.limit, 50)),
      p_cursor_value: input.cursor?.value ?? null,
      p_cursor_id: input.cursor?.id ?? null,
      p_viewer_id: input.viewerId,
      p_post_type: input.postType,
      p_set_code: input.setCode,
      p_legend_card_id: input.legendCardId,
      p_champion_card_id: input.championCardId,
      p_battlefield_card_id: input.battlefieldCardId,
      p_unit_card_id: input.unitCardId,
      p_has_sideboard: input.hasSideboard,
      p_allow_friends: true,
    });
  if (error) throw error;

  const rows = Array.isArray(data) ? data as unknown as FeedRow[] : [];
  const visiblePosts = rows.map((row) => mapSummary(row));
  const archivedPosts = input.includeArchived && !input.cursor
    ? await loadArchivedRiftboundCommunityPosts(input)
    : [];
  const posts = [...visiblePosts, ...archivedPosts].sort((left, right) => {
    if (input.sort === 'recent') return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    return right.likeCount - left.likeCount || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
  }).slice(0, Math.max(1, Math.min(input.limit, 50)));

  return {
    posts,
    nextCursor: rows.length >= Math.min(input.limit, 50)
      ? encodeCursor({ value: asNumber(rows[rows.length - 1].sort_value), id: rows[rows.length - 1].id })
      : null,
  };
}

async function loadArchivedRiftboundCommunityPosts(input: {
  sort: RiftboundCommunityPostSort;
  limit: number;
  viewerId: string | null;
  postType: string | null;
  setCode: string | null;
  legendCardId: string | null;
  championCardId: string | null;
  battlefieldCardId: string | null;
  unitCardId: string | null;
  hasSideboard: boolean | null;
}) {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('riftbound_posts')
    .select('id, author_id, snapshot_id, post_type, title, body, visibility, archived_by_staff, archived_from_visibility, total_card_count, total_copy_count, total_value_cents, set_codes, legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids, has_sideboard, preview_card_ids, like_count, dislike_count, comment_count, share_count, created_at, updated_at, shared_deck_id')
    .eq('visibility', 'archived');
  if (input.postType) query = query.eq('post_type', input.postType);
  if (input.setCode) query = query.contains('set_codes', [input.setCode]);
  if (input.legendCardId) query = query.eq('legend_card_id', input.legendCardId);
  if (input.championCardId) query = query.contains('champion_card_ids', [input.championCardId]);
  if (input.battlefieldCardId) query = query.contains('battlefield_card_ids', [input.battlefieldCardId]);
  if (input.unitCardId) query = query.contains('unit_card_ids', [input.unitCardId]);
  if (input.hasSideboard !== null) query = query.eq('has_sideboard', input.hasSideboard);
  query = input.sort === 'recent'
    ? query.order('created_at', { ascending: false }).order('id', { ascending: false })
    : query.order('like_count', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });

  const { data, error } = await query.limit(Math.max(1, Math.min(input.limit, 50))).returns<PostRow[]>();
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const authorIds = unique(rows.map((row) => row.author_id));
  const [{ data: profiles, error: profilesError }, { data: reactions, error: reactionsError }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url, chat_color').in('id', authorIds).returns<Array<{ id: string; username: string; display_name: string; avatar_url: string | null; chat_color: string | null }>>(),
    input.viewerId
      ? supabase.from('riftbound_post_reactions').select('post_id, reaction_type').eq('user_id', input.viewerId).in('post_id', rows.map((row) => row.id)).returns<Array<{ post_id: string; reaction_type: RiftboundPostReaction }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesError) throw profilesError;
  if (reactionsError) throw reactionsError;

  const authors = new Map((profiles ?? []).map((profile) => [profile.id, mapAuthor(profile)]));
  const viewerReactions = new Map((reactions ?? []).map((reaction) => [reaction.post_id, reaction.reaction_type]));
  return rows.map((row) => mapPostRow(row, authors.get(row.author_id) ?? { id: row.author_id, username: 'Unknown', displayName: 'Unknown', avatarUrl: null, chatColor: 'amber' }, viewerReactions.get(row.id) ?? null));
}

async function loadAuthor(userId: string, supabase: RiftboundSupabaseClient = getSupabaseServiceClient()) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, chat_color')
    .eq('id', userId)
    .maybeSingle<{ id: string; username: string; display_name: string; avatar_url: string | null; chat_color: string | null }>();
  if (error) throw error;
  if (!data) throw new Error('Profile not found.');
  return mapAuthor(data);
}

export async function loadRiftboundPost(postId: string, viewerId: string | null = null, allowArchived = false): Promise<RiftboundCommunityPostDetail> {
  const supabase = getSupabaseServiceClient();
  const { data: post, error: postError } = await supabase
    .from('riftbound_posts')
    .select('id, author_id, snapshot_id, post_type, title, body, visibility, archived_by_staff, archived_from_visibility, total_card_count, total_copy_count, total_value_cents, set_codes, legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids, has_sideboard, preview_card_ids, like_count, dislike_count, comment_count, share_count, created_at, updated_at, shared_deck_id')
    .eq('id', postId)
    .neq('visibility', 'removed')
    .maybeSingle<PostRow>();
  if (postError) throw postError;
  if (!post) throw new Error('Riftbound post not found.');
  if (!(await canViewRiftboundPost(post, viewerId, allowArchived))) throw new Error('Riftbound post not found.');

  const [author, snapshotResult, cardsResult, sharedDeck, reactionResult, cardTiers] = await Promise.all([
    loadAuthor(post.author_id, supabase),
    supabase.from('riftbound_post_snapshots').select('id, source_id, title, description').eq('id', post.snapshot_id).maybeSingle<SnapshotRow>(),
    supabase.from('riftbound_post_snapshot_cards').select('snapshot_id, card_id, finish, category, quantity').eq('snapshot_id', post.snapshot_id).order('category', { ascending: true }).order('card_id', { ascending: true }).returns<SnapshotCardRow[]>(),
    post.shared_deck_id
      ? loadRiftboundSharedDeck(post.shared_deck_id, viewerId)
      : Promise.resolve(null),
    !post.shared_deck_id && viewerId
      ? supabase.from('riftbound_post_reactions').select('reaction_type').eq('post_id', post.id).eq('user_id', viewerId).maybeSingle<{ reaction_type: RiftboundPostReaction }>()
      : Promise.resolve({ data: null, error: null }),
    loadRiftboundCardTierRatingMap(viewerId),
  ]);
  if (snapshotResult.error) throw snapshotResult.error;
  if (cardsResult.error) throw cardsResult.error;
  if (reactionResult.error) throw reactionResult.error;
  if (!snapshotResult.data) throw new Error('Riftbound post snapshot not found.');

  const summary = mapPostRow({
    ...post,
    like_count: sharedDeck?.likeCount ?? post.like_count,
    dislike_count: sharedDeck?.dislikeCount ?? post.dislike_count,
  }, author, sharedDeck?.viewerReaction ?? reactionResult.data?.reaction_type ?? null);

  return {
    ...summary,
    snapshotId: snapshotResult.data.id,
    sourceId: snapshotResult.data.source_id,
    snapshotTitle: snapshotResult.data.title,
    snapshotDescription: snapshotResult.data.description,
    cards: (cardsResult.data ?? []).map(({ snapshot_id: _snapshotId, ...card }) => card),
    cardTiers,
    sharedDeck,
  };
}

export async function loadRecentRiftboundPosts(authorId: string, limit = 12, includeUnlisted = false, viewerId: string | null = null, includeArchived = false) {
  const supabase = getSupabaseServiceClient();
  const canSeeFriendsPosts = includeUnlisted || (viewerId ? (await getFriendRelationship(viewerId, authorId)) === 'friend' : false);
  const allowedVisibilities = includeUnlisted ? ['public', 'friends', 'unlisted'] : ['public', 'friends'];
  if (includeArchived) allowedVisibilities.push('archived');
  const { data, error } = await supabase
    .from('riftbound_posts')
    .select('id, author_id, snapshot_id, post_type, title, body, visibility, archived_by_staff, archived_from_visibility, total_card_count, total_copy_count, total_value_cents, set_codes, legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids, has_sideboard, preview_card_ids, like_count, dislike_count, comment_count, share_count, created_at, updated_at, shared_deck_id')
    .eq('author_id', authorId)
    .in('visibility', allowedVisibilities)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 25)))
    .returns<PostRow[]>();
  if (error) throw error;
  const author = await loadAuthor(authorId, supabase);
  return (data ?? []).filter((row) => {
    if (row.visibility === 'archived') return includeArchived;
    return row.visibility !== 'friends' || canSeeFriendsPosts;
  }).map((row) => mapPostRow(row, author));
}

export async function loadRiftboundComments(postId: string, cursor: CommentCursor | null, limit = 20, viewerId: string | null = null, allowArchived = false, parentId: string | null = null) {
  const supabase = getSupabaseServiceClient();
  const { data: post, error: postError } = await supabase
    .from('riftbound_posts')
    .select('author_id, visibility, archived_by_staff')
    .eq('id', postId)
    .neq('visibility', 'removed')
    .maybeSingle<Pick<PostRow, 'author_id' | 'visibility' | 'archived_by_staff'>>();
  if (postError) throw postError;
  if (!post || !(await canViewRiftboundPost(post, viewerId, allowArchived))) throw new Error('Riftbound post not found.');
  let query = supabase
    .from('riftbound_post_comments')
    .select('id, post_id, author_id, parent_id, body, status, created_at, updated_at, like_count, dislike_count')
    .eq('post_id', postId)
    .eq('status', 'visible')
    ;
  if (!parentId) {
    query = query
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
  }
  const { data, error } = await query.returns<CommentRow[]>();
  if (error) throw error;
  let rows = data ?? [];
  if (parentId) {
    const childRowsByParent = new Map<string, CommentRow[]>();
    rows.forEach((row) => {
      if (!row.parent_id) return;
      const children = childRowsByParent.get(row.parent_id) ?? [];
      children.push(row);
      childRowsByParent.set(row.parent_id, children);
    });
    const descendantIds = new Set<string>();
    const pendingParents = [parentId];
    while (pendingParents.length > 0) {
      const currentParentId = pendingParents.shift();
      if (!currentParentId) continue;
      (childRowsByParent.get(currentParentId) ?? []).forEach((child) => {
        if (descendantIds.has(child.id)) return;
        descendantIds.add(child.id);
        pendingParents.push(child.id);
      });
    }
    rows = rows
      .filter((row) => descendantIds.has(row.id))
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
    if (cursor) {
      rows = rows.filter((row) => row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id));
    }
    rows = rows.slice(0, Math.max(1, Math.min(limit, 50)));
  }
  const authorIds = unique(rows.map((row) => row.author_id));
  const commentIds = rows.map((row) => row.id);
  const [{ data: profiles, error: profilesError }, { data: allComments, error: allCommentsError }, { data: reactions, error: reactionsError }] = await Promise.all([
    authorIds.length > 0
      ? supabase.from('profiles').select('id, username, display_name, avatar_url, chat_color').in('id', authorIds).returns<Array<{ id: string; username: string; display_name: string; avatar_url: string | null; chat_color: string | null }>>()
      : Promise.resolve({ data: [], error: null }),
    commentIds.length > 0
      ? supabase.from('riftbound_post_comments').select('id, parent_id').eq('post_id', postId).eq('status', 'visible').returns<Array<{ id: string; parent_id: string | null }>>()
      : Promise.resolve({ data: [], error: null }),
    viewerId && commentIds.length > 0
      ? supabase.from('riftbound_post_comment_reactions').select('comment_id, reaction_type').eq('user_id', viewerId).in('comment_id', commentIds).returns<Array<{ comment_id: string; reaction_type: RiftboundPostReaction }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesError) throw profilesError;
  if (allCommentsError) throw allCommentsError;
  if (reactionsError) throw reactionsError;
  const authors = new Map((profiles ?? []).map((profile) => [profile.id, mapAuthor(profile)]));
  const childIdsByParent = new Map<string, string[]>();
  (allComments ?? []).forEach((comment) => {
    if (!comment.parent_id) return;
    const children = childIdsByParent.get(comment.parent_id) ?? [];
    children.push(comment.id);
    childIdsByParent.set(comment.parent_id, children);
  });
  const replyCounts = new Map<string, number>();
  const countDescendants = (commentId: string, visiting = new Set<string>()): number => {
    const cached = replyCounts.get(commentId);
    if (cached !== undefined) return cached;
    if (visiting.has(commentId)) return 0;
    const nextVisiting = new Set(visiting).add(commentId);
    const total = (childIdsByParent.get(commentId) ?? []).reduce((count, childId) => count + 1 + countDescendants(childId, nextVisiting), 0);
    replyCounts.set(commentId, total);
    return total;
  };
  commentIds.forEach((commentId) => countDescendants(commentId));
  const viewerReactions = new Map((reactions ?? []).map((reaction) => [reaction.comment_id, reaction.reaction_type]));
  const comments: RiftboundCommunityComment[] = rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    status: row.status,
    author: authors.get(row.author_id) ?? { id: row.author_id, username: 'Unknown', displayName: 'Unknown', avatarUrl: null, chatColor: 'amber' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likeCount: row.like_count,
    dislikeCount: row.dislike_count,
    replyCount: replyCounts.get(row.id) ?? 0,
    viewerReaction: viewerReactions.get(row.id) ?? null,
  }));
  return {
    comments,
    nextCursor: rows.length >= Math.min(limit, 50)
      ? encodeCommentCursor({ createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id })
      : null,
  };
}

export async function createRiftboundComment(postId: string, userId: string, bodyValue: unknown, parentIdValue: unknown) {
  const body = typeof bodyValue === 'string' ? sanitizeChatMessage(bodyValue.trim().slice(0, 1000)) : '';
  if (!body) throw new Error('Comment is required.');
  const parentId = typeof parentIdValue === 'string' && parentIdValue.trim() ? parentIdValue.trim() : null;
  const supabase = getSupabaseServiceClient();
  const { data: post, error: postError } = await supabase.from('riftbound_posts').select('id, author_id, visibility, archived_by_staff').eq('id', postId).neq('visibility', 'removed').maybeSingle<Pick<PostRow, 'id' | 'author_id' | 'visibility' | 'archived_by_staff'>>();
  if (postError) throw postError;
  if (!post || !(await canViewRiftboundPost(post, userId))) throw new Error('Riftbound post not found.');
  if (parentId) {
    const { data: parent, error: parentError } = await supabase.from('riftbound_post_comments').select('id').eq('id', parentId).eq('post_id', postId).eq('status', 'visible').maybeSingle<{ id: string }>();
    if (parentError) throw parentError;
    if (!parent) throw new Error('Comment thread not found.');
  }
  const { data, error } = await supabase
    .from('riftbound_post_comments')
    .insert({ post_id: postId, author_id: userId, parent_id: parentId, body, status: 'visible' })
    .select('id, post_id, author_id, parent_id, body, status, created_at, updated_at, like_count, dislike_count')
    .single<CommentRow>();
  if (error) throw error;
  const author = await loadAuthor(userId, supabase);
  return {
    id: data.id,
    postId: data.post_id,
    parentId: data.parent_id,
    body: data.body,
    status: data.status,
    author,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    likeCount: data.like_count,
    dislikeCount: data.dislike_count,
    replyCount: 0,
    viewerReaction: null,
  } satisfies RiftboundCommunityComment;
}

export async function updateRiftboundPost(postId: string, userId: string, titleValue: unknown, bodyValue: unknown) {
  const title = typeof titleValue === 'string' ? titleValue.trim().slice(0, 80) : '';
  const body = typeof bodyValue === 'string' ? sanitizeChatMessage(bodyValue.trim().slice(0, RIFTBOUND_POST_BODY_MAX_LENGTH)) : '';
  if (!title) throw new Error('Enter a post title.');

  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_posts')
    .update({ title, body, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('author_id', userId)
    .neq('visibility', 'removed')
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound post not found.');
  return loadRiftboundPost(postId, userId);
}

export async function deleteRiftboundPost(postId: string, userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_posts')
    .update({ visibility: 'removed', updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('author_id', userId)
    .neq('visibility', 'removed')
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound post not found.');
}

export async function setRiftboundPostArchiveState(postId: string, actorId: string, action: 'archive' | 'unarchive', isStaff: boolean) {
  const supabase = getSupabaseServiceClient();
  const { data: post, error: postError } = await supabase
    .from('riftbound_posts')
    .select('author_id, visibility, archived_by_staff, archived_from_visibility')
    .eq('id', postId)
    .neq('visibility', 'removed')
    .maybeSingle<Pick<PostRow, 'author_id' | 'visibility' | 'archived_by_staff' | 'archived_from_visibility'>>();
  if (postError) throw postError;
  if (!post) throw new Error('Riftbound post not found.');
  if (!isStaff && post.author_id !== actorId) throw new Error('Only the post owner or staff can archive this post.');

  if (action === 'archive') {
    if (post.visibility === 'archived') throw new Error('Riftbound post is already archived.');
    const { data, error } = await supabase
      .from('riftbound_posts')
      .update({
        visibility: 'archived',
        archived_by: actorId,
        archived_by_staff: isStaff,
        archived_from_visibility: post.visibility,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .in('visibility', ['public', 'friends', 'unlisted'])
      .select('visibility, archived_by_staff')
      .maybeSingle<{ visibility: 'archived'; archived_by_staff: boolean }>();
    if (error) throw error;
    if (!data) throw new Error('Riftbound post not found or already archived.');
    return { visibility: data.visibility, archivedByStaff: Boolean(data.archived_by_staff) } as const;
  }

  if (post.visibility !== 'archived') throw new Error('Riftbound post is not archived.');
  if (post.archived_by_staff && !isStaff) throw new Error('Only staff can unarchive a staff-archived post.');
  const restoredVisibility = post.archived_from_visibility ?? 'public';
  const { data, error } = await supabase
    .from('riftbound_posts')
    .update({
      visibility: restoredVisibility,
      archived_by: null,
      archived_by_staff: false,
      archived_from_visibility: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('visibility', 'archived')
    .select('visibility, archived_by_staff')
    .maybeSingle<{ visibility: 'public' | 'friends' | 'unlisted'; archived_by_staff: boolean }>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound post not found or is no longer archived.');
  return { visibility: data.visibility, archivedByStaff: Boolean(data.archived_by_staff) } as const;
}

export async function reactToRiftboundPost(postId: string, userId: string, reaction: RiftboundPostReaction | null) {
  const { data, error } = await getSupabaseServiceClient()
    .rpc('react_riftbound_post', { p_post_id: postId, p_user_id: userId, p_reaction: reaction });
  if (error) throw error;
  const rows = Array.isArray(data) ? data as unknown as Array<{ like_count: number; dislike_count: number; reaction: RiftboundPostReaction | null }> : [];
  const row = rows[0];
  if (!row) throw new Error('Unable to update the post reaction.');
  return { likeCount: row.like_count, dislikeCount: row.dislike_count, reaction: row.reaction ?? null };
}

export async function reactToRiftboundComment(postId: string, commentId: string, userId: string, reaction: RiftboundPostReaction | null, allowArchived = false) {
  const supabase = getSupabaseServiceClient();
  const { data: comment, error: commentError } = await supabase
    .from('riftbound_post_comments')
    .select('id, post_id, status')
    .eq('id', commentId)
    .eq('post_id', postId)
    .eq('status', 'visible')
    .maybeSingle<{ id: string; post_id: string; status: 'visible' }>();
  if (commentError) throw commentError;
  if (!comment) throw new Error('Riftbound comment not found.');

  const { data: post, error: postError } = await supabase
    .from('riftbound_posts')
    .select('author_id, visibility, archived_by_staff')
    .eq('id', postId)
    .neq('visibility', 'removed')
    .maybeSingle<Pick<PostRow, 'author_id' | 'visibility' | 'archived_by_staff'>>();
  if (postError) throw postError;
  if (!post || !(await canViewRiftboundPost(post, userId, allowArchived))) throw new Error('Riftbound post not found.');

  const { data, error } = await supabase.rpc('react_riftbound_comment', {
    p_comment_id: commentId,
    p_user_id: userId,
    p_reaction: reaction,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data as unknown as Array<{ like_count: number; dislike_count: number; reaction: RiftboundPostReaction | null }> : [];
  const row = rows[0];
  if (!row) throw new Error('Unable to update the comment reaction.');
  return { likeCount: row.like_count, dislikeCount: row.dislike_count, reaction: row.reaction ?? null };
}

export async function recordRiftboundPostShare(postId: string, userId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc('record_riftbound_post_share', { p_post_id: postId, p_user_id: userId });
  if (error) throw error;
  const rows = Array.isArray(data) ? data as unknown as Array<{ new_share_count: number; recorded: boolean }> : [];
  const row = rows[0];
  if (!row) throw new Error('Unable to record the post share.');
  return { shareCount: row.new_share_count, recorded: row.recorded };
}

export async function reportRiftboundContent(input: { userId: string; postId?: string; commentId?: string; reason: unknown; details: unknown }) {
  const reasons = ['spam', 'harassment', 'hate', 'misinformation', 'other'] as const;
  if (typeof input.reason !== 'string' || !reasons.includes(input.reason as (typeof reasons)[number])) throw new Error('Choose a valid report reason.');
  const details = typeof input.details === 'string' ? sanitizeChatMessage(input.details.trim().slice(0, 500)) : '';
  if ((!input.postId && !input.commentId) || (input.postId && input.commentId)) throw new Error('Choose one item to report.');
  const { error } = await getSupabaseServiceClient().from('riftbound_post_reports').insert({
    reporter_id: input.userId,
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    reason: input.reason,
    details,
  });
  if (error) {
    if (error.code === '23505') throw new Error('You have already reported this item.');
    throw error;
  }
}

async function resolveProfile(username: string, supabase: RiftboundSupabaseClient) {
  const { data: matchingProfile, error: matchError } = await supabase
    .rpc('find_profile_by_username_ci', { search_username: username })
    .maybeSingle<{ id: string; username: string }>();
  if (matchError) throw matchError;
  if (!matchingProfile) throw new Error('Riftbound profile not found.');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, about_me, avatar_url, chat_color, created_at')
    .eq('id', matchingProfile.id)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound profile not found.');
  return data;
}

export async function getRiftboundProfileUsername(userId: string) {
  const { data, error } = await getSupabaseServiceClient().from('profiles').select('username').eq('id', userId).maybeSingle<{ username: string }>();
  if (error) throw error;
  if (!data?.username) throw new Error('Profile not found.');
  return data.username;
}

export async function loadRiftboundCardPreferences(userId: string): Promise<import('@/lib/riftbound-community-types').RiftboundCardPreferences> {
  const supabase = getSupabaseServiceClient();
  const [favoriteCardsResult, favoriteDecksResult, wishlistResult] = await Promise.all([
    supabase.from('riftbound_profile_favorite_cards').select('card_id, display_order, created_at').eq('user_id', userId).order('display_order', { ascending: true }).order('created_at', { ascending: true }).returns<Array<{ card_id: string; display_order: number; created_at: string }>>(),
    supabase.from('riftbound_profile_favorite_decks').select('deck_id').eq('user_id', userId).order('created_at', { ascending: true }).returns<Array<{ deck_id: string }>>(),
    supabase.from('riftbound_profile_wishlist_cards').select('card_id, desired_quantity, note, display_order, created_at, updated_at').eq('user_id', userId).order('display_order', { ascending: true }).order('created_at', { ascending: true }).returns<Array<{ card_id: string; desired_quantity: number; note: string; display_order: number; created_at: string; updated_at: string }>>(),
  ]);
  if (favoriteCardsResult.error) throw favoriteCardsResult.error;
  if (favoriteDecksResult.error) throw favoriteDecksResult.error;
  if (wishlistResult.error) throw wishlistResult.error;
  return {
    favoriteCardIds: (favoriteCardsResult.data ?? []).map((row) => row.card_id),
    favoriteDeckIds: (favoriteDecksResult.data ?? []).map((row) => row.deck_id),
    wishlist: (wishlistResult.data ?? []).map((row) => ({
      cardId: row.card_id,
      desiredQuantity: 1,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

function buildProfileSourceSummary<T extends { id: string; name: string; created_at: string; updated_at?: string; description?: string; cards: Array<{ card_id: string; quantity: number }> }>(source: T): T & { cardCount: number; copyCount: number; previewCardIds: string[] } {
  return {
    ...source,
    cardCount: new Set(source.cards.map((card) => card.card_id)).size,
    copyCount: source.cards.reduce((total, card) => total + card.quantity, 0),
    previewCardIds: unique(source.cards.map((card) => card.card_id)).slice(0, 4),
  };
}

export async function loadRiftboundProfile(username: string, viewerId: string | null, isStaff = false): Promise<RiftboundProfileData> {
  const supabase = getSupabaseServiceClient();
  const profile = await resolveProfile(decodeURIComponent(username).trim(), supabase);
  const isOwner = profile.id === viewerId;
  const settingsResult = await supabase.from('riftbound_profile_settings').select('visibility, about').eq('user_id', profile.id).maybeSingle<{ visibility: 'public' | 'private'; about: string }>();
  if (settingsResult.error) throw settingsResult.error;
  if (settingsResult.data?.visibility === 'private' && !isOwner) throw new Error('This Riftbound profile is private.');

  const [inventory, decks, favoriteCardsResult, favoriteDecksResult, wishlistResult, posts, postStatsResult, commentStatsResult, prices] = await Promise.all([
    loadRiftboundInventory(profile.id),
    loadRiftboundDecks(profile.id),
    supabase.from('riftbound_profile_favorite_cards').select('card_id, display_order, created_at').eq('user_id', profile.id).order('display_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('riftbound_profile_favorite_decks').select('deck_id').eq('user_id', profile.id).order('created_at', { ascending: true }),
    supabase.from('riftbound_profile_wishlist_cards').select('card_id, desired_quantity, note, display_order, created_at, updated_at').eq('user_id', profile.id).order('display_order', { ascending: true }).order('created_at', { ascending: true }).returns<Array<{ card_id: string; desired_quantity: number; note: string; display_order: number; created_at: string; updated_at: string }>>(),
    loadRecentRiftboundPosts(profile.id, 12, isOwner, viewerId, isStaff || isOwner),
    supabase.from('riftbound_posts').select('id, visibility, like_count, dislike_count').eq('author_id', profile.id).neq('visibility', 'removed').returns<Array<{ id: string; visibility: PostRow['visibility']; like_count: number; dislike_count: number }>>(),
    supabase.from('riftbound_post_comments').select('post_id, like_count, dislike_count').eq('author_id', profile.id).eq('status', 'visible').returns<Array<{ post_id: string; like_count: number; dislike_count: number }>>(),
    loadLatestRiftboundPrices(supabase, viewerId),
  ]);
  if (favoriteCardsResult.error) throw favoriteCardsResult.error;
  if (favoriteDecksResult.error) throw favoriteDecksResult.error;
  if (wishlistResult.error) throw wishlistResult.error;
  if (postStatsResult.error) throw postStatsResult.error;
  if (commentStatsResult.error) throw commentStatsResult.error;
  const profilePostStats = (postStatsResult.data ?? []).filter((row) => row.visibility !== 'archived' || isOwner || isStaff);
  const visibleProfilePostIds = new Set(profilePostStats.map((row) => row.id));
  const profileCommentStats = (commentStatsResult.data ?? []).filter((row) => visibleProfilePostIds.has(row.post_id));

  const totalValueCents = inventory.reduce((total, row) => {
    const card = getRiftboundCardById(row.card_id);
    return total + (card ? Math.round(getCardPrice(card, row.finish, prices.prices) * row.quantity * 100) : 0);
  }, 0);
  const totalCopies = inventory.reduce((total, row) => total + row.quantity, 0);
  const entitlement = isOwner ? await getRiftboundEntitlement(profile.id) : {
    plan: 'free' as const,
    status: 'inactive' as const,
    postLimit: RIFTBOUND_FREE_POST_LIMIT,
  };

  return {
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      aboutMe: profile.about_me,
      avatarUrl: profile.avatar_url,
      chatColor: profile.chat_color,
      createdAt: profile.created_at,
    },
    settings: {
      visibility: settingsResult.data?.visibility ?? 'public',
      about: settingsResult.data?.about ?? '',
    },
    isOwner,
    collection: { items: inventory, totalCopies, totalValueCents },
    decks: decks.map(buildProfileSourceSummary),
    favoriteCardIds: (favoriteCardsResult.data ?? []).map((row) => row.card_id),
    favoriteDeckIds: (favoriteDecksResult.data ?? []).map((row) => row.deck_id),
    wishlist: (wishlistResult.data ?? []).map((row): RiftboundWishlistCard => ({
      cardId: row.card_id,
      desiredQuantity: 1,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    posts,
    postCount: profilePostStats.length,
    postFavor: profilePostStats.reduce((total, row) => total + row.like_count - row.dislike_count, 0)
      + profileCommentStats.reduce((total, row) => total + row.like_count - row.dislike_count, 0),
    cardTiers: prices.cardTiers ?? {},
    prices: prices.prices,
    entitlement: {
      plan: entitlement.plan,
      status: entitlement.status,
      postLimit: entitlement.postLimit,
    },
  };
}

async function assertOwnDeck(userId: string, id: string) {
  const table = 'riftbound_decks';
  const { data, error } = await getSupabaseServiceClient().from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound deck not found.');
}

type RiftboundOrderedCardTable = 'riftbound_profile_favorite_cards' | 'riftbound_profile_wishlist_cards';

async function getNextRiftboundCardOrder(userId: string, table: RiftboundOrderedCardTable) {
  const { data, error } = await getSupabaseServiceClient()
    .from(table)
    .select('display_order')
    .eq('user_id', userId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ display_order: number }>();
  if (error) throw error;
  return (data?.display_order ?? -1) + 1;
}

async function reorderRiftboundCardList(userId: string, table: RiftboundOrderedCardTable, cardIdsInput: unknown) {
  if (!Array.isArray(cardIdsInput) || !cardIdsInput.every((cardId): cardId is string => typeof cardId === 'string' && Boolean(cardId))) {
    throw new Error('A valid Riftbound card order is required.');
  }
  const cardIds = cardIdsInput;
  if (cardIds.length === 0 || cardIds.length > RIFTBOUND_WISHLIST_LIMIT || new Set(cardIds).size !== cardIds.length) {
    throw new Error('A valid Riftbound card order is required.');
  }
  if (cardIds.some((cardId) => !getRiftboundCardById(cardId))) throw new Error('Riftbound card not found.');

  const column = 'card_id';
  const { data, error } = await getSupabaseServiceClient().from(table).select(column).eq('user_id', userId);
  if (error) throw error;
  const existingIds = (data ?? []).map((row) => row.card_id as string);
  const existingIdSet = new Set(existingIds);
  if (existingIds.length !== cardIds.length || cardIds.some((cardId) => !existingIdSet.has(cardId))) {
    throw new Error('The Riftbound card list has changed. Refresh and try again.');
  }

  await Promise.all(cardIds.map(async (cardId, displayOrder) => {
    const { error: updateError } = await getSupabaseServiceClient()
      .from(table)
      .update({ display_order: displayOrder })
      .eq('user_id', userId)
      .eq(column, cardId);
    if (updateError) throw updateError;
  }));
}

export async function updateRiftboundProfilePreference(userId: string, input: {
  action?: unknown;
  cardId?: unknown;
  sourceId?: unknown;
  enabled?: unknown;
  desiredQuantity?: unknown;
  note?: unknown;
  cardIds?: unknown;
  visibility?: unknown;
  about?: unknown;
}) {
  const supabase = getSupabaseServiceClient();
  const action = typeof input.action === 'string' ? input.action : '';

  if (action === 'reorder-favorite-cards' || action === 'reorder-wishlist') {
    await reorderRiftboundCardList(
      userId,
      action === 'reorder-favorite-cards' ? 'riftbound_profile_favorite_cards' : 'riftbound_profile_wishlist_cards',
      input.cardIds,
    );
    return;
  }

  const entitlement = await getRiftboundEntitlement(userId);

  if (action === 'settings') {
    const visibility = input.visibility === 'private' ? 'private' : 'public';
    const about = typeof input.about === 'string' ? sanitizeChatMessage(input.about.trim().slice(0, 500)) : '';
    const { error } = await supabase.from('riftbound_profile_settings').upsert({ user_id: userId, visibility, about, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return;
  }

  if (action === 'favorite-card') {
    const cardId = typeof input.cardId === 'string' ? input.cardId : '';
    if (!getRiftboundCardById(cardId)) throw new Error('Riftbound card not found.');
    const enabled = input.enabled === true;
    if (enabled) {
      const { data: existing, error: existingError } = await supabase.from('riftbound_profile_favorite_cards').select('card_id').eq('user_id', userId).eq('card_id', cardId).maybeSingle<{ card_id: string }>();
      if (existingError) throw existingError;
      if (existing) return;
      const { count, error: countError } = await supabase.from('riftbound_profile_favorite_cards').select('card_id', { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.favoriteCardLimit) throw new Error('You have reached your limit of 4 favorite cards.');
      const displayOrder = await getNextRiftboundCardOrder(userId, 'riftbound_profile_favorite_cards');
      const { error } = await supabase.from('riftbound_profile_favorite_cards').upsert({ user_id: userId, card_id: cardId, display_order: displayOrder }, { onConflict: 'user_id,card_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('riftbound_profile_favorite_cards').delete().eq('user_id', userId).eq('card_id', cardId);
      if (error) throw error;
    }
    return;
  }

  if (action === 'favorite-deck') {
    const sourceId = typeof input.sourceId === 'string' ? input.sourceId : '';
    if (!sourceId) throw new Error('A Riftbound deck is required.');
    await assertOwnDeck(userId, sourceId);
    const table = 'riftbound_profile_favorite_decks';
    const column = 'deck_id';
    if (input.enabled === true) {
      const { count, error: countError } = await supabase.from(table).select(column, { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.favoriteSourceLimit) throw new Error('You have reached your limit of 4 favorite decks.');
      const { error } = await supabase.from(table).upsert({ user_id: userId, [column]: sourceId }, { onConflict: `user_id,${column}` });
      if (error) throw error;
    } else {
      const { error } = await supabase.from(table).delete().eq('user_id', userId).eq(column, sourceId);
      if (error) throw error;
    }
    return;
  }

  if (action === 'wishlist') {
    const cardId = typeof input.cardId === 'string' ? input.cardId : '';
    if (!getRiftboundCardById(cardId)) throw new Error('Riftbound card not found.');
    if (input.enabled === false) {
      const { error } = await supabase.from('riftbound_profile_wishlist_cards').delete().eq('user_id', userId).eq('card_id', cardId);
      if (error) throw error;
      return;
    }
    const { data: existing, error: existingError } = await supabase.from('riftbound_profile_wishlist_cards').select('card_id, display_order').eq('user_id', userId).eq('card_id', cardId).maybeSingle<{ card_id: string; display_order: number }>();
    if (existingError) throw existingError;
    if (!existing) {
      const { count, error: countError } = await supabase.from('riftbound_profile_wishlist_cards').select('card_id', { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.wishlistLimit) throw new Error('You have reached your limit of 8 wishlist cards.');
    }
    const desiredQuantity = 1;
    const note = typeof input.note === 'string' ? sanitizeChatMessage(input.note.trim().slice(0, 200)) : '';
    const displayOrder = existing?.display_order ?? await getNextRiftboundCardOrder(userId, 'riftbound_profile_wishlist_cards');
    const { error } = await supabase.from('riftbound_profile_wishlist_cards').upsert({ user_id: userId, card_id: cardId, desired_quantity: desiredQuantity, note, display_order: displayOrder, updated_at: new Date().toISOString() }, { onConflict: 'user_id,card_id' });
    if (error) throw error;
    return;
  }

  throw new Error('Invalid Riftbound profile preference action.');
}

export function getRiftboundCardOptions() {
  return RIFTBOUND_CARDS.map((card) => ({ id: card.id, name: card.displayName, type: card.cardType, setCode: card.setCode }));
}
