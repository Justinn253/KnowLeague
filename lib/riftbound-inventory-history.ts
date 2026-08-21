import type { RiftboundSaleFinish } from '@/lib/riftbound-sales';

export type RiftboundInventoryHistoryEventType = 'inventory_update' | 'sale';

export type RiftboundInventoryHistoryItem = {
  id: string;
  card_id: string;
  finish: RiftboundSaleFinish;
  delta: number;
  sale_price_cents: number | null;
};

export type RiftboundInventoryHistoryGroup = {
  id: string;
  event_type: RiftboundInventoryHistoryEventType;
  occurred_at: string;
  sale_id: string | null;
  items: RiftboundInventoryHistoryItem[];
};
