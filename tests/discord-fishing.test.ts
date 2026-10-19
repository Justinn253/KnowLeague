import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildFishingCataloguePanel, buildFishingLaunchResponse } from '../discord-bot/src/interactions';
import {
  calculateFishingDurationSeconds,
  FISHING_BIOMES,
  FISHING_CRATE_XP_BY_RARITY,
  FISHING_CRATE_DROP_RATES,
  FISHING_CRATE_LOOT,
  FISHING_CRATE_RARITIES,
  FISHING_CRATES,
  FISHING_FISH,
  FISHING_EXPEDITION_XP_PER_BASE_CATCH,
  FISHING_MYTHIC_FISH,
  FISHING_UPGRADES,
  getFishingUpgrade,
  getFishingUpgradeCost,
  getFishingLevelForTotalXp,
  getFishingLevelUpKnowBucks,
  getFishingTotalXpForLevel,
  getFishingExpeditionLength,
  getFishingCrate,
  resolveFishingCrateOpenings,
  resolveFishingExpedition,
  type FishingExpeditionResult,
  type FishingEquipmentSnapshot,
} from '../discord-bot/src/fishing-catalog';
import {
  buildFishingCompletionEmbed,
  buildFishingRepeatCustomId,
  parseFishingRepeatCustomId,
  selectFishingCrewSlot,
  type FishingCatalogueProgress,
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
    const chestsOpen = fish?.options?.find((option) => option.name === 'chests-open');
    expect(chestsOpen && 'options' in chestsOpen ? chestsOpen.options : []).toHaveLength(0);
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

  it('shows only fish collection status and found gear in the biome catalogue', () => {
    const progress: FishingCatalogueProgress = {
      caughtFish: [{ biomeId: 'harbor', name: 'Carp', rarity: 'Common' }],
      ownedGearItemIds: new Set(['gear-sea-star']),
    };
    const panel = buildFishingCataloguePanel('123456789012345678', 'harbor', Date.now() + 60_000, progress);
    const fields = panel.embeds[0]?.data.fields ?? [];
    const fish = fields.find((field) => field.name === 'Fish caught')?.value;
    const gear = fields.find((field) => field.name === 'Gear found')?.value;

    expect(fish).toContain('Caught');
    expect(fish).toContain('Carp');
    expect(gear).toContain('Found');
    expect(gear).toContain('Sea Star');
    expect(gear).not.toContain('Permanent treasure');
    expect(fields.some((field) => field.name.startsWith('Crates') || field.name.startsWith('Crate loot'))).toBe(false);
  });
});

describe('Discord fishing reworked progression', () => {
  it('uses the requested unlock levels, duration, and crew time multiplier', () => {
    expect(getFishingExpeditionLength(1)).toMatchObject({ requiredFishingLevel: 0, durationSeconds: 5, catchCount: [1, 1], higherRarityWeightBonusPercent: 0 });
    expect(getFishingExpeditionLength(2)).toMatchObject({ requiredFishingLevel: 10, durationSeconds: 60, catchCount: [12, 12], higherRarityWeightBonusPercent: 5 });
    expect(getFishingExpeditionLength(3)).toMatchObject({ requiredFishingLevel: 20, durationSeconds: 600, catchCount: [120, 120], higherRarityWeightBonusPercent: 10 });
    expect(getFishingExpeditionLength(4)).toMatchObject({ requiredFishingLevel: 30, durationSeconds: 3_600, catchCount: [720, 720], higherRarityWeightBonusPercent: 15 });
    expect(calculateFishingDurationSeconds(4, false)).toBe(3_600);
    expect(calculateFishingDurationSeconds(4, true)).toBe(10_800);
  });

  it('includes every named biome and applies its crate rarity scope', () => {
    expect(FISHING_BIOMES.map((biome) => biome.id)).toEqual([
      'harbor',
      'warm-ocean',
      'hydroplant-reservoir',
      'sunken-sea',
      'kelp-forest',
      'crystaline-caverns',
      'rallypoint-delta',
    ]);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'kelp-forest')?.crateRarities).toEqual(['Uncommon', 'Rare']);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'crystaline-caverns')?.crateRarities).toEqual(['Rare', 'Epic', 'Legendary']);
    expect(FISHING_BIOMES.find((biome) => biome.id === 'rallypoint-delta')?.crateRarities).toEqual(['Epic', 'Legendary']);
  });

  it('defines biome-specific crates, quartered crate rates, and weighted crate loot floors', () => {
    expect(FISHING_CRATES).toHaveLength(35);
    expect(FISHING_CRATE_LOOT).toHaveLength(69);
    expect(getFishingCrate('harbor-common-crate')?.name).toBe('Damaged Crate');
    expect(getFishingCrate('rallypoint-delta-legendary-crate')?.name).toBe('Lunar Crate');
    expect(FISHING_CRATE_LOOT.some((item) => item.name === 'ERR://23¤Y%/')).toBe(true);
    expect(FISHING_CRATE_LOOT.every((item) => item.valueBonusPercent >= 0 && item.valueBonusPercent <= 30)).toBe(true);
    expect(FISHING_CRATE_DROP_RATES).toEqual({ Common: 0.05, Uncommon: 0.025, Rare: 0.0125, Epic: 0.0025, Legendary: 0.00025 });

    const rareOpening = resolveFishingCrateOpenings('harbor-rare-crate', 10, 0, 123_456);
    expect(rareOpening.items.every((item) => FISHING_CRATE_RARITIES.indexOf(item.rarity) >= FISHING_CRATE_RARITIES.indexOf('Rare'))).toBe(true);
    const legendaryOpening = resolveFishingCrateOpenings('harbor-legendary-crate', 10, 0, 123_456);
    expect(legendaryOpening.items.every((item) => item.rarity === 'Legendary')).toBe(true);
    const bonusOpening = resolveFishingCrateOpenings('harbor-common-crate', 10, 20, 123_456);
    const normalOpening = resolveFishingCrateOpenings('harbor-common-crate', 10, 0, 123_456);
    expect(bonusOpening.totalSaleValue).toBeGreaterThan(normalOpening.totalSaleValue);
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
    expect(first.fishingExpeditionXp).toBe(120 * FISHING_EXPEDITION_XP_PER_BASE_CATCH);
  });

  it('awards doubled expedition and crate Fishing XP, including the Giant Pearl bonus', () => {
    const normal = resolveFishingExpedition('harbor', 4, { ...starterEquipment, rodItemId: 'master-rod' }, 548_921);
    const pearl = resolveFishingExpedition('harbor', 4, {
      ...starterEquipment,
      passiveItemIds: ['gear-giant-pearl'],
      rodItemId: 'master-rod',
    }, 548_921);
    const crateXp = normal.catches
      .filter((entry) => entry.kind === 'crate')
      .reduce((total, entry) => total + (entry.quantity * FISHING_CRATE_XP_BY_RARITY[entry.rarity]), 0);

    expect(normal.fishingExpeditionXp).toBe(720 * FISHING_EXPEDITION_XP_PER_BASE_CATCH);
    expect(normal.fishingCrateXp).toBe(crateXp);
    expect(normal.fishingXpAwarded).toBe(normal.fishingExpeditionXp + normal.fishingCrateXp);
    expect(pearl.fishingXpAwarded).toBe(Math.floor((pearl.fishingExpeditionXp + pearl.fishingCrateXp) * 1.25));
  });

  it('uses the shared XP curve and clean non-linear KnowBucks level rewards', () => {
    expect(getFishingTotalXpForLevel(0)).toBe(0);
    expect(getFishingTotalXpForLevel(20)).toBe(18_150);
    expect(getFishingLevelForTotalXp(18_150)).toBe(20);
    expect(getFishingLevelUpKnowBucks(1)).toBe(1_000);
    expect(getFishingLevelUpKnowBucks(2)).toBe(1_000);
    expect(getFishingLevelUpKnowBucks(3)).toBe(1_500);
    expect(getFishingLevelUpKnowBucks(20)).toBe(18_500);
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
    expect(crew.crateSaleValue).toBe(solo.crateSaleValue);
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
    expect(byId.get('chum')).toMatchObject({ cost: 10_000, requiredFishingLevel: 5 });
    expect(byId.get('magnet')).toMatchObject({ cost: 30_000, requiredFishingLevel: 15 });
    expect(byId.get('sonar')).toMatchObject({ cost: 75_000, requiredFishingLevel: 25 });
    expect(byId.get('bloodworms')).toMatchObject({ cost: 150_000, requiredFishingLevel: 40 });
    expect(byId.get('mysterious-sea-food')).toMatchObject({ cost: 250_000, requiredFishingLevel: 55 });
    expect(byId.get('truffle-worm')).toMatchObject({ cost: 1_000_000, requiredFishingLevel: 80 });
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

  it('opens expedition crates automatically and presents them separately from fish', () => {
    const result = resolveFishingExpedition('harbor', 4, { ...starterEquipment, rodItemId: 'master-rod' }, 548_921);
    const crateCatches = result.catches.filter((entry) => entry.kind === 'crate');
    expect(crateCatches.length).toBeGreaterThan(0);
    expect(crateCatches.reduce((total, entry) => total + entry.saleValue, 0)).toBe(result.crateSaleValue);
    expect(crateCatches.every((entry) => entry.lootItemId && entry.lootName && entry.lootRarity)).toBe(true);
  });

  it('uses the sold-fish completion copy and separates automatically opened crates', () => {
    const result: FishingExpeditionResult = {
      catches: [
        { kind: 'fish', name: 'Anchovy', quantity: 2, rarity: 'Common', saleValue: 425 },
        {
          itemId: 'harbor-common-crate',
          kind: 'crate',
          lootItemId: 'harbor-common-loot-1',
          lootName: 'Soggy Boot',
          lootRarity: 'Common',
          name: 'Damaged Crate',
          quantity: 2,
          rarity: 'Common',
          saleValue: 125,
        },
      ],
      crateSaleValue: 125,
      fishingCrateXp: 20,
      fishingExpeditionXp: 30,
      fishingXpAwarded: 50,
      fishSaleValue: 425,
      gearItems: [],
      knowBucksFound: 0,
    };

    const embed = buildFishingCompletionEmbed('harbor', result, 550, 1_550);
    expect(embed.data.description).toBe('You earned 425 KnowBucks from your sold fish. Crate items earned 125 KnowBucks. New balance: 1,550 KnowBucks.');
    const fish = embed.data.fields?.find((field) => field.name === 'Fish caught')?.value;
    const crates = embed.data.fields?.find((field) => field.name === 'Crates opened')?.value;
    expect(fish).toContain('Anchovy');
    expect(crates).toContain('Damaged Crate');
    expect(crates).toContain('Soggy Boot');
    expect(embed.data.fields?.some((field) => field.name === 'Gear found')).toBe(false);
  });

  it('omits every empty completion category', () => {
    const embed = buildFishingCompletionEmbed('harbor', {
      catches: [],
      crateSaleValue: 0,
      fishingCrateXp: 0,
      fishingExpeditionXp: 0,
      fishingXpAwarded: 0,
      fishSaleValue: 0,
      gearItems: [],
      knowBucksFound: 0,
    }, 0, 1_500);

    expect(embed.data.fields ?? []).toHaveLength(0);
  });
});
