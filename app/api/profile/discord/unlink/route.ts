import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .update({
        discord_username: null,
        discord_user_id: null,
        discord_avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      if (error.code === 'PGRST204' || error.message.toLowerCase().includes('discord_user_id')) {
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
}
