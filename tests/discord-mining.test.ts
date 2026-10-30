import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildMiningCataloguePanel, buildMiningCompletedPanel, buildMiningLaunchPanel, buildMiningReturnPanel } from '../discord-bot/src/interactions';
import {
  getMiningCraftingRecipe,
  getMiningDepth,
  getMiningResource,
  getMiningTravelDurationMs,
  getMiningUpgrade,
  findMiningResource,
  createMiningExpeditionEvent,
  getMiningEventActivationElapsedMs,
  getMiningEventTimeLimitMs,
  MINING_DEPTHS,
  MINING_REWARD_WEIGHTS,
  MINING_UPGRADES,
  getMiningRelicFindChance,
  resolveMiningExpedition,
  type MiningExpeditionEventState,
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
    expect(mining?.options?.some((option) => option.name === 'catalogue')).toBe(true);
    expect(mining?.options?.some((option) => option.name === 'sell')).toBe(true);
    expect(mining?.options?.some((option) => option.name === 'help')).toBe(true);
    const inventory = mining?.options?.find((option) => option.name === 'inventory') as SerializedCommandOption | undefined;
    const simulate = mining?.options?.find((option) => option.name === 'simulate') as SerializedCommandOption | undefined;
    expect(inventory?.options?.map((option) => option.name)).toEqual(['user']);
    expect(simulate?.options?.map((option) => option.name)).toEqual(['depth', 'x']);

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

  it('uses the requested dinosaur fossil sets for the replaced depths', () => {
    expect(MINING_DEPTHS.map((depth) => depth.fossils[0]?.name)).toEqual([
      'Triceratops Fragment 1/5',
      'Velociraptor Fragment 1/5',
      'Ankylosaurus Fragment 1/5',
      'Spinosaurus Fragment 1/5',
      'Tyrannosaurus Fragment 1/5',
      'Stegosaurus Fragment 1/5',
      'Brachiosaurus Fragment 1/5',
    ]);
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
    expect(findMiningResource('Triceratops Fragment 1/5')?.kind).toBe('fossil');
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
    expect(miningReference?.contents).toContain('| Triceratops Fragment 1/5 | fossil | — | Not sellable |');
    expect(miningReference?.contents).toContain('## Mining progression tiers');
    expect(miningReference?.contents).toContain('minigame-content-config.ts');
    expect(MINING_DEPTHS).toEqual(MINING_DEPTH_CONFIG);
  });
});

describe('Discord Mining catalogue', () => {
  it('shows each depth resource and relic discovery as permanent progress', () => {
    const panel = buildMiningCataloguePanel('12345678901234567', 1, 9_999_999_999_999, {
      acquiredGearItemIds: new Set(['mining-gear-bioluminescence']),
      acquiredResourceIds: new Set(['coal', 'triceratops-fragment-1']),
    });
    const fields = panel.embeds[0]?.data.fields ?? [];

    expect(panel.embeds[0]?.data.title).toBe('Mining catalogue · Depth 1: Shallow Quarry');
    expect(fields.find((field) => field.name === 'Ores')?.value).toContain('✅ Acquired — **Coal**');
    expect(fields.find((field) => field.name === 'Gems')?.value).toContain('⬜ Not acquired — **Opal**');
    expect(fields.find((field) => field.name === 'Fossil fragments')?.value).toContain('✅ Acquired — **Triceratops Fragment 1/5**');
    expect(fields.find((field) => field.name === 'Relics')?.value).toContain('✅ Found — **Bioluminescence**');
    expect(fields.find((field) => field.name === 'Relics')?.value).not.toContain('Ores glow nearby');
    expect(fields.map((field) => field.name)).toEqual(['Ores', 'Gems', '\u200B', 'Fossil fragments', 'Relics']);
    expect(fields.find((field) => field.name === 'Ores')?.inline).toBe(true);
    expect(fields.find((field) => field.name === 'Gems')?.inline).toBe(true);
    expect(fields[2]).toMatchObject({ name: '\u200B', value: '\u200B', inline: false });
    expect(fields.find((field) => field.name === 'Fossil fragments')?.inline).toBe(true);
    expect(fields.find((field) => field.name === 'Relics')?.inline).toBe(true);
    expect(panel.components.flatMap((row) => row.components).map(componentCustomId)).toEqual(expect.arrayContaining([
      'mining-catalogue:12345678901234567:9999999999999:1',
      'mining-catalogue:12345678901234567:9999999999999:7',
    ]));
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
    expect(full.cartFull).toBe(true);
  });

  it('rolls a Relic once on a full returning cart and scales odds with depth travel', () => {
    const unfinished = resolveMiningExpedition(1, starterEquipment, 42, 0);
    expect(unfinished.cartFull).toBe(false);
    expect(unfinished.gearItems).toEqual([]);
    expect(getMiningRelicFindChance(1)).toBe(1 / 250);
    expect(getMiningRelicFindChance(7)).toBe(1);
    const tierOneExpectedTravelMs = getMiningDepth(1)!.descendAndAscendMs / getMiningRelicFindChance(1);
    const tierSevenExpectedTravelMs = getMiningDepth(7)!.descendAndAscendMs / getMiningRelicFindChance(7);
    // Tier 7's configured travel time exceeds the 1/250 scaling ceiling, so
    // a guaranteed full-cart Relic is the closest possible expected wait.
    expect(tierSevenExpectedTravelMs / tierOneExpectedTravelMs).toBeLessThan(1.5);
  });

  it('plans one deterministic, depth-timed event while reducing Damaged Gear weight with Luck', () => {
    const first = createMiningExpeditionEvent(3, starterEquipment, 17, ['gear-sea-star']);
    const second = createMiningExpeditionEvent(3, starterEquipment, 17, ['gear-sea-star']);
    expect(second).toEqual(first);
    expect(getMiningEventTimeLimitMs(1)).toBe(30_000);
    expect(getMiningEventTimeLimitMs(7)).toBe(210_000);

    const eventCounts = (luckLevel: number) => Array.from({ length: 2_000 }, (_, seed) => createMiningExpeditionEvent(1, { ...starterEquipment, luckLevel }, seed + 1, ['gear-sea-star']))
      .filter((event) => event?.id === 'damaged-gear').length;
    expect(eventCounts(4)).toBeLessThan(eventCounts(0));

    const oreVeinPlan: MiningExpeditionEventState = { id: 'ore-vein', status: 'scheduled', trigger: 'half-cart', triggerDelayMs: 0, version: 1 };
    const activationAt = getMiningEventActivationElapsedMs(oreVeinPlan, 1, starterEquipment, 42_424, 60_000);
    expect(activationAt).not.toBeNull();
    expect(resolveMiningExpedition(1, starterEquipment, 42_424, activationAt ?? 0).storageUsed).toBeGreaterThanOrEqual(3);
  });

  it('applies event outcomes in the shared resolver without changing normal expeditions', () => {
    const failedTemple: MiningExpeditionEventState = {
      action: 'attempt-relic',
      id: 'lost-temple',
      relicItemId: 'gear-sea-star',
      resolvedAt: new Date(1_000).toISOString(),
      status: 'resolved',
      success: false,
      trigger: 'full-cart',
      triggerDelayMs: 0,
      version: 1,
    };
    const destroyed = resolveMiningExpedition(1, starterEquipment, 55, 60_000, failedTemple, 0);
    expect(destroyed).toMatchObject({ cargo: [], miningXpAwarded: 0, storageUsed: 0 });

    const oreVein: MiningExpeditionEventState = {
      action: 'claim-ores',
      id: 'ore-vein',
      resolvedAt: new Date(1_000).toISOString(),
      status: 'resolved',
      trigger: 'half-cart',
      triggerDelayMs: 0,
      version: 1,
    };
    const filled = resolveMiningExpedition(1, starterEquipment, 55, 60_000, oreVein, 0);
    expect(filled.storageUsed).toBe(starterEquipment.storageCapacity);
    expect(filled.cargo.every((item) => item.kind === 'ore')).toBe(true);

    const gemCluster: MiningExpeditionEventState = {
      action: 'claim-gems',
      id: 'gem-cluster',
      resolvedAt: new Date(1_000).toISOString(),
      status: 'resolved',
      trigger: 'full-cart',
      triggerDelayMs: 0,
      version: 1,
    };
    const gems = resolveMiningExpedition(1, { ...starterEquipment, passiveGearItemIds: ['mining-gear-gem-bag'] }, 55, 60_000, gemCluster, 0);
    expect(gems.gemStorageUsed).toBe(gems.gemStorageCapacity);
    expect(gems.cargo.some((item) => item.kind === 'gem')).toBe(true);
  });
});

describe('website-originated Mining Discord results', () => {
  it('shows secured and settled Relic discoveries alongside the minecart cargo', () => {
    const result = {
      ...resolveMiningExpedition(1, starterEquipment, 42, 60_000),
      gearItems: [{ itemId: 'mining-gear-bioluminescence', quantity: 1 }],
    };
    const returning = buildMiningReturnPanel('12345678901234567', 1, result, 2_500);
    const completed = buildMiningCompletedPanel('12345678901234567', 1, result);

    expect(returning.embeds[0]?.data.fields?.find((field) => field.name === 'Relics secured')?.value).toContain('Bioluminescence');
    expect(completed.embeds[0]?.data.fields?.find((field) => field.name === 'Relics found')?.value).toContain('Bioluminescence');
  });

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
