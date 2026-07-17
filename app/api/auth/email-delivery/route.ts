import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { enforceEmailDeliveryProtection } from '@/lib/email-delivery';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { verifyTurnstileToken } from '@/lib/turnstile';

type EmailDeliveryBody = {
  type?: unknown;
  email?: unknown;
  redirectTo?: unknown;
  turnstileToken?: unknown;
};

function getSafeRedirectUrl(request: Request, value: unknown, path: string) {
  const requestUrl = new URL(request.url);
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const allowedOrigin = configuredUrl ? new URL(configuredUrl).origin : requestUrl.origin;
  const fallback = new URL(path, allowedOrigin).toString();
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    const redirectUrl = new URL(value);
    return redirectUrl.origin === allowedOrigin ? redirectUrl.toString() : fallback;
  } catch {
    return fallback;
  }
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as EmailDeliveryBody;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const type = body.type === 'signup' || body.type === 'password' ? body.type : null;
    const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;
    if (!email || !type) {
      throw new Error('A valid email delivery request is required.');
    }

    const rateLimitResponse = await enforceEmailDeliveryProtection(request, email);
    if (rateLimitResponse) return rateLimitResponse;

    if (!await verifyTurnstileToken(request, turnstileToken)) {
      return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();
    const error = type === 'signup'
      ? (await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: getSafeRedirectUrl(request, body.redirectTo, '/') },
        })).error
      : (await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getSafeRedirectUrl(request, body.redirectTo, '/reset-password'),
          captchaToken: turnstileToken,
        })).error;

    if (error) throw error;
    return NextResponse.json({ delivered: true, turnstileVerified: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
