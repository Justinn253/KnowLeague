import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/profile/discord/unlink', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .update({
        discord_username: null,
        discord_user_id: null,
        discord_avatar_url: null,
        discord_banner_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      const errorText = error.message.toLowerCase();
      if (errorText.includes('discord_banner_url')) {
        const { error: fallbackError } = await getSupabaseServiceClient()
          .from('profile_private_details')
          .update({
            discord_username: null,
            discord_user_id: null,
            discord_avatar_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        if (fallbackError) {
          throw fallbackError;
        }
      } else if (error.code === 'PGRST204' || errorText.includes('discord_user_id') || errorText.includes('discord_avatar_url')) {
        const { error: fallbackError } = await getSupabaseServiceClient()
          .from('profile_private_details')
          .update({
            discord_username: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        if (fallbackError) {
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
