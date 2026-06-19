'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { QuizItem } from '@/lib/quiz';
import type { MultiplayerQuizDifficulty, MultiplayerQuizPublicPlayer } from '@/lib/multiplayer-quiz';

export type MultiplayerGameRuntime = {
  items: QuizItem[];
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  initialProgress: number;
  initialElapsedSeconds: number;
  gameEnded: boolean;
  progressPanel: ReactNode;
  onProgress: (progress: number, elapsedSeconds: number, finished: boolean) => void;
  onExit: () => void;
};

function formatRaceTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MultiplayerGameProgress({
  players,
  totalItems,
}: {
  players: MultiplayerQuizPublicPlayer[];
  totalItems: number;
}) {
  const previousProgressRef = useRef<Record<string, number>>({});
  const [flashingPlayerIds, setFlashingPlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changedPlayerIds = players
      .filter((player) => {
        const previous = previousProgressRef.current[player.id];
        return previous !== undefined && player.progress > previous && !player.finished_at;
      })
      .map((player) => player.id);

    previousProgressRef.current = Object.fromEntries(players.map((player) => [player.id, player.progress]));
    if (changedPlayerIds.length === 0) {
      return undefined;
    }

    setFlashingPlayerIds((current) => new Set([...current, ...changedPlayerIds]));
    const timeout = window.setTimeout(() => {
      setFlashingPlayerIds((current) => {
        const next = new Set(current);
        changedPlayerIds.forEach((playerId) => next.delete(playerId));
        return next;
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [players]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Player Progress</p>
          <h2 className="mt-1 text-sm font-semibold text-white">Live race standings</h2>
        </div>
        <span className="text-xs text-slate-500">{players.filter((player) => player.finished_at).length}/{players.length} finished</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((player) => {
          const finished = Boolean(player.finished_at);
          const flashing = flashingPlayerIds.has(player.id);
          const content = (
            <div className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
              flashing
                ? 'border-emerald-300 bg-emerald-400/20'
                : finished
                  ? 'border-transparent bg-slate-950'
                  : player.connected
                    ? 'border-white/10 bg-slate-950/80'
                    : 'border-white/5 bg-slate-950/50 opacity-55'
            }`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{player.display_name}{player.is_requesting_player ? ' (you)' : ''}</p>
                {!player.connected && !finished ? <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Disconnected</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm font-semibold text-slate-200">
                <span>{player.progress}/{totalItems}</span>
                <span className="font-mono text-slate-400">{formatRaceTime(player.elapsed_seconds)}</span>
                {finished ? <Check size={17} className="text-emerald-300" /> : null}
              </div>
            </div>
          );

          return finished ? (
            <div key={player.id} className="skindle-gradient-border rounded-2xl">
              <div className="skindle-gradient-border-content">{content}</div>
            </div>
          ) : (
            <div key={player.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
