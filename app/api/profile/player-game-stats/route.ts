import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  mergeDetailedGameStats,
  mergePlayerGameStats,
  normalizeDetailedGameStats,
  normalizePlayerGameStatsByGame,
  STREAK_GAME_IDS,
  type PlayerGameStatsByGame,
  type DetailedGameStats,
} from '@/lib/game-storage';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type PlayerGameStatsRow = {
  player_game_stats: PlayerGameStatsByGame | null;
  detailed_game_stats: DetailedGameStats | null;
};

type PlayerGameStatsBody = {
  stats: PlayerGameStatsByGame;
  detailedStats?: DetailedGameStats;
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
      .select('player_game_stats, detailed_game_stats')
      .eq('user_id', userId)
      .maybeSingle<PlayerGameStatsRow>();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      stats: normalizePlayerGameStatsByGame(data?.player_game_stats),
      detailedStats: normalizeDetailedGameStats(data?.detailed_game_stats),
    });
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
      .select('player_game_stats, detailed_game_stats')
      .eq('user_id', userId)
      .maybeSingle<PlayerGameStatsRow>();

    if (loadError) {
      throw loadError;
    }

    const stats = mergeStatsByGame(normalizePlayerGameStatsByGame(existing?.player_game_stats), incomingStats);
    const detailedStats = body.detailedStats === undefined
      ? normalizeDetailedGameStats(existing?.detailed_game_stats)
      : mergeDetailedGameStats(normalizeDetailedGameStats(existing?.detailed_game_stats), body.detailedStats);
    const { error } = await supabase
      .from('profile_private_details')
      .upsert({
        user_id: userId,
        player_game_stats: stats,
        detailed_game_stats: detailedStats,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return NextResponse.json({ stats, detailedStats });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
