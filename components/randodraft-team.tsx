'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { GameIconImage } from '@/components/game-asset-image';
import { RandodraftPointerNote } from '@/components/randodraft-pointer-note';
import { DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, DRAFT_PICK_NAME_MAX_LENGTH, draftTotalPicks, type CompleteDraftPick, type DraftGameMode, type DraftPick, type DraftSettings } from '@/lib/randodraft';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const save = () => { onRename?.(index, value); setEditing(false); };

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  return editing ? (
    <form className="mb-2 flex min-w-0 items-center gap-1" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) save();
    }} onSubmit={(event) => { event.preventDefault(); save(); }}>
      <input ref={inputRef} aria-label={`Pick ${index + 1} name`} value={value} maxLength={DRAFT_PICK_NAME_MAX_LENGTH}
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

function TeamRow({ label, teamIndex, gameMode, playersPerTeam, picks, current, names, onRename }: {
  label: string; teamIndex: number; gameMode: DraftGameMode; playersPerTeam: number; picks: CompleteDraftPick[]; current?: DraftPick; names: string[]; onRename?: (index: number, name: string) => void;
}) {
  return (
    <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <h3 className={'mb-2 text-xs font-semibold uppercase tracking-[0.18em] ' + (label.startsWith('Team 1') ? 'text-rose-200' : label.startsWith('Team 2') ? 'text-sky-200' : 'text-slate-500')}>{label}</h3>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: playersPerTeam }, (_, slot) => {
          const index = teamIndex * playersPerTeam + slot;
          const pick = picks[index] ?? (index === picks.length ? current : undefined);
          const champion = pick?.champion ? DRAFT_CHAMPION_BY_ID.get(pick.champion) : null;
          const active = Boolean(current && index === picks.length);
          return (
            <li key={index} aria-current={active ? 'step' : undefined}
              className={'relative min-w-0 rounded-2xl border p-2 sm:p-3 ' + (active ? 'border-amber-300/50 bg-amber-300/5' : teamIndex === 0 && label.startsWith('Team') ? 'border-rose-300/25 bg-rose-300/[0.03]' : teamIndex === 1 ? 'border-sky-300/25 bg-sky-300/[0.03]' : 'border-white/10 bg-slate-950/60')}>
              <PickName name={names[index] ?? `Pick ${index + 1}`} index={index} onRename={onRename} />
              <div className="flex items-center gap-2">
                {champion ? <RandodraftPointerNote note={champion.name}><GameIconImage src={champion.imageUrl} alt="" width={32} height={32} className="rounded-lg" /></RandodraftPointerNote>
                  : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-xs text-slate-500">{index + 1}</span>}
                <span className="truncate text-xs text-slate-300">{champion?.name ?? 'Champion'}</span>
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">{gameMode === 'aram' ? <>{categoryIcon('type', pick?.type)}{pick?.type ?? 'Class'}</> : <>{categoryIcon('lane', pick?.lane)}{pick?.lane ?? 'Lane'} <span aria-hidden="true">&middot;</span> {categoryIcon('type', pick?.type)}{pick?.type ?? 'Class'}</>}</p>
              {pick?.build ? (
                <ol aria-label={`${names[index] ?? `Pick ${index + 1}`} build`} className="mt-2 grid grid-cols-3 gap-1 min-[1100px]:grid-cols-6">
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
    </div>
  );
}

export function RandodraftTeam({ gameMode, picks, current, names, onRename, settings, playersPerTeam, secondTeam }: {
  gameMode: DraftGameMode;
  picks: CompleteDraftPick[];
  current?: DraftPick;
  names: string[];
  onRename?: (index: number, name: string) => void;
  settings?: DraftSettings;
  playersPerTeam?: number;
  secondTeam?: boolean;
}) {
  const size = playersPerTeam ?? settings?.playersPerTeam ?? 5;
  const teams = secondTeam ?? settings?.secondTeam ?? false;
  const total = draftTotalPicks({ gameMode, manualSelections: 0, randomBuildType: 'none', playersPerTeam: size as 1 | 2 | 3 | 4 | 5, secondTeam: teams });
  return (
    <section aria-label={teams ? 'Teams' : 'Current team'} className="relative z-20 rounded-3xl border border-white/10 bg-slate-900/80 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{teams ? 'Teams' : 'Your team'}</h2>
        <span className="text-xs font-bold text-amber-200">{picks.length} / {total} complete</span>
      </div>
      <div className="space-y-4">
        <TeamRow label={teams ? 'Team 1' : 'Picks'} teamIndex={0} gameMode={gameMode} playersPerTeam={size} picks={picks} current={current} names={names} onRename={onRename} />
        {teams ? <TeamRow label="Team 2" teamIndex={1} gameMode={gameMode} playersPerTeam={size} picks={picks} current={current} names={names} onRename={onRename} /> : null}
      </div>
    </section>
  );
}
