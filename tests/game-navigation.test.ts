import { describe, expect, it } from 'vitest';
import {
  LEAGUE_GAME_NAVIGATION_ITEMS,
  ORIGINAL_GAME_NAVIGATION_ITEMS,
} from '@/lib/game-navigation';
import { LEAGUE_GAMES_FOR_DRAWER, LEAGUE_GAMES_FOR_HEADER, LEAGUE_GAMES_FOR_HUB, RANDODRAFT_GAME } from '@/lib/app-navigation';

describe('game navigation catalogue', () => {
  it('separates League and original games and nests original routes under the Games hub', () => {
    expect(LEAGUE_GAME_NAVIGATION_ITEMS.every((game) => game.catalogue === 'league')).toBe(true);
    expect(ORIGINAL_GAME_NAVIGATION_ITEMS.every((game) => game.catalogue === 'original')).toBe(true);
    expect(ORIGINAL_GAME_NAVIGATION_ITEMS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mining', href: '/games/mining' }),
    ]));
    expect(LEAGUE_GAME_NAVIGATION_ITEMS.some((game) => game.id === 'mining')).toBe(false);
  });

  it('keeps Randodraft in League Tools without listing it among games', () => {
    expect(RANDODRAFT_GAME).toMatchObject({ id: 'randodraft', href: '/randodraft' });
    expect(LEAGUE_GAMES_FOR_HUB.some((game) => game.id === 'randodraft')).toBe(false);
    expect(LEAGUE_GAMES_FOR_HEADER.some((game) => game.id === 'randodraft')).toBe(false);
    expect(LEAGUE_GAMES_FOR_DRAWER.some((game) => game.id === 'randodraft')).toBe(false);
  });
});
