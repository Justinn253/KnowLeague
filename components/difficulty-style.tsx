const difficultyStyles: Record<string, { text: string; selected: string; dot: string }> = {
  iron: {
    text: 'text-[#c9825b]',
    selected: 'border-[#a95f3d]/70 bg-[#a95f3d]/15',
    dot: 'border-[#c9825b] bg-[#c9825b]',
  },
  gold: {
    text: 'text-amber-300',
    selected: 'border-amber-300/60 bg-amber-300/10',
    dot: 'border-amber-300 bg-amber-300',
  },
  diamond: {
    text: 'text-blue-300',
    selected: 'border-blue-300/60 bg-blue-400/10',
    dot: 'border-blue-300 bg-blue-300',
  },
  challenger: {
    text: 'text-cyan-200',
    selected: 'border-cyan-200/60 bg-cyan-300/10',
    dot: 'border-cyan-200 bg-cyan-200',
  },
};

const fallbackStyle = {
  text: 'text-slate-200',
  selected: 'border-white/25 bg-white/10',
  dot: 'border-slate-300 bg-slate-300',
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
