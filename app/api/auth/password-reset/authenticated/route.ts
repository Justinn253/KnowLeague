import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceEmailDeliveryProtection } from '@/lib/email-delivery';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

const passwordResetRateLimit = getDualRateLimit('passwordReset');

function getSafeRedirectUrl(request: Request, value: unknown) {
  const requestUrl = new URL(request.url);
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const allowedOrigin = configuredUrl ? new URL(configuredUrl).origin : requestUrl.origin;
  const fallback = new URL('/reset-password', allowedOrigin).toString();
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

export const POST = withApiMetrics('/api/auth/password-reset/authenticated', async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user.email) {
      throw new Error('No email address is associated with this account.');
    }

    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'auth-password-reset-authenticated',
      ip: passwordResetRateLimit.ip,
      subject: { id: user.id, ...passwordResetRateLimit.subject },
      errorMessage: 'Too many password reset requests. Please wait before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const emailDeliveryResponse = await enforceEmailDeliveryProtection(request, user.email);
    if (emailDeliveryResponse) return emailDeliveryResponse;

    const body = await request.json() as { redirectTo?: unknown };
    const { error } = await getSupabaseServiceClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: getSafeRedirectUrl(request, body.redirectTo),
    });
    if (error) throw error;

    return NextResponse.json({ delivered: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
