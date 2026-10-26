'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  CircleDotDashed,
  LockKeyhole,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Swords,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { GameDirectImage, GameIconImage } from '@/components/game-asset-image';
import { HeaderHoverNote } from '@/components/header-hover-note';
import {
  type ChampionHubChampion,
  type ChampionHubClass,
  type ChampionHubLane,
} from '@/lib/champion-hub';

export const CHAMPION_DETAIL_TABS = ['overview', 'gameplay-details', 'skins', 'lore', 'voice-lines'] as const;
export type ChampionDetailTab = (typeof CHAMPION_DETAIL_TABS)[number];

type ChampionDetailShellProps = {
  champion: ChampionHubChampion;
  activeTab: ChampionDetailTab;
  children: ReactNode;
};

type ChampionNavigationTab = {
  id: ChampionDetailTab;
  label: string;
  description: string;
  icon: LucideIcon;
  isAvailable: boolean;
};

const navigationTabs: readonly ChampionNavigationTab[] = [
  { id: 'overview', label: 'Overview', description: 'Champion overview and ability kit', icon: CircleDotDashed, isAvailable: true },
  { id: 'gameplay-details', label: 'Gameplay details', description: 'Detailed combat statistics, ability values, scaling, and cooldowns', icon: Swords, isAvailable: true },
  { id: 'skins', label: 'Skins', description: 'Skin gallery and chromas', icon: Palette, isAvailable: true },
  { id: 'lore', label: 'Lore', description: 'Stories and world connections', icon: ScrollText, isAvailable: false },
  { id: 'voice-lines', label: 'Voice lines', description: 'Quotes and audio archive', icon: Volume2, isAvailable: false },
];

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

const CHAMPION_LANE_ORDER: readonly ChampionHubLane[] = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'];

function championTabHref(champion: ChampionHubChampion, tab: ChampionDetailTab) {
  return tab === 'overview' ? `/champions/${champion.slug}` : `/champions/${champion.slug}/${tab}`;
}

function tabAvailability(champion: ChampionHubChampion, tab: ChampionNavigationTab) {
  if (!tab.isAvailable) return false;
  if (tab.id === 'gameplay-details') return hasGameplayDetails(champion);
  if (tab.id === 'skins') return champion.skinCatalogueStatus === 'complete';

  return true;
}

function tabDescription(champion: ChampionHubChampion, tab: ChampionNavigationTab) {
  if (tab.id === 'gameplay-details' && !hasGameplayDetails(champion)) {
    return 'Detailed combat statistics and ability values are being prepared for this champion';
  }

  if (tab.id === 'skins' && champion.skinCatalogueStatus !== 'complete') {
    return 'Skin gallery and chromas are being prepared for this champion';
  }

  return tab.description;
}

function hasGameplayDetails(champion: ChampionHubChampion) {
  return champion.gameplayDetails.statGroups.length > 0 && champion.gameplayDetails.abilities.length > 0;
}

function ChampionClassIcons({ champion, size = 18 }: { champion: ChampionHubChampion; size?: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${champion.classes.join(' and ')} class${champion.classes.length === 1 ? '' : 'es'}`}>
      {champion.classes.map((championClass) => (
        <span key={championClass} className="group relative inline-flex items-center justify-center">
          <GameIconImage src={classIconByClass[championClass]} alt="" width={size} height={size} className="object-contain" />
          <span className="sr-only">{championClass}</span>
          <HeaderHoverNote compact placement="above">{championClass}</HeaderHoverNote>
        </span>
      ))}
    </span>
  );
}

function ChampionLaneIcons({ champion }: { champion: ChampionHubChampion }) {
  return (
    <span className="group relative flex items-center gap-1" aria-label={`${champion.name} lane availability`}>
      {CHAMPION_LANE_ORDER.map((lane) => {
        const isAvailable = champion.lanes.includes(lane);

        return (
          <span
            key={lane}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${isAvailable ? 'border-amber-200/60 bg-amber-200/10 opacity-100' : 'border-white/5 bg-slate-950/40 opacity-30 grayscale'}`}
          >
            <GameIconImage src={laneIconByLane[lane]} alt="" width={18} height={18} className="h-[1.125rem] w-[1.125rem] object-contain" />
            <span className="sr-only">{`${lane}${isAvailable ? ' lane' : ' lane not listed'}`}</span>
          </span>
        );
      })}
      <HeaderHoverNote compact placement="above">Plays in: {champion.lanes.join(', ')}</HeaderHoverNote>
    </span>
  );
}

function ChampionNavigationLabel({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <span className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-300 ease-out ${expanded ? 'ml-3 max-w-44 opacity-100' : 'ml-0 max-w-0 opacity-0'}`}>
      {children}
    </span>
  );
}

/** Shared Champion Catalogue identity header for interactive and static render targets. */
export function ChampionDetailHeader({ champion }: { champion: ChampionHubChampion }) {
  return (
    <header className="relative isolate z-10 rounded-2xl border border-red-300/25 bg-slate-950/90">
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-2xl">
        <GameDirectImage
          src={champion.splashUrl}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1100px, 100vw"
          className="object-cover object-[center_18%] opacity-50 animate-[champion-splash-reveal_900ms_ease-out_both]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.97),rgba(2,6,23,0.8)_46%,rgba(69,10,10,0.4)),linear-gradient(0deg,rgba(2,6,23,0.94),transparent_70%)]" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-amber-200/15 animate-[champion-rune-spin_20s_linear_infinite]" />
      </div>
      <div className="relative grid gap-5 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-end">
        <div className="flex min-w-0 items-end gap-4 sm:gap-5">
          <span className="relative inline-flex h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-amber-200/40 bg-slate-950/80 sm:h-24 sm:w-24">
            <GameIconImage src={champion.portraitUrl} alt={`${champion.name} portrait`} width={96} height={96} priority className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 pb-0.5">
            <h1 className="truncate text-4xl font-black tracking-tight text-white sm:text-5xl">{champion.name}</h1>
            <p className="mt-1 text-lg font-semibold text-red-100 sm:text-xl">{champion.title}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <span className="inline-flex min-h-10 items-center rounded-xl border border-red-200/25 bg-red-950/45 px-3 text-red-100">
            <ChampionClassIcons champion={champion} size={23} />
          </span>
          <span className="inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-slate-950/60 px-2">
            <ChampionLaneIcons champion={champion} />
          </span>
        </div>
      </div>
    </header>
  );
}

export function ChampionDetailShell({ champion, activeTab, children }: ChampionDetailShellProps) {
  const [navigationExpanded, setNavigationExpanded] = useState(true);

  return (
    <main className="min-h-[100dvh] overflow-x-clip bg-[#030712] px-3 py-5 text-slate-100 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto grid w-full max-w-[96rem] gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
        <aside className={`relative rounded-2xl border border-white/10 bg-slate-950/85 transition-[width] duration-300 ${navigationExpanded ? 'w-full lg:w-72' : 'w-full lg:w-[4.5rem]'}`}>
          <div className={`relative flex items-start ${navigationExpanded ? 'p-4' : 'p-3'}`}>
            <div className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,max-height,margin,opacity] duration-300 ease-out ${navigationExpanded ? 'mr-3 max-h-14 max-w-44 opacity-100' : 'mr-0 max-h-0 max-w-0 opacity-0'}`}>
              <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-amber-300">Champion Hub</p>
              <h1 className="mt-1 text-xl font-black tracking-tight text-white">Browse champion</h1>
            </div>
            <button
              type="button"
              aria-label={navigationExpanded ? 'Collapse champion navigation' : 'Expand champion navigation'}
              aria-expanded={navigationExpanded}
              onClick={() => setNavigationExpanded((expanded) => !expanded)}
              className={`ml-auto inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-amber-200/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 ${navigationExpanded ? 'h-10 w-10' : 'h-12 w-12'}`}
            >
              {navigationExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          </div>

          <div className="relative border-t border-white/10 p-3">
            <Link
              href="/champions"
              className="group relative flex min-h-11 items-center rounded-xl border border-white/10 bg-slate-900/75 px-3 text-sm font-bold text-slate-300 transition hover:border-amber-200/45 hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <ArrowLeft size={17} className="shrink-0 transition group-hover:-translate-x-0.5" aria-hidden="true" />
              <ChampionNavigationLabel expanded={navigationExpanded}>All champions</ChampionNavigationLabel>
              {!navigationExpanded ? <HeaderHoverNote compact placement="above">All champions</HeaderHoverNote> : null}
            </Link>
          </div>

          <nav aria-label="Champion sections" className="relative grid gap-2 px-3 pb-3">
            {navigationTabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const isAvailable = tabAvailability(champion, tab);
              const description = tabDescription(champion, tab);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.id}
                  href={championTabHref(champion, tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex min-h-12 items-center rounded-xl border px-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${isActive ? 'border-amber-200/70 bg-transparent text-white ring-1 ring-inset ring-amber-200/15' : isAvailable ? 'border-white/10 bg-slate-900/60 text-slate-300 hover:border-amber-200/45 hover:bg-slate-900 hover:text-white' : 'border-white/5 bg-slate-900/45 text-slate-500 hover:border-white/15 hover:text-slate-300'}`}
                >
                  {isAvailable ? <Icon size={18} className={`shrink-0 ${isActive ? 'text-amber-200' : ''}`} aria-hidden="true" /> : <LockKeyhole size={16} className="shrink-0" aria-hidden="true" />}
                  <ChampionNavigationLabel expanded={navigationExpanded}>{tab.label}</ChampionNavigationLabel>
                  {!navigationExpanded || !isAvailable ? <HeaderHoverNote wide placement="above">{navigationExpanded ? description : `${tab.label}: ${description}`}</HeaderHoverNote> : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          <ChampionDetailHeader champion={champion} />

          {children}
        </div>
      </div>
    </main>
  );
}
