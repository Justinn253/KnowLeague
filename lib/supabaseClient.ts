import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getLeaderboard() {
  const { data, error } = await supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(20);
  if (error) {
    throw error;
  }
  return data;
}
