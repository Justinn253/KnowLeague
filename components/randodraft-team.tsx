'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { GameIconImage } from '@/components/game-asset-image';
import { RandodraftPointerNote } from '@/components/randodraft-pointer-note';
import { DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, DRAFT_PICK_NAME_MAX_LENGTH, RANDODRAFT_TEAM_SIZE, type CompleteDraftPick, type DraftGameMode, type DraftPick } from '@/lib/randodraft';

const ROLE_ICON_BY_LANE: Record<string, string> = { Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' };
const CLASS_TYPES = new Set(['Fighter', 'Marksman', 'Assassin', 'Tank', 'Mage', 'Support']);

function categoryIcon(kind: 'lane' | 'type', value?: string | null) {
  if (!value) return null;
  const path = kind === 'lane' ? `/role-icons/roleicon_${ROLE_ICON_BY_LANE[value]}.png` : CLASS_TYPES.has(value) ? `/class-icons/${value.toLowerCase()}.png` : null;
  return path ? <GameIconImage src={path} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm" /> : null;
}

function PickName({ name, index, onRename }: { name: string; index: number; onRename?: (index: number, name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const save = () => { onRename?.(index, value); setEditing(false); };
  return editing ? (
    <form className="mb-2 flex min-w-0 items-center gap-1" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <input autoFocus aria-label={`Pick ${index + 1} name`} value={value} maxLength={DRAFT_PICK_NAME_MAX_LENGTH}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(false); } }}
        className="min-h-9 w-full min-w-0 rounded-lg border border-amber-300/50 bg-slate-950 px-2 text-xs text-white outline-none focus:ring-2 focus:ring-amber-300" />
      <button type="submit" aria-label={`Save pick ${index + 1} name`} className="rounded-lg p-1.5 text-emerald-300 focus:outline-none focus:ring-2 focus:ring-amber-300"><Check size={14} /></button>
      <button type="button" aria-label="Cancel name edit" onClick={() => setEditing(false)} className="rounded-lg p-1.5 text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300"><X size={14} /></button>
    </form>
  ) : (
    <div className="mb-2 flex min-w-0 items-center gap-1">
      <span className="truncate text-xs font-bold text-white">{name}</span>
      {onRename ? <button type="button" aria-label={`Edit pick ${index + 1} name`} onClick={() => { setValue(name); setEditing(true); }}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"><Pencil size={13} /></button> : null}
    </div>
  );
}

export function RandodraftTeam({ gameMode, picks, current, names, onRename }: {
  gameMode: DraftGameMode;
  picks: CompleteDraftPick[];
  current?: DraftPick;
  names: string[];
  onRename?: (index: number, name: string) => void;
}) {
  return (
    <section aria-label="Current team" className="relative z-20 rounded-3xl border border-white/10 bg-slate-900/80 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Your team</h2>
        <span className="text-xs font-bold text-amber-200">{picks.length} / {RANDODRAFT_TEAM_SIZE} complete</span>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: RANDODRAFT_TEAM_SIZE }, (_, index) => {
          const pick = picks[index] ?? (index === picks.length ? current : undefined);
          const champion = pick?.champion ? DRAFT_CHAMPION_BY_ID.get(pick.champion) : null;
          const active = Boolean(current && index === picks.length);
          return (
            <li key={index} aria-current={active ? 'step' : undefined}
              className={`relative min-w-0 rounded-2xl border p-2 sm:p-3 ${active ? 'border-amber-300/50 bg-amber-300/5' : 'border-white/10 bg-slate-950/60'}`}>
              <PickName name={names[index]} index={index} onRename={onRename} />
              <div className="flex items-center gap-2">
                {champion ? <RandodraftPointerNote note={champion.name}><GameIconImage src={champion.imageUrl} alt="" width={32} height={32} className="rounded-lg" /></RandodraftPointerNote>
                  : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-xs text-slate-500">{index + 1}</span>}
                <span className="truncate text-xs text-slate-300">{champion?.name ?? 'Champion'}</span>
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">{gameMode === 'aram' ? <>{categoryIcon('type', pick?.type)}{pick?.type ?? 'Class'}</> : <>{categoryIcon('lane', pick?.lane)}{pick?.lane ?? 'Lane'} <span aria-hidden="true">&middot;</span> {categoryIcon('type', pick?.type)}{pick?.type ?? 'Class'}</>}</p>
              {pick?.build ? (
                <ol aria-label={`${names[index]} build`} className="mt-2 grid grid-cols-3 gap-1 min-[1100px]:grid-cols-6">
                  {pick.build.map((id) => {
                    const item = DRAFT_ITEM_BY_ID.get(id);
                    return item ? <li key={id} className="group">
                      <RandodraftPointerNote note={item.name}><span tabIndex={0} aria-label={item.name} className="block rounded-md outline-none focus:ring-2 focus:ring-amber-300">
                        <GameIconImage src={item.imageUrl} alt="" width={28} height={28} className="rounded-md" />
                      </span></RandodraftPointerNote>
                    </li> : null;
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
