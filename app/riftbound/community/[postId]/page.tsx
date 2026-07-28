import type { Metadata } from 'next';
import { RiftboundCommunityPost } from '@/components/riftbound-community-post';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: { postId: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  return createPageMetadata({
    title: 'Riftbound Community Post | KnowLeague',
    description: 'View a shared Riftbound collection, set, or deck on KnowLeague.',
    path: `/riftbound/community/${encodeURIComponent(params.postId)}`,
  });
}

export default function RiftboundCommunityPostPage({ params }: PageProps) {
  return <RiftboundCommunityPost postId={params.postId} />;
}
