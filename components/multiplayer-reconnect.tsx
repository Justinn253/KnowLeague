'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { RotateCcw, WifiOff, X } from 'lucide-react';
import { getReconnectDeadline } from '@/lib/multiplayer-lifecycle';

export type ReconnectCandidate = {
  code: string;
  expiresAt: string;
};

function useRemainingSeconds(expiresAt: string, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    let expired = false;
    const update = () => {
      const next = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !expired) {
        expired = true;
        onExpire?.();
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [expiresAt, onExpire]);

  return remaining;
}

export function ReconnectButton({ candidate, disabled, onReconnect, onExpire }: {
  candidate: ReconnectCandidate;
  disabled?: boolean;
  onReconnect: () => void;
  onExpire: () => void;
}) {
  const remaining = useRemainingSeconds(candidate.expiresAt, onExpire);
  if (remaining <= 0) return null;

  return (
    <button type="button" onClick={onReconnect} disabled={disabled} className="mb-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-left transition hover:bg-amber-300/15 disabled:opacity-60">
      <span className="inline-flex items-center gap-3 text-sm font-semibold text-white"><RotateCcw size={18} className="text-amber-300" />You have left a lobby recently. Click here to rejoin.</span>
      <span className="font-mono text-sm font-semibold text-amber-200">0:{remaining.toString().padStart(2, '0')}</span>
    </button>
  );
}

export function MultiplayerDisconnectStatus({
  playerName,
  disconnectedAt,
  unavailable = false,
  children,
}: {
  playerName: string;
  disconnectedAt: string;
  unavailable?: boolean;
  children?: ReactNode;
}) {
  const expiresAt = new Date(getReconnectDeadline(disconnectedAt)).toISOString();
  const remaining = useRemainingSeconds(expiresAt);
  const cannotRejoin = unavailable || remaining <= 0;

  return (
    <div className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
      cannotRejoin
        ? 'border-red-500/60 bg-red-500/15'
        : 'border-amber-300/30 bg-amber-300/10'
    }`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white">{playerName} disconnected</p>
        <p className={`mt-1 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${cannotRejoin ? 'text-red-300' : 'text-amber-200'}`}>
          {cannotRejoin ? 'Unable to rejoin' : `Rejoin 0:${remaining.toString().padStart(2, '0')}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm font-semibold text-slate-200">
        {children}
        {cannotRejoin
          ? <X size={17} className="text-red-300" aria-label="Unable to rejoin" />
          : <WifiOff size={17} className="text-amber-200" aria-label="Disconnected" />}
      </div>
    </div>
  );
}
