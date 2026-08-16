export type RiftboundSaleFinish = 'normal' | 'foil';

export type RiftboundInventoryMetadata = {
  card_id: string;
  finish: RiftboundSaleFinish;
  acquisition_date: string | null;
  acquisition_cost_cents: number | null;
  sale_price_cents: number | null;
  updated_at: string;
};

export type RiftboundSaleItem = {
  id: string;
  card_id: string;
  finish: RiftboundSaleFinish;
  quantity: number;
  sale_price_cents: number;
  acquisition_date: string | null;
  acquisition_cost_cents: number | null;
};

export type RiftboundSale = {
  id: string;
  sold_at: string;
  subtotal_cents: number;
  adjustment_cents: number;
  total_cents: number;
  created_at: string;
  items: RiftboundSaleItem[];
};

export type RiftboundSaleInputItem = {
  cardId: string;
  finish: RiftboundSaleFinish;
  quantity: number;
  salePriceCents: number;
  acquisitionDate: string | null;
  acquisitionCostCents: number | null;
};

export function formatRiftboundCents(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
}

export function formatRiftboundSaleDate(value: string, includeTime = false) {
  const date = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}

export function getRiftboundSaleLabel(saleId: string) {
  return `RB-${saleId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function parseRiftboundCurrencyCents(value: string, fallback = 0) {
  const normalized = value.trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round(parsed * 100);
  return cents <= 100_000_000 ? cents : null;
}
