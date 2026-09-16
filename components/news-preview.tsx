import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';
import { formatNewsDate, getNewsEntries } from '@/lib/news';

export function NewsPreview() {
  const { latest } = getNewsEntries();
  return (
    <Link href="/news" prefetch={false} className="group flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 transition-colors hover:border-amber-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:px-5">
      <Newspaper size={20} className="shrink-0 text-amber-200" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-black text-white">See what’s new on KnowLeague</h2>
          {latest && <time dateTime={latest.publishedAt} className="text-xs text-slate-400">{formatNewsDate(latest.publishedAt)}</time>}
        </div>
        {latest ? (
          <>
            <p className="mt-1 truncate text-sm font-semibold text-amber-200">{latest.title}</p>
            <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-400">{latest.summary ?? latest.paragraphs[0]}</p>
          </>
        ) : <p className="mt-1 text-xs text-slate-400">Release notes and news from across KnowLeague.</p>}
      </div>
      <ArrowRight size={18} className="shrink-0 text-amber-200" aria-hidden="true" />
    </Link>
  );
}
