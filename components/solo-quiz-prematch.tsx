'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, Crown, Flame, Play, RefreshCw, Sparkles, Trophy, UserPlus, Users, X, XCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { DifficultyLabel } from '@/components/difficulty-style';
import { formatSeconds } from '@/lib/quiz';
import { getPublicProfileHref, shouldOpenProfileInNewTab } from '@/lib/profile-navigation';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import {
  CHAOS_DIFFICULTY,
  isLeaderboardMode,
  soloQuizModes,
  type SoloLeaderboardEntry,
  type SoloQuizDifficulty,
  type SoloQuizGameId,
  type SoloQuizMode,
} from '@/lib/solo-quiz';
import type { PlayerGameStats } from '@/lib/game-storage';
import { playUiSound } from '@/lib/ui-sounds';

type SoloQuizPrematchProps = {
  gameId: SoloQuizGameId;
  selectedMode: SoloQuizMode;
  selectedDifficulty: SoloQuizDifficulty;
  countdown: number | null;
  playerStats: PlayerGameStats;
  streaks: Record<SoloQuizMode, number>;
  modeStatuses?: Partial<Record<SoloQuizMode, 'not-started' | 'in-progress' | 'completed'>>;
  dailyDifficultyStatuses?: Partial<Record<SoloQuizDifficulty, 'not-started' | 'in-progress' | 'completed'>>;
  disabled?: boolean;
  completedToday?: boolean;
  authRequiredNote?: string;
  onModeSelect: (mode: SoloQuizMode) => void;
  onPlay: () => void;
};

function modeIcon(mode: SoloQuizMode) {
  if (mode === 'daily') return <Trophy size={18} />;
  if (mode === 'chaos') return <Zap size={18} />;
  return <Sparkles size={18} />;
}

function getNextDailyResetLabel(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const totalSeconds = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

export function SoloQuizPrematch({
  gameId,
  selectedMode,
  selectedDifficulty,
  countdown,
  playerStats,
  streaks,
  disabled,
  completedToday,
  authRequiredNote,
  modeStatuses,
  dailyDifficultyStatuses,
  onModeSelect,
  onPlay,
}: SoloQuizPrematchProps) {
  const [leaderboard, setLeaderboard] = useState<SoloLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [playedCount, setPlayedCount] = useState(0);
  const [serverHasPlayed, setServerHasPlayed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [resetLabel, setResetLabel] = useState('--:--:--');
  const leaderboardEnabled = isLeaderboardMode(selectedMode);
  const gameLabel = gameId === 'ability-blitz' ? 'Ability Blitz' : 'Skin Champion';
  const selectedModeName = useMemo(
    () => soloQuizModes.find((mode) => mode.id === selectedMode)?.name ?? 'Daily',
    [selectedMode],
  );
  const effectiveDifficulty = selectedMode === 'chaos' ? CHAOS_DIFFICULTY : selectedDifficulty;
  const progressLeaderboard = selectedMode === 'chaos' || (selectedMode === 'daily' && effectiveDifficulty === CHAOS_DIFFICULTY);
  const hasPlayedToday = Boolean(completedToday || serverHasPlayed);
  const selectedModeStatus = modeStatuses?.[selectedMode] ?? (hasPlayedToday ? 'completed' : 'not-started');
  const selectedModeInProgress = selectedModeStatus === 'in-progress' || countdown !== null;
  const selectedModeCompleted = countdown === null && (selectedModeStatus === 'completed' || (hasPlayedToday && !selectedModeInProgress));

  const getModeStatusLabel = (modeId: SoloQuizMode) => {
    const status = modeStatuses?.[modeId] ?? 'not-started';
    if (modeId === 'chaos' && status === 'in-progress') {
      return 'Completed';
    }
    if (status === 'in-progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    return 'Not Started';
  };

  useEffect(() => {
    setResetLabel(getNextDailyResetLabel());
    const interval = window.setInterval(() => setResetLabel(getNextDailyResetLabel()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!leaderboardEnabled) {
      setLeaderboard([]);
      setLeaderboardError('');
      setPlayedCount(0);
      setServerHasPlayed(false);
      return;
    }

    let cancelled = false;
    const loadLeaderboard = async () => {
      setLoadingLeaderboard(true);
      setLeaderboardError('');
      try {
        const supabase = getOptionalSupabaseClient();
        const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
        setIsLoggedIn(Boolean(data.session));
        const response = await fetch(`/api/solo-quiz/leaderboard?gameId=${gameId}&mode=${selectedMode}&difficulty=${effectiveDifficulty}`, {
          headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : undefined,
        });
        const result = await response.json();
        if (cancelled) return;
        setLeaderboard(Array.isArray(result.entries) ? result.entries : []);
        setPlayedCount(Number(result.playedCount) || 0);
        setServerHasPlayed(Boolean(result.hasPlayed));
      } catch {
        if (!cancelled) {
          setLeaderboardError('Leaderboard unavailable');
        }
      } finally {
        if (!cancelled) {
          setLoadingLeaderboard(false);
        }
      }
    };

    void loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [effectiveDifficulty, gameId, leaderboardEnabled, selectedMode]);

  const renderModeCard = (modeId: SoloQuizMode) => {
    const mode = soloQuizModes.find((candidate) => candidate.id === modeId);
    if (!mode) return null;
    const selected = selectedMode === mode.id;
    const dailyDifficulties: SoloQuizDifficulty[] = ['iron', 'gold', 'diamond', 'challenger'];
    const dailyComplete = dailyDifficulties.every((difficulty) => dailyDifficultyStatuses?.[difficulty] === 'completed');
    const statusLabel = mode.id === 'daily' && dailyDifficultyStatuses && !dailyComplete ? null : getModeStatusLabel(mode.id);

    return (
      <button
        key={mode.id}
        type="button"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          playUiSound('setting-select');
          onModeSelect(mode.id);
        }}
        disabled={disabled || countdown !== null}
        className={`group relative min-h-32 overflow-hidden rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          selected
            ? 'border-amber-300/70 bg-amber-300/10  '
            : 'border-white/10 bg-slate-950/70 hover:border-white/25 hover:bg-slate-950'
        }`}
      >
        <span className="flex items-start justify-between gap-4">
          <span className="flex min-w-0 gap-3">
            <span className="flex min-h-24 shrink-0 flex-col items-center justify-between gap-2">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                selected ? 'border-amber-300/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300'
              }`}>
                {modeIcon(mode.id)}
              </span>
              {mode.id === 'casual' ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-200">
                  <Flame size={12} />
                  {streaks.casual}
                </span>
              ) : null}
              {mode.id === 'daily' ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-200">
                  <Flame size={12} />
                  {streaks.daily}
                </span>
              ) : null}
              {mode.id === 'chaos' ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-200">
                  <Flame size={12} />
                  {streaks.chaos}
                </span>
              ) : null}
            </span>
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-white">{mode.name}</span>
                {mode.id !== 'casual' ? (
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-xs font-semibold text-sky-100">
                    Resets in {resetLabel}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-400">{mode.description}</span>
            </span>
          </span>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            (statusLabel ?? '') === 'Completed'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : (statusLabel ?? '') === 'In Progress'
                ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                : 'border-white/10 bg-slate-900 text-slate-400'
          }`}>
            {mode.id === 'daily' && dailyDifficultyStatuses && !dailyComplete ? (
              <span className="inline-flex items-center gap-1.5">
                {dailyDifficulties.map((difficulty, index) => {
                  const complete = dailyDifficultyStatuses[difficulty] === 'completed';
                  return (
                    <span key={difficulty} className="inline-flex items-center gap-1" title={`${difficulty}: ${complete ? 'complete' : 'not complete'}`}>
                      {complete ? <Check size={13} /> : <X size={13} />}
                      {index < dailyDifficulties.length - 1 ? <span className="text-slate-500">/</span> : null}
                    </span>
                  );
                })}
              </span>
            ) : statusLabel}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="grid gap-4">
    <section className="grid gap-5 rounded-3xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl sm:gap-6 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Select Mode</p>
          <h2 className="mt-2 text-2xl font-black text-white">{gameLabel}</h2>
        </div>

        <div className="grid gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Local</p>
            {renderModeCard('casual')}
          </div>
          <div className="h-px bg-white/10" />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Global</p>
            <div className="grid gap-3">
              {renderModeCard('daily')}
              {renderModeCard('chaos')}
            </div>
          </div>
        </div>

        {authRequiredNote ? (
          <div className="flex items-start gap-3 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
            <UserPlus size={18} className="mt-0.5 shrink-0" />
            <p>{authRequiredNote}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onPlay}
          disabled={disabled || countdown !== null || selectedModeCompleted}
          className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-80 sm:w-auto ${
            selectedModeCompleted
              ? 'border border-red-400/30 bg-red-400/10 text-red-100'
              : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          }`}
        >
          {countdown !== null ? <RefreshCw size={16} className="animate-spin" /> : selectedModeCompleted ? <XCircle size={16} /> : <Play size={16} />}
          {countdown !== null ? `Starting in ${countdown}` : selectedModeCompleted ? 'Attempt Completed' : `${selectedModeInProgress ? 'Resume' : 'Play'} ${selectedModeName}`}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {leaderboardEnabled ? 'Leaderboard' : 'Personal Stats'}
              </p>
              {leaderboardEnabled ? (
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <span>{selectedModeName}</span>
                  <DifficultyLabel difficulty={effectiveDifficulty} />
                </span>
              ) : null}
            </div>
            {leaderboardEnabled ? (
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-400">
                <Users size={16} className="text-sky-300" />
                Global Plays - <span className="text-white">{playedCount}</span>
              </p>
            ) : null}
          </div>
          {leaderboardEnabled ? <Crown size={22} className="text-amber-300" /> : <BarChart3 size={22} className="text-sky-300" />}
        </div>

        {!leaderboardEnabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Current Streak" value={`${playerStats.currentStreak} days`} />
            <StatTile label="Best Streak" value={`${playerStats.highestStreak} days`} />
            <StatTile label="Games Complete" value={playerStats.gamesCompleted} />
            <StatTile label="Total Guesses" value={playerStats.totalGuesses} />
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Flame size={16} className="text-amber-300" />
                Recent correct
              </div>
              <p className="mt-2 text-sm text-slate-400">{playerStats.lastCorrectGuess?.answer ?? 'No local completions yet.'}</p>
            </div>
          </div>
        ) : loadingLeaderboard ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">Loading leaderboard...</div>
        ) : leaderboardError ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{leaderboardError}</div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">
            No recorded attempts yet for today.
          </div>
        ) : (
          <div className="grid gap-2">
            {leaderboard.map((entry, index) => (
              <div key={entry.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${
                  index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-300'
                }`}>
                  <span className="text-2xl">{index + 1}</span>
                </span>
                <Link
                  href={getPublicProfileHref(entry.username)}
                  target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                  rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                  className="min-w-0 text-left"
                >
                  <span className="block truncate text-sm font-bold text-white transition hover:text-amber-200">{entry.displayName}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{entry.username}</span>
                </Link>
                <span className="text-right">
                  {progressLeaderboard ? (
                    <>
                      <span className="block text-sm font-black text-white">
                        {entry.result === 'completed' ? 'Completed' : `Round ${Math.min(entry.completedItems + 1, Math.max(entry.totalItems, 1))}`}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {entry.completedItems}/{entry.totalItems || '?'} cleared · {formatSeconds(entry.completionTimeSeconds)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-black text-white">{formatSeconds(entry.completionTimeSeconds)}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {formatSeconds(entry.itemTimeSeconds)} / item · {entry.wrongGuesses} wrong
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
    {leaderboardEnabled && !isLoggedIn ? (
      <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
        Results will not be shown on the leaderboard unless you have an account.
      </div>
    ) : null}
    </div>
  );
}
