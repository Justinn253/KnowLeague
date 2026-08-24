import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceEmailDeliveryProtection } from '@/lib/email-delivery';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';

export const runtime = 'nodejs';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
const signupRateLimit = getDualRateLimit('signup');

function isValidPassword(password: string) {
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && password.length >= 8;
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc('find_auth_user_by_email', { search_email: email })
    .maybeSingle<{ id: string; email_confirmed_at: string | null }>();
  if (error) throw error;
  return data;
}

export const POST = withApiMetrics('/api/auth/signup', async function POST(request: Request) {
  try {
    const body = await readJsonBody<{
      email?: unknown;
      password?: unknown;
      username?: unknown;
      emailRedirectTo?: unknown;
      turnstileToken?: unknown;
    }>(request);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const emailRedirectTo = typeof body.emailRedirectTo === 'string' ? body.emailRedirectTo : undefined;
    const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;

    if (!email) {
      throw new Error('Enter an email address.');
    }

    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'auth-signup',
      ip: signupRateLimit.ip,
      subject: { id: email.toLowerCase(), ...signupRateLimit.subject },
      errorMessage: 'Too many signup attempts. Please wait before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    if (!await verifyTurnstileToken(request, turnstileToken)) {
      return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 403 });
    }

    if (!isValidPassword(password)) {
      throw new Error('Please satisfy all password requirements.');
    }
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error('Username must be 3-16 characters and use only letters, numbers, or underscores.');
    }

    const supabase = getSupabaseServiceClient();
    const existingUser = await findAuthUserByEmail(email);
    const { data: existingUsername, error: usernameError } = await supabase
      .rpc('find_profile_by_username_ci', { search_username: username })
      .maybeSingle<{ id: string; username: string }>();
    if (usernameError) throw usernameError;
    if (existingUsername && existingUsername.id !== existingUser?.id) {
      throw new Error('This username is already taken.');
    }

    const metadata = { username, display_name: username };

    if (existingUser) {
      if (existingUser.email_confirmed_at) {
        throw new Error('An account already exists for this email address. Log in or reset your password instead.');
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        user_metadata: metadata,
      });
      if (updateError) throw updateError;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          username,
          display_name: username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id);
      if (profileUpdateError) throw profileUpdateError;

      const emailDeliveryResponse = await enforceEmailDeliveryProtection(request, email);
      if (emailDeliveryResponse) return emailDeliveryResponse;

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (resendError) throw resendError;

      return NextResponse.json({ needsEmailConfirmation: true, turnstileVerified: true });
    }

    const emailDeliveryResponse = await enforceEmailDeliveryProtection(request, email);
    if (emailDeliveryResponse) return emailDeliveryResponse;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: metadata,
        captchaToken: turnstileToken,
      },
    });
    if (error) throw error;

    if (data.user && data.user.identities?.length === 0) {
      throw new Error('An account already exists for this email address. Log in or reset your password instead.');
    }

    return NextResponse.json({
      needsEmailConfirmation: !data.session,
      turnstileVerified: true,
      session: data.session
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            userId: data.session.user.id,
          }
        : null,
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
