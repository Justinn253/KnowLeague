import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Home',
  description: 'Explore KnowLeague games, League account tools, and the Riftbound community.',
  path: '/',
});

export default function HomePage() {
  return <LandingPage />;
}
