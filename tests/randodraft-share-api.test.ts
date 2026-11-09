// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shareId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const parsedDraft = { id: shareId, version: '1.0.0', settings: {}, picks: [] };
const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  parse: vi.fn(),
  configured: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
}));

vi.mock('@/lib/api-metrics', () => ({
  withApiMetrics: (
    _route: string,
    handler: (request: Request, context?: { params: { id: string } }) => Response | Promise<Response>,
  ) => async (request: Request, context?: { params?: Promise<{ id: string }> }) => (
    handler(request, context?.params ? { params: await context.params } : undefined)
  ),
}));
vi.mock('@/lib/rate-limit', () => ({ enforceApiRateLimit: mocks.limit }));
vi.mock('@/lib/randodraft-history', () => ({ parseDraftHistoryInput: mocks.parse }));
vi.mock('@/lib/randodraft-share-store', () => ({
  randodraftShareStoreConfigured: mocks.configured,
  saveRandodraftShare: mocks.save,
  readRandodraftShare: mocks.read,
}));

import { POST } from '../app/api/randodraft/share/route';
import { GET } from '../app/api/randodraft/share/[id]/route';

describe('Randodraft share API boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.limit.mockResolvedValue(null);
    mocks.parse.mockReturnValue(parsedDraft);
    mocks.configured.mockReturnValue(true);
    mocks.save.mockResolvedValue(true);
  });

  it('protects anonymous share writes before parsing or storing a draft', async () => {
    mocks.limit.mockResolvedValue(new Response('{}', { status: 429 }));
    const response = await POST(new Request('http://localhost/api/randodraft/share', {
      method: 'POST', body: JSON.stringify({ id: shareId, draft: {} }),
    }));
    expect(response.status).toBe(429);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('persists only a validated completed draft under its established opaque reference', async () => {
    const completedAt = '2026-11-07T20:00:00.000Z';
    const response = await POST(new Request('http://localhost/api/randodraft/share', {
      method: 'POST',
      body: JSON.stringify({ id: shareId, draft: { unexpected: 'payload' }, completedAt }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(shareId, { draft: parsedDraft, completedAt });
    expect(await response.json()).toEqual({ id: shareId });
  });

  it('protects public share reads before accessing the backing store', async () => {
    mocks.limit.mockResolvedValue(new Response('{}', { status: 429 }));
    const response = await GET(new Request('http://localhost/api/randodraft/share/' + shareId), {
      params: Promise.resolve({ id: shareId }),
    });
    expect(response.status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
