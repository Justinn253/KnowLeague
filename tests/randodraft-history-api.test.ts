// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-utils';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn(),
}));
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUserId: mocks.authenticate }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/api-metrics', () => ({ withApiMetrics: (_route: string, handler: unknown) => handler }));
import { GET, POST } from '../app/api/randodraft/history/route';
import { availableDraftValues, createDraftState, DEFAULT_DRAFT_SETTINGS, draftReducer, RANDODRAFT_VERSION } from '@/lib/randodraft';

describe('Randodraft history account boundary', () => {
  beforeEach(() => {
    mocks.authenticate.mockResolvedValue('authenticated-owner');
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { drafts: [] }, error: null });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('requires authentication for reads and writes', async () => {
    mocks.authenticate.mockRejectedValue(new ApiError(401, 'Authentication is required.'));
    expect((await GET(new Request('http://localhost/api/randodraft/history'))).status).toBe(401);
    expect((await POST(new Request('http://localhost/api/randodraft/history', { method: 'POST' }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reads only the authenticated account and disables response caching', async () => {
    const result = await GET(new Request('http://localhost/api/randodraft/history?userId=someone-else'));
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-owner');
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(await result.json()).toEqual({ drafts: [] });
  });

  it('rejects malformed drafts without a database write', async () => {
    const result = await POST(new Request('http://localhost/api/randodraft/history', { method: 'POST', body: JSON.stringify({ picks: [] }) }));
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('saves a validated completed draft for the authenticated account only', async () => {
    let state = draftReducer(createDraftState(), { type: 'start', settings: DEFAULT_DRAFT_SETTINGS });
    for (let index = 0; index < 5; index++) {
      for (const category of ['champion', 'lane', 'type'] as const) {
        state = draftReducer(state, { type: 'select', category, value: availableDraftValues(category, state.picks)[0], manual: false });
      }
      state = draftReducer(state, { type: 'next' });
    }
    const draft = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: RANDODRAFT_VERSION, settings: state.settings, picks: state.picks };
    const result = await POST(new Request('http://localhost/api/randodraft/history', {
      method: 'POST', body: JSON.stringify({ ...draft, userId: 'someone-else', completedAt: 'fake' }),
    }));
    expect(result.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('save_randodraft_history', { p_user_id: 'authenticated-owner', p_draft: draft });
  });
});
