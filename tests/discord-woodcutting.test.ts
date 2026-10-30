import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildWoodcuttingInventoryPanel, buildWoodcuttingShopPanel } from '../discord-bot/src/interactions';
import { getDiscordMinigameTierReferences } from '../discord-bot/src/minigame-tier-references';
import {
  getWoodcuttingAxe,
  getWoodcuttingChopIntervalMs,
  getWoodcuttingCritters,
  getWoodcuttingSapling,
  resolveWoodcuttingClaim,
  WOODCUTTING_UPGRADES,
  WOODCUTTING_WORKER_COSTS,
} from '../discord-bot/src/woodcutting-catalog';
import { getWoodcuttingAssignmentIssue, type WoodcuttingPlayerState } from '../discord-bot/src/woodcutting';

type SerializedCommandOption = { name: string; options?: SerializedCommandOption[]; required?: boolean };

const panelState: WoodcuttingPlayerState = {
  axes: [{ id: 11, tier: 1 }],
  balance: 500,
  inventory: [{ item_id: 'oak-sapling', quantity: 5 }, { item_id: 'oak-wood', quantity: 3 }, { item_id: 'ant', quantity: 2 }],
  lastClaimedAt: '2026-10-30T00:00:00.000Z',
  miningInventory: [],
  miningOwnedUpgradeIds: [],
  ownedUpgradeIds: [],
  processorTier: 0,
  workers: [{ workerNumber: 1, axeId: 11, axeTier: 1, saplingTier: 1, chopRemainderMs: 0 }],
};

describe('Discord Woodcutting command contract', () => {
  it('registers claiming, staffing, assignment, crafting, shop, inventory, and catalogue commands', () => {
    const woodcutting = serializedCommandDefinitions().find((command) => command.name === 'woodcutting');
    expect(woodcutting?.options?.map((option) => option.name)).toEqual([
      'claim', 'hire', 'craft-axe', 'buy-saplings', 'assign', 'assign-auto', 'craft-upgrade', 'shop', 'inventory', 'catalogue', 'help',
    ]);
    const assign = woodcutting?.options?.find((option) => option.name === 'assign') as SerializedCommandOption | undefined;
    const buySaplings = woodcutting?.options?.find((option) => option.name === 'buy-saplings') as SerializedCommandOption | undefined;
    expect(assign?.options?.map((option) => option.name)).toEqual(['worker', 'axe-tier', 'sapling-tier']);
    expect(assign?.options?.every((option) => option.required)).toBe(true);
    expect(buySaplings?.options?.map((option) => option.name)).toEqual(['type', 'quantity']);
  });

  it('renders separate tabbed shop and inventory categories with direct purchase commands', () => {
    const owner = '12345678901234567';
    const expiresAt = 9_999_999_999_999;
    const workforce = buildWoodcuttingInventoryPanel(owner, 'Tester', panelState, expiresAt, 'workforce');
    const resources = buildWoodcuttingInventoryPanel(owner, 'Tester', panelState, expiresAt, 'resources');
    const finds = buildWoodcuttingInventoryPanel(owner, 'Tester', panelState, expiresAt, 'finds');
    const workersShop = buildWoodcuttingShopPanel(owner, panelState, expiresAt, 'workers');
    const saplingShop = buildWoodcuttingShopPanel(owner, panelState, expiresAt, 'saplings');

    expect(workforce.embeds[0]?.data.fields?.map((field) => field.name)).toEqual(['Lumberjacks', 'Axes', 'Permanent upgrades']);
    expect(resources.embeds[0]?.data.fields?.map((field) => field.name)).toEqual(['Saplings', 'Wood']);
    expect(finds.embeds[0]?.data.fields?.map((field) => field.name)).toEqual(['Critters', 'Amber finds']);
    expect(workersShop.embeds[0]?.data.fields?.at(-1)?.value).toBe('`/woodcutting hire`');
    expect(saplingShop.embeds[0]?.data.fields?.at(-1)?.value).toContain('/woodcutting buy-saplings');
    expect(workersShop.components.flatMap((row) => row.components).map((component) => component.data.custom_id)).toEqual(expect.arrayContaining([
      `woodcutting-shop:${owner}:${expiresAt}:workers`,
      `woodcutting-shop:${owner}:${expiresAt}:meals`,
    ]));
  });

  it('gives an exact sapling purchase command when a valid manual assignment has no stock', () => {
    const issue = getWoodcuttingAssignmentIssue({ ...panelState, inventory: [] }, 1, 1, 1);
    expect(issue?.message).toContain('Oak Sapling');
    expect(issue?.command).toBe('/woodcutting buy-saplings type:Oak Sapling quantity:1');
  });
});

describe('Discord Woodcutting catalogue', () => {
  it('keeps the requested worker economy, recipes, processor gates, and named Golden critters', () => {
    expect(WOODCUTTING_WORKER_COSTS).toEqual([500, 2_500, 10_000, 100_000, 500_000, 2_500_000, 15_000_000, 100_000_000, 1_000_000_000, 10_000_000_000]);
    expect(getWoodcuttingAxe(1)?.recipe).toEqual([
      { source: 'mining', itemId: 'quartz', quantity: 5 },
      { source: 'mining', itemId: 'pearl', quantity: 1 },
    ]);
    expect(getWoodcuttingSapling(1)?.processorUpgradeId).toBeUndefined();
    expect(getWoodcuttingSapling(7)?.processorUpgradeId).toBe('processor-depth-7');
    expect(getWoodcuttingCritters(2).at(-1)?.name).toBe('Golden Caterpillar');
    expect(getWoodcuttingCritters(7).at(-1)?.name).toBe('Golden Roach');
    expect(WOODCUTTING_UPGRADES.filter((upgrade) => upgrade.category === 'meal').map((upgrade) => upgrade.name)).toEqual([
      'Woodland Chowder', "Lumberjack's Stew", "Sap-Saver's Stew", "Tracker's Stew", 'Bountiful Stew',
    ]);
  });

  it('renders a generated reference for the third minigame', () => {
    const reference = getDiscordMinigameTierReferences().find((entry) => entry.fileName === 'woodcutting-tiers.md');
    expect(reference?.contents).toContain('## Lumberjack hires');
    expect(reference?.contents).toContain('Tier 7: Dragons Blood Sapling');
    expect(reference?.contents).toContain("Sap-Saver's Stew");
  });
});

describe('Discord Woodcutting claim resolution', () => {
  it('uses only completed chops, consumes saplings, and preserves no work for an unassigned worker', () => {
    const result = resolveWoodcuttingClaim([
      { workerNumber: 1, axeTier: 1, saplingTier: 1, chopRemainderMs: 0 },
      { workerNumber: 2, axeTier: null, saplingTier: null, chopRemainderMs: 42_000 },
    ], [], new Map([[1, 2]]), 180_000, 42);

    expect(result.attemptedChops).toBe(3);
    expect(result.finishedChops).toBe(2);
    expect(result.saplingsConsumed).toEqual([{ itemId: 'oak-sapling', quantity: 2 }]);
    expect(result.workerRemainders).toEqual([
      { workerNumber: 1, chopRemainderMs: 0 },
      { workerNumber: 2, chopRemainderMs: 0 },
    ]);
  });

  it('applies Sharpening Station and Lumberjack Stew speed bonuses to every purchased worker', () => {
    expect(getWoodcuttingChopIntervalMs([], 10)).toBe(60_000);
    expect(getWoodcuttingChopIntervalMs(['sharpening-1', 'meal-lumberjacks-stew'], 10)).toBeCloseTo(50_000 / 1.1);
  });
});
