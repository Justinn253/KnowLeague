const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONE_WEEK_IN_SECONDS = 7 * ONE_DAY_IN_SECONDS;
const THIRTY_DAYS_IN_SECONDS = 30 * ONE_DAY_IN_SECONDS;

/**
 * Generated catalogue data changes only when a new application deployment ships.
 * Keep a short browser lifetime for recoverability and a longer CDN lifetime to
 * avoid repeatedly invoking the route for the same catalogue.
 */
export const GENERATED_CATALOG_CACHE_CONTROL = [
  'public',
  `max-age=${ONE_DAY_IN_SECONDS}`,
  `s-maxage=${ONE_WEEK_IN_SECONDS}`,
  `stale-while-revalidate=${THIRTY_DAYS_IN_SECONDS}`,
].join(', ');

export function getSecondsUntilNextUtcDay(now = new Date()): number {
  const nextUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(1, Math.ceil((nextUtcDay - now.getTime()) / 1000));
}

/**
 * Daily quiz sets are deterministic for a UTC day. Do not use stale-while-
 * revalidate here: serving yesterday's quiz after the reset would be incorrect.
 */
export function getDailyQuizCacheControl(now = new Date()): string {
  const secondsUntilReset = getSecondsUntilNextUtcDay(now);

  return [
    'public',
    `max-age=${secondsUntilReset}`,
    `s-maxage=${secondsUntilReset}`,
    'must-revalidate',
  ].join(', ');
}
