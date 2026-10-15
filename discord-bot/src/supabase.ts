import { createClient } from '@supabase/supabase-js';
import type { DiscordBotConfig } from './config.js';

export function createBotServiceClient(config: DiscordBotConfig) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
