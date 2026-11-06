import { describe, expect, it } from 'vitest';
import { searchHelpCenter } from '@/lib/help-center';

describe('help center search', () => {
  it('finds privacy guidance from a natural-language query', () => {
    expect(searchHelpCenter('make my stats private')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'account-and-profile' }),
      expect.objectContaining({ id: 'game-statistics' }),
    ]));
  });

  it('returns no article for unrelated text', () => {
    expect(searchHelpCenter('unrelated encyclopedia phrase')).toEqual([]);
  });
});
