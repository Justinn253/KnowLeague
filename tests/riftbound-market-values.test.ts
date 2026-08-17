import { describe, expect, it } from 'vitest';
import { mergeRiftboundCardMarketPrices, RIFTBOUND_CARDS } from '@/lib/riftbound';
import { buildRiftboundLatestPricesPayload } from '@/lib/riftbound-market-values';

describe('Riftbound canonical market values', () => {
  it('returns explicit coverage for every catalogue card and preserves the newest known value', () => {
    const payload = buildRiftboundLatestPricesPayload(RIFTBOUND_CARDS, [
      {
        card_id: 'unl-228-219',
        finish: 'foil',
        snapshot_date: '2026-07-25',
        price_cents: 8555,
        source_snapshot_at: '2026-07-25T20:00:00.000Z',
        captured_at: '2026-07-25T20:00:00.000Z',
      },
      {
        card_id: 'unl-228-219',
        finish: 'foil',
        snapshot_date: '2026-08-02',
        price_cents: null,
        source_snapshot_at: '2026-08-02T20:00:00.000Z',
        captured_at: '2026-08-02T20:00:00.000Z',
      },
      {
        card_id: 'ven-172-166',
        finish: 'foil',
        snapshot_date: '2026-08-01',
        price_cents: 11168,
        source_snapshot_at: '2026-08-01T20:00:00.000Z',
        captured_at: '2026-08-01T20:00:00.000Z',
      },
    ]);

    expect(Object.keys(payload.prices)).toHaveLength(RIFTBOUND_CARDS.length);
    expect(payload.prices['unl-228-219']).toMatchObject({
      foil: 85.55,
      updatedAt: '2026-07-25T20:00:00.000Z',
    });
    expect(payload.prices['ven-172-166']).toMatchObject({ foil: 111.68 });
  });

  it('keeps unresolved card finishes explicit instead of omitting their entries', () => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === 'ven-172-166');
    expect(card).toBeTruthy();

    const payload = buildRiftboundLatestPricesPayload([card!], []);

    expect(payload.prices[card!.id]).toEqual({ normal: null, foil: null, updatedAt: null });
    expect(mergeRiftboundCardMarketPrices(card!, payload.prices[card!.id]).marketPrices.foil)
      .toBe(card!.marketPrices.foil);
  });
});
