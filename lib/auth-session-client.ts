'use client';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

export type AuthSessionListener = (session: Session | null, event: AuthChangeEvent) => void;

let initialized = false;
let hasResolvedSession = false;
let currentSession: Session | null = null;
const listeners = new Set<AuthSessionListener>();
const sessionRequests = new Map<string, Promise<unknown>>();

function sessionsMatch(left: Session | null, right: Session | null) {
  if (!left || !right) {
    return left === right;
  }

  return left.user.id === right.user.id && left.access_token === right.access_token;
}

function publishSession(session: Session | null, event: AuthChangeEvent) {
  if (hasResolvedSession && sessionsMatch(currentSession, session)) {
    return;
  }

  if (hasResolvedSession && !sessionsMatch(currentSession, session)) {
    sessionRequests.clear();
  }

  currentSession = session;
  hasResolvedSession = true;
  listeners.forEach((listener) => listener(session, event));
}

function initializeAuthSession() {
  if (initialized) {
    return;
  }

  initialized = true;
  const supabase = getOptionalSupabaseClient();
  if (!supabase) {
    publishSession(null, 'INITIAL_SESSION');
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    publishSession(session, event);
  });
}

export function subscribeToAuthSession(listener: AuthSessionListener) {
  initializeAuthSession();
  listeners.add(listener);

  if (hasResolvedSession) {
    listener(currentSession, 'INITIAL_SESSION');
  }

  return () => {
    listeners.delete(listener);
  };
}

export function getSessionScopedRequest<T>(
  key: string,
  session: Session,
  request: () => Promise<T>,
  options: { force?: boolean } = {},
) {
  const cacheKey = `${key}:${session.user.id}`;
  if (!options.force) {
    const existingRequest = sessionRequests.get(cacheKey);
    if (existingRequest) {
      return existingRequest as Promise<T>;
    }
  }

  const requestPromise = request().catch((error: unknown) => {
    if (sessionRequests.get(cacheKey) === requestPromise) {
      sessionRequests.delete(cacheKey);
    }
    throw error;
  });
  sessionRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
