import type { Metadata } from 'next';
import { MultiplayerQuizLobby } from '@/components/multiplayer-quiz-lobby';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Skin Champion Multiplayer Quiz',
  description: 'Challenge your friends to identify League of Legends skin lines before they do.',
  path: '/multiplayer/skin-champion',
});

export default function MultiplayerSkinChampionPage() {
  return (
    <>
      <GameStructuredData name="Skin Champion Multiplayer" path="/multiplayer/skin-champion" />
      <MultiplayerQuizLobby gameMode="skin_champion" />
    </>
  );
}
