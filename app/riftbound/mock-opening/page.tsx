import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RiftboundMockOpening } from '@/components/riftbound-mock-opening';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Riftbound Mock Opening');

export default function RiftboundMockOpeningPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#030712]" aria-label="Loading Riftbound Mock Opening" />}>
      <RiftboundMockOpening />
    </Suspense>
  );
}
