import type { Metadata } from 'next';
import { MultiplayerQuizLobby } from '@/components/multiplayer-quiz-lobby';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Ability Blitz Multiplayer Quiz',
  description: 'Race your friends to identify League of Legends champions from their abilities.',
  path: '/multiplayer/ability-blitz',
});

export default function MultiplayerAbilityBlitzPage() {
  return (
    <>
      <GameStructuredData name="Ability Blitz Multiplayer" path="/multiplayer/ability-blitz" />
      <MultiplayerQuizLobby gameMode="ability_blitz" />
    </>
  );
}
