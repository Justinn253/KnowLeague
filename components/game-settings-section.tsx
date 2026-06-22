'use client';

import { type ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function GameSettingsSection({ title, summary, defaultOpen = false, children }: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</span>
        <span className="flex items-center gap-3 text-xs text-slate-400">{summary}<ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open ? <div className="border-t border-white/10 p-4">{children}</div> : null}
    </section>
  );
}
