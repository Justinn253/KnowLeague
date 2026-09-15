'use client';

import { useState } from 'react';
import { GameIconImage } from '@/components/game-asset-image';
import { RandodraftPointerNote } from '@/components/randodraft-pointer-note';
import { DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, RANDODRAFT_LANES, type CompleteDraftPick, type DraftGameMode, type DraftLane } from '@/lib/randodraft';

const ROLE_ICON_BY_LANE: Record<string, string> = { Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' };
const CLASS_TYPES = new Set(['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support']);
const MAP_POSITIONS: Record<DraftLane, { left: string; top: string }> = {
  Top: { left: '18%', top: '22%' },
  Jungle: { left: '27%', top: '53%' },
  Mid: { left: '49%', top: '47%' },
  Support: { left: '70%', top: '84%' },
  Bot: { left: '83%', top: '68%' },
};
const ARAM_POSITIONS = [
  { left: '12%', top: '50%' },
  { left: '31%', top: '34%' },
  { left: '50%', top: '62%' },
  { left: '69%', top: '34%' },
  { left: '88%', top: '50%' },
];

function categoryIcon(kind: 'lane' | 'type', value: string | null, size = 16) {
  if (!value) return null;
  const path = kind === 'lane' ? '/role-icons/roleicon_' + ROLE_ICON_BY_LANE[value ?? ''] + '.png' : CLASS_TYPES.has(value ?? '') ? '/class-icons/' + value!.toLowerCase() + '.png' : null;
  return path ? <GameIconImage src={path} alt="" width={size} height={size} className="rounded-sm" /> : null;
}

export function DraftBuildItems({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  return (
    <ol className={compact ? 'flex min-w-0 flex-wrap items-center gap-1' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
      {ids.map((id, index) => {
        const item = DRAFT_ITEM_BY_ID.get(id);
        if (!item) return null;
        return <li key={id} className={compact ? 'min-w-0' : 'flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2'}>
          <RandodraftPointerNote note={item.name}><span tabIndex={0} aria-label={item.name} className="block rounded-md outline-none focus:ring-2 focus:ring-amber-300">
            <GameIconImage src={item.imageUrl} alt="" width={compact ? 22 : 32} height={compact ? 22 : 32} className="rounded-md" />
          </span></RandodraftPointerNote>
          {!compact ? <span className="min-w-0 text-xs text-slate-300"><span className="mr-1 text-amber-300">{index + 1}.</span>{item.name}</span> : null}
        </li>;
      })}
    </ol>
  );
}

function PickMeta({ pick, gameMode, compact = false }: { pick: CompleteDraftPick; gameMode: DraftGameMode; compact?: boolean }) {
  return <span className={'flex items-center gap-1 ' + (compact ? 'text-[0.65rem]' : 'text-xs') + ' text-slate-400'}>
    {gameMode === 'aram' ? <>{categoryIcon('type', pick.type, compact ? 13 : 16)}{pick.type}</> : <>{categoryIcon('lane', pick.lane, compact ? 13 : 16)}{pick.lane}<span aria-hidden="true">·</span>{categoryIcon('type', pick.type, compact ? 13 : 16)}{pick.type}</>}
  </span>;
}

export function RandodraftResults({ picks, gameMode = 'summoners-rift' }: { picks: CompleteDraftPick[]; gameMode?: DraftGameMode }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePick = picks[activeIndex] ?? picks[0];
  if (!activePick) return null;
  const activeResolvedIndex = Math.max(0, picks.indexOf(activePick));
  const champion = DRAFT_CHAMPION_BY_ID.get(activePick.champion);
  const orderedPicks = gameMode === 'summoners-rift'
    ? RANDODRAFT_LANES.map((lane) => picks.find((pick) => pick.lane === lane)).filter((pick): pick is CompleteDraftPick => Boolean(pick))
    : picks;
  const otherPicks = orderedPicks.filter((pick) => pick !== activePick);
  const isAram = gameMode === 'aram';

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Draft complete</p>
        <h2 className="mt-2 text-2xl font-black text-white">Your team on {isAram ? 'the Howling Abyss' : 'the Rift'}</h2>
        <p className="mt-2 text-sm text-slate-400">Hover, focus, or tap a champion to inspect their build.</p>
      </div>
      <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className={'relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950 ' + 'aspect-square max-w-xl'}>
          <GameIconImage src={isAram ? '/maps/howling-abyss.png' : '/maps/summoners-rift.png'} alt={isAram ? 'Howling Abyss map' : "Summoner's Rift map"} fill sizes="(min-width: 1024px) 520px, 90vw" className="object-cover opacity-75" />
          {orderedPicks.map((pick) => {
            const selectedChampion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
            const pickIndex = picks.indexOf(pick);
            const mapLabel = isAram ? 'Pick ' + (pickIndex + 1) : pick.lane!;
            if (!selectedChampion) return null;
            return <button key={'map-' + pickIndex} type="button" onMouseEnter={() => setActiveIndex(pickIndex)} onFocus={() => setActiveIndex(pickIndex)} onClick={() => setActiveIndex(pickIndex)}
              aria-label={mapLabel + ': ' + selectedChampion.name + ', ' + pick.type} aria-pressed={activeResolvedIndex === pickIndex}
              style={isAram ? ARAM_POSITIONS[pickIndex] : MAP_POSITIONS[pick.lane!]}
              className={'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border bg-slate-950/95 p-1.5 text-white transition focus:outline-none focus:ring-2 focus:ring-amber-300 ' + (activeResolvedIndex === pickIndex ? 'z-10 border-amber-300' : 'border-white/30 hover:border-amber-300')}>
              <RandodraftPointerNote note={selectedChampion.name + ' · ' + (isAram ? 'ARAM' : pick.lane) + ' · ' + pick.type}><GameIconImage src={selectedChampion.imageUrl} alt="" width={42} height={42} className="h-9 w-9 rounded-lg sm:h-11 sm:w-11" /></RandodraftPointerNote>
              <span className="mt-1 max-w-24 truncate text-[0.65rem] font-bold sm:text-xs">{selectedChampion.name}</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-amber-200 sm:text-xs">{categoryIcon('lane', pick.lane, 12)}{isAram ? 'Pick ' + (pickIndex + 1) : pick.lane}<span aria-hidden="true">·</span>{categoryIcon('type', pick.type, 12)}{pick.type}</span>
            </button>;
          })}
        </div>
        <div aria-live="polite" className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2"><PickMeta pick={activePick} gameMode={gameMode} /><span className="text-xs text-slate-500">Featured pick</span></div>
          <div className="mt-2 flex items-center gap-3">
            {champion ? <RandodraftPointerNote note={champion.name}><GameIconImage src={champion.imageUrl} alt="" width={48} height={48} className="rounded-xl" /></RandodraftPointerNote> : null}
            <h3 className="text-2xl font-bold text-white">{champion?.name}</h3>
          </div>
          {activePick.build ? <div className="mt-3"><p className="mb-2 text-xs text-slate-400">Build path · item slots</p><DraftBuildItems ids={activePick.build} /></div> : null}
          {otherPicks.length ? <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Other picks</p>
            <ol className="space-y-1.5">
              {otherPicks.map((pick) => {
                const itemChampion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
                const pickIndex = picks.indexOf(pick);
                return <li key={'other-' + pickIndex}><button type="button" onClick={() => setActiveIndex(pickIndex)} className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-2 text-left transition hover:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300">
                  {itemChampion ? <RandodraftPointerNote note={itemChampion.name}><GameIconImage src={itemChampion.imageUrl} alt="" width={28} height={28} className="rounded-lg" /></RandodraftPointerNote> : null}
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{itemChampion?.name}</span>
                  <PickMeta pick={pick} gameMode={gameMode} compact />
                  {pick.build ? <DraftBuildItems ids={pick.build} compact /> : null}
                </button></li>;
              })}
            </ol>
          </div> : null}
        </div>
      </div>
    </section>
  );
}
