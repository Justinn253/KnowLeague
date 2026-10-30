import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DRAGON_API_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const DATA_DRAGON_CDN_URL = 'https://ddragon.leagueoflegends.com/cdn';
const OUTPUT_DIRECTORY = path.join(process.cwd(), 'data', 'catalogs');
const ITEM_CATALOGUE_PATH = path.join(OUTPUT_DIRECTORY, 'discord-collection-items.json');
const RUNE_CATALOGUE_PATH = path.join(OUTPUT_DIRECTORY, 'discord-collection-runes.json');
const ITEM_REPORT_PATH = path.join(OUTPUT_DIRECTORY, 'discord-collection-item-tiers.md');
const RUNE_REPORT_PATH = path.join(OUTPUT_DIRECTORY, 'discord-collection-rune-tiers.md');
const TIER_FIVE_NO_PRICE_ITEM_NAMES = new Set([
  'kalistasblackspear',
  'scarecroweffigy',
  'porosnax',
  'headofkhazix',
  'eyeoftheherald',
  'bonetoothnecklace',
]);
const ORNN_ICON_PREFIX = /^%i:ornnicon%\s*/i;
const NON_ITEM_NAMES = new Set([
  'disabled recall',
  'enhanced recall',
  'recall',
  'nexus siege: siege weapon slot',
  'siege teleport',
  'siege warp',
]);
const TIER_RARITIES = {
  1: 'Common',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary',
  5: 'Mythic',
};

const MAP_NAMES = {
  1: 'Classic Summoner’s Rift',
  8: 'Crystal Scar',
  10: 'Twisted Treeline',
  11: 'Summoner’s Rift',
  12: 'Howling Abyss',
  14: 'Nexus Blitz',
  16: 'Crystal Scar',
  18: 'Arena',
  19: 'Odyssey',
  21: 'Nexus Blitz',
  22: 'Teamfight Tactics',
  30: 'Arena',
};

function compareVersions(left, right) {
  const leftParts = left.split('.').map((part) => Number(part));
  const rightParts = right.split('.').map((part) => Number(part));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function createSlug(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'unknown';
}

function normalizeItemName(value) {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cleanItemName(value) {
  return value
    .replace(ORNN_ICON_PREFIX, '')
    .replace(/<br\s*\/?>/gi, '')
    .trim();
}

function isOrnnUpgrade(rawName) {
  return ORNN_ICON_PREFIX.test(rawName);
}

function isActualObtainableItem(item, rawName, name) {
  const normalizedName = normalizeItemName(name);
  if (TIER_FIVE_NO_PRICE_ITEM_NAMES.has(normalizedName)) return true;
  if (/^enchantment\s*:/i.test(name)
    || /^game_item_/i.test(name)
    || NON_ITEM_NAMES.has(name.toLocaleLowerCase())
    || /<[^>]+>/.test(rawName.replace(/<br\s*\/?>/gi, ''))
    || (!isOrnnUpgrade(rawName) && rawName.replace(/<br\s*\/?>/gi, '').trim() !== name)) {
    return false;
  }
  // Masterwork items are awarded by Ornn rather than bought directly; retain
  // them even when their source snapshot does not flag them as purchasable.
  return isOrnnUpgrade(rawName) || item.gold?.purchasable === true;
}

function toTier(cost, name) {
  const isNoPriceTierFiveException = TIER_FIVE_NO_PRICE_ITEM_NAMES.has(normalizeItemName(name));
  if (isNoPriceTierFiveException) return cost === null ? 5 : null;
  if (!Number.isFinite(cost) || cost === null) {
    return null;
  }
  if (cost < 1000) return 1;
  if (cost < 2000) return 2;
  if (cost < 3000) return 3;
  if (cost < 4000) return 4;
  return 5;
}

function rarityForTier(tier) {
  const rarity = TIER_RARITIES[tier];
  if (!rarity) throw new Error(`Collection item tier ${tier} has no rarity conversion.`);
  return rarity;
}

function toItemImageUrl(version, imageName) {
  return `${DATA_DRAGON_CDN_URL}/${version}/img/item/${imageName}`;
}

function toRuneImageUrl(version, imagePath) {
  return `${DATA_DRAGON_CDN_URL}/${version}/img/${imagePath.replace(/^\/+/, '')}`;
}

function isDiscordDisplayableImageUrl(imageUrl) {
  return /^https:\/\/.+\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(imageUrl);
}

function imageVersion(imageUrl) {
  const matched = imageUrl.match(/\/cdn\/(\d+\.\d+\.\d+)\//);
  return matched?.[1] ?? '0.0.0';
}

function mapModes(maps) {
  return Object.entries(maps ?? {})
    .filter(([, enabled]) => enabled)
    .map(([mapId]) => MAP_NAMES[Number(mapId)] ?? `Map ${mapId}`)
    .sort((left, right) => left.localeCompare(right));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'KnowLeague Discord collection catalogue generator' } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function mapWithConcurrency(values, concurrency, mapValue) {
  const output = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapValue(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

function mergeItemSnapshot(itemsByKey, version, itemData) {
  for (const [id, item] of Object.entries(itemData.data ?? {})) {
    if (!/^\d+$/.test(id) || !item?.name || !item?.image?.full) continue;
    const rawName = item.name;
    const name = cleanItemName(rawName);
    if (!name || !isActualObtainableItem(item, rawName, name)) continue;
    const cost = Number.isFinite(item.gold?.total) && item.gold.total > 0 ? Math.trunc(item.gold.total) : null;
    const tier = toTier(cost, name);
    if (tier === null) continue;
    const imageName = item.image.full;
    const key = `${id}:${name}:${imageName}`;
    const existing = itemsByKey.get(key);
    const modes = mapModes(item.maps);
    if (existing) {
      existing.firstSeenVersion = version;
      existing.gameModes = [...new Set([...existing.gameModes, ...modes])].sort((left, right) => left.localeCompare(right));
      if ((cost ?? -1) > (existing.cost ?? -1)) {
        existing.cost = cost;
        existing.costVersion = version;
        existing.rarity = rarityForTier(tier);
        existing.tier = tier;
      }
      continue;
    }

    itemsByKey.set(key, {
      catalogId: `item:${id}:${createSlug(name)}:${createSlug(imageName)}`,
      cost,
      costVersion: version,
      firstSeenVersion: version,
      gameModes: modes,
      id,
      imageUrl: toItemImageUrl(version, imageName),
      lastSeenVersion: version,
      name,
      rarity: rarityForTier(tier),
      tier,
      type: 'item',
    });
  }
}

function mergeRuneSnapshot(runesByKey, version, styles) {
  for (const style of styles) {
    if (!style?.id || !style?.name || !style?.icon) continue;
    const styleKey = `style:${style.id}`;
    const styleImageUrl = toRuneImageUrl(version, style.icon);
    if (isDiscordDisplayableImageUrl(styleImageUrl) && !runesByKey.has(styleKey)) {
      runesByKey.set(styleKey, {
        catalogId: `rune-style:${style.id}:${createSlug(style.name)}`,
        id: String(style.id),
        imageUrl: styleImageUrl,
        name: style.name,
        rarity: rarityForTier(4),
        runeKind: 'style',
        style: style.name,
        tier: 4,
        type: 'rune',
      });
    }

    for (const [slotIndex, slot] of (style.slots ?? []).entries()) {
      const runeKind = slotIndex === 0 ? 'keystone' : 'sub-rune';
      const tier = runeKind === 'keystone' ? 3 : 2;
      for (const rune of slot.runes ?? []) {
        if (!rune?.id || !rune?.name || !rune?.icon) continue;
        const imageUrl = toRuneImageUrl(version, rune.icon);
        if (!isDiscordDisplayableImageUrl(imageUrl)) continue;
        const runeKey = `${runeKind}:${rune.id}`;
        if (runesByKey.has(runeKey)) continue;
        runesByKey.set(runeKey, {
          catalogId: `rune-${runeKind}:${rune.id}:${createSlug(rune.name)}`,
          id: String(rune.id),
          imageUrl,
          name: rune.name,
          rarity: rarityForTier(tier),
          runeKind,
          style: style.name,
          tier,
          type: 'rune',
        });
      }
    }
  }
}

function deduplicateRunesByName(runes) {
  const runesByName = new Map();
  for (const rune of runes) {
    const key = `${rune.runeKind}:${normalizeItemName(rune.name)}`;
    const existing = runesByName.get(key);
    if (!existing || compareVersions(imageVersion(rune.imageUrl), imageVersion(existing.imageUrl)) > 0) {
      runesByName.set(key, rune);
    }
  }
  return [...runesByName.values()].sort(sortByTierAndName);
}

function sortByTierAndName(left, right) {
  return left.tier - right.tier || left.name.localeCompare(right.name) || left.catalogId.localeCompare(right.catalogId);
}

function sortItemsByCost(left, right) {
  const leftCost = left.cost ?? Number.POSITIVE_INFINITY;
  const rightCost = right.cost ?? Number.POSITIVE_INFINITY;
  return leftCost - rightCost || left.name.localeCompare(right.name) || left.catalogId.localeCompare(right.catalogId);
}

function compareItemVersions(left, right) {
  const costDifference = (left.cost ?? -1) - (right.cost ?? -1);
  if (costDifference !== 0) return costDifference;
  const lastSeenDifference = compareVersions(left.lastSeenVersion, right.lastSeenVersion);
  if (lastSeenDifference !== 0) return lastSeenDifference;
  const firstSeenDifference = compareVersions(left.firstSeenVersion, right.firstSeenVersion);
  if (firstSeenDifference !== 0) return firstSeenDifference;
  return right.catalogId.localeCompare(left.catalogId);
}

function deduplicateItemsByName(items) {
  const itemsByName = new Map();
  for (const item of items) {
    const existing = itemsByName.get(normalizeItemName(item.name));
    if (!existing || compareItemVersions(item, existing) > 0) itemsByName.set(normalizeItemName(item.name), item);
  }
  return [...itemsByName.values()].sort(sortItemsByCost);
}

function formatCost(cost) {
  return cost === null ? 'No listed price' : new Intl.NumberFormat('en-US').format(cost);
}

function createItemReport(items, generatedAt, versions) {
  const lines = [
    '# Discord Collection Item Rarities',
    '',
    `Generated at: ${generatedAt}`,
    `Data Dragon snapshots: ${versions.length} (${versions.at(-1)} through ${versions[0]})`,
    'Sorted by cost (ascending). Each item name appears once, using its highest-cost available version.',
    '',
    '| Rarity | Item | Cost | Cost version | Modes | First seen | Last seen |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const item of items) {
    lines.push(`| ${item.rarity} | ${item.name.replaceAll('|', '\\|')} | ${formatCost(item.cost)} | ${item.costVersion} | ${item.gameModes.join(', ') || 'Unspecified'} | ${item.firstSeenVersion} | ${item.lastSeenVersion} |`);
  }
  return `${lines.join('\n')}\n`;
}

function createRuneReport(runes, generatedAt, versions) {
  const lines = [
    '# Discord Collection Rune Rarities',
    '',
    `Generated at: ${generatedAt}`,
    `Data Dragon Reforged-rune snapshots: ${versions.length} (${versions.at(-1)} through ${versions[0]})`,
    '',
    '| Rarity | Rune | Kind | Style |',
    '| --- | --- | --- | --- |',
  ];
  for (const rune of runes) {
    lines.push(`| ${rune.rarity} | ${rune.name.replaceAll('|', '\\|')} | ${rune.runeKind} | ${rune.style} |`);
  }
  return `${lines.join('\n')}\n`;
}

const generatedAt = new Date().toISOString();
const versions = (await fetchJson(DATA_DRAGON_API_URL))
  .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  .sort(compareVersions)
  .reverse();
const reforgedRuneVersions = versions.filter((version) => compareVersions(version, '7.22.1') >= 0);
const itemsByKey = new Map();
const runesByKey = new Map();

console.log(`Loading item snapshots from ${versions.length} Data Dragon versions…`);
const itemSnapshots = await mapWithConcurrency(versions, 12, async (version, index) => {
  const data = await fetchJson(`${DATA_DRAGON_CDN_URL}/${version}/data/en_US/item.json`);
  if ((index + 1) % 25 === 0 || index + 1 === versions.length) console.log(`Loaded ${index + 1}/${versions.length} item snapshots.`);
  return { data, version };
});
for (const snapshot of itemSnapshots) mergeItemSnapshot(itemsByKey, snapshot.version, snapshot.data);

console.log(`Loading rune snapshots from ${reforgedRuneVersions.length} Data Dragon versions…`);
const runeSnapshots = await mapWithConcurrency(reforgedRuneVersions, 12, async (version, index) => {
  try {
    const data = await fetchJson(`${DATA_DRAGON_CDN_URL}/${version}/data/en_US/runesReforged.json`);
    if ((index + 1) % 25 === 0 || index + 1 === reforgedRuneVersions.length) console.log(`Loaded ${index + 1}/${reforgedRuneVersions.length} rune snapshots.`);
    return { data, version };
  } catch (error) {
    console.warn(`Skipping rune snapshot ${version}: ${error.message}`);
    return null;
  }
});
for (const snapshot of runeSnapshots) {
  if (snapshot) mergeRuneSnapshot(runesByKey, snapshot.version, snapshot.data);
}

const items = deduplicateItemsByName([...itemsByKey.values()]);
const runes = deduplicateRunesByName([...runesByKey.values()]);
if (!items.length || !runes.length) throw new Error('The collection item or rune catalogue is empty.');

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([
  writeFile(ITEM_CATALOGUE_PATH, `${JSON.stringify({ generatedAt, sources: { dataDragonVersions: versions }, items }, null, 2)}\n`),
  writeFile(RUNE_CATALOGUE_PATH, `${JSON.stringify({ generatedAt, sources: { dataDragonRuneVersions: reforgedRuneVersions }, runes }, null, 2)}\n`),
  writeFile(ITEM_REPORT_PATH, createItemReport(items, generatedAt, versions)),
  writeFile(RUNE_REPORT_PATH, createRuneReport(runes, generatedAt, reforgedRuneVersions)),
]);

console.log(`Generated ${items.length} collection items and ${runes.length} collection runes.`);
