import type { Metadata } from 'next';
import { RiftboundCollectionShare } from '@/components/riftbound-collection-share';

export const metadata: Metadata = {
  title: 'Shared Riftbound Collection',
};

export default function SharedRiftboundCollectionPage() {
  return <RiftboundCollectionShare />;
}
