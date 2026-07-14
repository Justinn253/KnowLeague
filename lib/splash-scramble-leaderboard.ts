import { getDailyDateKey } from '@/lib/game-storage';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

const MAX_LEADERBOARD_ENTRIES = 50;
const SCORE_BASE = 250_000;
const MOVE_SCORE_PENALTY = 250;
const TIME_SCORE_PENALTY = 25;

export type SplashScrambleLeaderboardEntry = {
  id: string;
  userId: string;
  position: number;
  username: string;
  displayName: string;
  chatColor: string;
  moves: number;
  completionTimeSeconds: number;
  completionScore: number;
  completedAt: string;
};

export type SplashScrambleLeaderboardSnapshot = {
  entries: SplashScrambleLeaderboardEntry[];
  currentUserEntry: SplashScrambleLeaderboardEntry | null;
};

type SplashScrambleLeaderboardRow = {
  entry_id: string;
  user_id: string;
  rank_position: number;
  username: string;
  display_name: string;
  chat_color: string;
  moves: number;
  completion_time_seconds: number;
  completion_score: number;
  completed_at: string;
};

function normalizeNonNegativeInteger(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function toEntry(row: SplashScrambleLeaderboardRow): SplashScrambleLeaderboardEntry {
  return {
    id: row.entry_id,
    userId: row.user_id,
    position: row.rank_position,
    username: row.username,
    displayName: row.display_name || row.username,
    chatColor: row.chat_color || 'amber',
    moves: row.moves,
    completionTimeSeconds: row.completion_time_seconds,
    completionScore: row.completion_score,
    completedAt: row.completed_at,
  };
}

export function calculateSplashScrambleCompletionScore(moves: number, completionTimeSeconds: number) {
  const normalizedMoves = normalizeNonNegativeInteger(moves);
  const normalizedTime = normalizeNonNegativeInteger(completionTimeSeconds);
  return Math.max(0, SCORE_BASE - normalizedMoves * MOVE_SCORE_PENALTY - normalizedTime * TIME_SCORE_PENALTY);
}

export async function getSplashScrambleDailyLeaderboard(input: { userId?: string | null; dateKey?: string }): Promise<SplashScrambleLeaderboardSnapshot> {
  const { data, error } = await getSupabaseServiceClient()
    .rpc('get_splash_scramble_daily_leaderboard', {
      p_date_key: input.dateKey ?? getDailyDateKey(),
      p_user_id: input.userId ?? null,
      p_limit: MAX_LEADERBOARD_ENTRIES,
    })
    .returns<SplashScrambleLeaderboardRow[]>();

  if (error) {
    throw error;
  }

  const rows = ((data as SplashScrambleLeaderboardRow[] | null) ?? []).map(toEntry);
  return {
    entries: rows.filter((entry) => entry.position <= MAX_LEADERBOARD_ENTRIES),
    currentUserEntry: input.userId ? rows.find((entry) => entry.userId === input.userId) ?? null : null,
  };
}

export async function recordSplashScrambleDailyLeaderboardEntry(input: {
  userId: string;
  moves: number;
  completionTimeSeconds: number;
  dateKey?: string;
}) {
  const moves = normalizeNonNegativeInteger(input.moves);
  const completionTimeSeconds = normalizeNonNegativeInteger(input.completionTimeSeconds);
  const completionScore = calculateSplashScrambleCompletionScore(moves, completionTimeSeconds);
  const { data, error } = await getSupabaseServiceClient()
    .from('splash_scramble_daily_leaderboard_entries')
    .upsert({
      user_id: input.userId,
      date_key: input.dateKey ?? getDailyDateKey(),
      moves,
      completion_time_seconds: completionTimeSeconds,
      completion_score: completionScore,
      completed_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,date_key',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return {
    recorded: Boolean(data),
    completionScore,
  };
}
