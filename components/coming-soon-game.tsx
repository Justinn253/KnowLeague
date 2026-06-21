import { ArrowLeft, Clock3 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type ComingSoonGameProps = {
  title: string;
  description: string;
  imageUrl: string;
};

export function ComingSoonGame({ title, description, imageUrl }: ComingSoonGameProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-10 lg:px-12">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to game hub"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Single Player Game</p>
              <h1 className="text-xl font-semibold text-white">{title}</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-200">
            <Clock3 size={16} />
            Coming soon
          </span>
        </header>

        <section className="grid overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-glow md:grid-cols-[18rem_1fr]">
          <div className="flex items-center justify-center border-b border-white/10 bg-slate-950 p-8 md:border-b-0 md:border-r">
            <Image
              src={imageUrl}
              alt=""
              width={160}
              height={160}
              className="h-40 w-40 rounded-3xl object-cover ring-1 ring-white/10"
            />
          </div>
          <div className="flex flex-col justify-center gap-5 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">
              In development
            </p>
            <h2 className="text-3xl font-bold text-white">{title}</h2>
            <p className="max-w-2xl text-base leading-7 text-slate-300">{description}</p>
            <Link
              href="/"
              className="inline-flex w-fit items-center justify-center rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Back to game hub
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
