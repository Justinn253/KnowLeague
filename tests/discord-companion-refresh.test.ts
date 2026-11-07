import { describe, expect, it } from 'vitest';
import { getFishingDashboardRefreshDelay, getMiningDashboardRefreshDelay } from '@/lib/discord-companion-refresh';

const now = Date.parse('2026-11-07T12:00:00.000Z');

describe('Discord companion dashboard refresh scheduling', () => {
  it('refreshes Mining only at a server-authoritative transition or while a prompt is scheduled', () => {
    expect(getMiningDashboardRefreshDelay(null, now)).toBeNull();
    expect(getMiningDashboardRefreshDelay({
      event: null,
      miningStartedAt: '2026-11-07T12:00:10.000Z',
      phase: 'descending',
      returnsAt: null,
    }, now)).toBe(10_750);
    expect(getMiningDashboardRefreshDelay({
      event: { status: 'scheduled' },
      miningStartedAt: '2026-11-07T12:00:00.000Z',
      phase: 'mining',
      returnsAt: null,
    }, now)).toBe(15_000);
    expect(getMiningDashboardRefreshDelay({
      event: { expiresAt: '2026-11-07T12:00:05.000Z', status: 'active' },
      miningStartedAt: '2026-11-07T12:00:00.000Z',
      phase: 'mining',
      returnsAt: null,
    }, now)).toBe(5_750);
    expect(getMiningDashboardRefreshDelay({
      event: null,
      miningStartedAt: '2026-11-07T12:00:00.000Z',
      phase: 'returning',
      returnsAt: '2026-11-07T12:00:02.000Z',
    }, now)).toBe(2_750);
  });

  it('waits for Fishing settlement, then retries only while a due voyage remains active', () => {
    expect(getFishingDashboardRefreshDelay([], now)).toBeNull();
    expect(getFishingDashboardRefreshDelay([
      { completesAt: '2026-11-07T12:00:30.000Z' },
      { completesAt: '2026-11-07T12:00:10.000Z' },
    ], now)).toBe(15_750);
    expect(getFishingDashboardRefreshDelay([{ completesAt: '2026-11-07T11:59:59.000Z' }], now)).toBe(5_000);
  });
});
