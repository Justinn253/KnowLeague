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

export async function generateMetadata(props: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const params = await props.params;
  const username = decodeUsername(params.username);
  const displayName = username || 'League player';

  return createPageMetadata({
    title: `${displayName}'s KnowLeague Profile`,
    description: `View ${displayName}'s public KnowLeague profile and League of Legends activity.`,
    path: `/users/${encodeURIComponent(username || params.username)}`,
  });
}

export default async function UserProfilePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  return <PublicProfileScreen key={params.username} username={params.username} />;
}
