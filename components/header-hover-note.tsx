import type { ReactNode } from 'react';

type HeaderHoverNoteProps = {
  children: ReactNode;
  compact?: boolean;
};

export function HeaderHoverNote({ children, compact = false }: HeaderHoverNoteProps) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full z-[130] mt-2 hidden rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200 group-hover:block group-focus-within:block ${compact ? 'left-0 w-28 whitespace-normal' : 'left-1/2 -translate-x-1/2 whitespace-nowrap'}`}
    >
      {children}
    </span>
  );
}
