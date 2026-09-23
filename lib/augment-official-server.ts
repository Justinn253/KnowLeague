import officialCatalogue from '@/data/catalogs/official-augments.json';
import { ApiError } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import type { OfficialAugmentRatings } from '@/lib/augment-official';

type RatingRow = {
  id: string;
  upvotes: number;
  downvotes: number;
  average_tier: number | null;
  tier_votes: number;
};

type ReactionRow = { augment_id: string; reaction: number };
type TierRow = { augment_id: string; tier: number };

function requireOfficialAugment(id: string) {
  const record = officialCatalogue.augments.find((item) => item.id === id);
  if (!record) throw new ApiError(404, 'Official augment not found.');
  return record;
}

const emptyRatings = (): OfficialAugmentRatings => ({
  upvotes: 0,
  downvotes: 0,
  averageTier: null,
  tierVotes: 0,
  viewerReaction: null,
  viewerTier: null,
});

export async function loadOfficialAugmentRatingsBatch(
  ids: string[],
  viewer: string | null,
): Promise<Record<string, OfficialAugmentRatings>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length || uniqueIds.length > 24) throw new ApiError(400, 'Choose up to 24 official augments.');
  uniqueIds.forEach(requireOfficialAugment);
  const db = getSupabaseServiceClient();
  const [ratings, reactions, tiers] = await Promise.all([
    db.rpc('official_augment_ratings', { p_ids: uniqueIds }).overrideTypes<RatingRow[], { merge: false }>(),
    viewer
      ? db.from('official_augment_reactions').select('augment_id,reaction').eq('user_id', viewer).in('augment_id', uniqueIds)
      : Promise.resolve({ data: [] as ReactionRow[], error: null }),
    viewer
      ? db.from('official_augment_tiers').select('augment_id,tier').eq('user_id', viewer).in('augment_id', uniqueIds)
      : Promise.resolve({ data: [] as TierRow[], error: null }),
  ]);
  for (const result of [ratings, reactions, tiers]) if (result.error) throw result.error;
  const ratingRows: RatingRow[] = Array.isArray(ratings.data) ? ratings.data : [];
  const reactionRows: ReactionRow[] = Array.isArray(reactions.data) ? reactions.data : [];
  const tierRows: TierRow[] = Array.isArray(tiers.data) ? tiers.data : [];
  const reactionMap = new Map<string, number>(reactionRows.map((row) => [row.augment_id, row.reaction]));
  const tierMap = new Map<string, number>(tierRows.map((row) => [row.augment_id, row.tier]));
  const aggregateMap = new Map<string, RatingRow>(ratingRows.map((row) => [row.id, row]));
  return Object.fromEntries(
    uniqueIds.map((id) => {
      const aggregate = aggregateMap.get(id);
      const reaction = reactionMap.get(id);
      const tier = tierMap.get(id);
      return [id, {
        upvotes: Number(aggregate?.upvotes ?? 0),
        downvotes: Number(aggregate?.downvotes ?? 0),
        averageTier: aggregate?.average_tier == null ? null : Number(aggregate.average_tier),
        tierVotes: Number(aggregate?.tier_votes ?? 0),
        viewerReaction: reaction === 1 || reaction === -1 ? reaction : null,
        viewerTier: typeof tier === 'number' ? tier : null,
      } satisfies OfficialAugmentRatings];
    }),
  );
}

export async function loadOfficialAugmentRatings(id: string, viewer: string | null): Promise<OfficialAugmentRatings> {
  return (await loadOfficialAugmentRatingsBatch([id], viewer))[id] ?? emptyRatings();
}

export async function voteOfficialAugment(id: string, user: string, input: unknown) {
  requireOfficialAugment(id);
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Invalid vote.');
  const { kind, value } = input as Record<string, unknown>;
  const db = getSupabaseServiceClient();
  if (kind === 'reaction' && (value === null || value === -1 || value === 1)) {
    const result =
      value === null
        ? await db.from('official_augment_reactions').delete().eq('augment_id', id).eq('user_id', user)
        : await db.from('official_augment_reactions').upsert({ augment_id: id, user_id: user, reaction: value });
    if (result.error) throw result.error;
  } else if (kind === 'tier' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4) {
    const { error } = await db.from('official_augment_tiers').upsert({ augment_id: id, user_id: user, tier: value });
    if (error) throw error;
  } else {
    throw new ApiError(400, 'Choose a valid vote.');
  }
  return loadOfficialAugmentRatings(id, user);
}

