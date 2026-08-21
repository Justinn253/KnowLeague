import { dailySeed, seededShuffle } from '@/lib/daily-set';
import { getAbilityCatalog, getSkinCatalog } from '@/lib/catalogs';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { shuffle, type CompletedTime, type QuizItem } from '@/lib/quiz';

export const SOLO_QUIZ_GAME_IDS = ['ability-blitz', 'skin-champion'] as const;
export type SoloQuizGameId = (typeof SOLO_QUIZ_GAME_IDS)[number];
export type SoloQuizMode = 'casual' | 'daily' | 'chaos';
export type SoloQuizDifficulty = 'iron' | 'gold' | 'diamond' | 'challenger';

export const SOLO_QUIZ_ENTRY_COUNT_OPTIONS = [10, 25, 50, 75, 100] as const;

export type SoloQuizDifficultyRule = {
  hintDelaySeconds: number | null;
  wrongGuess: 'none' | 'flat-five' | 'scaled' | 'game-over';
  upcomingVisibility: 'clear' | 'blurred' | 'blocked';
  autocomplete: boolean;
};

export const SOLO_QUIZ_DIFFICULTY_RULES: Record<SoloQuizDifficulty, SoloQuizDifficultyRule> = {
  iron: {
    hintDelaySeconds: 0,
    wrongGuess: 'none',
    upcomingVisibility: 'clear',
    autocomplete: true,
  },
  gold: {
    hintDelaySeconds: 10,
    wrongGuess: 'flat-five',
    upcomingVisibility: 'blurred',
    autocomplete: true,
  },
  diamond: {
    hintDelaySeconds: 30,
    wrongGuess: 'scaled',
    upcomingVisibility: 'blocked',
    autocomplete: true,
  },
  challenger: {
    hintDelaySeconds: null,
    wrongGuess: 'game-over',
    upcomingVisibility: 'blocked',
    autocomplete: false,
  },
};

export type SoloQuizRoundState<
  TModifiers extends Record<string, boolean>,
  TExtra extends object = {},
> = {
  items: QuizItem[];
  soloMode?: SoloQuizMode;
  selectedDifficulty: SoloQuizDifficulty;
  activeModifiers: TModifiers;
  entryCount: number;
  started: boolean;
  activeIndex: number;
  currentTime: number;
  totalTime: number;
  completedTimes: Record<string, CompletedTime>;
  finished: boolean;
  failed: boolean;
} & TExtra;

export type SoloQuizGameDefinition = {
  id: SoloQuizGameId;
  label: string;
  catalog: 'ability' | 'skin';
  answerMode: 'ability' | 'skin-line';
};

export const SOLO_QUIZ_GAME_DEFINITIONS: Record<SoloQuizGameId, SoloQuizGameDefinition> = {
  'ability-blitz': {
    id: 'ability-blitz',
    label: 'Ability Blitz',
    catalog: 'ability',
    answerMode: 'ability',
  },
  'skin-champion': {
    id: 'skin-champion',
    label: 'Skin Champion',
    catalog: 'skin',
    answerMode: 'skin-line',
  },
};

export function getSoloQuizGameDefinition(gameId: SoloQuizGameId) {
  return SOLO_QUIZ_GAME_DEFINITIONS[gameId];
}

export type SoloLeaderboardEntry = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  completionTimeSeconds: number;
  itemTimeSeconds: number;
  wrongGuesses: number;
  completedItems: number;
  totalItems: number;
  result: 'active' | 'completed' | 'failed' | 'abandoned';
  completedAt: string;
};

export type SoloLeaderboardSnapshot = {
  entries: SoloLeaderboardEntry[];
  playedCount: number;
  hasPlayed: boolean;
};

type SoloLeaderboardRow = {
  id: string;
  user_id: string;
  completion_time_seconds: number;
  item_time_seconds: number;
  wrong_guesses: number;
  completed_at: string;
  profiles: {
    username: string;
    display_name: string | null;
  } | null;
};

type SoloAttemptRow = {
  id: string;
  user_id: string;
  total_items: number;
  completed_items: number;
  elapsed_seconds: number;
  wrong_guesses: number;
  result: 'active' | 'completed' | 'failed' | 'abandoned';
  updated_at: string;
  profiles: {
    username: string;
    display_name: string | null;
  } | null;
};

export const soloQuizModes: { id: SoloQuizMode; name: string; description: string; leaderboard: boolean }[] = [
  {
    id: 'daily',
    name: 'Daily',
    description: 'One shared set per difficulty each day. You get one attempt per day. Do you think you can reach the top of the leaderboard?',
    leaderboard: true,
  },
  {
    id: 'casual',
    name: 'Casual',
    description: 'Pick a difficulty and activate any modifiers to see how well you fare in this mode of League of Legends trivia. Play as many times as you want and at your own pace.',
    leaderboard: false,
  },
  {
    id: 'chaos',
    name: 'Chaos',
    description: 'The ultimate challenge for the masters of League trivia. One shared set per day, challenger difficulty, all modifiers activated, and a 20 second round timer. One daily attempt.',
    leaderboard: true,
  },
];

export const CHAOS_DIFFICULTY: SoloQuizDifficulty = 'challenger';
export const CHAOS_ROUND_TIME_LIMIT_SECONDS = 20;

export function getSoloQuizDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isLeaderboardMode(mode: SoloQuizMode) {
  return mode === 'daily' || mode === 'chaos';
}

export function getSoloQuizItems(input: {
  gameId: SoloQuizGameId;
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  entryCount: number;
}) {
  const catalog = getSoloQuizGameDefinition(input.gameId).catalog === 'ability' ? getAbilityCatalog() : getSkinCatalog();
  const count = Math.max(1, Math.min(100, Math.floor(input.entryCount)));

  if (input.mode === 'casual') {
    return shuffle(catalog).slice(0, count);
  }

  const seed = dailySeed(`${input.gameId}:${input.mode}:${input.difficulty}`);
  return seededShuffle(catalog, seed).slice(0, count);
}

export async function getSoloLeaderboard(input: {
  gameId: SoloQuizGameId;
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  userId?: string | null;
  dateKey?: string;
  limit?: number;
}): Promise<SoloLeaderboardSnapshot> {
  if (!isLeaderboardMode(input.mode)) {
    return { entries: [], playedCount: 0, hasPlayed: false };
  }

  const dateKey = input.dateKey ?? getSoloQuizDateKey();
  const difficulty = input.mode === 'chaos' ? CHAOS_DIFFICULTY : input.difficulty;
  const supabase = getSupabaseServiceClient();
  const countQuery = supabase
    .from('solo_quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', input.gameId)
    .eq('mode', input.mode)
    .eq('difficulty', difficulty)
    .eq('date_key', dateKey);

  const playedQuery = input.userId
    ? supabase
      .from('solo_quiz_attempts')
      .select('id')
      .eq('user_id', input.userId)
      .eq('game_id', input.gameId)
      .eq('mode', input.mode)
      .eq('difficulty', difficulty)
      .eq('date_key', dateKey)
      .maybeSingle<{ id: string }>()
    : Promise.resolve({ data: null, error: null });

  const [countResult, playedResult] = await Promise.all([countQuery, playedQuery]);
  if (countResult.error) {
    throw countResult.error;
  }
  if (playedResult.error) {
    throw playedResult.error;
  }

  if (input.mode === 'chaos' || (input.mode === 'daily' && difficulty === CHAOS_DIFFICULTY)) {
    const { data, error } = await supabase
      .from('solo_quiz_attempts')
      .select('id, user_id, total_items, completed_items, elapsed_seconds, wrong_guesses, result, updated_at, profiles(username, display_name)')
      .eq('game_id', input.gameId)
      .eq('mode', input.mode)
      .eq('difficulty', difficulty)
      .eq('date_key', dateKey)
      .order('completed_items', { ascending: false })
      .order('elapsed_seconds', { ascending: true })
      .order('wrong_guesses', { ascending: true })
      .order('updated_at', { ascending: true })
      .limit(input.limit ?? 25)
      .returns<SoloAttemptRow[]>();

    if (error) {
      throw error;
    }

    return {
      entries: (data ?? []).map((entry) => ({
        id: entry.id,
        userId: entry.user_id,
        username: entry.profiles?.username ?? 'unknown',
        displayName: entry.profiles?.display_name || entry.profiles?.username || 'Unknown player',
        completionTimeSeconds: entry.elapsed_seconds,
        itemTimeSeconds: entry.completed_items > 0 ? Math.round((entry.elapsed_seconds / entry.completed_items) * 100) / 100 : 0,
        wrongGuesses: entry.wrong_guesses,
        completedItems: entry.completed_items,
        totalItems: entry.total_items,
        result: entry.result,
        completedAt: entry.updated_at,
      })),
      playedCount: countResult.count ?? 0,
      hasPlayed: Boolean(playedResult.data),
    };
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('solo_quiz_leaderboard_entries')
    .select('id, user_id, completion_time_seconds, item_time_seconds, wrong_guesses, completed_at, profiles(username, display_name)')
    .eq('game_id', input.gameId)
    .eq('mode', input.mode)
    .eq('difficulty', difficulty)
    .eq('date_key', dateKey)
    .order('completion_time_seconds', { ascending: true })
    .order('wrong_guesses', { ascending: true })
    .order('completed_at', { ascending: true })
    .limit(input.limit ?? 25)
    .returns<SoloLeaderboardRow[]>();

  if (error) {
    throw error;
  }

  return {
    entries: (data ?? []).map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      username: entry.profiles?.username ?? 'unknown',
      displayName: entry.profiles?.display_name || entry.profiles?.username || 'Unknown player',
      completionTimeSeconds: entry.completion_time_seconds,
      itemTimeSeconds: entry.item_time_seconds,
      wrongGuesses: entry.wrong_guesses,
      completedItems: 0,
      totalItems: 0,
      result: 'completed',
      completedAt: entry.completed_at,
    })),
    playedCount: countResult.count ?? 0,
    hasPlayed: Boolean(playedResult.data),
  };
}

export async function startSoloQuizAttempt(input: {
  userId: string;
  gameId: SoloQuizGameId;
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  dateKey?: string;
}) {
  if (!isLeaderboardMode(input.mode)) {
    return { started: false, alreadyPlayed: false };
  }

  const difficulty = input.mode === 'chaos' ? CHAOS_DIFFICULTY : input.difficulty;
  const dateKey = input.dateKey ?? getSoloQuizDateKey();
  const supabase = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from('solo_quiz_attempts')
    .select('id')
    .eq('user_id', input.userId)
    .eq('game_id', input.gameId)
    .eq('mode', input.mode)
    .eq('difficulty', difficulty)
    .eq('date_key', dateKey)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return { started: false, alreadyPlayed: true };
  }

  const { error } = await supabase
    .from('solo_quiz_attempts')
    .insert({
      user_id: input.userId,
      game_id: input.gameId,
      mode: input.mode,
      difficulty,
      date_key: dateKey,
    });

  if (error) {
    throw error;
  }

  return { started: true, alreadyPlayed: false };
}

export async function finishSoloQuizAttempt(input: {
  userId: string;
  gameId: SoloQuizGameId;
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  itemIds: string[];
  completedItems: number;
  elapsedSeconds: number;
  wrongGuesses: number;
  result: 'completed' | 'failed' | 'abandoned';
  dateKey?: string;
}) {
  if (!isLeaderboardMode(input.mode)) {
    return;
  }

  const difficulty = input.mode === 'chaos' ? CHAOS_DIFFICULTY : input.difficulty;
  const itemCount = Math.max(0, input.itemIds.length);
  const completedItems = Math.max(0, Math.min(itemCount || input.completedItems, Math.floor(input.completedItems)));
  const elapsedSeconds = Math.max(0, Math.floor(input.elapsedSeconds));
  const wrongGuesses = Math.max(0, Math.floor(input.wrongGuesses));
  const { error } = await getSupabaseServiceClient()
    .from('solo_quiz_attempts')
    .update({
      total_items: itemCount,
      item_ids: input.itemIds,
      completed_items: completedItems,
      elapsed_seconds: elapsedSeconds,
      wrong_guesses: wrongGuesses,
      result: input.result,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', input.userId)
    .eq('game_id', input.gameId)
    .eq('mode', input.mode)
    .eq('difficulty', difficulty)
    .eq('date_key', input.dateKey ?? getSoloQuizDateKey());

  if (error) {
    throw error;
  }
}

export async function recordSoloLeaderboardEntry(input: {
  userId: string;
  gameId: SoloQuizGameId;
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  itemIds: string[];
  completionTimeSeconds: number;
  wrongGuesses: number;
  dateKey?: string;
}) {
  if (!isLeaderboardMode(input.mode)) {
    return null;
  }

  if (input.mode === 'chaos') {
    return null;
  }

  const itemCount = Math.max(1, input.itemIds.length);
  const completionTimeSeconds = Math.max(0, Math.floor(input.completionTimeSeconds));
  const wrongGuesses = Math.max(0, Math.floor(input.wrongGuesses));
  const itemTimeSeconds = Math.round((completionTimeSeconds / itemCount) * 100) / 100;

  const { data, error } = await getSupabaseServiceClient()
    .from('solo_quiz_leaderboard_entries')
    .upsert({
      user_id: input.userId,
      game_id: input.gameId,
      mode: input.mode,
      difficulty: input.difficulty,
      date_key: input.dateKey ?? getSoloQuizDateKey(),
      item_count: itemCount,
      item_ids: input.itemIds,
      completion_time_seconds: completionTimeSeconds,
      item_time_seconds: itemTimeSeconds,
      wrong_guesses: wrongGuesses,
      completed_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,game_id,mode,difficulty,date_key',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data;
}

export function forceAllModifiers<TModifierState extends Record<string, boolean>>(modifiers: TModifierState) {
  return Object.fromEntries(Object.keys(modifiers).map((modifierId) => [modifierId, modifierId !== 'confirmEntry'])) as TModifierState;
}
