import type { Metadata } from 'next';
import { RiftboundProfile } from '@/components/riftbound-profile';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('My Riftbound Profile');

export default function RiftboundProfilePage() {
  return <RiftboundProfile />;
}
