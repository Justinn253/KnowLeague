import { AugmentView } from '@/components/augment-view';
import { isAugmentId } from '@/lib/augment-builder';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Community Augment | KnowLeague',
  description: 'View and rate a custom ARAM Mayhem augment.',
};
export default function AugmentPage({ params, searchParams }: { params: { id: string }; searchParams: { published?: string } }) {
  if (!isAugmentId(params.id)) notFound();
  return <AugmentView id={params.id} forceCommunityBack={searchParams.published === '1'} />;
}
