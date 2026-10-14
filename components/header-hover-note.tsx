import type { ReactNode } from 'react';

type HeaderHoverNoteProps = {
  children: ReactNode;
  compact?: boolean;
  wide?: boolean;
  placement?: 'above' | 'below';
  id?: string;
};

export function HeaderHoverNote({ children, compact = false, wide = false, placement = 'below', id }: HeaderHoverNoteProps) {
  return (
    <span
      role="tooltip"
      id={id}
      className={`pointer-events-none absolute z-[130] hidden w-fit max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 font-semibold text-slate-200 group-hover:block group-focus-within:block ${placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} ${wide ? 'left-1/2 whitespace-normal text-left text-sm leading-5' : compact ? 'left-1/2 whitespace-normal text-sm leading-5' : 'left-1/2 whitespace-nowrap text-xs'}`}
    >
      {children}
    </span>
  );
}
