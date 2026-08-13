import type { Session } from '@supabase/supabase-js';
import { createRiftboundShare } from '@/lib/riftbound-community-client';
import type { RiftboundShareSnapshot } from '@/lib/riftbound-share-types';

export function getRiftboundSharePageUrl(shareKey: string) {
  if (typeof window === 'undefined') return `/riftbound/inventory/share/${encodeURIComponent(shareKey)}`;
  return `${window.location.origin}/riftbound/inventory/share/${encodeURIComponent(shareKey)}`;
}

export async function createRiftboundShareUrl(snapshot: RiftboundShareSnapshot, session?: Session | null) {
  const response = await createRiftboundShare(snapshot, session);
  return getRiftboundSharePageUrl(response.shareKey);
}
