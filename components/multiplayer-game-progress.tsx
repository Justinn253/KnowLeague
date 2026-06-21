'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check, WifiOff, X } from 'lucide-react';
import type { QuizItem } from '@/lib/quiz';
import type { MultiplayerQuizDifficulty, MultiplayerQuizPlayerResult, MultiplayerQuizPublicPlayer } from '@/lib/multiplayer-quiz';

export type MultiplayerGameRuntime = {
  items: QuizItem[];
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  initialProgress: number;
  initialElapsedSeconds: number;
  gameEnded: boolean;
  progressPanel: ReactNode;
  onProgress: (progress: number, elapsedSeconds: number, result: MultiplayerQuizPlayerResult) => void;
  onExit: () => void;
};

function formatRaceTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatPlace(position: number) {
  const remainder = position % 100;
  if (remainder >= 11 && remainder <= 13) return `${position}th`;
  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;
  return `${position}th`;
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

  const opponents = players.filter((player) => !player.is_requesting_player);
  const completedPlayers = players
    .filter((player) => player.result === 'completed' && player.finished_at)
    .sort((first, second) => new Date(first.finished_at as string).getTime() - new Date(second.finished_at as string).getTime());
  const placements = new Map(completedPlayers.map((player, index) => [player.id, index + 1]));
  const winnerId = completedPlayers[0]?.id;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Player Progress</p>
        <span className="text-xs text-slate-500">{players.filter((player) => player.result === 'completed').length}/{players.length} finished</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {opponents.map((player) => {
          const completed = player.result === 'completed';
          const failed = player.result === 'failed';
          const placement = placements.get(player.id);
          const won = player.id === winnerId;
          const flashing = flashingPlayerIds.has(player.id);
          const content = (
            <div className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
              flashing
                ? 'border-emerald-300 bg-emerald-400/20'
                : failed
                  ? 'border-red-500/70 bg-red-500/15'
                  : completed
                  ? won
                    ? 'border-transparent bg-slate-950'
                    : 'border-emerald-400/60 bg-emerald-500/15'
                  : player.connected
                    ? 'border-white/10 bg-slate-950/80'
                    : 'border-white/5 bg-slate-950/50 opacity-55'
            }`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{player.display_name}</p>
                {!player.connected && !player.finished_at ? <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Disconnected</p> : null}
                {placement ? <p className="mt-0.5 text-xs font-semibold text-emerald-300">{formatPlace(placement)} place</p> : null}
                {failed ? <p className="mt-0.5 text-xs font-semibold text-red-300">Did not finish</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm font-semibold text-slate-200">
                <span>{player.progress}/{totalItems}</span>
                <span className="font-mono text-slate-400">{formatRaceTime(player.elapsed_seconds)}</span>
                {completed ? <Check size={17} className="text-emerald-300" /> : null}
                {failed ? <X size={17} className="text-red-300" /> : null}
                {!player.connected && !player.finished_at ? <WifiOff size={17} className="text-slate-500" aria-label="Disconnected" /> : null}
              </div>
            </div>
          );

          return won ? (
            <div key={player.id} className="multiplayer-victory-border rounded-xl">{content}</div>
          ) : (
            <div key={player.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
