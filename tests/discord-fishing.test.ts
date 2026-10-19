import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_FISH,
  FISHING_MYTHIC_FISH,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingExpeditionLength,
  resolveFishingExpedition,
  type FishingExpeditionResult,
  type FishingEquipmentSnapshot,
} from '../discord-bot/src/fishing-catalog';
import { buildFishingCompletionEmbed } from '../discord-bot/src/fishing';

type SerializedSubcommand = {
  choices?: readonly unknown[];
  name: string;
  options?: SerializedSubcommand[];
};

const starterEquipment: FishingEquipmentSnapshot = {
  catalogueVersion: 2,
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
});

describe('Discord fishing reworked progression', () => {
  it('uses the requested unlock levels, duration, and crew time multiplier', () => {
    expect(getFishingExpeditionLength(1)).toMatchObject({ requiredChatLevel: 1, durationSeconds: 30, catchCount: [1, 1] });
    expect(getFishingExpeditionLength(2)).toMatchObject({ requiredChatLevel: 20, durationSeconds: 60, catchCount: [2, 3] });
    expect(getFishingExpeditionLength(3)).toMatchObject({ requiredChatLevel: 50, durationSeconds: 120, catchCount: [5, 6] });
    expect(getFishingExpeditionLength(4)).toMatchObject({ requiredChatLevel: 80, durationSeconds: 300, catchCount: [12, 15] });
    expect(calculateFishingDurationSeconds(4, false)).toBe(300);
    expect(calculateFishingDurationSeconds(4, true)).toBe(900);
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
    expect(fishCatches.length).toBeGreaterThanOrEqual(5);
    expect(fishCatches.length).toBeLessThanOrEqual(6);
    expect(fishCatches.every((entry) => (
      entry.rarity === 'Common'
    ))).toBe(true);
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

  it('stacks cost and time reductions from skills and gear', () => {
    const woodenRod = getFishingUpgrade('wooden-rod');
    expect(woodenRod).toBeDefined();
    expect(getFishingUpgradeCost(woodenRod!, ['cheapskate-1', 'gear-lost-pursasion-device'])).toBe(4_500);
    expect(calculateFishingDurationSeconds(4, false, 30)).toBe(210);
  });

  it('uses the sold-fish completion copy and color-coded chest rarity markers', () => {
    const result: FishingExpeditionResult = {
      catches: [
        { kind: 'chest', name: 'Common Chest', rarity: 'Common', itemId: 'common-chest' },
        { kind: 'chest', name: 'Uncommon Chest', rarity: 'Uncommon', itemId: 'uncommon-chest' },
        { kind: 'chest', name: 'Rare Chest', rarity: 'Rare', itemId: 'rare-chest' },
        { kind: 'chest', name: 'Epic Chest', rarity: 'Epic', itemId: 'epic-chest' },
        { kind: 'chest', name: 'Legendary Chest', rarity: 'Legendary', itemId: 'legendary-chest' },
      ],
      chestItems: [],
      fishSaleValue: 425,
      gearItems: [],
      knowBucksFound: 0,
    };

    const embed = buildFishingCompletionEmbed('harbor', result, 425, 1_250);
    expect(embed.data.description).toBe('You earned 425 KnowBucks from your sold fish. New balance: 1,250 KnowBucks.');
    const catches = embed.data.fields?.[0]?.value;
    expect(catches).toContain('⬜ **Common Chest** — added to inventory');
    expect(catches).toContain('🟩 **Uncommon Chest** — added to inventory');
    expect(catches).toContain('🟦 **Rare Chest** — added to inventory');
    expect(catches).toContain('🟪 **Epic Chest** — added to inventory');
    expect(catches).toContain('🟨 **Legendary Chest** — added to inventory');
  });
});
