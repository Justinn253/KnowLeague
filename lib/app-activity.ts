import { useSyncExternalStore } from 'react';

export const APP_INACTIVITY_TIMEOUT_MS = 5 * 60_000;

export type AppActivitySnapshot = {
  isActive: boolean;
  isVisible: boolean;
};

type AppActivityEvaluation = {
  isVisible: boolean;
  isWindowFocused: boolean;
  lastActivityAt: number;
  now: number;
};

type AppActivityListener = (activity: AppActivitySnapshot) => void;

const SERVER_SNAPSHOT: AppActivitySnapshot = {
  isActive: true,
  isVisible: true,
};

const listeners = new Set<AppActivityListener>();
let snapshot: AppActivitySnapshot = SERVER_SNAPSHOT;
let trackingStarted = false;
let windowFocused = true;
let lastActivityAt = 0;
let inactivityTimeout: number | null = null;

export function isAppActivityActive({
  isVisible,
  isWindowFocused,
  lastActivityAt: activityAt,
  now,
}: AppActivityEvaluation) {
  return isVisible
    && isWindowFocused
    && now >= activityAt
    && now - activityAt < APP_INACTIVITY_TIMEOUT_MS;
}

function emitSnapshot(nextSnapshot: AppActivitySnapshot) {
  if (snapshot.isActive === nextSnapshot.isActive && snapshot.isVisible === nextSnapshot.isVisible) {
    return;
  }

  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener(snapshot));
}

function clearInactivityTimeout() {
  if (inactivityTimeout !== null) {
    window.clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }
}

function scheduleInactivityTimeout() {
  clearInactivityTimeout();
  if (!snapshot.isActive || !snapshot.isVisible) {
    return;
  }

  const remainingMs = Math.max(0, APP_INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityAt));
  inactivityTimeout = window.setTimeout(() => {
    inactivityTimeout = null;
    if (isAppActivityActive({
      isVisible: document.visibilityState === 'visible',
      isWindowFocused: windowFocused,
      lastActivityAt,
      now: Date.now(),
    })) {
      scheduleInactivityTimeout();
      return;
    }

    emitSnapshot({
      isActive: false,
      isVisible: document.visibilityState === 'visible',
    });
  }, remainingMs);
}

function markActivity() {
  if (document.visibilityState !== 'visible' || !windowFocused) {
    return;
  }

  lastActivityAt = Date.now();
  emitSnapshot({ isActive: true, isVisible: true });
  scheduleInactivityTimeout();
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    clearInactivityTimeout();
    emitSnapshot({ isActive: false, isVisible: false });
    return;
  }

  markActivity();
}

function handleWindowBlur() {
  windowFocused = false;
  clearInactivityTimeout();
  emitSnapshot({
    isActive: false,
    isVisible: document.visibilityState === 'visible',
  });
}

function handleWindowFocus() {
  windowFocused = true;
  markActivity();
}

function startTracking() {
  if (trackingStarted || typeof window === 'undefined') {
    return;
  }

  trackingStarted = true;
  windowFocused = true;
  lastActivityAt = Date.now();
  snapshot = {
    isActive: document.visibilityState === 'visible',
    isVisible: document.visibilityState === 'visible',
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('pointerdown', markActivity);
  window.addEventListener('keydown', markActivity);
  window.addEventListener('touchstart', markActivity, { passive: true });
  window.addEventListener('wheel', markActivity, { passive: true });
  window.addEventListener('scroll', markActivity, { passive: true });
  scheduleInactivityTimeout();
}

export function subscribeToAppActivity(listener: AppActivityListener) {
  startTracking();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppActivitySnapshot() {
  return snapshot;
}

function subscribeToReactAppActivity(listener: () => void) {
  return subscribeToAppActivity(() => listener());
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useAppActivity() {
  return useSyncExternalStore(subscribeToReactAppActivity, getAppActivitySnapshot, getServerSnapshot);
}
