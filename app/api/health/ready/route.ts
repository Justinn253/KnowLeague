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
    augments: 'failed',
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
      const db = getSupabaseServiceClient();
      const [supabaseProbe, augmentFeedProbe, augmentRatingsProbe] = await Promise.all([
        db.from('profiles').select('id').limit(1),
        db.rpc('custom_augment_community_feed', {
          p_sort: 'newest',
          p_query: '',
          p_offset: 0,
          p_limit: 1,
        }),
        db.rpc('custom_augment_ratings', { p_ids: [] }),
      ]);
      if (!supabaseProbe.error) {
        checks.supabase = 'ok';
      }
      if (!augmentFeedProbe.error && !augmentRatingsProbe.error) {
        checks.augments = 'ok';
      }
    } catch {
      checks.supabase = 'failed';
      checks.augments = 'failed';
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
