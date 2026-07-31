import type { Metadata } from 'next';
import { RiftboundSharedDeckDirectory } from '@/components/riftbound-shared-deck-directory';
import { RiftboundSharedDecksStructuredData } from '@/components/riftbound-seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Shared Riftbound Decks',
  description: 'Browse shared Riftbound decklists, open complete deck views, and compare community deck ideas on KnowLeague.',
  path: '/riftbound/community/decks',
  keywords: [
    'shared Riftbound decks',
    'Riftbound decklists',
    'Riftbound community decks',
    'Riftbound deck builds',
  ],
});

export default function RiftboundCommunityDecksPage() {
  return (
    <>
      <RiftboundSharedDecksStructuredData />
      <RiftboundSharedDeckDirectory />
    </>
  );
}
