import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { SplashScramble } from '@/components/splash-scramble';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Splash Scramble League Skin Puzzle',
  description: 'Rebuild a scrambled League of Legends splash art by swapping tiles into place.',
  path: '/splash-scramble',
});

export default function SplashScramblePage() {
  return (
    <>
      <GameStructuredData name="Splash Scramble" path="/splash-scramble" />
      <SplashScramble />
    </>
  );
}
