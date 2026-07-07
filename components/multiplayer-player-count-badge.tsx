'use client';

import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import {
  MULTIPLAYER_PLAYER_COUNT_REFRESH_INTERVAL_MS,
  getPlaceholderMultiplayerPlayerCounts,
  isMultiplayerPlayerCountsEnabled,
  multiplayerPlayerCountGameIds,
  type MultiplayerPlayerCountGameId,
  type MultiplayerPlayerCounts,
  type MultiplayerPlayerCountsPayload,
} from '@/lib/multiplayer-player-counts';

type MultiplayerPlayerCountBadgeProps = {
  gameId: MultiplayerPlayerCountGameId;
  className?: string;
};

type PlayerCountSnapshot = {
  enabled: boolean;
  placeholder: boolean;
  counts: MultiplayerPlayerCounts;
  updatedAt: number;
};

const featureEnabled = isMultiplayerPlayerCountsEnabled();
const listeners = new Set<() => void>();

let snapshot: PlayerCountSnapshot = {
  enabled: featureEnabled,
  placeholder: true,
  counts: featureEnabled ? getPlaceholderMultiplayerPlayerCounts() : {},
  updatedAt: 0,
};
let refreshPromise: Promise<void> | null = null;
let intervalId: number | null = null;

function emitPlayerCountChange() {
  listeners.forEach((listener) => listener());
}

function normalizeCounts(counts: MultiplayerPlayerCounts): MultiplayerPlayerCounts {
  return multiplayerPlayerCountGameIds.reduce<MultiplayerPlayerCounts>((normalized, gameId) => {
    const count = counts[gameId];
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      normalized[gameId] = Math.floor(count);
    }
    return normalized;
  }, {});
}

async function refreshPlayerCounts() {
  if (!featureEnabled) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch('/api/multiplayer/player-counts', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as MultiplayerPlayerCountsPayload;
      snapshot = {
        enabled: payload.enabled,
        placeholder: payload.placeholder,
        counts: normalizeCounts(payload.counts),
        updatedAt: Date.now(),
      };
    })
    .catch(() => {
      snapshot = { ...snapshot, updatedAt: Date.now() };
    })
    .finally(() => {
      refreshPromise = null;
      emitPlayerCountChange();
    });

  return refreshPromise;
}

function subscribeToPlayerCounts(listener: () => void) {
  listeners.add(listener);

  if (featureEnabled && listeners.size === 1) {
    void refreshPlayerCounts();
    intervalId = window.setInterval(() => {
      void refreshPlayerCounts();
    }, MULTIPLAYER_PLAYER_COUNT_REFRESH_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function MultiplayerPlayerCountBadge({ gameId, className }: MultiplayerPlayerCountBadgeProps) {
  const [currentSnapshot, setCurrentSnapshot] = useState(snapshot);

  useEffect(() => subscribeToPlayerCounts(() => setCurrentSnapshot({ ...snapshot })), []);

  const count = currentSnapshot.counts[gameId];
  if (!currentSnapshot.enabled || typeof count !== 'number') {
    return null;
  }

  return (
    <span
      className={[
        'inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/75 px-3 text-xs font-black text-slate-100 shadow-lg shadow-slate-950/25 backdrop-blur',
        className,
      ].filter(Boolean).join(' ')}
      title={currentSnapshot.placeholder ? 'Preview player count placeholder' : 'Players currently in matches'}
      aria-label={`${count} players currently in matches`}
    >
      <UsersRound size={14} className="text-amber-300" aria-hidden="true" />
      <span>{count}</span>
    </span>
  );
}
