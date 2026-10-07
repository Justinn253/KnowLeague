import { describe, expect, it } from 'vitest';
import {
  calculateTokenRankMovement,
  getRiotTokenLeaderboardNextRefreshAt,
  getRiotTokenLeaderboardScheduleKey,
} from '@/lib/riot-token-leaderboards';

describe('Riot token leaderboard scheduling', () => {
  it('uses the shared 5pm Eastern generation boundary with DST-aware offsets', () => {
    expect(getRiotTokenLeaderboardScheduleKey(new Date('2026-10-01T20:59:59.000Z'))).toBe('2026-09-30');
    expect(getRiotTokenLeaderboardScheduleKey(new Date('2026-10-01T21:00:00.000Z'))).toBe('2026-10-01');
    expect(getRiotTokenLeaderboardScheduleKey(new Date('2026-11-01T21:59:59.000Z'))).toBe('2026-10-31');
    expect(getRiotTokenLeaderboardScheduleKey(new Date('2026-11-01T22:00:00.000Z'))).toBe('2026-11-01');
    expect(getRiotTokenLeaderboardNextRefreshAt('2026-11-01')).toBe('2026-11-02T22:00:00.000Z');
  });

  it('reports positive movement for a rise and negative movement for a fall', () => {
    expect(calculateTokenRankMovement(4, 9)).toBe(5);
    expect(calculateTokenRankMovement(9, 4)).toBe(-5);
    expect(calculateTokenRankMovement(4, null)).toBeNull();
  });
});
