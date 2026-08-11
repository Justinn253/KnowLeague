import type { Metadata } from 'next';
import GamesHome from '@/components/games-home';
import { WebApplicationStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'KnowLeague Games',
  description: 'Play KnowLeague solo and multiplayer League of Legends games.',
  path: '/games',
});

export default function GamesPage() {
  return (
    <>
      <WebApplicationStructuredData name="KnowLeague Games" path="/games" />
      <GamesHome />
    </>
  );
}
