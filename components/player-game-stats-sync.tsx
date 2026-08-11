'use client';

import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  createEmptyPlayerStats,
  DETAILED_GAME_STATS_CHANGED_EVENT,
  loadPlayerGameStats,
  loadDetailedGameStats,
  mergeDetailedGameStats,
  mergePlayerGameStats,
  PLAYER_GAME_STATS_CHANGED_EVENT,
  savePlayerGameStats,
  saveDetailedGameStats,
  STREAK_GAME_IDS,
  type PlayerGameStats,
  type PlayerGameStatsByGame,
  type StreakGameId,
} from '@/lib/game-storage';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getProfileBootstrap } from '@/lib/profile-bootstrap-client';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

function getLocalStatsByGame(): PlayerGameStatsByGame {
  return Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [gameId, loadPlayerGameStats(gameId)]));
}

function serializeStatsByGame(stats: PlayerGameStatsByGame) {
  return JSON.stringify(STREAK_GAME_IDS.map((gameId) => [gameId, stats[gameId] ?? null]));
}

export function PlayerGameStatsSync() {
  const sessionRef = useRef<Session | null>(null);
  const hydratingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saveAccountStats = (stats: PlayerGameStatsByGame, detailedStats = loadDetailedGameStats()) => {
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
          body: JSON.stringify({ stats, detailedStats }),
        }).catch(() => undefined);
      }, 250);
    };

    const hydrateAccountStats = async (session: Session | null) => {
      sessionRef.current = session;
      if (!session) {
        return;
      }

      try {
        const data = await getProfileBootstrap(session);
        const serverStats = data.playerGameStats;
        const serverDetailedStats = data.detailedGameStats;
        const localDetailedStats = loadDetailedGameStats();
        const mergedStats = Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [
          gameId,
          data.playerGameStatsResetAt?.[gameId]
            ? (serverStats[gameId] ?? createEmptyPlayerStats(gameId))
            : mergePlayerGameStats(gameId, loadPlayerGameStats(gameId), serverStats[gameId]),
        ])) as PlayerGameStatsByGame;
        const mergedDetailedStats = mergeDetailedGameStats(localDetailedStats, serverDetailedStats);
        const detailedResetAt = data.detailedGameStatsResetAt ?? {};
        if (detailedResetAt['ability-blitz']) {
          mergedDetailedStats.abilityBlitz = serverDetailedStats.abilityBlitz;
        }
        if (detailedResetAt['skin-champion']) {
          mergedDetailedStats.skinChampion = serverDetailedStats.skinChampion;
        }
        if (detailedResetAt.skincognito) {
          mergedDetailedStats.skincognito = serverDetailedStats.skincognito;
        }
        if (detailedResetAt.all) {
          mergedDetailedStats.totalWins = serverDetailedStats.totalWins;
          mergedDetailedStats.recordedWinIds = serverDetailedStats.recordedWinIds;
        }

        hydratingRef.current = true;
        STREAK_GAME_IDS.forEach((gameId) => {
          const stats = mergedStats[gameId];
          if (stats) {
            savePlayerGameStats(stats);
          }
        });
        saveDetailedGameStats(mergedDetailedStats);
        hydratingRef.current = false;
        if (
          serializeStatsByGame(mergedStats) !== serializeStatsByGame(serverStats)
          || JSON.stringify(mergedDetailedStats) !== JSON.stringify(serverDetailedStats)
        ) {
          saveAccountStats(mergedStats, mergedDetailedStats);
        }
      } catch {
        hydratingRef.current = false;
      }
    };

    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const unsubscribeFromAuthSession = subscribeToAuthSession((session) => {
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

    const handleDetailedStatsChanged = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (hydratingRef.current || !detail || typeof detail !== 'object') return;
      saveAccountStats(getLocalStatsByGame(), detail as Parameters<typeof saveDetailedGameStats>[0]);
    };

    window.addEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);
    window.addEventListener(DETAILED_GAME_STATS_CHANGED_EVENT, handleDetailedStatsChanged);

    return () => {
      unsubscribeFromAuthSession();
      window.removeEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);
      window.removeEventListener(DETAILED_GAME_STATS_CHANGED_EVENT, handleDetailedStatsChanged);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return null;
}
