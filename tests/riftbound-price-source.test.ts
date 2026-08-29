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
      ['OGN:001', new Map([
        ['normal', { price_cents: 1234, low_price_cents: 1000, high_price_cents: 1500 }],
        ['foil', { price_cents: null, low_price_cents: 900, high_price_cents: 1800 }],
      ])],
    ]);

    const rows = buildRiftboundPriceSnapshotRows([card({})], prices);

    expect(rows).toEqual([
      {
        card_id: 'OGN-001',
        finish: 'normal',
        price_cents: 1234,
        low_price_cents: 1000,
        high_price_cents: 1500,
        capture_status: 'live',
      },
      {
        card_id: 'OGN-001',
        finish: 'foil',
        price_cents: null,
        low_price_cents: 900,
        high_price_cents: 1800,
        capture_status: 'no_market_price',
      },
    ]);
  });

  it('matches the official -STAR catalogue spelling to the source asterisk print key', () => {
    const signatureCard = card({
      id: 'ven-190-star-166',
      setCode: 'VEN',
      collectorNumber: '190-STAR',
      numberLabel: '190-STAR/166',
      finishOptions: ['foil'],
      defaultFinish: 'foil',
    });
    const prices: RiftboundTcgPriceMap = new Map([
      ['VEN:190*', new Map([
        ['foil', { price_cents: 48611, low_price_cents: 44300, high_price_cents: 68055 }],
      ])],
    ]);

    expect(buildRiftboundPriceSnapshotRows([signatureCard], prices)).toEqual([{
      card_id: 'ven-190-star-166',
      finish: 'foil',
      price_cents: 48611,
      low_price_cents: 44300,
      high_price_cents: 68055,
      capture_status: 'live',
    }]);
  });

  it('prefers exact TCGCSV source product prices for duplicate promo print numbers', () => {
    const promo = card({
      id: 'opp-662881',
      setCode: 'OPP',
      sourceProductId: 662881,
      collectorNumber: '246',
      numberLabel: '246/298',
      finishOptions: ['foil'],
      defaultFinish: 'foil',
    });
    const prices: RiftboundTcgPriceMap = new Map([
      ['OPP:product:662881', new Map([
        ['foil', { price_cents: 12345, low_price_cents: 11000, high_price_cents: 15000 }],
      ])],
      ['OPP:246', new Map([
        ['foil', { price_cents: 999, low_price_cents: 900, high_price_cents: 1200 }],
      ])],
    ]);

    expect(buildRiftboundPriceSnapshotRows([promo], prices)[0].price_cents).toBe(12345);
  });
  it('uses the generated catalogue only when the source cannot match a print', () => {
    const rows = buildRiftboundPriceSnapshotRows([card({ marketPrices: { normal: 0.22, foil: null, updatedAt: null } })], new Map());

    expect(rows[0]).toMatchObject({ price_cents: 22, low_price_cents: null, high_price_cents: null, capture_status: 'catalog_fallback' });
    expect(rows[1]).toMatchObject({ price_cents: null, low_price_cents: null, high_price_cents: null, capture_status: 'source_unmatched' });
  });
});
