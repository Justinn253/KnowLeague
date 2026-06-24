'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail, Shield, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isValidPassword, PasswordRequirements } from '@/components/password-requirements';
import { getAuthSessionId } from '@/lib/auth-session';
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
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<EmailDelivery | null>(null);

  const title = useMemo(() => {
    if (mode === 'signup') {
      return 'Create your account';
    }

    if (mode === 'password') {
      return 'Reset your password';
    }

    return 'Log in to KnowLeague';
  }, [mode]);

  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameStatus('idle');
      return undefined;
    }

    const cleanUsername = username.trim().toLowerCase();
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
    const timeout = window.setTimeout(() => {
      supabase
        .from('profiles')
        .select('username')
        .eq('username', cleanUsername)
        .maybeSingle<{ username: string }>()
        .then(({ data, error }) => {
          if (error) {
            setUsernameStatus('idle');
            return;
          }

          setUsernameStatus(data ? 'taken' : 'available');
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [mode, username]);

  const activateSession = async (accessToken: string, userId: string) => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) throw new Error('Supabase auth is not configured.');
    const sessionId = getAuthSessionId(accessToken);
    if (!sessionId) throw new Error('Unable to identify the authenticated session.');

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutError) throw signOutError;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ active_session_id: sessionId })
      .eq('id', userId);
    if (profileError) throw profileError;
  };

  const resendEmail = async () => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase || !emailDelivery) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = emailDelivery.type === 'signup'
        ? await supabase.auth.resend({
            type: 'signup',
            email: emailDelivery.email,
            options: { emailRedirectTo: getAuthRedirectUrl('/') },
          })
        : await supabase.auth.resetPasswordForEmail(emailDelivery.email, {
            redirectTo: getAuthRedirectUrl('/reset-password'),
          });
      if (error) throw error;
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
        const cleanUsername = username.trim().toLowerCase();
        if (!isValidPassword(password)) {
          throw new Error('Please satisfy all password requirements.');
        }

        if (!USERNAME_PATTERN.test(cleanUsername)) {
          throw new Error('Username must be 3-16 characters and use only letters, numbers, or underscores.');
        }

        if (usernameStatus === 'checking') {
          throw new Error('Username availability is still being checked.');
        }

        if (usernameStatus === 'taken') {
          throw new Error('This username is already taken.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl('/'),
            data: {
              username: cleanUsername,
              display_name: cleanUsername,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.user && data.user.identities?.length === 0) {
          throw new Error('An account already exists for this email address. Log in or reset your password instead.');
        }

        if (data.session) {
          await activateSession(data.session.access_token, data.session.user.id);
          await forfeitStoredMultiplayerSessions();
          setEmail('');
          setUsername('');
          setPassword('');
          router.push('/');
          return;
        }

        setEmailDelivery({ type: 'signup', email: email.trim() });
        setMessage('Please check your email to finish the sign up process.');
        return;
      }

      if (mode === 'password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getAuthRedirectUrl('/reset-password'),
        });

        if (error) {
          throw error;
        }

        setEmailDelivery({ type: 'password', email: email.trim() });
        setMessage('Password reset email sent if an account exists for that address.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      await activateSession(data.session.access_token, data.session.user.id);
      await forfeitStoredMultiplayerSessions();
      setEmail('');
      setUsername('');
      setPassword('');
      router.push('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-10">
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

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
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
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-900 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === 'signup' && (passwordFocused || password.length > 0) ? (
                  <PasswordRequirements password={password} />
                ) : null}
              </label>
            ) : null}

            <button
              type="submit"
              disabled={
                busy ||
                !email.trim() ||
                (mode !== 'password' && !password) ||
                (mode === 'signup' && !isValidPassword(password)) ||
                (mode === 'signup' && (usernameStatus === 'checking' || usernameStatus === 'invalid' || usernameStatus === 'taken'))
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === 'signup' ? <UserPlus size={18} /> : mode === 'password' ? <Mail size={18} /> : <Shield size={18} />}
              {busy ? 'Working' : mode === 'signup' ? 'Create Account' : mode === 'password' ? 'Send Reset Email' : 'Login'}
            </button>
          </form>

          <div className="mt-5 grid gap-3">
            {mode !== 'signup' ? (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'password' ? 'login' : 'password');
                    setMessage('');
                    setEmailDelivery(null);
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
                <button type="button" onClick={() => void resendEmail()} disabled={busy} className="font-semibold text-amber-300 transition hover:text-amber-200 disabled:opacity-60">
                  Resend email
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
