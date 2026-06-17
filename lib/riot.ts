import type { QuizItem, QuizItemType } from '@/lib/quiz';
import { shuffle } from '@/lib/quiz';

const DATA_DRAGON_VERSION = '14.24.1';
const DATA_DRAGON_BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;
const FALLBACK_CHAMPION_IDS = ['Yasuo', 'Ashe', 'Lux', 'Thresh', 'Ahri', 'Garen'] as const;

type DataDragonImage = {
  full: string;
};

type DataDragonSkill = {
  name: string;
  description: string;
  image: DataDragonImage;
};

type DataDragonChampion = {
  id: string;
  name: string;
  title: string;
  tags: string[];
  image: DataDragonImage;
  passive: DataDragonSkill;
  spells: DataDragonSkill[];
};

type DataDragonChampionResponse = {
  data: Record<string, DataDragonChampion>;
};

type DataDragonChampionIndexResponse = {
  data: Record<string, { id: string }>;
};

export type ChampionSkill = {
  name: string;
  description: string;
  imageUrl: string;
};

export type ChampionData = {
  id: string;
  name: string;
  title: string;
  tags: string[];
  imageUrl: string;
  passive: ChampionSkill;
  spells: ChampionSkill[];
};

function championIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE_URL}/img/champion/${imageFile}`;
}

function spellIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE_URL}/img/spell/${imageFile}`;
}

function passiveIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE_URL}/img/passive/${imageFile}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

function toChampionData(champion: DataDragonChampion): ChampionData {
  return {
    id: champion.id,
    name: champion.name,
    title: champion.title,
    tags: champion.tags,
    imageUrl: championIconUrl(champion.image.full),
    passive: {
      name: champion.passive.name,
      description: champion.passive.description,
      imageUrl: passiveIconUrl(champion.passive.image.full),
    },
    spells: champion.spells.map((spell) => ({
      name: spell.name,
      description: spell.description,
      imageUrl: spellIconUrl(spell.image.full),
    })),
  };
}

function toQuizItems(champion: ChampionData): QuizItem[] {
  const passiveItem: QuizItem = {
    id: `${champion.id}-passive`,
    type: 'passive',
    title: 'Passive Ability',
    question: champion.passive.name,
    answer: champion.passive.name,
    imageUrl: champion.passive.imageUrl,
    champion: champion.name,
  };

  const spellItems = champion.spells.map<QuizItem>((spell, index) => {
    const type: QuizItemType = index === 3 ? 'ultimate' : 'spell';

    return {
      id: `${champion.id}-spell-${index}`,
      type,
      title: type === 'ultimate' ? 'Ultimate Clue' : 'Ability Icon',
      question: spell.name,
      answer: spell.name,
      imageUrl: spell.imageUrl,
      champion: champion.name,
    };
  });

  return [passiveItem, ...spellItems].filter((item) => item.answer && item.imageUrl);
}

export async function getChampionData(championId: string): Promise<ChampionData | null> {
  const json = await fetchJson<DataDragonChampionResponse>(
    `${DATA_DRAGON_BASE_URL}/data/en_US/champion/${championId}.json`,
  );
  const champion = json ? Object.values(json.data)[0] : null;

  return champion ? toChampionData(champion) : null;
}

async function getChampionIds() {
  const json = await fetchJson<DataDragonChampionIndexResponse>(
    `${DATA_DRAGON_BASE_URL}/data/en_US/champion.json`,
  );

  return json ? Object.keys(json.data) : null;
}

async function getQuizItemsForChampionIds(championIds: readonly string[]) {
  const results = await Promise.allSettled(championIds.map((championId) => getChampionData(championId)));

  return results.flatMap((result) => {
    if (result.status === 'rejected' || !result.value) {
      return [];
    }

    return toQuizItems(result.value);
  });
}

export async function getQuizItems(): Promise<QuizItem[]> {
  const championIds = await getChampionIds().catch(() => null);
  const primaryItems = championIds ? await getQuizItemsForChampionIds(championIds) : [];

  if (primaryItems.length > 0) {
    return primaryItems;
  }

  return shuffle(await getQuizItemsForChampionIds(FALLBACK_CHAMPION_IDS));
}
