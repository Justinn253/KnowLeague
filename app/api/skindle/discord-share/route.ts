import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getDailyDateKey } from '@/lib/game-storage';
import { getDailySkindleTarget } from '@/lib/skindle-daily';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type DiscordShareBody = {
  guessCount?: unknown;
  progressRows?: unknown;
  solvedSkinId?: unknown;
};

type DiscordProfileLinkRow = {
  discord_user_id: string | null;
};

type DiscordSkindleShareSettingsRow = {
  channel_id: string;
};

function getDiscordGuildId() {
  const guildId = process.env.DISCORD_GUILD_ID?.trim() ?? '';
  if (!/^[0-9]{17,20}$/.test(guildId)) {
    throw new ApiError(503, 'Discord server configuration is unavailable.');
  }
  return guildId;
}

function parseProgressRows(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ApiError(400, 'Provide one to 100 completed Skindle progress rows.');
  }
  const rows = value.map((row) => {
    if (typeof row !== 'string' || !/^[gyb]{9}$/.test(row)) {
      throw new ApiError(400, 'Skindle progress is invalid.');
    }
    return row;
  });
  return rows;
}

export const POST = withApiMetrics('/api/skindle/discord-share', async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await readJsonBody<DiscordShareBody>(request);
    const guessCount = body.guessCount;
    if (typeof guessCount !== 'number' || !Number.isInteger(guessCount) || !guessCount || guessCount > 100) {
      throw new ApiError(400, 'Skindle guess count is invalid.');
    }
    const progressRows = parseProgressRows(body.progressRows);
    if (progressRows.length !== guessCount) {
      throw new ApiError(400, 'Skindle progress must include every guess.');
    }
    if (typeof body.solvedSkinId !== 'string' || body.solvedSkinId.length === 0 || body.solvedSkinId.length > 128) {
      throw new ApiError(400, 'Completed Skindle answer is invalid.');
    }
    if (getDailySkindleTarget()?.id !== body.solvedSkinId) {
      throw new ApiError(400, 'Daily Skindle completion could not be verified.');
    }

    const guildId = getDiscordGuildId();
    const supabase = getSupabaseServiceClient();
    const [profileResult, settingsResult] = await Promise.all([
      supabase
        .from('profile_private_details')
        .select('discord_user_id')
        .eq('user_id', user.id)
        .maybeSingle<DiscordProfileLinkRow>(),
      supabase
        .from('discord_skindle_share_settings')
        .select('channel_id')
        .eq('guild_id', guildId)
        .maybeSingle<DiscordSkindleShareSettingsRow>(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const discordUserId = profileResult.data?.discord_user_id;
    const channelId = settingsResult.data?.channel_id;
    if (!discordUserId || !channelId) {
      return NextResponse.json({ queued: false });
    }

    const { error } = await supabase
      .from('discord_skindle_share_outbox')
      .upsert({
        channel_id: channelId,
        date_key: getDailyDateKey(),
        discord_user_id: discordUserId,
        guess_count: guessCount,
        guild_id: guildId,
        progress_rows: progressRows,
        status: 'pending',
        user_id: user.id,
      }, { onConflict: 'guild_id,user_id,date_key', ignoreDuplicates: true });
    if (error) throw error;

    return NextResponse.json({ queued: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
