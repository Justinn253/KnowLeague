import type { Metadata } from 'next';
import { RiftboundProfile } from '@/components/riftbound-profile';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const username = decodeURIComponent(params.username);
  return createPageMetadata({
    title: `${username}'s Riftbound Profile`,
    description: `View ${username}'s public Riftbound collection, saved sets, decklists, favorite cards, wishlist, and community posts on KnowLeague.`,
    path: `/riftbound/profile/${encodeURIComponent(params.username)}`,
    keywords: ['Riftbound profile', 'Riftbound collection', 'Riftbound decklists', 'Riftbound card tracker'],
  });
}

export default async function PublicRiftboundProfilePage(props: PageProps) {
  const params = await props.params;
  return <RiftboundProfile username={params.username} />;
}
