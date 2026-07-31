import type { Metadata } from 'next';
import { RiftboundProfile } from '@/components/riftbound-profile';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: { username: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  const username = decodeURIComponent(params.username);
  return createPageMetadata({
    title: `${username}'s Riftbound Profile`,
    description: `View ${username}'s public Riftbound collection, saved sets, decklists, favorite cards, wishlist, and community posts on KnowLeague.`,
    path: `/riftbound/profile/${encodeURIComponent(params.username)}`,
    keywords: ['Riftbound profile', 'Riftbound collection', 'Riftbound decklists', 'Riftbound card tracker'],
  });
}

export default function PublicRiftboundProfilePage({ params }: PageProps) {
  return <RiftboundProfile username={params.username} />;
}
