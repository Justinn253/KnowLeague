import abilityItems from '@/data/catalogs/ability-items.json';
import championGameplayMetadata from '@/data/catalogs/champion-gameplay-metadata.json';
import skinItems from '@/data/catalogs/skin-items.json';
import type { QuizItem } from '@/lib/quiz';

type ChampionGameplayMetadata = {
  resourceType?: string;
  lane?: string;
};

const championGameplayByName = championGameplayMetadata as Record<string, ChampionGameplayMetadata>;

export function getAbilityCatalog(): QuizItem[] {
  return abilityItems as QuizItem[];
}

export function getSkinCatalog(): QuizItem[] {
  return (skinItems as QuizItem[]).map((item) => {
    const metadata = championGameplayByName[item.champion];

    return {
      ...item,
      resourceType: item.resourceType ?? metadata?.resourceType ?? 'Unknown',
      lane: item.lane ?? metadata?.lane ?? 'Unknown',
    };
  });
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
