import { describe, expect, it } from 'vitest';
import type { QuizItem } from '@/lib/quiz';
import {
  filterItemsByAbilitySlots,
  formatAbilitySlotSelection,
  getAbilitySlotId,
} from '@/lib/ability-slots';

function quizItem(id: string, type: QuizItem['type']): QuizItem {
  return {
    id,
    type,
    title: id,
    question: id,
    answer: id,
    imageUrl: '',
    champion: 'Test Champion',
  };
}

describe('ability slot helpers', () => {
  it('formats selected slots in game order', () => {
    expect(formatAbilitySlotSelection(['r', 'p'])).toBe('Abilities: [P, R]');
    expect(formatAbilitySlotSelection(['q'])).toBe('[Q]');
    expect(formatAbilitySlotSelection(['p', 'q', 'w', 'e', 'r'])).toBe('All Abilities');
  });

  it('maps quiz items to their ability slots', () => {
    expect(getAbilitySlotId(quizItem('lux-passive', 'passive'))).toBe('p');
    expect(getAbilitySlotId(quizItem('lux-spell-0', 'spell'))).toBe('q');
    expect(getAbilitySlotId(quizItem('lux-spell-2', 'spell'))).toBe('e');
    expect(getAbilitySlotId(quizItem('lux-ultimate', 'ultimate'))).toBe('r');
  });

  it('filters items from either a list or slot state object', () => {
    const items = [
      quizItem('lux-passive', 'passive'),
      quizItem('lux-spell-0', 'spell'),
      quizItem('lux-spell-1', 'spell'),
      quizItem('lux-ultimate', 'ultimate'),
    ];

    expect(filterItemsByAbilitySlots(items, ['p', 'r']).map((item) => item.id)).toEqual(['lux-passive', 'lux-ultimate']);
    expect(filterItemsByAbilitySlots(items, { p: false, q: true, w: false, e: false, r: false }).map((item) => item.id)).toEqual(['lux-spell-0']);
  });
});
