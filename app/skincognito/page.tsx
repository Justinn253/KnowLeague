import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { Skincognito } from '@/components/skincognito';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Skincognito Multiplayer Skin Guessing Game',
  description: 'Guess your opponent’s League of Legends skin before they uncover yours.',
  path: '/skincognito',
});

export default function SkincognitoPage() {
  return (
    <>
      <GameStructuredData name="Skincognito" path="/skincognito" />
      <Skincognito />
    </>
  );
}
