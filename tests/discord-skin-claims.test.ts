import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { buildSkinCollectionEmbed, buildSkinSearchEmbed, calculateSkinRaritySpawnPercent } from '../discord-bot/src/skin-claims';
import { DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS } from '../lib/discord-skin-claims';

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
    const expectedSubcommands = ['collection', 'give', 'spawn', 'summon', 'capacity-add', 'capacity-force-add', 'steal', 'favorite', 'gamble', 'search', 'sell'];

    expect(command?.options?.map((option) => option.name)).toEqual(expectedSubcommands);
    expect(alias).toBeUndefined();

    const collection = command?.options?.find((option) => option.name === 'collection') as SerializedSubcommand | undefined;
    const member = collection?.options?.find((option) => option.name === 'member');
    expect(member?.required).toBe(false);
  });

  it('accepts only four-digit IDs when transferring, stealing, favoriting, gambling, or selling a skin', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const give = command?.options?.find((option) => option.name === 'give') as SerializedSubcommand | undefined;
    const skinId = give?.options?.find((option) => option.name === 'skin-id');

    expect(skinId?.min_value).toBe(1000);
    expect(skinId?.max_value).toBe(9999);
    for (const name of ['steal', 'favorite', 'gamble', 'sell']) {
      const subcommand = command?.options?.find((option) => option.name === name) as SerializedSubcommand | undefined;
      const option = subcommand?.options?.find((entry) => entry.name === 'skin-id');
      expect(option?.min_value).toBe(1000);
      expect(option?.max_value).toBe(9999);
    }
  });

  it('describes KnowBucks costs on the paid collection commands', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'collections');
    const descriptionFor = (name: string) => (command?.options?.find((option) => option.name === name) as SerializedSubcommand | undefined)?.description;

    expect(descriptionFor('summon')).toContain('5,000 KnowBucks');
    expect(descriptionFor('capacity-add')).toContain('500 KnowBucks');
    expect(descriptionFor('steal')).toContain('3x its sell price');
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
    }, 'Summoner');
    const serialized = embed.toJSON();

    expect(serialized.title).toBe('Summoner\'s skin collection · 1 of 1 (max 15)');
    expect(serialized.description).toBe('**Elderwood Ahri** · **Epic**');
  });

  it('starts a collection card with only the skin name, rarity, and compact artwork', () => {
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
    }, 'Summoner').toJSON();

    expect(embed.description).toBe('**Elderwood Ahri** · **Epic**');
    expect(embed.fields).toBeUndefined();
    expect(embed.thumbnail?.url).toBe('https://example.com/ahri.jpg');
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
    }, 'Summoner', true).toJSON().fields ?? [];

    expect(fields).toEqual([
      expect.objectContaining({ inline: true, name: 'Skin', value: expect.stringContaining('**Skin line**') }),
      expect.objectContaining({ inline: true, name: 'Collection details', value: expect.stringContaining('**Sells for**\n1,000 KnowBucks') }),
    ]);
  });

  it('includes a KnowLeague catalogue ID in a non-claimable search preview', () => {
    const skin: Parameters<typeof buildSkinSearchEmbed>[0] = {
      answer: 'Elderwood Ahri',
      champion: 'Ahri',
      centeredImageUrl: 'https://example.com/ahri-centered.jpg',
      id: '103000',
      imageUrl: 'https://example.com/ahri.jpg',
      rarity: 'Epic',
      releaseDate: '2020-01-01',
      skinLine: 'Elderwood',
    };
    const embed = buildSkinSearchEmbed(skin).toJSON();
    const fields = embed.fields ?? [];

    expect(fields).toContainEqual(expect.objectContaining({ name: 'KnowLeague ID', value: '#103000' }));
    expect(embed.thumbnail?.url).toBe('https://example.com/ahri-centered.jpg');
  });
});
