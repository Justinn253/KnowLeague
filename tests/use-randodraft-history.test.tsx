import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRandodraftHistory } from '@/components/use-randodraft-history';
import { DEFAULT_DRAFT_SETTINGS } from '@/lib/randodraft';
import type { DraftHistoryInput } from '@/lib/randodraft-history';

const auth = vi.hoisted(() => ({ listener: null as ((session: Session | null) => void) | null, session: null as Session | null }));
vi.mock('@/lib/auth-session-client', () => ({
  subscribeToAuthSession: (listener: (session: Session | null) => void) => {
    auth.listener = listener;
    listener(auth.session);
    return () => { auth.listener = null; };
  },
}));
const account = (id: string) => ({ user: { id }, access_token: id + '-token' }) as Session;
const draft: DraftHistoryInput = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', settings: DEFAULT_DRAFT_SETTINGS, picks: [], version: '16.18.1' };
const entry = { ...draft, completedAt: '2026-09-11T18:00:00Z' };
const response = (drafts: unknown[]) => ({ ok: true, json: async () => ({ drafts }) });

describe('Account draft history', () => {
  beforeEach(() => { auth.session = null; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('makes no history requests for guests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRandodraftHistory());
    await act(async () => { await result.current.save(draft, 'first'); });
    expect(result.current.resolved).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads in StrictMode and discards old account responses after logout', async () => {
    auth.session = account('first');
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; })));
    const { result } = renderHook(() => useRandodraftHistory(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    act(() => { auth.listener!(null); });
    await act(async () => { resolve(response([entry])); });
    expect(result.current.userId).toBeNull();
    expect(result.current.drafts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('loads stored drafts after remount and clears them on account changes', async () => {
    auth.session = account('first');
    const fetchMock = vi.fn().mockResolvedValue(response([entry]));
    vi.stubGlobal('fetch', fetchMock);
    const first = renderHook(() => useRandodraftHistory(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await waitFor(() => expect(first.result.current.drafts).toEqual([entry]));
    first.unmount();
    const next = renderHook(() => useRandodraftHistory());
    await waitFor(() => expect(next.result.current.drafts).toEqual([entry]));
    fetchMock.mockResolvedValue(response([]));
    act(() => { auth.listener!(account('second')); });
    expect(next.result.current.drafts).toEqual([]);
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/randodraft/history', expect.objectContaining({ headers: { Authorization: 'Bearer second-token' } }));
  });

  it('does not save a stale completion to a newly active account', async () => {
    auth.session = account('first');
    const fetchMock = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRandodraftHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      auth.listener!(account('second'));
      await result.current.save(draft, 'first');
    });
    expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });

  it('retries a failed save with the same draft ID and uses the stored history response', async () => {
    auth.session = account('first');
    const fetchMock = vi.fn().mockResolvedValueOnce(response([])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([entry]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRandodraftHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.save(draft, 'first'); });
    expect(result.current.error).toBe('Your draft could not be saved.');
    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.drafts).toEqual([entry]));
    expect(result.current.error).toBeNull();
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[2][1].body);
  });
});
