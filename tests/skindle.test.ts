import { describe, expect, it } from 'vitest';
import {
  compareGuess,
  groupSkindleSuggestions,
  matchesEarnedSkindleClues,
  type SkindleGuessResult,
} from '@/lib/skindle';
import type { QuizItem } from '@/lib/quiz';

function skin(overrides: Partial<QuizItem> = {}): QuizItem {
  return {
    id: 'skin-default',
    type: 'skin',
    title: 'Skin',
    question: 'Skin',
    answer: 'Skin',
    imageUrl: 'https://example.com/skin.jpg',
    champion: 'Ahri',
    releaseDate: '2020-01-01',
    skinLine: 'None',
    rarity: 'Standard',
    role: 'Mage',
    gender: 'Female',
    race: 'Human',
    resourceType: 'Mana',
    lane: 'Middle',
    ...overrides,
  };
}

describe('Skindle clue matching', () => {
  it('marks overlapping lanes as a partial match', () => {
    const target = skin({ id: 'target', lane: 'Middle' });
    const guess = compareGuess(skin({ id: 'guess', lane: 'Middle, Support' }), target);

    expect(guess.matches.lane).toBe(false);
    expect(guess.partialMatches.lane).toBe(true);
  });

  it('filters candidates using exact and partial clues already revealed', () => {
    const target = skin({ id: 'target', race: 'Human', resourceType: 'Mana', lane: 'Middle' });
    const guess = compareGuess(
      skin({ id: 'guess', race: 'Human, Aspect', resourceType: 'Mana', lane: 'Middle, Support' }),
      target,
    );
    const guesses: SkindleGuessResult[] = [guess];

    expect(matchesEarnedSkindleClues(target, guesses)).toBe(true);
    expect(matchesEarnedSkindleClues(
      skin({ id: 'candidate', race: 'Human, Aspect', resourceType: 'Mana', lane: 'Support', role: 'Support' }),
      guesses,
    )).toBe(true);
    expect(matchesEarnedSkindleClues(
      skin({ id: 'other', race: 'Vastayan', resourceType: 'Energy', lane: 'Top' }),
      guesses,
    )).toBe(false);
  });

  it('groups suggestions by champion and sorts each group from oldest to newest', () => {
    const groups = groupSkindleSuggestions([
      skin({ id: 'lux-new', champion: 'Lux', answer: 'New Lux', releaseDate: '2022-01-01' }),
      skin({ id: 'ahri-new', champion: 'Ahri', answer: 'New Ahri', releaseDate: '2022-01-01' }),
      skin({ id: 'ahri-old', champion: 'Ahri', answer: 'Old Ahri', releaseDate: '2015-01-01' }),
    ]);

    expect(groups.map((group) => group.champion)).toEqual(['Ahri', 'Lux']);
    expect(groups[0].skins.map((candidate) => candidate.id)).toEqual(['ahri-old', 'ahri-new']);
  });
});
