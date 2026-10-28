import { describe, expect, it } from 'vitest';
import { getApiRouteRateLimitPolicy } from '@/lib/abuse-controls';
import { ApiError, readJsonBody } from '@/lib/api-utils';

describe('API route abuse policies', () => {
  it('protects expensive, privileged, social, and game mutation families', () => {
    expect(getApiRouteRateLimitPolicy('/api/solo-quiz/attempt', 'POST')?.scope).toBe('api:game-action');
    expect(getApiRouteRateLimitPolicy('/api/mining', 'GET')?.scope).toBe('api:game-action');
    expect(getApiRouteRateLimitPolicy('/api/mining', 'POST')?.scope).toBe('api:game-action');
    expect(getApiRouteRateLimitPolicy('/api/riftbound/community/posts/abc/comments', 'POST')?.scope).toBe('api:community-write');
    expect(getApiRouteRateLimitPolicy('/api/riot-account/patch-notes', 'GET')?.scope).toBe('api:expensive-read');
    expect(getApiRouteRateLimitPolicy('/api/staff/api-metrics', 'GET')?.scope).toBe('api:privileged:read');
    expect(getApiRouteRateLimitPolicy('/api/cron/riftbound-price-snapshot', 'POST')?.scope).toBe('api:cron');
  });

  it('does not add a second route-family limit to heartbeat or progress traffic', () => {
    expect(getApiRouteRateLimitPolicy('/api/multiplayer/lobbies/ABC123/heartbeat', 'POST')).toBeNull();
    expect(getApiRouteRateLimitPolicy('/api/multiplayer/lobbies/ABC123/progress', 'POST')).toBeNull();
    expect(getApiRouteRateLimitPolicy('/api/skincognito/lobbies/ABC123/heartbeat', 'POST')).toBeNull();
  });

  it('uses static scopes even when the pathname contains dynamic identifiers', () => {
    const first = getApiRouteRateLimitPolicy('/api/users/user-one/block', 'POST');
    const second = getApiRouteRateLimitPolicy('/api/users/user-two/block', 'POST');

    expect(first?.scope).toBe('api:community-write');
    expect(second?.scope).toBe(first?.scope);
    expect(first?.scope).not.toContain('user-one');
    expect(first?.scope).not.toContain('user-two');
  });
});

describe('bounded JSON request parsing', () => {
  it('parses a valid request without using an unbounded request.json call', async () => {
    const request = new Request('https://knowleague.test/api/example', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody<{ ok?: boolean }>(request)).resolves.toEqual({ ok: true });
  });

  it('rejects bodies that exceed the configured parser limit', async () => {
    const request = new Request('https://knowleague.test/api/example', {
      method: 'POST',
      body: JSON.stringify({ payload: 'x'.repeat(64) }),
    });

    await expect(readJsonBody(request, 16)).rejects.toMatchObject({
      name: 'ApiError',
      status: 413,
    } satisfies Partial<ApiError>);
  });

  it('keeps malformed JSON behavior non-throwing for existing callers', async () => {
    const request = new Request('https://knowleague.test/api/example', {
      method: 'POST',
      body: '{not-json',
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });
});
