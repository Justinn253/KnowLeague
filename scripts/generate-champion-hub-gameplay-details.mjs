import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DRAGON_VERSION = '16.20.1';
const DATA_DRAGON_BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;
const STRUCTURED_GAMEPLAY_CATALOGUE_URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';
const MAX_GAMEPLAY_LEVEL = 20;
const MAX_EFFECT_PARAGRAPHS = 3;
const MAX_PROGRESSION_ROWS = 8;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const overviewPath = path.resolve(scriptDirectory, '../data/catalogs/champion-hub-overviews.json');
const outputPath = path.resolve(scriptDirectory, '../data/catalogs/champion-hub-gameplay-details.json');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

function normalized(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatNumber(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** League's level-stat curve, shown through the Level 20 view used by this panel. */
function statAtLevel(base, perLevel, level = MAX_GAMEPLAY_LEVEL) {
  const levelIndex = level - 1;
  return Number(base) + Number(perLevel) * levelIndex * (0.7025 + 0.0175 * levelIndex);
}

function statRange(stat, { percent = false, unavailableWhenZero = false } = {}) {
  const flat = Number(stat?.flat ?? 0);
  const perLevel = Number(stat?.perLevel ?? 0);

  if (unavailableWhenZero && flat === 0 && perLevel === 0) return 'N/A';

  const unit = percent ? '%' : '';
  if (perLevel === 0) return `${formatNumber(flat)}${unit}`;
  return `${formatNumber(flat)}${unit} → ${formatNumber(statAtLevel(flat, perLevel))}${unit}`;
}

function sourceStat(stats, key) {
  return stats?.[key] ?? { flat: 0, perLevel: 0 };
}

function statisticsFromStructuredChampion(champion) {
  const stats = champion.stats;
  const resourceUnavailable = champion.resource === 'NONE';
  const windup = sourceStat(stats, 'attackTotalTime').flat
    ? (sourceStat(stats, 'attackCastTime').flat / sourceStat(stats, 'attackTotalTime').flat) * 100
    : null;

  return [
    {
      title: 'Base statistics',
      stats: [
        { label: 'Health', value: statRange(sourceStat(stats, 'health')), kind: 'health' },
        { label: 'Resource', value: statRange(sourceStat(stats, 'mana'), { unavailableWhenZero: resourceUnavailable }), kind: 'resource' },
        { label: 'Health regeneration', value: statRange(sourceStat(stats, 'healthRegen')), kind: 'healthRegen' },
        { label: 'Resource regeneration', value: statRange(sourceStat(stats, 'manaRegen'), { unavailableWhenZero: resourceUnavailable }), kind: 'resourceRegen' },
        { label: 'Armor', value: statRange(sourceStat(stats, 'armor')), kind: 'armor' },
        { label: 'Attack damage', value: statRange(sourceStat(stats, 'attackDamage')), kind: 'attackDamage' },
        { label: 'Magic resistance', value: statRange(sourceStat(stats, 'magicResistance')), kind: 'magicResist' },
        { label: 'Critical damage', value: statRange(sourceStat(stats, 'criticalStrikeDamage'), { percent: true }), kind: 'criticalDamage' },
        { label: 'Move speed', value: statRange(sourceStat(stats, 'movespeed')), kind: 'moveSpeed' },
        { label: 'Attack range', value: statRange(sourceStat(stats, 'attackRange')), kind: 'attackRange' },
      ],
    },
    {
      title: 'Attack speed',
      stats: [
        // Attack-speed growth is already expressed as a percentage per level;
        // only the base attack-speed rate belongs in this row.
        { label: 'Base attack speed', value: statRange({ flat: sourceStat(stats, 'attackSpeed').flat, perLevel: 0 }), kind: 'attackSpeed' },
        { label: 'Windup', value: windup === null ? 'N/A' : `${formatNumber(windup)}%`, kind: 'windup' },
        { label: 'Attack speed ratio', value: statRange(sourceStat(stats, 'attackSpeedRatio')), kind: 'attackSpeed' },
        { label: 'Bonus attack speed', value: `0% → ${formatNumber(statAtLevel(0, sourceStat(stats, 'attackSpeed').perLevel))}%`, kind: 'attackSpeed' },
      ],
    },
  ];
}

function statisticsFromDataDragon(champion) {
  const stats = champion.stats;
  const resourceUnavailable = Number(stats.mp) === 0 && Number(stats.mpregen) === 0;
  const toStructured = (flat, perLevel) => ({ flat: Number(flat ?? 0), perLevel: Number(perLevel ?? 0) });

  return statisticsFromStructuredChampion({
    resource: resourceUnavailable ? 'NONE' : 'MANA',
    stats: {
      health: toStructured(stats.hp, stats.hpperlevel),
      mana: toStructured(stats.mp, stats.mpperlevel),
      healthRegen: toStructured(stats.hpregen, stats.hpregenperlevel),
      manaRegen: toStructured(stats.mpregen, stats.mpregenperlevel),
      armor: toStructured(stats.armor, stats.armorperlevel),
      attackDamage: toStructured(stats.attackdamage, stats.attackdamageperlevel),
      magicResistance: toStructured(stats.spellblock, stats.spellblockperlevel),
      criticalStrikeDamage: toStructured(175, 0),
      movespeed: toStructured(stats.movespeed, 0),
      attackRange: toStructured(stats.attackrange, 0),
      attackSpeed: toStructured(stats.attackspeed, stats.attackspeedperlevel),
      attackSpeedRatio: toStructured(stats.attackspeed, 0),
      attackCastTime: toStructured(0, 0),
      attackTotalTime: toStructured(0, 0),
    },
  });
}

function formatRankValue(value, unit) {
  const formattedValue = formatNumber(value);
  const formattedUnit = String(unit ?? '').trim();
  if (!formattedUnit) return formattedValue;
  if (formattedUnit.startsWith('%')) return `${formattedValue}${formattedUnit}`;
  return `${formattedValue} ${formattedUnit}`;
}

function progressionValues(modifiers) {
  const rankCount = Math.max(...modifiers.map((modifier) => modifier.values?.length ?? 0), 0);
  if (!rankCount) return [];

  return Array.from({ length: rankCount }, (_unused, index) => modifiers
    .map((modifier) => {
      const value = modifier.values?.[index] ?? modifier.values?.at(-1);
      const unit = modifier.units?.[index] ?? modifier.units?.at(-1);
      return value === undefined || value === null ? null : formatRankValue(value, unit);
    })
    .filter(Boolean)
    .join(' + '));
}

function uniqueProgressionLabel(label, usedLabels) {
  const normalizedLabel = label.trim() || 'Gameplay value';
  const count = usedLabels.get(normalizedLabel) ?? 0;
  usedLabels.set(normalizedLabel, count + 1);
  return count ? `${normalizedLabel} (${count + 1})` : normalizedLabel;
}

function structuredAbilityDetail(ability) {
  const paragraphs = (ability.effects ?? [])
    .map((effect) => effect.description?.trim())
    .filter(Boolean)
    .slice(0, MAX_EFFECT_PARAGRAPHS);
  const progression = [];
  const usedLabels = new Map();

  const addProgression = (label, modifiers) => {
    const values = progressionValues(modifiers ?? []);
    if (!values.length || progression.length >= MAX_PROGRESSION_ROWS) return;
    progression.push({ label: uniqueProgressionLabel(label, usedLabels), values });
  };

  if (ability.cooldown?.modifiers?.length) addProgression('Cooldown', ability.cooldown.modifiers);
  if (ability.cost?.modifiers?.length) addProgression('Cost', ability.cost.modifiers);

  for (const effect of ability.effects ?? []) {
    for (const leveling of effect.leveling ?? []) {
      addProgression(leveling.attribute ?? 'Gameplay value', leveling.modifiers);
    }
  }

  return {
    paragraphs: paragraphs.length ? paragraphs : [ability.blurb?.trim() || 'Gameplay detail is not available for this ability yet.'],
    notes: [],
    progression,
  };
}

function structuredAbilityByOverviewAbility(structuredChampion, overviewAbility) {
  const slot = overviewAbility.slot === 'Passive' ? 'P' : overviewAbility.slot;
  const candidates = structuredChampion.abilities?.[slot] ?? [];
  const matchingAbility = candidates.find((candidate) => normalized(candidate.name) === normalized(overviewAbility.name));
  return matchingAbility ?? candidates[0];
}

function structuredGameplayAbilities(structuredChampion, overviewChampion) {
  return overviewChampion.abilities.map((overviewAbility) => {
    const sourceAbility = structuredAbilityByOverviewAbility(structuredChampion, overviewAbility);
    if (!sourceAbility) throw new Error(`Missing structured ${overviewAbility.slot} ability for ${overviewChampion.name}.`);
    const detail = structuredAbilityDetail(sourceAbility);

    return {
      abilityId: overviewAbility.id,
      summary: detail.paragraphs[0],
      detail,
    };
  });
}

function fallbackGameplayAbilities(dataDragonChampion, overviewChampion) {
  const spellsBySlot = {
    Passive: dataDragonChampion.passive,
    Q: dataDragonChampion.spells[0],
    W: dataDragonChampion.spells[1],
    E: dataDragonChampion.spells[2],
    R: dataDragonChampion.spells[3],
  };

  return overviewChampion.abilities.map((overviewAbility) => {
    const spell = spellsBySlot[overviewAbility.slot];
    const paragraphs = [spell?.description?.replace(/<[^>]+>/g, '').trim() || overviewAbility.description];
    const progression = [];

    if (spell?.cooldown?.length) progression.push({ label: 'Cooldown', values: spell.cooldown.map((value) => `${formatNumber(value)} sec`) });
    if (spell?.cost?.length && spell.cost.some((value) => Number(value) !== 0)) progression.push({ label: 'Cost', values: spell.cost.map(formatNumber) });
    for (const [index, value] of (spell?.effectBurn ?? []).entries()) {
      if (!value || !String(value).trim() || String(value).split('/').every((entry) => Number(entry) === 0)) continue;
      progression.push({ label: `Effect ${index}`, values: String(value).split('/').map((entry) => entry.trim()) });
      if (progression.length >= MAX_PROGRESSION_ROWS) break;
    }

    return {
      abilityId: overviewAbility.id,
      summary: paragraphs[0],
      detail: { paragraphs, notes: [], progression },
    };
  });
}

function structuredChampionForOverviewChampion(champions, overviewChampion) {
  return champions[overviewChampion.id]
    ?? Object.values(champions).find((champion) => normalized(champion.name) === normalized(overviewChampion.name));
}

async function dataDragonChampion(championId) {
  const payload = await fetchJson(`${DATA_DRAGON_BASE_URL}/data/en_US/champion/${championId}.json`);
  const champion = payload.data?.[championId];
  if (!champion) throw new Error(`Data Dragon did not return ${championId}.`);
  return champion;
}

async function main() {
  const [overviewText, structuredChampions] = await Promise.all([
    readFile(overviewPath, 'utf8'),
    fetchJson(STRUCTURED_GAMEPLAY_CATALOGUE_URL),
  ]);
  const overview = JSON.parse(overviewText);
  const champions = {};

  for (const overviewChampion of overview.champions) {
    const structuredChampion = structuredChampionForOverviewChampion(structuredChampions, overviewChampion);

    if (structuredChampion) {
      champions[overviewChampion.slug] = {
        levelLabel: 'Level 1 → 20',
        statGroups: statisticsFromStructuredChampion(structuredChampion),
        abilities: structuredGameplayAbilities(structuredChampion, overviewChampion),
        source: {
          label: 'Structured League gameplay data',
          url: STRUCTURED_GAMEPLAY_CATALOGUE_URL,
        },
      };
      continue;
    }

    const fallbackChampion = await dataDragonChampion(overviewChampion.id);
    champions[overviewChampion.slug] = {
      levelLabel: 'Level 1 → 20',
      statGroups: statisticsFromDataDragon(fallbackChampion),
      abilities: fallbackGameplayAbilities(fallbackChampion, overviewChampion),
      source: {
        label: `Data Dragon ${DATA_DRAGON_VERSION} fallback`,
        url: `${DATA_DRAGON_BASE_URL}/data/en_US/champion/${overviewChampion.id}.json`,
      },
    };
  }

  if (Object.keys(champions).length !== overview.champions.length) {
    throw new Error('The generated Gameplay Details catalogue did not cover every Overview champion.');
  }

  for (const [slug, champion] of Object.entries(champions)) {
    if (champion.statGroups.length !== 2 || champion.abilities.length !== 5 || champion.abilities.some((ability) => !ability.detail.paragraphs.length)) {
      throw new Error(`Incomplete Gameplay Details profile for ${slug}.`);
    }
  }

  const catalogue = {
    patch: overview.patch,
    sources: {
      structuredGameplay: STRUCTURED_GAMEPLAY_CATALOGUE_URL,
      dataDragonFallback: DATA_DRAGON_BASE_URL,
    },
    champions,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
  console.log(`Wrote Gameplay Details for ${Object.keys(champions).length} Champion Hub profiles to ${path.relative(process.cwd(), outputPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
