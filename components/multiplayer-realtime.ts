import type { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeSubscriptionHandler = () => void | Promise<unknown>;

/**
 * Supabase can reconnect a channel without remounting the component. A fresh
 * snapshot after every successful subscription closes the gap between the
 * last received event and the reconnect, while the event handlers continue
 * to provide low-latency updates between snapshots.
 */
export function subscribeToRealtimeChannel(
  channel: RealtimeChannel,
  onSubscribed: RealtimeSubscriptionHandler,
) {
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    void Promise.resolve(onSubscribed()).catch(() => undefined);
  });
}
