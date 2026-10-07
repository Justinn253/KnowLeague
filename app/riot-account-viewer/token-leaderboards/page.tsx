import type { Metadata } from 'next';
import { RiotTokenLeaderboardsIndex } from '@/components/riot-token-leaderboards';
import { WebApplicationStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Token Leaderboards',
  description: 'Browse League of Legends Challenge token leaderboards by region.',
  path: '/riot-account-viewer/token-leaderboards',
});

export default function RiotTokenLeaderboardsPage() {
  return (
    <>
      <WebApplicationStructuredData name="League Token Leaderboards" path="/riot-account-viewer/token-leaderboards" />
      <RiotTokenLeaderboardsIndex />
    </>
  );
}
