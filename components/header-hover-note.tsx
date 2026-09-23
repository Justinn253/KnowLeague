import type { ReactNode } from 'react';

type HeaderHoverNoteProps = {
  children: ReactNode;
  compact?: boolean;
  wide?: boolean;
  id?: string;
};

export function HeaderHoverNote({ children, compact = false, wide = false, id }: HeaderHoverNoteProps) {
  return (
    <span
      role="tooltip"
      id={id}
      className={`pointer-events-none absolute top-full z-[130] mt-2 hidden rounded-lg border border-white/10 bg-slate-950 px-2 py-1 font-semibold text-slate-200 group-hover:block group-focus-within:block ${wide ? 'text-sm left-0 w-[min(18rem,calc(100vw-4rem))] whitespace-normal text-left leading-5' : compact ? 'text-sm left-0 w-36 whitespace-normal leading-5' : 'text-xs left-1/2 -translate-x-1/2 whitespace-nowrap'}`}
    >
      {children}
    </span>
  );
}
