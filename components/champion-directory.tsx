'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { GameIconImage, GameSplashImage } from '@/components/game-asset-image';
import { type ChampionHubClass, type ChampionHubDirectoryChampion, type ChampionHubLane } from '@/lib/champion-hub';

type ChampionDirectoryProps = {
  champions: readonly ChampionHubDirectoryChampion[];
};

const classIconByClass: Record<ChampionHubClass, string> = {
  Assassin: '/class-icons/assassin.png',
  Fighter: '/class-icons/fighter.png',
  Mage: '/class-icons/mage.png',
  Marksman: '/class-icons/marksman.png',
  Support: '/class-icons/support.png',
  Tank: '/class-icons/tank.png',
};

const laneIconByLane: Record<ChampionHubLane, string> = {
  Top: '/role-icons/roleicon_top.png',
  Jungle: '/role-icons/roleicon_jungle.png',
  Mid: '/role-icons/roleicon_middle.png',
  Support: '/role-icons/roleicon_utility.png',
  Bot: '/role-icons/roleicon_bottom.png',
};

type LaneFilter = ChampionHubLane | null;
type ClassFilter = ChampionHubClass | null;

const LANE_FILTER_OPTIONS: AppSelectOption<LaneFilter>[] = [
  { value: null, label: 'All lanes' },
  { value: 'Top', label: 'Top' },
  { value: 'Jungle', label: 'Jungle' },
  { value: 'Mid', label: 'Mid' },
  { value: 'Bot', label: 'Bot' },
  { value: 'Support', label: 'Support' },
];

const CLASS_FILTER_OPTIONS: AppSelectOption<ClassFilter>[] = [
  { value: null, label: 'All classes' },
  { value: 'Assassin', label: 'Assassin' },
  { value: 'Fighter', label: 'Fighter' },
  { value: 'Mage', label: 'Mage' },
  { value: 'Marksman', label: 'Marksman' },
  { value: 'Support', label: 'Support' },
  { value: 'Tank', label: 'Tank' },
];

function championMatchesSearch(champion: ChampionHubDirectoryChampion, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  return [champion.name, champion.title, champion.role, champion.lane, ...champion.searchTerms]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function championMatchesFilters(
  champion: ChampionHubDirectoryChampion,
  selectedLanes: readonly ChampionHubLane[],
  selectedClasses: readonly ChampionHubClass[],
) {
  const matchesLane = selectedLanes.length === 0 || champion.lanes.some((lane) => selectedLanes.includes(lane));
  const matchesClass = selectedClasses.length === 0 || champion.classes.some((championClass) => selectedClasses.includes(championClass));

  return matchesLane && matchesClass;
}

export function ChampionDirectory({ champions }: ChampionDirectoryProps) {
  const [query, setQuery] = useState('');
  const [selectedLanes, setSelectedLanes] = useState<ChampionHubLane[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<ChampionHubClass[]>([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(
    () => champions.filter((champion) => (
      championMatchesSearch(champion, normalizedQuery)
      && championMatchesFilters(champion, selectedLanes, selectedClasses)
    )),
    [champions, normalizedQuery, selectedClasses, selectedLanes],
  );

  function toggleLaneFilter(value: LaneFilter) {
    if (value === null) {
      setSelectedLanes([]);
      return;
    }

    setSelectedLanes((current) => current.includes(value)
      ? current.filter((lane) => lane !== value)
      : [...current, value]);
  }

  function toggleClassFilter(value: ClassFilter) {
    if (value === null) {
      setSelectedClasses([]);
      return;
    }

    setSelectedClasses((current) => current.includes(value)
      ? current.filter((championClass) => championClass !== value)
      : [...current, value]);
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 sm:py-10 lg:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(185,28,28,0.26),transparent_52%)]" />
      <div className="pointer-events-none absolute -right-32 top-32 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-7xl gap-5">
        <section aria-labelledby="champion-directory-heading" className="grid gap-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="shrink-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Champion directory</p>
              <h2 id="champion-directory-heading" className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Browse champions</h2>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-[minmax(15rem,1fr)_11rem_11rem]">
              <label className="relative block sm:col-span-2 xl:col-span-1">
                <span className="sr-only">Search champions</span>
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search a champion"
                  className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/90 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/30"
                />
              </label>
              <AppSelectMenu
                label="Filter lanes"
                value={null}
                options={LANE_FILTER_OPTIONS}
                selectedValues={selectedLanes.length ? selectedLanes : [null]}
                multiple
                onToggle={toggleLaneFilter}
                hideLabel
                triggerClassName="rounded-xl"
                menuClassName="w-[min(22rem,calc(100vw-2rem))]"
              />
              <AppSelectMenu
                label="Filter classes"
                value={null}
                options={CLASS_FILTER_OPTIONS}
                selectedValues={selectedClasses.length ? selectedClasses : [null]}
                multiple
                onToggle={toggleClassFilter}
                hideLabel
                triggerClassName="rounded-xl"
                menuPlacement="right"
                menuClassName="w-[min(22rem,calc(100vw-2rem))]"
              />
            </div>
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
                    {champion.classes.map((championClass) => (
                      <span key={championClass} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/75 p-2 text-amber-200 backdrop-blur">
                        <GameIconImage src={classIconByClass[championClass]} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
                        <span className="sr-only">{championClass}</span>
                      </span>
                    ))}
                    <span className="mt-auto inline-flex min-h-9 flex-col items-center justify-center gap-1 rounded-xl border border-red-200/25 bg-red-950/65 p-2 text-red-100 backdrop-blur">
                      {champion.lanes.map((lane) => (
                        <GameIconImage key={lane} src={laneIconByLane[lane]} alt="" width={18} height={18} className="h-[1.125rem] w-[1.125rem] object-contain" />
                      ))}
                      <span className="sr-only">Plays in: {champion.lanes.join(', ')}</span>
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
              <p className="mt-2 text-sm text-slate-400">Try a champion name, role, lane, title, or adjust the filters.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
