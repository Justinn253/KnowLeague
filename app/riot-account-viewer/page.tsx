import type { Metadata } from 'next';
import { RiotAccountViewer } from '@/components/riot-account-viewer';
import { WebApplicationStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'League Account Viewer',
  description: 'Explore League of Legends account stats, mastery, match history, ranked data, and challenges.',
  path: '/riot-account-viewer',
});

export default function RiotAccountViewerPage() {
  return (
    <>
      <WebApplicationStructuredData name="League Account Viewer" path="/riot-account-viewer" />
      <RiotAccountViewer />
    </>
  );
}
