export type GameId = 'ability-blitz' | 'skin-champion' | 'skindle' | 'skincognito';
export type QuizStatsGameId = 'ability-blitz' | 'skin-champion';
export type StatsMode = 'solo' | 'multiplayer';
export type SoloQuizStorageMode = 'casual' | 'daily' | 'chaos';
export type SoloQuizStreakScope = `${SoloQuizStorageMode}:${string}`;

const STORAGE_PREFIX = 'knowleague:v1';
const CLIENT_ID_KEY = `${STORAGE_PREFIX}:client-id`;
const DETAILED_STATS_KEY = `${STORAGE_PREFIX}:detailed-game-stats`;
const PENDING_QUIZ_STATS_KEY = `${STORAGE_PREFIX}:pending-quiz-stats`;
const MAX_RECORDED_MATCH_IDS = 250;
const MAX_SKIN_GUESS_STATS = 50;

export type PlayerGuessStat = {
  itemId: string;
  answer: string;
  imageUrl?: string;
  count: number;
};

export type PlayerValueStat = {
  value: string;
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
  highestStreak: number;
  gamesCompleted: number;
  totalGuesses: number;
  guessStats: Record<string, PlayerGuessStat>;
  skinLineStats: Record<string, PlayerValueStat>;
  releaseYearStats: Record<string, PlayerValueStat>;
  rarityStats: Record<string, PlayerValueStat>;
  firstGuess: FirstGuessStat | null;
  lastCorrectGuess: FirstGuessStat | null;
  streaksByScope?: Record<string, {
    completedDates: string[];
    currentStreak: number;
    highestStreak: number;
  }>;
};

export type PlayerCompletionGuess = {
  itemId: string;
  answer: string;
  imageUrl?: string;
  skinLine?: string | null;
  releaseYear?: string | null;
  rarity?: string | null;
};

export type QuizModeStats = {
  totalPlayed: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  currentStreak: number;
  bestStreak: number;
  totalGuesses: number;
  correctGuesses: number;
  totalElapsedSeconds: number;
  completedItems: number;
  recordedMatchIds: string[];
};

export type QuizGameDetailedStats = {
  solo: QuizModeStats;
  multiplayer: QuizModeStats;
};

export type SkincognitoDetailedStats = {
  totalPlayed: number;
  totalWins: number;
  totalLosses: number;
  currentStreak: number;
  bestStreak: number;
  totalGuesses: number;
  correctGuesses: number;
  totalVictoryTurns: number;
  victoriesWithTurnCount: number;
  guessedSkinStats: Record<string, PlayerValueStat>;
  recordedMatchIds: string[];
};

export type DetailedGameStats = {
  abilityBlitz: QuizGameDetailedStats;
  skinChampion: QuizGameDetailedStats;
  skincognito: SkincognitoDetailedStats;
};

export type QuizStatsInput = {
  gameId: QuizStatsGameId;
  mode: StatsMode;
  completedItems: number;
  totalItems: number;
  wrongGuesses: number;
  elapsedSeconds: number;
  won?: boolean;
  lost?: boolean;
  matchId?: string;
};

type PendingQuizStatsInput = QuizStatsInput & {
  recordAfter: number;
};

export type SkincognitoStatsInput = {
  matchId: string;
  won: boolean;
  totalGuesses: number;
  correctGuesses: number;
  turnsUntilVictory?: number | null;
  mostRecentSkinGuess?: string | null;
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

function getSoloQuizStateKey(gameId: QuizStatsGameId, mode: SoloQuizStorageMode, difficulty: string, dateKey = getDailyDateKey()) {
  return `${STORAGE_PREFIX}:${gameId}:solo:${mode}:${difficulty}:${dateKey}`;
}

function getSoloQuizCompletionKey(gameId: QuizStatsGameId, mode: SoloQuizStorageMode, difficulty: string, dateKey = getDailyDateKey()) {
  return `${STORAGE_PREFIX}:${gameId}:solo:${mode}:${difficulty}:${dateKey}:completed`;
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

function createEmptyPlayerStats(gameId: GameId): PlayerGameStats {
  return {
    gameId,
    completedDates: [],
    currentStreak: 0,
    highestStreak: 0,
    gamesCompleted: 0,
    totalGuesses: 0,
    guessStats: {},
    skinLineStats: {},
    releaseYearStats: {},
    rarityStats: {},
    firstGuess: null,
    lastCorrectGuess: null,
    streaksByScope: {},
  };
}

function createEmptyQuizModeStats(): QuizModeStats {
  return {
    totalPlayed: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalGuesses: 0,
    correctGuesses: 0,
    totalElapsedSeconds: 0,
    completedItems: 0,
    recordedMatchIds: [],
  };
}

function createEmptySkincognitoStats(): SkincognitoDetailedStats {
  return {
    totalPlayed: 0,
    totalWins: 0,
    totalLosses: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalGuesses: 0,
    correctGuesses: 0,
    totalVictoryTurns: 0,
    victoriesWithTurnCount: 0,
    guessedSkinStats: {},
    recordedMatchIds: [],
  };
}

function createEmptyDetailedStats(): DetailedGameStats {
  return {
    abilityBlitz: {
      solo: createEmptyQuizModeStats(),
      multiplayer: createEmptyQuizModeStats(),
    },
    skinChampion: {
      solo: createEmptyQuizModeStats(),
      multiplayer: createEmptyQuizModeStats(),
    },
    skincognito: createEmptySkincognitoStats(),
  };
}

function normalizeQuizModeStats(stats?: Partial<QuizModeStats>): QuizModeStats {
  return {
    ...createEmptyQuizModeStats(),
    ...stats,
    recordedMatchIds: Array.isArray(stats?.recordedMatchIds) ? stats.recordedMatchIds.slice(-MAX_RECORDED_MATCH_IDS) : [],
  };
}

function normalizeSkincognitoStats(stats?: Partial<SkincognitoDetailedStats>): SkincognitoDetailedStats {
  return {
    ...createEmptySkincognitoStats(),
    ...stats,
    guessedSkinStats: stats?.guessedSkinStats ?? {},
    recordedMatchIds: Array.isArray(stats?.recordedMatchIds) ? stats.recordedMatchIds.slice(-MAX_RECORDED_MATCH_IDS) : [],
  };
}

function normalizeDetailedStats(stats?: Partial<DetailedGameStats>): DetailedGameStats {
  return {
    abilityBlitz: {
      solo: normalizeQuizModeStats(stats?.abilityBlitz?.solo),
      multiplayer: normalizeQuizModeStats(stats?.abilityBlitz?.multiplayer),
    },
    skinChampion: {
      solo: normalizeQuizModeStats(stats?.skinChampion?.solo),
      multiplayer: normalizeQuizModeStats(stats?.skinChampion?.multiplayer),
    },
    skincognito: normalizeSkincognitoStats(stats?.skincognito),
  };
}

function applyQuizGameStats(allStats: DetailedGameStats, input: QuizStatsInput) {
  const gameKey = input.gameId === 'ability-blitz' ? 'abilityBlitz' : 'skinChampion';
  const current = allStats[gameKey][input.mode];
  if (hasRecordedMatch(current, input.matchId)) {
    return allStats;
  }

  const correctGuesses = Math.max(0, Math.floor(input.completedItems));
  const wrongGuesses = Math.max(0, Math.floor(input.wrongGuesses));
  const totalGuesses = correctGuesses + wrongGuesses;
  const won = input.won ?? correctGuesses >= input.totalItems;
  const lost = input.lost ?? !won;
  const currentStreak = nextStreak(current.currentStreak, won);
  const nextStats: QuizModeStats = {
    ...current,
    totalPlayed: current.totalPlayed + 1,
    matchesPlayed: input.mode === 'multiplayer' ? current.matchesPlayed + 1 : current.matchesPlayed,
    matchesWon: input.mode === 'multiplayer' && won ? current.matchesWon + 1 : current.matchesWon,
    matchesLost: input.mode === 'multiplayer' && lost ? current.matchesLost + 1 : current.matchesLost,
    currentStreak,
    bestStreak: Math.max(current.bestStreak, currentStreak),
    totalGuesses: current.totalGuesses + totalGuesses,
    correctGuesses: current.correctGuesses + correctGuesses,
    totalElapsedSeconds: current.totalElapsedSeconds + Math.max(0, Math.floor(input.elapsedSeconds)),
    completedItems: current.completedItems + correctGuesses,
    recordedMatchIds: appendRecordedMatchId(current.recordedMatchIds, input.matchId),
  };

  allStats[gameKey][input.mode] = nextStats;
  return allStats;
}

function loadPendingQuizStats() {
  if (!isStorageAvailable()) {
    return [];
  }

  try {
    const rawStats = window.localStorage.getItem(PENDING_QUIZ_STATS_KEY);
    return rawStats ? JSON.parse(rawStats) as PendingQuizStatsInput[] : [];
  } catch (error) {
    console.warn('Unable to load pending quiz stats.', error);
    return [];
  }
}

function savePendingQuizStats(stats: PendingQuizStatsInput[]) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    if (stats.length === 0) {
      window.localStorage.removeItem(PENDING_QUIZ_STATS_KEY);
      return;
    }

    window.localStorage.setItem(PENDING_QUIZ_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn('Unable to save pending quiz stats.', error);
  }
}

function applyExpiredPendingQuizStats(stats: DetailedGameStats) {
  const pendingStats = loadPendingQuizStats();
  if (pendingStats.length === 0) {
    return stats;
  }

  const now = Date.now();
  const remainingStats: PendingQuizStatsInput[] = [];
  let nextStats = stats;

  pendingStats.forEach((pending) => {
    if (pending.recordAfter <= now) {
      nextStats = applyQuizGameStats(nextStats, pending);
    } else {
      remainingStats.push(pending);
    }
  });

  savePendingQuizStats(remainingStats);
  if (remainingStats.length !== pendingStats.length) {
    saveDetailedGameStats(nextStats);
  }
  return nextStats;
}

export function loadDetailedGameStats() {
  if (!isStorageAvailable()) {
    return createEmptyDetailedStats();
  }

  try {
    const rawStats = window.localStorage.getItem(DETAILED_STATS_KEY);
    return applyExpiredPendingQuizStats(normalizeDetailedStats(rawStats ? JSON.parse(rawStats) as Partial<DetailedGameStats> : undefined));
  } catch (error) {
    console.warn('Unable to load detailed game stats.', error);
    return createEmptyDetailedStats();
  }
}

function saveDetailedGameStats(stats: DetailedGameStats) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(DETAILED_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn('Unable to save detailed game stats.', error);
  }
}

function nextStreak(current: number, won: boolean) {
  return won ? current + 1 : 0;
}

function hasRecordedMatch(stats: { recordedMatchIds: string[] }, matchId?: string) {
  return Boolean(matchId && stats.recordedMatchIds.includes(matchId));
}

function appendRecordedMatchId(ids: string[], matchId?: string) {
  return matchId ? [...ids, matchId].slice(-MAX_RECORDED_MATCH_IDS) : ids;
}

export function recordQuizGameStats(input: QuizStatsInput) {
  const allStats = loadDetailedGameStats();
  const nextStats = applyQuizGameStats(allStats, input);
  saveDetailedGameStats(nextStats);
  return nextStats;
}

export function queuePendingQuizGameStats(input: QuizStatsInput, recordAfter: number) {
  if (!isStorageAvailable() || !input.matchId) {
    return;
  }

  const pendingStats = loadPendingQuizStats().filter((pending) => pending.matchId !== input.matchId);
  savePendingQuizStats([...pendingStats, { ...input, recordAfter }]);
}

function trimValueStats(stats: Record<string, PlayerValueStat>) {
  return Object.fromEntries(
    Object.entries(stats)
      .sort(([, left], [, right]) => right.count - left.count)
      .slice(0, MAX_SKIN_GUESS_STATS),
  );
}

export function recordSkincognitoStats(input: SkincognitoStatsInput) {
  const allStats = loadDetailedGameStats();
  const current = allStats.skincognito;
  if (hasRecordedMatch(current, input.matchId)) {
    return allStats;
  }

  const currentStreak = nextStreak(current.currentStreak, input.won);
  const guessedSkinStats = { ...current.guessedSkinStats };
  const skinGuess = input.mostRecentSkinGuess?.trim();
  if (skinGuess) {
    guessedSkinStats[skinGuess] = {
      value: skinGuess,
      count: (guessedSkinStats[skinGuess]?.count ?? 0) + 1,
    };
  }

  allStats.skincognito = {
    ...current,
    totalPlayed: current.totalPlayed + 1,
    totalWins: input.won ? current.totalWins + 1 : current.totalWins,
    totalLosses: input.won ? current.totalLosses : current.totalLosses + 1,
    currentStreak,
    bestStreak: Math.max(current.bestStreak, currentStreak),
    totalGuesses: current.totalGuesses + Math.max(0, Math.floor(input.totalGuesses)),
    correctGuesses: current.correctGuesses + Math.max(0, Math.floor(input.correctGuesses)),
    totalVictoryTurns: input.won && input.turnsUntilVictory ? current.totalVictoryTurns + Math.max(0, input.turnsUntilVictory) : current.totalVictoryTurns,
    victoriesWithTurnCount: input.won && input.turnsUntilVictory ? current.victoriesWithTurnCount + 1 : current.victoriesWithTurnCount,
    guessedSkinStats: trimValueStats(guessedSkinStats),
    recordedMatchIds: appendRecordedMatchId(current.recordedMatchIds, input.matchId),
  };
  saveDetailedGameStats(allStats);
  return allStats;
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

function calculateHighestStreak(completedDates: readonly string[]) {
  const sortedDates = [...new Set(completedDates)].sort();
  let highest = 0;
  let current = 0;
  let previous: string | null = null;

  sortedDates.forEach((dateKey) => {
    current = previous && getPreviousDateKey(dateKey) === previous ? current + 1 : 1;
    highest = Math.max(highest, current);
    previous = dateKey;
  });

  return highest;
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
      highestStreak: Math.max(stats.highestStreak ?? 0, calculateHighestStreak(stats.completedDates ?? [])),
      streaksByScope: stats.streaksByScope ?? {},
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
  streakScope?: SoloQuizStreakScope,
) {
  const currentStats = loadPlayerGameStats(gameId);
  if (currentStats.completedDates.includes(dateKey)) {
    return currentStats;
  }

  const completedDates = [...currentStats.completedDates, dateKey].sort();
  const guessStats = { ...currentStats.guessStats };
  const skinLineStats = { ...currentStats.skinLineStats };
  const releaseYearStats = { ...currentStats.releaseYearStats };
  const rarityStats = { ...currentStats.rarityStats };

  const recordValueStat = (stats: Record<string, PlayerValueStat>, rawValue?: string | null) => {
    const value = rawValue?.trim();
    if (!value) return;
    stats[value] = {
      value,
      count: (stats[value]?.count ?? 0) + 1,
    };
  };

  guesses.forEach((guess) => {
    guessStats[guess.itemId] = {
      itemId: guess.itemId,
      answer: guess.answer,
      imageUrl: guess.imageUrl,
      count: (guessStats[guess.itemId]?.count ?? 0) + 1,
    };
    recordValueStat(skinLineStats, guess.skinLine);
    recordValueStat(releaseYearStats, guess.releaseYear);
    recordValueStat(rarityStats, guess.rarity);
  });
  const currentStreak = calculateCurrentStreak(completedDates, dateKey);
  const lastGuess = guesses[guesses.length - 1];

  const updatedStats: PlayerGameStats = {
    ...currentStats,
    completedDates,
    currentStreak,
    highestStreak: Math.max(currentStats.highestStreak, currentStreak),
    gamesCompleted: currentStats.gamesCompleted + 1,
    totalGuesses: currentStats.totalGuesses + guesses.length,
    guessStats,
    skinLineStats,
    releaseYearStats,
    rarityStats,
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
    lastCorrectGuess: lastGuess
      ? {
          itemId: lastGuess.itemId,
          answer: lastGuess.answer,
          imageUrl: lastGuess.imageUrl,
          dateKey,
        }
      : currentStats.lastCorrectGuess,
  };

  if (streakScope) {
    const currentScope = currentStats.streaksByScope?.[streakScope] ?? {
      completedDates: [],
      currentStreak: 0,
      highestStreak: 0,
    };
    const scopeDates = currentScope.completedDates.includes(dateKey)
      ? currentScope.completedDates
      : [...currentScope.completedDates, dateKey].sort();
    const scopeStreak = calculateCurrentStreak(scopeDates, dateKey);
    updatedStats.streaksByScope = {
      ...(currentStats.streaksByScope ?? {}),
      [streakScope]: {
        completedDates: scopeDates,
        currentStreak: scopeStreak,
        highestStreak: Math.max(currentScope.highestStreak, scopeStreak),
      },
    };
  }

  savePlayerGameStats(updatedStats);
  return updatedStats;
}

export function getPlayerGameStreakForScope(stats: PlayerGameStats, scope: SoloQuizStreakScope) {
  const current = stats.streaksByScope?.[scope];
  if (!current) {
    return { currentStreak: 0, highestStreak: 0 };
  }

  return {
    currentStreak: calculateCurrentStreak(current.completedDates ?? []),
    highestStreak: Math.max(current.highestStreak ?? 0, calculateHighestStreak(current.completedDates ?? [])),
  };
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

export function loadSoloQuizGameState<TState>(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const rawState = window.localStorage.getItem(getSoloQuizStateKey(gameId, mode, difficulty, dateKey));
    return rawState ? JSON.parse(rawState) as TState : null;
  } catch (error) {
    console.warn(`Unable to load saved ${gameId} ${mode} state.`, error);
    return null;
  }
}

export function hasSoloQuizGameState(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return false;
  }

  return window.localStorage.getItem(getSoloQuizStateKey(gameId, mode, difficulty, dateKey)) !== null;
}

export function saveSoloQuizGameState<TState>(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  state: TState,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(getSoloQuizStateKey(gameId, mode, difficulty, dateKey), JSON.stringify(state));
  } catch (error) {
    console.warn(`Unable to save ${gameId} ${mode} state.`, error);
  }
}

export function clearSoloQuizGameState(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.removeItem(getSoloQuizStateKey(gameId, mode, difficulty, dateKey));
  } catch (error) {
    console.warn(`Unable to clear saved ${gameId} ${mode} state.`, error);
  }
}

export function hasCompletedSoloQuizMode(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return false;
  }

  return window.localStorage.getItem(getSoloQuizCompletionKey(gameId, mode, difficulty, dateKey)) === 'true';
}

export function recordCompletedSoloQuizMode(
  gameId: QuizStatsGameId,
  mode: SoloQuizStorageMode,
  difficulty: string,
  dateKey = getDailyDateKey(),
) {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(getSoloQuizCompletionKey(gameId, mode, difficulty, dateKey), 'true');
  } catch (error) {
    console.warn(`Unable to record ${gameId} ${mode} completion.`, error);
  }
}
