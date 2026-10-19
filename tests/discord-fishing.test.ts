import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildFishingLaunchResponse } from '../discord-bot/src/interactions';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_FISH,
  FISHING_MYTHIC_FISH,
  FISHING_UPGRADES,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingExpeditionLength,
  resolveFishingExpedition,
  type FishingExpeditionResult,
  type FishingEquipmentSnapshot,
} from '../discord-bot/src/fishing-catalog';
import {
  buildFishingCompletionEmbed,
  buildFishingRepeatCustomId,
  parseFishingRepeatCustomId,
  selectFishingCrewSlot,
} from '../discord-bot/src/fishing';

type SerializedSubcommand = {
  choices?: readonly unknown[];
  name: string;
  options?: SerializedSubcommand[];
};

const starterEquipment: FishingEquipmentSnapshot = {
  catalogueVersion: 4,
  rodItemId: 'plastic-rod',
  baitItemId: 'basic-bait',
  passiveItemIds: [],
};

describe('Discord fishing command contract', () => {
  it('registers all seven boat-upgrade biomes and four expedition lengths', () => {
    const fish = serializedCommandDefinitions().find((command) => command.name === 'fish');
    const expedition = fish?.options?.find((option) => option.name === 'expedition-set') as SerializedSubcommand | undefined;
    const biomeOption = expedition?.options?.find((option) => option.name === 'biome');
    const lengthOption = expedition?.options?.find((option) => option.name === 'length');
    expect(fish?.options?.some((option) => option.name === 'help')).toBe(true);
    expect(biomeOption?.choices).toHaveLength(7);
    expect(lengthOption?.choices).toHaveLength(4);
  });

  it('encodes the completed expedition preset in an owner-specific repeat control', () => {
    const customId = buildFishingRepeatCustomId({
      biomeId: 'kelp-forest',
      crewSlot: 2,
      durationTier: 3,
      ownerDiscordUserId: '123456789012345678',
    });
    expect(customId).toBe('fish-repeat:123456789012345678:kelp-forest:3:2');
    expect(parseFishingRepeatCustomId(customId)).toEqual({
      biomeId: 'kelp-forest',
      crewSlot: 2,
      durationTier: 3,
      ownerDiscordUserId: '123456789012345678',
    });
    expect(parseFishingRepeatCustomId('fish-repeat:123:kelp-forest:4:0')).toBeNull();
    expect(parseFishingRepeatCustomId('fish-repeat:123:not-a-biome:4:1')).toBeNull();
  });

  it('uses a static duration estimate instead of a stale Discord relative timer', () => {
    const launch = buildFishingLaunchResponse({
      biomeName: 'Harbor',
      crewSlot: 1,
      durationSeconds: 5,
      expeditionId: 42,
      instantCompletion: false,
    });
    const description = launch.embeds[0]?.data.description;
    expect(description).toBe('Crew slot **1** is now fishing. This trip takes about **5s**.');
    expect(description).not.toContain('<t:');
  });
});

describe('Discord fishing reworked progression', () => {
  it('uses the requested unlock levels, duration, and crew time multiplier', () => {
    expect(getFishingExpeditionLength(1)).toMatchObject({ requiredChatLevel: 0, durationSeconds: 5, catchCount: [1, 1], higherRarityWeightBonusPercent: 0 });
    expect(getFishingExpeditionLength(2)).toMatchObject({ requiredChatLevel: 10, durationSeconds: 60, catchCount: [12, 12], higherRarityWeightBonusPercent: 5 });
    expect(getFishingExpeditionLength(3)).toMatchObject({ requiredChatLevel: 20, durationSeconds: 600, catchCount: [120, 120], higherRarityWeightBonusPercent: 10 });
    expect(getFishingExpeditionLength(4)).toMatchObject({ requiredChatLevel: 30, durationSeconds: 3_600, catchCount: [720, 720], higherRarityWeightBonusPercent: 15 });
    expect(calculateFishingDurationSeconds(4, false)).toBe(3_600);
    expect(calculateFishingDurationSeconds(4, true)).toBe(10_800);
  });

  it('includes every named biome and applies its chest rarity scope', () => {
    expect(FISHING_BIOMES.map((biome) => biome.id)).toEqual([
      'harbor',
      'warm-ocean',
      'hydroplant-reservoir',
      'sunken-sea',
      'kelp-forest',
      'crystaline-caverns',
      'rallypoint-delta',
    ]);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'kelp-forest')?.chestRarities).toEqual(['Uncommon', 'Rare']);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'crystaline-caverns')?.chestRarities).toEqual(['Rare', 'Epic', 'Legendary']);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'rallypoint-delta')?.chestRarities).toEqual(['Epic', 'Legendary']);
  });

  it('resolves saved expeditions deterministically, without storage, and honors rod rarity', () => {
    const first = resolveFishingExpedition('harbor', 3, starterEquipment, 548_921);
    const second = resolveFishingExpedition('harbor', 3, starterEquipment, 548_921);
    expect(second).toEqual(first);
    const fishCatches = first.catches.filter((entry) => entry.kind === 'fish');
    expect(fishCatches.reduce((total, entry) => total + entry.quantity, 0)).toBe(120);
    expect(fishCatches.every((entry) => (
      entry.rarity === 'Common'
    ))).toBe(true);
  });

  it('condenses repeated catches into counted result rows for long expeditions', () => {
    const equipment: FishingEquipmentSnapshot = { ...starterEquipment, rodItemId: 'master-rod' };
    const result = resolveFishingExpedition('harbor', 4, equipment, 548_921);
    const fishCatches = result.catches.filter((entry) => entry.kind === 'fish');
    expect(fishCatches.reduce((total, entry) => total + entry.quantity, 0)).toBe(720);
    expect(fishCatches.some((entry) => entry.quantity > 1)).toBe(true);
    expect(fishCatches.length).toBeLessThanOrEqual(FISHING_FISH.filter((fish) => fish.biomeId === 'harbor').length);
  });

  it('preserves the original return scale for an active pre-revision expedition snapshot', () => {
    const legacyResult = resolveFishingExpedition('harbor', 4, { ...starterEquipment, catalogueVersion: 3, rodItemId: 'master-rod' }, 548_921);
    const legacyFishRolls = legacyResult.catches
      .filter((entry) => entry.kind === 'fish')
      .reduce((total, entry) => total + entry.quantity, 0);
    expect(legacyFishRolls).toBeGreaterThanOrEqual(12);
    expect(legacyFishRolls).toBeLessThanOrEqual(15);
  });

  it('makes legendary fish catchable with the legendary rod and halves crew money rewards', () => {
    const equipment: FishingEquipmentSnapshot = {
      ...starterEquipment,
      rodItemId: 'master-rod',
    };
    const solo = resolveFishingExpedition('rallypoint-delta', 4, equipment, 77, false);
    const crew = resolveFishingExpedition('rallypoint-delta', 4, equipment, 77, true);
    expect(FISHING_FISH.some((fish) => fish.rarity === 'Legendary')).toBe(true);
    expect(crew.fishSaleValue).toBeLessThanOrEqual(Math.floor(solo.fishSaleValue / 2));
    expect(crew.chestItems.length).toBeLessThanOrEqual(solo.chestItems.length);
  });

  it('uses the requested rod tiers and reserves Mythic catches for a future catalogue', () => {
    expect(getFishingUpgrade('plastic-rod')?.catchableRarities).toEqual(['Common']);
    expect(getFishingUpgrade('celestial-rod')?.catchableRarities).toEqual(['Uncommon', 'Rare', 'Epic', 'Legendary']);
    expect(getFishingUpgrade('god-rod')?.catchableRarities).toEqual(['Rare', 'Epic', 'Legendary', 'Mythic']);
    expect(FISHING_MYTHIC_FISH).toEqual([]);
  });

  it('keeps every resolved fish within its equipped rod rarity scope', () => {
    const rodIds = ['plastic-rod', 'wooden-rod', 'fiberglass-rod', 'reinforced-rod', 'master-rod', 'celestial-rod', 'god-rod'];
    for (const rodItemId of rodIds) {
      const rod = getFishingUpgrade(rodItemId);
      expect(rod?.catchableRarities).toBeDefined();
      for (let seed = 1; seed <= 200; seed += 1) {
        const result = resolveFishingExpedition('harbor', 4, { ...starterEquipment, rodItemId }, seed);
        const fishCatches = result.catches.filter((entry) => entry.kind === 'fish');
        expect(fishCatches.every((entry) => rod!.catchableRarities!.includes(entry.rarity))).toBe(true);
        expect(fishCatches.some((entry) => entry.rarity === 'Mythic')).toBe(false);
      }
    }
  });

  it('enforces bait and permanent-gear result invariants', () => {
    const truffleEquipment: FishingEquipmentSnapshot = {
      ...starterEquipment,
      baitItemId: 'truffle-worm',
      rodItemId: 'master-rod',
    };
    for (let seed = 1; seed <= 500; seed += 1) {
      const result = resolveFishingExpedition('harbor', 4, truffleEquipment, seed);
      const fishCatches = result.catches.filter((entry) => entry.kind === 'fish');
      expect(fishCatches.every((entry) => entry.rarity === 'Legendary')).toBe(true);
      expect(new Set(result.gearItems.map((entry) => entry.itemId)).size).toBe(result.gearItems.length);
    }
  });

  it('defines the requested purchasable bait, skill, and one-time gear catalogue', () => {
    const byId = new Map(FISHING_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
    expect(byId.get('chum')).toMatchObject({ cost: 10_000, requiredChatLevel: 5 });
    expect(byId.get('magnet')).toMatchObject({ cost: 30_000, requiredChatLevel: 15 });
    expect(byId.get('sonar')).toMatchObject({ cost: 75_000, requiredChatLevel: 25 });
    expect(byId.get('bloodworms')).toMatchObject({ cost: 150_000, requiredChatLevel: 40 });
    expect(byId.get('mysterious-sea-food')).toMatchObject({ cost: 250_000, requiredChatLevel: 55 });
    expect(byId.get('truffle-worm')).toMatchObject({ cost: 1_000_000, requiredChatLevel: 80 });
    expect(FISHING_UPGRADES.filter((upgrade) => upgrade.category === 'gear')).toHaveLength(11);
    expect(byId.get('gear-conduit')?.foundBiomeIds).toEqual(['warm-ocean']);
    expect(byId.get('gear-teleporter')?.foundBiomeIds).toEqual(['rallypoint-delta']);
    expect(byId.get('lucky-5')?.requiredUpgradeId).toBe('lucky-4');
    expect(byId.get('haste-4')?.requiredUpgradeId).toBe('haste-3');
  });

  it('rejects an already-active requested crew slot before reaching the database', () => {
    expect(selectFishingCrewSlot(3, [1], undefined)).toBe(2);
    expect(selectFishingCrewSlot(3, [1], 2)).toBe(2);
    expect(() => selectFishingCrewSlot(3, [1], 1)).toThrow('Crew slot 1 is already on an expedition.');
    expect(() => selectFishingCrewSlot(3, [], 0)).toThrow('Every unlocked crew slot is already on an expedition.');
  });

  it('stacks cost and time reductions from skills and gear', () => {
    const woodenRod = getFishingUpgrade('wooden-rod');
    expect(woodenRod).toBeDefined();
    expect(getFishingUpgradeCost(woodenRod!, ['cheapskate-1', 'gear-lost-pursasion-device'])).toBe(4_500);
    expect(calculateFishingDurationSeconds(4, false, 30)).toBe(2_520);
  });

  it('uses the sold-fish completion copy and color-coded chest rarity markers', () => {
    const result: FishingExpeditionResult = {
      catches: [
        { kind: 'chest', name: 'Common Chest', quantity: 2, rarity: 'Common', itemId: 'common-chest' },
        { kind: 'chest', name: 'Uncommon Chest', quantity: 1, rarity: 'Uncommon', itemId: 'uncommon-chest' },
        { kind: 'chest', name: 'Rare Chest', quantity: 1, rarity: 'Rare', itemId: 'rare-chest' },
        { kind: 'chest', name: 'Epic Chest', quantity: 1, rarity: 'Epic', itemId: 'epic-chest' },
        { kind: 'chest', name: 'Legendary Chest', quantity: 1, rarity: 'Legendary', itemId: 'legendary-chest' },
      ],
      chestItems: [],
      fishSaleValue: 425,
      gearItems: [],
      knowBucksFound: 0,
    };

    const embed = buildFishingCompletionEmbed('harbor', result, 425, 1_250);
    expect(embed.data.description).toBe('You earned 425 KnowBucks from your sold fish. New balance: 1,250 KnowBucks.');
    const catches = embed.data.fields?.[0]?.value;
    expect(catches).toContain('⬜ **Common Chest** x2 — added to inventory');
    expect(catches).toContain('🟩 **Uncommon Chest** — added to inventory');
    expect(catches).toContain('🟦 **Rare Chest** — added to inventory');
    expect(catches).toContain('🟪 **Epic Chest** — added to inventory');
    expect(catches).toContain('🟨 **Legendary Chest** — added to inventory');
  });
});
