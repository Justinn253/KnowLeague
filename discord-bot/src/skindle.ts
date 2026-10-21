import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EmbedBuilder } from 'discord.js';

const SKINDLE_CATEGORY_IDS = [
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

type SkindleCategoryId = typeof SKINDLE_CATEGORY_IDS[number];
type SkindleCategoryValues = Record<SkindleCategoryId, string>;

export type DiscordSkindleSkin = {
  answer: string;
  champion: string;
  gender?: string | null;
  id: string;
  imageUrl: string;
  lane?: string | null;
  race?: string | null;
  rarity?: string | null;
  releaseDate?: string | null;
  resourceType?: string | null;
  role?: string | null;
  skinLine?: string | null;
  type: 'skin';
};

export type DiscordSkindleComparison = {
  matches: Record<SkindleCategoryId, boolean>;
  partialMatches: Partial<Record<SkindleCategoryId, boolean>>;
  releaseYearDirection: 'higher' | 'lower' | null;
  values: SkindleCategoryValues;
};

export type DiscordSkindleStatus = {
  dateKey: string;
  guessCount: number;
  solved: boolean;
};

export type DiscordSkindleGuessResult =
  | { kind: 'already-solved'; status: DiscordSkindleStatus }
  | { guess: DiscordSkindleSkin; kind: 'duplicate'; status: DiscordSkindleStatus }
  | { comparison: DiscordSkindleComparison; guess: DiscordSkindleSkin; kind: 'incorrect'; status: DiscordSkindleStatus }
  | { comparison: DiscordSkindleComparison; guess: DiscordSkindleSkin; kind: 'correct'; progress: readonly DiscordSkindleComparison[]; status: DiscordSkindleStatus; target: DiscordSkindleSkin }
  | { kind: 'ambiguous'; suggestions: string[] }
  | { kind: 'unknown'; suggestions: string[] };

type DiscordSkindleAttempt = {
  comparison: DiscordSkindleComparison;
  skinId: string;
};

type DiscordSkindleRun = {
  attempts: DiscordSkindleAttempt[];
  dateKey: string;
  solved: boolean;
};

const CATEGORY_LABELS: Record<SkindleCategoryId, string> = {
  champion: 'Champion',
  skinLine: 'Skin line',
  rarity: 'Rarity',
  race: 'Species',
  gender: 'Gender',
  role: 'Role',
  lane: 'Lane',
  releaseYear: 'Release year',
  resourceType: 'Resource',
};

let skinCatalogCache: DiscordSkindleSkin[] | null = null;

function normalizeAnswer(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

function getAnswerVariants(value: string) {
  return [
    normalizeAnswer(value),
    ...value
      .split('/')
      .map((part) => normalizeAnswer(part))
      .filter(Boolean),
  ].filter((part, index, variants) => part && variants.indexOf(part) === index);
}

function xmur3(seed: string) {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function seededShuffle<T>(items: readonly T[], seed: string) {
  const random = xmur3(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random() % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function getDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function formatDiscordSkindleDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/New_York',
    year: 'numeric',
  }).format(date);
}

function toDisplayTitleCase(value: string) {
  return value.replace(/[A-Za-z]+/g, (word) => {
    if (word.length <= 2 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function formatCategoryValue(value: string) {
  return value === 'Standard' ? 'Common' : toDisplayTitleCase(value);
}

function getReleaseYear(skin: DiscordSkindleSkin) {
  return skin.releaseDate?.slice(0, 4) || 'Unknown';
}

function getCategoryValues(skin: DiscordSkindleSkin): SkindleCategoryValues {
  return {
    champion: formatCategoryValue(skin.champion || 'Unknown'),
    skinLine: formatCategoryValue(skin.skinLine || 'None'),
    rarity: formatCategoryValue(skin.rarity || 'Unknown'),
    race: formatCategoryValue(skin.race || 'Unknown'),
    gender: formatCategoryValue(skin.gender || 'Unknown'),
    role: formatCategoryValue(skin.role || 'Unknown'),
    lane: formatCategoryValue((skin.lane || 'Unknown').replace(/\s*\/\s*/g, ', ')),
    releaseYear: getReleaseYear(skin),
    resourceType: formatCategoryValue(skin.resourceType || 'Unknown'),
  };
}

function valuesOverlap(categoryId: SkindleCategoryId, first: string, second: string) {
  if (categoryId !== 'race' && categoryId !== 'lane') return first === second;

  const firstParts = first.split(/[,/]/).map(normalizeAnswer).filter(Boolean);
  const secondParts = second.split(/[,/]/).map(normalizeAnswer).filter(Boolean);
  return firstParts.length > 0 && secondParts.length > 0 && firstParts.some((part) => secondParts.includes(part));
}

function isSkindleSkin(value: unknown): value is DiscordSkindleSkin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const skin = value as Partial<DiscordSkindleSkin>;
  return (
    skin.type === 'skin'
    && typeof skin.id === 'string'
    && typeof skin.answer === 'string'
    && typeof skin.champion === 'string'
    && typeof skin.imageUrl === 'string'
    && skin.id.length > 0
    && skin.answer.length > 0
    && skin.champion.length > 0
    && /^https:\/\//.test(skin.imageUrl)
  );
}

export function getDiscordSkindleCatalog() {
  if (skinCatalogCache) return skinCatalogCache;

  const catalogPath = [
    resolve(process.cwd(), 'data/catalogs/skin-items.json'),
    resolve(process.cwd(), '../data/catalogs/skin-items.json'),
  ].find((candidate) => existsSync(candidate));
  if (!catalogPath) throw new Error('The generated skin catalogue could not be found.');

  const parsed = JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('The generated skin catalogue is invalid.');

  skinCatalogCache = parsed.filter(isSkindleSkin);
  if (!skinCatalogCache.length) throw new Error('The generated skin catalogue has no Skindle skins.');
  return skinCatalogCache;
}

export function getDiscordSkindleDailyTarget(now = new Date()) {
  const [target] = seededShuffle(getDiscordSkindleCatalog(), `skindle:${getDateKey(now)}`);
  if (!target) throw new Error('The generated skin catalogue has no daily Skindle target.');
  return target;
}

export function compareDiscordSkindleGuess(guess: DiscordSkindleSkin, target: DiscordSkindleSkin): DiscordSkindleComparison {
  const values = getCategoryValues(guess);
  const targetValues = getCategoryValues(target);
  const matches = SKINDLE_CATEGORY_IDS.reduce<Record<SkindleCategoryId, boolean>>((result, categoryId) => {
    result[categoryId] = values[categoryId] === targetValues[categoryId];
    return result;
  }, {} as Record<SkindleCategoryId, boolean>);
  const partialMatches: Partial<Record<SkindleCategoryId, boolean>> = {};

  (['race', 'lane'] as const).forEach((categoryId) => {
    if (!matches[categoryId] && valuesOverlap(categoryId, values[categoryId], targetValues[categoryId])) {
      partialMatches[categoryId] = true;
    }
  });

  const guessedYear = Number(values.releaseYear);
  const targetYear = Number(targetValues.releaseYear);
  const releaseYearDirection = Number.isFinite(guessedYear) && Number.isFinite(targetYear) && guessedYear !== targetYear
    ? guessedYear < targetYear ? 'higher' : 'lower'
    : null;

  return { matches, partialMatches, releaseYearDirection, values };
}

function findSkindleSkin(query: string) {
  const normalizedQuery = normalizeAnswer(query.trim());
  if (!normalizedQuery) return { skin: null, suggestions: [] };

  const exactMatches = getDiscordSkindleCatalog().filter((skin) => getAnswerVariants(skin.answer).includes(normalizedQuery));
  if (exactMatches.length === 1) return { skin: exactMatches[0]!, suggestions: [] };

  const suggestions = getDiscordSkindleCatalog()
    .filter((skin) => normalizeAnswer(skin.answer).includes(normalizedQuery))
    .map((skin) => skin.answer)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
  return { skin: null, suggestions };
}

function buildStatus(run: DiscordSkindleRun, now: Date): DiscordSkindleStatus {
  return {
    dateKey: getDateKey(now),
    guessCount: run.attempts.length,
    solved: run.solved,
  };
}

export class DiscordSkindleSessionStore {
  private readonly runsByDiscordUserId = new Map<string, DiscordSkindleRun>();

  getStatus(discordUserId: string, now = new Date()): DiscordSkindleStatus {
    const dateKey = getDateKey(now);
    const existing = this.runsByDiscordUserId.get(discordUserId);
    if (!existing || existing.dateKey !== dateKey) {
      return { dateKey, guessCount: 0, solved: false };
    }
    return buildStatus(existing, now);
  }

  guess(discordUserId: string, rawGuess: string, now = new Date()): DiscordSkindleGuessResult {
    const match = findSkindleSkin(rawGuess);
    if (!match.skin) {
      return match.suggestions.length
        ? { kind: 'ambiguous', suggestions: match.suggestions }
        : { kind: 'unknown', suggestions: [] };
    }

    const dateKey = getDateKey(now);
    const target = getDiscordSkindleDailyTarget(now);
    const existing = this.runsByDiscordUserId.get(discordUserId);
    const run = !existing || existing.dateKey !== dateKey
      ? { attempts: [], dateKey, solved: false }
      : existing;
    this.runsByDiscordUserId.set(discordUserId, run);

    const status = buildStatus(run, now);
    if (run.solved) return { kind: 'already-solved', status };
    if (run.attempts.some((attempt) => attempt.skinId === match.skin.id)) return { guess: match.skin, kind: 'duplicate', status };

    const comparison = compareDiscordSkindleGuess(match.skin, target);
    run.attempts.push({ comparison, skinId: match.skin.id });
    const nextStatus = buildStatus(run, now);
    if (match.skin.id !== target.id) {
      return { comparison, guess: match.skin, kind: 'incorrect', status: nextStatus };
    }

    run.solved = true;
    return {
      comparison,
      guess: match.skin,
      kind: 'correct',
      progress: run.attempts.map((attempt) => attempt.comparison),
      status: buildStatus(run, now),
      target,
    };
  }
}

function statusMarker(categoryId: SkindleCategoryId, comparison: DiscordSkindleComparison) {
  if (comparison.matches[categoryId]) return '✅';
  if (comparison.partialMatches[categoryId]) return '🟨';
  return '⬛';
}

export function buildDiscordSkindleGuessEmbed(result: Extract<DiscordSkindleGuessResult, { kind: 'incorrect' }>) {
  const rows = SKINDLE_CATEGORY_IDS.map((categoryId) => {
    const direction = categoryId === 'releaseYear' && result.comparison.releaseYearDirection
      ? ` (${result.comparison.releaseYearDirection === 'higher' ? '↑ higher' : '↓ lower'})`
      : '';
    return `${statusMarker(categoryId, result.comparison)} **${CATEGORY_LABELS[categoryId]}:** ${result.comparison.values[categoryId]}${direction}`;
  });

  return new EmbedBuilder()
    .setColor(0x0EA5E9)
    .setTitle(`Daily Skindle · Guess ${result.status.guessCount}`)
    .setDescription(`**${result.guess.answer}** was not the daily skin.`)
    .addFields({ name: 'Comparison', value: rows.join('\n') })
    .setImage(result.guess.imageUrl);
}

export function buildDiscordSkindleSolvedEmbed(displayName: string, result: Extract<DiscordSkindleGuessResult, { kind: 'correct' }>) {
  const values = getCategoryValues(result.target);
  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setTitle('Daily Skindle solved!')
    .setDescription(`**${displayName}** solved the ${formatDiscordSkindleDate(result.status.dateKey)} Daily Skindle in **${result.status.guessCount}** ${result.status.guessCount === 1 ? 'guess' : 'guesses'}!`)
    .setImage(result.target.imageUrl)
    .addFields(
      { name: 'Skin', value: result.target.answer, inline: true },
      { name: 'Champion', value: values.champion, inline: true },
      { name: 'Release year', value: values.releaseYear, inline: true },
      { name: 'Skin line', value: values.skinLine, inline: true },
      { name: 'Rarity', value: values.rarity, inline: true },
      { name: 'Resource', value: values.resourceType, inline: true },
    );
}

export function buildDiscordSkindleShareEmbed(displayName: string, result: Extract<DiscordSkindleGuessResult, { kind: 'correct' }>) {
  const progress = result.progress
    .map((comparison) => SKINDLE_CATEGORY_IDS
      .map((categoryId) => {
        if (comparison.matches[categoryId]) return '\u{1F7E9}';
        if (comparison.partialMatches[categoryId]) return '\u{1F7E8}';
        return '\u2B1B';
      })
      .join(''))
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setTitle('Daily Skindle completed')
    .setDescription(`**${displayName}** solved the Daily Skindle in **${result.status.guessCount}** ${result.status.guessCount === 1 ? 'guess' : 'guesses'}!\n\n${progress}`)
    .setFooter({ text: `${formatDiscordSkindleDate(result.status.dateKey)} · KnowLeague.net` });
}

export const discordSkindleSessionStore = new DiscordSkindleSessionStore();
