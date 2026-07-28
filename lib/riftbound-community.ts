import { createHash } from 'node:crypto';
import { getRiftboundCardById, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { sanitizeChatMessage } from '@/lib/chat-filter';
import { loadLatestRiftboundPrices, loadRiftboundDecks, loadRiftboundInventory, loadRiftboundSets } from '@/lib/riftbound-server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import {
  RIFTBOUND_POST_SORTS,
  RIFTBOUND_POST_TYPES,
  type RiftboundCommunityAuthor,
  type RiftboundCommunityComment,
  type RiftboundCommunityPostDetail,
  type RiftboundCommunityPostSort,
  type RiftboundCommunityPostSummary,
  type RiftboundCommunityPostType,
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
  visibility: 'public' | 'unlisted' | 'removed';
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
  sourceType: RiftboundCommunityPostType;
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
const RIFTBOUND_FREE_FAVORITE_CARD_LIMIT = 12;
const RIFTBOUND_FREE_FAVORITE_SOURCE_LIMIT = 6;
const RIFTBOUND_FREE_WISHLIST_LIMIT = 25;

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

export function normalizeRiftboundPostSort(value: string | null): RiftboundCommunityPostSort {
  return RIFTBOUND_POST_SORTS.includes(value as RiftboundCommunityPostSort)
    ? value as RiftboundCommunityPostSort
    : 'recent';
}

function getCardPrice(card: RiftboundCard, finish: 'normal' | 'foil', prices: Record<string, { normal: number | null; foil: number | null }>) {
  const latest = prices[card.id];
  const value = latest ? latest[finish] : card.marketPrices[finish];
  return value ?? 0;
}

function buildSnapshotSummary(rows: BuildRow[], title: string, description: string, prices: Record<string, { normal: number | null; foil: number | null }>) {
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

async function buildPostSnapshot(userId: string, sourceTypeValue: unknown, sourceIdValue: unknown, titleValue: unknown): Promise<BuiltSnapshot> {
  const sourceType = normalizePostType(sourceTypeValue);
  const sourceId = sourceType === 'collection'
    ? null
    : typeof sourceIdValue === 'string' && sourceIdValue.trim() ? sourceIdValue.trim() : null;
  if (sourceType !== 'collection' && !sourceId) throw new Error('Choose a Riftbound set or deck to publish.');

  const pricesPayload = await loadLatestRiftboundPrices();
  const prices = pricesPayload.prices;
  let title = typeof titleValue === 'string' ? titleValue.trim().slice(0, 80) : '';
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
  } else if (sourceType === 'set') {
    const sets = await loadRiftboundSets(userId);
    const source = sets.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error('Riftbound set not found.');
    title = title || source.name;
    rows = source.cards.map((row) => ({
      cardId: row.card_id,
      finish: getRiftboundCardById(row.card_id)?.defaultFinish ?? 'normal',
      category: 'set' as const,
      quantity: row.quantity,
    }));
  } else {
    const decks = await loadRiftboundDecks(userId);
    const source = decks.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error('Riftbound deck not found.');
    title = title || source.name;
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

  const snapshot = buildSnapshotSummary(rows, title, description, prices);
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
    favoriteCardLimit: premium ? 1000 : RIFTBOUND_FREE_FAVORITE_CARD_LIMIT,
    favoriteSourceLimit: premium ? 100 : RIFTBOUND_FREE_FAVORITE_SOURCE_LIMIT,
    wishlistLimit: premium ? 1000 : RIFTBOUND_FREE_WISHLIST_LIMIT,
  };
}

export async function createRiftboundPost(input: {
  userId: string;
  sourceType: unknown;
  sourceId: unknown;
  title: unknown;
  body: unknown;
  visibility: unknown;
}) {
  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public';
  const built = await buildPostSnapshot(input.userId, input.sourceType, input.sourceId, input.title);
  const { data, error } = await getSupabaseServiceClient()
    .rpc('create_riftbound_post', {
      p_author_id: input.userId,
      p_source_type: built.sourceType,
      p_source_id: built.sourceId,
      p_title: built.title,
      p_body: typeof input.body === 'string' ? sanitizeChatMessage(input.body.trim().slice(0, 1000)) : '',
      p_content_hash: built.contentHash,
      p_snapshot: built.snapshot,
      p_cards: built.rows.map((row) => ({ card_id: row.cardId, finish: row.finish, category: row.category, quantity: row.quantity })),
      p_visibility: visibility,
    });
  if (error) throw error;
  const postRows = Array.isArray(data) ? data as unknown as Array<{ post_id: string }> : [];
  const postId = postRows[0]?.post_id;
  if (!postId) throw new Error('Unable to publish the Riftbound post.');
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
    visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
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
  };
}

function mapPostRow(row: PostRow, author: RiftboundCommunityAuthor, viewerReaction: RiftboundPostReaction | null = null): RiftboundCommunityPostSummary {
  return mapSummary({ ...row, username: author.username, display_name: author.displayName, avatar_url: author.avatarUrl, chat_color: author.chatColor, viewer_reaction: viewerReaction, sort_value: 0 }, author);
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
    });
  if (error) throw error;

  const rows = Array.isArray(data) ? data as unknown as FeedRow[] : [];
  return {
    posts: rows.map((row) => mapSummary(row)),
    nextCursor: rows.length >= Math.min(input.limit, 50)
      ? encodeCursor({ value: asNumber(rows[rows.length - 1].sort_value), id: rows[rows.length - 1].id })
      : null,
  };
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

export async function loadRiftboundPost(postId: string, viewerId: string | null = null): Promise<RiftboundCommunityPostDetail> {
  const supabase = getSupabaseServiceClient();
  const { data: post, error: postError } = await supabase
    .from('riftbound_posts')
    .select('id, author_id, snapshot_id, post_type, title, body, visibility, total_card_count, total_copy_count, total_value_cents, set_codes, legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids, has_sideboard, preview_card_ids, like_count, dislike_count, comment_count, share_count, created_at, updated_at')
    .eq('id', postId)
    .neq('visibility', 'removed')
    .maybeSingle<PostRow>();
  if (postError) throw postError;
  if (!post) throw new Error('Riftbound post not found.');

  const [author, snapshotResult, cardsResult, reactionResult] = await Promise.all([
    loadAuthor(post.author_id, supabase),
    supabase.from('riftbound_post_snapshots').select('id, source_id, title, description').eq('id', post.snapshot_id).maybeSingle<SnapshotRow>(),
    supabase.from('riftbound_post_snapshot_cards').select('snapshot_id, card_id, finish, category, quantity').eq('snapshot_id', post.snapshot_id).order('category', { ascending: true }).order('card_id', { ascending: true }).returns<SnapshotCardRow[]>(),
    viewerId
      ? supabase.from('riftbound_post_reactions').select('reaction_type').eq('post_id', post.id).eq('user_id', viewerId).maybeSingle<{ reaction_type: RiftboundPostReaction }>()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (snapshotResult.error) throw snapshotResult.error;
  if (cardsResult.error) throw cardsResult.error;
  if (reactionResult.error) throw reactionResult.error;
  if (!snapshotResult.data) throw new Error('Riftbound post snapshot not found.');

  return {
    ...mapPostRow(post, author, reactionResult.data?.reaction_type ?? null),
    snapshotId: snapshotResult.data.id,
    sourceId: snapshotResult.data.source_id,
    snapshotTitle: snapshotResult.data.title,
    snapshotDescription: snapshotResult.data.description,
    cards: (cardsResult.data ?? []).map(({ snapshot_id: _snapshotId, ...card }) => card),
  };
}

export async function loadRecentRiftboundPosts(authorId: string, limit = 12, includeUnlisted = false) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('riftbound_posts')
    .select('id, author_id, snapshot_id, post_type, title, body, visibility, total_card_count, total_copy_count, total_value_cents, set_codes, legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids, has_sideboard, preview_card_ids, like_count, dislike_count, comment_count, share_count, created_at, updated_at')
    .eq('author_id', authorId)
    .in('visibility', includeUnlisted ? ['public', 'unlisted'] : ['public'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 25)))
    .returns<PostRow[]>();
  if (error) throw error;
  const author = await loadAuthor(authorId, supabase);
  return (data ?? []).map((row) => mapPostRow(row, author));
}

export async function loadRiftboundComments(postId: string, cursor: CommentCursor | null, limit = 20) {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('riftbound_post_comments')
    .select('id, post_id, author_id, parent_id, body, status, created_at, updated_at')
    .eq('post_id', postId)
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }
  const { data, error } = await query.returns<CommentRow[]>();
  if (error) throw error;
  const rows = data ?? [];
  const authorIds = unique(rows.map((row) => row.author_id));
  const { data: profiles, error: profilesError } = authorIds.length > 0
    ? await supabase.from('profiles').select('id, username, display_name, avatar_url, chat_color').in('id', authorIds).returns<Array<{ id: string; username: string; display_name: string; avatar_url: string | null; chat_color: string | null }>>()
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const authors = new Map((profiles ?? []).map((profile) => [profile.id, mapAuthor(profile)]));
  const comments: RiftboundCommunityComment[] = rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    status: row.status,
    author: authors.get(row.author_id) ?? { id: row.author_id, username: 'Unknown', displayName: 'Unknown', avatarUrl: null, chatColor: 'amber' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const { data: post, error: postError } = await supabase.from('riftbound_posts').select('id').eq('id', postId).in('visibility', ['public', 'unlisted']).maybeSingle<{ id: string }>();
  if (postError) throw postError;
  if (!post) throw new Error('Riftbound post not found.');
  if (parentId) {
    const { data: parent, error: parentError } = await supabase.from('riftbound_post_comments').select('id').eq('id', parentId).eq('post_id', postId).eq('status', 'visible').maybeSingle<{ id: string }>();
    if (parentError) throw parentError;
    if (!parent) throw new Error('Comment thread not found.');
  }
  const { data, error } = await supabase
    .from('riftbound_post_comments')
    .insert({ post_id: postId, author_id: userId, parent_id: parentId, body, status: 'visible' })
    .select('id, post_id, author_id, parent_id, body, status, created_at, updated_at')
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
  } satisfies RiftboundCommunityComment;
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

export async function recordRiftboundPostShare(postId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc('record_riftbound_post_share', { p_post_id: postId });
  if (error) throw error;
  if (typeof data === 'number') return data;
  const rows = Array.isArray(data) ? data as unknown as number[] : [];
  return Number(rows[0] ?? 0);
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

function buildProfileSourceSummary<T extends { id: string; name: string; created_at: string; updated_at?: string; description?: string; cards: Array<{ card_id: string; quantity: number }> }>(source: T): T & { cardCount: number; copyCount: number; previewCardIds: string[] } {
  return {
    ...source,
    cardCount: new Set(source.cards.map((card) => card.card_id)).size,
    copyCount: source.cards.reduce((total, card) => total + card.quantity, 0),
    previewCardIds: unique(source.cards.map((card) => card.card_id)).slice(0, 4),
  };
}

export async function loadRiftboundProfile(username: string, viewerId: string | null): Promise<RiftboundProfileData> {
  const supabase = getSupabaseServiceClient();
  const profile = await resolveProfile(decodeURIComponent(username).trim(), supabase);
  const isOwner = profile.id === viewerId;
  const settingsResult = await supabase.from('riftbound_profile_settings').select('visibility, about').eq('user_id', profile.id).maybeSingle<{ visibility: 'public' | 'private'; about: string }>();
  if (settingsResult.error) throw settingsResult.error;
  if (settingsResult.data?.visibility === 'private' && !isOwner) throw new Error('This Riftbound profile is private.');

  const [inventory, sets, decks, favoriteCardsResult, favoriteSetsResult, favoriteDecksResult, wishlistResult, posts, prices] = await Promise.all([
    loadRiftboundInventory(profile.id),
    loadRiftboundSets(profile.id),
    loadRiftboundDecks(profile.id),
    supabase.from('riftbound_profile_favorite_cards').select('card_id').eq('user_id', profile.id).order('created_at', { ascending: true }),
    supabase.from('riftbound_profile_favorite_sets').select('set_id').eq('user_id', profile.id).order('created_at', { ascending: true }),
    supabase.from('riftbound_profile_favorite_decks').select('deck_id').eq('user_id', profile.id).order('created_at', { ascending: true }),
    supabase.from('riftbound_profile_wishlist_cards').select('card_id, desired_quantity, note, created_at, updated_at').eq('user_id', profile.id).order('created_at', { ascending: true }).returns<Array<{ card_id: string; desired_quantity: number; note: string; created_at: string; updated_at: string }>>(),
    loadRecentRiftboundPosts(profile.id, 12, isOwner),
    loadLatestRiftboundPrices(),
  ]);
  if (favoriteCardsResult.error) throw favoriteCardsResult.error;
  if (favoriteSetsResult.error) throw favoriteSetsResult.error;
  if (favoriteDecksResult.error) throw favoriteDecksResult.error;
  if (wishlistResult.error) throw wishlistResult.error;

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
    sets: sets.map(buildProfileSourceSummary),
    decks: decks.map(buildProfileSourceSummary),
    favoriteCardIds: (favoriteCardsResult.data ?? []).map((row) => row.card_id),
    favoriteSetIds: (favoriteSetsResult.data ?? []).map((row) => row.set_id),
    favoriteDeckIds: (favoriteDecksResult.data ?? []).map((row) => row.deck_id),
    wishlist: (wishlistResult.data ?? []).map((row): RiftboundWishlistCard => ({
      cardId: row.card_id,
      desiredQuantity: row.desired_quantity,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    posts,
    entitlement: {
      plan: entitlement.plan,
      status: entitlement.status,
      postLimit: entitlement.postLimit,
    },
  };
}

async function assertOwnSetOrDeck(userId: string, kind: 'set' | 'deck', id: string) {
  const table = kind === 'set' ? 'riftbound_sets' : 'riftbound_decks';
  const { data, error } = await getSupabaseServiceClient().from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new Error(`Riftbound ${kind} not found.`);
}

export async function updateRiftboundProfilePreference(userId: string, input: {
  action?: unknown;
  cardId?: unknown;
  sourceId?: unknown;
  enabled?: unknown;
  desiredQuantity?: unknown;
  note?: unknown;
  visibility?: unknown;
  about?: unknown;
}) {
  const supabase = getSupabaseServiceClient();
  const action = typeof input.action === 'string' ? input.action : '';
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
      const { count, error: countError } = await supabase.from('riftbound_profile_favorite_cards').select('card_id', { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.favoriteCardLimit) throw new Error('You have reached your favorite card limit. Premium accounts can save more favorites.');
      const { error } = await supabase.from('riftbound_profile_favorite_cards').upsert({ user_id: userId, card_id: cardId }, { onConflict: 'user_id,card_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('riftbound_profile_favorite_cards').delete().eq('user_id', userId).eq('card_id', cardId);
      if (error) throw error;
    }
    return;
  }

  if (action === 'favorite-set' || action === 'favorite-deck') {
    const sourceId = typeof input.sourceId === 'string' ? input.sourceId : '';
    const kind = action === 'favorite-set' ? 'set' : 'deck';
    if (!sourceId) throw new Error(`A Riftbound ${kind} is required.`);
    await assertOwnSetOrDeck(userId, kind, sourceId);
    const table = kind === 'set' ? 'riftbound_profile_favorite_sets' : 'riftbound_profile_favorite_decks';
    const column = kind === 'set' ? 'set_id' : 'deck_id';
    if (input.enabled === true) {
      const { count, error: countError } = await supabase.from(table).select(column, { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.favoriteSourceLimit) throw new Error('You have reached your favorite source limit. Premium accounts can save more.');
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
    const { data: existing, error: existingError } = await supabase.from('riftbound_profile_wishlist_cards').select('card_id').eq('user_id', userId).eq('card_id', cardId).maybeSingle<{ card_id: string }>();
    if (existingError) throw existingError;
    if (!existing) {
      const { count, error: countError } = await supabase.from('riftbound_profile_wishlist_cards').select('card_id', { count: 'exact', head: true }).eq('user_id', userId);
      if (countError) throw countError;
      if ((count ?? 0) >= entitlement.wishlistLimit) throw new Error('You have reached your wishlist limit. Premium accounts can save more wishlist cards.');
    }
    const desiredQuantity = typeof input.desiredQuantity === 'number' && Number.isInteger(input.desiredQuantity) ? Math.max(1, Math.min(1000, input.desiredQuantity)) : 1;
    const note = typeof input.note === 'string' ? sanitizeChatMessage(input.note.trim().slice(0, 200)) : '';
    const { error } = await supabase.from('riftbound_profile_wishlist_cards').upsert({ user_id: userId, card_id: cardId, desired_quantity: desiredQuantity, note, updated_at: new Date().toISOString() }, { onConflict: 'user_id,card_id' });
    if (error) throw error;
    return;
  }

  throw new Error('Invalid Riftbound profile preference action.');
}

export function getRiftboundCardOptions() {
  return RIFTBOUND_CARDS.map((card) => ({ id: card.id, name: card.displayName, type: card.cardType, setCode: card.setCode }));
}
