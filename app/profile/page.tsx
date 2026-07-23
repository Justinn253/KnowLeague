import type { Metadata } from 'next';
import { ProfileScreen } from '@/components/profile-screen';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Your KnowLeague profile');

export default function ProfilePage() {
  return <ProfileScreen />;
}
