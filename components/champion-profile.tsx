'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CircleDotDashed,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { GameIconImage, GameSplashImage } from '@/components/game-asset-image';
import { HeaderHoverNote } from '@/components/header-hover-note';
import { AUGMENT_STAT_ICONS } from '@/lib/augment-builder';
import {
  CHAMPION_HUB_LANES,
  type ChampionHubAbility,
  type ChampionHubChampion,
  type ChampionHubClass,
  type ChampionHubLane,
  type ChampionHubPlaystyle,
} from '@/lib/champion-hub';

type ChampionProfileProps = {
  champion: ChampionHubChampion;
};

const futureTabs = [
  { label: 'Skins', description: 'Skin gallery and chromas' },
  { label: 'Lore', description: 'Stories and world connections' },
  { label: 'Voice lines', description: 'Quotes and audio archive' },
  { label: 'Gameplay details', description: 'Deep ability and stat details' },
] as const;

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

type AugmentStatIconName = keyof typeof AUGMENT_STAT_ICONS;

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
      {CHAMPION_HUB_LANES.map((lane) => {
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

type PlaystyleMetricConfig = {
  key: keyof ChampionHubPlaystyle;
  label: string;
  angle: number;
  icon: AugmentStatIconName;
};

const PLAYSTYLE_METRICS: readonly PlaystyleMetricConfig[] = [
  { key: 'damage', label: 'Damage', angle: -90, icon: 'ad' },
  { key: 'utility', label: 'Utility', angle: -18, icon: 'haste' },
  { key: 'durability', label: 'Durability', angle: 54, icon: 'shield' },
  { key: 'mobility', label: 'Mobility', angle: 126, icon: 'speed' },
  { key: 'crowdControl', label: 'Crowd control', angle: 198, icon: 'tenacity' },
];

const PLAYSTYLE_RING_RADII = [31, 49, 67] as const;
const PLAYSTYLE_RING_WIDTHS = [11, 11, 9] as const;

function pointOnDial(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: 90 + radius * Math.cos(radians),
    y: 90 + radius * Math.sin(radians),
  };
}

function describeDialArc(radius: number, startAngle: number, endAngle: number) {
  const start = pointOnDial(radius, startAngle);
  const end = pointOnDial(radius, endAngle);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

function AugmentStatIcon({ stat, label, className = 'h-4 w-4' }: { stat: AugmentStatIconName; label: string; className?: string }) {
  const uv = AUGMENT_STAT_ICONS[stat];
  const width = uv.endX - uv.startX;
  const height = uv.endY - uv.startY;

  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundImage: 'url(/augments/stat-icons.png)',
        backgroundSize: `${100 / width}% ${100 / height}%`,
        backgroundPosition: `${(uv.startX / (1 - width)) * 100}% ${(uv.startY / (1 - height)) * 100}%`,
      }}
    />
  );
}

function PlaystyleDial({ champion }: { champion: ChampionHubChampion }) {
  return (
    <div className="relative aspect-square min-w-0" aria-label={`${champion.name} playstyle profile`}>
      <svg viewBox="0 0 180 180" className="h-full w-full" role="img" aria-label={`${champion.name} playstyle profile`}>
        <title>{champion.name} playstyle profile</title>
        {PLAYSTYLE_METRICS.flatMap((metric) =>
          PLAYSTYLE_RING_RADII.map((radius, ringIndex) => {
            const isActive = ringIndex < champion.playstyle[metric.key];
            const arc = describeDialArc(radius, metric.angle - 32, metric.angle + 32);

            return (
              <path
                key={`${metric.key}-${radius}`}
                d={arc}
                fill="none"
                stroke={isActive ? (ringIndex === 2 ? 'rgba(174,230,232,0.94)' : 'rgba(4,169,201,0.96)') : 'rgba(3,48,67,0.96)'}
                strokeWidth={PLAYSTYLE_RING_WIDTHS[ringIndex]}
              />
            );
          }),
        )}
        <circle cx="90" cy="90" r="21" fill="#032b3d" stroke="rgba(9,109,136,0.95)" strokeWidth="4" />
        <circle cx="90" cy="90" r="13" fill="rgba(3,153,184,0.98)" stroke="rgba(126,231,243,0.94)" strokeWidth="3" />
      </svg>
      {PLAYSTYLE_METRICS.flatMap((metric) => {
        const position = pointOnDial(85, metric.angle);
        const ringPosition = pointOnDial(49, metric.angle);
        const score = champion.playstyle[metric.key];

        return [
          <span
            key={`${metric.key}-icon`}
            className="absolute inline-flex -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(position.x / 180) * 100}%`, top: `${(position.y / 180) * 100}%` }}
          >
            <AugmentStatIcon stat={metric.icon} label={metric.label} className="h-3.5 w-3.5" />
          </span>,
          <span
            key={`${metric.key}-ring`}
            aria-label={`${metric.label}: ${score} out of 3`}
            className="group absolute z-10 block h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-help"
            style={{ left: `${(ringPosition.x / 180) * 100}%`, top: `${(ringPosition.y / 180) * 100}%` }}
          >
            <HeaderHoverNote compact placement="above">{metric.label}: {score} / 3</HeaderHoverNote>
          </span>,
        ];
      })}
    </div>
  );
}

function CombatProfile({ champion }: { champion: ChampionHubChampion }) {
  const difficultySegments = champion.difficulty === 'High' ? 3 : champion.difficulty === 'Moderate' ? 2 : 1;

  return (
    <aside aria-label={`${champion.name} combat profile`} className="relative z-10 overflow-visible rounded-2xl border border-red-300/20 bg-slate-950/80 p-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-red-500/15 blur-3xl" />
      </div>
      <div className="relative grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="grid content-center gap-4">
          <div>
            <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-slate-500">Damage</p>
            <p className="mt-1 text-base font-black text-white">{champion.damageType}</p>
          </div>
          <div>
            <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-slate-500">Style</p>
            <div className="group relative mt-2 flex items-center gap-2" aria-label={`Ability power to attack damage spectrum; ${champion.name} mainly uses ${champion.primaryCombatStyle.toLowerCase()}`}>
              <AugmentStatIcon stat="ap" label="Ability power" />
              <span className="relative h-0.5 flex-1 overflow-visible bg-stone-300/65">
                <span className="absolute left-[90%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]" />
              </span>
              <AugmentStatIcon stat="ad" label="Attack damage" />
              <HeaderHoverNote compact placement="above">Mainly uses {champion.primaryCombatStyle.toLowerCase()}</HeaderHoverNote>
            </div>
          </div>
          <div>
            <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-slate-500">Difficulty <span className="text-red-100">- {champion.difficulty}</span></p>
            <div className="mt-2 flex gap-1.5" aria-label={`${champion.difficulty} difficulty`}>
              {[1, 2, 3].map((segment) => (
                <span key={segment} className={`h-1.5 flex-1 rounded-full ${segment <= difficultySegments ? 'bg-red-300' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>
        </div>
        <PlaystyleDial champion={champion} />
      </div>
    </aside>
  );
}

function AbilityPanel({ ability, champion }: { ability: ChampionHubAbility; champion: ChampionHubChampion }) {
  return (
    <div className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" />
      <div className="relative min-w-0">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-amber-700/80 sm:h-20 sm:w-20">
            <GameIconImage src={ability.imageUrl} alt="" width={80} height={80} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{ability.name}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{ability.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={champion.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/45 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:border-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100"
            >
              Official champion page <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-4 text-sm font-bold text-slate-400">
              <LockKeyhole size={14} aria-hidden="true" /> Gameplay details coming soon
            </span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChampionNavigationLabel({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <span className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-300 ease-out ${expanded ? 'ml-3 max-w-44 opacity-100' : 'ml-0 max-w-0 opacity-0'}`}>
      {children}
    </span>
  );
}

export function ChampionProfile({ champion }: ChampionProfileProps) {
  const [navigationExpanded, setNavigationExpanded] = useState(true);
  const [selectedAbilityId, setSelectedAbilityId] = useState(champion.abilities.find((ability) => ability.slot === 'Q')?.id ?? champion.abilities[0].id);
  const selectedAbility = champion.abilities.find((ability) => ability.id === selectedAbilityId) ?? champion.abilities[0];

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
            <span
              aria-current="page"
              className="group relative flex min-h-12 items-center rounded-xl border border-amber-200/70 bg-transparent px-3 text-sm font-black text-white ring-1 ring-inset ring-amber-200/15"
            >
              <CircleDotDashed size={18} className="shrink-0 text-amber-200" aria-hidden="true" />
              <ChampionNavigationLabel expanded={navigationExpanded}>Overview</ChampionNavigationLabel>
              {!navigationExpanded ? <HeaderHoverNote compact placement="above">Overview</HeaderHoverNote> : null}
            </span>
            {futureTabs.map((tab) => (
              <span
                key={tab.label}
                aria-disabled="true"
                className="group relative flex min-h-12 cursor-not-allowed items-center rounded-xl border border-white/5 bg-slate-900/45 px-3 text-sm font-bold text-slate-500"
              >
                <LockKeyhole size={16} className="shrink-0" aria-hidden="true" />
                <ChampionNavigationLabel expanded={navigationExpanded}>{tab.label}</ChampionNavigationLabel>
                <HeaderHoverNote wide placement="above">{navigationExpanded ? tab.description : `${tab.label}: ${tab.description}`}</HeaderHoverNote>
              </span>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          <header className="relative isolate z-10 rounded-2xl border border-red-300/25 bg-slate-950/90">
            <div className="absolute inset-0 -z-10 overflow-hidden rounded-2xl">
              <GameSplashImage
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

          <section aria-label={`${champion.name} overview`} className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
              <p className="text-base leading-7 text-slate-200">{champion.lore}</p>
            </article>
            <CombatProfile champion={champion} />
          </section>

          <section aria-label={`${champion.name} ability kit`} className="relative z-10 overflow-visible rounded-2xl border border-white/10 bg-slate-950/80">
            <div role="tablist" aria-label={`${champion.name} abilities`} className="grid grid-cols-5 divide-x divide-white/10 border-b border-white/10">
              {champion.abilities.map((ability) => {
                const isSelected = ability.id === selectedAbility.id;
                return (
                  <button
                    key={ability.id}
                    id={`${ability.id}-tab`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={`${ability.id}-panel`}
                    onClick={() => setSelectedAbilityId(ability.id)}
                    className={`group relative flex min-w-0 flex-col items-center gap-2 p-2 text-center transition first:rounded-tl-2xl last:rounded-tr-2xl focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200 sm:flex-row sm:text-left sm:p-3 ${isSelected ? 'z-10 bg-[linear-gradient(135deg,rgba(120,53,15,0.58),rgba(69,26,3,0.72))] text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.85)] after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:bg-amber-300' : 'bg-slate-950/80 text-slate-300 hover:bg-slate-900'}`}
                  >
                    <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-md border border-amber-700/80 sm:h-14 sm:w-14">
                      <GameIconImage src={ability.imageUrl} alt="" width={56} height={56} className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.6rem] font-black uppercase tracking-[0.15em] text-amber-200">{ability.slot}</span>
                      <span className="hidden truncate text-xs font-black sm:block">{ability.name}</span>
                    </span>
                    <HeaderHoverNote compact placement="above">{ability.name}</HeaderHoverNote>
                  </button>
                );
              })}
            </div>
            <div id={`${selectedAbility.id}-panel`} role="tabpanel" aria-labelledby={`${selectedAbility.id}-tab`} className="overflow-hidden rounded-b-2xl bg-slate-950/45">
              <AbilityPanel ability={selectedAbility} champion={champion} />
            </div>
          </section>

          <section aria-labelledby="eternals-heading" className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
            <h2 id="eternals-heading" className="text-2xl font-black tracking-tight text-white sm:text-3xl">Eternals</h2>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {champion.eternals.map((eternal) => (
                <article key={eternal.series} className="relative overflow-hidden rounded-xl border border-amber-200/15 bg-[linear-gradient(135deg,rgba(120,53,15,0.17),rgba(15,23,42,0.9)_46%,rgba(69,10,10,0.3))] p-5 transition hover:border-amber-200/40 hover:bg-[linear-gradient(135deg,rgba(120,53,15,0.25),rgba(15,23,42,0.94)_46%,rgba(69,10,10,0.42))]">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-300/10 blur-3xl" />
                  <p className="relative text-base font-black text-white">{eternal.series}</p>
                  <dl className="relative mt-4 grid gap-4">
                    {eternal.milestones.map((milestone) => (
                      <div key={milestone.name} className="border-l-2 border-amber-300/45 pl-3">
                        <dt className="text-sm font-bold text-amber-100">{milestone.name}</dt>
                        <dd className="mt-0.5 text-sm leading-6 text-slate-400">{milestone.description}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
