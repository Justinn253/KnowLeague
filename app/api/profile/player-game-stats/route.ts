import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  mergePlayerGameStats,
  normalizePlayerGameStatsByGame,
  STREAK_GAME_IDS,
  type PlayerGameStatsByGame,
} from '@/lib/game-storage';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type PlayerGameStatsRow = {
  player_game_stats: PlayerGameStatsByGame | null;
};

type PlayerGameStatsBody = {
  stats: PlayerGameStatsByGame;
};

function mergeStatsByGame(left: PlayerGameStatsByGame, right: PlayerGameStatsByGame): PlayerGameStatsByGame {
  return Object.fromEntries(STREAK_GAME_IDS.flatMap((gameId) => {
    const leftStats = left[gameId];
    const rightStats = right[gameId];
    return leftStats || rightStats ? [[gameId, mergePlayerGameStats(gameId, leftStats, rightStats)]] : [];
  }));
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { data, error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .select('player_game_stats')
      .eq('user_id', userId)
      .maybeSingle<PlayerGameStatsRow>();

    if (error) {
      throw error;
    }

    return NextResponse.json({ stats: normalizePlayerGameStatsByGame(data?.player_game_stats) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<PlayerGameStatsBody>(request);
    const incomingStats = normalizePlayerGameStatsByGame(body.stats);
    const supabase = getSupabaseServiceClient();
    const { data: existing, error: loadError } = await supabase
      .from('profile_private_details')
      .select('player_game_stats')
      .eq('user_id', userId)
      .maybeSingle<PlayerGameStatsRow>();

    if (loadError) {
      throw loadError;
    }

    const stats = mergeStatsByGame(normalizePlayerGameStatsByGame(existing?.player_game_stats), incomingStats);
    const { error } = await supabase
      .from('profile_private_details')
      .upsert({
        user_id: userId,
        player_game_stats: stats,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return NextResponse.json({ stats });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
