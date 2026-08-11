import type { Metadata } from 'next';
import { PopularAccountsSection } from '@/components/riot-account-viewer';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Most Popular League Accounts',
  description: 'See the most searched League of Legends accounts on KnowLeague by time period.',
  path: '/riot-account-viewer/popular',
});

export default function PopularLeagueAccountsPage() {
  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <PopularAccountsSection />
      </section>
    </main>
  );
}
