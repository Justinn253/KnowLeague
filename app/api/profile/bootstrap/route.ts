import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  normalizePlayerGameStatsByGame,
  type PlayerGameStatsByGame,
} from '@/lib/game-storage';
import { getAuthenticatedAppRole } from '@/lib/moderation';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { normalizeUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';

export const runtime = 'nodejs';

type ProfileBootstrapRow = {
  sound_settings: UiSoundSettings | null;
  player_game_stats: PlayerGameStatsByGame | null;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const [role, privateDetailsResult] = await Promise.all([
      getAuthenticatedAppRole(user),
      getSupabaseServiceClient()
        .from('profile_private_details')
        .select('sound_settings, player_game_stats')
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
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
