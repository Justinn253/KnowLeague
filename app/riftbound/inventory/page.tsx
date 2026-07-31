import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RiftboundCardGrid } from '@/components/riftbound-card-grid';
import { RiftboundCatalogueStructuredData } from '@/components/riftbound-seo-structured-data';
import { createNoIndexMetadata, createPageMetadata } from '@/lib/seo';

type PageProps = {
  searchParams?: {
    tab?: string | string[];
  };
};

export function generateMetadata({ searchParams }: PageProps): Metadata {
  const tab = Array.isArray(searchParams?.tab) ? searchParams.tab[0] : searchParams?.tab;
  if (tab === 'inventory') return createNoIndexMetadata('My Riftbound Inventory');
  if (tab === 'sets') return createNoIndexMetadata('Riftbound Set and Deck Builder');

  return createPageMetadata({
    title: 'Riftbound Card Database and Collection Tracker',
    description: 'Browse every Riftbound card by set, rarity, domain, cost, and type. Track your collection, build sets and decks, and review market details on KnowLeague.',
    path: '/riftbound/inventory',
    keywords: [
      'Riftbound card database',
      'Riftbound collection tracker',
      'Riftbound card checklist',
      'Riftbound deck builder',
      'Riftbound card prices',
      'Riftbound TCG cards',
    ],
  });
}

export default function RiftboundInventoryPage() {
  return (
    <>
      <RiftboundCatalogueStructuredData />
      <Suspense fallback={<main className="min-h-screen bg-[#030712]" aria-label="Loading Riftbound collection" />}>
        <RiftboundCardGrid />
      </Suspense>
    </>
  );
}
