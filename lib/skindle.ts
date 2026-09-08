import { normalizeAnswer, type QuizItem } from '@/lib/quiz';

export const SKINDLE_CATEGORY_IDS = [
  'champion',
  'skinLine',
  'rarity',
  'race',
  'gender',
  'role',
  'lane',
  'releaseYear',
  'resourceType',
] as const;

export type SkindleCategoryId = (typeof SKINDLE_CATEGORY_IDS)[number];
export type SkindleCategoryValues = Record<SkindleCategoryId, string>;

export type SkindleGuessResult = {
  item: QuizItem;
  values: SkindleCategoryValues;
  matches: Record<SkindleCategoryId, boolean>;
  partialMatches: Partial<Record<SkindleCategoryId, boolean>>;
  releaseYearDirection: 'higher' | 'lower' | null;
};

export type SkindleSuggestionGroup = {
  champion: string;
  skins: QuizItem[];
};

export function getReleaseYear(item: QuizItem) {
  return item.releaseDate?.slice(0, 4) || 'Unknown';
}

function toDisplayTitleCase(value: string) {
  return value.replace(/[A-Za-z]+/g, (word) => {
    if (word.length <= 2 && word === word.toUpperCase()) {
      return word;
    }

    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function formatCategoryValue(value: string) {
  if (value === 'Standard') {
    return 'Common';
  }

  return toDisplayTitleCase(value);
}

function formatLaneValue(value: string) {
  return formatCategoryValue(value.replace(/\s*\/\s*/g, ', '));
}

export function getCategoryValues(item: QuizItem): SkindleCategoryValues {
  return {
    champion: formatCategoryValue(item.champion || 'Unknown'),
    skinLine: formatCategoryValue(item.skinLine || 'None'),
    releaseYear: getReleaseYear(item),
    rarity: formatCategoryValue(item.rarity || 'Unknown'),
    gender: formatCategoryValue(item.gender || 'Unknown'),
    role: formatCategoryValue(item.role || 'Unknown'),
    race: formatCategoryValue(item.race || 'Unknown'),
    lane: formatLaneValue(item.lane || 'Unknown'),
    resourceType: formatCategoryValue(item.resourceType || 'Unknown'),
  };
}

function getMultiValueParts(value: string) {
  return value
    .split(/[,/]/)
    .map((part) => normalizeAnswer(part))
    .filter(Boolean);
}

function categoryValuesOverlap(categoryId: SkindleCategoryId, first: string, second: string) {
  if (categoryId !== 'race' && categoryId !== 'lane') {
    return first === second;
  }

  const firstParts = getMultiValueParts(first);
  const secondParts = getMultiValueParts(second);
  return firstParts.length > 0 && secondParts.length > 0 && firstParts.some((part) => secondParts.includes(part));
}

export function compareGuess(item: QuizItem, target: QuizItem): SkindleGuessResult {
  const values = getCategoryValues(item);
  const targetValues = getCategoryValues(target);
  const matches = SKINDLE_CATEGORY_IDS.reduce<Record<SkindleCategoryId, boolean>>((acc, categoryId) => {
    acc[categoryId] = values[categoryId] === targetValues[categoryId];
    return acc;
  }, {} as Record<SkindleCategoryId, boolean>);
  const partialMatches: Partial<Record<SkindleCategoryId, boolean>> = {};

  (['race', 'lane'] as const).forEach((categoryId) => {
    if (!matches[categoryId] && categoryValuesOverlap(categoryId, values[categoryId], targetValues[categoryId])) {
      partialMatches[categoryId] = true;
    }
  });

  const guessedYear = Number(values.releaseYear);
  const targetYear = Number(targetValues.releaseYear);
  const releaseYearDirection =
    Number.isFinite(guessedYear) && Number.isFinite(targetYear) && guessedYear !== targetYear
      ? guessedYear < targetYear
        ? 'higher'
        : 'lower'
      : null;

  return { item, values, matches, partialMatches, releaseYearDirection };
}

/** Keep autocomplete candidates consistent with every exact or partial clue already revealed. */
export function matchesEarnedSkindleClues(item: QuizItem, guesses: readonly SkindleGuessResult[]) {
  const candidateValues = getCategoryValues(item);

  return guesses.every((guess) =>
    SKINDLE_CATEGORY_IDS.every((categoryId) => {
      if (categoryId === 'role') {
        return true;
      }

      if (guess.matches[categoryId]) {
        return candidateValues[categoryId] === guess.values[categoryId];
      }

      if (guess.partialMatches[categoryId]) {
        return categoryValuesOverlap(categoryId, candidateValues[categoryId], guess.values[categoryId]);
      }

      return true;
    }),
  );
}

export function groupSkindleSuggestions(skins: readonly QuizItem[]): SkindleSuggestionGroup[] {
  const skinsByChampion = new Map<string, QuizItem[]>();

  skins.forEach((skin) => {
    const champion = skin.champion || 'Unknown';
    const championSkins = skinsByChampion.get(champion) ?? [];
    championSkins.push(skin);
    skinsByChampion.set(champion, championSkins);
  });

  return Array.from(skinsByChampion.entries())
    .sort(([leftChampion], [rightChampion]) => leftChampion.localeCompare(rightChampion))
    .map(([champion, championSkins]) => ({
      champion,
      skins: championSkins.sort((left, right) => {
        if (!left.releaseDate && right.releaseDate) return 1;
        if (left.releaseDate && !right.releaseDate) return -1;

        return (left.releaseDate ?? '').localeCompare(right.releaseDate ?? '')
          || left.answer.localeCompare(right.answer)
          || left.id.localeCompare(right.id);
      }),
    }));
}
