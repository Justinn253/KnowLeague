import type { Metadata } from 'next';
import { Randodraft } from '@/components/randodraft';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Randodraft League Team Builder',
  description: "Choose Summoner's Rift or ARAM, then roll champions and build classes for a five-champion League team.",
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
