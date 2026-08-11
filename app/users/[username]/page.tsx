import type { Metadata } from 'next';
import { PublicProfileScreen } from '@/components/public-profile-screen';
import { createPageMetadata } from '@/lib/seo';

function decodeUsername(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  const username = decodeUsername(params.username);
  const displayName = username || 'League player';

  return createPageMetadata({
    title: `${displayName}'s KnowLeague Profile`,
    description: `View ${displayName}'s public KnowLeague profile and League of Legends activity.`,
    path: `/users/${encodeURIComponent(username || params.username)}`,
  });
}

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return <PublicProfileScreen key={params.username} username={params.username} />;
}
