import type { Metadata } from 'next';
import { RiftboundCommunityPost } from '@/components/riftbound-community-post';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: { postId: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  return createPageMetadata({
    title: 'Riftbound Community Post',
    description: 'Explore a shared Riftbound collection, set, or deck build with its card list and community discussion on KnowLeague.',
    path: `/riftbound/community/${encodeURIComponent(params.postId)}`,
    keywords: ['Riftbound community post', 'Riftbound deck build', 'Riftbound collection', 'Riftbound decklist'],
  });
}

export default function RiftboundCommunityPostPage({ params }: PageProps) {
  return <RiftboundCommunityPost postId={params.postId} />;
}
