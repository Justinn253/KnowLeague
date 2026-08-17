import { describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route';

describe('health endpoint', () => {
  it('returns a cache-resistant liveness response without dependencies', async () => {
    const response = await GET(new Request('https://knowleague.test/api/health'));
    const body = await response.json() as { status: string; service: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', service: 'knowleague' });
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  });
});
