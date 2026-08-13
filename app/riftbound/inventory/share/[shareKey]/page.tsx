import type { Metadata } from 'next';
import { RiftboundCollectionShare } from '@/components/riftbound-collection-share';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Shared Riftbound Collection');

export default function SharedRiftboundCollectionKeyPage({ params }: { params: { shareKey: string } }) {
  return <RiftboundCollectionShare shareKey={params.shareKey} />;
}
