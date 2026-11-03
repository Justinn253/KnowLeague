import { describe, expect, it } from 'vitest';
import { ApplicationCommandOptionType, type APIApplicationCommandSubcommandOption } from 'discord-api-types/v10';
import {
  getRiftboundMockDisplayCards,
  openRiftboundMockProducts,
  RIFTBOUND_MOCK_SETS,
} from '../discord-bot/src/riftbound-mock';
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
});
