import type { Metadata } from 'next';
import { AugmentCommunity } from '@/components/augment-community';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'ARAM Mayhem Augment Community',
  description: 'Browse, search, sort, and rate account-created ARAM Mayhem augments.',
  path: '/augment-builder',
});

export default function AugmentCommunityPage() {
  return <AugmentCommunity />;
}
