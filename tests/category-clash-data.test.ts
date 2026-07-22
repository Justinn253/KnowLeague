import { describe, expect, it } from 'vitest';
import {
  getCategoryClashCategories,
  matchCategoryClashAnswer,
  normalizeCategoryClashAnswer,
} from '@/lib/category-clash-data';

describe('Category Clash data helpers', () => {
  it('normalizes punctuation and ampersands consistently', () => {
    expect(normalizeCategoryClashAnswer('  Void & Shadow  ')).toBe('void and shadow');
  });

  it('matches a known answer and respects unavailable answers', () => {
    const category = getCategoryClashCategories()[0];
    const answer = category.answers[0];

    expect(matchCategoryClashAnswer(answer.label, category)?.id).toBe(answer.id);
    expect(matchCategoryClashAnswer(answer.label, category, new Set([answer.id]))).toBeNull();
  });
});
