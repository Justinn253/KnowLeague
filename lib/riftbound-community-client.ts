'use client';

import type { Session } from '@supabase/supabase-js';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type {
  RiftboundCommunityCommentsResponse,
  RiftboundCommunityFeedResponse,
  RiftboundCommunityPostDetail,
  RiftboundProfileData,
} from '@/lib/riftbound-community-types';

type ErrorPayload = { error?: string };

const inFlightGets = new Map<string, Promise<unknown>>();

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

async function getJson<T>(url: string, session?: Session | null) {
  const key = `${url}:${session?.user.id ?? 'guest'}`;
  const existing = inFlightGets.get(key);
  if (existing) return existing as Promise<T>;
  const request = requestJson<T>(url, {}, session).finally(() => {
    if (inFlightGets.get(key) === request) inFlightGets.delete(key);
  });
  inFlightGets.set(key, request);
  return request;
}

export function getRiftboundCommunityFeed(url: string, session?: Session | null) {
  return getJson<RiftboundCommunityFeedResponse>(url, session);
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

export function getRiftboundPublicProfile(username: string, session?: Session | null) {
  return getJson<{ profile: RiftboundProfileData }>(`/api/riftbound/profiles/${encodeURIComponent(username)}`, session);
}

export function updateRiftboundProfilePreference(body: Record<string, unknown>, session: Session) {
  return requestJson<{ saved: boolean }>('/api/riftbound/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, session);
}

export function createRiftboundCommunityPost(body: Record<string, unknown>, session: Session) {
  return requestJson<{ post: RiftboundCommunityPostDetail }>('/api/riftbound/community/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  }, session);
}

export function updateRiftboundPostReaction(postId: string, reaction: 'like' | 'dislike' | null, session: Session) {
  return requestJson<{ likeCount: number; dislikeCount: number; reaction: 'like' | 'dislike' | null }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  }, session);
}

export function recordRiftboundPostShare(postId: string) {
  return requestJson<{ shareCount: number }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/share`, { method: 'POST' }, null);
}

export function createRiftboundComment(postId: string, body: string, session: Session, parentId?: string | null) {
  return requestJson<{ comment: RiftboundCommunityCommentsResponse['comments'][number] }>(`/api/riftbound/community/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, parentId: parentId ?? null }),
  }, session);
}

export function reportRiftboundContent(body: Record<string, unknown>, session: Session) {
  return requestJson<{ reported: boolean }>('/api/riftbound/community/report', {
    method: 'POST',
    body: JSON.stringify(body),
  }, session);
}
