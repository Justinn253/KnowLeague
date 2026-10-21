import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import {
  buildDiscordSkindleGuessEmbed,
  buildDiscordSkindleShareEmbed,
  DiscordSkindleSessionStore,
  formatDiscordSkindleDate,
  getDiscordSkindleCatalog,
  getDiscordSkindleDailyTarget,
} from '../discord-bot/src/skindle';
import { getDailySkindleTarget } from '@/lib/skindle-daily';

type SerializedCommandOption = {
  description?: string;
  max_length?: number;
  min_length?: number;
  name: string;
  options?: SerializedCommandOption[];
  required?: boolean;
};

describe('Discord Skindle test implementation', () => {
  const day = new Date('2026-10-20T12:00:00.000Z');

  it('uses the website\'s exact UTC daily target', () => {
    expect(getDiscordSkindleDailyTarget(day).id).toBe(getDailySkindleTarget(day)?.id);
  });

  it('uses generated Lane and Resource metadata for Skindle comparisons', () => {
    const missFortune = getDiscordSkindleCatalog().find((skin) => skin.champion === 'Miss Fortune');
    expect(missFortune).toMatchObject({ lane: 'Bottom', resourceType: 'Mana' });
  });

  it('keeps clues and solved state scoped to one Discord user for the daily run', () => {
    const store = new DiscordSkindleSessionStore();
    const target = getDiscordSkindleDailyTarget(day);
    const incorrectGuesses = getDiscordSkindleCatalog().filter((skin) => skin.id !== target.id).slice(0, 4);
    expect(incorrectGuesses).toHaveLength(4);

    const firstGuess = store.guess('123456789012345678', incorrectGuesses[0]!.answer, day);
    expect(firstGuess.kind).toBe('incorrect');
    if (firstGuess.kind !== 'incorrect') return;
    expect(firstGuess.status).toMatchObject({ dateKey: '2026-10-20', guessCount: 1, solved: false });
    const guessEmbed = buildDiscordSkindleGuessEmbed(firstGuess).toJSON();
    expect(guessEmbed.description).not.toContain('private');
    expect(guessEmbed.footer).toBeUndefined();
    expect(guessEmbed.image?.url).toBe(firstGuess.guess.imageUrl);

    const duplicate = store.guess('123456789012345678', incorrectGuesses[0]!.answer, day);
    expect(duplicate.kind).toBe('duplicate');

    for (const guess of incorrectGuesses.slice(1)) {
      expect(store.guess('123456789012345678', guess.answer, day).kind).toBe('incorrect');
    }

    const solve = store.guess('123456789012345678', target.answer, day);
    expect(solve.kind).toBe('correct');
    if (solve.kind !== 'correct') return;
    expect(solve.status).toMatchObject({ guessCount: 5, solved: true });
    expect(solve.target.id).toBe(target.id);
    const shareEmbed = buildDiscordSkindleShareEmbed('Justin', solve).toJSON();
    expect(shareEmbed.description).not.toContain(target.answer);
    const progressRows = shareEmbed.description!.split('\n').slice(-5);
    expect(progressRows).toHaveLength(5);
    expect(progressRows.every((row) => [...row].length === 9)).toBe(true);
    expect([...progressRows.at(-1)!]).toEqual(Array(9).fill('\u{1F7E9}'));

    expect(store.getStatus('999999999999999999', day)).toMatchObject({ guessCount: 0, solved: false });
    expect(store.getStatus('123456789012345678', new Date('2026-10-21T00:00:00.000Z'))).toMatchObject({ guessCount: 0, solved: false });
  });

  it('formats the UTC daily key as the Eastern calendar day for Discord', () => {
    expect(formatDiscordSkindleDate('2026-10-21')).toBe('Oct 20, 2026');
  });

  it('registers the nested League Skindle commands with a bounded skin input', () => {
    const league = serializedCommandDefinitions().find((definition) => definition.name === 'league');
    const skindle = league?.options?.find((option) => option.name === 'skindle') as SerializedCommandOption | undefined;
    expect(skindle?.options?.map((option) => option.name)).toEqual(['play', 'guess', 'status']);

    const guess = skindle?.options?.find((option) => option.name === 'guess');
    const skin = guess?.options?.find((option) => option.name === 'skin');
    expect(skin).toMatchObject({ min_length: 2, max_length: 150, required: true });

    const play = skindle?.options?.find((option) => option.name === 'play');
    expect(play?.description).toBe('Play the daily Skindle from KnowLeague.net.');
  });
});
