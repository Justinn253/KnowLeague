'use client';

import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  loadPlayerGameStats,
  mergePlayerGameStats,
  PLAYER_GAME_STATS_CHANGED_EVENT,
  savePlayerGameStats,
  STREAK_GAME_IDS,
  type PlayerGameStats,
  type PlayerGameStatsByGame,
  type StreakGameId,
} from '@/lib/game-storage';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type PlayerGameStatsResponse = {
  stats?: PlayerGameStatsByGame;
};

function getLocalStatsByGame(): PlayerGameStatsByGame {
  return Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [gameId, loadPlayerGameStats(gameId)]));
}

export function PlayerGameStatsSync() {
  const sessionRef = useRef<Session | null>(null);
  const hydratingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saveAccountStats = (stats: PlayerGameStatsByGame) => {
      const token = sessionRef.current?.access_token;
      if (!token || hydratingRef.current) {
        return;
      }

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        void fetch('/api/profile/player-game-stats', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ stats }),
        }).catch(() => undefined);
      }, 250);
    };

    const hydrateAccountStats = async (session: Session | null) => {
      sessionRef.current = session;
      if (!session) {
        return;
      }

      try {
        const response = await fetch('/api/profile/player-game-stats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          saveAccountStats(getLocalStatsByGame());
          return;
        }

        const data = await response.json() as PlayerGameStatsResponse;
        const serverStats = data.stats ?? {};
        const mergedStats = Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [
          gameId,
          mergePlayerGameStats(gameId, loadPlayerGameStats(gameId), serverStats[gameId]),
        ])) as PlayerGameStatsByGame;

        hydratingRef.current = true;
        STREAK_GAME_IDS.forEach((gameId) => {
          const stats = mergedStats[gameId];
          if (stats) {
            savePlayerGameStats(stats);
          }
        });
        hydratingRef.current = false;
        saveAccountStats(mergedStats);
      } catch {
        hydratingRef.current = false;
      }
    };

    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      void hydrateAccountStats(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateAccountStats(session);
    });

    const handleStatsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ gameId?: StreakGameId; stats?: PlayerGameStats }>).detail;
      if (!detail?.gameId || !detail.stats) {
        saveAccountStats(getLocalStatsByGame());
        return;
      }

      saveAccountStats({ [detail.gameId]: detail.stats });
    };

    window.addEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return null;
}
