'use client';

import type { Session } from '@supabase/supabase-js';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type {
  RiftboundCommunityCommentsResponse,
  RiftboundCommunityFeedResponse,
  RiftboundCommunityPostDetail,
  RiftboundCardPreferences,
  RiftboundCardTierRating,
  RiftboundProfileData,
  RiftboundSharedDeckDetail,
} from '@/lib/riftbound-community-types';
import type { RiftboundCardTier } from '@/lib/riftbound';
import { invalidateRiftboundBootstrap, invalidateRiftboundLatestPrices } from '@/lib/riftbound-client';

type ErrorPayload = { error?: string };

const inFlightGets = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { value: unknown; expiresAt: number }>();
const preferenceCache = new Map<string, { value: RiftboundCardPreferences; expiresAt: number }>();
const RIFTBOUND_PREFERENCE_CACHE_TTL_MS = 15_000;
const RIFTBOUND_FEED_CACHE_TTL_MS = 45_000;
const RIFTBOUND_POST_CACHE_TTL_MS = 45_000;
const RIFTBOUND_COMMENTS_CACHE_TTL_MS = 20_000;
const RIFTBOUND_SHARED_DECK_CACHE_TTL_MS = 45_000;
const RIFTBOUND_RESPONSE_CACHE_MAX_ENTRIES = 100;
const RIFTBOUND_SHARED_POSTS_STORAGE_KEY = 'knowleague:v1:riftbound:shared-posts';
const RIFTBOUND_SHARED_POSTS_STORAGE_LIMIT = 500;

function getRiftboundSharedPostKeys() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(RIFTBOUND_SHARED_POSTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value as string[] : [];
  } catch {
    return [];
  }
}

function getRiftboundSharedPostKey(postId: string, userId: string) {
  return `${userId}:${postId}`;
}

export function hasRiftboundPostBeenShared(postId: string, userId: string) {
  return getRiftboundSharedPostKeys().includes(getRiftboundSharedPostKey(postId, userId));
}

export function markRiftboundPostShared(postId: string, userId: string) {
  if (typeof window === 'undefined') return;
  const key = getRiftboundSharedPostKey(postId, userId);
  const nextKeys = [...getRiftboundSharedPostKeys().filter((value) => value !== key), key].slice(-RIFTBOUND_SHARED_POSTS_STORAGE_LIMIT);
  try {
    window.localStorage.setItem(RIFTBOUND_SHARED_POSTS_STORAGE_KEY, JSON.stringify(nextKeys));
  } catch {
    // Local persistence is only an optimization; the server remains authoritative.
  }
}

async function getCurrentSession() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session;
}

async function requestJson<T>(url: string, init: RequestInit = {}, session?: Session | null): Promise<T> {
  const resolvedSession = session === undefined ? await getCurrentSession() : session;
  const headers = new Headers(init.headers);
  if (resolvedSession) headers.set('Authorization', `Bearer ${resolvedSession.access_token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: init.cache ?? 'no-store' });
  const data = await response.json() as T & ErrorPayload;
  if (!response.ok) throw new Error(data.error || 'Unable to complete the Riftbound request.');
  return data;
}

function getCommunityCacheTtl(url: string) {
  if (url.includes('/comments')) return RIFTBOUND_COMMENTS_CACHE_TTL_MS;
  if (url.includes('/shared-decks')) return RIFTBOUND_SHARED_DECK_CACHE_TTL_MS;
  if (url.includes('/posts/')) return RIFTBOUND_POST_CACHE_TTL_MS;
  if (url.includes('/feed')) return RIFTBOUND_FEED_CACHE_TTL_MS;
  return 0;
}

function invalidateCommunityCache(postId?: string) {
  const postPath = postId ? `/api/riftbound/community/posts/${encodeURIComponent(postId)}` : null;
  responseCache.forEach((_entry, key) => {
    if (key.includes('/api/riftbound/community/feed') || key.includes('/api/riftbound/shared-decks') || (postPath && key.includes(postPath))) {
      responseCache.delete(key);
    }
  });
}

function invalidateRiftboundCardTierPayloads() {
  responseCache.forEach((_entry, key) => {
    if (
      key.includes('/api/riftbound/profile')
      || key.includes('/api/riftbound/profiles/')
      || key.includes('/api/riftbound/community/posts/')
    ) {
      responseCache.delete(key);
    }
  });
}

function setResponseCache(key: string, value: unknown, ttlMs: number) {
  if (responseCache.size >= RIFTBOUND_RESPONSE_CACHE_MAX_ENTRIES && !responseCache.has(key)) {
    const oldestKey = Array.from(responseCache.entries())
      .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]?.[0];
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getJson<T>(url: string, session?: Session | null) {
  const key = `${url}:${session?.user.id ?? 'guest'}`;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(key);
  const existing = inFlightGets.get(key);
  if (existing) return existing as Promise<T>;
  const cacheTtl = getCommunityCacheTtl(url);
  const request = requestJson<T>(url, {}, session)
    .then((value) => {
      if (cacheTtl > 0) setResponseCache(key, value, cacheTtl);
      return value;
    })
    .finally(() => {
      if (inFlightGets.get(key) === request) inFlightGets.delete(key);
    });
  inFlightGets.set(key, request);
  return request;
}

export function getRiftboundCommunityFeed(url: string, session?: Session | null) {
  return getJson<RiftboundCommunityFeedResponse>(url, session);
}

export function getRiftboundSharedDeck(deckId: string, session?: Session | null) {
  return getJson<{ deck: RiftboundSharedDeckDetail }>(`/api/riftbound/shared-decks/${encodeURIComponent(deckId)}`, session);
}

export function registerRiftboundSharedDeck(body: Record<string, unknown>, session?: Session | null) {
  return requestJson<{ deck: RiftboundSharedDeckDetail }>('/api/riftbound/shared-decks', {
    method: 'POST',
    body: JSON.stringify(body),
  }, session).then((result) => {
    invalidateCommunityCache();
    return result;
  });
}

export function updateRiftboundSharedDeckReaction(deckId: string, reaction: 'like' | 'dislike' | null, session: Session) {
  return requestJson<{ likeCount: number; dislikeCount: number; reaction: 'like' | 'dislike' | null }>(`/api/riftbound/shared-decks/${encodeURIComponent(deckId)}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  }, session).then((result) => {
    invalidateCommunityCache();
    return result;
  });
}

export function getRiftboundCommunityPost(postId: string, session?: Session | null) {
  return getJson<{ post: RiftboundCommunityPostDetail }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}`, session);
}

export function getRiftboundCommunityComments(postId: string, cursor?: string | null, session?: Session | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return getJson<RiftboundCommunityCommentsResponse>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/comments${query}`, session);
}

export function getRiftboundOwnerProfile(session: Session) {
  return getJson<{ profile: RiftboundProfileData }>('/api/riftbound/profile', session);
}

export function getRiftboundCardPreferences(session: Session) {
  const key = `riftbound-card-preferences:${session.user.id}`;
  const cached = preferenceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (cached) preferenceCache.delete(key);
  return getJson<RiftboundCardPreferences>('/api/riftbound/profile/preferences', session).then((value) => {
    preferenceCache.set(key, { value, expiresAt: Date.now() + RIFTBOUND_PREFERENCE_CACHE_TTL_MS });
    return value;
  });
}

export function submitRiftboundCardTierVote(cardId: string, tier: RiftboundCardTier, session: Session) {
  return requestJson<{ rating: RiftboundCardTierRating }>(`/api/riftbound/cards/${encodeURIComponent(cardId)}/tier`, {
    method: 'POST',
    body: JSON.stringify({ cardId, tier }),
  }, session).then((result) => {
    invalidateRiftboundBootstrap(session);
    invalidateRiftboundLatestPrices(session);
    invalidateRiftboundCardTierPayloads();
    return result;
  });
}

export function getRiftboundPublicProfile(username: string, session?: Session | null) {
  return getJson<{ profile: RiftboundProfileData }>(`/api/riftbound/profiles/${encodeURIComponent(username)}`, session);
}

export function updateRiftboundProfilePreference(body: Record<string, unknown>, session: Session) {
  return requestJson<{ saved: boolean }>('/api/riftbound/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, session).then((result) => {
    preferenceCache.delete(`riftbound-card-preferences:${session.user.id}`);
    return result;
  });
}

export function createRiftboundCommunityPost(body: Record<string, unknown>, session: Session) {
  return requestJson<{ post: RiftboundCommunityPostDetail }>('/api/riftbound/community/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  }, session).then((result) => {
    invalidateCommunityCache();
    return result;
  });
}

export function updateRiftboundCommunityPost(postId: string, body: { title: string; body: string }, session: Session) {
  return requestJson<{ post: RiftboundCommunityPostDetail }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, session).then((result) => {
    invalidateCommunityCache(postId);
    return result;
  });
}

export function deleteRiftboundCommunityPost(postId: string, session: Session) {
  return requestJson<{ deleted: true }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  }, session).then((result) => {
    invalidateCommunityCache(postId);
    return result;
  });
}

export function updateRiftboundPostReaction(postId: string, reaction: 'like' | 'dislike' | null, session: Session) {
  return requestJson<{ likeCount: number; dislikeCount: number; reaction: 'like' | 'dislike' | null }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  }, session).then((result) => {
    invalidateCommunityCache(postId);
    return result;
  });
}

export function recordRiftboundPostShare(postId: string, session: Session) {
  return requestJson<{ shareCount: number; recorded: boolean }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/share`, { method: 'POST' }, session).then((result) => {
    invalidateCommunityCache(postId);
    return result;
  });
}

export function createRiftboundComment(postId: string, body: string, session: Session, parentId?: string | null) {
  return requestJson<{ comment: RiftboundCommunityCommentsResponse['comments'][number] }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, parentId: parentId ?? null }),
  }, session).then((result) => {
    invalidateCommunityCache(postId);
    return result;
  });
}

export function submitRiftboundPostReport(input: { message: string; reportedUsername: string; pagePath: string }, session: Session) {
  return requestJson<{ ok: true }>('/api/contact', {
    method: 'POST',
    body: JSON.stringify({
      category: 'player_report',
      message: input.message,
      reportedUsername: input.reportedUsername,
      pagePath: input.pagePath,
    }),
  }, session);
}

export function reportRiftboundContent(body: Record<string, unknown>, session: Session) {
  return requestJson<{ reported: boolean }>('/api/riftbound/community/report', {
    method: 'POST',
    body: JSON.stringify(body),
  }, session);
}
