import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RiftboundCardGrid } from '@/components/riftbound-card-grid';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#030712]" aria-label="Loading Riftbound collection" />}>
      <RiftboundCardGrid />
    </Suspense>
  );
}
