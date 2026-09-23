// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseServiceClient: () => mocks }));
vi.mock('@/lib/server-log', () => ({ logServerEvent: vi.fn() }));
import { deleteAugment, publishAugment, voteAugment } from '../lib/augment-builder-server';
import { AUGMENT_ICONS, emptyAugment } from '../lib/augment-builder';

const id = '8d73d0ad-3880-4e58-9d5a-20c9674b5bbc';
beforeEach(() => vi.resetAllMocks());
describe('augment persistence boundaries', () => {
  it('rejects invalid content and votes before accessing storage', async () => {
    await expect(publishAugment(emptyAugment(id), null)).rejects.toMatchObject({ status: 400 });
    await expect(publishAugment({ ...emptyAugment(id), icon: AUGMENT_ICONS.find((icon) => icon.rarity === 'silver')?.id ?? '', name: 'Valid title', description: 'Valid effect' }, null)).rejects.toMatchObject({ status: 401 });
    for (const input of [
      { kind: 'tier', value: 1.2 },
      { kind: 'tier', value: 5 },
      { kind: 'reaction', value: 2 },
      { kind: 'reaction', value: '1' },
      null,
    ]) {
      await expect(voteAugment(id, 'user', input)).rejects.toMatchObject({ status: 400 });
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('uses server creator attribution and lets the database assign creation time', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: 'TEST_STOP' } });
    mocks.from.mockReturnValue({ insert });
    await expect(
      publishAugment(
        {
          ...emptyAugment(id),
          name: 'Valid title',
          description: 'Valid effect',
          creator_id: 'spoofed',
          created_at: '2000-01-01',
        },
        'verified-user',
      ),
    ).rejects.toEqual({ code: 'TEST_STOP' });
    expect(insert.mock.calls[0][0]).toMatchObject({ creator_id: 'verified-user', name: 'Valid title' });
    expect(insert.mock.calls[0][0]).not.toHaveProperty('created_at');
  });
  it.each([true, false])('publishes optional details only when enabled: %s', async (enabled) => {
    const insert = vi.fn().mockResolvedValue({ error: { code: 'TEST_STOP' } });
    mocks.from.mockReturnValue({ insert });
    await expect(publishAugment({
      ...emptyAugment(id), name: 'Title', description: 'Effect',
      questRequirements: 'Ten takedowns', questEnabled: enabled,
      restrictions: 'Melee only', restrictionsEnabled: enabled,
      notes: 'Some notes', longDescription: 'In-depth effect',
    }, 'verified-user')).rejects.toEqual({ code: 'TEST_STOP' });
    expect(insert.mock.calls[0][0]).toMatchObject({
      quest_requirements: enabled ? 'Ten takedowns' : '',
      restrictions: enabled ? 'Melee only' : '', notes: 'Some notes', long_description: 'In-depth effect',
    });
  });
  it('constrains deletion to the authenticated owner even with a valid public ID', async () => {
    const chain = { delete: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
    await expect(deleteAugment(id, 'verified-user')).rejects.toMatchObject({ status: 404 });
    expect(chain.eq.mock.calls).toEqual([
      ['id', id],
      ['creator_id', 'verified-user'],
    ]);
  });
});
