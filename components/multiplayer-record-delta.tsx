'use client';

export function MultiplayerRecordDelta({
  wins,
  losses,
  result,
  label = 'Record',
  className = 'inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100',
}: {
  wins: number;
  losses: number;
  result?: 'win' | 'loss' | null;
  label?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <span className="text-slate-400">{label}</span> : null}
      <span className="text-emerald-200">{wins}</span>
      {result === 'win' ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">+1</span> : null}
      <span className="text-slate-600">/</span>
      <span className="text-red-200">{losses}</span>
      {result === 'loss' ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-200">+1</span> : null}
    </div>
  );
}
