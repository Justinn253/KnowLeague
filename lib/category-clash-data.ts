import categoryData from '@/data/category-clash-categories.json';
import { shuffle } from '@/lib/quiz';

export type CategoryClashAnswer = {
  id: string;
  label: string;
  aliases?: string[];
};

export type CategoryClashCategory = {
  id: string;
  group: string;
  label: string;
  prompt: string;
  source: string;
  notes?: string;
  answers: CategoryClashAnswer[];
};

type CategoryClashData = {
  version: number;
  name: string;
  categories: CategoryClashCategory[];
};

const data = categoryData as CategoryClashData;
const categories = data.categories.filter((category) => category.answers.length > 0);
const categoryById = new Map(categories.map((category) => [category.id, category]));
const DEFAULT_EXCLUDED_GROUPS = new Set(['Skin Lines']);
const GLOBAL_ITEM_ANSWERS_KEY = '__items__';

const LEETSPEAK_MAP: Record<string, string> = {
  '&': 'and',
};

export function getCategoryClashCategories() {
  return categories;
}

export function getCategoryClashCategory(categoryId: string | null | undefined) {
  return categoryId ? categoryById.get(categoryId) ?? null : null;
}

export function normalizeCategoryClashAnswer(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[&]/g, (char) => ` ${LEETSPEAK_MAP[char]} `)
    .replace(/\band\b/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactAnswer(value: string) {
  return normalizeCategoryClashAnswer(value).replace(/\s+/g, '');
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function answerVariants(answer: CategoryClashAnswer) {
  return [answer.label, ...(answer.aliases ?? [])].map(compactAnswer).filter(Boolean);
}

export function matchCategoryClashAnswer(
  guess: string,
  category: CategoryClashCategory,
  unavailableAnswerIds: ReadonlySet<string> = new Set(),
) {
  const normalizedGuess = compactAnswer(guess);
  if (!normalizedGuess) {
    return null;
  }

  const exactMatch = category.answers.find((answer) => (
    !unavailableAnswerIds.has(answer.id) &&
    answerVariants(answer).some((variant) => variant === normalizedGuess)
  ));
  if (exactMatch) {
    return exactMatch;
  }

  if (normalizedGuess.length < 4) {
    return null;
  }

  return category.answers.find((answer) => (
    !unavailableAnswerIds.has(answer.id) &&
    answerVariants(answer).some((variant) => (
      Math.min(variant.length, normalizedGuess.length) >= 4 &&
      Math.abs(variant.length - normalizedGuess.length) <= 1 &&
      levenshteinDistance(variant, normalizedGuess) <= 1
    ))
  )) ?? null;
}

export function getDefaultCategoryClashCategoryIds() {
  return categories
    .filter((category) => !DEFAULT_EXCLUDED_GROUPS.has(category.group))
    .map((category) => category.id);
}

export function normalizeEnabledCategoryIds(value: unknown, fallbackToDefault = true) {
  const ids = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  const uniqueIds = [...new Set(ids)].filter((id) => categoryById.has(id));
  return uniqueIds.length > 0 || !fallbackToDefault ? uniqueIds : getDefaultCategoryClashCategoryIds();
}

export function getAvailableCategoryIds(
  enabledCategoryIds: readonly string[],
  usedAnswersByCategory: Record<string, string[]>,
) {
  return enabledCategoryIds.filter((categoryId) => {
    const category = getCategoryClashCategory(categoryId);
    if (!category) return false;
    const usedAnswerIds = new Set([
      ...(usedAnswersByCategory[categoryId] ?? []),
      ...(category.group === 'Items' ? usedAnswersByCategory[GLOBAL_ITEM_ANSWERS_KEY] ?? [] : []),
    ]);
    return category.answers.some((answer) => !usedAnswerIds.has(answer.id));
  });
}

export function getRandomAvailableCategoryId(
  enabledCategoryIds: readonly string[],
  usedAnswersByCategory: Record<string, string[]>,
) {
  const availableCategoryIds = getAvailableCategoryIds(enabledCategoryIds, usedAnswersByCategory);
  return shuffle(availableCategoryIds)[0] ?? null;
}
