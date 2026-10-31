import type { Metadata } from 'next';
import { FishingGame } from '@/components/fishing-game';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Fishing Fleet Companion',
  description: 'Launch KnowLeague Fishing expeditions, fit your crew, and manage shared Discord progression from the web.',
  path: '/games/fishing',
});

export default function FishingPage() {
  return <><GameStructuredData name="Fishing" path="/games/fishing" /><FishingGame /></>;
}
