'use client';

import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  discardStaleSessionAchievementProgress,
  flushAchievementProgressQueue,
  submitAchievementProgress,
} from '@/lib/achievement-client';
import {
  DETAILED_GAME_STATS_CHANGED_EVENT,
  loadDetailedGameStats,
} from '@/lib/game-storage';
import { subscribeToAuthSession } from '@/lib/auth-session-client';

const APP_TIME_STORAGE_PREFIX = 'knowleague:v1:achievement:session-time:';
const APP_SESSION_STORAGE_KEY = 'knowleague:v1:achievement:session-id';
const APP_TIME_SYNC_INTERVAL_SECONDS = 60;
const TRACK_INTERVAL_MS = 30_000;

type AppTimeState = {
  sessionId: string;
  activeSeconds: number;
};

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadSessionId() {
  try {
    const existing = window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) {
      return existing;
    }
    const sessionId = createSessionId();
    window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY, sessionId);
    return sessionId;
  } catch {
    return createSessionId();
  }
}

function loadAppTime(userId: string): AppTimeState {
  try {
    const raw = window.sessionStorage.getItem(`${APP_TIME_STORAGE_PREFIX}${userId}`);
    const parsed = raw ? JSON.parse(raw) as Partial<AppTimeState> : {};
    return {
      sessionId: typeof parsed.sessionId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(parsed.sessionId)
        ? parsed.sessionId
        : loadSessionId(),
      activeSeconds: Math.max(0, Math.floor(Number(parsed.activeSeconds) || 0)),
    };
  } catch {
    return { sessionId: loadSessionId(), activeSeconds: 0 };
  }
}

function saveAppTime(userId: string, state: AppTimeState) {
  try {
    window.sessionStorage.setItem(`${APP_TIME_STORAGE_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // The in-memory tracker continues to work if browser storage is unavailable.
  }
}

function clearAppTime(userId: string) {
  try {
    window.sessionStorage.removeItem(`${APP_TIME_STORAGE_PREFIX}${userId}`);
    window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
  } catch {
    // The in-memory tracker continues to work if browser storage is unavailable.
  }
}

export function CumulativeAchievementTracker() {
  const sessionRef = useRef<Session | null>(null);
  const activeSecondsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const lastTickAtRef = useRef<number | null>(null);
  const lastTimeSubmissionRef = useRef(0);
  const lastWinCountRef = useRef<number | null>(null);

  useEffect(() => {
    const submitTimeProgress = () => {
      if (!sessionRef.current || activeSecondsRef.current <= 0) {
        return;
      }

      const activeSeconds = activeSecondsRef.current;
      if (activeSeconds - lastTimeSubmissionRef.current < APP_TIME_SYNC_INTERVAL_SECONDS) {
        return;
      }

      lastTimeSubmissionRef.current = activeSeconds;
      void submitAchievementProgress([
        { achievementId: 'dedication', progress: activeSeconds, sessionId: sessionIdRef.current ?? undefined },
        { achievementId: 'anyone_there', progress: activeSeconds, sessionId: sessionIdRef.current ?? undefined },
        { achievementId: 'discord_sleep_caller', progress: activeSeconds, sessionId: sessionIdRef.current ?? undefined },
      ]);
    };

    const submitWinProgress = () => {
      if (!sessionRef.current) {
        return;
      }

      const totalWins = loadDetailedGameStats().totalWins;
      if (totalWins <= 0 || totalWins === lastWinCountRef.current) {
        return;
      }

      lastWinCountRef.current = totalWins;
      void submitAchievementProgress([{ achievementId: 'holy_tryhard', progress: totalWins }]);
    };

    const recordVisibleTime = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || !sessionRef.current) {
        lastTickAtRef.current = null;
        return;
      }

      if (lastTickAtRef.current === null) {
        lastTickAtRef.current = now;
        return;
      }

      const elapsedSeconds = Math.min(60, Math.max(0, Math.floor((now - lastTickAtRef.current) / 1000)));
      lastTickAtRef.current = now;
      if (elapsedSeconds <= 0) {
        return;
      }

      activeSecondsRef.current += elapsedSeconds;
      const userId = sessionRef.current.user.id;
      saveAppTime(userId, {
        sessionId: sessionIdRef.current ?? loadSessionId(),
        activeSeconds: activeSecondsRef.current,
      });
      submitTimeProgress();
    };

    const handleVisibilityChange = () => {
      recordVisibleTime();
      if (document.visibilityState === 'visible') {
        void flushAchievementProgressQueue();
        submitWinProgress();
      }
    };

    const handleOnline = () => {
      void flushAchievementProgressQueue();
      submitWinProgress();
      submitTimeProgress();
    };

    const handlePageHide = () => {
      recordVisibleTime();
      void flushAchievementProgressQueue();
    };

    const handleDetailedStatsChanged = () => {
      submitWinProgress();
    };

    const handleSession = (session: Session | null) => {
      const previousSession = sessionRef.current;
      if (previousSession && previousSession.user.id !== session?.user.id) {
        recordVisibleTime();
        clearAppTime(previousSession.user.id);
      }

      if (!session && previousSession) {
        clearAppTime(previousSession.user.id);
      }

      sessionRef.current = session;
      lastTickAtRef.current = session && document.visibilityState === 'visible' ? Date.now() : null;
      lastWinCountRef.current = null;
      if (!session) {
        sessionIdRef.current = null;
        activeSecondsRef.current = 0;
        lastTimeSubmissionRef.current = 0;
        return;
      }

      const savedTime = loadAppTime(session.user.id);
      sessionIdRef.current = savedTime.sessionId;
      activeSecondsRef.current = savedTime.activeSeconds;
      lastTimeSubmissionRef.current = 0;
      discardStaleSessionAchievementProgress(session.user.id, savedTime.sessionId);
      void flushAchievementProgressQueue();
      submitWinProgress();
      submitTimeProgress();
    };

    const unsubscribeFromAuthSession = subscribeToAuthSession(handleSession);
    const interval = window.setInterval(() => {
      recordVisibleTime();
      void flushAchievementProgressQueue();
      submitWinProgress();
      submitTimeProgress();
    }, TRACK_INTERVAL_MS);

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener(DETAILED_GAME_STATS_CHANGED_EVENT, handleDetailedStatsChanged);
    return () => {
      unsubscribeFromAuthSession();
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener(DETAILED_GAME_STATS_CHANGED_EVENT, handleDetailedStatsChanged);
    };
  }, []);

  return null;
}
