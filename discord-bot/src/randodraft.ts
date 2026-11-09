import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RANDODRAFT_LANES = ['Top', 'Jungle', 'Mid', 'Support', 'Bot'] as const;
const RANDODRAFT_MODES = ['summoners-rift', 'aram'] as const;

export type DiscordRandodraftGameMode = typeof RANDODRAFT_MODES[number];
export type DiscordRandodraftLane = typeof RANDODRAFT_LANES[number];
export type DiscordRandodraftType = 'Random';

type CatalogChampion = {
  attackTypes: ('melee' | 'ranged')[];
  id: string;
  imageUrl: string;
  name: string;
};

type CatalogItem = {
  attackType: 'melee' | 'ranged' | null;
  boots: boolean;
  groups: string[];
  id: string;
  imageUrl: string;
  modes: DiscordRandodraftGameMode[];
  name: string;
  types: string[];
};

type RandodraftCatalog = {
  champions: CatalogChampion[];
  items: CatalogItem[];
  version: string;
};

export type DiscordRandodraftPick = {
  build: string[];
  champion: string;
  lane: DiscordRandodraftLane | null;
  manualCategories: [];
  name: string;
  type: DiscordRandodraftType;
};

export type DiscordRandodraftDraft = {
  id: string;
  picks: DiscordRandodraftPick[];
  settings: {
    gameMode: DiscordRandodraftGameMode;
    manualSelections: 0;
    playersPerTeam: 1 | 2 | 3 | 4 | 5;
    quickRoll: true;
    randomBuildType: 'all';
    secondTeam: boolean;
  };
  version: string;
};

export type DiscordRandodraftPlayer = {
  displayName: string;
  userId: string;
};

function randodraftCatalogPath() {
  const candidates = [
    path.resolve(process.cwd(), 'data/catalogs/randodraft.json'),
    path.resolve(process.cwd(), '../data/catalogs/randodraft.json'),
  ];
  const catalogPath = candidates.find((candidate) => existsSync(candidate));
  if (!catalogPath) throw new Error('Randodraft catalogue is unavailable on this bot deployment.');
  return catalogPath;
}

const catalog = JSON.parse(readFileSync(randodraftCatalogPath(), 'utf8')) as RandodraftCatalog;
const championById = new Map(catalog.champions.map((champion) => [champion.id, champion]));
const itemById = new Map(catalog.items.map((item) => [item.id, item]));

export const DISCORD_RANDODRAFT_CHAMPIONS = catalog.champions;
export const DISCORD_RANDODRAFT_ITEMS = catalog.items;

export function getDiscordRandodraftChampion(championId: string) {
  return championById.get(championId) ?? null;
}

export function getDiscordRandodraftItem(itemId: string) {
  return itemById.get(itemId) ?? null;
}

function randomValue<T>(values: readonly T[], random: () => number): T {
  if (!values.length) throw new Error('No eligible Randodraft choices remain.');
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
}

function canAddItem(
  item: CatalogItem,
  champion: CatalogChampion,
  build: readonly CatalogItem[],
  gameMode: DiscordRandodraftGameMode,
) {
  return item.modes.includes(gameMode)
    && (!item.attackType || champion.attackTypes.includes(item.attackType))
    && !build.some((chosen) => chosen.id === item.id || (chosen.boots && item.boots) || chosen.groups.some((group) => item.groups.includes(group)));
}

/** Matches the website's Random-build rules: one boot pair plus five eligible non-boot items in shuffled slots. */
function generateRandomBuild(champion: CatalogChampion, gameMode: DiscordRandodraftGameMode, random: () => number) {
  const build: CatalogItem[] = [];
  const boots = catalog.items.filter((item) => item.boots && canAddItem(item, champion, build, gameMode));
  if (boots.length) build.push(randomValue(boots, random));

  while (build.length < 6) {
    const candidates = catalog.items.filter((item) => !item.boots && canAddItem(item, champion, build, gameMode));
    build.push(randomValue(candidates, random));
  }

  const itemIds = build.map((item) => item.id);
  for (let index = itemIds.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [itemIds[index], itemIds[swap]] = [itemIds[swap], itemIds[index]];
  }
  return itemIds;
}

function normalizedPlayerName(name: string, index: number) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 32) || `Player ${index + 1}`;
}

export function createDiscordRandodraft({
  gameMode,
  players,
  teamCount,
  random = Math.random,
}: {
  gameMode: DiscordRandodraftGameMode;
  players: readonly DiscordRandodraftPlayer[];
  random?: () => number;
  teamCount: 1 | 2;
}): DiscordRandodraftDraft {
  if (players.length < 2 || players.length > 10) {
    throw new Error('Choose between 2 and 10 Discord members.');
  }
  if (players.length % teamCount !== 0) {
    throw new Error('Two-team Randodrafts need an even number of Discord members.');
  }

  const playersPerTeam = players.length / teamCount;
  if (!Number.isInteger(playersPerTeam) || playersPerTeam < 1 || playersPerTeam > 5) {
    throw new Error(teamCount === 1
      ? 'One-team Randodrafts support 2 to 5 Discord members.'
      : 'Two-team Randodrafts support 2, 4, 6, 8, or 10 Discord members.');
  }

  const selectedChampionIds = new Set<string>();
  const picks: DiscordRandodraftPick[] = [];
  for (const [index, player] of players.entries()) {
    const champion = randomValue(catalog.champions.filter((candidate) => !selectedChampionIds.has(candidate.id)), random);
    selectedChampionIds.add(champion.id);

    const teamStart = Math.floor(index / playersPerTeam) * playersPerTeam;
    const lane = gameMode === 'aram'
      ? null
      : randomValue(RANDODRAFT_LANES.filter((candidate) => !picks.slice(teamStart).some((pick) => pick.lane === candidate)), random);
    picks.push({
      build: generateRandomBuild(champion, gameMode, random),
      champion: champion.id,
      lane,
      manualCategories: [] as [],
      name: normalizedPlayerName(player.displayName, index),
      type: 'Random' as const,
    });
  }

  return {
    id: randomUUID(),
    picks,
    settings: {
      gameMode,
      manualSelections: 0,
      playersPerTeam: playersPerTeam as 1 | 2 | 3 | 4 | 5,
      quickRoll: true,
      randomBuildType: 'all',
      secondTeam: teamCount === 2,
    },
    version: catalog.version,
  };
}
