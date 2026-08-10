'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Chrome, Eye, EyeOff, Mail, Shield, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isValidPassword, PasswordRequirements } from '@/components/password-requirements';
import { TurnstileChallenge, isTurnstileClientEnabled } from '@/components/turnstile-challenge';
import {
  EMAIL_DELIVERY_COOLDOWN_MS,
  getEmailDeliveryCooldownSeconds,
} from '@/lib/email-delivery-policy';
import { forfeitStoredMultiplayerSessions } from '@/lib/multiplayer-client-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type AuthMode = 'login' | 'signup' | 'password';
type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';
type EmailDelivery = { type: 'signup' | 'password'; email: string };

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

function getAuthRedirectUrl(path: string) {
  if (typeof window === 'undefined') {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<EmailDelivery | null>(null);
  const [emailDeliveryCooldownEndsAt, setEmailDeliveryCooldownEndsAt] = useState(0);
  const [emailDeliveryCooldownNow, setEmailDeliveryCooldownNow] = useState(() => Date.now());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'signup') {
      setMode('signup');
    }
  }, []);

  const title = useMemo(() => {
    if (mode === 'signup') {
      return 'Create your account';
    }

    if (mode === 'password') {
      return 'Reset your password';
    }

    return 'Log in to KnowLeague';
  }, [mode]);

  const emailDeliveryCooldownSeconds = getEmailDeliveryCooldownSeconds(
    emailDeliveryCooldownEndsAt,
    emailDeliveryCooldownNow,
  );

  useEffect(() => {
    const remainingMs = emailDeliveryCooldownEndsAt - emailDeliveryCooldownNow;
    if (!emailDeliveryCooldownEndsAt || remainingMs <= 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setEmailDeliveryCooldownNow(Date.now());
    }, Math.min(1_000, remainingMs));

    return () => window.clearTimeout(timeout);
  }, [emailDeliveryCooldownEndsAt, emailDeliveryCooldownNow]);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileResetKey((value) => value + 1);
  }, []);

  const handleTurnstileTokenChange = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameStatus('idle');
      return undefined;
    }

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setUsernameStatus('idle');
      return undefined;
    }

    if (!USERNAME_PATTERN.test(cleanUsername)) {
      setUsernameStatus('invalid');
      return undefined;
    }

    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setUsernameStatus('idle');
      return undefined;
    }

    setUsernameStatus('checking');
    const checkedUsername = cleanUsername;
    const timeout = window.setTimeout(() => {
      supabase
        .rpc('find_profile_by_username_ci', { search_username: checkedUsername })
        .maybeSingle<{ username: string }>()
        .then(({ data, error }) => {
          if (username.trim() !== checkedUsername) {
            return;
          }
          if (error) {
            setUsernameStatus('idle');
            return;
          }

          setUsernameStatus(data ? 'taken' : 'available');
        });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [mode, username]);

  const continueWithGoogle = async () => {
    const supabase = getOptionalSupabaseClient();
    setMessage('');

    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      return;
    }

    setBusy(true);
    try {
      await forfeitStoredMultiplayerSessions();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl('/') },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue with Google.');
      setBusy(false);
    }
  };

  const requestEmailDelivery = useCallback(async (type: EmailDelivery['type'], targetEmail: string) => {
    if (isTurnstileClientEnabled && !turnstileToken) {
      throw new Error('Complete the verification before requesting another email.');
    }

    const response = await fetch('/api/auth/email-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        email: targetEmail,
        redirectTo: getAuthRedirectUrl(type === 'signup' ? '/' : '/reset-password'),
        turnstileToken,
      }),
    });
    const payload = await response.json() as { error?: string };
    resetTurnstile();
    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to send email.');
    }
  }, [resetTurnstile, turnstileToken]);

  const resendEmail = async () => {
    if (!emailDelivery) return;
    setBusy(true);
    setMessage('');
    try {
      await requestEmailDelivery(emailDelivery.type, emailDelivery.email);
      setEmailDeliveryCooldownEndsAt(Date.now() + EMAIL_DELIVERY_COOLDOWN_MS);
      setMessage(emailDelivery.type === 'signup' ? 'Sign-up email resent.' : 'Password reset email resent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend email.');
    } finally {
      setBusy(false);
    }
  };

  const submitAuthForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getOptionalSupabaseClient();
    setMessage('');
    setEmailDelivery(null);

    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const cleanUsername = username.trim();
        if (isTurnstileClientEnabled && !turnstileToken) {
          throw new Error('Complete the verification before creating an account.');
        }
        if (!isValidPassword(password)) {
          throw new Error('Please satisfy all password requirements.');
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        if (!USERNAME_PATTERN.test(cleanUsername)) {
          throw new Error('Username must be 3-16 characters and use only letters, numbers, or underscores.');
        }

        const { data: existingUsername, error: usernameError } = await supabase
          .rpc('find_profile_by_username_ci', { search_username: cleanUsername })
          .maybeSingle<{ username: string }>();
        if (usernameError) {
          throw usernameError;
        }
        if (existingUsername) {
          throw new Error('This username is already taken.');
        }

        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            username: cleanUsername,
            emailRedirectTo: getAuthRedirectUrl('/'),
            turnstileToken,
          }),
        });
        const payload = await response.json() as {
          error?: string;
          session?: { accessToken: string; refreshToken: string; userId: string } | null;
        };
        resetTurnstile();
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to create account.');
        }

        if (payload.session) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: payload.session.accessToken,
            refresh_token: payload.session.refreshToken,
          });
          if (sessionError) throw sessionError;
          await forfeitStoredMultiplayerSessions();
          setEmail('');
          setUsername('');
          setPassword('');
          setConfirmPassword('');
          router.push('/');
          return;
        }

        setEmailDelivery({ type: 'signup', email: email.trim() });
        setEmailDeliveryCooldownEndsAt(Date.now() + EMAIL_DELIVERY_COOLDOWN_MS);
        setMessage('Please check your email to finish the sign up process.');
        return;
      }

      if (mode === 'password') {
        await requestEmailDelivery('password', email.trim());

        setEmailDelivery({ type: 'password', email: email.trim() });
        setEmailDeliveryCooldownEndsAt(Date.now() + EMAIL_DELIVERY_COOLDOWN_MS);
        setMessage('Password reset email sent if an account exists for that address.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      await forfeitStoredMultiplayerSessions();
      setEmail('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      router.push('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-center px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to game hub"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Account</p>
            <h1 className="text-xl font-semibold text-white">{title}</h1>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur-xl sm:p-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1">
            {[
              ['login', 'Login'],
              ['signup', 'Sign up'],
            ].map(([nextMode, label]) => (
              <button
                key={nextMode}
                type="button"
                  onClick={() => {
                  setMode(nextMode as AuthMode);
                  setMessage('');
                  setEmailDelivery(null);
                  setEmailDeliveryCooldownEndsAt(0);
                  setConfirmPassword('');
                  resetTurnstile();
                }}
                className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
                  mode === nextMode ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submitAuthForm} className="mt-6 grid gap-4">
            {mode === 'password' ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                <p className="text-sm leading-6 text-slate-300">
                  Enter your account email and we will send a password recovery link.
                </p>
              </div>
            ) : null}

            {mode === 'signup' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.slice(0, 16))}
                  autoComplete="username"
                  maxLength={16}
                  placeholder="Username"
                  className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                />
                {username.length >= 16 ? (
                  <span className="text-xs font-semibold text-amber-200">16/16</span>
                ) : null}
                {usernameStatus === 'invalid' ? (
                  <span className="text-xs font-semibold text-red-200">
                    Use 3-16 letters, numbers, or underscores.
                  </span>
                ) : null}
                {usernameStatus === 'checking' ? (
                  <span className="text-xs font-semibold text-slate-400">Checking username...</span>
                ) : null}
                {usernameStatus === 'available' ? (
                  <span className="text-xs font-semibold text-emerald-200">Username is available.</span>
                ) : null}
                {usernameStatus === 'taken' ? (
                  <span className="text-xs font-semibold text-red-200">This username is already taken.</span>
                ) : null}
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="example@email.com"
                className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
              />
            </label>

            {mode !== 'password' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="Password"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 sm:right-2"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === 'signup' && (passwordFocused || password.length > 0) ? (
                  <PasswordRequirements password={password} />
                ) : null}
              </label>
            ) : null}

            {mode === 'signup' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm Password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                />
                {confirmPassword && password !== confirmPassword ? (
                  <span className="text-xs font-semibold text-red-200">Passwords do not match.</span>
                ) : null}
              </label>
            ) : null}

            {mode === 'signup' || mode === 'password' ? (
              <TurnstileChallenge onTokenChange={handleTurnstileTokenChange} resetKey={turnstileResetKey} />
            ) : null}

            <button
              type="submit"
              disabled={
                busy ||
                !email.trim() ||
                (mode !== 'password' && !password) ||
                (mode === 'signup' && !isValidPassword(password)) ||
                (mode === 'signup' && password !== confirmPassword) ||
                (mode === 'signup' && (usernameStatus === 'checking' || usernameStatus === 'invalid' || usernameStatus === 'taken')) ||
                ((mode === 'signup' || mode === 'password') && isTurnstileClientEnabled && !turnstileToken)
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === 'signup' ? <UserPlus size={18} /> : mode === 'password' ? <Mail size={18} /> : <Shield size={18} />}
              {busy ? 'Working' : mode === 'signup' ? 'Create Account' : mode === 'password' ? 'Send Reset Email' : 'Login'}
            </button>
          </form>

          {mode !== 'password' ? (
            <div className="mt-5 grid gap-3">
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                <span className="h-px flex-1 bg-white/10" />
                <span>Or continue with</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <button
                type="button"
                onClick={() => void continueWithGoogle()}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-slate-950 px-5 text-sm font-bold text-white transition hover:border-white/25 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Chrome size={18} />
                Continue with Google
              </button>
              <p className="text-center text-xs font-semibold leading-5 text-slate-500">
                Google sign-in uses your Google account and does not require a KnowLeague password.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {mode !== 'signup' ? (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'password' ? 'login' : 'password');
                    setMessage('');
                    setEmailDelivery(null);
                    setEmailDeliveryCooldownEndsAt(0);
                    resetTurnstile();
                  }}
                  className="font-semibold text-amber-300 transition hover:text-amber-200"
                >
                  {mode === 'password' ? 'Back to login' : 'Forgot password?'}
                </button>
              </div>
            ) : null}

            {message ? (
              <p className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
                {message}
              </p>
            ) : null}
            {emailDelivery ? (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => void resendEmail()}
                  disabled={busy || emailDeliveryCooldownSeconds > 0}
                  className="font-semibold text-amber-300 transition hover:text-amber-200 disabled:opacity-60"
                >
                  {emailDeliveryCooldownSeconds > 0
                    ? `Resend email in ${emailDeliveryCooldownSeconds}s`
                    : 'Resend email'}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
