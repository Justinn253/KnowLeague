import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FISHING_BIOMES,
  FISHING_CRATE_LOOT,
  FISHING_CRATE_RARITIES,
  FISHING_EVENTS,
  FISHING_EXPEDITION_LENGTHS,
  FISHING_FISH,
  FISHING_FISH_RARITY_WEIGHTS,
  FISHING_LEGENDARY_FISH_SALE_MULTIPLIER,
  FISHING_RARITIES,
  FISHING_UPGRADES,
  type FishingFish,
} from './fishing-catalog.js';
import { MINING_DEPTHS, MINING_REWARD_WEIGHTS, MINING_UPGRADES } from './mining-catalog.js';

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

type TierReference = {
  contents: string;
  fileName: string;
};

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value * 100)}%`;
}

function formatDuration(seconds: number) {
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? '' : 's'}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function escapeTableValue(value: string | number) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers: readonly string[], rows: ReadonlyArray<readonly (string | number)[]>) {
  return [
    `| ${headers.map(escapeTableValue).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeTableValue).join(' | ')} |`),
  ].join('\n');
}

function fishingSaleValue(fish: FishingFish) {
  const baseRange = `${formatNumber(fish.minSaleValue)}–${formatNumber(fish.maxSaleValue)}`;
  if (fish.rarity !== 'Legendary') return baseRange;

  return `${formatNumber(fish.minSaleValue * FISHING_LEGENDARY_FISH_SALE_MULTIPLIER)}–${formatNumber(fish.maxSaleValue * FISHING_LEGENDARY_FISH_SALE_MULTIPLIER)} (base ${baseRange} ×${FISHING_LEGENDARY_FISH_SALE_MULTIPLIER})`;
}

function renderFishingTierReference() {
  const sections = [
    '# Discord Fishing tier reference',
    '',
    '> Generated from the Fishing catalogue. Edit catches and balance values in `discord-bot/src/minigame-content-config.ts`, not this local file; then run `npm run discord:minigame-tiers:generate`.',
    '',
    'All sale values are in KnowBucks before player, relic, role, weekday, and event bonuses. Legendary fish already include the standard 15× legendary multiplier in the displayed value.',
    '',
    '## Base fish rarity weights',
    '',
    table(['Rarity', 'Weight'], FISHING_RARITIES.map((rarity) => [rarity, FISHING_FISH_RARITY_WEIGHTS[rarity]])),
    '',
    '## Expedition length tiers',
    '',
    table(
      ['Tier', 'Required Fishing Level', 'Base Duration', 'Fish Rolls', 'Higher-Rarity Weight Bonus'],
      FISHING_EXPEDITION_LENGTHS.map((length) => [
        length.tier,
        length.requiredFishingLevel,
        formatDuration(length.durationSeconds),
        length.catchCount[0] === length.catchCount[1] ? length.catchCount[0] : `${length.catchCount[0]}–${length.catchCount[1]}`,
        `${length.higherRarityWeightBonusPercent}%`,
      ]),
    ),
    '',
    '## Biomes and catches',
  ];

  for (const biome of FISHING_BIOMES) {
    const unlock = biome.requiredBoatUpgradeId
      ? FISHING_UPGRADES.find((upgrade) => upgrade.id === biome.requiredBoatUpgradeId)?.name ?? biome.requiredBoatUpgradeId
      : 'Starter biome';
    const catches = FISHING_FISH.filter((fish) => fish.biomeId === biome.id);
    const crateLoot = FISHING_CRATE_LOOT.filter((loot) => loot.biomeId === biome.id);

    sections.push(
      '',
      `### ${biome.name}`,
      '',
      `- Unlock: ${unlock}`,
      `- Available crate rarities: ${biome.crateRarities.join(', ')}`,
      '',
      table(
        ['Catch', 'Rarity', 'Sell Value'],
        catches.map((fish) => [fish.name, fish.rarity, fishingSaleValue(fish)]),
      ),
      '',
      '#### Auto-opened crate loot',
      '',
      table(
        ['Loot', 'Crate Rarity', 'Sell Value', 'Value Above Biome-Rarity Average'],
        crateLoot.map((loot) => [
          loot.name,
          loot.rarity,
          `${formatNumber(loot.minSaleValue)}–${formatNumber(loot.maxSaleValue)}`,
          `${loot.valueBonusPercent}%`,
        ]),
      ),
    );
  }

  for (const event of FISHING_EVENTS) {
    sections.push(
      '',
      `## Active event: ${event.name}`,
      '',
      `- Replacement chance: ${formatPercent(event.replacementChance)} per newly launched expedition.`,
      '- Event fish use the selected biome’s value range for their rarity; the event does not provide a separate sale-value table.',
      '',
      table(
        ['Catch', 'Rarity', 'Sell Value'],
        event.fish.map((fish) => [
          fish.name,
          fish.rarity,
          fish.nonSellable ? 'Not sellable (stored)' : 'Selected biome’s matching rarity range',
        ]),
      ),
    );
  }

  sections.push(
    '',
    '## Fishing progression tiers',
    '',
    table(
      ['Category', 'Upgrade', 'Cost', 'Required Level', 'Prerequisite', 'Effect'],
      FISHING_UPGRADES.map((upgrade) => [
        upgrade.category,
        upgrade.name,
        formatNumber(upgrade.cost),
        upgrade.requiredFishingLevel ?? '—',
        upgrade.requiredUpgradeId ? FISHING_UPGRADES.find((candidate) => candidate.id === upgrade.requiredUpgradeId)?.name ?? upgrade.requiredUpgradeId : '—',
        upgrade.description,
      ]),
    ),
    '',
    `Fishing crate rarities: ${FISHING_CRATE_RARITIES.join(', ')}.`,
  );

  return `${sections.join('\n')}\n`;
}

function miningRecipe(recipe: readonly { resourceId: string; quantity: number }[] | undefined) {
  if (!recipe || recipe.length === 0) return 'Starter / no recipe';
  return recipe.map((item) => `${formatNumber(item.quantity)} ${item.resourceId}`).join(', ');
}

function renderMiningTierReference() {
  const sections = [
    '# Discord Mining tier reference',
    '',
    '> Generated from the Mining catalogue. Edit depths and resource values in `discord-bot/src/minigame-content-config.ts`, not this local file; then run `npm run discord:minigame-tiers:generate`.',
    '',
    'All resource sale values are in KnowBucks before player bonuses. Fossils are collection discoveries and have no sell value.',
    '',
    '## Base reward weights',
    '',
    table(['Result', 'Weight'], Object.entries(MINING_REWARD_WEIGHTS).map(([kind, weight]) => [kind, weight])),
    '',
    '## Depth tiers',
  ];

  for (const depth of MINING_DEPTHS) {
    const requiredTool = depth.requiredToolId
      ? MINING_UPGRADES.find((upgrade) => upgrade.id === depth.requiredToolId)?.name ?? depth.requiredToolId
      : 'Starter depth';
    const resources = [...depth.ores, ...depth.gems, ...depth.fossils];

    sections.push(
      '',
      `### Depth ${depth.id}: ${depth.name}`,
      '',
      `- Unlock: ${requiredTool}`,
      `- Base descent and ascent: ${formatDuration(depth.descendAndAscendMs / 1_000)}`,
      '',
      table(
        ['Resource', 'Type', 'Required Processor Tier', 'Sell Value'],
        resources.map((resource) => [
          resource.name,
          resource.kind,
          resource.processorTier ?? '—',
          resource.saleValue === undefined ? 'Not sellable' : formatNumber(resource.saleValue),
        ]),
      ),
    );
  }

  sections.push(
    '',
    '## Mining progression tiers',
    '',
    table(
      ['Category', 'Upgrade', 'Tier Value', 'Prerequisite', 'Crafting Recipe', 'Effect'],
      MINING_UPGRADES.map((upgrade) => [
        upgrade.category,
        upgrade.name,
        upgrade.value,
        upgrade.previousUpgradeId ? MINING_UPGRADES.find((candidate) => candidate.id === upgrade.previousUpgradeId)?.name ?? upgrade.previousUpgradeId : '—',
        miningRecipe(upgrade.recipe),
        upgrade.description,
      ]),
    ),
  );

  return `${sections.join('\n')}\n`;
}

export function getDiscordMinigameTierReferences(): readonly TierReference[] {
  return [
    { fileName: 'fishing-tiers.md', contents: renderFishingTierReference() },
    { fileName: 'mining-tiers.md', contents: renderMiningTierReference() },
  ];
}

function getDefaultOutputDirectory() {
  return fileURLToPath(new URL('../../data/runtime/discord-minigame-tiers/', import.meta.url));
}

export async function writeDiscordMinigameTierReferences(outputDirectory?: string) {
  const resolvedOutputDirectory = outputDirectory ?? getDefaultOutputDirectory();
  await mkdir(resolvedOutputDirectory, { recursive: true });
  const references = getDiscordMinigameTierReferences();
  await Promise.all(references.map((reference) => writeFile(
    join(resolvedOutputDirectory, reference.fileName),
    reference.contents,
    'utf8',
  )));
  return references.map((reference) => join(resolvedOutputDirectory, reference.fileName));
}
