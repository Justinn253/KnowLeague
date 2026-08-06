import { describe, expect, it } from 'vitest';
import { getClientIp, getRateLimitSubject } from '@/lib/rate-limit';

describe('API rate-limit identity helpers', () => {
  it('prefers the platform-provided client IP and uses the first forwarded address', () => {
    const request = new Request('https://knowleague.test/api/example', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.10, 10.0.0.1',
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      },
    });

    expect(getClientIp(request)).toBe('198.51.100.10');
  });

  it('does not use a bearer token directly as the subject bucket key', async () => {
    const request = new Request('https://knowleague.test/api/example', {
      headers: { authorization: 'Bearer test-secret-token' },
    });

    const subject = await getRateLimitSubject(request);

    expect(subject).toMatch(/^auth:[0-9a-f]+$/);
    expect(subject).not.toContain('test-secret-token');
    expect(subject).toBe(await getRateLimitSubject(request));
  });
});
