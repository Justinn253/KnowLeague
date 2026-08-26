import type { ReactNode } from 'react';

type HeaderHoverNoteProps = {
  children: ReactNode;
};

export function HeaderHoverNote({ children }: HeaderHoverNoteProps) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-[130] mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200 group-hover:block group-focus-within:block"
    >
      {children}
    </span>
  );
}
