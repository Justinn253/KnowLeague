export type GameId = 'ability-blitz' | 'skin-champion' | 'skindle' | 'skincognito';

const STORAGE_PREFIX = 'knowleague:v1';
const CLIENT_ID_KEY = `${STORAGE_PREFIX}:client-id`;
const PLAYER_DISPLAY_NAME_KEY = `${STORAGE_PREFIX}:player-display-name`;

export type PlayerGuessStat = {
  itemId: string;
  answer: string;
  imageUrl?: string;
  count: number;
};

export type FirstGuessStat = {
  itemId: string;
  answer: string;
  imageUrl?: string;
  dateKey: string;
};

export type PlayerGameStats = {
  gameId: GameId;
  completedDates: string[];
  currentStreak: number;
  gamesCompleted: number;
  totalGuesses: number;
  guessStats: Record<string, PlayerGuessStat>;
  firstGuess: FirstGuessStat | null;
};

export type PlayerCompletionGuess = {
  itemId: string;
  answer: string;
  imageUrl?: string;
};

export type DailyGameState<TState> = {
  gameId: GameId;
  dateKey: string;
  savedAt: string;
  state: TState;
};

export function getDailyDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getDailyStateKey(gameId: GameId, dateKey = getDailyDateKey()) {
  return `${STORAGE_PREFIX}:${gameId}:daily:${dateKey}`;
}

function getPlayerStatsKey(gameId: GameId) {
  return `${STORAGE_PREFIX}:${gameId}:player-stats`;
}

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createClientId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateClientId() {
  if (!isStorageAvailable()) {
    return null;
  }

  const existingClientId = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existingClientId) {
    return existingClientId;
  }

  const clientId = createClientId();
  window.localStorage.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}

export function loadPlayerDisplayName(fallback = 'Player') {
  if (!isStorageAvailable()) {
    return fallback;
  }

  const displayName = window.localStorage.getItem(PLAYER_DISPLAY_NAME_KEY)?.trim();
  return displayName || fallback;
}

export function savePlayerDisplayName(displayName: string) {
  if (!isStorageAvailable()) {
    return;
  }

  const cleanDisplayName = displayName.trim().slice(0, 24);
  if (!cleanDisplayName) {
    return;
  }

  window.localStorage.setItem(PLAYER_DISPLAY_NAME_KEY, cleanDisplayName);
}

function createEmptyPlayerStats(gameId: GameId): PlayerGameStats {
  return {
    gameId,
    completedDates: [],
    currentStreak: 0,
    gamesCompleted: 0,
    totalGuesses: 0,
    guessStats: {},
    firstGuess: null,
  };
}

function getPreviousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getDailyDateKey(date);
}

function calculateCurrentStreak(completedDates: readonly string[], todayKey = getDailyDateKey()) {
  const completedDateSet = new Set(completedDates);
  let cursor = todayKey;
  let streak = 0;

  while (completedDateSet.has(cursor)) {
    streak += 1;
    cursor = getPreviousDateKey(cursor);
  }

  return streak;
}

export function loadPlayerGameStats(gameId: GameId) {
  if (!isStorageAvailable()) {
    return createEmptyPlayerStats(gameId);
  }

  try {
    const rawStats = window.localStorage.getItem(getPlayerStatsKey(gameId));
    if (!rawStats) {
      return createEmptyPlayerStats(gameId);
    }

    const stats = JSON.parse(rawStats) as PlayerGameStats;
    return {
      ...createEmptyPlayerStats(gameId),
      ...stats,
      gameId,
      currentStreak: calculateCurrentStreak(stats.completedDates ?? []),
    };
  } catch (error) {
    console.warn(`Unable to load saved ${gameId} player stats.`, error);
    return createEmptyPlayerStats(gameId);
  }
}

export function savePlayerGameStats(stats: PlayerGameStats) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(getPlayerStatsKey(stats.gameId), JSON.stringify(stats));
  } catch (error) {
    console.warn(`Unable to save ${stats.gameId} player stats.`, error);
  }
}

export function recordPlayerGameCompletion(
  gameId: GameId,
  guesses: readonly PlayerCompletionGuess[] = [],
  dateKey = getDailyDateKey(),
) {
  const currentStats = loadPlayerGameStats(gameId);
  if (currentStats.completedDates.includes(dateKey)) {
    return currentStats;
  }

  const completedDates = [...currentStats.completedDates, dateKey].sort();
  const guessStats = { ...currentStats.guessStats };

  guesses.forEach((guess) => {
    guessStats[guess.itemId] = {
      itemId: guess.itemId,
      answer: guess.answer,
      imageUrl: guess.imageUrl,
      count: (guessStats[guess.itemId]?.count ?? 0) + 1,
    };
  });

  const updatedStats: PlayerGameStats = {
    ...currentStats,
    completedDates,
    currentStreak: calculateCurrentStreak(completedDates, dateKey),
    gamesCompleted: currentStats.gamesCompleted + 1,
    totalGuesses: currentStats.totalGuesses + guesses.length,
    guessStats,
    firstGuess: currentStats.firstGuess ?? (
      guesses[0]
        ? {
            itemId: guesses[0].itemId,
            answer: guesses[0].answer,
            imageUrl: guesses[0].imageUrl,
            dateKey,
          }
        : null
    ),
  };

  savePlayerGameStats(updatedStats);
  return updatedStats;
}

export function loadDailyGameState<TState>(gameId: GameId, dateKey = getDailyDateKey()) {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const rawState = window.localStorage.getItem(getDailyStateKey(gameId, dateKey));
    if (!rawState) {
      return null;
    }

    const parsedState = JSON.parse(rawState) as DailyGameState<TState>;
    if (parsedState.gameId !== gameId || parsedState.dateKey !== dateKey) {
      return null;
    }

    return parsedState.state;
  } catch (error) {
    console.warn(`Unable to load saved ${gameId} state.`, error);
    return null;
  }
}

export function saveDailyGameState<TState>(gameId: GameId, state: TState, dateKey = getDailyDateKey()) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    const persistedState: DailyGameState<TState> = {
      gameId,
      dateKey,
      savedAt: new Date().toISOString(),
      state,
    };

    window.localStorage.setItem(getDailyStateKey(gameId, dateKey), JSON.stringify(persistedState));
  } catch (error) {
    console.warn(`Unable to save ${gameId} state.`, error);
  }
}

export function clearDailyGameState(gameId: GameId, dateKey = getDailyDateKey()) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.removeItem(getDailyStateKey(gameId, dateKey));
  } catch (error) {
    console.warn(`Unable to clear saved ${gameId} state.`, error);
  }
}
