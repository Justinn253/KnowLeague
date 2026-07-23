import type { Metadata } from 'next';
import { PublicProfileScreen } from '@/components/public-profile-screen';
import { createPageMetadata } from '@/lib/seo';

export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  const username = decodeURIComponent(params.username).trim();
  const displayName = username || 'League player';

  return createPageMetadata({
    title: `${displayName}'s KnowLeague Profile`,
    description: `View ${displayName}'s public KnowLeague profile and League of Legends activity.`,
    path: `/profile/${encodeURIComponent(params.username)}`,
  });
}

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  return <PublicProfileScreen username={params.username} />;
}
