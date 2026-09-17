'use client';

import { Check, Copy, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { GameIconImage } from '@/components/game-asset-image';
import { RandodraftPointerNote } from '@/components/randodraft-pointer-note';
import { DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, RANDODRAFT_LANES, type CompleteDraftPick, type DraftGameMode } from '@/lib/randodraft';

const ROLE_ICON_BY_LANE: Record<string, string> = { Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' };
const CLASS_TYPES = new Set(['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support']);
// Summoner's Rift slots follow the map lanes rather than mirroring each team.
// Team 1 and Team 2 occupy different points along the same top, mid, jungle,
// and bottom-side paths so the ten icons remain readable and do not stack.
const MAP_POSITIONS_BY_TEAM: Record<0 | 1, Record<string, { left: string; top: string }>> = {
  0: {
    Top: { left: '11%', top: '22%' },
    Jungle: { left: '53%', top: '78%' },
    Mid: { left: '46%', top: '55%' },
    Bot: { left: '84%', top: '90%' },
    Support: { left: '70%', top: '90%' },
  },
  1: {
    Top: { left: '20%', top: '12%' },
    Jungle: { left: '48%', top: '27%' },
    Mid: { left: '56%', top: '47%' },
    Bot: { left: '77%', top: '77%' },
    Support: { left: '90%', top: '77%' },
  },
};
const ARAM_POSITIONS = [
  { left: '12%', top: '50%' }, { left: '31%', top: '34%' }, { left: '50%', top: '62%' },
  { left: '69%', top: '34%' }, { left: '88%', top: '50%' },
];
// Howling Abyss follows one diagonal lane: Team 1 occupies the lower-left
// half and Team 2 occupies the upper-right half, with a compact second row
// for the last two picks on each side.
const ARAM_TEAM_POSITIONS = [
  [
    { left: '13%', top: '63%' }, { left: '28%', top: '63%' }, { left: '43%', top: '63%' },
    { left: '20%', top: '73%' }, { left: '35%', top: '73%' },
  ],
  [
    { left: '49%', top: '29%' }, { left: '65%', top: '29%' }, { left: '81%', top: '29%' },
    { left: '57%', top: '21%' }, { left: '73%', top: '21%' },
  ],
];

function categoryIcon(kind: 'lane' | 'type', value: string | null, size = 16) {
  if (!value) return null;
  const path = kind === 'lane'
    ? '/role-icons/roleicon_' + ROLE_ICON_BY_LANE[value] + '.png'
    : CLASS_TYPES.has(value) ? '/class-icons/' + value.toLowerCase() + '.png' : null;
  return path ? <GameIconImage src={path} alt="" width={size} height={size} className="rounded-sm" /> : null;
}

export function DraftBuildItems({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  return (
    <ol className={compact ? 'flex min-w-0 flex-wrap items-center gap-1' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
      {ids.map((id, index) => {
        const item = DRAFT_ITEM_BY_ID.get(id);
        if (!item) return null;
        return (
          <li key={id} className={compact ? 'min-w-0' : 'flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2'}>
            <RandodraftPointerNote note={item.name}>
              <span tabIndex={0} aria-label={item.name} className="block rounded-md outline-none focus:ring-2 focus:ring-amber-300">
                <GameIconImage src={item.imageUrl} alt="" width={compact ? 22 : 32} height={compact ? 22 : 32} className="rounded-md" />
              </span>
            </RandodraftPointerNote>
            {!compact ? <span className="min-w-0 text-xs text-slate-300"><span className="mr-1 text-amber-300">{index + 1}.</span>{item.name}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function PickMeta({ pick, gameMode, compact = false }: { pick: CompleteDraftPick; gameMode: DraftGameMode; compact?: boolean }) {
  return (
    <span className={'flex items-center gap-1 ' + (compact ? 'text-[0.65rem]' : 'text-xs') + ' text-slate-400'}>
      {gameMode === 'aram'
        ? <>{categoryIcon('type', pick.type, compact ? 13 : 16)}{pick.type}</>
        : <>{categoryIcon('lane', pick.lane, compact ? 13 : 16)}{pick.lane}<span aria-hidden="true">&middot;</span>{categoryIcon('type', pick.type, compact ? 13 : 16)}{pick.type}</>}
    </span>
  );
}

export function RandodraftResults({
  picks,
  gameMode = 'summoners-rift',
  playersPerTeam = 5,
  secondTeam = false,
  copyFeedback = null,
  onShareLink,
  onShareImage,
}: {
  picks: CompleteDraftPick[];
  gameMode?: DraftGameMode;
  playersPerTeam?: number;
  secondTeam?: boolean;
  copyFeedback?: 'link' | 'image' | null;
  onShareLink?: () => void;
  onShareImage?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePick = picks[activeIndex] ?? picks[0];
  if (!activePick) return null;
  const activeResolvedIndex = Math.max(0, picks.indexOf(activePick));
  const champion = DRAFT_CHAMPION_BY_ID.get(activePick.champion);
  const isAram = gameMode === 'aram';
  const orderedPicks = !isAram
    ? Array.from({ length: secondTeam ? 2 : 1 }, (_, team) => {
      const teamPicks = picks.filter((_, index) => Math.floor(index / playersPerTeam) === team);
      return RANDODRAFT_LANES.map((lane) => teamPicks.find((pick) => pick.lane === lane)).filter((pick): pick is CompleteDraftPick => Boolean(pick));
    }).flat()
    : picks;
  const otherPicks = orderedPicks.filter((pick) => pick !== activePick);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Draft complete</p>
        <p className="mt-2 text-sm text-slate-400">Hover, focus, or tap a champion to inspect their build.</p>
        {(onShareLink || onShareImage) ? <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onShareLink ? <button type="button" onClick={onShareLink} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-amber-300/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300">{copyFeedback === 'link' ? <Check size={14} /> : <Copy size={14} />}Copy link</button> : null}
          {onShareImage ? <button type="button" onClick={onShareImage} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-amber-300/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300">{copyFeedback === 'image' ? <Check size={14} /> : <ImageIcon size={14} />}Copy image</button> : null}
        </div> : null}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
          <GameIconImage src={isAram ? '/maps/howling-abyss.png' : '/maps/summoners-rift.png'} alt={isAram ? 'Howling Abyss map' : "Summoner's Rift map"} fill sizes="(min-width: 1024px) 520px, 90vw" className="object-cover opacity-75" />
          {orderedPicks.map((pick) => {
            const selectedChampion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
            const pickIndex = picks.indexOf(pick);
            const teamIndex = secondTeam ? Math.floor(pickIndex / playersPerTeam) : 0;
            const slotIndex = pickIndex % playersPerTeam;
            const aramTeamPositions = ARAM_TEAM_POSITIONS[Math.min(teamIndex, 1)];
            const position = isAram
              ? (secondTeam ? aramTeamPositions[slotIndex % aramTeamPositions.length] : ARAM_POSITIONS[slotIndex % ARAM_POSITIONS.length])
              : MAP_POSITIONS_BY_TEAM[secondTeam ? Math.min(teamIndex, 1) as 0 | 1 : 1][pick.lane ?? 'Mid'];
            if (!selectedChampion) return null;
            return (
              <button key={'map-' + pickIndex} type="button" onMouseEnter={() => setActiveIndex(pickIndex)} onFocus={() => setActiveIndex(pickIndex)} onClick={() => setActiveIndex(pickIndex)}
                aria-label={selectedChampion.name} aria-pressed={activeResolvedIndex === pickIndex} style={position}
                className={'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border bg-slate-950/95 text-white transition focus:outline-none focus:ring-2 focus:ring-amber-300 ' + (secondTeam ? 'p-1' : 'p-1.5') + ' ' + (activeResolvedIndex === pickIndex ? 'z-10 border-amber-300' : 'border-white/30 hover:border-amber-300')}>
                <RandodraftPointerNote note={selectedChampion.name}>
                  <GameIconImage src={selectedChampion.imageUrl} alt={selectedChampion.name} loading="eager" width={secondTeam ? 51 : 63} height={secondTeam ? 51 : 63} className={secondTeam ? 'h-11 w-11 rounded-md sm:h-14 sm:w-14' : 'h-14 w-14 rounded-lg sm:h-16 sm:w-16'} />
                </RandodraftPointerNote>
              </button>
            );
          })}
        </div>
        <div aria-live="polite" className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2"><PickMeta pick={activePick} gameMode={gameMode} /><span className="text-xs text-slate-500">Featured pick</span></div>
          <div className="mt-2 flex items-center gap-3">
            {champion ? <RandodraftPointerNote note={champion.name}><GameIconImage src={champion.imageUrl} alt="" width={48} height={48} className="rounded-xl" /></RandodraftPointerNote> : null}
            <h3 className="text-2xl font-bold text-white">{champion?.name}</h3>
          </div>
          {activePick.build ? <div className="mt-3"><p className="mb-2 text-xs text-slate-400">Build path &middot; item slots</p><DraftBuildItems ids={activePick.build} /></div> : null}
          {otherPicks.length ? <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Other picks</p>
            <ol className="space-y-1.5">
              {otherPicks.map((pick) => {
                const itemChampion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
                const pickIndex = picks.indexOf(pick);
                const teamIndex = secondTeam ? Math.floor(pickIndex / playersPerTeam) : 0;
                const teamTone = secondTeam ? (teamIndex === 0 ? 'border-rose-300/40 bg-rose-300/5' : 'border-sky-300/40 bg-sky-300/5') : 'border-white/10 bg-slate-900/70';
                return (
                  <li key={'other-' + pickIndex}>
                    <button type="button" onClick={() => setActiveIndex(pickIndex)} className={'flex w-full min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition hover:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300 ' + teamTone}>
                      {itemChampion ? <RandodraftPointerNote note={itemChampion.name}><GameIconImage src={itemChampion.imageUrl} alt={itemChampion.name} width={28} height={28} className="rounded-lg" /></RandodraftPointerNote> : null}
                      {secondTeam ? <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[0.55rem] font-semibold text-slate-300">Team {teamIndex + 1}</span> : null}
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{itemChampion?.name}</span>
                      <PickMeta pick={pick} gameMode={gameMode} compact />
                      {pick.build ? <DraftBuildItems ids={pick.build} compact /> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div> : null}
        </div>
      </div>
    </section>
  );
}