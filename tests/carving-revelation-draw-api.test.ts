import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARVING_REVELATION_DRAW_MAX_BODY_BYTES,
  CARVING_REVELATION_MAX_DRAW_POINTS,
} from '@/lib/game-api-limits';

const mocks = vi.hoisted(() => ({ draw: vi.fn() }));

vi.mock('@/lib/carving-revelation', () => ({ drawCarvingRevealStroke: mocks.draw }));

import { POST } from '../app/api/carving-revelation/lobbies/[code]/draw/route';

describe('Carving Revelation draw API', () => {
  beforeEach(() => {
    mocks.draw.mockReset();
    mocks.draw.mockResolvedValue({ ok: true });
  });

  it('bounds drawing input before converting points for the rules engine', async () => {
    const response = await POST(new Request('https://knowleague.test/api/carving-revelation/lobbies/ABC123/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'client-123',
        points: Array.from({ length: CARVING_REVELATION_MAX_DRAW_POINTS + 40 }, (_, index) => ({ x: index, y: index })),
      }),
    }), { params: Promise.resolve({ code: 'ABC123' }) });

    expect(response.status).toBe(200);
    expect(mocks.draw).toHaveBeenCalledWith('ABC123', 'client-123', {
      points: Array.from({ length: CARVING_REVELATION_MAX_DRAW_POINTS }, (_, index) => ({ x: index, y: index })),
    });
  });

  it('rejects oversized draw requests before parsing their point list', async () => {
    const response = await POST(new Request('https://knowleague.test/api/carving-revelation/lobbies/ABC123/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(CARVING_REVELATION_DRAW_MAX_BODY_BYTES) }),
    }), { params: Promise.resolve({ code: 'ABC123' }) });

    expect(response.status).toBe(413);
    expect(mocks.draw).not.toHaveBeenCalled();
  });
});
