import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChampionProfile } from '@/components/champion-profile';
import { getChampionHubChampion, getChampionHubChampions } from '@/lib/champion-hub';
import { createPageMetadata } from '@/lib/seo';

type ChampionPageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return getChampionHubChampions().map((champion) => ({ slug: champion.slug }));
}

export function generateMetadata({ params }: ChampionPageProps): Metadata {
  const champion = getChampionHubChampion(params.slug);

  if (!champion) {
    return createPageMetadata({
      title: 'Champion not found',
      description: 'This Champion Hub entry is not available yet.',
      path: `/champions/${params.slug}`,
    });
  }

  return createPageMetadata({
    title: `${champion.name} Champion Guide`,
    description: `Explore ${champion.name}, ${champion.title}: abilities, playstyle, lore, and Champion Hub overview details.`,
    path: `/champions/${champion.slug}`,
    keywords: [`${champion.name} guide`, `${champion.name} abilities`, `${champion.name} lore`, 'League of Legends champions'],
  });
}

export default function ChampionPage({ params }: ChampionPageProps) {
  const champion = getChampionHubChampion(params.slug);

  if (!champion) {
    notFound();
  }

  return <ChampionProfile champion={champion} />;
}
