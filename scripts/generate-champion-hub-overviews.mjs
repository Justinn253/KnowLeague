import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Explicitly pinned to the live Data Dragon version reviewed for this catalogue run. */
const DATA_DRAGON_VERSION = '16.20.1';
const DATA_DRAGON_BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;
const RIOT_CHAMPION_PAGE_BASE_URL = 'https://www.leagueoflegends.com/en-us/champions';
const REQUEST_CONCURRENCY = 6;
const REQUEST_RETRIES = 3;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const gameplayMetadataPath = path.resolve(scriptDirectory, '../data/catalogs/champion-gameplay-metadata.json');
const outputPath = path.resolve(scriptDirectory, '../data/catalogs/champion-hub-overviews.json');

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url) {
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    const response = await fetch(url);

    if (response.ok) {
      return response.text();
    }

    if (attempt === REQUEST_RETRIES || (response.status < 500 && response.status !== 429)) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }

    await pause(400 * (attempt + 1));
  }

  throw new Error(`Exhausted retries for ${url}`);
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code) => String.fromCodePoint(
      code.startsWith('x') || code.startsWith('X') ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10),
    ));
}

function textFromHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Riot's public champion pages render the overview copy in this stable rich-text
 * container. Failing the generation is deliberate: it prevents us from silently
 * substituting a generated or third-party description for Riot's own text.
 */
function officialChampionLore(pageHtml, championId) {
  const match = pageHtml.match(/data-testid="rich-text-html"><div>([\s\S]*?)<\/div><\/div><\/div><\/div><div class="character-meta-container"/);

  if (!match) {
    throw new Error(`Could not locate official overview lore on Riot's ${championId} page.`);
  }

  const lore = textFromHtml(match[1]);
  if (!lore) {
    throw new Error(`Official overview lore for ${championId} was empty.`);
  }

  return lore;
}

function abilityId(championSlug, slot) {
  return `${championSlug}-${slot.toLowerCase()}`;
}

function abilityDescription(value) {
  return textFromHtml(value ?? '');
}

const LANE_BY_METADATA_VALUE = {
  Top: 'Top',
  Jungle: 'Jungle',
  Middle: 'Mid',
  Mid: 'Mid',
  Support: 'Support',
  Bottom: 'Bot',
  Bot: 'Bot',
};

const OFFICIAL_SLUG_OVERRIDES = {
  MonkeyKing: 'monkeyking',
  Nunu: 'nunu',
  Renata: 'renata',
};

function normalizedChampionName(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function lanesFromMetadata(value) {
  const lanes = value
    .split(/[/,]/)
    .map((lane) => LANE_BY_METADATA_VALUE[lane.trim()])
    .filter(Boolean);

  return [...new Set(lanes)];
}

/**
 * A last-resort overview fallback for a newly released champion before the
 * curated lane catalogue has caught up. It keeps the profile navigable while
 * avoiding a blank header; the curated metadata remains the primary source.
 */
function inferredLanesFromClasses(tags) {
  if (tags.includes('Marksman')) return ['Bot'];
  if (tags.includes('Support')) return ['Support'];
  if (tags.includes('Assassin') || tags.includes('Mage')) return ['Mid'];
  if (tags.includes('Fighter') || tags.includes('Tank')) return ['Top'];

  return ['Mid'];
}

async function officialChampionSlugs() {
  const directoryHtml = await fetchText(`${RIOT_CHAMPION_PAGE_BASE_URL}/`);
  const slugs = [...directoryHtml.matchAll(/href="\/en-us\/champions\/([^\"/?#]+)\/?"/g)].map((match) => match[1]);

  if (!slugs.length) {
    throw new Error('Could not discover canonical champion URLs from Riot’s public Champion directory.');
  }

  return [...new Set(slugs)];
}

function officialChampionSlug(champion, slugs) {
  const override = OFFICIAL_SLUG_OVERRIDES[champion.id];
  if (override) return override;

  const normalizedName = normalizedChampionName(champion.name);
  const slug = slugs.find((candidate) => normalizedChampionName(candidate) === normalizedName);

  if (!slug) {
    throw new Error(`Could not resolve Riot champion-page URL for ${champion.id} (${champion.name}).`);
  }

  return slug;
}

async function mapWithConcurrency(values, callback) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await callback(values[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(REQUEST_CONCURRENCY, values.length) }, worker));
  return results;
}

async function buildChampion(championId, gameplayMetadata, slugs) {
  const championUrl = `${DATA_DRAGON_BASE_URL}/data/en_US/champion/${championId}.json`;
  const response = await fetchJson(championUrl);
  const champion = response.data[championId];

  if (!champion) {
    throw new Error(`Data Dragon did not return ${championId}.`);
  }

  const officialSlug = officialChampionSlug(champion, slugs);
  const officialUrl = `${RIOT_CHAMPION_PAGE_BASE_URL}/${officialSlug}/`;
  const metadata = gameplayMetadata[champion.name];
  const metadataLanes = lanesFromMetadata(metadata?.lane ?? '');
  const lanes = metadataLanes.length ? metadataLanes : inferredLanesFromClasses(champion.tags);
  const pageHtml = await fetchText(officialUrl);

  if (!lanes.length) throw new Error(`Could not infer any lane data for ${champion.name}.`);

  const abilities = [
    {
      id: abilityId(officialSlug, 'Passive'),
      slot: 'Passive',
      name: champion.passive.name,
      description: abilityDescription(champion.passive.description),
      imageUrl: `${DATA_DRAGON_BASE_URL}/img/passive/${champion.passive.image.full}`,
    },
    ...champion.spells.map((spell, index) => {
      const slot = ['Q', 'W', 'E', 'R'][index];

      return {
        id: abilityId(officialSlug, slot),
        slot,
        name: spell.name,
        description: abilityDescription(spell.description),
        imageUrl: `${DATA_DRAGON_BASE_URL}/img/spell/${spell.image.full}`,
      };
    }),
  ];

  if (abilities.length !== 5 || abilities.some((ability) => !ability.name || !ability.description || !ability.imageUrl)) {
    throw new Error(`Incomplete ability overview data for ${championId}.`);
  }

  return {
    id: champion.id,
    slug: officialSlug,
    name: champion.name,
    title: champion.title,
    tags: champion.tags,
    lanes,
    lore: officialChampionLore(pageHtml, championId),
    officialUrl,
    portraitUrl: `${DATA_DRAGON_BASE_URL}/img/champion/${champion.image.full}`,
    splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
    info: champion.info,
    stats: champion.stats,
    abilities,
  };
}

async function main() {
  const [championIndex, gameplayMetadataText, slugs] = await Promise.all([
    fetchJson(`${DATA_DRAGON_BASE_URL}/data/en_US/champion.json`),
    readFile(gameplayMetadataPath, 'utf8'),
    officialChampionSlugs(),
  ]);
  const gameplayMetadata = JSON.parse(gameplayMetadataText);
  const championIds = Object.keys(championIndex.data)
    .sort((left, right) => championIndex.data[left].name.localeCompare(championIndex.data[right].name));
  const champions = await mapWithConcurrency(
    championIds,
    (championId) => buildChampion(championId, gameplayMetadata, slugs),
  );
  const catalogue = {
    patch: DATA_DRAGON_VERSION,
    sources: {
      dataDragon: `${DATA_DRAGON_BASE_URL}/data/en_US/champion/`,
      officialChampionPages: RIOT_CHAMPION_PAGE_BASE_URL,
    },
    champions,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${champions.length} Champion Hub overview profiles to ${path.relative(process.cwd(), outputPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
