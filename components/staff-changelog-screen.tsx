'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, FileText, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { StaffChangelogEntry } from '@/lib/staff-changelog';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function entryMatchesSearch(entry: StaffChangelogEntry, search: string) {
  if (!search) return true;

  const searchableText = [
    entry.id,
    entry.patch,
    entry.title,
    entry.summary,
    ...entry.details,
    ...entry.impact,
    ...entry.files,
    ...entry.verification,
  ].join(' ').toLowerCase();

  return searchableText.includes(search);
}

export function StaffChangelogScreen() {
  const [entries, setEntries] = useState<StaffChangelogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadChangelog = async () => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase auth is not configured.');
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) {
          setError('Sign in with a staff account to view the internal changelog.');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch('/api/staff/changelog', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: 'no-store',
        });
        const payload = await response.json() as { entries?: StaffChangelogEntry[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load the internal changelog.');
        }

        if (!cancelled) {
          setEntries(payload.entries ?? []);
          setError('');
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load the internal changelog.');
          setLoading(false);
        }
      }
    };

    void loadChangelog();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => entries.filter((entry) => entryMatchesSearch(entry, normalizedSearch)),
    [entries, normalizedSearch],
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
      <section className="mx-auto grid w-full max-w-5xl gap-6">
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
                <FileText size={28} className="text-amber-300" />
                Change log
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                A precise record of impactful product, data, security, and operational patches made to KnowLeague.
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-100">
            <ShieldCheck size={15} />
            Staff only
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
          <label htmlFor="staff-changelog-search" className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            Search change log
          </label>
          <div className="relative mt-2">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="staff-changelog-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patches, files, impact, or verification notes"
              className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
            />
          </div>
          {!loading && !error ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'patch' : 'patches'} shown
            </p>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-sm font-semibold text-slate-400">
            Loading the internal change log...
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-300/25 bg-red-950/30 p-6 text-sm font-semibold leading-6 text-red-100">
            {error}
          </section>
        ) : null}

        {!loading && !error && filteredEntries.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-white/15 bg-slate-900/50 p-10 text-center">
            <FileText size={28} className="mx-auto text-slate-600" />
            <h2 className="mt-3 text-lg font-black text-white">
              {entries.length === 0 ? 'No changes have been logged yet.' : 'No matching patches.'}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {entries.length === 0
                ? 'Future impactful patches will be documented here with exact details, affected files, verification, and the UTC time they were made.'
                : 'Try a broader search term or clear the search field.'}
            </p>
          </section>
        ) : null}

        <div className="grid gap-5">
          {filteredEntries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:p-6">
              <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
                    <span className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-200">{entry.patch}</span>
                    <span className="text-slate-500">{entry.id}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-white">{entry.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{entry.summary}</p>
                </div>
                <time dateTime={entry.timestamp} className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-slate-500">
                  <Clock3 size={14} />
                  {formatTimestamp(entry.timestamp)}
                </time>
              </header>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <section>
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Specific changes</h3>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                    {entry.details.map((detail) => <li key={detail}>• {detail}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Impact</h3>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                    {entry.impact.map((impact) => <li key={impact}>• {impact}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Affected files</h3>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-400">
                    {entry.files.map((file) => <li key={file} className="font-mono text-xs">{file}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Verification</h3>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                    {entry.verification.map((check) => (
                      <li key={check} className="flex items-start gap-2">
                        <CheckCircle2 size={15} className="mt-1 shrink-0 text-emerald-300" />
                        <span>{check}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
