import type { Metadata } from 'next';
import { RiotTokenLeaderboardDetail } from '@/components/riot-token-leaderboards';
import { createPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = createPageMetadata({
  title: 'Token Leaderboard',
  description: 'View the regional top 250 players for a League of Legends Challenge token.',
  path: '/riot-account-viewer/token-leaderboards',
});

export default async function RiotTokenLeaderboardPage(props: { params: Promise<{ tokenId: string }> }) {
  const params = await props.params;
  const tokenId = Number(params.tokenId);
  return <RiotTokenLeaderboardDetail tokenId={Number.isSafeInteger(tokenId) && tokenId > 0 ? tokenId : 0} />;
}
