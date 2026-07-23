import { getClientIp } from '@/lib/rate-limit';

type TurnstileResponse = {
  success?: boolean;
};

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isTurnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(request: Request, token: unknown) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return true;
  }

  if (typeof token !== 'string' || !token.trim() || token.length > 2_048) {
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: getClientIp(request),
      }),
    });
    const result = await response.json() as TurnstileResponse;
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}
