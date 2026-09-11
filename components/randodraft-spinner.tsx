'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Shuffle } from 'lucide-react';
import { randomDraftValue } from '@/lib/randodraft';
import { playUiSound } from '@/lib/ui-sounds';
import styles from '@/components/randodraft-spinner.module.css';

export type DraftSpinnerOption = { id: string; label: string; content: ReactNode };

export function RandodraftSpinner({ label, options, value, disabled, onSpin, onBusyChange }: {
  label: string;
  options: DraftSpinnerOption[];
  value: string | null;
  disabled: boolean;
  onSpin: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [reel, setReel] = useState<DraftSpinnerOption[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const selected = options.find((option) => option.id === value);
  const preview = selected
    ? [options[0], selected, options[options.length - 1]]
    : [options[0], null, options[options.length - 1]];

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  function spin() {
    if (disabled || value !== null || locked.current || !options.length) return;
    locked.current = true;
    const target = randomDraftValue(options);
    const frames = Array.from({ length: 24 }, () => randomDraftValue(options));
    frames.push(target, randomDraftValue(options));
    setReel(frames);
    onBusyChange(true);
    playUiSound('random-select');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      onSpin(target.id);
      onBusyChange(false);
      setReel(null);
      locked.current = false;
      timer.current = null;
      playUiSound('autocomplete-select');
    }, reducedMotion ? 0 : 1650);
  }

  return (
    <div>
      <div className="relative h-60 overflow-hidden rounded-2xl border border-white/10 bg-slate-950" aria-hidden="true">
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 h-20 border-y border-amber-300/40 bg-amber-300/5" />
        <div className={reel ? styles.reel : ''} style={reel ? { '--reel-offset': `-${(reel.length - 3) * 80}px` } as CSSProperties : undefined}>
          {(reel ?? preview).map((option, index) => (
            <div key={index} className="flex h-20 items-center justify-center gap-3 px-3 text-center text-lg font-bold text-white">
              {option?.content ?? <span className="text-slate-500">Ready to spin</span>}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-slate-950 to-slate-950/40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-slate-950 to-slate-950/40" />
      </div>
      <p role="status" className="sr-only">{reel ? `Spinning ${label}` : selected ? `${label}: ${selected.label}` : `${label} not selected`}</p>
      <button type="button" onClick={spin} disabled={disabled || value !== null || Boolean(reel) || !options.length}
        aria-label={selected ? `${label} locked: ${selected.label}` : `Spin ${label}`}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
        {selected ? <Check size={16} /> : <Shuffle size={16} />}
        {selected ? 'Locked in' : reel ? 'Spinning…' : 'Spin'}
      </button>
    </div>
  );
}
