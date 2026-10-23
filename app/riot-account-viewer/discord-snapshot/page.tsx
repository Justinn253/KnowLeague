import type { Metadata } from 'next';
import { RiotAccountViewer } from '@/components/riot-account-viewer';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

/**
 * A purpose-built, non-indexed render target for the Discord bot.
 * Interactive visitors continue to use /riot-account-viewer.
 */
export default function DiscordLeagueAccountViewerSnapshotPage() {
  return <RiotAccountViewer renderMode="discord-snapshot" />;
}
