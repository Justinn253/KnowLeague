'use client';

import { useState } from 'react';
import { ChampionCombatProfile } from '@/components/champion-combat-profile';
import { ChampionDetailShell } from '@/components/champion-detail-shell';
import { GameIconImage } from '@/components/game-asset-image';
import { HeaderHoverNote } from '@/components/header-hover-note';
import { ChampionStatIcon, type ChampionStatIconName } from '@/components/champion-stat-icon';
import type {
  ChampionHubChampion,
  ChampionHubGameplayAbility,
  ChampionHubGameplayStat,
} from '@/lib/champion-hub';

type ChampionGameplayDetailsProps = {
  champion: ChampionHubChampion;
};

const STAT_ICONS: Record<ChampionHubGameplayStat['kind'], ChampionStatIconName> = {
  health: 'health',
  resource: 'mana',
  healthRegen: 'heal',
  resourceRegen: 'mana',
  armor: 'armor',
  attackDamage: 'ad',
  magicResist: 'mr',
  criticalDamage: 'crit',
  moveSpeed: 'speed',
  attackRange: 'range',
  attackSpeed: 'attackspeed',
  windup: 'haste',
};

function GameplayStat({ stat }: { stat: ChampionHubGameplayStat }) {
  const icon = STAT_ICONS[stat.kind];

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-amber-200/15 px-3 py-3 last:border-b-0">
      <dt className="flex min-w-0 items-center gap-2 text-sm font-black text-amber-100">
        <ChampionStatIcon stat={icon} label={`${stat.label} icon`} className="h-4 w-4" />
        <span className="truncate">{stat.label}</span>
      </dt>
      <dd className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">{stat.value}</dd>
    </div>
  );
}

export function ChampionGameplayStatistics({ champion }: { champion: ChampionHubChampion }) {
  return (
    <article aria-labelledby="champion-statistics-heading" className="relative overflow-hidden rounded-2xl border border-amber-200/20 bg-slate-950/80">
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/20 bg-[linear-gradient(90deg,rgba(120,83,29,0.85),rgba(85,53,18,0.54))] px-4 py-3 sm:px-5">
        <p className="rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-100">{champion.gameplayDetails.levelLabel}</p>
        <h2 id="champion-statistics-heading" className="text-sm font-black uppercase tracking-[0.16em] text-amber-100">Champion statistics</h2>
      </header>
      <div className="relative divide-y divide-amber-200/20">
        {champion.gameplayDetails.statGroups.map((group) => (
          <section key={group.title} aria-labelledby={`${champion.slug}-${group.title.toLowerCase().replace(/ /g, '-')}`}>
            <h3 id={`${champion.slug}-${group.title.toLowerCase().replace(/ /g, '-')}`} className="border-b border-amber-200/20 bg-amber-300/15 px-4 py-2 text-sm font-black text-amber-100 sm:px-5">
              {group.title}
            </h3>
            <dl className="grid md:grid-cols-2 md:divide-x md:divide-amber-200/15">
              {group.stats.map((stat) => <GameplayStat key={stat.label} stat={stat} />)}
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}

function AbilityFacts({ ability }: { ability: ChampionHubGameplayAbility }) {
  if (!ability.facts?.length) return null;

  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {ability.facts.map((fact) => (
        <div key={fact.label} className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3">
          <dt className="text-[0.62rem] font-black uppercase tracking-[0.15em] text-slate-500">{fact.label}</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-slate-100">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AbilityEffects({ ability }: { ability: ChampionHubGameplayAbility }) {
  if (!ability.effects?.length) return null;

  return (
    <section aria-labelledby={`${ability.abilityId}-effects-heading`} className="mt-5">
      <h3 id={`${ability.abilityId}-effects-heading`} className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-amber-200">Gameplay effects</h3>
      <dl className="mt-3 grid gap-2 lg:grid-cols-2">
        {ability.effects.map((effect) => (
          <div key={effect.label} className="rounded-xl border border-amber-200/15 bg-[linear-gradient(135deg,rgba(120,53,15,0.18),rgba(15,23,42,0.72))] p-3.5">
            <dt className="text-sm font-black text-amber-100">{effect.label}</dt>
            <dd className="mt-1 text-sm font-semibold leading-6 text-white">{effect.value}</dd>
            {effect.detail ? <p className="mt-1 text-sm leading-6 text-slate-400">{effect.detail}</p> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

function AbilityTooltipDetail({ ability }: { ability: ChampionHubGameplayAbility }) {
  if (!ability.detail) return null;

  return (
    <section className="mt-5 border-t border-amber-200/20 pt-5" aria-label={`${ability.abilityId} detailed gameplay values`}>
      <div className="space-y-3 text-sm leading-7 text-slate-200 sm:text-base">
        {ability.detail.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
      {ability.detail.notes.length ? (
        <div className="mt-4 space-y-1.5 border-l-2 border-slate-600/80 bg-slate-900/45 px-4 py-3 text-sm italic leading-6 text-slate-400">
          {ability.detail.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
      <dl className="mt-5 overflow-hidden rounded-xl border border-amber-200/20 bg-slate-950/65">
        {ability.detail.progression.map((entry) => (
          <div key={entry.label} className="grid gap-2 border-b border-amber-200/15 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.5fr)] sm:items-center sm:gap-5">
            <dt className="text-sm font-black text-amber-100">{entry.label}</dt>
            <dd className="text-sm font-bold tabular-nums text-slate-100 sm:text-right">{entry.values.join(' / ')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GameplayAbilityPanel({ champion, ability }: { champion: ChampionHubChampion; ability: ChampionHubGameplayAbility }) {
  const baseAbility = champion.abilities.find((candidate) => candidate.id === ability.abilityId) ?? champion.abilities[0];

  return (
    <div className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <span className="relative inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-amber-700/80 sm:h-20 sm:w-20">
            <GameIconImage src={baseAbility.imageUrl} alt="" width={80} height={80} className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-amber-200">{baseAbility.slot} ability</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">{baseAbility.name}</h2>
            {!ability.detail ? <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">{ability.summary}</p> : null}
          </div>
        </div>
        <div className="mt-5">
          {ability.detail ? <AbilityTooltipDetail ability={ability} /> : <><AbilityFacts ability={ability} /><AbilityEffects ability={ability} /></>}
        </div>
      </div>
    </div>
  );
}

export function ChampionGameplayAbilityDetails({
  champion,
  selectedAbilityId: snapshotAbilityId,
  idPrefix = 'gameplay',
}: {
  champion: ChampionHubChampion;
  selectedAbilityId?: string;
  /** Keeps the repeated static Discord panels accessible without duplicate DOM IDs. */
  idPrefix?: string;
}) {
  const initialAbility = champion.gameplayDetails.abilities.find((ability) => champion.abilities.find((candidate) => candidate.id === ability.abilityId)?.slot === 'Q') ?? champion.gameplayDetails.abilities[0];
  const [selectedAbilityId, setSelectedAbilityId] = useState(initialAbility.abilityId);
  const selectedAbility = champion.gameplayDetails.abilities.find((ability) => ability.abilityId === snapshotAbilityId)
    ?? champion.gameplayDetails.abilities.find((ability) => ability.abilityId === selectedAbilityId)
    ?? initialAbility;
  const isStaticSnapshot = Boolean(snapshotAbilityId);

  return (
    <section aria-labelledby="gameplay-abilities-heading" className="relative z-10 overflow-visible rounded-2xl border border-white/10 bg-slate-950/80">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <h2 id="gameplay-abilities-heading" className="text-2xl font-black tracking-tight text-white sm:text-3xl">Ability details</h2>
        <span className="text-right text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{champion.gameplayDetails.source.label}</span>
      </div>
      <div role="tablist" aria-label={`${champion.name} gameplay abilities`} className="grid grid-cols-5 divide-x divide-white/10 border-b border-white/10">
        {champion.gameplayDetails.abilities.map((gameplayAbility) => {
          const baseAbility = champion.abilities.find((candidate) => candidate.id === gameplayAbility.abilityId) ?? champion.abilities[0];
          const isSelected = gameplayAbility.abilityId === selectedAbility.abilityId;

          return (
            <button
              key={gameplayAbility.abilityId}
              id={`${idPrefix}-${gameplayAbility.abilityId}-tab`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${idPrefix}-${gameplayAbility.abilityId}-panel`}
              onClick={isStaticSnapshot ? undefined : () => setSelectedAbilityId(gameplayAbility.abilityId)}
              className={`group relative flex min-w-0 flex-col items-center gap-2 p-2 text-center transition first:rounded-tl-xl last:rounded-tr-xl focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200 sm:flex-row sm:text-left sm:p-3 ${isSelected ? 'z-10 bg-[linear-gradient(135deg,rgba(120,53,15,0.58),rgba(69,26,3,0.72))] text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.85)] after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:bg-amber-300' : 'bg-slate-950/80 text-slate-300 hover:bg-slate-900'}`}
            >
              <span className="relative inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-md border border-amber-700/80 sm:h-12 sm:w-12">
                <GameIconImage src={baseAbility.imageUrl} alt="" width={48} height={48} className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.6rem] font-black uppercase tracking-[0.15em] text-amber-200">{baseAbility.slot}</span>
                <span className="hidden truncate text-xs font-black sm:block">{baseAbility.name}</span>
              </span>
              <HeaderHoverNote compact placement="above">{baseAbility.name}</HeaderHoverNote>
            </button>
          );
        })}
      </div>
      <div id={`${idPrefix}-${selectedAbility.abilityId}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-${selectedAbility.abilityId}-tab`} className="overflow-hidden rounded-b-2xl bg-slate-950/45">
        <GameplayAbilityPanel champion={champion} ability={selectedAbility} />
      </div>
    </section>
  );
}

function GameplayAbilities({ champion }: { champion: ChampionHubChampion }) {
  return <ChampionGameplayAbilityDetails champion={champion} />;
}

/** Data-driven Champion Hub view for combat statistics and gameplay-relevant ability values. */
export function ChampionGameplayDetails({ champion }: ChampionGameplayDetailsProps) {
  return (
    <ChampionDetailShell champion={champion} activeTab="gameplay-details">
      <section aria-label={`${champion.name} combat statistics and playstyle`} className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ChampionGameplayStatistics champion={champion} />
        <ChampionCombatProfile champion={champion} />
      </section>
      <GameplayAbilities champion={champion} />
    </ChampionDetailShell>
  );
}
