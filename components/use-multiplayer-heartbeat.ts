'use client';

import { useEffect, useRef } from 'react';
import { MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';

type UseMultiplayerHeartbeatOptions = {
  enabled: boolean;
  onHeartbeat: () => void | Promise<void>;
  intervalMs?: number;
};

/**
 * Maintains multiplayer presence while a game tab is visible. Background tabs
 * resume with an immediate heartbeat instead of continuing periodic requests.
 */
export function useMultiplayerHeartbeat({
  enabled,
  onHeartbeat,
  intervalMs = MULTIPLAYER_HEARTBEAT_INTERVAL_MS,
}: UseMultiplayerHeartbeatOptions) {
  const onHeartbeatRef = useRef(onHeartbeat);

  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat;
  }, [onHeartbeat]);

  useEffect(() => {
    if (!enabled) return undefined;

    let heartbeatInFlight = false;
    const sendHeartbeat = () => {
      if (document.visibilityState === 'hidden' || heartbeatInFlight) return;

      heartbeatInFlight = true;
      void Promise.resolve(onHeartbeatRef.current())
        .catch(() => undefined)
        .finally(() => {
          heartbeatInFlight = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, intervalMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
