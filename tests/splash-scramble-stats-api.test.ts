import { describe, expect, it } from 'vitest';
import { POST, SPLASH_SCRAMBLE_STATS_MAX_BODY_BYTES } from '../app/api/splash-scramble/stats/route';

describe('Splash Scramble stats API', () => {
  it('rejects an oversized anonymous stats submission before reaching storage', async () => {
    const response = await POST(new Request('https://knowleague.test/api/splash-scramble/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(SPLASH_SCRAMBLE_STATS_MAX_BODY_BYTES) }),
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'Request body is too large.' });
  });
});
