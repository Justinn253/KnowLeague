export const RIFTBOUND_MOCK_SET_CODES = ['OGN', 'SFD', 'UNL', 'VEN', 'RAD'] as const;
export type RiftboundMockSetCode = typeof RIFTBOUND_MOCK_SET_CODES[number];

type TcgCsvGroup = {
  abbreviation?: string;
  groupId: number;
};

type TcgCsvProduct = {
  name?: string;
  productId: number;
};

type TcgCsvPrice = {
  marketPrice?: number | null;
  productId: number;
  subTypeName?: string;
};

type TcgCsvResponse<T> = {
  results?: T[];
};

export type RiftboundMockBoxPriceRow = {
  box_market_cents: number;
  set_code: RiftboundMockSetCode;
  source_product_id: number;
  source_product_name: string;
};

const TCGCSV_CATEGORY_ID = 89;
const TCGCSV_BASE_URL = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY_ID}`;
const TCGCSV_LAST_UPDATED_URL = 'https://tcgcsv.com/last-updated.txt';
const REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_ATTEMPTS = 3;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(url: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': 'KnowLeague Riftbound mock box price snapshot' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Price source returned ${response.status} ${response.statusText} for ${url}.`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await wait(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch price source URL ${url}.`);
}

async function fetchJson<T>(url: string) {
  const response = await fetchResponse(url);
  return response.json() as Promise<T>;
}

async function fetchText(url: string) {
  const response = await fetchResponse(url);
  return response.text();
}

function normalizeProductName(value: string | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function boxProductRank(product: TcgCsvProduct) {
  const name = normalizeProductName(product.name);
  if (/\bbooster display\b/.test(name)) return 3;
  if (/\bbooster box\b/.test(name)) return 2;
  if (/\bbooster\b/.test(name) && /\b24\b/.test(name)) return 1;
  return 0;
}

function getMarketCents(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents > 0 && cents <= 10_000_000 ? cents : null;
}

function normalizeWeekStart(snapshotDate: string) {
  const date = new Date(`${snapshotDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('The price source returned an invalid snapshot date.');
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

/**
 * Reads the existing TCGCSV TCGplayer-market feed and selects each set's
 * 24-pack Booster Display/Box. This runs only from the weekly trusted cron,
 * never from an interactive browser request.
 */
export async function fetchRiftboundMockBoxPriceSnapshot() {
  const [groupResponse, snapshotText] = await Promise.all([
    fetchJson<TcgCsvResponse<TcgCsvGroup>>(`${TCGCSV_BASE_URL}/groups`),
    fetchText(TCGCSV_LAST_UPDATED_URL),
  ]);
  const sourceSnapshotAt = new Date(snapshotText.trim());
  if (Number.isNaN(sourceSnapshotAt.getTime())) {
    throw new Error('The price source returned an invalid snapshot timestamp.');
  }

  const groups = (groupResponse.results ?? []).flatMap((group) => {
    const setCode = String(group.abbreviation ?? '').toUpperCase();
    return (RIFTBOUND_MOCK_SET_CODES as readonly string[]).includes(setCode)
      ? [{ group, setCode: setCode as RiftboundMockSetCode }]
      : [];
  });

  const resolvedRows = await Promise.all(groups.map(async ({ group, setCode }) => {
    const [productResponse, priceResponse] = await Promise.all([
      fetchJson<TcgCsvResponse<TcgCsvProduct>>(`${TCGCSV_BASE_URL}/${group.groupId}/products`),
      fetchJson<TcgCsvResponse<TcgCsvPrice>>(`${TCGCSV_BASE_URL}/${group.groupId}/prices`),
    ]);
    const marketPriceByProductId = new Map<number, number>();
    for (const price of priceResponse.results ?? []) {
      const marketCents = getMarketCents(price.marketPrice);
      if (marketCents === null) continue;
      const subtype = normalizeProductName(price.subTypeName);
      // Sealed products normally expose the default/normal subtype. Prefer it
      // over any incidental variant price while retaining a usable fallback.
      if (!marketPriceByProductId.has(price.productId) || subtype === 'normal') {
        marketPriceByProductId.set(price.productId, marketCents);
      }
    }

    const selectedProduct = (productResponse.results ?? [])
      .map((product) => ({ product, rank: boxProductRank(product), marketCents: marketPriceByProductId.get(product.productId) ?? null }))
      .filter((candidate) => candidate.rank > 0 && candidate.marketCents !== null)
      .sort((left, right) => right.rank - left.rank || left.product.productId - right.product.productId)[0];

    if (!selectedProduct || selectedProduct.marketCents === null || !selectedProduct.product.name) return null;
    return {
      set_code: setCode,
      source_product_id: selectedProduct.product.productId,
      source_product_name: selectedProduct.product.name,
      box_market_cents: selectedProduct.marketCents,
    } satisfies RiftboundMockBoxPriceRow;
  }));

  const rows = resolvedRows.filter((row): row is RiftboundMockBoxPriceRow => row !== null);
  if (rows.length === 0) {
    throw new Error('The price source did not return any Riftbound booster box market prices.');
  }

  return {
    rows,
    sourceSnapshotAt: sourceSnapshotAt.toISOString(),
    // The weekly price period is governed by the scheduled Monday capture,
    // not by an upstream feed timestamp that could be a few hours stale.
    weekStart: normalizeWeekStart(new Date().toISOString().slice(0, 10)),
  };
}
