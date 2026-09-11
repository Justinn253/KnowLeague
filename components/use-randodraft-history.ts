'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import type { DraftHistoryEntry, DraftHistoryInput } from '@/lib/randodraft-history';

export function useRandodraftHistory() {
  const [session, setSession] = useState<Session | null>(null);
  const [resolved, setResolved] = useState(false);
  const [drafts, setDrafts] = useState<DraftHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<{ userId: string; draft: DraftHistoryInput } | null>(null);

  const request = useCallback(async (draft?: DraftHistoryInput) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    setLoading(!draft);
    setSaving(Boolean(draft));
    try {
      const response = await fetch('/api/randodraft/history', {
        method: draft ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${activeSession.access_token}`, ...(draft ? { 'Content-Type': 'application/json' } : {}) },
        ...(draft ? { body: JSON.stringify(draft) } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('History request failed.');
      const body = await response.json() as { drafts: DraftHistoryEntry[] };
      if (controller.signal.aborted || sessionRef.current?.user.id !== activeSession.user.id) return;
      setDrafts(body.drafts);
      if (draft && pendingRef.current?.draft.id === draft.id) pendingRef.current = null;
    } catch {
      if (!controller.signal.aborted) setError(draft ? 'Your draft could not be saved.' : 'Your recent drafts could not be loaded.');
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setSaving(false); }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthSession((nextSession) => {
      const changed = nextSession?.user.id !== sessionRef.current?.user.id;
      sessionRef.current = nextSession;
      setSession(nextSession);
      setResolved(true);
      if (changed) {
        requestRef.current?.abort();
        pendingRef.current = null;
        setDrafts([]);
        setError(null);
        setLoading(false);
        setSaving(false);
        if (nextSession) void request();
      }
    });
    return () => { unsubscribe(); requestRef.current?.abort(); sessionRef.current = null; };
  }, [request]);

  const save = useCallback(async (draft: DraftHistoryInput, ownerId: string | null) => {
    const userId = sessionRef.current?.user.id;
    if (!userId || userId !== ownerId) return;
    pendingRef.current = { userId, draft };
    await request(draft);
  }, [request]);

  const retry = useCallback(() => {
    const pending = pendingRef.current;
    void request(pending?.userId === sessionRef.current?.user.id ? pending?.draft : undefined);
  }, [request]);

  return { userId: session?.user.id ?? null, resolved, drafts, loading, saving, error, save, retry };
}
