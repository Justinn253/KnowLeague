export const leagueRankTiers = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
  'challenger',
] as const;

export type LeagueRankTier = (typeof leagueRankTiers)[number];

const difficultyStyles: Record<string, { text: string; selected: string; dot: string; border: string; bg: string }> = {
  iron: {
    text: 'text-[#c9825b]',
    selected: 'border-[#a95f3d]/70 bg-[#a95f3d]/15',
    dot: 'border-[#c9825b] bg-[#c9825b]',
    border: 'border-[#c9825b]/60',
    bg: 'bg-[#a95f3d]/15',
  },
  bronze: {
    text: 'text-[#cd8b73]',
    selected: 'border-[#cd8b73]/70 bg-[#8f4f42]/15',
    dot: 'border-[#cd8b73] bg-[#cd8b73]',
    border: 'border-[#cd8b73]/60',
    bg: 'bg-[#8f4f42]/15',
  },
  silver: {
    text: 'text-[#c8d6f1]',
    selected: 'border-[#c8d6f1]/70 bg-[#94a3b8]/15',
    dot: 'border-[#c8d6f1] bg-[#c8d6f1]',
    border: 'border-[#c8d6f1]/60',
    bg: 'bg-[#94a3b8]/15',
  },
  gold: {
    text: 'text-amber-300',
    selected: 'border-amber-300/60 bg-amber-300/10',
    dot: 'border-amber-300 bg-amber-300',
    border: 'border-amber-300/60',
    bg: 'bg-amber-300/10',
  },
  platinum: {
    text: 'text-cyan-300',
    selected: 'border-cyan-300/60 bg-cyan-400/10',
    dot: 'border-cyan-300 bg-cyan-300',
    border: 'border-cyan-300/60',
    bg: 'bg-cyan-400/10',
  },
  emerald: {
    text: 'text-emerald-300',
    selected: 'border-emerald-300/60 bg-emerald-400/10',
    dot: 'border-emerald-300 bg-emerald-300',
    border: 'border-emerald-300/60',
    bg: 'bg-emerald-400/10',
  },
  diamond: {
    text: 'text-blue-300',
    selected: 'border-blue-300/60 bg-blue-400/10',
    dot: 'border-blue-300 bg-blue-300',
    border: 'border-blue-300/60',
    bg: 'bg-blue-400/10',
  },
  master: {
    text: 'text-fuchsia-300',
    selected: 'border-fuchsia-300/60 bg-fuchsia-400/10',
    dot: 'border-fuchsia-300 bg-fuchsia-300',
    border: 'border-fuchsia-300/60',
    bg: 'bg-fuchsia-400/10',
  },
  grandmaster: {
    text: 'text-orange-300',
    selected: 'border-orange-300/60 bg-orange-500/10',
    dot: 'border-orange-300 bg-orange-300',
    border: 'border-orange-300/60',
    bg: 'bg-orange-500/10',
  },
  challenger: {
    text: 'text-cyan-200',
    selected: 'border-cyan-200/60 bg-cyan-300/10',
    dot: 'border-cyan-200 bg-cyan-200',
    border: 'border-cyan-200/60',
    bg: 'bg-cyan-300/10',
  },
};

const fallbackStyle = {
  text: 'text-slate-200',
  selected: 'border-white/25 bg-white/10',
  dot: 'border-slate-300 bg-slate-300',
  border: 'border-white/25',
  bg: 'bg-white/10',
};

export function getDifficultyStyle(difficulty: string) {
  return difficultyStyles[difficulty.toLowerCase()] ?? fallbackStyle;
}

export function formatDifficultyName(difficulty: string) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
}

export function DifficultyLabel({ difficulty, className = '' }: { difficulty: string; className?: string }) {
  return <span className={`font-bold ${getDifficultyStyle(difficulty).text} ${className}`}>{formatDifficultyName(difficulty)}</span>;
}

export function getLeagueRankStyle(rank: string) {
  return getDifficultyStyle(rank);
}

export function getLeagueRankIconUrl(rank: string) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${rank.toLowerCase()}.png`;
}
