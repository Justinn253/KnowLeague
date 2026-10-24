import type { Metadata } from 'next';
import {
  CHAMPION_DISCORD_SNAPSHOT_SECTIONS,
  ChampionDiscordSnapshot,
  type ChampionDiscordSnapshotSection,
} from '@/components/champion-discord-snapshot';
import { CHAMPION_HUB_CHAMPIONS } from '@/lib/champion-hub';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

type ChampionDiscordSnapshotPageProps = {
  searchParams: {
    champion?: string | string[];
    section?: string | string[];
  };
};

function normalizedChampionTerm(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function championFromSearchTerm(value: string | string[] | undefined) {
  const submittedChampion = typeof value === 'string' ? value.trim() : '';
  const normalizedInput = normalizedChampionTerm(submittedChampion);
  if (!normalizedInput || submittedChampion.length > 64) return null;

  return CHAMPION_HUB_CHAMPIONS.find((champion) => [
    champion.name,
    champion.slug,
    ...champion.searchTerms,
  ].some((term) => normalizedChampionTerm(term) === normalizedInput)) ?? null;
}

function sectionFromSearchTerm(value: string | string[] | undefined): ChampionDiscordSnapshotSection | null {
  if (value === undefined) return 'all';
  const submittedSection = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CHAMPION_DISCORD_SNAPSHOT_SECTIONS.find((section) => section === submittedSection) ?? null;
}

/** Non-indexed, static render target used only by the Discord Champion Catalogue capture flow. */
export default function ChampionDiscordSnapshotPage({ searchParams }: ChampionDiscordSnapshotPageProps) {
  const champion = championFromSearchTerm(searchParams.champion);
  const section = sectionFromSearchTerm(searchParams.section);

  if (!champion || !section) {
    return (
      <main className="min-h-[100dvh] bg-[#030712] p-6 text-slate-100">
        <p data-lav-champion-capture-error="true" className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">
          The requested Champion Catalogue snapshot could not be found.
        </p>
      </main>
    );
  }

  return <ChampionDiscordSnapshot champion={champion} section={section} />;
}
