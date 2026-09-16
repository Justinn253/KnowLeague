import Link from 'next/link';
import { ArrowLeft, Archive } from 'lucide-react';
import { NewsPost } from '@/components/news-post';
import { getNewsEntries } from '@/lib/news';

export function NewsScreen({ archive = false }: { archive?: boolean }) {
  const { recent, archived } = getNewsEntries();
  const entries = archive ? archived : recent;
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-[#030712] px-4 py-10 text-slate-100 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <Link href={archive ? '/news' : '/'} className="inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
          <ArrowLeft size={16} aria-hidden="true" />{archive ? 'Back to News and Updates' : 'Back to home'}
        </Link>
        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">KnowLeague News and Updates{archive ? ' Archive' : ''}</h1>
        </header>
        <div className="space-y-5">
          {entries.map((entry) => <NewsPost key={entry.id} entry={entry} />)}
          {entries.length === 0 && <p className="rounded-2xl border border-white/10 bg-slate-950 p-6 text-slate-400">
            {archive ? 'No archived posts yet. Older posts will appear here automatically.' : 'No new posts in the last 30 days. Catch up in the archive below.'}
          </p>}
        </div>
        {!archive && <Link href="/news/archive" prefetch={false} className="mt-8 flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-900 p-5 font-bold transition-colors hover:border-amber-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
          <Archive size={20} aria-hidden="true" />View archive <span className="ml-auto text-sm text-slate-400">{archived.length} {archived.length === 1 ? 'post' : 'posts'}</span>
        </Link>}
      </div>
    </main>
  );
}
