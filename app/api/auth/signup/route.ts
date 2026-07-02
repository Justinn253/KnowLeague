import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

function isValidPassword(password: string) {
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && password.length >= 8;
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServiceClient();
  const normalizedEmail = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }

  throw new Error('Unable to verify whether this email already has a pending signup.');
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      email?: unknown;
      password?: unknown;
      username?: unknown;
      emailRedirectTo?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const emailRedirectTo = typeof body.emailRedirectTo === 'string' ? body.emailRedirectTo : undefined;

    if (!email) {
      throw new Error('Enter an email address.');
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

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (resendError) throw resendError;

      return NextResponse.json({ needsEmailConfirmation: true });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: metadata,
      },
    });
    if (error) throw error;

    if (data.user && data.user.identities?.length === 0) {
      throw new Error('An account already exists for this email address. Log in or reset your password instead.');
    }

    return NextResponse.json({
      needsEmailConfirmation: !data.session,
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
}
