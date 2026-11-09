import { describe, expect, it } from 'vitest';
import { createPublicProfileStats } from '@/lib/public-profile-stats';

describe('public profile statistics projection', () => {
  it('retains aggregate totals while omitting raw gameplay details', () => {
    const stats = createPublicProfileStats({
      skindle: {
        gameId: 'skindle',
        completedDates: ['2026-01-01'],
        gamesCompleted: 1,
        totalGuesses: 4,
        currentStreak: 1,
        highestStreak: 3,
        guessStats: { secret: { itemId: 'secret', answer: 'Private answer', imageUrl: 'https://example.test/skin.png', count: 1 } },
      },
    }, {
      skincognito: {
        totalPlayed: 2,
        totalWins: 1,
        totalLosses: 1,
        currentStreak: 0,
        bestStreak: 1,
        totalGuesses: 10,
        correctGuesses: 8,
        totalVictoryTurns: 3,
        victoriesWithTurnCount: 1,
        guessedSkinStats: { secret: { value: 'Private skin', count: 1 } },
        recordedMatchIds: ['private-match-id'],
      },
    });

    expect(stats.skindle).toMatchObject({ gamesCompleted: 1, totalGuesses: 4, averageGuesses: 4 });
    expect(stats.skincognito).toMatchObject({ totalPlayed: 2, totalWins: 1, averageVictoryTurns: 3 });
    expect(JSON.stringify(stats)).not.toContain('Private answer');
    expect(JSON.stringify(stats)).not.toContain('Private skin');
    expect(JSON.stringify(stats)).not.toContain('private-match-id');
    expect(JSON.stringify(stats)).not.toContain('2026-01-01');
  });
});
