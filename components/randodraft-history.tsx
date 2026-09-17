'use client';

import Link from 'next/link';
import { GameIconImage } from '@/components/game-asset-image';
import type { useRandodraftHistory } from '@/components/use-randodraft-history';
import { DRAFT_CHAMPION_BY_ID, type DraftGameMode } from '@/lib/randodraft';
import type { DraftHistoryEntry } from '@/lib/randodraft-history';

function gameModeLabel(mode: DraftGameMode) {
  return mode === 'aram' ? 'ARAM' : "Summoner's Rift";
}

function DraftTeamIcons({ picks, tone, singleTeam = false }: { picks: DraftHistoryEntry['picks']; tone: 'blue' | 'red'; singleTeam?: boolean }) {
  if (!picks.length) return null;
  return (
    <span className={'inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 ' + (singleTeam ? 'w-fit flex-none ' : 'flex-1 ') + (tone === 'blue' ? 'border-sky-300/30 bg-sky-300/[0.06]' : 'border-rose-300/30 bg-rose-300/[0.06]')}>
      {picks.map((pick, index) => {
        const champion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
        return champion ? <GameIconImage key={index} src={champion.imageUrl} alt={champion.name} width={34} height={34} className="h-[34px] w-[34px] rounded-md" /> : null;
      })}
    </span>
  );
}

function DraftTeamsRow({ firstPicks, secondPicks, onOpen }: {
  firstPicks: DraftHistoryEntry['picks'];
  secondPicks: DraftHistoryEntry['picks'];
  onOpen: () => void;
}) {
  if (!firstPicks.length && !secondPicks.length) return null;
  return (
    <button type="button" onClick={onOpen} className={'mt-2 flex max-w-full items-center gap-1 rounded-lg border border-white/10 bg-slate-950/55 p-1 text-left focus:outline-none ' + (secondPicks.length ? 'w-full' : 'w-fit')}>
      <DraftTeamIcons picks={firstPicks} tone="red" singleTeam={!secondPicks.length} />
      <DraftTeamIcons picks={secondPicks} tone="blue" />
    </button>
  );
}

export function RandodraftHistory({ history, onOpen }: {
  history: ReturnType<typeof useRandodraftHistory>;
  onOpen?: (draft: DraftHistoryEntry) => void;
}) {
  const visibleDrafts = history.userId ? history.drafts : (history.guestDrafts ?? []);
  return (
    <section aria-label="Recent drafts" className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent drafts</h2>
      </div>
      {!history.resolved || history.loading || history.saving ? (
        <p role="status" className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">{history.saving ? 'Saving your draft...' : 'Loading your drafts...'}</p>
      ) : !history.userId && !visibleDrafts.length ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">
          <Link href="/login" className="text-sky-200 underline focus:outline-none focus:ring-2 focus:ring-amber-300">Log in</Link> to save drafts to your account. Guest drafts remain on this browser for 7 days.
        </p>
      ) : history.userId && history.error ? (
        <div role="status" className="rounded-2xl border border-amber-300/20 bg-slate-900/70 p-4 text-sm text-amber-200">
          <p>{history.error}</p>
          <button type="button" onClick={history.retry} className="mt-2 min-h-11 rounded-xl border border-white/10 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">Retry</button>
        </div>
      ) : !visibleDrafts.length ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">No completed drafts yet. Your last five drafts will appear here.</p>
      ) : (
        <ol className="space-y-2">
          {visibleDrafts.map((draft) => {
            const teamSize = draft.settings.playersPerTeam ?? 5;
            const splitTeams = draft.settings.secondTeam === true;
            const firstPicks = splitTeams ? draft.picks.slice(0, teamSize) : draft.picks;
            const secondPicks = splitTeams ? draft.picks.slice(teamSize, teamSize * 2) : [];
            const open = () => onOpen?.(draft);
            return (
              <li key={draft.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-2 transition hover:border-amber-300/50 hover:bg-slate-900">
                <button type="button" onClick={open} className="block w-full rounded-md text-left text-xs text-slate-300 focus:outline-none">
                  <span className="flex items-center justify-between gap-3">
                    <time dateTime={draft.completedAt}>{new Date(draft.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[0.65rem] font-semibold text-amber-200">{gameModeLabel(draft.settings.gameMode)}</span>
                  </span>
                </button>
                <DraftTeamsRow firstPicks={firstPicks} secondPicks={secondPicks} onOpen={open} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}