import abilityItems from '@/data/catalogs/ability-items.json';
import championGameplayMetadata from '@/data/catalogs/champion-gameplay-metadata.json';
import skinItems from '@/data/catalogs/skin-items.json';
import type { QuizItem } from '@/lib/quiz';

type ChampionGameplayMetadata = {
  resourceType?: string;
  lane?: string;
};

const championGameplayByName = championGameplayMetadata as Record<string, ChampionGameplayMetadata>;

const abilityCatalog = abilityItems as QuizItem[];
const skinCatalog = (skinItems as QuizItem[]).map((item) => {
  const metadata = championGameplayByName[item.champion];

  return {
    ...item,
    resourceType: item.resourceType ?? metadata?.resourceType ?? 'Unknown',
    lane: item.lane ?? metadata?.lane ?? 'Unknown',
  };
});

const answerListCache = new WeakMap<readonly QuizItem[], string[]>();
const answersByTypeCache = new WeakMap<
  readonly QuizItem[],
  Record<string, string[]>
>();

function formatSkincognitoRarity(rarity: string | null | undefined) {
  const cleanRarity = rarity || 'Unknown';
  return cleanRarity.startsWith('k') ? cleanRarity.slice(1) : cleanRarity;
}

const skincognitoAnswerMetadata = {
  skin: skinCatalog.map((skin) => ({
    id: skin.id,
    label: skin.answer,
    imageUrl: skin.imageUrl,
  })),
  champion: Array.from(new Set(skinCatalog.map((skin) => skin.champion).filter(Boolean))).sort(),
  skinLine: Array.from(new Set(skinCatalog.map((skin) => skin.skinLine || 'Unknown'))).sort(),
  releaseYear: Array.from(new Set(skinCatalog.map((skin) => skin.releaseDate?.slice(0, 4) || 'Unknown'))).sort(),
  rarity: Array.from(new Set(skinCatalog.map((skin) => formatSkincognitoRarity(skin.rarity))))
    .filter((rarity) => rarity !== 'Exalted')
    .sort(),
  gender: Array.from(new Set(skinCatalog.map((skin) => skin.gender || 'Unknown'))).sort(),
  role: Array.from(new Set(skinCatalog.map((skin) => skin.role || 'Unknown'))).sort(),
  race: Array.from(
    new Set(
      skinCatalog.flatMap((skin) =>
        (skin.race || 'Unknown').split(',').map((race) => race.trim()),
      ),
    ),
  ).sort(),
};

export function getAbilityCatalog(): QuizItem[] {
  return abilityCatalog;
}

export function getSkinCatalog(): QuizItem[] {
  return skinCatalog;
}

export function getAnswerList(items: readonly QuizItem[]) {
  const cachedAnswerList = answerListCache.get(items);

  if (cachedAnswerList) {
    return cachedAnswerList;
  }

  const answerList = Array.from(new Set(items.map((item) => item.answer))).sort();
  answerListCache.set(items, answerList);

  return answerList;
}

export function getAnswersByType(items: readonly QuizItem[]) {
  const cachedAnswersByType = answersByTypeCache.get(items);

  if (cachedAnswersByType) {
    return cachedAnswersByType;
  }

  const answersByType = items.reduce<Record<string, string[]>>((acc, item) => {
    acc[item.type] = acc[item.type] ?? [];

    if (!acc[item.type].includes(item.answer)) {
      acc[item.type].push(item.answer);
    }

    return acc;
  }, {});

  const sortedAnswersByType = Object.fromEntries(
    Object.entries(answersByType).map(([type, answers]) => [type, answers.sort()]),
  );

  answersByTypeCache.set(items, sortedAnswersByType);
  return sortedAnswersByType;
}

export function getSkincognitoAnswerMetadata() {
  return skincognitoAnswerMetadata;
}
