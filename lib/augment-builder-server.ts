import { ApiError } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import {
  AUGMENT_COMMUNITY_SORTS,
  isAugmentId,
  parseAugmentDraft,
  type AugmentAuthor,
  type AugmentCommunitySort,
  type AugmentDraft,
  type PublishedAugment,
} from '@/lib/augment-builder';
import { sanitizeChatMessage } from '@/lib/chat-filter';

type Row = Pick<AugmentDraft, 'id' | 'rarity' | 'icon' | 'name' | 'description' | 'restrictions' | 'notes'> & {
  details: string;
  quest_requirements: string;
  creator_id: string | null;
  created_at: string;
  long_description: string;
};
const fields =
  'id,creator_id,created_at,rarity,icon,name,description,details,long_description,quest_requirements,restrictions,notes';
function requireId(id: string) {
  if (!isAugmentId(id)) throw new ApiError(400, 'Invalid augment ID.');
}
function parseCommunitySort(value: string): AugmentCommunitySort {
  if (!AUGMENT_COMMUNITY_SORTS.includes(value as AugmentCommunitySort)) throw new ApiError(400, 'Invalid augment sort.');
  return value as AugmentCommunitySort;
}
function persistedRow(draft: AugmentDraft) {
  return {
    id: draft.id,
    rarity: draft.rarity,
    icon: draft.icon,
    name: sanitizeChatMessage(draft.name.trim()),
    description: sanitizeChatMessage(draft.description.trim()),
    quest_requirements: draft.questEnabled ? sanitizeChatMessage(draft.questRequirements.trim()) : '',
    restrictions: draft.restrictionsEnabled ? sanitizeChatMessage(draft.restrictions.trim()) : '',
    notes: sanitizeChatMessage(draft.notes.trim()),
    long_description: sanitizeChatMessage(draft.longDescription.trim()),
  };
}
async function decorate(rows: Row[], viewer: string | null): Promise<PublishedAugment[]> {
  if (!rows.length) return [];
  const db = getSupabaseServiceClient();
  const ids = rows.map((row) => row.id);
  const authors = [...new Set(rows.flatMap((row) => (row.creator_id ? [row.creator_id] : [])))];
  const [profiles, ratings, reactions, tiers] = await Promise.all([
    authors.length
      ? db.from('profiles').select('id,username,display_name,chat_color').in('id', authors).returns<AugmentAuthor[]>()
      : Promise.resolve({ data: [], error: null }),
    db
      .rpc('custom_augment_ratings', { p_ids: ids })
      .overrideTypes<
        Array<{ id: string; upvotes: number; downvotes: number; average_tier: number | null; tier_votes: number }>,
        { merge: false }
      >(),
    viewer
      ? db.from('custom_augment_reactions').select('augment_id,reaction').eq('user_id', viewer).in('augment_id', ids)
      : Promise.resolve({ data: [], error: null }),
    viewer
      ? db.from('custom_augment_tiers').select('augment_id,tier').eq('user_id', viewer).in('augment_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [profiles, ratings, reactions, tiers]) if (result.error) throw result.error;
  return rows.map((row) => {
    const rating = (Array.isArray(ratings.data) ? ratings.data : []).find((item) => item.id === row.id);
    return {
      id: row.id,
      rarity: row.rarity,
      icon: row.icon,
      name: row.name,
      description: row.description,
      questRequirements: row.quest_requirements,
      questEnabled: Boolean(row.quest_requirements),
      restrictions: row.restrictions,
      restrictionsEnabled: Boolean(row.restrictions),
      notes: row.notes || row.details,
      longDescription: row.long_description,
      createdAt: row.created_at,
      author: profiles.data?.find((profile) => profile.id === row.creator_id) ?? null,
      upvotes: Number(rating?.upvotes ?? 0),
      downvotes: Number(rating?.downvotes ?? 0),
      averageTier: rating?.average_tier == null ? null : Number(rating.average_tier),
      tierVotes: Number(rating?.tier_votes ?? 0),
      viewerReaction: reactions.data?.find((item) => item.augment_id === row.id)?.reaction ?? null,
      viewerTier: tiers.data?.find((item) => item.augment_id === row.id)?.tier ?? null,
    };
  });
}
export async function loadAugment(id: string, viewer: string | null) {
  requireId(id);
  const { data, error } = await getSupabaseServiceClient()
    .from('custom_augments')
    .select(fields)
    .eq('id', id)
    .maybeSingle<Row>();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Augment not found.');
  return (await decorate([data], viewer))[0];
}
export async function publishAugment(input: unknown, creator: string | null) {
  const draft = parseAugmentDraft(input, true);
  if (!draft) throw new ApiError(400, 'Enter a valid augment name, icon, rarity, and description.');
  if (!creator) throw new ApiError(401, 'Sign in to publish an augment.');
  const db = getSupabaseServiceClient();
  const row = { ...persistedRow(draft), creator_id: creator };
  // A retry may retrieve the same payload but never overwrite another creator.
  const { error } = await db.from('custom_augments').insert(row);
  if (error?.code === '23505') {
    const existing = await loadAugment(draft.id, creator);
    if (
      (existing.author?.id ?? null) !== creator ||
      existing.name !== row.name ||
      existing.description !== row.description ||
      existing.icon !== row.icon ||
      existing.rarity !== row.rarity ||
      existing.questRequirements !== row.quest_requirements ||
      existing.restrictions !== row.restrictions ||
      existing.notes !== row.notes ||
      existing.longDescription !== row.long_description
    ) {
      throw new ApiError(409, 'This augment ID is already published. Start a new version to publish changes.');
    }
    return existing;
  }
  if (error) throw error;
  return loadAugment(draft.id, creator);
}
export async function updateAugment(input: unknown, user: string, expectedId?: string) {
  const draft = parseAugmentDraft(input, true);
  if (!draft) throw new ApiError(400, 'Enter a valid augment name, icon, rarity, and description.');
  if (expectedId && draft.id !== expectedId) throw new ApiError(400, 'Augment ID does not match the requested resource.');
  const { data, error } = await getSupabaseServiceClient()
    .from('custom_augments')
    .update(persistedRow(draft))
    .eq('id', draft.id)
    .eq('creator_id', user)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Owned augment not found.');
  return loadAugment(draft.id, user);
}
export async function loadAugmentBinder(owner: string, page: number, viewer: string | null) {
  requireId(owner);
  const db = getSupabaseServiceClient();
  const { data: author, error: authorError } = await db
    .from('profiles')
    .select('id,username,display_name,chat_color')
    .eq('id', owner)
    .maybeSingle<AugmentAuthor>();
  if (authorError) throw authorError;
  if (!author) throw new ApiError(404, 'Binder owner not found.');
  const { data, error } = await db
    .from('custom_augments')
    .select(fields)
    .eq('creator_id', owner)
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 24, page * 24 + 24)
    .returns<Row[]>();
  if (error) throw error;
  return { author, augments: await decorate((data ?? []).slice(0, 24), viewer), hasMore: (data?.length ?? 0) > 24 };
}
export async function loadAugmentCommunity(
  sort: string,
  query: string,
  page: number,
  viewer: string | null,
) {
  const communitySort = parseCommunitySort(sort);
  const normalizedQuery = query.trim().slice(0, 80);
  const { data, error } = await getSupabaseServiceClient()
    .rpc('custom_augment_community_feed', {
      p_sort: communitySort,
      p_query: normalizedQuery,
      p_offset: page * 24,
      p_limit: 25,
    })
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  return { augments: await decorate(rows.slice(0, 24), viewer), hasMore: rows.length > 24 };
}
export async function voteAugment(id: string, user: string, input: unknown) {
  requireId(id);
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Invalid vote.');
  const { kind, value } = input as Record<string, unknown>;
  const db = getSupabaseServiceClient();
  if (kind === 'reaction' && (value === null || value === -1 || value === 1)) {
    const result =
      value === null
        ? await db.from('custom_augment_reactions').delete().eq('augment_id', id).eq('user_id', user)
        : await db.from('custom_augment_reactions').upsert({ augment_id: id, user_id: user, reaction: value });
    if (result.error) throw result.error;
  } else if (kind === 'tier' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4) {
    const { error } = await db.from('custom_augment_tiers').upsert({ augment_id: id, user_id: user, tier: value });
    if (error) throw error;
  } else throw new ApiError(400, 'Choose a valid vote.');
  return loadAugment(id, user);
}
export async function deleteAugment(id: string, user: string) {
  requireId(id);
  const { data, error } = await getSupabaseServiceClient()
    .from('custom_augments')
    .delete()
    .eq('id', id)
    .eq('creator_id', user)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ApiError(404, 'Owned augment not found.');
}

