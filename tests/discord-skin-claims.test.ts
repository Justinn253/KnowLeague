import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildSkinCollectionEmbed, buildSkinSearchEmbed, calculateCollectionDailyUpkeep, calculateSkinRaritySpawnPercent } from '../discord-bot/src/skin-claims';
import { DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES, DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS } from '../lib/discord-skin-claims';

type SerializedSubcommand = {
  description?: string;
  max_value?: number;
  min_value?: number;
  name: string;
  options?: SerializedSubcommand[];
  required?: boolean;
};

describe('Discord skin-claim command contract', () => {
  it('defaults the channel scope to all sendable Discord text channels', () => {
    expect(DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS.allChannels).toBe(true);
  });

  it('calculates each rarity chance from both configured weights and catalogue counts', () => {
    const weights = new Map([['Common', 1], ['Rare', 2]]);
    const catalog = [{ rarity: 'Common' }, { rarity: 'Common' }, { rarity: 'Common' }, { rarity: 'Rare' }];

    expect(calculateSkinRaritySpawnPercent('Common', weights, catalog)).toBe(60);
    expect(calculateSkinRaritySpawnPercent('Rare', weights, catalog)).toBe(40);
  });

  it('registers the full Collections command set without a /cl alias', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const alias = serializedCommandDefinitions().find((definition) => definition.name === 'cl');
    const expectedSubcommands = ['collection', 'upkeep-view', 'upkeep-pay', 'give', 'spawn', 'summon', 'summon-force', 'capacity-add', 'capacity-force-add', 'steal', 'favorite', 'collection-reorder', 'gamble', 'search', 'sell'];

    expect(command?.options?.map((option) => option.name)).toEqual(expectedSubcommands);
    expect(alias).toBeUndefined();

    const collection = command?.options?.find((option) => option.name === 'collection') as SerializedSubcommand | undefined;
    const member = collection?.options?.find((option) => option.name === 'member');
    expect(member?.required).toBe(false);
  });

  it('accepts only four-digit IDs when transferring, searching, stealing, favoriting, gambling, or selling a skin', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const give = command?.options?.find((option) => option.name === 'give') as SerializedSubcommand | undefined;
    const skinId = give?.options?.find((option) => option.name === 'skin-id');

    expect(skinId?.min_value).toBe(1000);
    expect(skinId?.max_value).toBe(9999);
    for (const name of ['steal', 'favorite', 'gamble', 'sell', 'search']) {
      const subcommand = command?.options?.find((option) => option.name === name) as SerializedSubcommand | undefined;
      const option = subcommand?.options?.find((entry) => entry.name === 'skin-id');
      expect(option?.min_value).toBe(1000);
      expect(option?.max_value).toBe(9999);
    }
  });

  it('allows capacity additions one slot at a time, up to the 50-slot collection ceiling', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    for (const name of ['capacity-add', 'capacity-force-add']) {
      const subcommand = command?.options?.find((option) => option.name === name) as SerializedSubcommand | undefined;
      const slots = subcommand?.options?.find((option) => option.name === 'slots');
      expect(slots?.min_value).toBe(1);
      expect(slots?.max_value).toBe(50);
    }
  });

  it('allows an upkeep allocation request above its cap so the excess can remain in the balance', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const upkeepPay = command?.options?.find((option) => option.name === 'upkeep-pay') as SerializedSubcommand | undefined;
    const amount = upkeepPay?.options?.find((option) => option.name === 'amount');

    expect(amount?.min_value).toBe(1);
    expect(amount?.max_value).toBe(1_000_000_000);
    expect(upkeepPay?.description).toContain('100,000');
  });

  it('describes KnowBucks costs on the paid collection commands', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const descriptionFor = (name: string) => (command?.options?.find((option) => option.name === name) as SerializedSubcommand | undefined)?.description;

    expect(descriptionFor('summon')).toContain('5,000 KnowBucks');
    expect(descriptionFor('summon-force')).toContain('5,000 KnowBucks');
    expect(descriptionFor('summon-force')).toContain('50%');
    expect(descriptionFor('capacity-add')).toContain('500 KnowBucks');
    expect(descriptionFor('steal')).toContain('3x its sell price');
  });

  it('registers one to ten optional, ordered skin IDs for collection reordering', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const reorder = command?.options?.find((option) => option.name === 'collection-reorder') as SerializedSubcommand | undefined;
    const slots = reorder?.options ?? [];

    expect(slots.map((slot) => slot.name)).toEqual(Array.from({ length: 10 }, (_, index) => `slot-${index + 1}`));
    expect(slots.every((slot) => slot.required === false && slot.min_value === 1000 && slot.max_value === 9999)).toBe(true);
  });

  it('uses the agreed Collection sell-price defaults', () => {
    expect(DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES).toEqual([
      { rarity: 'Common', amount: 500 },
      { rarity: 'Rare', amount: 1000 },
      { rarity: 'Epic', amount: 2500 },
      { rarity: 'Legendary', amount: 10000 },
      { rarity: 'Mythic', amount: 5000 },
      { rarity: 'Ultimate', amount: 25000 },
      { rarity: 'Exalted', amount: 100000 },
      { rarity: 'Transcendent', amount: 100000 },
    ]);
  });

  it('uses the agreed marginal daily upkeep tiers and rounds the Lucky discount up', () => {
    expect(calculateCollectionDailyUpkeep(10, 0)).toBe(0);
    expect(calculateCollectionDailyUpkeep(11, 0)).toBe(100);
    expect(calculateCollectionDailyUpkeep(20, 0)).toBe(1000);
    expect(calculateCollectionDailyUpkeep(21, 0)).toBe(1500);
    expect(calculateCollectionDailyUpkeep(30, 0)).toBe(6000);
    expect(calculateCollectionDailyUpkeep(40, 0)).toBe(16000);
    expect(calculateCollectionDailyUpkeep(50, 0)).toBe(41000);
    expect(calculateCollectionDailyUpkeep(21, 1)).toBe(1425);
  });

  it('shows a collection capacity in its header with the compact skin summary', () => {
    const embed = buildSkinCollectionEmbed({
      capacity: 15,
      item: {
        champion_name: 'Ahri',
        claimed: true,
        image_url: 'https://example.com/ahri.jpg',
        owner_acquired_at: '2026-10-16T00:00:00.000Z',
        ownership_method: 'claimed',
        rarity: 'Epic',
        release_date: '2020-01-01',
        skin_code: 1234,
        skin_line: 'Elderwood',
        skin_name: 'Elderwood Ahri',
      },
      page: 0,
      sellValue: 1000,
      total: 1,
      upkeep: { dailyCost: 0, excessSkinCount: 0, graceExpiresAt: null, outstandingAmount: 0 },
    }, 'Summoner');
    const serialized = embed.toJSON();

    expect(serialized.title).toContain('Summoner\'s collection');
    expect(serialized.description).toContain('**Elderwood Ahri (#1234)**');
    expect(serialized.description).toContain('**Daily collection upkeep:** Free (the first 10 collection entries are free)');
  });

  it('keeps the collection card compact while adding the daily upkeep summary', () => {
    const embed = buildSkinCollectionEmbed({
      capacity: 10,
      item: {
        champion_name: 'Ahri',
        claimed: true,
        image_url: 'https://example.com/ahri.jpg',
        owner_acquired_at: '2026-10-16T00:00:00.000Z',
        ownership_method: 'claimed',
        rarity: 'Epic',
        release_date: '2020-01-01',
        skin_code: 1234,
        skin_line: 'Elderwood',
        skin_name: 'Elderwood Ahri',
      },
      page: 0,
      sellValue: 1000,
      total: 1,
      upkeep: { dailyCost: 0, excessSkinCount: 0, graceExpiresAt: null, outstandingAmount: 0 },
    }, 'Summoner').toJSON();

    expect(embed.description).toContain('**Elderwood Ahri (#1234)**');
    expect(embed.description).toContain('**Daily collection upkeep:** Free (the first 10 collection entries are free)');
    expect(embed.fields).toBeUndefined();
    expect(embed.image?.url).toBe('https://example.com/ahri.jpg');
  });

  it('shows the viewed collection\'s current daily upkeep without opening details', () => {
    const embed = buildSkinCollectionEmbed({
      capacity: 21,
      item: {
        champion_name: 'Ahri',
        claimed: true,
        image_url: 'https://example.com/ahri.jpg',
        owner_acquired_at: '2026-10-16T00:00:00.000Z',
        ownership_method: 'claimed',
        rarity: 'Epic',
        release_date: '2020-01-01',
        skin_code: 1234,
        skin_line: 'Elderwood',
        skin_name: 'Elderwood Ahri',
      },
      page: 0,
      sellValue: 1000,
      total: 21,
      upkeep: { dailyCost: 1500, excessSkinCount: 11, graceExpiresAt: null, outstandingAmount: 0 },
    }, 'Summoner').toJSON();

    expect(embed.description).toContain('**Daily collection upkeep:** 1,500 KnowBucks daily for 11 collection entries over 10');
  });

  it('shows collection metadata and the configured sale value only when details are requested', () => {
    const fields = buildSkinCollectionEmbed({
      capacity: 10,
      item: {
        champion_name: 'Ahri',
        claimed: true,
        image_url: 'https://example.com/ahri.jpg',
        owner_acquired_at: '2026-10-16T00:00:00.000Z',
        ownership_method: 'claimed',
        rarity: 'Epic',
        release_date: '2020-01-01',
        skin_code: 1234,
        skin_line: 'Elderwood',
        skin_name: 'Elderwood Ahri',
      },
      page: 0,
      sellValue: 1000,
      total: 1,
      upkeep: { dailyCost: 0, excessSkinCount: 0, graceExpiresAt: null, outstandingAmount: 0 },
    }, 'Summoner', true).toJSON().fields ?? [];

    expect(fields).toEqual([
      expect.objectContaining({ inline: true, name: 'Skin', value: expect.stringContaining('**Skin line**') }),
      expect.objectContaining({ inline: true, name: 'Collection details', value: expect.stringContaining('**Sells for**\n1,000 KnowBucks') }),
    ]);
  });

  it('includes the assigned KnowLeague ID and owner in a non-claimable search preview', () => {
    const skin: Parameters<typeof buildSkinSearchEmbed>[0] = {
      answer: 'Elderwood Ahri',
      champion: 'Ahri',
      centeredImageUrl: 'https://example.com/ahri-centered.jpg',
      id: '103000',
      imageUrl: 'https://example.com/ahri.jpg',
      rarity: 'Epic',
      releaseDate: '2020-01-01',
      skinLine: 'Elderwood',
      type: 'skin',
    };
    const embed = buildSkinSearchEmbed(skin, [{ skinCode: 5260, username: 'Justin' }]).toJSON();
    const fields = embed.fields ?? [];

    expect(fields).toContainEqual(expect.objectContaining({ name: 'KnowLeague ID', value: '#5260' }));
    expect(fields).toContainEqual(expect.objectContaining({ name: 'Owner', value: 'Justin' }));
    expect(embed.image?.url).toBe('https://example.com/ahri-centered.jpg');
  });

  it('renders an item collection entry with its rarity, cost, mode, and historical availability', () => {
    const embed = buildSkinCollectionEmbed({
      capacity: 10,
      item: {
        champion_name: 'Item',
        claimed: true,
        collection_metadata: {
          cost: 2500,
          firstSeenVersion: '10.1.1',
          gameModes: ['Howling Abyss', 'Summoner’s Rift'],
          lastSeenVersion: '16.21.1',
        },
        collection_tier: 3,
        collection_type: 'item',
        image_url: 'https://example.com/item.png',
        owner_acquired_at: '2026-10-16T00:00:00.000Z',
        ownership_method: 'claimed',
        rarity: 'Epic',
        release_date: '2009-10-27',
        skin_code: 1234,
        skin_line: 'League item',
        skin_name: 'Example Item',
      },
      page: 0,
      sellValue: 2500,
      total: 1,
      upkeep: { dailyCost: 0, excessSkinCount: 0, graceExpiresAt: null, outstandingAmount: 0 },
    }, 'Summoner', true).toJSON();

    expect(embed.description).toContain('**Item · Epic**');
    expect(embed.fields).toContainEqual(expect.objectContaining({ name: 'Item', value: expect.stringContaining('**Cost**\n2,500 gold') }));
    expect(embed.fields).toContainEqual(expect.objectContaining({ name: 'Item', value: expect.stringContaining('**Available**\n10.1.1 to 16.21.1') }));
  });
});
