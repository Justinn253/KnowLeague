import { getRiftboundCardById, getRiftboundCardTierFromValue, getRiftboundCardTierGroupId, RIFTBOUND_CARD_TIERS, RIFTBOUND_CARDS, type RiftboundCard, type RiftboundCardTier, type RiftboundCardTierRating } from '@/lib/riftbound';
import { deleteServerCache, getServerCache, setServerCache } from '@/lib/server-memory-cache';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

type RiftboundCardTierSummaryRow = {
  tier_group_id: string;
  tier: number;
  average_value: number | string;
  vote_count: number;
};

type RiftboundCardTierVoteRow = {
  tier_group_id: string;
  tier: number;
};

const RIFTBOUND_CARD_TIER_CACHE_TTL_MS = 30_000;
const RIFTBOUND_CARD_TIER_CACHE_PREFIX = 'riftbound:card-tier-map:';
const tierRatingMapInFlight = new Map<string, Promise<Record<string, RiftboundCardTierRating>>>();
let tierRatingCacheGeneration = 0;

export function invalidateRiftboundCardTierRatingCache() {
  tierRatingCacheGeneration += 1;
  tierRatingMapInFlight.clear();
  deleteServerCache(`${RIFTBOUND_CARD_TIER_CACHE_PREFIX}guest`);
}

function createEmptyRiftboundCardTierRating(groupId: string, viewerTier: RiftboundCardTier | null = null): RiftboundCardTierRating {
  return { groupId, tier: null, averageValue: null, voteCount: 0, viewerTier };
}

export async function loadRiftboundCardTierRatings(cardIds: string[], viewerId: string | null): Promise<Record<string, RiftboundCardTierRating>> {
  const isFullCatalogueRequest = cardIds.length === 0;
  const cards = isFullCatalogueRequest
    ? RIFTBOUND_CARDS
    : Array.from(new Map(cardIds.map((cardId) => [cardId, getRiftboundCardById(cardId)])).values()).filter((card): card is RiftboundCard => Boolean(card));
  const groupIds = Array.from(new Set(cards.map(getRiftboundCardTierGroupId)));
  if (groupIds.length === 0) return {};

  const supabase = getSupabaseServiceClient();
  const summaryQuery = isFullCatalogueRequest
    ? supabase.from('riftbound_card_tier_ratings').select('tier_group_id, tier, average_value, vote_count').returns<RiftboundCardTierSummaryRow[]>()
    : supabase.from('riftbound_card_tier_ratings').select('tier_group_id, tier, average_value, vote_count').in('tier_group_id', groupIds).returns<RiftboundCardTierSummaryRow[]>();
  const viewerQuery = viewerId
    ? isFullCatalogueRequest
      ? supabase.from('riftbound_card_tier_votes').select('tier_group_id, tier').eq('user_id', viewerId).returns<RiftboundCardTierVoteRow[]>()
      : supabase.from('riftbound_card_tier_votes').select('tier_group_id, tier').eq('user_id', viewerId).in('tier_group_id', groupIds).returns<RiftboundCardTierVoteRow[]>()
    : Promise.resolve({ data: [] as RiftboundCardTierVoteRow[], error: null });
  const [summaryResult, viewerResult] = await Promise.all([summaryQuery, viewerQuery]);
  if (summaryResult.error) throw summaryResult.error;
  if (viewerResult.error) throw viewerResult.error;

  const summaries = new Map<string, RiftboundCardTierRating>();
  (summaryResult.data ?? []).forEach((row) => {
    const tier = getRiftboundCardTierFromValue(row.tier);
    if (!tier) return;
    summaries.set(row.tier_group_id, {
      groupId: row.tier_group_id,
      tier,
      averageValue: Number(row.average_value),
      voteCount: Number(row.vote_count),
      viewerTier: null,
    });
  });
  const viewerTiers = new Map<string, RiftboundCardTier>();
  (viewerResult.data ?? []).forEach((row) => {
    const tier = getRiftboundCardTierFromValue(row.tier);
    if (tier) viewerTiers.set(row.tier_group_id, tier);
  });

  const ratings: Record<string, RiftboundCardTierRating> = {};
  cards.forEach((card) => {
    const groupId = getRiftboundCardTierGroupId(card);
    const rating = summaries.get(groupId);
    if (!rating && isFullCatalogueRequest) return;
    const baseRating = rating ?? createEmptyRiftboundCardTierRating(groupId);
    ratings[card.id] = { ...baseRating, viewerTier: viewerTiers.get(groupId) ?? null };
  });
  return ratings;
}

export async function loadRiftboundCardTierRatingMap(viewerId: string | null): Promise<Record<string, RiftboundCardTierRating>> {
  const cacheKey = `${RIFTBOUND_CARD_TIER_CACHE_PREFIX}${viewerId ?? 'guest'}:${tierRatingCacheGeneration}`;
  const cached = getServerCache<Record<string, RiftboundCardTierRating>>(cacheKey);
  if (cached) return cached;

  const existingRequest = tierRatingMapInFlight.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = loadRiftboundCardTierRatings([], viewerId).then((ratings) => {
    const byGroup: Record<string, RiftboundCardTierRating> = {};
    Object.values(ratings).forEach((rating) => {
      byGroup[rating.groupId] = rating;
    });
    setServerCache(cacheKey, byGroup, RIFTBOUND_CARD_TIER_CACHE_TTL_MS);
    return byGroup;
  }).finally(() => {
    if (tierRatingMapInFlight.get(cacheKey) === request) {
      tierRatingMapInFlight.delete(cacheKey);
    }
  });
  tierRatingMapInFlight.set(cacheKey, request);
  return request;
}

export async function castRiftboundCardTierVote(userId: string, cardIdInput: unknown, tierInput: unknown): Promise<RiftboundCardTierRating> {
  const cardId = typeof cardIdInput === 'string' ? cardIdInput : '';
  const card = getRiftboundCardById(cardId);
  if (!card) throw new Error('Riftbound card not found.');
  const tier = typeof tierInput === 'string' && RIFTBOUND_CARD_TIERS.includes(tierInput as RiftboundCardTier)
    ? tierInput as RiftboundCardTier
    : null;
  if (!tier) throw new Error('Choose a valid card tier.');

  const { data, error } = await getSupabaseServiceClient().rpc('set_riftbound_card_tier_vote', {
    p_user_id: userId,
    p_tier_group_id: getRiftboundCardTierGroupId(card),
    p_tier: RIFTBOUND_CARD_TIERS.indexOf(tier),
  }).maybeSingle<{ tier_group_id: string; tier: number; average_value: number | string; vote_count: number; viewer_tier: number }>();
  if (error) throw error;
  if (!data) throw new Error('Unable to save the card tier vote.');
  const globalTier = getRiftboundCardTierFromValue(data.tier);
  const viewerTier = getRiftboundCardTierFromValue(data.viewer_tier);
  if (!globalTier || !viewerTier) throw new Error('The saved card tier vote was invalid.');
  invalidateRiftboundCardTierRatingCache();
  return {
    groupId: data.tier_group_id,
    tier: globalTier,
    averageValue: Number(data.average_value),
    voteCount: Number(data.vote_count),
    viewerTier,
  };
}
