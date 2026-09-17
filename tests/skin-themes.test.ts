import { describe, expect, it } from 'vitest';
import type { QuizItem } from '@/lib/quiz';
import { getSkinThemeAnswersByChampion } from '@/lib/skin-themes';

function skin(overrides: Partial<QuizItem> = {}): QuizItem {
  return {
    id: 'skin-default',
    type: 'skin',
    title: 'Skin Splash',
    question: 'Skin Splash',
    answer: 'Skin Splash',
    imageUrl: 'https://example.com/skin.jpg',
    champion: 'Ahri',
    skinLine: 'Academy',
    ...overrides,
  };
}

describe('skin theme helpers', () => {
  it('maps each champion to its deduplicated skin line answers', () => {
    expect(getSkinThemeAnswersByChampion([
      skin({ id: 'yasuo-project', champion: 'Yasuo', skinLine: 'PROJECT' }),
      skin({ id: 'yasuo-spirit', champion: 'Yasuo', skinLine: 'Spirit Blossom' }),
      skin({ id: 'yasuo-project-2', champion: 'Yasuo', skinLine: 'PROJECT' }),
      skin({ id: 'ahri-academy', champion: 'Ahri', skinLine: 'Academy' }),
    ])).toEqual({
      Ahri: ['Academy'],
      Yasuo: ['PROJECT', 'Spirit Blossom'],
    });
  });
});
