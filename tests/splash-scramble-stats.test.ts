import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { getSplashScrambleDailyStats, recordSplashScrambleSolve } from '../lib/splash-scramble-stats';

describe('Splash Scramble daily stats', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('reads an aggregate-only snapshot from the service-only RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ date_key: '2026-11-06', correct_solves: '18' }],
      error: null,
    });

    await expect(getSplashScrambleDailyStats('2026-11-06')).resolves.toEqual({
      dateKey: '2026-11-06',
      correctSolves: 18,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_splash_scramble_daily_stats', { p_date_key: '2026-11-06' });
  });

  it('hashes the browser identifier before sending an idempotent solve request', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        date_key: '2026-11-06',
        correct_solves: 19,
        accepted: true,
        client_already_solved: false,
      }],
      error: null,
    });

    await expect(recordSplashScrambleSolve({ dateKey: '2026-11-06', clientId: 'client-123' })).resolves.toEqual({
      snapshot: { dateKey: '2026-11-06', correctSolves: 19 },
      accepted: true,
      clientAlreadySolved: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_splash_scramble_daily_solve', {
      p_date_key: '2026-11-06',
      p_client_hash: createHash('sha256').update('client-123').digest('hex'),
    });
  });
});
