import type { QuizItem } from '@/lib/quiz';

const OMITTED_SKIN_LINES = new Set(['Beta', 'N/A', 'Unknown']);

const SKIN_LINE_OVERRIDES: Record<string, string> = {
  Kaiju: 'Mecha',
};

const WORLD_CHAMPION_TEAMS_BY_SKIN_LINE: Record<string, string> = {
  'World Champions: 2011': 'Fnatic',
  'World Champions: 2012': 'TPA',
  'World Champions: 2013': 'SKT T1',
  'World Champions: 2014': 'SSW',
  'World Champions: 2015': 'SKT T1',
  'World Champions: 2016': 'SKT T1',
  'World Champions: 2017': 'SSG',
  'World Champions: 2018': 'iG',
  'World Champions: 2019': 'FPX',
  'World Champions: 2020': 'DWG',
  'World Champions: 2021': 'EDG',
  'World Champions: 2022': 'DRX',
  'World Champions: 2023': 'T1',
  'World Champions: 2024': 'T1',
};

const skinThemeAnswerListCache = new WeakMap<readonly QuizItem[], string[]>();
const skinThemeQuizItemCache = new WeakMap<readonly QuizItem[], QuizItem[]>();

function inferWorldChampionTeam(item: QuizItem) {
  const normalizedAnswer = item.answer.replace(/^Prestige\s+/i, '').trim();
  if (normalizedAnswer.endsWith(item.champion)) {
    return normalizedAnswer.slice(0, -item.champion.length).trim();
  }

  return normalizedAnswer.split(/\s+/)[0] ?? '';
}

export function getSkinThemeAnswer(item: QuizItem) {
  const skinLine = item.skinLine?.trim();
  if (!skinLine || OMITTED_SKIN_LINES.has(skinLine)) {
    return null;
  }

  if (skinLine in SKIN_LINE_OVERRIDES) {
    return SKIN_LINE_OVERRIDES[skinLine];
  }

  if (skinLine.startsWith('World Champions:')) {
    return WORLD_CHAMPION_TEAMS_BY_SKIN_LINE[skinLine] ?? inferWorldChampionTeam(item);
  }

  return skinLine;
}

export function toSkinThemeQuizItem(item: QuizItem) {
  const themeAnswer = getSkinThemeAnswer(item);
  if (!themeAnswer) {
    return null;
  }

  return {
    ...item,
    answer: themeAnswer,
  };
}

export function getSkinThemeAnswerList(items: readonly QuizItem[]) {
  const cachedAnswers = skinThemeAnswerListCache.get(items);

  if (cachedAnswers) {
    return cachedAnswers;
  }

  const answers = Array.from(
    new Set(items.map(getSkinThemeAnswer).filter((answer): answer is string => Boolean(answer))),
  ).sort();

  skinThemeAnswerListCache.set(items, answers);
  return answers;
}

export function getSkinThemeQuizItems(items: readonly QuizItem[]): QuizItem[] {
  const cachedItems = skinThemeQuizItemCache.get(items);

  if (cachedItems) {
    return cachedItems;
  }

  const themeItems = items
    .map(toSkinThemeQuizItem)
    .filter((item): item is QuizItem => item !== null);

  skinThemeQuizItemCache.set(items, themeItems);
  return themeItems;
}
