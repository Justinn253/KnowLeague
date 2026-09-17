'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';

export function RandodraftPointerNote({ children, note }: { children: ReactNode; note: ReactNode }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  function update(event: MouseEvent<HTMLSpanElement>) {
    setPoint({
      x: Math.min(event.clientX + 14, Math.max(12, window.innerWidth - 236)),
      y: Math.min(event.clientY + 14, Math.max(12, window.innerHeight - 64)),
    });
  }

  return (
    <span className="relative inline-flex" onMouseEnter={update} onMouseMove={update} onMouseLeave={() => setPoint(null)}>
      {children}
      {(
        <span role="tooltip" className={`${point ? '' : 'hidden '}pointer-events-none fixed z-[140] max-w-56 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200`} style={point ? { left: point.x, top: point.y } : undefined}>
          {note}
        </span>
      )}
    </span>
  );
}
