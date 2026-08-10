import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { normalizeUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type SoundSettingsRow = {
  sound_settings: UiSoundSettings | null;
};

type SoundSettingsBody = {
  settings: Partial<UiSoundSettings>;
};

export const GET = withApiMetrics('/api/profile/sound-settings', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { data, error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .select('sound_settings')
      .eq('user_id', userId)
      .maybeSingle<SoundSettingsRow>();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      settings: data?.sound_settings ? normalizeUiSoundSettings(data.sound_settings) : null,
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PUT = withApiMetrics('/api/profile/sound-settings', async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<SoundSettingsBody>(request);
    const settings = normalizeUiSoundSettings(body.settings);
    const { error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .upsert({
        user_id: userId,
        sound_settings: settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
