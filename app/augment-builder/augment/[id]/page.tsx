import { AugmentView } from '@/components/augment-view';
import { isAugmentId } from '@/lib/augment-builder';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Community Augment | KnowLeague',
  description: 'View and rate a custom ARAM Mayhem augment.',
};
export default async function AugmentPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (!isAugmentId(params.id)) notFound();
  return <AugmentView id={params.id} forceCommunityBack={searchParams.published === '1'} />;
}
