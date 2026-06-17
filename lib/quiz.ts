export type QuizItemType = 'spell' | 'passive' | 'ultimate' | 'skin';

export type QuizItem = {
  id: string;
  type: QuizItemType;
  title: string;
  question: string;
  answer: string;
  imageUrl: string;
  champion: string;
  releaseDate?: string | null;
  skinLine?: string | null;
  rarity?: string | null;
  role?: string | null;
  gender?: string | null;
  race?: string | null;
  guessed?: boolean;
};

export type CompletedTime = {
  total: number;
  duration: number;
};

export const OPTION_DELAY_SECONDS = 10;
export const PENALTY_TIMES_SECONDS = [5, 10, 20, 30] as const;

export function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getNextUtcResetLabel(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function normalizeAnswer(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

export function shuffle<T>(items: readonly T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getAbilityKeyLabel(item: QuizItem) {
  if (item.type === 'passive') {
    return 'Passive';
  }

  if (item.type === 'ultimate') {
    return 'R';
  }

  const match = item.id.match(/-spell-(\d+)$/);
  const index = match ? Number(match[1]) : NaN;
  return ['Q', 'W', 'E', 'R'][index] || 'Spell';
}
