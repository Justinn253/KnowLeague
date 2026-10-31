import type { Metadata } from 'next';
import { WoodcuttingGame } from '@/components/woodcutting-game';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Woodcutting Camp Companion',
  description: 'Manage KnowLeague lumberjacks, saplings, axes, and shared Discord Woodcutting rewards from the web.',
  path: '/games/woodcutting',
});

export default function WoodcuttingPage() {
  return <><GameStructuredData name="Woodcutting" path="/games/woodcutting" /><WoodcuttingGame /></>;
}
