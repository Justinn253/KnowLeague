import { describe, expect, it } from 'vitest';
import { formatRiftboundCents, formatRiftboundSaleDate, getRiftboundSaleLabel, parseRiftboundCurrencyCents } from '@/lib/riftbound-sales';

describe('Riftbound sales formatting and currency parsing', () => {
  it('parses currency input to bounded cents', () => {
    expect(parseRiftboundCurrencyCents('12.34')).toBe(1234);
    expect(parseRiftboundCurrencyCents('')).toBe(0);
    expect(parseRiftboundCurrencyCents('1000000.01')).toBeNull();
    expect(parseRiftboundCurrencyCents('-1.00')).toBeNull();
  });

  it('formats receipt values and stable sale labels', () => {
    expect(formatRiftboundCents(1250)).toBe('$12.50');
    expect(getRiftboundSaleLabel('12345678-aaaa-bbbb-cccc-1234567890ab')).toBe('RB-12345678');
    expect(formatRiftboundSaleDate('2026-08-14')).toContain('Aug');
  });
});
