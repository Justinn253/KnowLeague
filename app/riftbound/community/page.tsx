import type { Metadata } from 'next';
import { RiftboundCommunity } from '@/components/riftbound-community';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Riftbound Community | KnowLeague',
  description: 'Discover shared Riftbound collections, sets, and decks from the KnowLeague community.',
  path: '/riftbound/community',
});

export default function RiftboundCommunityPage() {
  return <RiftboundCommunity />;
}
