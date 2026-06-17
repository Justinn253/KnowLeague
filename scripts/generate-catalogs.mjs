import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DRAGON_VERSION = '14.24.1';
const DATA_DRAGON_BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;
const COMMUNITY_DRAGON_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'catalogs');
const RELEASE_DATE_PATH = path.join(OUTPUT_DIR, 'skin-release-dates.json');

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readReleaseDateOverrides() {
  try {
    return JSON.parse(await readFile(RELEASE_DATE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

function spellType(index) {
  return index === 3 ? 'ultimate' : 'spell';
}

function toSkinSplashUrl(championId, skinId) {
  return `${DATA_DRAGON_BASE_URL.replace(`/cdn/${DATA_DRAGON_VERSION}`, '/cdn/img')}/champion/splash/${championId}_${skinId}.jpg`;
}

function formatRarity(rarity) {
  const labels = {
    kNoRarity: 'Common',
    kEpic: 'Epic',
    kLegendary: 'Legendary',
    kUltimate: 'Ultimate',
    kMythic: 'Mythic',
    kTranscendent: 'Transcendent',
  };

  return labels[rarity] ?? rarity ?? 'Unknown';
}

async function buildAbilityItems() {
  const championIndex = await fetchJson(`${DATA_DRAGON_BASE_URL}/data/en_US/champion.json`);
  const championIds = Object.keys(championIndex.data).sort();
  const championResponses = await Promise.all(
    championIds.map((championId) => fetchJson(`${DATA_DRAGON_BASE_URL}/data/en_US/champion/${championId}.json`)),
  );

  return championResponses.flatMap((response) => {
    const champion = Object.values(response.data)[0];
    const passive = {
      id: `${champion.id}-passive`,
      type: 'passive',
      title: 'Passive Ability',
      question: champion.passive.name,
      answer: champion.passive.name,
      imageUrl: `${DATA_DRAGON_BASE_URL}/img/passive/${champion.passive.image.full}`,
      champion: champion.name,
    };

    const spells = champion.spells.map((spell, index) => {
      const type = spellType(index);

      return {
        id: `${champion.id}-spell-${index}`,
        type,
        title: type === 'ultimate' ? 'Ultimate Clue' : 'Ability Icon',
        question: spell.name,
        answer: spell.name,
        imageUrl: `${DATA_DRAGON_BASE_URL}/img/spell/${spell.image.full}`,
        champion: champion.name,
      };
    });

    return [passive, ...spells].filter((item) => item.answer && item.imageUrl);
  });
}

async function buildSkinItems() {
  const [skinsById, championSummary, skinLines, releaseDates] = await Promise.all([
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skins.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/champion-summary.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skinlines.json`),
    readReleaseDateOverrides(),
  ]);

  const skinLineById = new Map(
    skinLines
      .filter((line) => line.id && line.name)
      .map((line) => [line.id, line.name]),
  );

  const championById = new Map(
    championSummary
      .filter((champion) => champion.id > 0)
      .map((champion) => [
        champion.id,
        {
          name: champion.name,
          alias: champion.alias,
          role: champion.roles?.[0] ?? 'Unknown',
        },
      ]),
  );

  return Object.values(skinsById)
    .filter(
      (skin) =>
        skin.skinClassification === 'kChampion' &&
        !skin.isBase &&
        skin.name &&
        !/[()]/.test(skin.name),
    )
    .map((skin) => {
      const championId = Math.floor(Number(skin.id) / 1000);
      const skinNumber = Number(skin.id) % 1000;
      const champion = championById.get(championId);
      const releaseDate = releaseDates[String(skin.id)] ?? releaseDates[skin.name] ?? null;
      const skinLine = skin.skinLines
        ?.map((line) => skinLineById.get(line.id))
        .filter(Boolean)
        .join(', ') || 'None';

      return {
        id: String(skin.id),
        type: 'skin',
        title: 'Skin Splash',
        question: skin.name,
        answer: skin.name,
        imageUrl: champion ? toSkinSplashUrl(champion.alias, skinNumber) : '',
        champion: champion?.name ?? 'Unknown',
        releaseDate,
        skinLine,
        rarity: formatRarity(skin.rarity),
        role: champion?.role ?? 'Unknown',
        gender: 'Unknown',
        race: 'Unknown',
      };
    })
    .filter((skin) => skin.champion !== 'Unknown' && skin.imageUrl)
    .sort((a, b) => a.answer.localeCompare(b.answer));
}

async function writeJson(fileName, data) {
  await writeFile(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

await mkdir(OUTPUT_DIR, { recursive: true });

const [abilityItems, skinItems] = await Promise.all([buildAbilityItems(), buildSkinItems()]);

await Promise.all([
  writeJson('ability-items.json', abilityItems),
  writeJson('skin-items.json', skinItems),
]);

console.log(`Generated ${abilityItems.length} ability quiz items.`);
console.log(`Generated ${skinItems.length} skin quiz items.`);
