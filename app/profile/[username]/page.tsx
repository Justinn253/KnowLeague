import { PublicProfileScreen } from '@/components/public-profile-screen';

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  return <PublicProfileScreen username={params.username} />;
}
