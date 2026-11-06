import type { Metadata } from 'next';
import { AugmentBuilder } from '@/components/augment-builder';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Create ARAM Mayhem Augment',
  description: 'Create and publish a custom ARAM Mayhem augment with official icons and rarity frames.',
  path: '/augment-builder/create',
});

export default async function AugmentBuilderPage(
  props: { searchParams: Promise<{ edit?: string; template?: string; fresh?: string }> }
) {
  const searchParams = await props.searchParams;
  return <AugmentBuilder editId={searchParams.edit ?? null} templateId={searchParams.template ?? null} fresh={searchParams.fresh === '1'} />;
}

