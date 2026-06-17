import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LeaderboardEntry = {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
};

let browserClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    );
  }

  return browserClient;
}

export function getSupabaseServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return serviceClient;
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
