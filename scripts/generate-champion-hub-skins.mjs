import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keep the CommunityDragon client records aligned with the Data Dragon 16.20.1
 * overview catalogue. CommunityDragon uses the major.minor patch form.
 */
const COMMUNITY_DRAGON_VERSION = '16.20';
const COMMUNITY_DRAGON_BASE_URL = `https://raw.communitydragon.org/${COMMUNITY_DRAGON_VERSION}/plugins/rcp-be-lol-game-data/global/default`;
const MERAKI_CHAMPION_CATALOGUE_URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';
const DATA_DRAGON_SPLASH_BASE_URL = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash';
const MODEL_VIEWER_BASE_URL = 'https://modelviewer.lol/model-viewer?id=';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const overviewPath = path.resolve(scriptDirectory, '../data/catalogs/champion-hub-overviews.json');
const releaseDatesPath = path.resolve(scriptDirectory, '../data/catalogs/skin-release-dates.json');
const outputPath = path.resolve(scriptDirectory, '../data/catalogs/champion-hub-skins.json');

const RIOT_CLIENT_SKIN_RARITIES = new Set([
  'kNoRarity',
  'kRare',
  'kEpic',
  'kLegendary',
  'kMythic',
  'kUltimate',
  'kExalted',
  'kTranscendent',
]);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

function normalizedChampionName(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function skinNumber(skinId) {
  return Number(skinId) % 1000;
}

function chromaName(chroma, skinName) {
  const suffix = chroma.name?.match(/\(([^()]+)\)$/)?.[1];
  if (suffix) return suffix;

  return chroma.name?.replace(`${skinName} `, '').trim() || `Chroma ${chroma.id}`;
}

function skinLineName(skin, skinLines, merakiSkin) {
  const line = skin.skinLines
    ?.map(({ id }) => skinLines.get(id)?.name)
    .find(Boolean);

  if (line) return line;
  if (merakiSkin?.set?.[0]) return merakiSkin.set[0];
  return skin.isBase ? 'Original' : 'Uncategorized';
}

function skinPrice(skin, merakiSkin) {
  if (skin.isBase) return 'Included';

  const cost = merakiSkin?.cost;
  if (typeof cost === 'number' && Number.isFinite(cost)) return `${cost} RP`;

  if (typeof cost === 'string' && cost.trim()) {
    const price = cost.replace(/prestige points?/i, 'Mythic Essence').trim();
    if (/mythic essence/i.test(price)) return 'Mythic Essence';

    if (price.toLocaleLowerCase() !== 'special') return price;
  }

  if (skin.rarity === 'kMythic' || merakiSkin?.rarity === 'Mythic') return 'Mythic Essence';
  return 'Special';
}

function availability(skin, merakiSkin) {
  if (merakiSkin?.availability) return merakiSkin.availability;
  return skin.isLegacy ? 'Legacy' : 'Available';
}

function skinLore(skin) {
  const description = skin.description?.trim();
  return description || undefined;
}

function clientChromaImageUrl(championId, chromaId) {
  return `${COMMUNITY_DRAGON_BASE_URL}/v1/champion-chroma-images/${championId}/${chromaId}.png`;
}

function buildMerakiSkinsById(champions) {
  const skinsById = new Map();

  for (const champion of Object.values(champions)) {
    for (const skin of champion.skins ?? []) {
      skinsById.set(String(skin.id), skin);
    }
  }

  return skinsById;
}

function buildSkin({ skin, champion, skinLines, releaseDates, merakiSkinsById }) {
  if (!RIOT_CLIENT_SKIN_RARITIES.has(skin.rarity)) {
    throw new Error(`Unknown Riot client skin rarity ${skin.rarity} for ${skin.id}.`);
  }

  const id = String(skin.id);
  const merakiSkin = merakiSkinsById.get(id);
  const releaseDate = releaseDates[id] ?? merakiSkin?.release;

  if (!releaseDate) throw new Error(`Missing release date for skin ${id} (${skin.name}).`);

  return {
    id,
    name: skin.isBase ? champion.name : skin.name,
    splashUrl: `${DATA_DRAGON_SPLASH_BASE_URL}/${champion.alias}_${skinNumber(skin.id)}.jpg`,
    releaseDate,
    price: skinPrice(skin, merakiSkin),
    availability: availability(skin, merakiSkin),
    skinLine: skinLineName(skin, skinLines, merakiSkin),
    riotRarity: skin.rarity,
    modelViewerUrl: `${MODEL_VIEWER_BASE_URL}${id}`,
    ...(skinLore(skin) ? { officialLore: skinLore(skin) } : {}),
    chromas: (skin.chromas ?? []).map((chroma) => ({
      id: String(chroma.id),
      name: chromaName(chroma, skin.name),
      imageUrl: clientChromaImageUrl(champion.id, chroma.id),
      modelViewerUrl: `${MODEL_VIEWER_BASE_URL}${chroma.id}`,
    })),
  };
}

async function main() {
  const [overviewText, releaseDatesText, skins, championSummary, skinLines, merakiChampions] = await Promise.all([
    readFile(overviewPath, 'utf8'),
    readFile(releaseDatesPath, 'utf8'),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skins.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/champion-summary.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skinlines.json`),
    fetchJson(MERAKI_CHAMPION_CATALOGUE_URL),
  ]);
  const overview = JSON.parse(overviewText);
  const releaseDates = JSON.parse(releaseDatesText);
  const skinLineById = new Map(skinLines.map((skinLine) => [skinLine.id, skinLine]));
  // The summary also includes alternate game-mode entities that reuse champion
  // names under large numeric IDs. Champion skin IDs use the canonical LoL ID.
  const championByNormalizedName = new Map(
    championSummary
      .filter((champion) => champion.id > 0 && champion.id < 1000)
      .map((champion) => [normalizedChampionName(champion.name), champion]),
  );
  const merakiSkinsById = buildMerakiSkinsById(merakiChampions);
  const skinsByChampionId = new Map();

  for (const skin of Object.values(skins)) {
    // A few genuine champion base skins are marked kGeneric in client data;
    // preserve them so every collection correctly begins with its base look.
    if (skin.skinClassification !== 'kChampion' && !skin.isBase) continue;
    // CommunityDragon includes internal cosmetic records (for example, modern
    // asset variants) that are not published skins. Keep entries that appear
    // in the public cosmetics index or in our audited release-date catalogue;
    // the latter preserves a just-released cosmetic while public metadata lags.
    if (!merakiSkinsById.has(String(skin.id)) && !releaseDates[String(skin.id)]) continue;

    const championId = Math.floor(Number(skin.id) / 1000);
    const championSkins = skinsByChampionId.get(championId) ?? [];
    championSkins.push(skin);
    skinsByChampionId.set(championId, championSkins);
  }

  const catalogueChampions = {};

  for (const overviewChampion of overview.champions) {
    const clientChampion = championByNormalizedName.get(normalizedChampionName(overviewChampion.name));
    if (!clientChampion) throw new Error(`Missing CommunityDragon champion for ${overviewChampion.name}.`);

    const clientSkins = skinsByChampionId.get(clientChampion.id) ?? [];
    if (!clientSkins.length) throw new Error(`Missing CommunityDragon skins for ${overviewChampion.name}.`);

    const orderedSkins = [...clientSkins]
      .sort((left, right) => Number(right.isBase) - Number(left.isBase) || left.id - right.id)
      .map((skin) => buildSkin({
        skin,
        champion: clientChampion,
        skinLines: skinLineById,
        releaseDates,
        merakiSkinsById,
      }));

    if (!orderedSkins[0].id.endsWith('000')) {
      throw new Error(`${overviewChampion.name} does not begin with its base skin.`);
    }

    catalogueChampions[overviewChampion.slug] = { skins: orderedSkins };
  }

  const catalogue = {
    patch: overview.patch,
    sources: {
      communityDragon: `${COMMUNITY_DRAGON_BASE_URL}/v1/skins.json`,
      skinLines: `${COMMUNITY_DRAGON_BASE_URL}/v1/skinlines.json`,
      priceAndAvailability: MERAKI_CHAMPION_CATALOGUE_URL,
      releaseDates: 'data/catalogs/skin-release-dates.json',
    },
    champions: catalogueChampions,
  };

  if (Object.keys(catalogueChampions).length !== overview.champions.length) {
    throw new Error('The generated Skin catalogue did not cover every Overview champion.');
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
  const skinCount = Object.values(catalogueChampions).reduce((total, champion) => total + champion.skins.length, 0);
  console.log(`Wrote ${skinCount} skins for ${Object.keys(catalogueChampions).length} Champion Hub profiles to ${path.relative(process.cwd(), outputPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
