type RateLimitRule = {
  limit: number;
  windowMs: number;
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
