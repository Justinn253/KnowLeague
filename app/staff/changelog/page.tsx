import type { Metadata } from 'next';
import { StaffChangelogScreen } from '@/components/staff-changelog-screen';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Internal Staff Change Log');

export default function StaffChangelogPage() {
  return <StaffChangelogScreen />;
}
