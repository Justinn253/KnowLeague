'use client';

import Link from 'next/link';
import { ArrowLeft, RefreshCw, Volume2, type LucideIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { playUiSound } from '@/lib/ui-sounds';

export type CompanionTheme = 'amber' | 'emerald' | 'sky';

const themeClasses: Record<CompanionTheme, { accent: string; accentSoft: string; button: string; dot: string; ring: string }> = {
  amber: { accent: 'text-amber-200', accentSoft: 'border-amber-300/25 bg-amber-300/10', button: 'border-amber-200/40 bg-amber-300 text-slate-950 hover:bg-amber-200', dot: 'bg-amber-300', ring: 'focus-visible:ring-amber-200' },
  emerald: { accent: 'text-emerald-200', accentSoft: 'border-emerald-300/25 bg-emerald-300/10', button: 'border-emerald-200/40 bg-emerald-300 text-slate-950 hover:bg-emerald-200', dot: 'bg-emerald-300', ring: 'focus-visible:ring-emerald-200' },
  sky: { accent: 'text-sky-200', accentSoft: 'border-sky-300/25 bg-sky-300/10', button: 'border-sky-200/40 bg-sky-300 text-slate-950 hover:bg-sky-200', dot: 'bg-sky-300', ring: 'focus-visible:ring-sky-200' },
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function useDiscordCompanionDashboard<TDashboard>(endpoint: string) {
  const [dashboard, setDashboard] = useState<TDashboard | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadedRef = useRef(false);

  const request = useCallback(async (init?: RequestInit) => {
    const { data } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Sign in and link your Discord account in Profile to use this companion.');
    const response = await fetch(endpoint, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = await response.json() as TDashboard & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Unable to load this Discord companion.');
    return body;
  }, [endpoint]);

  const refresh = useCallback(async () => {
    setBusyAction('refresh');
    try {
      setDashboard(await request());
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to refresh this companion.');
    } finally {
      setBusyAction(null);
    }
  }, [request]);

  const act = useCallback(async (actionKey: string, body: Record<string, unknown>, successMessage: string) => {
    setBusyAction(actionKey);
    playUiSound('autocomplete-select');
    try {
      setDashboard(await request({ method: 'POST', body: JSON.stringify(body) }));
      setError('');
      setNotice(successMessage);
      playUiSound('puzzle-complete');
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete that action.');
      playUiSound('skindle-guess-incorrect');
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [request]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refresh();
  }, [refresh]);

  return { act, busyAction, dashboard, error, notice, refresh, setNotice };
}

export function CompanionShell({
  balance,
  children,
  eyebrow,
  icon: Icon,
  theme,
  title,
  subtitle,
  onRefresh,
  refreshing = false,
}: {
  balance?: number;
  children: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  theme: CompanionTheme;
  title: string;
  subtitle: string;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const colors = themeClasses[theme];
  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#030712] px-4 py-5 text-slate-100 sm:px-6 sm:py-8 lg:px-10">
      <div className={`pointer-events-none fixed left-[12%] top-[-9rem] h-80 w-80 rounded-full opacity-20 blur-3xl ${theme === 'sky' ? 'bg-sky-500' : theme === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <div className="relative mx-auto w-full max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/games" className={`inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-bold text-slate-300 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 ${colors.ring}`}>
            <ArrowLeft size={16} /> Games
          </Link>
          <button type="button" onClick={() => { playUiSound('setting-select'); onRefresh(); }} disabled={refreshing} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/70 px-3 text-sm font-bold text-slate-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ${colors.ring}`}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          <div className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_100%_10%,rgba(255,255,255,0.14),transparent_56%)]`} />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className={`inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] ${colors.accent}`}><span className={`h-2 w-2 rounded-full ${colors.dot} animate-pulse`} />{eyebrow}</div>
              <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight text-white sm:text-5xl"><Icon className={colors.accent} strokeWidth={2.5} />{title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">{subtitle}</p>
            </div>
            {balance !== undefined ? (
              <div className={`min-w-36 rounded-2xl border px-4 py-3 text-right ${colors.accentSoft}`}>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-400">Shared KnowBucks</p>
                <p className={`mt-1 text-2xl font-black ${colors.accent}`}>{formatNumber(balance)}</p>
              </div>
            ) : null}
          </div>
        </header>
        {children}
        <p className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><Volume2 size={13} />Interactions use your KnowLeague UI-sound preference. Progress is shared with the Discord bot.</p>
      </div>
    </main>
  );
}

export function CompanionTabBar<TTab extends string>({ tabs, active, onChange, theme }: { tabs: Array<{ id: TTab; label: string }>; active: TTab; onChange: (tab: TTab) => void; theme: CompanionTheme }) {
  const colors = themeClasses[theme];
  return (
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => { playUiSound('setting-select'); onChange(tab.id); }} className={`min-h-10 whitespace-nowrap rounded-xl border px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 ${colors.ring} ${active === tab.id ? colors.button : 'border-white/10 bg-slate-950/65 text-slate-400 hover:border-white/25 hover:text-slate-100'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, theme, label }: { value: number; theme: CompanionTheme; label?: string }) {
  const colors = themeClasses[theme];
  return <div aria-label={label} className="h-2 overflow-hidden rounded-full bg-slate-950"><div className={`h-full rounded-full transition-[width] duration-700 ${colors.dot}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/35 px-5 py-8 text-center text-sm leading-6 text-slate-400">{children}</div>;
}

export const companionStyles = themeClasses;
