import type { Metadata } from 'next';
import { RiftboundProfile } from '@/components/riftbound-profile';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: { username: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  const username = decodeURIComponent(params.username);
  return createPageMetadata({
    title: `${username}'s Riftbound Profile | KnowLeague`,
    description: `View ${username}'s public Riftbound collection, sets, decks, favorites, wishlist, and community posts.`,
    path: `/riftbound/profile/${encodeURIComponent(params.username)}`,
  });
}

export default function PublicRiftboundProfilePage({ params }: PageProps) {
  return <RiftboundProfile username={params.username} />;
}
