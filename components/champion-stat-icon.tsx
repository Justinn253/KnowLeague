import { AUGMENT_STAT_ICONS } from '@/lib/augment-builder';

export type ChampionStatIconName = keyof typeof AUGMENT_STAT_ICONS;

type ChampionStatIconProps = {
  stat: ChampionStatIconName;
  label: string;
  className?: string;
};

/**
 * Official League in-game stat icon rendered from the local Riot UI atlas.
 * Shared by Champion Hub displays so stat language does not drift between tabs.
 */
export function ChampionStatIcon({ stat, label, className = 'h-4 w-4' }: ChampionStatIconProps) {
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
