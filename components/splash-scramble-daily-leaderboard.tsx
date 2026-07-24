'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, Clock3, Hash, Info, LoaderCircle, Trophy, UserPlus, UserRound, X } from 'lucide-react';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { SplashScrambleLeaderboardEntry, SplashScrambleLeaderboardSnapshot } from '@/lib/splash-scramble-leaderboard';

type SplashScrambleDailyLeaderboardProps = {
  open: boolean;
  onClose: () => void;
  snapshot: SplashScrambleLeaderboardSnapshot;
  loading: boolean;
  error: string;
  currentUserId: string | null;
  friendIds: Set<string>;
};

type LeaderboardContextMenu = {
  entry: SplashScrambleLeaderboardEntry;
  x: number;
  y: number;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function openPublicProfileOverlay(username: string) {
  window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username } }));
}

export function SplashScrambleDailyLeaderboard({ open, onClose, snapshot, loading, error, currentUserId, friendIds }: SplashScrambleDailyLeaderboardProps) {
  const [status, setStatus] = useState('');
  const [contextMenu, setContextMenu] = useState<LeaderboardContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setContextMenu(null);
    }
    setStatus('');
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    return () => setContextMenu(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
        onClose();
      }
    };
    const closeContextMenu = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', closeContextMenu);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', closeContextMenu);
    };
  }, [onClose, open]);

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>, entry: SplashScrambleLeaderboardEntry) => {
    event.preventDefault();
    setContextMenu({
      entry,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 212)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 132)),
    });
  };

  const sendFriendRequest = async (entry: SplashScrambleLeaderboardEntry) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setStatus('Sign in to send a friend request.');
      setContextMenu(null);
      return;
    }

    try {
      const response = await fetch('/api/friends/requests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId: entry.userId }),
      });
      const result = await response.json() as { error?: string };
      setStatus(response.ok ? `Friend request sent to ${entry.username}.` : result.error ?? 'Unable to send friend request.');
    } catch {
      setStatus('Unable to send friend request.');
    } finally {
      setContextMenu(null);
    }
  };

  const renderRow = (entry: SplashScrambleLeaderboardEntry, sticky = false) => {
    const isCurrentUser = entry.userId === currentUserId;
    const isFriend = friendIds.has(entry.userId);
    const rowTone = isCurrentUser
      ? 'border-sky-300/50 bg-sky-300/10'
      : isFriend
        ? 'border-amber-300/50 bg-amber-300/10'
        : 'border-white/10 bg-slate-900/70';

    return (
      <div
        key={entry.id}
        onContextMenu={(event) => openContextMenu(event, entry)}
        className={`grid min-w-[42rem] cursor-context-menu grid-cols-[4rem_minmax(12rem,1fr)_5rem_6rem_7rem] items-center gap-3 border px-3 py-3 text-sm transition hover:border-white/35 hover:bg-slate-800/90  ${rowTone} ${sticky ? 'rounded-2xl' : 'rounded-xl'}`}
      >
        <span className="font-black text-amber-200">#{entry.position}</span>
        <span className="min-w-0 truncate font-bold" style={getChatNameStyle(entry.chatColor)}>
          {entry.username}{isCurrentUser ? ' (you)' : ''}
        </span>
        <span className="text-right font-semibold text-slate-200">{entry.moves}</span>
        <span className="text-right font-semibold text-slate-200">{formatTime(entry.completionTimeSeconds)}</span>
        <span className="text-right font-black text-white">{entry.completionScore.toLocaleString()}</span>
      </div>
    );
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="splash-scramble-daily-leaderboard-title"
        className="flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Daily Splash Scramble</p>
            <h2 id="splash-scramble-daily-leaderboard-title" className="mt-1 flex items-center gap-2 text-2xl font-black text-white">
              <Trophy size={22} className="text-amber-300" />
              Daily Leaderboard
            </h2>
            <p className="mt-2 text-sm text-slate-400">Complete a daily puzzle to earn a place on the board.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close daily leaderboard" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          <div className="min-w-[42rem]">
            <div className="sticky top-0 z-10 grid grid-cols-[4rem_minmax(12rem,1fr)_5rem_6rem_7rem] gap-3 border-b border-white/10 bg-slate-950 px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="flex items-center gap-1.5"><Hash size={14} />Rank</span>
              <span className="flex items-center gap-1.5"><UserRound size={14} />Username</span>
              <span className="flex items-center justify-end gap-1.5 text-right"><ArrowLeftRight size={14} />Moves</span>
              <span className="flex items-center justify-end gap-1.5 text-right"><Clock3 size={14} />Time</span>
              <span className="group relative flex items-center justify-end gap-1.5 text-right" title="Score = 250,000 - 250 per move - 25 per second.">
                <Trophy size={14} />Score<Info size={13} />
                <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-[0.68rem] font-semibold normal-case leading-5 tracking-normal text-slate-200  group-hover:block">
                  Score = 250,000 - 250 per move - 25 per second.
                </span>
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-400"><LoaderCircle size={18} className="animate-spin" />Loading leaderboard...</div>
            ) : error ? (
              <p className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</p>
            ) : snapshot.entries.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">No one has completed today&apos;s Splash Scramble yet. Click the &apos;Play Daily&apos; button to be the first!</p>
            ) : (
              <div className="mt-2 grid gap-2">{snapshot.entries.map((entry) => renderRow(entry))}</div>
            )}
          </div>
        </div>

        {snapshot.currentUserEntry && snapshot.currentUserEntry.position > 50 ? (
          <div className="border-t border-white/10 bg-slate-950 p-4 sm:p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Your position</p>
            <div className="overflow-x-auto">{renderRow(snapshot.currentUserEntry, true)}</div>
          </div>
        ) : null}
        {status ? <p className="border-t border-white/10 px-5 py-3 text-sm text-slate-300" aria-live="polite">{status}</p> : null}
      </section>

      {contextMenu ? createPortal(
        <div ref={contextMenuRef} onPointerDown={(event) => event.stopPropagation()} className="fixed z-[110] max-h-[calc(100dvh-1rem)] w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => { setContextMenu(null); onClose(); window.setTimeout(() => openPublicProfileOverlay(contextMenu.entry.username), 0); }} className="flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900">View Profile</button>
          {contextMenu.entry.userId !== currentUserId ? (
            <button type="button" onClick={() => void sendFriendRequest(contextMenu.entry)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10">
              <UserPlus size={15} />
              Send Friend Request
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
