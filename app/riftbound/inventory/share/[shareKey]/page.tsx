import type { Metadata } from 'next';
import { RiftboundCollectionShare } from '@/components/riftbound-collection-share';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Shared Riftbound Collection');

export default async function SharedRiftboundCollectionKeyPage(props: { params: Promise<{ shareKey: string }> }) {
  const params = await props.params;
  return <RiftboundCollectionShare shareKey={params.shareKey} />;
}
