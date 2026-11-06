import {
  normalizeDetailedGameStats,
  normalizePlayerGameStatsByGame,
  type DetailedGameStats,
  type PlayerGameStatsByGame,
  type QuizModeStats,
} from '@/lib/game-storage';

export type PublicQuizModeStats = {
  totalPlayed: number;
  currentStreak: number;
  bestStreak: number;
  totalGuesses: number;
  correctGuesses: number;
  completedItems: number;
  averageSecondsPerCompletedItem: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
};

export type PublicProfileStats = {
  abilityBlitz: { solo: PublicQuizModeStats; multiplayer: PublicQuizModeStats };
  skinChampion: { solo: PublicQuizModeStats; multiplayer: PublicQuizModeStats };
  skindle: {
    gamesCompleted: number;
    currentStreak: number;
    highestStreak: number;
    totalGuesses: number;
    averageGuesses: number;
  };
  skincognito: {
    totalPlayed: number;
    totalWins: number;
    totalLosses: number;
    currentStreak: number;
    bestStreak: number;
    totalGuesses: number;
    correctGuesses: number;
    averageVictoryTurns: number;
  };
};

function projectQuizMode(stats: QuizModeStats): PublicQuizModeStats {
  return {
    totalPlayed: stats.totalPlayed,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    totalGuesses: stats.totalGuesses,
    correctGuesses: stats.correctGuesses,
    completedItems: stats.completedItems,
    averageSecondsPerCompletedItem: stats.completedItems > 0
      ? Math.round(stats.totalElapsedSeconds / stats.completedItems)
      : 0,
    matchesPlayed: stats.matchesPlayed,
    matchesWon: stats.matchesWon,
    matchesLost: stats.matchesLost,
  };
}

function projectSkindle(statsByGame: PlayerGameStatsByGame) {
  const stats = statsByGame.skindle;
  const gamesCompleted = stats?.gamesCompleted ?? 0;
  const totalGuesses = stats?.totalGuesses ?? 0;
  return {
    gamesCompleted,
    currentStreak: stats?.currentStreak ?? 0,
    highestStreak: stats?.highestStreak ?? 0,
    totalGuesses,
    averageGuesses: gamesCompleted > 0 ? Math.round((totalGuesses / gamesCompleted) * 10) / 10 : 0,
  };
}

function projectSkincognito(stats: DetailedGameStats['skincognito']) {
  return {
    totalPlayed: stats.totalPlayed,
    totalWins: stats.totalWins,
    totalLosses: stats.totalLosses,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    totalGuesses: stats.totalGuesses,
    correctGuesses: stats.correctGuesses,
    averageVictoryTurns: stats.victoriesWithTurnCount > 0
      ? Math.round((stats.totalVictoryTurns / stats.victoriesWithTurnCount) * 10) / 10
      : 0,
  };
}

/**
 * Removes per-game dates, match identifiers, named guesses, item/skin details,
 * and any other raw activity data before it can leave the server.
 */
export function createPublicProfileStats(playerGameStats: unknown, detailedGameStats: unknown): PublicProfileStats {
  const playerStats = normalizePlayerGameStatsByGame(playerGameStats);
  const detailedStats = normalizeDetailedGameStats(detailedGameStats as Partial<DetailedGameStats> | null | undefined);

  return {
    abilityBlitz: {
      solo: projectQuizMode(detailedStats.abilityBlitz.solo),
      multiplayer: projectQuizMode(detailedStats.abilityBlitz.multiplayer),
    },
    skinChampion: {
      solo: projectQuizMode(detailedStats.skinChampion.solo),
      multiplayer: projectQuizMode(detailedStats.skinChampion.multiplayer),
    },
    skindle: projectSkindle(playerStats),
    skincognito: projectSkincognito(detailedStats.skincognito),
  };
}
