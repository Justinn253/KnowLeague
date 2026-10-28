import { describe, expect, it } from 'vitest';
import {
  LEAGUE_GAME_NAVIGATION_ITEMS,
  ORIGINAL_GAME_NAVIGATION_ITEMS,
} from '@/lib/game-navigation';

describe('game navigation catalogue', () => {
  it('separates League and original games and nests original routes under the Games hub', () => {
    expect(LEAGUE_GAME_NAVIGATION_ITEMS.every((game) => game.catalogue === 'league')).toBe(true);
    expect(ORIGINAL_GAME_NAVIGATION_ITEMS.every((game) => game.catalogue === 'original')).toBe(true);
    expect(ORIGINAL_GAME_NAVIGATION_ITEMS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mining', href: '/games/mining' }),
    ]));
    expect(LEAGUE_GAME_NAVIGATION_ITEMS.some((game) => game.id === 'mining')).toBe(false);
  });
});
