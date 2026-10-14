import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChampionDetailShell } from '@/components/champion-detail-shell';
import { ChampionSkins } from '@/components/champion-skins';
import { getChampionHubChampion } from '@/lib/champion-hub';
import { createPageMetadata } from '@/lib/seo';

type ChampionSkinsPageProps = {
  params: { slug: string };
  searchParams: { skin?: string | string[] };
};

function skinQueryValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export function generateMetadata({ params }: ChampionSkinsPageProps): Metadata {
  const champion = getChampionHubChampion(params.slug);

  if (!champion) {
    return createPageMetadata({
      title: 'Champion not found',
      description: 'This Champion Hub entry is not available yet.',
      path: `/champions/${params.slug}/skins`,
    });
  }

  if (champion.skinCatalogueStatus !== 'complete') {
    return createPageMetadata({
      title: `${champion.name} Skins | Coming Soon`,
      description: `The verified ${champion.name} skins and chromas catalogue is being prepared for the Champion Hub.`,
      path: `/champions/${champion.slug}/skins`,
      keywords: [`${champion.name} skins`, `${champion.name} chromas`, 'League of Legends champions'],
    });
  }

  return createPageMetadata({
    title: `${champion.name} Skins and Chromas`,
    description: `Browse every ${champion.name} skin, chroma, cosmetic lore, availability, and 3D model link.`,
    path: `/champions/${champion.slug}/skins`,
    keywords: [`${champion.name} skins`, `${champion.name} chromas`, `${champion.name} model`, 'League of Legends skins'],
  });
}

export default function ChampionSkinsPage({ params, searchParams }: ChampionSkinsPageProps) {
  const champion = getChampionHubChampion(params.slug);

  if (!champion) {
    notFound();
  }

  if (champion.skinCatalogueStatus !== 'complete') {
    return (
      <ChampionDetailShell champion={champion} activeTab="skins">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-amber-200/10" />
          <div className="relative max-w-2xl">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-amber-200">Champion Hub</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Skins are coming soon</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">The cosmetic catalogue for {champion.name} is being verified before it is added to the Champion Hub.</p>
          </div>
        </section>
      </ChampionDetailShell>
    );
  }

  return <ChampionSkins champion={champion} selectedSkinId={skinQueryValue(searchParams.skin)} />;
}
