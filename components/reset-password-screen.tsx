'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isValidPassword, PasswordRequirements } from '@/components/password-requirements';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

export function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [message, setMessage] = useState('Enter a new password to finish account recovery.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      return undefined;
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMessage('Recovery verified. Enter a new password.');
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getOptionalSupabaseClient();

    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      return;
    }

    if (!isValidPassword(password)) {
      setMessage('Please satisfy all password requirements.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Password updated.');
    window.setTimeout(() => router.push('/'), 800);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-10">
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/login"
            aria-label="Back to login"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Account Recovery</p>
            <h1 className="text-xl font-semibold text-white">Reset password</h1>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          <form onSubmit={submitNewPassword} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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
              {passwordFocused || password.length > 0 ? <PasswordRequirements password={password} /> : null}
            </label>

            <button
              type="submit"
              disabled={busy || !isValidPassword(password)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound size={18} />
              {busy ? 'Updating' : 'Update Password'}
            </button>
          </form>

          <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
            {message}
          </p>
        </section>
      </section>
    </main>
  );
}
