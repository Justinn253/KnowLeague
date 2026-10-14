import type { Metadata } from 'next';
import { ChampionDirectory } from '@/components/champion-directory';
import { getChampionHubDirectoryChampions } from '@/lib/champion-hub';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Champion Hub',
  description: 'Browse League of Legends champions and explore their abilities, playstyles, lore, and future Champion Hub guides.',
  path: '/champions',
  keywords: ['League of Legends champions', 'KnowLeague Champion Hub', 'Aatrox abilities'],
});

export default function ChampionsPage() {
  return <ChampionDirectory champions={getChampionHubDirectoryChampions()} />;
}
