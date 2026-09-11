'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { GameIconImage } from '@/components/game-asset-image';
import { DraftBuildItems } from '@/components/randodraft-results';
import type { useRandodraftHistory } from '@/components/use-randodraft-history';
import { DRAFT_CHAMPION_BY_ID } from '@/lib/randodraft';

export function RandodraftHistory({ history }: { history: ReturnType<typeof useRandodraftHistory> }) {
  return (
    <section aria-label="Recent drafts" className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent drafts</h2>
        <History size={18} className="text-amber-300" />
      </div>
      {!history.resolved || history.loading || history.saving ? (
        <p role="status" className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">{history.saving ? 'Saving your draft...' : 'Loading your drafts...'}</p>
      ) : !history.userId ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">
          <Link href="/login" className="text-sky-200 underline focus:outline-none focus:ring-2 focus:ring-amber-300">Log in</Link> to save your last five completed drafts.
        </p>
      ) : history.error ? (
        <div role="status" className="rounded-2xl border border-amber-300/20 bg-slate-900/70 p-4 text-sm text-amber-200">
          <p>{history.error}</p>
          <button type="button" onClick={history.retry} className="mt-2 min-h-11 rounded-xl border border-white/10 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">Retry</button>
        </div>
      ) : !history.drafts.length ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">No completed drafts yet. Your last five drafts will appear here.</p>
      ) : (
        <ol className="space-y-3">
          {history.drafts.map((draft) => (
            <li key={draft.id}>
              <details className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <summary className="cursor-pointer rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <time dateTime={draft.completedAt}>{new Date(draft.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                  <span className="mt-3 flex flex-wrap gap-2">
                    {draft.picks.map((pick) => {
                      const champion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
                      return champion ? <GameIconImage key={pick.lane} src={champion.imageUrl} alt={`${champion.name}, ${pick.lane}, ${pick.type}`} width={36} height={36} className="rounded-lg" /> : null;
                    })}
                  </span>
                </summary>
                <ul className="mt-3 space-y-3 border-t border-white/10 pt-3">
                  {draft.picks.map((pick) => (
                    <li key={pick.lane} className="text-xs text-slate-400">
                      <p className="mb-2"><span className="font-semibold text-white">{DRAFT_CHAMPION_BY_ID.get(pick.champion)?.name ?? pick.champion}</span> ? {pick.lane} ? {pick.type}</p>
                      {pick.build ? <DraftBuildItems ids={pick.build} /> : <p>No build rolled.</p>}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
