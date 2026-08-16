import { describe, expect, it } from 'vitest';
import { buildRiftboundMasterSetInventoryMap, getRiftboundMasterSetProgress, groupRiftboundCardsBySet, isRiftboundMasterSetCardAcquired } from '@/lib/riftbound-master-set';
import { buildRiftboundMasterSetShareSnapshot } from '@/lib/riftbound-share-types';

const cards = [
  { id: 'ogn-001', setCode: 'OGN', setName: 'Origins' },
  { id: 'ogn-002', setCode: 'OGN', setName: 'Origins' },
  { id: 'sfd-001', setCode: 'SFD', setName: 'Spiritforged' },
];

describe('Riftbound Master Set progress', () => {
  it('groups catalogue cards by set while preserving catalogue order', () => {
    expect(groupRiftboundCardsBySet(cards)).toEqual([
      { setCode: 'OGN', setName: 'Origins', cards: cards.slice(0, 2) },
      { setCode: 'SFD', setName: 'Spiritforged', cards: [cards[2]] },
    ]);
  });

  it('marks a card acquired when any inventory quantity exists', () => {
    const inventory = new Map([['ogn-001', 2], ['ogn-002', 0]]);
    expect(isRiftboundMasterSetCardAcquired(inventory, 'ogn-001')).toBe(true);
    expect(isRiftboundMasterSetCardAcquired(inventory, 'ogn-002')).toBe(false);
    expect(getRiftboundMasterSetProgress(cards, inventory)).toEqual({ total: 3, acquired: 1, missing: 2, percent: 33 });
  });

  it('combines finish quantities for comparisons and creates a durable share snapshot', () => {
    const inventory = buildRiftboundMasterSetInventoryMap([
      { card_id: 'ogn-001', quantity: 1 },
      { card_id: 'ogn-001', quantity: 2 },
      { card_id: 'ogn-002', quantity: 1 },
    ]);
    const snapshot = buildRiftboundMasterSetShareSnapshot([
      { card_id: 'ogn-001', finish: 'foil', quantity: 1 },
    ], { createdBy: 'Example user', createdAt: '2026-08-15T00:00:00.000Z' });

    expect(inventory.get('ogn-001')).toBe(3);
    expect(snapshot.kind).toBe('master-set');
    expect(snapshot.title).toBe('Master Set');
    expect(snapshot.createdBy).toBe('Example user');
  });
});
