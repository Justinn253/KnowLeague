import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DiscordBotConfig } from './config.js';

let cachedClient: SupabaseClient | null = null;
let cachedClientKey: string | null = null;

export function createBotServiceClient(config: DiscordBotConfig) {
  const clientKey = `${config.supabaseUrl}\u0000${config.supabaseServiceRoleKey}`;
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient;
  }

  cachedClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  cachedClientKey = clientKey;
  return cachedClient;
}
