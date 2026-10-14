import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChampionDetailShell, type ChampionDetailTab } from '@/components/champion-detail-shell';
import { ChampionGameplayDetails } from '@/components/champion-gameplay-details';
import { getChampionHubChampion, hasChampionGameplayDetails } from '@/lib/champion-hub';
import { createPageMetadata } from '@/lib/seo';

const FUTURE_TABS = {
  'gameplay-details': {
    label: 'Gameplay details',
    description: 'Detailed combat statistics, ability values, scaling, and cooldowns are being prepared for this champion.',
  },
  lore: {
    label: 'Lore',
    description: 'Stories, history, and world connections are being prepared for this champion.',
  },
  'voice-lines': {
    label: 'Voice lines',
    description: 'Champion quotes and voice audio are being prepared for this archive.',
  },
} as const;

type FutureTab = keyof typeof FUTURE_TABS;

type ChampionFutureTabPageProps = {
  params: { slug: string; tab: string };
};

function isFutureTab(value: string): value is FutureTab {
  return value in FUTURE_TABS;
}

export function generateMetadata({ params }: ChampionFutureTabPageProps): Metadata {
  const champion = getChampionHubChampion(params.slug);
  const tab = isFutureTab(params.tab) ? FUTURE_TABS[params.tab] : null;

  if (!champion || !tab) {
    return createPageMetadata({
      title: 'Champion tab not found',
      description: 'This Champion Hub section is not available yet.',
      path: `/champions/${params.slug}/${params.tab}`,
    });
  }

  if (params.tab === 'gameplay-details' && hasChampionGameplayDetails(champion)) {
    return createPageMetadata({
      title: `${champion.name} Gameplay Details`,
      description: `Inspect ${champion.name}'s combat statistics, ability values, scaling, cooldowns, and gameplay notes.`,
      path: `/champions/${champion.slug}/gameplay-details`,
      keywords: [`${champion.name} stats`, `${champion.name} ability scaling`, `${champion.name} cooldowns`, 'League of Legends champion details'],
    });
  }

  return createPageMetadata({
    title: `${champion.name} ${tab.label}`,
    description: `${tab.description} Explore the ${champion.name} Champion Hub.`,
    path: `/champions/${champion.slug}/${params.tab}`,
    keywords: [`${champion.name} ${tab.label.toLowerCase()}`, `${champion.name} guide`, 'League of Legends champions'],
  });
}

export default function ChampionFutureTabPage({ params }: ChampionFutureTabPageProps) {
  const champion = getChampionHubChampion(params.slug);

  if (!champion) {
    notFound();
  }

  if (!isFutureTab(params.tab)) {
    notFound();
  }

  if (params.tab === 'gameplay-details' && hasChampionGameplayDetails(champion)) {
    return <ChampionGameplayDetails champion={champion} />;
  }

  const tab = FUTURE_TABS[params.tab];

  return (
    <ChampionDetailShell champion={champion} activeTab={params.tab as ChampionDetailTab}>
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-8 sm:p-12">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-amber-200/10" />
        <div className="relative max-w-2xl">
          <p className="text-[0.66rem] font-black uppercase tracking-[0.2em] text-amber-200">Champion Hub</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{tab.label} is coming soon</h2>
          <p className="mt-4 text-base leading-7 text-slate-300">{tab.description}</p>
        </div>
      </section>
    </ChampionDetailShell>
  );
}
