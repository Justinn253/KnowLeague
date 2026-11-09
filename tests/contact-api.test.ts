// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSubmission: vi.fn(),
  getServiceClient: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/api-metrics', () => ({ withApiMetrics: (_route: string, handler: unknown) => handler }));
vi.mock('@/lib/contact', () => ({
  createContactSubmission: mocks.createSubmission,
  isContactSubmissionCategory: (value: string) => ['feedback', 'bug_report', 'suggestion', 'player_report'].includes(value),
}));
vi.mock('@/lib/rate-limit', () => ({ enforceApiRateLimit: mocks.limit }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseServiceClient: mocks.getServiceClient }));
vi.mock('@/lib/server-log', () => ({ logServerEvent: vi.fn() }));

import { POST } from '../app/api/contact/route';

function request(body: unknown) {
  return new Request('https://knowleague.test/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.10' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('contact API abuse controls', () => {
  it('rate-limits a valid guest submission before any Supabase work', async () => {
    mocks.limit.mockResolvedValue(new Response(JSON.stringify({ error: 'Please wait 30 minutes before submitting another contact request.' }), { status: 429 }));

    const response = await POST(request({
      category: 'feedback',
      message: 'Please add a setting.',
      clientId: 'attacker-controlled-client-id',
    }));

    expect(response.status).toBe(429);
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledWith(expect.any(Request), {
      scope: 'contact-submission',
      ip: { limit: 1, windowMs: 30 * 60 * 1_000 },
      subject: undefined,
      errorMessage: 'Please wait 30 minutes before submitting another contact request.',
    });
  });

  it('rejects an oversized contact body before invoking the limiter or Supabase', async () => {
    const response = await POST(request({
      category: 'feedback',
      message: 'x'.repeat(10_000),
    }));

    expect(response.status).toBe(413);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
  });
});
