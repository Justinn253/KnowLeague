import type { Metadata } from 'next';
import { RiftboundCardGrid } from '@/components/riftbound-card-grid';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return <RiftboundCardGrid />;
}
