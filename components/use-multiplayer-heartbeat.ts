'use client';

import { useEffect, useRef } from 'react';
import { MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';

type UseMultiplayerHeartbeatOptions = {
  enabled: boolean;
  onHeartbeat: () => void | Promise<void>;
  intervalMs?: number;
  onReconcile?: () => void | Promise<void>;
  reconcileIntervalMs?: number;
};

/**
 * Maintains multiplayer presence for the lifetime of the game page. Browser
 * visibility changes are not treated as disconnects: players may tab away and
 * return without forfeiting or entering a reconnect window. Active matches
 * may also provide a bounded reconciliation callback so a missed Realtime
 * event is repaired without turning every heartbeat into a full lobby read.
 */
export function useMultiplayerHeartbeat({
  enabled,
  onHeartbeat,
  intervalMs = MULTIPLAYER_HEARTBEAT_INTERVAL_MS,
  onReconcile,
  reconcileIntervalMs = 60_000,
}: UseMultiplayerHeartbeatOptions) {
  const onHeartbeatRef = useRef(onHeartbeat);
  const onReconcileRef = useRef(onReconcile);
  const hasReconcile = Boolean(onReconcile);

  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat;
  }, [onHeartbeat]);

  useEffect(() => {
    onReconcileRef.current = onReconcile;
  }, [onReconcile]);

  useEffect(() => {
    if (!enabled) return undefined;

    let heartbeatInFlight = false;
    let reconcileInFlight = false;
    const sendHeartbeat = () => {
      if (heartbeatInFlight) return;

      heartbeatInFlight = true;
      void Promise.resolve(onHeartbeatRef.current())
        .catch(() => undefined)
        .finally(() => {
          heartbeatInFlight = false;
        });
    };
    const reconcile = () => {
      if (reconcileInFlight || !onReconcileRef.current) return;

      reconcileInFlight = true;
      void Promise.resolve(onReconcileRef.current())
        .catch(() => undefined)
        .finally(() => {
          reconcileInFlight = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        reconcile();
      }
    };
    const handleOnline = () => {
      sendHeartbeat();
      reconcile();
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, intervalMs);
    const reconcileInterval = onReconcileRef.current
      ? window.setInterval(reconcile, reconcileIntervalMs)
      : null;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(interval);
      if (reconcileInterval !== null) window.clearInterval(reconcileInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, hasReconcile, intervalMs, reconcileIntervalMs]);
}
