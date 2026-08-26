type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export const MAX_API_BODY_BYTES = 4 * 1024 * 1024;

export type ApiRouteRateLimitPolicy = {
  scope: string;
  ip: RateLimitRule;
  subject?: RateLimitRule;
  errorMessage: string;
};

type DualRateLimitRule = {
  ip: RateLimitRule;
  subject: RateLimitRule;
};

export const ABUSE_RATE_LIMITS: Record<string, RateLimitRule | DualRateLimitRule> = {
  // These two buckets are applied by middleware to every API route. They are
  // deliberately generous enough for normal page loads and multiplayer
  // heartbeats while bounding scraping and mutation floods.
  apiRead: {
    ip: { limit: 600, windowMs: 60_000 },
    subject: { limit: 300, windowMs: 60_000 },
  },
  apiWrite: {
    ip: { limit: 180, windowMs: 60_000 },
    subject: { limit: 120, windowMs: 60_000 },
  },
  lobbyCreate: {
    ip: { limit: 8, windowMs: 60_000 },
    subject: { limit: 4, windowMs: 60_000 },
  },
  lobbyJoin: {
    ip: { limit: 30, windowMs: 60_000 },
    subject: { limit: 15, windowMs: 60_000 },
  },
  lobbyChat: {
    ip: { limit: 30, windowMs: 10_000 },
    subject: { limit: 12, windowMs: 10_000 },
  },
  friendMessage: {
    ip: { limit: 24, windowMs: 10_000 },
    subject: { limit: 6, windowMs: 10_000 },
  },
  friendRequest: {
    ip: { limit: 24, windowMs: 10 * 60_000 },
    subject: { limit: 10, windowMs: 10 * 60_000 },
  },
  signup: {
    ip: { limit: 5, windowMs: 60 * 60 * 1_000 },
    subject: { limit: 3, windowMs: 60 * 60 * 1_000 },
  },
  passwordReset: {
    ip: { limit: 10, windowMs: 60 * 60 * 1_000 },
    subject: { limit: 3, windowMs: 60 * 60 * 1_000 },
  },
  emailDeliveryCooldown: {
    ip: { limit: 5, windowMs: 60_000 },
    subject: { limit: 1, windowMs: 60_000 },
  },
  emailDelivery: {
    ip: { limit: 10, windowMs: 60 * 60 * 1_000 },
    subject: { limit: 3, windowMs: 60 * 60 * 1_000 },
  },
  publicProfile: { limit: 60, windowMs: 60_000 },
  publicLeaderboard: { limit: 90, windowMs: 60_000 },
  leaderboardSubmission: {
    ip: { limit: 12, windowMs: 60_000 },
    subject: { limit: 6, windowMs: 60_000 },
  },
  friendSearch: {
    ip: { limit: 60, windowMs: 60_000 },
    subject: { limit: 30, windowMs: 60_000 },
  },
  anonymousGameSubmission: { limit: 30, windowMs: 60_000 },
  gameAction: {
    ip: { limit: 120, windowMs: 60_000 },
    subject: { limit: 60, windowMs: 60_000 },
  },
  accountWrite: {
    ip: { limit: 120, windowMs: 60_000 },
    subject: { limit: 60, windowMs: 60_000 },
  },
  communityWrite: {
    ip: { limit: 60, windowMs: 60_000 },
    subject: { limit: 30, windowMs: 60_000 },
  },
  expensiveRead: { limit: 60, windowMs: 60_000 },
  publicDiscovery: { limit: 120, windowMs: 60_000 },
  privilegedRead: {
    ip: { limit: 30, windowMs: 60_000 },
    subject: { limit: 30, windowMs: 60_000 },
  },
  privilegedWrite: {
    ip: { limit: 30, windowMs: 60_000 },
    subject: { limit: 15, windowMs: 60_000 },
  },
  cron: { limit: 5, windowMs: 60_000 },
};

export function getDualRateLimit(name: keyof typeof ABUSE_RATE_LIMITS) {
  const rule = ABUSE_RATE_LIMITS[name];
  if ('subject' in rule) {
    return rule;
  }
  throw new Error(`${name} is not a dual rate limit.`);
}

export function getIpRateLimit(name: keyof typeof ABUSE_RATE_LIMITS) {
  const rule = ABUSE_RATE_LIMITS[name];
  if ('limit' in rule) {
    return rule;
  }
  throw new Error(`${name} is not an IP-only rate limit.`);
}

function getPolicy(name: keyof typeof ABUSE_RATE_LIMITS, scope: string, errorMessage: string): ApiRouteRateLimitPolicy {
  const rule = ABUSE_RATE_LIMITS[name];
  if ('subject' in rule) {
    return { scope, ip: rule.ip, subject: rule.subject, errorMessage };
  }

  return { scope, ip: rule, errorMessage };
}

function isMutation(method: string) {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

/**
 * Coarse route-family limits applied in middleware before a handler runs.
 * Scopes intentionally contain no dynamic path segments or user input.
 */
export function getApiRouteRateLimitPolicy(pathname: string, method: string): ApiRouteRateLimitPolicy | null {
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === 'POST' && (
    pathname === '/api/skindle/stats'
    || pathname === '/api/splash-scramble/stats'
    || /^\/api\/splash-scramble\/skins\/[^/]+\/solves$/.test(pathname)
  )) {
    return getPolicy('anonymousGameSubmission', 'api:anonymous-game-submission', 'Too many game result submissions. Please try again shortly.');
  }

  if (normalizedMethod === 'POST' && (
    pathname === '/api/solo-quiz/attempt'
    || /^\/api\/(?:category-clash|carving-revelation|skincognito)\/lobbies\/[^/]+\/(?:submit|draw|guess|give-up|next-round|next-round-vote|power-up|actions|skin|spectator|promote|visibility|kick|leave|make-host|return|settings|start|name)$/.test(pathname)
    || /^\/api\/multiplayer\/lobbies\/[^/]+\/(?:kick|leave|make-host|return|settings|start|name)$/.test(pathname)
  )) {
    return getPolicy('gameAction', 'api:game-action', 'Too many game actions. Please try again shortly.');
  }

  if (isMutation(normalizedMethod) && (
    pathname === '/api/achievements'
    || pathname === '/api/profile/preferences'
    || pathname === '/api/profile/player-game-stats'
    || pathname === '/api/profile/sound-settings'
    || pathname === '/api/profile/discord/start'
    || pathname === '/api/profile/discord/unlink'
    || pathname === '/api/splash-scramble/state'
    || pathname === '/api/riftbound/binders'
    || pathname === '/api/riftbound/decks'
    || pathname === '/api/riftbound/inventory'
    || pathname === '/api/riftbound/profile'
    || pathname === '/api/riftbound/profile/preferences'
  )) {
    return getPolicy('accountWrite', 'api:account-write', 'Too many account updates. Please try again shortly.');
  }

  if (isMutation(normalizedMethod) && (
    pathname === '/api/friends/messages/read'
    || /^\/api\/friends\/[^/]+$/.test(pathname)
    || /^\/api\/friends\/requests\/[^/]+$/.test(pathname)
    || pathname === '/api/riftbound/community/posts'
    || pathname === '/api/riftbound/community/report'
    || /^\/api\/riftbound\/community\/posts\/[^/]+(?:\/.*)?$/.test(pathname)
    || pathname === '/api/riftbound/shared-decks'
    || /^\/api\/riftbound\/shared-decks\/[^/]+\/reaction$/.test(pathname)
    || /^\/api\/users\/[^/]+\/block$/.test(pathname)
  )) {
    return getPolicy('communityWrite', 'api:community-write', 'Too many social actions. Please try again shortly.');
  }

  if (normalizedMethod === 'GET' && (
    pathname.startsWith('/api/riot-account/')
    || pathname === '/api/health/ready'
    || pathname === '/api/riftbound/collection/value-history'
  )) {
    return getPolicy('expensiveRead', 'api:expensive-read', 'Too many resource-intensive requests. Please try again shortly.');
  }

  if (normalizedMethod === 'GET' && /^\/api\/(?:category-clash|carving-revelation|multiplayer|skincognito)\/lobbies\/public$/.test(pathname)) {
    return getPolicy('publicDiscovery', 'api:public-discovery', 'Too many lobby discovery requests. Please try again shortly.');
  }

  if (pathname.startsWith('/api/staff/') || pathname.startsWith('/api/moderation/') || pathname.startsWith('/api/admin/')) {
    return getPolicy(isMutation(normalizedMethod) ? 'privilegedWrite' : 'privilegedRead', `api:privileged:${isMutation(normalizedMethod) ? 'write' : 'read'}`, 'Too many privileged API requests. Please try again shortly.');
  }

  if (pathname.startsWith('/api/cron/')) {
    return getPolicy('cron', 'api:cron', 'Too many scheduled-job requests. Please try again shortly.');
  }

  return null;
}
