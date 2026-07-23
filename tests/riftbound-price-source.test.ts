import { describe, expect, it } from 'vitest';
import type { RiftboundCard } from '@/lib/riftbound';
import { buildRiftboundPriceSnapshotRows, type RiftboundTcgPriceMap } from '@/lib/riftbound-price-source';

function card(overrides: Partial<RiftboundCard>): RiftboundCard {
  return {
    id: 'OGN-001',
    displayName: 'Test Card',
    name: 'Test Card',
    fullName: 'Test Card',
    setCode: 'OGN',
    setName: 'Origins',
    collectorNumber: '001',
    printedTotal: 298,
    numberLabel: '001/298',
    rarity: 'Common',
    energyCost: 1,
    powerCost: 1,
    might: 1,
    cardType: 'Unit',
    cardTypeLabels: ['Unit'],
    tags: [],
    domains: ['Calm'],
    productDetails: 'Test details',
    imageUrl: 'https://example.com/card.png',
    sourceUrl: 'https://example.com/card',
    artist: null,
    hasErrata: false,
    marketPrice: null,
    marketPriceUpdatedAt: null,
    marketPriceCurrency: 'USD',
    marketPrices: { normal: null, foil: null, updatedAt: null },
    finishOptions: ['normal', 'foil'],
    defaultFinish: 'normal',
    ...overrides,
  };
}

describe('Riftbound price snapshots', () => {
  it('uses live source cents and preserves explicit source status', () => {
    const prices: RiftboundTcgPriceMap = new Map([
      ['OGN:001', new Map([['normal', 1234], ['foil', null]])],
    ]);

    const rows = buildRiftboundPriceSnapshotRows([card({})], prices);

    expect(rows).toEqual([
      { card_id: 'OGN-001', finish: 'normal', price_cents: 1234, capture_status: 'live' },
      { card_id: 'OGN-001', finish: 'foil', price_cents: null, capture_status: 'no_market_price' },
    ]);
  });

  it('uses the generated catalogue only when the source cannot match a print', () => {
    const rows = buildRiftboundPriceSnapshotRows([card({ marketPrices: { normal: 0.22, foil: null, updatedAt: null } })], new Map());

    expect(rows[0]).toMatchObject({ price_cents: 22, capture_status: 'catalog_fallback' });
    expect(rows[1]).toMatchObject({ price_cents: null, capture_status: 'source_unmatched' });
  });
});
