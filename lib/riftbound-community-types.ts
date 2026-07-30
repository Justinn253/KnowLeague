import type { RiftboundDeck, RiftboundInventoryItem, RiftboundSet } from '@/lib/riftbound-client';

export const RIFTBOUND_POST_TYPES = ['general', 'question', 'deck_build', 'collection', 'set', 'deck'] as const;
export type RiftboundCommunityPostType = typeof RIFTBOUND_POST_TYPES[number];

export const RIFTBOUND_NEW_POST_TYPES = ['general', 'question', 'deck_build'] as const;
export type RiftboundNewPostType = typeof RIFTBOUND_NEW_POST_TYPES[number];

export const RIFTBOUND_SOURCE_TYPES = ['collection', 'set', 'deck'] as const;
export type RiftboundPostSourceType = typeof RIFTBOUND_SOURCE_TYPES[number];

export const RIFTBOUND_POST_SORTS = [
  'recent',
  'liked-today',
  'liked-week',
  'liked-month',
  'liked-all',
  'price-asc',
  'price-desc',
] as const;
export type RiftboundCommunityPostSort = typeof RIFTBOUND_POST_SORTS[number];

export type RiftboundPostVisibility = 'public' | 'friends' | 'unlisted';
export type RiftboundPostReaction = 'like' | 'dislike';

export type RiftboundCommunityAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  chatColor: string;
};

export type RiftboundCommunityPostSummary = {
  id: string;
  author: RiftboundCommunityAuthor;
  postType: RiftboundCommunityPostType;
  title: string;
  body: string;
  visibility: RiftboundPostVisibility;
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
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
  viewerReaction: RiftboundPostReaction | null;
};

export type RiftboundPostSnapshotCard = {
  card_id: string;
  finish: 'normal' | 'foil';
  category: 'collection' | 'set' | 'deck' | 'legend' | 'runes' | 'battlefields' | 'main' | 'sideboard';
  quantity: number;
};

export type RiftboundCommunityPostDetail = RiftboundCommunityPostSummary & {
  snapshotId: string;
  sourceId: string | null;
  snapshotTitle: string;
  snapshotDescription: string;
  cards: RiftboundPostSnapshotCard[];
};

export type RiftboundCommunityComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'deleted';
  author: RiftboundCommunityAuthor;
  createdAt: string;
  updatedAt: string;
};

export type RiftboundWishlistCard = {
  cardId: string;
  desiredQuantity: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type RiftboundCardPreferences = {
  favoriteCardIds: string[];
  wishlist: RiftboundWishlistCard[];
  favoriteSetIds?: string[];
  favoriteDeckIds?: string[];
};

export type RiftboundProfileSourceSummary = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  cardCount: number;
  copyCount: number;
  previewCardIds: string[];
};

export type RiftboundProfileData = {
  profile: {
    id: string;
    username: string;
    displayName: string;
    aboutMe: string;
    avatarUrl: string | null;
    chatColor: string;
    createdAt: string;
  };
  settings: {
    visibility: 'public' | 'private';
    about: string;
  };
  isOwner: boolean;
  collection: {
    items: RiftboundInventoryItem[];
    totalCopies: number;
    totalValueCents: number;
  };
  sets: Array<RiftboundSet & RiftboundProfileSourceSummary>;
  decks: Array<RiftboundDeck & RiftboundProfileSourceSummary>;
  favoriteCardIds: string[];
  favoriteSetIds: string[];
  favoriteDeckIds: string[];
  wishlist: RiftboundWishlistCard[];
  posts: RiftboundCommunityPostSummary[];
  entitlement: {
    plan: 'free' | 'premium';
    status: 'active' | 'inactive' | 'past_due' | 'canceled';
    postLimit: number;
  };
};

export type RiftboundCommunityFeedResponse = {
  posts: RiftboundCommunityPostSummary[];
  nextCursor: string | null;
};

export type RiftboundCommunityCommentsResponse = {
  comments: RiftboundCommunityComment[];
  nextCursor: string | null;
};
