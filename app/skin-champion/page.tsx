import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { SkinChampion } from '@/components/skin-champion';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Skin Champion League Skin Line Quiz',
  description: 'Identify League of Legends skin lines from visual clues in this fast-paced quiz.',
  path: '/skin-champion',
});

export default function SkinChampionPage() {
  return (
    <>
      <GameStructuredData name="Skin Champion" path="/skin-champion" />
      <SkinChampion />
    </>
  );
}
