const MIN_REFRESH_DELAY_MS = 250;
const MINING_TRANSITION_BUFFER_MS = 750;
const MINING_SCHEDULED_EVENT_REFRESH_MS = 15_000;
const FISHING_SETTLEMENT_POLL_MS = 5_000;
const FISHING_SCHEDULER_BUFFER_MS = 750;

type MiningEvent = {
  expiresAt?: string;
  status: 'scheduled' | 'active' | 'resolved' | 'expired';
};

type MiningExpedition = {
  event: MiningEvent | null;
  miningStartedAt: string;
  phase: 'descending' | 'mining' | 'returning';
  returnsAt: string | null;
};

function getTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getTransitionDelay(timestamp: number, now: number) {
  return Math.max(MIN_REFRESH_DELAY_MS, timestamp - now + MINING_TRANSITION_BUFFER_MS);
}

/**
 * Schedules only authoritative state transitions. Mining progression itself
 * remains server-projected; the browser never advances an expedition.
 */
export function getMiningDashboardRefreshDelay(expedition: MiningExpedition | null | undefined, now = Date.now()) {
  if (!expedition) return null;

  if (expedition.phase === 'returning') {
    const returnsAt = getTimestamp(expedition.returnsAt);
    return returnsAt === null ? null : getTransitionDelay(returnsAt, now);
  }

  if (expedition.phase === 'descending') {
    const miningStartedAt = getTimestamp(expedition.miningStartedAt);
    return miningStartedAt === null ? null : getTransitionDelay(miningStartedAt, now);
  }

  if (expedition.event?.status === 'active') {
    const expiresAt = getTimestamp(expedition.event.expiresAt);
    return expiresAt === null ? null : getTransitionDelay(expiresAt, now);
  }

  // Threshold-triggered events do not expose a future timestamp. While the
  // player has the companion open, a small bounded refresh surfaces the
  // persisted prompt before its server-authoritative decision window closes.
  return expedition.event?.status === 'scheduled' ? MINING_SCHEDULED_EVENT_REFRESH_MS : null;
}

type FishingExpedition = { completesAt: string };

/**
 * The Discord bot settles Fishing voyages every five seconds. Refresh once
 * after the earliest due voyage, then retry at that cadence only if the bot
 * has not committed the settlement yet.
 */
export function getFishingDashboardRefreshDelay(expeditions: readonly FishingExpedition[] | null | undefined, now = Date.now()) {
  const dueAt = Math.min(...(expeditions ?? [])
    .map((expedition) => getTimestamp(expedition.completesAt))
    .filter((timestamp): timestamp is number => timestamp !== null));
  if (!Number.isFinite(dueAt)) return null;

  return dueAt <= now
    ? FISHING_SETTLEMENT_POLL_MS
    : Math.max(MIN_REFRESH_DELAY_MS, dueAt - now + FISHING_SCHEDULER_BUFFER_MS + FISHING_SETTLEMENT_POLL_MS);
}
