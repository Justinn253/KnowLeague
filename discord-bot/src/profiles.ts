import { createClient } from '@supabase/supabase-js';
import type { DiscordBotConfig } from './config.js';

type LinkedProfile = {
  displayName: string;
  username: string;
};

type DiscordLinkRow = {
  user_id: string;
};

type ProfileRow = {
  display_name: string;
  username: string;
};

function createServiceClient(config: DiscordBotConfig) {
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

export async function findLinkedProfile(config: DiscordBotConfig, discordUserId: string): Promise<LinkedProfile | null> {
  const supabase = createServiceClient(config);
  const { data: link, error: linkError } = await supabase
    .from('profile_private_details')
    .select('user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle<DiscordLinkRow>();

  if (linkError) {
    throw new Error(`Unable to read the Discord account link: ${linkError.message}`);
  }

  if (!link) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', link.user_id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    throw new Error(`Unable to read the linked KnowLeague profile: ${profileError.message}`);
  }

  if (!profile) {
    return null;
  }

  return {
    displayName: profile.display_name,
    username: profile.username,
  };
}
