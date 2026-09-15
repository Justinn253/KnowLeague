'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Shuffle } from 'lucide-react';
import { randomDraftValue } from '@/lib/randodraft';
import { playUiSound } from '@/lib/ui-sounds';
import styles from '@/components/randodraft-spinner.module.css';

export const DRAFT_SPIN_DURATION_MS = 2475;
export type DraftSpinnerOption = { id: string; label: string; content: ReactNode };

export function RandodraftSpinner({ label, options, value, disabled, onSpin, onBusyChange, drawOption }: {
  label: string;
  options: DraftSpinnerOption[];
  drawOption?: () => DraftSpinnerOption;
  value: string | null;
  disabled: boolean;
  onSpin: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [reel, setReel] = useState<DraftSpinnerOption[] | null>(null);
  const [landed, setLanded] = useState<DraftSpinnerOption[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DraftSpinnerOption[] | null>(null);
  const selected = landed?.find((option) => option.id === value) ?? options.find((option) => option.id === value);
  const preview = landed && landed[1].id === value ? landed : selected
    ? [options[0], selected, options[options.length - 1]]
    : [options[0], null, options[options.length - 1]];

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    pending.current = null;
  }, []);

  function finish() {
    const frames = pending.current;
    if (!frames) return;
    pending.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const landing = frames.slice(-3);
    setLanded(landing);
    setReel(null);
    onSpin(landing[1].id);
    onBusyChange(false);
    playUiSound('autocomplete-select');
  }

  function spin() {
    if (pending.current) { finish(); return; }
    if (disabled || value !== null || !options.length) return;
    const draw = drawOption ?? (() => randomDraftValue(options));
    const target = draw();
    const frames = Array.from({ length: 24 }, draw);
    const drawDifferent = (excluded: string[]) => {
      let candidate = draw();
      let attempts = 0;
      while (excluded.includes(candidate.id) && attempts < 8) {
        candidate = draw();
        attempts += 1;
      }
      if (excluded.includes(candidate.id) && !drawOption) {
        return options.find((option) => !excluded.includes(option.id)) ?? candidate;
      }
      return candidate;
    };
    const before = drawDifferent([target.id]);
    frames.push(before, target, drawDifferent([target.id, before.id]));
    pending.current = frames;
    setReel(frames);
    onBusyChange(true);
    playUiSound('random-select');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(finish, reducedMotion ? 0 : DRAFT_SPIN_DURATION_MS);
  }

  return (
    <div>
      <button type="button" onClick={spin} disabled={value !== null || (!reel && (disabled || !options.length))}
        aria-label={selected ? `${label} locked: ${selected.label}` : reel ? `Finish ${label} spin` : `Spin ${label}`}
        className="group relative block h-60 w-full select-none overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-b from-slate-950 to-slate-900 text-white transition hover:border-amber-200/70 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-default">
        <span className="pointer-events-none absolute inset-x-0 top-20 z-10 h-20 border-y border-amber-300/40 bg-amber-300/5" />
        <span aria-hidden="true" className={`block ${reel ? styles.reel : ''}`} style={reel ? { '--reel-offset': `-${(reel.length - 3) * 80}px` } as CSSProperties : undefined}>
          {(reel ?? preview).map((option, index) => (
            <span key={index} className="flex h-20 items-center justify-center gap-3 px-3 text-center text-lg font-bold">
              {option?.content ?? <span className="inline-flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-300/15 px-4 py-2 text-amber-200 group-hover:bg-amber-300/25"><Shuffle size={20} />Spin {label}</span>}
            </span>
          ))}
        </span>
        <span className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-slate-950 to-slate-950/40" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-slate-950 to-slate-950/40" />

      </button>
      <p role="status" className="sr-only">{reel ? `Spinning ${label}` : selected ? `${label}: ${selected.label}` : `${label} not selected`}</p>
    </div>
  );
}