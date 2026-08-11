'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ApiMetricDurationBucket, ApiMetricRouteSummary, ApiMetricSummary } from '@/lib/api-metrics';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const WINDOWS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
] as const;

function number(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getSlowRequestCount(route: ApiMetricRouteSummary) {
  return route.durationBuckets['1-4.9s'] + route.durationBuckets['5s-plus'];
}

function durationLabel(bucket: ApiMetricDurationBucket) {
  return bucket === 'under-50ms'
    ? '<50ms'
    : bucket === '50-199ms'
      ? '50–199ms'
      : bucket === '200-999ms'
        ? '200–999ms'
        : bucket === '1-4.9s'
          ? '1–4.9s'
          : '5s+';
}

export function StaffApiMetricsScreen() {
  const [hours, setHours] = useState(24);
  const [summary, setSummary] = useState<ApiMetricSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadMetrics = useCallback(async (nextHours: number, isRefresh = false) => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setError('Supabase auth is not configured.');
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in with a staff account to view API metrics.');

      const response = await fetch(`/api/staff/api-metrics?hours=${nextHours}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as ApiMetricSummary & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load API metrics.');
      setSummary(payload);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load API metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics(hours);
  }, [hours, loadMetrics]);

  const routeRows = useMemo(() => summary?.routes ?? [], [summary]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
      <section className="mx-auto grid w-full max-w-6xl gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Link
              href="/"
              aria-label="Back to KnowLeague home"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-amber-200/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Internal staff tool</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-black text-white sm:text-4xl">
                <Activity size={28} className="text-amber-300" />
                API metrics
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Aggregated request volume, error classes, and duration buckets by static API route template.
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-100">
            <ShieldCheck size={15} />
            Staff only
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Reporting window</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WINDOWS.map((window) => (
                  <button
                    key={window.hours}
                    type="button"
                    onClick={() => setHours(window.hours)}
                    className={`min-h-10 rounded-xl border px-3 text-xs font-black uppercase tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${hours === window.hours ? 'border-amber-300/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-950 text-slate-300 hover:border-amber-200/40'}`}
                  >
                    {window.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadMetrics(hours, true)}
              disabled={loading || refreshing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:border-amber-200/40 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-300" />
            Only aggregate route templates, methods, status classes, and duration buckets are retained. Request bodies, headers, IPs, tokens, query values, and user IDs are not recorded.
          </p>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-sm font-semibold text-slate-400">
            Loading API metrics...
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-300/25 bg-red-950/30 p-6 text-sm font-semibold leading-6 text-red-100">
            {error}
          </section>
        ) : null}

        {!loading && !error && summary ? (
          <>
            {!summary.configured ? (
              <section className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-6 text-sm font-semibold leading-6 text-amber-100">
                Shared metrics storage is not configured. Set the existing Upstash Redis environment variables before deploying API telemetry in production.
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-3">
              {[
                ['Requests', summary.totalRequests],
                ['4xx responses', summary.clientErrors],
                ['5xx responses', summary.serverErrors],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-black text-white">{number(value as number)}</p>
                </div>
              ))}
            </section>

            {summary.routes.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
                <div className="border-b border-white/10 px-5 py-4">
                  <h2 className="text-lg font-black text-white">Route totals</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Generated {summary.generatedAt} · UTC</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-950/60 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Route template</th>
                        <th className="px-3 py-3">Methods</th>
                        <th className="px-3 py-3 text-right">Requests</th>
                        <th className="px-3 py-3 text-right">4xx</th>
                        <th className="px-3 py-3 text-right">5xx</th>
                        <th className="px-5 py-3 text-right" title={durationLabel('1-4.9s')}>1s+ responses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {routeRows.map((route) => (
                        <tr key={route.route} className="text-slate-300">
                          <td className="px-5 py-4 font-mono text-xs text-amber-100">{route.route}</td>
                          <td className="px-3 py-4 text-xs text-slate-400">{Object.entries(route.methods).map(([method, count]) => `${method} ${number(count)}`).join(' · ')}</td>
                          <td className="px-3 py-4 text-right font-bold text-white">{number(route.totalRequests)}</td>
                          <td className="px-3 py-4 text-right font-bold text-amber-200">{number(route.clientErrors)}</td>
                          <td className="px-3 py-4 text-right font-bold text-red-200">{number(route.serverErrors)}</td>
                          <td className="px-5 py-4 text-right font-bold text-slate-200">{number(getSlowRequestCount(route))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-white/15 bg-slate-900/50 p-10 text-center">
                <Clock3 size={28} className="mx-auto text-slate-600" />
                <h2 className="mt-3 text-lg font-black text-white">No API traffic recorded in this window.</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  Requests will appear here after the shared metrics storage is configured and the application receives traffic.
                </p>
              </section>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
