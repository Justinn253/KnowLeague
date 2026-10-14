'use client';

import Link from 'next/link';
import { Crosshair, HeartHandshake, MapPin, Search, Shield, Swords, WandSparkles, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GameSplashImage } from '@/components/game-asset-image';
import type { ChampionHubChampion } from '@/lib/champion-hub';

type ChampionDirectoryProps = {
  champions: readonly ChampionHubChampion[];
};

const classIcons: Record<string, { icon: LucideIcon; label: string }> = {
  assassin: { icon: Crosshair, label: 'Assassin' },
  fighter: { icon: Swords, label: 'Fighter' },
  mage: { icon: WandSparkles, label: 'Mage' },
  marksman: { icon: Crosshair, label: 'Marksman' },
  support: { icon: HeartHandshake, label: 'Support' },
  tank: { icon: Shield, label: 'Tank' },
};

function championMatchesSearch(champion: ChampionHubChampion, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  return [champion.name, champion.title, champion.role, champion.lane, ...champion.searchTerms]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function getChampionClassIcons(role: string) {
  const icons = role
    .toLocaleLowerCase()
    .split(/[,&/]+/)
    .map((entry) => classIcons[entry.trim()])
    .filter((entry): entry is { icon: LucideIcon; label: string } => Boolean(entry));

  return icons.length ? icons : [classIcons.fighter];
}

export function ChampionDirectory({ champions }: ChampionDirectoryProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(
    () => champions.filter((champion) => championMatchesSearch(champion, normalizedQuery)),
    [champions, normalizedQuery],
  );

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 sm:py-10 lg:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(185,28,28,0.26),transparent_52%)]" />
      <div className="pointer-events-none absolute -right-32 top-32 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-7xl gap-5">
        <section aria-labelledby="champion-directory-heading" className="grid gap-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Champion directory</p>
              <h2 id="champion-directory-heading" className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Browse champions</h2>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">Search champions</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a champion"
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/90 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/30"
              />
            </label>
          </div>

          {results.length ? (
            <div className="grid gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((champion) => (
                <Link
                  key={champion.id}
                  href={`/champions/${champion.slug}`}
                  className="group relative isolate min-h-80 overflow-hidden rounded-2xl border border-red-300/20 bg-slate-950 transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <GameSplashImage
                    src={champion.splashUrl}
                    alt={`${champion.name} splash art`}
                    fill
                    sizes="(min-width: 1280px) 280px, (min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw"
                    className="object-cover object-[58%_top] transition duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.02),rgba(2,6,23,0.95)_78%)]" />
                  <div className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/3 -skew-x-12 bg-white/10 opacity-0 blur-md transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
                  <div className="absolute inset-y-5 right-4 z-10 flex flex-col items-center gap-2">
                    {getChampionClassIcons(champion.role).map(({ icon: ClassIcon, label }) => (
                      <span key={label} title={label} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/75 text-amber-200 backdrop-blur">
                        <ClassIcon size={17} aria-hidden="true" />
                      </span>
                    ))}
                    <span title={`${champion.lane} lane`} className="mt-auto inline-flex flex-col items-center gap-1 rounded-xl border border-red-200/25 bg-red-950/65 px-1.5 py-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-red-100 backdrop-blur">
                      <MapPin size={15} aria-hidden="true" />
                      {champion.lane}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5 pr-16">
                    <h3 className="text-3xl font-black tracking-tight text-white">{champion.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-300">{champion.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/70 p-8 text-center">
              <p className="text-lg font-black text-white">No champion matches “{query.trim()}”.</p>
              <p className="mt-2 text-sm text-slate-400">Try a champion name, role, lane, or title.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
