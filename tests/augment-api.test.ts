// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  optional: vi.fn(),
  limit: vi.fn(),
  publish: vi.fn(),
  load: vi.fn(),
  vote: vi.fn(),
  remove: vi.fn(),
  binder: vi.fn(),
  community: vi.fn(),
  edit: vi.fn(),
}));
vi.mock('@/lib/api-metrics', () => ({ withApiMetrics: (_route: string, handler: unknown) => handler }));
vi.mock('@/lib/auth-server', () => ({
  getAuthenticatedUserId: mocks.authenticated,
  getOptionalAuthenticatedUserId: mocks.optional,
}));
vi.mock('@/lib/rate-limit', () => ({ enforceApiRateLimit: mocks.limit }));
vi.mock('@/lib/augment-builder-server', () => ({
  publishAugment: mocks.publish,
  loadAugment: mocks.load,
  voteAugment: mocks.vote,
  deleteAugment: mocks.remove,
  loadAugmentBinder: mocks.binder,
  loadAugmentCommunity: mocks.community,
  updateAugment: mocks.edit,
}));
vi.mock('@/lib/server-log', () => ({ logServerEvent: vi.fn() }));

import { GET as community, POST as publish } from '../app/api/augments/route';
import { PATCH as edit, POST as vote, DELETE as remove, GET as load } from '../app/api/augments/[id]/route';
import { GET as binder } from '../app/api/augment-binders/[owner]/route';
import { ApiError } from '../lib/api-utils';

const context = { params: { id: '8d73d0ad-3880-4e58-9d5a-20c9674b5bbc' } };
function request(body: unknown, method = 'POST', url = 'http://localhost/api/augments') {
  return new Request(url, { method, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticated.mockResolvedValue('verified-user');
  mocks.optional.mockResolvedValue(null);
  mocks.limit.mockResolvedValue(null);
});
describe('augment API boundaries', () => {
  it('permits guests but never takes creator attribution from their payload', async () => {
    mocks.publish.mockResolvedValue({ id: context.params.id, author: null });
    const response = await publish(request({ creator_id: 'spoofed', name: 'Example' }));
    expect(response.status).toBe(201);
    expect(mocks.publish).toHaveBeenCalledWith({ creator_id: 'spoofed', name: 'Example' }, null);
  });
  it('loads the account community feed with bounded sort, search, and pagination inputs', async () => {
    mocks.community.mockResolvedValue({ augments: [], hasMore: false });
    const response = await community(new Request('http://localhost/api/augments?sort=week&q=Snow&page=2'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.community).toHaveBeenCalledWith('week', 'Snow', 2, null);
  });
  it('passes the route ID and verified identity to owner edits', async () => {
    mocks.edit.mockResolvedValue({ id: context.params.id });
    const response = await edit(request({ id: context.params.id }, 'PATCH', 'http://localhost/api/augments/' + context.params.id), context);
    expect(response.status).toBe(200);
    expect(mocks.edit).toHaveBeenCalledWith({ id: context.params.id }, 'verified-user', context.params.id);
  });
  it('uses verified account identity when publishing', async () => {
    mocks.optional.mockResolvedValue('verified-user');
    await publish(request({ creator_id: 'spoofed' }));
    expect(mocks.publish).toHaveBeenCalledWith({ creator_id: 'spoofed' }, 'verified-user');
  });
  it('does not mutate when rate-limited or request body is oversized', async () => {
    mocks.limit.mockResolvedValue(new Response('{}', { status: 429 }));
    expect((await publish(request({}))).status).toBe(429);
    expect(mocks.publish).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue(null);
    expect((await publish(request({ description: 'x'.repeat(41000) }))).status).toBe(413);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('rejects guest votes and deletion', async () => {
    mocks.authenticated.mockRejectedValue(new ApiError(401, 'Authentication is required.'));
    expect((await vote(request({ kind: 'tier', value: 4 }), context)).status).toBe(401);
    expect((await remove(request({}), context)).status).toBe(401);
    expect(mocks.vote).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('passes the verified identity to both vote and ownership checks', async () => {
    await vote(request({ kind: 'reaction', value: 1, user_id: 'spoofed' }), context);
    expect(mocks.vote).toHaveBeenCalledWith(context.params.id, 'verified-user', {
      kind: 'reaction',
      value: 1,
      user_id: 'spoofed',
    });
    await remove(request({ user_id: 'spoofed' }), context);
    expect(mocks.remove).toHaveBeenCalledWith(context.params.id, 'verified-user');
  });
  it('disables caching of personalized ratings and validates binder pagination', async () => {
    const response = await load(new Request('http://localhost/api/augments/test'), context);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(
      (
        await binder(new Request('http://localhost/api/augment-binders/test?page=-1'), {
          params: { owner: context.params.id },
        })
      ).status,
    ).toBe(400);
    expect(mocks.binder).not.toHaveBeenCalled();
  });
});
