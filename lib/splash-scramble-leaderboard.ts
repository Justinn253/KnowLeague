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

type SplashScrambleLeaderboardEntryRecord = {
  id: string;
  user_id: string;
  moves: number;
  completion_time_seconds: number;
  completion_score: number;
  completed_at: string;
};

type SplashScrambleLeaderboardProfileRecord = {
  id: string;
  username: string;
  display_name: string | null;
  chat_color: string | null;
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

function toSnapshot(rows: SplashScrambleLeaderboardRow[], userId: string | null | undefined): SplashScrambleLeaderboardSnapshot {
  const entries = rows.map(toEntry);

  return {
    entries: entries.filter((entry) => entry.position <= MAX_LEADERBOARD_ENTRIES),
    currentUserEntry: userId ? entries.find((entry) => entry.userId === userId) ?? null : null,
  };
}

async function getLeaderboardFromTable(dateKey: string, userId: string | null | undefined) {
  const supabase = getSupabaseServiceClient();
  const { data: entryData, error: entryError } = await supabase
    .from('splash_scramble_daily_leaderboard_entries')
    .select('id, user_id, moves, completion_time_seconds, completion_score, completed_at')
    .eq('date_key', dateKey);

  if (entryError) {
    throw entryError;
  }

  const records = (entryData as SplashScrambleLeaderboardEntryRecord[] | null) ?? [];
  const userIds = Array.from(new Set(records.map((record) => record.user_id)));
  if (userIds.length === 0) {
    return toSnapshot([], userId);
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, chat_color')
    .in('id', userIds);

  if (profileError) {
    throw profileError;
  }

  const profiles = new Map(
    ((profileData as SplashScrambleLeaderboardProfileRecord[] | null) ?? [])
      .map((profile) => [profile.id, profile]),
  );
  const rankedRows = records
    .flatMap((record) => {
      const profile = profiles.get(record.user_id);
      if (!profile) {
        return [];
      }

      return [{
        entry_id: record.id,
        user_id: record.user_id,
        rank_position: 0,
        username: profile.username,
        display_name: profile.display_name ?? profile.username,
        chat_color: profile.chat_color ?? 'amber',
        moves: record.moves,
        completion_time_seconds: record.completion_time_seconds,
        completion_score: record.completion_score,
        completed_at: record.completed_at,
      }];
    })
    .sort((left, right) => (
      right.completion_score - left.completion_score
      || left.moves - right.moves
      || left.completion_time_seconds - right.completion_time_seconds
      || left.completed_at.localeCompare(right.completed_at)
    ))
    .map((row, index) => ({ ...row, rank_position: index + 1 }));

  return toSnapshot(rankedRows, userId);
}

export function calculateSplashScrambleCompletionScore(moves: number, completionTimeSeconds: number) {
  const normalizedMoves = normalizeNonNegativeInteger(moves);
  const normalizedTime = normalizeNonNegativeInteger(completionTimeSeconds);
  return Math.max(0, SCORE_BASE - normalizedMoves * MOVE_SCORE_PENALTY - normalizedTime * TIME_SCORE_PENALTY);
}

export async function getSplashScrambleDailyLeaderboard(input: { userId?: string | null; dateKey?: string }): Promise<SplashScrambleLeaderboardSnapshot> {
  const dateKey = input.dateKey ?? getDailyDateKey();
  const userId = input.userId ?? null;
  const { data, error } = await getSupabaseServiceClient()
    .rpc('get_splash_scramble_daily_leaderboard', {
      p_date_key: dateKey,
      p_user_id: userId,
      p_limit: MAX_LEADERBOARD_ENTRIES,
    })
    .returns<SplashScrambleLeaderboardRow[]>();

  if (error) {
    try {
      return await getLeaderboardFromTable(dateKey, userId);
    } catch {
      throw error;
    }
  }

  return toSnapshot((data as SplashScrambleLeaderboardRow[] | null) ?? [], userId);
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
