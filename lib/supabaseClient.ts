import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LeaderboardEntry = {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
};

let client: SupabaseClient | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseClient() {
  if (!client) {
    client = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    );
  }

  return client;
}

export async function getLeaderboard() {
  const { data, error } = await getSupabaseClient()
    .from('leaderboard')
    .select('*')
    .order('score', { ascending: false })
    .limit(20)
    .returns<LeaderboardEntry[]>();

  if (error) {
    throw error;
  }

  return data;
}
