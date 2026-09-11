import type { Metadata } from 'next';
import { Randodraft } from '@/components/randodraft';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Randodraft League Team Builder',
  description: 'Roll champions, lanes, and build types to draft a five-champion League of Legends team.',
  path: '/randodraft',
});

export default function RandodraftPage() {
  return (
    <>
      <GameStructuredData name="Randodraft" path="/randodraft" />
      <Randodraft />
    </>
  );
}
