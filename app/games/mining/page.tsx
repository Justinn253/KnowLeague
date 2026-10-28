import type { Metadata } from 'next';
import { MiningGame } from '@/components/mining-game';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Mining Expedition Companion',
  description: 'Manage KnowLeague Mining expeditions, resources, upgrades, and shop progress from the web.',
  path: '/games/mining',
});

export default function MiningPage() {
  return (
    <>
      <GameStructuredData name="Mining" path="/games/mining" />
      <MiningGame />
    </>
  );
}
