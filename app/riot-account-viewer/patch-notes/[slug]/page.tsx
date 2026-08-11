import type { Metadata } from 'next';
import { PatchNoteDetailSection } from '@/components/riot-account-viewer';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'League of Legends Patch Details',
  description: 'Read detailed League of Legends patch changes.',
  path: '/riot-account-viewer/patch-notes',
});

export default function LeaguePatchNoteDetailPage({ params }: { params: { slug: string } }) {
  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <PatchNoteDetailSection slug={params.slug} />
      </section>
    </main>
  );
}
