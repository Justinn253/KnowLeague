'use client';

import { useId, useState } from 'react';
import { Hand, Search, type LucideIcon } from 'lucide-react';
import { RandodraftSpinner, type DraftSpinnerOption } from '@/components/randodraft-spinner';
import { playUiSound } from '@/lib/ui-sounds';

export function RandodraftCategory({ label, icon: Icon, options, value, busy, manualAllowance, showManualControl, manuallySelected, onBusyChange, onSelect }: {
  label: string;
  icon: LucideIcon;
  options: DraftSpinnerOption[];
  value: string | null;
  busy: boolean;
  manualAllowance: number;
  showManualControl: boolean;
  manuallySelected: boolean;
  onBusyChange: (busy: boolean) => void;
  onSelect: (value: string, manual: boolean) => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState('');
  const choicesId = useId();
  const locked = value !== null;
  const canChooseManually = !busy && !locked && manualAllowance > 0;
  const choosingManually = manualOpen && canChooseManually;
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <section aria-label={`${label} category`} className={`min-w-0 rounded-3xl border bg-gradient-to-b from-slate-900/95 to-slate-950/80 p-3 transition-colors sm:p-4 ${locked ? 'border-emerald-300/70 ring-1 ring-emerald-300/20' : 'border-white/10 hover:border-amber-300/30'}`}>
      <h3 className="mb-3 flex items-center justify-center gap-2 text-base font-bold text-white"><span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${locked ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-amber-300/30 bg-amber-300/10'}`}><Icon size={17} className={locked ? 'text-emerald-300' : 'text-amber-300'} /></span>{label}</h3>
      {choosingManually ? (
        <div id={choicesId} className="flex h-60 flex-col rounded-2xl border border-amber-300/30 bg-slate-950 p-2" onKeyDown={(event) => { if (event.key === 'Escape') setManualOpen(false); }}>
          {options.length > 5 ? (
            <label className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-2 transition focus-within:border-amber-300/40">
              <Search size={14} className="text-slate-500" />
              <input autoFocus aria-label={`Search ${label}`} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none focus:border-transparent focus:ring-0" />
            </label>
          ) : null}
          <div className="grid min-h-0 content-start gap-1 overflow-y-auto" aria-label={`Manual ${label} choices`}>
            {matches.map((option) => (
              <button key={option.id} type="button" onClick={() => { onSelect(option.id, true); setManualOpen(false); playUiSound('autocomplete-select'); }}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-left text-sm text-slate-200 hover:border-amber-300/30 hover:bg-amber-300/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300">
                {option.label}
              </button>
            ))}
            {!matches.length ? <p className="p-2 text-sm text-slate-400">No matching choices.</p> : null}
          </div>
        </div>
      ) : (
        <RandodraftSpinner label={label} options={options} value={value} disabled={busy} onBusyChange={onBusyChange}
          onSpin={(choice) => onSelect(choice, false)} />
      )}
      {showManualControl ? (
        <button type="button" disabled={!canChooseManually} aria-expanded={choosingManually} aria-controls={choosingManually ? choicesId : undefined}
          onClick={() => { setManualOpen((open) => !open); setQuery(''); }}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs font-semibold text-slate-300 transition hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
          <Hand size={14} />Choose {label} manually
        </button>
      ) : null}
      {manuallySelected ? <p className="mt-2 text-center text-xs text-emerald-200">Manually selected</p> : null}
    </section>
  );
}
