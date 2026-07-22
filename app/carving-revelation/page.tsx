import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { CarvingRevelation } from '@/components/carving-revelation';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Carving Revelation Multiplayer Skin Line Game',
  description: 'Reveal a hidden League of Legends skin line piece by piece and guess it before your opponents.',
  path: '/carving-revelation',
});

export default function CarvingRevelationPage() {
  return (
    <>
      <GameStructuredData name="Carving Revelation" path="/carving-revelation" />
      <CarvingRevelation />
    </>
  );
}
