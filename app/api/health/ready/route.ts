import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
};

function hasSharedRateLimitConfiguration() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return Boolean(redisUrl && redisToken);
}

export const GET = withApiMetrics('/api/health/ready', async function GET() {
  const checks: Record<string, 'ok' | 'failed' | 'not_required'> = {
    configuration: 'ok',
    supabase: 'failed',
    sharedRateLimit: 'not_required',
  };

  const hasSupabaseConfiguration = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!hasSupabaseConfiguration) {
    checks.configuration = 'failed';
  }

  const requiresSharedRateLimit = process.env.NODE_ENV === 'production'
    && process.env.RATE_LIMIT_REQUIRE_SHARED !== 'false';
  if (requiresSharedRateLimit) {
    checks.sharedRateLimit = hasSharedRateLimitConfiguration() ? 'ok' : 'failed';
  }

  if (hasSupabaseConfiguration) {
    try {
      const { error } = await getSupabaseServiceClient()
        .from('profiles')
        .select('id')
        .limit(1);
      if (!error) {
        checks.supabase = 'ok';
      }
    } catch {
      checks.supabase = 'failed';
    }
  }

  const ready = Object.values(checks).every((status) => status === 'ok' || status === 'not_required');
  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      checks,
    },
    { status: ready ? 200 : 503, headers: noStoreHeaders },
  );
});
