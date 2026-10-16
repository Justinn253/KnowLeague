import { HeaderHoverNote } from '@/components/header-hover-note';
import { ChampionStatIcon, type ChampionStatIconName } from '@/components/champion-stat-icon';
import type { ChampionHubChampion, ChampionHubPlaystyle } from '@/lib/champion-hub';

type PlaystyleMetricConfig = {
  key: keyof ChampionHubPlaystyle;
  label: string;
  angle: number;
  icon: ChampionStatIconName;
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
            <ChampionStatIcon stat={metric.icon} label={metric.label} className="h-3.5 w-3.5" />
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

/** Shared Overview and Gameplay Details playstyle panel. */
export function ChampionCombatProfile({ champion }: { champion: ChampionHubChampion }) {
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
              <ChampionStatIcon stat="ap" label="Ability power" />
              <span className="relative h-0.5 flex-1 overflow-visible bg-stone-300/65">
                <span className="absolute left-[90%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]" />
              </span>
              <ChampionStatIcon stat="ad" label="Attack damage" />
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
