import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AugmentOfficialView } from '@/components/augment-official-view';
import officialCatalogue from '@/data/catalogs/official-augments.json';
import { createPageMetadata } from '@/lib/seo';

type OfficialAugmentPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata(props: OfficialAugmentPageProps): Promise<Metadata> {
  const params = await props.params;
  const record = officialCatalogue.augments.find((item) => item.id === params.id);
  return createPageMetadata({
    title: record ? record.name + ' | Official Augment' : 'Official Augment',
    description: record?.shortDescription || 'View an official ARAM Mayhem augment.',
    path: '/augment-builder/official/' + params.id,
  });
}

export default async function OfficialAugmentPage(props: OfficialAugmentPageProps) {
  const params = await props.params;
  const record = officialCatalogue.augments.find((item) => item.id === params.id);
  if (!record) notFound();
  return <AugmentOfficialView record={record} />;
}