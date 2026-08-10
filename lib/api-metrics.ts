import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const METRICS_PREFIX = 'knowleague:api-metrics:v1';
const METRICS_BUCKET_MS = 60 * 60 * 1_000;
const METRICS_RETENTION_SECONDS = 35 * 24 * 60 * 60;
const MAX_LOOKBACK_HOURS = 168;

export const apiMetricsConfigured = Boolean(redis);

export type ApiMetricDurationBucket = 'under-50ms' | '50-199ms' | '200-999ms' | '1-4.9s' | '5s-plus';

export type ApiMetricRouteSummary = {
  route: string;
  methods: Record<string, number>;
  totalRequests: number;
  clientErrors: number;
  serverErrors: number;
  durationBuckets: Record<ApiMetricDurationBucket, number>;
};

export type ApiMetricSummary = {
  configured: boolean;
  generatedAt: string;
  windowHours: number;
  totalRequests: number;
  clientErrors: number;
  serverErrors: number;
  routes: ApiMetricRouteSummary[];
};

const API_METRIC_DURATION_BUCKETS: readonly ApiMetricDurationBucket[] = [
  'under-50ms',
  '50-199ms',
  '200-999ms',
  '1-4.9s',
  '5s-plus',
];

type ApiRouteHandler<TRequest extends Request, TContext> = (
  request: TRequest,
  context: TContext,
) => Response | Promise<Response>;

function getStatusBucket(status: number) {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'other';
}

function getDurationBucket(durationMs: number): ApiMetricDurationBucket {
  if (durationMs < 50) return 'under-50ms';
  if (durationMs < 200) return '50-199ms';
  if (durationMs < 1_000) return '200-999ms';
  if (durationMs < 5_000) return '1-4.9s';
  return '5s-plus';
}

function getBucketStart(timestamp = Date.now()) {
  return Math.floor(timestamp / METRICS_BUCKET_MS) * METRICS_BUCKET_MS;
}

function getMetricKey(timestamp = Date.now()) {
  return `${METRICS_PREFIX}:${getBucketStart(timestamp)}`;
}

export async function recordApiMetric(route: string, method: string, status: number, durationMs: number) {
  if (!redis) return;

  const field = [route, method, getStatusBucket(status), getDurationBucket(durationMs)].join('|');
  const key = getMetricKey();
  try {
    await redis
      .pipeline()
      .hincrby(key, field, 1)
      .expire(key, METRICS_RETENTION_SECONDS)
      .exec();
  } catch {
    // Metrics must never change the result or availability of an application API.
  }
}

export function withApiMetrics<TRequest extends Request, TResponse extends Response>(
  route: string,
  handler: (request: TRequest) => TResponse | Promise<TResponse>,
): (request: TRequest) => Promise<TResponse>;
export function withApiMetrics<TRequest extends Request, TContext, TResponse extends Response>(
  route: string,
  handler: ApiRouteHandler<TRequest, TContext>,
): (request: TRequest, context: TContext) => Promise<TResponse>;
export function withApiMetrics<TRequest extends Request, TContext>(
  route: string,
  handler: (request: TRequest, context?: TContext) => Response | Promise<Response>,
) {
  return async (request: TRequest, context?: TContext) => {
    const startedAt = Date.now();
    try {
      const response = await handler(request, context);
      void recordApiMetric(route, request.method, response.status, Date.now() - startedAt);
      return response;
    } catch (error) {
      void recordApiMetric(route, request.method, 500, Date.now() - startedAt);
      throw error;
    }
  };
}

function createEmptyDurationBuckets(): Record<ApiMetricDurationBucket, number> {
  return {
    'under-50ms': 0,
    '50-199ms': 0,
    '200-999ms': 0,
    '1-4.9s': 0,
    '5s-plus': 0,
  };
}

function createRouteSummary(route: string): ApiMetricRouteSummary {
  return {
    route,
    methods: {},
    totalRequests: 0,
    clientErrors: 0,
    serverErrors: 0,
    durationBuckets: createEmptyDurationBuckets(),
  };
}

export async function getApiMetricSummary(requestedHours = 24): Promise<ApiMetricSummary> {
  const safeRequestedHours = Number.isFinite(requestedHours) ? requestedHours : 24;
  const windowHours = Math.min(MAX_LOOKBACK_HOURS, Math.max(1, Math.floor(safeRequestedHours)));
  const generatedAt = new Date().toISOString();
  if (!redis) {
    return {
      configured: false,
      generatedAt,
      windowHours,
      totalRequests: 0,
      clientErrors: 0,
      serverErrors: 0,
      routes: [],
    };
  }

  const currentBucket = getBucketStart();
  const keys = Array.from({ length: windowHours }, (_, index) => (
    `${METRICS_PREFIX}:${currentBucket - index * METRICS_BUCKET_MS}`
  ));
  const hashes = await Promise.all(keys.map((key) => redis.hgetall<Record<string, string>>(key)));
  const summaries = new Map<string, ApiMetricRouteSummary>();
  let totalRequests = 0;
  let clientErrors = 0;
  let serverErrors = 0;

  hashes.forEach((hash) => {
    Object.entries(hash ?? {}).forEach(([field, rawCount]) => {
      const [route, method, statusBucket, durationBucket] = field.split('|');
      const count = Number(rawCount);
      if (!route || !method || !Number.isFinite(count) || count <= 0) return;
      if (!API_METRIC_DURATION_BUCKETS.includes(durationBucket as ApiMetricDurationBucket)) return;

      const summary = summaries.get(route) ?? createRouteSummary(route);
      summary.methods[method] = (summary.methods[method] ?? 0) + count;
      summary.totalRequests += count;
      summary.durationBuckets[durationBucket as ApiMetricDurationBucket] += count;
      if (statusBucket === '4xx') {
        summary.clientErrors += count;
        clientErrors += count;
      } else if (statusBucket === '5xx') {
        summary.serverErrors += count;
        serverErrors += count;
      }
      totalRequests += count;
      summaries.set(route, summary);
    });
  });

  return {
    configured: true,
    generatedAt,
    windowHours,
    totalRequests,
    clientErrors,
    serverErrors,
    routes: [...summaries.values()].sort((left, right) => right.totalRequests - left.totalRequests),
  };
}
