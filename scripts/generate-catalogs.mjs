import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DRAGON_VERSION = '14.24.1';
const DATA_DRAGON_BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;
const COMMUNITY_DRAGON_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';
const SKIN_RELEASE_DATES_SOURCE_URL =
  'https://wiki.leagueoflegends.com/en-us/api.php?action=parse&page=Module:SkinData/data&prop=wikitext&format=json';
const CHAMPION_METADATA_SOURCE_URL =
  'https://raw.githubusercontent.com/joulsen/loldle-information-theory/main/resources/loldle-champ-data.json';
const CHAMPION_GENDER_SOURCE_URL =
  'https://gist.githubusercontent.com/Kerrders/0067d88dfd982c272e20dcb496f4dbc7/raw/champions.json';
const FANDOM_API_URL = 'https://leagueoflegends.fandom.com/api.php';
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'catalogs');
const RELEASE_DATE_PATH = path.join(OUTPUT_DIR, 'skin-release-dates.json');
const CHAMPION_METADATA_PATH = path.join(OUTPUT_DIR, 'champion-metadata.json');
const CHAMPION_SPECIES_OVERRIDES_PATH = path.join(process.cwd(), 'champion-species.txt');
const CHAMPION_METADATA_OVERRIDES = {
  Ambessa: { gender: 'Female', species: 'Human' },
  Aurora: { gender: 'Female', species: 'Vastayan' },
  Briar: { gender: 'Female', species: 'Golem' },
  Hwei: { gender: 'Male', species: 'Human' },
  Mel: { gender: 'Female', species: 'Human' },
  Milio: { gender: 'Male', species: 'Human' },
  Naafiri: { gender: 'Female', species: 'Darkin' },
  Smolder: { gender: 'Male', species: 'Dragon' },
  Yunara: { gender: 'Female', species: 'Human' },
  Zaahen: { gender: 'Male', species: 'Darkin' },
  Shaco: { gender: 'Male', species: 'Demon' },
};

const SPECIES_LABEL_OVERRIDES = {
  'Kiilash': 'Vastayan',
  'Lhotlan': 'Vastayan',
  'Marai': 'Vastayan',
  'Oovi-Kat': 'Vastayan',
  'Ottrani': 'Vastayan',
  'Vastaya': 'Vastayan',
  'Vesani': 'Vastayan',
  'Voidborn': 'Void-Being',
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'KnowLeague data generator',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function readChampionSpeciesOverrides() {
  try {
    const text = await readFile(CHAMPION_SPECIES_OVERRIDES_PATH, 'utf8');
    return new Map(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separatorIndex = line.indexOf(' - ');
          if (separatorIndex === -1) return null;
          const championName = line.slice(0, separatorIndex).trim();
          const species = line.slice(separatorIndex + 3).trim();
          return championName && species ? [championName, normalizeSpecies(species)] : null;
        })
        .filter(Boolean),
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

function toTitleCase(value) {
  return value.replace(/[A-Za-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatSpecies(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'Unknown';
  }

  return normalizeSpecies(values.map((value) => toTitleCase(String(value))).join(', '));
}

function normalizeSpecies(value) {
  const normalizedValues = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => SPECIES_LABEL_OVERRIDES[part] ?? part);

  return Array.from(new Set(normalizedValues)).join(', ') || 'Unknown';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#95;/g, '_')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFandomSpecies(html) {
  const rowMatch = html.match(/<div class="pi-item pi-data[^"]*" data-source="species">([\s\S]*?)<div class="pi-item pi-data/);
  const rowHtml = rowMatch?.[1] ?? html.match(/<div class="pi-item pi-data[^"]*" data-source="species">([\s\S]*?)<\/aside>/)?.[1];

  if (!rowHtml) {
    return null;
  }

  const valueMatch = rowHtml.match(/<div class="pi-data-value pi-font">([\s\S]*)/);
  const valueHtml = valueMatch?.[1] ?? rowHtml;
  const linkedValues = [...valueHtml.matchAll(/<a [^>]*title="([^"]+)"[^>]*>/g)]
    .map((match) => decodeHtml(match[1]))
    .filter((value) => !value.includes('/'));

  const values = linkedValues.length ? linkedValues : stripHtml(valueHtml).split(/\s*,\s*/);
  const normalizedValues = Array.from(new Set(values.map((value) => toTitleCase(value.trim())).filter(Boolean)));

  return normalizedValues.length ? normalizeSpecies(normalizedValues.join(', ')) : null;
}

async function fetchFandomSpecies(championName) {
  const url = `${FANDOM_API_URL}?action=parse&page=${encodeURIComponent(championName)}&prop=text&format=json`;
  const data = await fetchJson(url);
  const html = data.parse?.text?.['*'];

  if (!html) {
    return null;
  }

  return extractFandomSpecies(html);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function fetchSkinReleaseDates() {
  const releaseDates = {};
  const data = await fetchJson(SKIN_RELEASE_DATES_SOURCE_URL);
  const source = data.parse?.wikitext?.['*'];

  if (!source) {
    throw new Error('Skin release date source did not include wikitext.');
  }

  let championName = null;
  let championId = null;
  let skinName = null;
  let skinId = null;

  source.split('\n').forEach((line) => {
    const championMatch = line.match(/^  \["(.+)"\] = \{$/);
    if (championMatch) {
      championName = championMatch[1];
      championId = null;
      skinName = null;
      skinId = null;
      return;
    }

    const championIdMatch = line.match(/^    \["id"\] = (\d+)/);
    if (championName && !skinName && championIdMatch) {
      championId = Number(championIdMatch[1]);
      return;
    }

    const skinMatch = line.match(/^      \["(.+)"\] = \{$/);
    if (skinMatch) {
      skinName = skinMatch[1];
      skinId = null;
      return;
    }

    const skinIdMatch = line.match(/^        \["id"\] = (\d+)/);
    if (skinName && skinIdMatch) {
      skinId = Number(skinIdMatch[1]);
      return;
    }

    const releaseMatch = line.match(/^        \["release"\] = "(\d{4}-\d{2}-\d{2})"/);
    if (championName && skinName && releaseMatch) {
      const fullSkinName = skinName === 'Original' ? championName : `${skinName} ${championName}`;
      releaseDates[fullSkinName] = releaseMatch[1];

      if (championId !== null && skinId !== null) {
        releaseDates[String(championId * 1000 + skinId)] = releaseMatch[1];
      }
    }
  });

  return releaseDates;
}

async function fetchChampionMetadata() {
  const [speciesRecords, genderRecords] = await Promise.all([
    fetchJson(CHAMPION_METADATA_SOURCE_URL),
    fetchJson(CHAMPION_GENDER_SOURCE_URL),
  ]);

  const metadata = Object.fromEntries(
    speciesRecords
      .filter((champion) => champion.championName)
      .map((champion) => {
        const override = CHAMPION_METADATA_OVERRIDES[champion.championName];

        return [
          champion.championName,
          {
            gender: override?.gender ?? toTitleCase(champion.gender || 'Unknown'),
            species: override?.species ?? formatSpecies(champion.newSpecies?.length ? champion.newSpecies : champion.species),
          },
        ];
      }),
  );

  genderRecords
    .filter((champion) => champion.name)
    .forEach((champion) => {
      const existing = metadata[champion.name] ?? { gender: 'Unknown', species: 'Unknown' };
      metadata[champion.name] = {
        ...existing,
        gender: existing.gender === 'Unknown' ? toTitleCase(champion.gender || 'Unknown') : existing.gender,
      };
    });

  Object.entries(CHAMPION_METADATA_OVERRIDES).forEach(([championName, override]) => {
    metadata[championName] = {
      ...(metadata[championName] ?? {}),
      ...override,
    };
  });

  const championNames = Object.keys(metadata).sort();
  const fandomSpecies = await mapWithConcurrency(championNames, 8, async (championName) => {
    try {
      return [championName, await fetchFandomSpecies(championName)];
    } catch (error) {
      console.warn(`Unable to fetch Fandom species for ${championName}. ${error.message}`);
      return [championName, null];
    }
  });

  fandomSpecies.forEach(([championName, species]) => {
    if (species) {
      metadata[championName] = {
        ...(metadata[championName] ?? {}),
        species,
      };
    }
  });

  Object.entries(CHAMPION_METADATA_OVERRIDES).forEach(([championName, override]) => {
    metadata[championName] = {
      ...(metadata[championName] ?? {}),
      ...override,
      species: normalizeSpecies(override.species),
    };
  });

  return metadata;
}

async function refreshStoredMetadata() {
  const existingReleaseDates = await readJsonFile(RELEASE_DATE_PATH, {});
  const existingChampionMetadata = await readJsonFile(CHAMPION_METADATA_PATH, {});

  const [releaseDates, championMetadata] = await Promise.all([
    fetchSkinReleaseDates().catch((error) => {
      console.warn(`Unable to refresh skin release dates. Using existing data. ${error.message}`);
      return existingReleaseDates;
    }),
    fetchChampionMetadata().catch((error) => {
      console.warn(`Unable to refresh champion metadata. Using existing data. ${error.message}`);
      return existingChampionMetadata;
    }),
  ]);
  const speciesOverrides = await readChampionSpeciesOverrides();
  if (speciesOverrides.size > 0) {
    Object.keys(championMetadata).forEach((championName) => {
      if (!speciesOverrides.has(championName)) {
        delete championMetadata[championName];
      }
    });
    speciesOverrides.forEach((species, championName) => {
      championMetadata[championName] = {
        ...(championMetadata[championName] ?? { gender: 'Unknown' }),
        species,
      };
    });
  }

  await Promise.all([
    writeJson('skin-release-dates.json', releaseDates),
    writeJson('champion-metadata.json', championMetadata),
  ]);

  return { releaseDates, championMetadata };
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

async function buildSkinItems(releaseDates, championMetadata) {
  const [skinsById, championSummary, skinLines] = await Promise.all([
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skins.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/champion-summary.json`),
    fetchJson(`${COMMUNITY_DRAGON_BASE_URL}/v1/skinlines.json`),
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

  const releaseDateByNormalizedName = new Map(
    Object.entries(releaseDates).map(([name, releaseDate]) => [normalizeName(name), releaseDate]),
  );

  const championMetadataByNormalizedName = new Map(
    Object.entries(championMetadata).map(([name, metadata]) => [normalizeName(name), metadata]),
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
      const metadata = champion ? championMetadataByNormalizedName.get(normalizeName(champion.name)) : null;
      const releaseDate = releaseDates[String(skin.id)] ?? releaseDates[skin.name] ?? releaseDateByNormalizedName.get(normalizeName(skin.name)) ?? null;
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
        gender: metadata?.gender ?? 'Unknown',
        race: metadata?.species ?? 'Unknown',
      };
    })
    .filter((skin) => skin.champion !== 'Unknown' && skin.imageUrl)
    .sort((a, b) => a.answer.localeCompare(b.answer));
}

async function writeJson(fileName, data) {
  await writeFile(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

await mkdir(OUTPUT_DIR, { recursive: true });

const { releaseDates, championMetadata } = await refreshStoredMetadata();
const [abilityItems, skinItems] = await Promise.all([buildAbilityItems(), buildSkinItems(releaseDates, championMetadata)]);

await Promise.all([
  writeJson('ability-items.json', abilityItems),
  writeJson('skin-items.json', skinItems),
]);

console.log(`Generated ${abilityItems.length} ability quiz items.`);
console.log(`Generated ${skinItems.length} skin quiz items.`);
