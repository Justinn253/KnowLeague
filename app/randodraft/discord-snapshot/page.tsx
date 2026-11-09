import type { Metadata } from 'next';
import { RandodraftDiscordSnapshot } from '@/components/randodraft-discord-snapshot';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
};

type RandodraftDiscordSnapshotPageProps = {
  searchParams: Promise<{
    share?: string | string[];
  }>;
};

/** A non-indexed render target for the Discord bot's Randodraft image attachment. */
export default async function RandodraftDiscordSnapshotPage(props: RandodraftDiscordSnapshotPageProps) {
  const searchParams = await props.searchParams;
  const share = typeof searchParams.share === 'string' ? searchParams.share : '';
  return <RandodraftDiscordSnapshot share={share} />;
}
