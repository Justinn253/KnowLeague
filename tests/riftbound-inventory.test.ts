import { describe, expect, it } from 'vitest';
import { getRiftboundInventoryChanges, rebaseRiftboundInventoryDraft, type RiftboundInventoryItem } from '@/lib/riftbound-inventory';

function row(card_id: string, quantity: number, finish: RiftboundInventoryItem['finish'] = 'normal'): RiftboundInventoryItem {
  return { card_id, finish, quantity, updated_at: '2026-08-03T00:00:00.000Z' };
}

describe('Riftbound inventory draft rebasing', () => {
  it('preserves server rows omitted by a stale local snapshot', () => {
    const serverRows = [row('session-one-card', 2), row('session-two-card', 3), row('session-three-card', 4)];
    const savedRows = [row('session-one-card', 2)];
    const draftRows = [row('session-one-card', 2), row('new-card', 1)];

    const rebasedRows = rebaseRiftboundInventoryDraft(serverRows, draftRows, savedRows);
    expect(rebasedRows).toHaveLength(4);
    expect(rebasedRows.slice(0, 3)).toEqual(serverRows);
    expect(rebasedRows[3]).toMatchObject({ card_id: 'new-card', finish: 'normal', quantity: 1 });
  });

  it('replays intentional removals against the latest quantity', () => {
    const serverRows = [row('card-a', 5), row('card-b', 2)];
    const savedRows = [row('card-a', 3), row('card-b', 2)];
    const draftRows = [row('card-a', 1), row('card-b', 2)];

    expect(rebaseRiftboundInventoryDraft(serverRows, draftRows, savedRows)).toEqual([
      row('card-a', 3),
      row('card-b', 2),
    ]);
    expect(getRiftboundInventoryChanges(savedRows, draftRows)).toEqual([
      { cardId: 'card-a', finish: 'normal', delta: -2 },
    ]);
  });

  it('keeps both server and local copies for legacy drafts without a baseline', () => {
    const serverRows = [row('existing-card', 4)];
    const legacyDraftRows = [row('existing-card', 2), row('local-card', 3)];

    expect(rebaseRiftboundInventoryDraft(serverRows, legacyDraftRows, null)).toEqual([
      row('existing-card', 4),
      row('local-card', 3),
    ]);
  });
});
