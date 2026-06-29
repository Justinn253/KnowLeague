import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function assertState(state: unknown) {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid splash scramble state.');
  }

  const serialized = JSON.stringify(state);
  if (serialized.length > 200_000) {
    throw new Error('Splash scramble state is too large.');
  }

  return state;
}

function assertStats(stats: unknown) {
  if (!stats || typeof stats !== 'object') {
    throw new Error('Invalid splash scramble stats.');
  }

  const serialized = JSON.stringify(stats);
  if (serialized.length > 50_000) {
    throw new Error('Splash scramble stats are too large.');
  }

  return stats;
}

function getSplashScrambleErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected API error.';
  if (message.includes('Authentication is required')) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (message.includes('splash_scramble_states')) {
    return NextResponse.json({ error: 'Splash Scramble profile storage is not available. Run the latest Supabase migrations.' }, { status: 503 });
  }

  return getRouteErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { data, error } = await getSupabaseServiceClient()
      .from('splash_scramble_states')
      .select('state, stats')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ state: data?.state ?? null, stats: data?.stats ?? null });
  } catch (error) {
    return getSplashScrambleErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json() as { state?: unknown; stats?: unknown };
    const supabase = getSupabaseServiceClient();
    const { data: existing, error: loadError } = await supabase
      .from('splash_scramble_states')
      .select('state, stats')
      .eq('user_id', userId)
      .maybeSingle();

    if (loadError) {
      throw loadError;
    }

    const payload: { user_id: string; updated_at: string; state: unknown | null; stats: unknown } = {
      user_id: userId,
      updated_at: new Date().toISOString(),
      state: existing?.state ?? null,
      stats: existing?.stats ?? {},
    };

    if ('state' in body) {
      payload.state = body.state === null ? null : assertState(body.state);
    }

    if ('stats' in body) {
      payload.stats = assertStats(body.stats);
    }

    if (!('state' in payload) && !('stats' in payload)) {
      throw new Error('No splash scramble data was provided.');
    }

    const { error } = await getSupabaseServiceClient()
      .from('splash_scramble_states')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    return getSplashScrambleErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { error } = await getSupabaseServiceClient()
      .from('splash_scramble_states')
      .update({
        state: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return getSplashScrambleErrorResponse(error);
  }
}
