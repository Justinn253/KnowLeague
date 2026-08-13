const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });

const relativeUnits = [
  { unit: 'year' as const, milliseconds: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month' as const, milliseconds: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week' as const, milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day' as const, milliseconds: 24 * 60 * 60 * 1000 },
  { unit: 'hour' as const, milliseconds: 60 * 60 * 1000 },
  { unit: 'minute' as const, milliseconds: 60 * 1000 },
  { unit: 'second' as const, milliseconds: 1000 },
] as const;

export function formatRelativeTime(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const difference = timestamp - now;
  if (Math.abs(difference) < 60_000) return difference > 0 ? 'in less than a minute' : 'just now';

  const unit = relativeUnits.find(({ milliseconds }) => Math.abs(difference) >= milliseconds) ?? relativeUnits[relativeUnits.length - 1];
  const amount = Math.round(difference / unit.milliseconds);
  return relativeTimeFormatter.format(amount, unit.unit);
}
