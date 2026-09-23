import { AugmentBinder } from '@/components/augment-binder';
import { isAugmentId } from '@/lib/augment-builder';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Augment Binder | KnowLeague',
  description: 'Explore a player’s custom ARAM Mayhem augments.',
};
export default function AugmentBinderPage({ params }: { params: { owner: string } }) {
  if (!isAugmentId(params.owner)) notFound();
  return <AugmentBinder owner={params.owner} />;
}
