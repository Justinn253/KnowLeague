import { describe, expect, it } from 'vitest';
import { getAuthSessionId, getAuthTokenIssuedAt } from '@/lib/auth-session';

function tokenWithPayload(payload: Record<string, unknown>) {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${encodedPayload}.signature`;
}

describe('auth session token helpers', () => {
  it('reads the session ID and issued-at timestamp from a JWT payload', () => {
    const token = tokenWithPayload({ session_id: 'session-123', iat: 1_700_000_000 });

    expect(getAuthSessionId(token)).toBe('session-123');
    expect(getAuthTokenIssuedAt(token)).toBe(1_700_000_000);
  });

  it('returns null for malformed or missing claims', () => {
    expect(getAuthSessionId('not-a-jwt')).toBeNull();
    expect(getAuthTokenIssuedAt(tokenWithPayload({ iat: 'not-a-number' }))).toBeNull();
  });
});
