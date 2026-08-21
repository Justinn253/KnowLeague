import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type SkindleTopGuess = {
  skinId: string;
  answer: string;
  count: number;
};

export type SkindleDailyStatsSnapshot = {
  dateKey: string;
  totalGuesses: number;
  correctGuesses: number;
  averageGuessesToSolve: number;
  topGuesses: SkindleTopGuess[];
  guessesBySkin: Record<string, number>;
};

export type RecordSkindleGuessInput = {
  dateKey: string;
  clientId: string;
  skinId: string;
  answer: string;
  isCorrect: boolean;
};

export type RecordSkindleGuessResult = {
  snapshot: SkindleDailyStatsSnapshot;
  accepted: boolean;
  firstForSkin: boolean;
  clientAlreadySolved: boolean;
};

type SupabaseStatsRow = {
  date_key?: string;
  total_guesses?: number | string;
  correct_guesses?: number | string;
  average_guesses_to_solve?: number | string;
  top_guesses?: unknown;
  guesses_by_skin?: unknown;
  accepted?: boolean;
  first_for_skin?: boolean;
  client_already_solved?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTopGuesses(value: unknown): SkindleTopGuess[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.skinId !== 'string' || typeof entry.answer !== 'string') {
      return [];
    }

    return [{
      skinId: entry.skinId,
      answer: entry.answer,
      count: toFiniteNumber(entry.count),
    }];
  });
}

function toGuessesBySkin(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([skinId, count]) => {
      const numericCount = toFiniteNumber(count, -1);
      return numericCount >= 0 ? [[skinId, numericCount]] : [];
    }),
  );
}

function getFirstRow(data: unknown): SupabaseStatsRow {
  if (Array.isArray(data)) {
    return isRecord(data[0]) ? data[0] as SupabaseStatsRow : {};
  }

  return isRecord(data) ? data as SupabaseStatsRow : {};
}

function toSnapshot(row: SupabaseStatsRow, fallbackDateKey: string): SkindleDailyStatsSnapshot {
  return {
    dateKey: typeof row.date_key === 'string' ? row.date_key : fallbackDateKey,
    totalGuesses: toFiniteNumber(row.total_guesses),
    correctGuesses: toFiniteNumber(row.correct_guesses),
    averageGuessesToSolve: toFiniteNumber(row.average_guesses_to_solve),
    topGuesses: toTopGuesses(row.top_guesses),
    guessesBySkin: toGuessesBySkin(row.guesses_by_skin),
  };
}

async function callStatsRpc<T extends SupabaseStatsRow>(functionName: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabaseServiceClient().rpc(functionName, args);
  if (error) {
    throw error;
  }

  return getFirstRow(data) as T;
}

export async function getSkindleDailyStats(dateKey: string, includeTopGuesses = true): Promise<SkindleDailyStatsSnapshot> {
  const row = await callStatsRpc('get_skindle_daily_stats', {
    p_date_key: dateKey,
    p_include_top_guesses: includeTopGuesses,
  });

  return toSnapshot(row, dateKey);
}

export async function recordSkindleGuess(input: RecordSkindleGuessInput): Promise<RecordSkindleGuessResult> {
  const row = await callStatsRpc('record_skindle_guess', {
    p_date_key: input.dateKey,
    p_client_id: input.clientId,
    p_skin_id: input.skinId,
    p_answer: input.answer,
    p_is_correct: input.isCorrect,
  });

  return {
    snapshot: toSnapshot(row, input.dateKey),
    accepted: row.accepted === true,
    firstForSkin: row.first_for_skin === true,
    clientAlreadySolved: row.client_already_solved === true,
  };
}
