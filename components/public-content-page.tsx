import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PublicPageShell({ eyebrow, title, description, children, actions }: PublicPageShellProps) {
  return (
    <main className="min-h-[100dvh] bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-8">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/85 p-6 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-amber-300">{eyebrow}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{description}</p>
            {actions ? <div className="mt-6 flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

type PublicContentSectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function PublicContentSection({ id, eyebrow, title, description, children, className = '' }: PublicContentSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`} className={`grid gap-4 ${className}`}>
      <div className="max-w-3xl">
        {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{eyebrow}</p> : null}
        <h2 id={`${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`} className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type PublicContentCardProps = {
  title: string;
  children: ReactNode;
  accent?: 'amber' | 'cyan' | 'violet' | 'rose' | 'emerald' | 'sky';
  className?: string;
  icon?: ReactNode;
};

const cardAccentClasses = {
  amber: 'border-amber-300/25 bg-amber-300/[0.045]',
  cyan: 'border-cyan-300/25 bg-cyan-300/[0.045]',
  violet: 'border-violet-300/25 bg-violet-300/[0.045]',
  rose: 'border-rose-300/25 bg-rose-300/[0.045]',
  emerald: 'border-emerald-300/25 bg-emerald-300/[0.045]',
  sky: 'border-sky-300/25 bg-sky-300/[0.045]',
} as const;

export function PublicContentCard({ title, children, accent = 'amber', className = '', icon }: PublicContentCardProps) {
  return (
    <article className={`rounded-2xl border p-5 sm:p-6 ${cardAccentClasses[accent]} ${className}`}>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-black text-white">{title}</h3>
      </div>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-300">{children}</div>
    </article>
  );
}

export function PublicActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={secondary
        ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-800 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200'
        : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/60 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:border-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100'}
    >
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}

export function PublicProse({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 text-sm leading-7 text-slate-300">{children}</div>;
}
