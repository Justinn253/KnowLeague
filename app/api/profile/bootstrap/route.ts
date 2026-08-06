import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  normalizeDetailedGameStats,
  normalizePlayerGameStatsByGame,
  type DetailedGameStats,
  type PlayerGameStatsByGame,
} from '@/lib/game-storage';
import { getAuthenticatedAppRole } from '@/lib/moderation';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { normalizeUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';

export const runtime = 'nodejs';

type ProfileBootstrapRow = {
  sound_settings: UiSoundSettings | null;
  player_game_stats: PlayerGameStatsByGame | null;
  player_game_stats_reset_at: Record<string, string> | null;
  detailed_game_stats: DetailedGameStats | null;
  detailed_game_stats_reset_at: Record<string, string> | null;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const [role, privateDetailsResult] = await Promise.all([
      getAuthenticatedAppRole(user),
      getSupabaseServiceClient()
        .from('profile_private_details')
        .select('sound_settings, player_game_stats, player_game_stats_reset_at, detailed_game_stats, detailed_game_stats_reset_at')
        .eq('user_id', user.id)
        .maybeSingle<ProfileBootstrapRow>(),
    ]);

    if (privateDetailsResult.error) {
      throw privateDetailsResult.error;
    }

    const privateDetails = privateDetailsResult.data;
    return NextResponse.json({
      role,
      soundSettings: privateDetails?.sound_settings
        ? normalizeUiSoundSettings(privateDetails.sound_settings)
        : null,
      playerGameStats: normalizePlayerGameStatsByGame(privateDetails?.player_game_stats),
      playerGameStatsResetAt: privateDetails?.player_game_stats_reset_at ?? {},
      detailedGameStats: normalizeDetailedGameStats(privateDetails?.detailed_game_stats),
      detailedGameStatsResetAt: privateDetails?.detailed_game_stats_reset_at ?? {},
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
