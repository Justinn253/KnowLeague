import { Megaphone, Package } from 'lucide-react';
import { formatNewsDate, type NewsEntry } from '@/lib/news';

export function NewsPost({ entry }: { entry: NewsEntry }) {
  const isUpdate = entry.kind === 'update';
  const Icon = isUpdate ? Package : Megaphone;
  return (
    <article id={entry.id} className={`min-w-0 rounded-2xl border p-5 sm:p-7 ${isUpdate ? 'border-amber-300/30 bg-amber-300/5' : 'border-cyan-300/30 bg-cyan-300/5'}`}>
      <header>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-bold ${isUpdate ? 'border-amber-300/30 text-amber-200' : 'border-cyan-300/30 text-cyan-200'}`}>
            <Icon size={16} aria-hidden="true" />
            {entry.kind === 'update' ? `Update · ${entry.version}` : 'News'}
          </span>
          <time dateTime={entry.publishedAt} className="text-slate-400">{formatNewsDate(entry.publishedAt)}</time>
        </div>
        <h2 className="mt-4 break-words text-2xl font-black text-white">{entry.title}</h2>
      </header>
      <div className="mt-4 space-y-4 break-words text-sm leading-7 text-slate-300 sm:text-base">
        {entry.paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}
        {entry.sections?.map((section) => (
          <section key={section.heading}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-200">{section.heading}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-slate-500">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
