import abilityItems from '@/data/catalogs/ability-items.json';
import skinItems from '@/data/catalogs/skin-items.json';
import type { QuizItem } from '@/lib/quiz';

export function getAbilityCatalog(): QuizItem[] {
  return abilityItems as QuizItem[];
}

export function getSkinCatalog(): QuizItem[] {
  return skinItems as QuizItem[];
}

export function getAnswerList(items: readonly QuizItem[]) {
  return Array.from(new Set(items.map((item) => item.answer))).sort();
}

export function getAnswersByType(items: readonly QuizItem[]) {
  const answersByType = items.reduce<Record<string, string[]>>((acc, item) => {
    acc[item.type] = acc[item.type] ?? [];

    if (!acc[item.type].includes(item.answer)) {
      acc[item.type].push(item.answer);
    }

    return acc;
  }, {});

  return Object.fromEntries(
    Object.entries(answersByType).map(([type, answers]) => [type, answers.sort()]),
  );
}
