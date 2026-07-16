import { NextResponse } from 'next/server';
import { getMasteryMasterProfile, isRiotPlatformRoute } from '@/lib/riot-account-viewer';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerCache, setServerCache } from '@/lib/server-memory-cache';

export const runtime = 'nodejs';

const rateLimitWindowMs = Number(process.env.RIOT_MASTERY_GAME_RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitRequests = Number(process.env.RIOT_MASTERY_GAME_RATE_LIMIT_REQUESTS ?? 12);
const cacheTtlMs = Number(process.env.RIOT_MASTERY_GAME_CACHE_TTL_MS ?? 2 * 60_000);
type MasteryProfile = Awaited<ReturnType<typeof getMasteryMasterProfile>>;

const inFlightProfiles = new Map<string, Promise<MasteryProfile>>();

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not configured')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  return 400;
}

function loadProfile(cacheKey: string, riotId: string, platform: Parameters<typeof getMasteryMasterProfile>[1]) {
  const existingRequest = inFlightProfiles.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = getMasteryMasterProfile(riotId, platform).then((profile) => {
    setServerCache(cacheKey, profile, cacheTtlMs);
    return profile;
  });
  inFlightProfiles.set(cacheKey, request);
  const clearRequest = () => {
    if (inFlightProfiles.get(cacheKey) === request) inFlightProfiles.delete(cacheKey);
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  try {
    const url = new URL(request.url);
    const riotId = url.searchParams.get('riotId')?.trim() ?? '';
    const platform = (url.searchParams.get('platform') ?? 'NA1').trim().toUpperCase();
    if (!riotId) return NextResponse.json({ error: 'riotId is required.' }, { status: 400 });
    if (!isRiotPlatformRoute(platform)) return NextResponse.json({ error: 'platform is invalid.' }, { status: 400 });

    const rateLimit = checkRateLimit({
      key: `riot-mastery-game:${clientIp}`,
      limit: rateLimitRequests,
      windowMs: rateLimitWindowMs,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many mastery lookups. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const cacheKey = `riot-mastery-game:${platform}:${riotId.toLowerCase()}`;
    const cached = getServerCache<MasteryProfile>(cacheKey);
    const profile = cached ?? await loadProfile(cacheKey, riotId, platform);
    return NextResponse.json(profile, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-KnowLeague-Cache': cached ? 'HIT' : 'MISS',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load mastery data.';
    return NextResponse.json({ error: message }, { status: getErrorStatus(error) });
  }
}
