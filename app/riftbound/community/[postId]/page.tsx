import type { Metadata } from 'next';
import { RiftboundCommunityPost } from '@/components/riftbound-community-post';
import { createPageMetadata } from '@/lib/seo';

type PageProps = {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ returnTo?: string | string[] }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  return createPageMetadata({
    title: 'Riftbound Community Post',
    description: 'Explore a shared Riftbound collection, set, or deck build with its card list and community discussion on KnowLeague.',
    path: `/riftbound/community/${encodeURIComponent(params.postId)}`,
    keywords: ['Riftbound community post', 'Riftbound deck build', 'Riftbound collection', 'Riftbound decklist'],
  });
}

export default async function RiftboundCommunityPostPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const returnTo = Array.isArray(searchParams?.returnTo) ? searchParams.returnTo[0] : searchParams?.returnTo;
  return <RiftboundCommunityPost postId={params.postId} returnTo={returnTo} />;
}
