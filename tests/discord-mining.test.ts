import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildMiningCompletedPanel, buildMiningLaunchPanel, buildMiningReturnPanel } from '../discord-bot/src/interactions';
import {
  getMiningCraftingRecipe,
  getMiningDepth,
  getMiningResource,
  getMiningTravelDurationMs,
  getMiningUpgrade,
  findMiningResource,
  MINING_DEPTHS,
  MINING_REWARD_WEIGHTS,
  MINING_UPGRADES,
  resolveMiningExpedition,
  type MiningEquipmentSnapshot,
} from '../discord-bot/src/mining-catalog';
import { getDiscordMinigameTierReferences } from '../discord-bot/src/minigame-tier-references';
import { MINING_DEPTH_CONFIG, MINING_SHOP_UPGRADE_CONFIG } from '../discord-bot/src/minigame-content-config';

type SerializedCommandOption = {
  name: string;
  options?: SerializedCommandOption[];
  required?: boolean;
};

const starterEquipment: MiningEquipmentSnapshot = {
  catalogVersion: 1,
  descendDurationMs: 2_500,
  elevatorTier: 0,
  filterTier: 0,
  hasteLevel: 0,
  luckLevel: 0,
  storageCapacity: 5,
  toolId: 'wooden-pickaxe',
  toolStonesPerSecond: 0.1,
};

function componentCustomId(component: { data: unknown }) {
  if (typeof component.data !== 'object' || component.data === null || !('custom_id' in component.data)) return undefined;
  const customId = component.data.custom_id;
  return typeof customId === 'string' ? customId : undefined;
}

describe('Discord mining command contract', () => {
  it('registers the grouped expedition commands and mining management commands', () => {
    const mining = serializedCommandDefinitions().find((command) => command.name === 'mining');
    const expedition = mining?.options?.find((option) => option.name === 'expedition') as SerializedCommandOption | undefined;
    expect(expedition?.options?.map((option) => option.name)).toEqual(['set', 'view', 'return']);
    expect(mining?.options?.some((option) => option.name === 'shop')).toBe(true);
    expect(mining?.options?.some((option) => option.name === 'inventory')).toBe(true);
    expect(mining?.options?.some((option) => option.name === 'sell')).toBe(true);
    expect(mining?.options?.some((option) => option.name === 'help')).toBe(true);

    const sell = mining?.options?.find((option) => option.name === 'sell') as SerializedCommandOption | undefined;
    expect(sell?.options?.map((option) => option.name)).toEqual(['resource', 'amount']);
    expect(sell?.options?.every((option) => option.required)).toBe(true);
  });
});

describe('Discord mining catalogue', () => {
  it('defines all seven named, tool-gated depths and five fossils per depth', () => {
    expect(MINING_DEPTHS.map((depth) => depth.name)).toEqual([
      'Shallow Quarry',
      'Copper Veins',
      'Iron Delve',
      'Silverworks',
      'Gilded Depths',
      'Cobalt Hollow',
      'Adamant Abyss',
    ]);
    expect(MINING_DEPTHS.every((depth) => depth.fossils.length === 5)).toBe(true);
    expect(getMiningDepth(2)?.requiredToolId).toBe('stone-pickaxe');
    expect(getMiningDepth(7)?.requiredToolId).toBe('advanced-drill');
  });

  it('keeps the requested starter storage and corrected high-tech drill recipe', () => {
    expect(getMiningUpgrade('shabby-bin')?.value).toBe(5);
    expect(getMiningUpgrade('shabby-bin')?.recipe).toBeUndefined();
    expect(getMiningUpgrade('high-tech-drill')?.recipe).toEqual([
      { resourceId: 'titanium', quantity: 3000 },
      { resourceId: 'adamantite', quantity: 3000 },
      { resourceId: 'diamond', quantity: 750 },
    ]);
  });

  it('has no Mining-only skill upgrades and resolves ore or gem sale names', () => {
    expect(MINING_UPGRADES.map((upgrade) => upgrade.category)).not.toContain('skill');
    expect(findMiningResource('Copper')?.id).toBe('copper');
    expect(findMiningResource('moissanite')?.name).toBe('Moissanite');
    expect(findMiningResource('Compsognathus Fossil')?.kind).toBe('fossil');
  });

  it('aligns ore and gem values with their matching Fishing region tiers', () => {
    expect(MINING_DEPTHS.map((depth) => [
      depth.ores[0]?.saleValue,
      depth.ores[1]?.saleValue,
      depth.gems[0]?.saleValue,
      depth.gems[1]?.saleValue,
    ])).toEqual([
      [7, 11, 20, 40],
      [10, 17, 31, 75],
      [18, 30, 55, 123],
      [38, 65, 115, 260],
      [60, 98, 170, 395],
      [90, 148, 270, 650],
      [142, 242, 440, 1_025],
    ]);
  });

  it('uses multiplicative elevator and haste travel reductions', () => {
    expect(getMiningTravelDurationMs(5_000, 0, 0)).toBe(2_500);
    expect(getMiningTravelDurationMs(5_000, 3, 4)).toBe(1_400);
  });

  it('applies the capped Cheapskate discount to material recipes', () => {
    const sturdyDrill = getMiningUpgrade('sturdy-drill');
    expect(sturdyDrill).toBeDefined();
    expect(getMiningCraftingRecipe(sturdyDrill!, 4)).toEqual([
      { resourceId: 'gold', quantity: 160 },
      { resourceId: 'platinum', quantity: 160 },
      { resourceId: 'amethyst', quantity: 32 },
    ]);
  });

  it('provides valid, unique material costs for every craftable upgrade', () => {
    for (const upgrade of MINING_UPGRADES) {
      if (!upgrade.recipe) continue;

      expect(upgrade.recipe.length).toBeGreaterThan(0);
      expect(new Set(upgrade.recipe.map((item) => item.resourceId)).size).toBe(upgrade.recipe.length);
      for (const item of upgrade.recipe) {
        expect(getMiningResource(item.resourceId)).toBeDefined();
        expect(item.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe('Discord Mining tier reference', () => {
  it('renders every depth resource and its authoritative sell value', () => {
    const miningReference = getDiscordMinigameTierReferences().find((reference) => reference.fileName === 'mining-tiers.md');

    expect(miningReference?.contents).toContain('### Depth 1: Shallow Quarry');
    expect(miningReference?.contents).toContain('| Coal | ore | — | 7 |');
    expect(miningReference?.contents).toContain('| Moissanite | gem | — | 1,025 |');
    expect(miningReference?.contents).toContain('| Compsognathus Fossil | fossil | — | Not sellable |');
    expect(miningReference?.contents).toContain('## Mining progression tiers');
    expect(miningReference?.contents).toContain('minigame-content-config.ts');
    expect(MINING_DEPTHS).toEqual(MINING_DEPTH_CONFIG);
  });
});

describe('Discord Mining shop configuration', () => {
  it('supplies every shop upgrade and recipe to the live catalogue', () => {
    expect(MINING_UPGRADES).toEqual(MINING_SHOP_UPGRADE_CONFIG);
    expect(MINING_SHOP_UPGRADE_CONFIG.find((upgrade) => upgrade.id === 'high-tech-drill')).toMatchObject({
      recipe: [
        { resourceId: 'titanium', quantity: 3_000 },
        { resourceId: 'adamantite', quantity: 3_000 },
        { resourceId: 'diamond', quantity: 750 },
      ],
      value: 25,
    });
  });
});

describe('Discord mining expedition resolution', () => {
  it('uses the specified reward weights', () => {
    expect(MINING_REWARD_WEIGHTS).toEqual({ fossil: 1, gem: 10, ore: 100, stone: 500 });
  });

  it('resolves the same snapshotted expedition deterministically and stops at storage capacity', () => {
    const first = resolveMiningExpedition(1, starterEquipment, 42_424, 600_000);
    const second = resolveMiningExpedition(1, starterEquipment, 42_424, 600_000);
    expect(second).toEqual(first);
    expect(first.storageUsed).toBe(5);
    expect(first.stoneBroken).toBeLessThanOrEqual(60);
    expect(first.cargo.reduce((total, item) => total + item.quantity, 0) + first.stoneStored).toBe(first.storageUsed);
  });

  it('does not perform work after an already full minecart', () => {
    const full = resolveMiningExpedition(7, {
      ...starterEquipment,
      storageCapacity: 5,
      toolId: 'high-tech-drill',
      toolStonesPerSecond: 25,
    }, 9001, 86_400_000);
    expect(full.storageUsed).toBe(5);
    expect(full.stoneBroken).toBeLessThan(100);
  });
});

describe('website-originated Mining Discord results', () => {
  it('uses an owner-controlled completed-result panel without automatically posting launch or recall state', () => {
    const launch = buildMiningLaunchPanel('12345678901234567', 1, 2_500);
    const returnPanel = buildMiningReturnPanel('12345678901234567', 1, resolveMiningExpedition(1, starterEquipment, 42, 60_000), 2_500);
    const completedPanel = buildMiningCompletedPanel('12345678901234567', 1, resolveMiningExpedition(1, starterEquipment, 42, 60_000));

    expect(launch.embeds[0]?.data.title).toContain('Shallow Quarry expedition launched');
    expect(launch.components.flatMap((row) => row.components).map(componentCustomId)).toEqual(expect.arrayContaining([
      'mining-expedition:view:12345678901234567',
      'mining-expedition:return:12345678901234567',
    ]));
    expect(returnPanel.embeds[0]?.data.title).toBe('Minecart recalled');
    expect(returnPanel.components.flatMap((row) => row.components).map(componentCustomId)).toEqual(expect.arrayContaining([
      'mining-expedition:repeat:12345678901234567:1',
    ]));
    expect(completedPanel.embeds[0]?.data.title).toContain('Shallow Quarry expedition complete');
    expect(completedPanel.components.flatMap((row) => row.components).map(componentCustomId)).toEqual([
      'mining-expedition:repeat:12345678901234567:1',
    ]);
  });
});
