import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing-page';
import { HomeContent } from '@/components/public-site-content';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Home',
  description: 'Explore KnowLeague games, League account tools, and the Riftbound community.',
  path: '/',
});

export default function HomePage() {
  return (
    <>
      <LandingPage />
      <HomeContent />
    </>
  );
}
