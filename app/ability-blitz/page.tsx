import type { Metadata } from 'next';
import { AbilityBlitz } from '@/components/ability-blitz';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Ability Blitz League Ability Quiz',
  description: 'Test your League of Legends champion knowledge by identifying champions from their abilities.',
  path: '/ability-blitz',
});

export default function AbilityBlitzPage() {
  return (
    <>
      <GameStructuredData name="Ability Blitz" path="/ability-blitz" />
      <AbilityBlitz />
    </>
  );
}
