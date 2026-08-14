export const RIFTBOUND_BINDER_PAGE_COUNT = 20;
export const RIFTBOUND_BINDER_SLOT_COUNT = 9;
export const RIFTBOUND_FREE_BINDER_LIMIT = 4;
export const RIFTBOUND_PREMIUM_BINDER_LIMIT = 12;

export type RiftboundBinderFinish = 'normal' | 'foil';

export type RiftboundBinderSlot = {
  slot_index: number;
  card_id: string;
  finish: RiftboundBinderFinish;
};

export type RiftboundBinderPage = {
  id: string;
  page_number: number;
  name: string;
  slots: RiftboundBinderSlot[];
};

export type RiftboundBinder = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  pages: RiftboundBinderPage[];
};
