import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { Skindle } from '@/components/skindle';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Skindle Daily League Skin Puzzle',
  description: 'Solve a new League of Legends skin puzzle each day with clues revealed by every guess.',
  path: '/skindle',
});

export default function SkindlePage() {
  return (
    <>
      <GameStructuredData name="Skindle" path="/skindle" />
      <Skindle />
    </>
  );
}
