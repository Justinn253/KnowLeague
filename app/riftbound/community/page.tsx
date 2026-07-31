import type { Metadata } from 'next';
import { RiftboundCommunity } from '@/components/riftbound-community';
import { RiftboundCommunityStructuredData } from '@/components/riftbound-seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Riftbound Community: Deck Builds and Collections',
  description: 'Explore Riftbound deck builds, collections, questions, and community discussion on KnowLeague. Filter posts by set, card, sideboard, and popularity.',
  path: '/riftbound/community',
  keywords: [
    'Riftbound community',
    'Riftbound deck builds',
    'Riftbound decklists',
    'Riftbound collections',
    'Riftbound TCG discussion',
  ],
});

export default function RiftboundCommunityPage() {
  return (
    <>
      <RiftboundCommunityStructuredData />
      <RiftboundCommunity />
    </>
  );
}
