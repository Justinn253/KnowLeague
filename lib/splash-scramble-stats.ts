import { createHash } from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type SplashScrambleDailyStatsSnapshot = {
  dateKey: string;
  correctSolves: number;
};

export type RecordSplashScrambleSolveInput = {
  dateKey: string;
  clientId: string;
};

export type RecordSplashScrambleSolveResult = {
  snapshot: SplashScrambleDailyStatsSnapshot;
  accepted: boolean;
  clientAlreadySolved: boolean;
};

type SplashScrambleStatsRow = {
  date_key?: string;
  correct_solves?: number | string;
  accepted?: boolean;
  client_already_solved?: boolean;
};

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFirstRow(data: unknown): SplashScrambleStatsRow {
  if (Array.isArray(data)) {
    return (data[0] ?? {}) as SplashScrambleStatsRow;
  }

  return (data ?? {}) as SplashScrambleStatsRow;
}

function toSnapshot(row: SplashScrambleStatsRow, fallbackDateKey: string): SplashScrambleDailyStatsSnapshot {
  return {
    dateKey: typeof row.date_key === 'string' ? row.date_key : fallbackDateKey,
    correctSolves: toFiniteNumber(row.correct_solves),
  };
}

function hashClientId(clientId: string) {
  // The aggregate only needs a stable daily deduplication key. Persisting a
  // one-way value avoids storing the browser's convenience identifier.
  return createHash('sha256').update(clientId).digest('hex');
}

async function callStatsRpc(functionName: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabaseServiceClient().rpc(functionName, args);
  if (error) {
    throw error;
  }

  return getFirstRow(data);
}

export async function getSplashScrambleDailyStats(dateKey: string): Promise<SplashScrambleDailyStatsSnapshot> {
  const row = await callStatsRpc('get_splash_scramble_daily_stats', { p_date_key: dateKey });
  return toSnapshot(row, dateKey);
}

export async function recordSplashScrambleSolve(input: RecordSplashScrambleSolveInput): Promise<RecordSplashScrambleSolveResult> {
  const row = await callStatsRpc('record_splash_scramble_daily_solve', {
    p_date_key: input.dateKey,
    p_client_hash: hashClientId(input.clientId),
  });

  return {
    snapshot: toSnapshot(row, input.dateKey),
    accepted: row.accepted === true,
    clientAlreadySolved: row.client_already_solved === true,
  };
}
