'use client';

import { useState } from 'react';
import { GameIconImage } from '@/components/game-asset-image';
import { DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, RANDODRAFT_LANES, type CompleteDraftPick, type DraftLane } from '@/lib/randodraft';

export function DraftBuildItems({ ids }: { ids: string[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ids.map((id, index) => {
        const item = DRAFT_ITEM_BY_ID.get(id);
        if (!item) return null;
        return <li key={id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2">
          <GameIconImage src={item.imageUrl} alt="" width={32} height={32} className="rounded-md" />
          <span className="min-w-0 text-xs text-slate-300"><span className="mr-1 text-amber-300">{index + 1}.</span>{item.name}</span>
        </li>;
      })}
    </ol>
  );
}

// Blue-side lane positions; keep map geometry independent of draft rules.
const MAP_POSITIONS: Record<DraftLane, { left: string; top: string }> = {
  Top: { left: '18%', top: '22%' },
  Jungle: { left: '32%', top: '59%' },
  Mid: { left: '49%', top: '47%' },
  Support: { left: '70%', top: '84%' },
  Bot: { left: '83%', top: '68%' },
};

export function RandodraftResults({ picks }: { picks: CompleteDraftPick[] }) {
  const [activeLane, setActiveLane] = useState<DraftLane>('Top');
  const activePick = picks.find((pick) => pick.lane === activeLane) ?? picks[0];
  const champion = DRAFT_CHAMPION_BY_ID.get(activePick.champion);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Draft complete</p>
        <h2 className="mt-2 text-2xl font-black text-white">Your team on the Rift</h2>
        <p className="mt-2 text-sm text-slate-400">Hover, focus, or tap a champion to inspect their build.</p>
      </div>
      <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
          <GameIconImage src="/maps/summoners-rift.png" alt="Sample Summoner’s Rift map" fill sizes="(min-width: 1024px) 520px, 90vw" className="object-cover opacity-75" />
          {RANDODRAFT_LANES.map((lane) => {
            const pick = picks.find((entry) => entry.lane === lane);
            const selectedChampion = pick && DRAFT_CHAMPION_BY_ID.get(pick.champion);
            if (!pick || !selectedChampion) return null;
            return <button key={lane} type="button" onMouseEnter={() => setActiveLane(lane)} onFocus={() => setActiveLane(lane)} onClick={() => setActiveLane(lane)}
              aria-label={`${lane}: ${selectedChampion.name}, ${pick.type}`} aria-pressed={activeLane === lane}
              style={MAP_POSITIONS[lane]}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border bg-slate-950/95 p-1.5 text-white transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${activeLane === lane ? 'z-10 border-amber-300' : 'border-white/30 hover:border-amber-300'}`}>
              <GameIconImage src={selectedChampion.imageUrl} alt="" width={42} height={42} className="h-9 w-9 rounded-lg sm:h-11 sm:w-11" />
              <span className="mt-1 max-w-24 truncate text-[0.65rem] font-bold sm:text-xs">{selectedChampion.name}</span>
              <span className="text-[0.6rem] text-amber-200 sm:text-xs">{lane} · {pick.type}</span>
            </button>;
          })}
        </div>
        <div aria-live="polite" className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{activeLane} · {activePick.type}</p>
          <h3 className="mt-2 text-2xl font-bold text-white">{champion?.name}</h3>
          <p className="mb-4 mt-2 text-sm text-slate-400">{activePick.build ? 'Build path · purchase order' : 'No build rolled for this pick.'}</p>
          {activePick.build ? <DraftBuildItems ids={activePick.build} /> : null}
        </div>
      </div>
    </section>
  );
}
