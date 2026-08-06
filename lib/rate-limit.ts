import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitSource = 'redis' | 'memory' | 'unavailable';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  source: RateLimitSource;
};

type ApiRateLimitOptions = {
  scope: string;
  ip: Omit<RateLimitOptions, 'key'>;
  subject?: {
    id: string | null | undefined;
    limit: number;
    windowMs: number;
  };
  errorMessage?: string;
};

const buckets = new Map<string, RateLimitEntry>();
const limiters = new Map<string, Ratelimit>();
const rateLimitKeySalt = process.env.RATE_LIMIT_KEY_SALT ?? '';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const requireSharedRateLimit = process.env.RATE_LIMIT_REQUIRE_SHARED === 'true'
  || (process.env.NODE_ENV === 'production' && process.env.RATE_LIMIT_REQUIRE_SHARED !== 'false');
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;
  buckets.forEach((entry, key) => {
    if (entry.resetAt <= now) buckets.delete(key);
  });
}

function getMemoryRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: 0,
      source: 'memory',
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      source: 'memory',
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
    source: 'memory',
  };
}

function getSharedLimiter(limit: number, windowMs: number) {
  if (!redis) {
    return null;
  }

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const limiterKey = `${limit}:${windowSeconds}`;
  const existing = limiters.get(limiterKey);
  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(limit, `${windowSeconds} s`),
    prefix: `knowleague:ratelimit:${limiterKey}`,
    analytics: false,
    timeout: 1_000,
  });
  limiters.set(limiterKey, limiter);
  return limiter;
}

function getFallbackIdentifier(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function getDistributedIdentifier(key: string) {
  const value = `${rateLimitKeySalt}:${key}`;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return getFallbackIdentifier(value);
}

export function getClientIp(request: Request) {
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const cloudflareConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return vercelForwardedFor || cloudflareConnectingIp || realIp || forwardedFor || 'unknown';
}

/**
 * Returns a non-sensitive bucket identifier for the bearer token, when one
 * is present. This is useful for middleware-wide protection before a route
 * has authenticated the token and resolved its Supabase user ID.
 */
export async function getRateLimitSubject(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  return token ? `auth:${await getDistributedIdentifier(token)}` : null;
}

/**
 * Uses Upstash/Vercel KV Redis when configured, giving every serverless
 * instance the same bucket. Local memory is only a development fallback;
 * production fails closed unless shared enforcement is explicitly disabled.
 */
export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const limiter = getSharedLimiter(limit, windowMs);
  if (limiter) {
    try {
      const result = await limiter.limit(await getDistributedIdentifier(key));
      return {
        allowed: result.success,
        remaining: Math.max(0, result.remaining),
        resetAt: result.reset,
        retryAfterSeconds: result.success ? 0 : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
        source: 'redis',
      };
    } catch {
      if (requireSharedRateLimit) {
        const resetAt = Date.now() + 60_000;
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfterSeconds: 60,
          source: 'unavailable',
        };
      }
    }
  } else if (requireSharedRateLimit) {
    const resetAt = Date.now() + 60_000;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: 60,
      source: 'unavailable',
    };
  }

  return getMemoryRateLimit({ key, limit, windowMs });
}

export async function enforceApiRateLimit(request: Request, options: ApiRateLimitOptions) {
  const checks: Promise<RateLimitResult>[] = [
    checkRateLimit({
      key: `${options.scope}:ip:${getClientIp(request)}`,
      limit: options.ip.limit,
      windowMs: options.ip.windowMs,
    }),
  ];

  if (options.subject?.id) {
    checks.push(checkRateLimit({
      key: `${options.scope}:subject:${options.subject.id}`,
      limit: options.subject.limit,
      windowMs: options.subject.windowMs,
    }));
  }

  const results = await Promise.all(checks);
  const rejected = results.find((result) => !result.allowed);
  if (!rejected) {
    return null;
  }

  const unavailable = rejected.source === 'unavailable';
  return NextResponse.json(
    {
      error: unavailable
        ? 'Request protection is temporarily unavailable. Please try again shortly.'
        : options.errorMessage ?? `Too many requests. Try again in ${rejected.retryAfterSeconds} seconds.`,
    },
    {
      status: unavailable ? 503 : 429,
      headers: {
        'Retry-After': String(rejected.retryAfterSeconds),
        'X-RateLimit-Limit': String(options.ip.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
