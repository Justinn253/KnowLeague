import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ApplicationCommandOptionType, type APIApplicationCommandSubcommandOption } from 'discord-api-types/v10';
import {
  getRiftboundMockDisplayCards,
  isRiftboundMockHighlight,
  openRiftboundMockProducts,
  RIFTBOUND_MOCK_SETS,
  snapshotRiftboundMockOpeningCards,
} from '../discord-bot/src/riftbound-mock';
import { riftboundMockOpeningButtons } from '../discord-bot/src/interactions';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';

describe('Discord Riftbound mock unboxing', () => {
  it('registers the mock shop, purchase, opening, and sealed-inventory commands', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'riftbound');
    expect(command).toBeDefined();
    const subcommands = command?.options?.map((option) => option.name);
    const getSubcommand = (name: string) => command?.options?.find(
      (option): option is APIApplicationCommandSubcommandOption => (
        option.type === ApplicationCommandOptionType.Subcommand && option.name === name
      ),
    );
    expect(subcommands).toEqual(['shop', 'buy', 'open', 'inventory']);
    expect(getSubcommand('buy')?.options?.map((option) => option.name)).toEqual(['set', 'product', 'amount']);
    expect(getSubcommand('open')?.options?.map((option) => option.name)).toEqual(['set', 'product', 'amount']);
  });

  it('gives Skip to Rare a distinct custom ID when it targets the adjacent or first card', () => {
    const config = { siteUrl: 'https://knowleague.test' } as Parameters<typeof riftboundMockOpeningButtons>[5];
    const getCustomIds = (index: number, firstRareIndex: number) => riftboundMockOpeningButtons(
      '123456789012345678',
      '12345678-1234-1234-1234-123456789012',
      index,
      72,
      firstRareIndex,
      config,
    )[0]!.components.flatMap((component) => {
      const serialized = component.toJSON();
      return 'custom_id' in serialized && serialized.custom_id ? [serialized.custom_id] : [];
    });

    for (const customIds of [getCustomIds(0, 0), getCustomIds(22, 23)]) {
      expect(new Set(customIds).size).toBe(customIds.length);
      expect(customIds.some((customId) => customId.includes(':skip:'))).toBe(true);
    }
  });

  it.each(RIFTBOUND_MOCK_SETS)('opens thirteen collectible cards from $name', async ({ code }) => {
    const opening = await openRiftboundMockProducts(code, 1, () => 0.999999);
    const slotCounts = opening.cards.reduce<Record<string, number>>((counts, card) => {
      counts[card.slot] = (counts[card.slot] ?? 0) + 1;
      return counts;
    }, {});

    expect(opening.cards).toHaveLength(13);
    expect(slotCounts).toMatchObject({ common: 7, uncommon: 3, foil: 1, rare: 1, premium: 1 });
    expect(opening.cards.every((card) => card.card_id.startsWith(`${code.toLowerCase()}-`))).toBe(true);
  });

  it('never awards more than one Epic-or-higher pull in a pack', async () => {
    const opening = await openRiftboundMockProducts('RAD', 40, Math.random);
    const displayCards = await getRiftboundMockDisplayCards(opening.cards);
    const packs = Array.from({ length: opening.packsOpened }, (_, index) => displayCards.slice(index * 13, (index + 1) * 13));

    for (const pack of packs) {
      const epicOrHigher = pack.filter((card) => card.rarity === 'Epic' || card.treatment !== 'standard');
      expect(epicOrHigher.length).toBeLessThanOrEqual(1);
    }
  });

  it('does not place token-like cards into the foil slot', async () => {
    let call = 0;
    const opening = await openRiftboundMockProducts('VEN', 1, () => {
      const value = call === 10 || call === 12 ? 0.999999 : 0;
      call += 1;
      return value;
    });

    expect(opening.cards.find((card) => card.slot === 'foil')?.card_id).not.toBe('ven-t04');
  });

  it('never places a Rune in the standard foil slot', async () => {
    const catalogue = JSON.parse(await readFile(path.resolve(process.cwd(), 'data/catalogs/riftbound-cards.json'), 'utf8')) as Array<{
      cardType: string;
      id: string;
    }>;
    const runeIds = new Set(catalogue.filter((card) => card.cardType === 'Rune').map((card) => card.id));
    let state = 17;
    const random = () => {
      state = (state * 48_271) % 2_147_483_647;
      return (state - 1) / 2_147_483_646;
    };

    for (const { code } of RIFTBOUND_MOCK_SETS) {
      const opening = await openRiftboundMockProducts(code, 120, random);
      const foilSlots = opening.cards.filter((card) => card.slot === 'foil');
      expect(foilSlots.some((card) => runeIds.has(card.card_id))).toBe(false);
    }
  });

  it.each(RIFTBOUND_MOCK_SETS)('guarantees at least two Alt Arts per $name box without exceeding one Epic-or-higher pull per pack', async ({ code }) => {
    const opening = await openRiftboundMockProducts(code, 24, () => 0.999999, 'box');
    const displayCards = await getRiftboundMockDisplayCards(opening.cards);
    const packs = Array.from({ length: 24 }, (_, index) => displayCards.slice(index * 13, (index + 1) * 13));

    expect(opening.cards.filter((card) => card.treatment === 'alt_art')).toHaveLength(2);
    for (const pack of packs) {
      const epicOrHigher = pack.filter((card) => card.rarity === 'Epic' || card.treatment !== 'standard');
      expect(epicOrHigher.length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every card available for a full box gallery and preserves its display snapshot', async () => {
    const opening = await openRiftboundMockProducts('RAD', 24, () => 0.999999, 'box');
    const displayCards = await getRiftboundMockDisplayCards(opening.cards);
    const reloadedDisplayCards = await getRiftboundMockDisplayCards(snapshotRiftboundMockOpeningCards(displayCards));

    expect(displayCards).toHaveLength(24 * 13);
    expect(reloadedDisplayCards).toHaveLength(24 * 13);
    expect(reloadedDisplayCards.map((card) => ({
      cardId: card.card_id,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
      marketPriceUsd: card.marketPriceUsd,
      rarity: card.rarity,
    }))).toEqual(displayCards.map((card) => ({
      cardId: card.card_id,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
      marketPriceUsd: card.marketPriceUsd,
      rarity: card.rarity,
    })));
  });

  it('keeps the maximum ten-box opening snapshot within the database payload guard', async () => {
    const opening = await openRiftboundMockProducts('OGN', 240, () => 0.999999, 'box');
    const snapshot = snapshotRiftboundMockOpeningCards(await getRiftboundMockDisplayCards(opening.cards));

    expect(snapshot).toHaveLength(10 * 24 * 13);
    expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThan(1_000_000);
  });

  it('keeps legacy cards visible when a later catalogue no longer has their print', async () => {
    const [card] = await getRiftboundMockDisplayCards([{
      card_id: 'ogn-archived-print',
      finish: 'normal',
      slot: 'rare',
      treatment: 'standard',
    }]);

    expect(card).toMatchObject({
      card_id: 'ogn-archived-print',
      displayName: 'Unknown Riftbound card (ogn-archived-print)',
      imageUrl: null,
      marketPriceUsd: null,
      rarity: 'Unknown',
    });
    expect(isRiftboundMockHighlight(card!)).toBe(true);
  });
});
