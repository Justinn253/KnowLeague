import type { RiftboundCard, RiftboundFinish } from '@/lib/riftbound';

export type RiftboundPriceCaptureStatus = 'live' | 'no_market_price' | 'catalog_fallback' | 'source_unmatched';

export type RiftboundPriceSnapshotRow = {
  card_id: string;
  finish: RiftboundFinish;
  price_cents: number | null;
  capture_status: RiftboundPriceCaptureStatus;
};

type TcgCsvGroup = {
  groupId: number;
  abbreviation?: string;
};

type TcgCsvExtendedData = {
  name?: string;
  value?: string;
};

type TcgCsvProduct = {
  productId: number;
  extendedData?: TcgCsvExtendedData[];
};

type TcgCsvPrice = {
  productId: number;
  subTypeName?: string;
  marketPrice?: number | null;
};

type TcgCsvResponse<T> = {
  results?: T[];
};

export type RiftboundTcgPriceMap = Map<string, Map<RiftboundFinish, number | null>>;

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
        headers: { 'User-Agent': 'KnowLeague Riftbound price snapshot' },
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

function getPrintKeyAliases(setCode: string, collectorNumber: string) {
  const normalizedSetCode = setCode.toUpperCase();
  const normalizedCollectorNumber = collectorNumber.trim().toUpperCase();
  const unpaddedCollectorNumber = normalizedCollectorNumber.replace(/^0+(?=\d)/, '');

  return Array.from(new Set([
    `${normalizedSetCode}:${normalizedCollectorNumber}`,
    `${normalizedSetCode}:${unpaddedCollectorNumber}`,
  ]));
}

function getExtendedDataValue(product: TcgCsvProduct, fieldName: string) {
  const field = (product.extendedData ?? []).find((entry) => String(entry.name).toLowerCase() === fieldName.toLowerCase());
  return typeof field?.value === 'string' ? field.value : null;
}

function getTcgFinishName(value: string | undefined): RiftboundFinish | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'normal') return 'normal';
  if (normalized === 'foil' || normalized === 'holofoil') return 'foil';
  return null;
}

function normalizePriceCents(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function mergePriceMap(target: RiftboundTcgPriceMap, source: RiftboundTcgPriceMap) {
  source.forEach((sourcePrices, printKey) => {
    const targetPrices = target.get(printKey) ?? new Map<RiftboundFinish, number | null>();
    sourcePrices.forEach((price, finish) => {
      if (!targetPrices.has(finish) || price !== null) targetPrices.set(finish, price);
    });
    target.set(printKey, targetPrices);
  });
}

async function fetchGroupPriceMap(group: TcgCsvGroup) {
  const [productResponse, priceResponse] = await Promise.all([
    fetchJson<TcgCsvResponse<TcgCsvProduct>>(`${TCGCSV_BASE_URL}/${group.groupId}/products`),
    fetchJson<TcgCsvResponse<TcgCsvPrice>>(`${TCGCSV_BASE_URL}/${group.groupId}/prices`),
  ]);
  const pricesByProductId = new Map<number, Map<RiftboundFinish, number | null>>();

  for (const price of priceResponse.results ?? []) {
    const finish = getTcgFinishName(price.subTypeName);
    if (!finish) continue;

    const productPrices = pricesByProductId.get(price.productId) ?? new Map<RiftboundFinish, number | null>();
    const normalizedPrice = normalizePriceCents(price.marketPrice);
    if (!productPrices.has(finish) || normalizedPrice !== null) productPrices.set(finish, normalizedPrice);
    pricesByProductId.set(price.productId, productPrices);
  }

  const pricesByPrintKey: RiftboundTcgPriceMap = new Map();
  for (const product of productResponse.results ?? []) {
    const cardNumber = getExtendedDataValue(product, 'Number');
    const productPrices = pricesByProductId.get(product.productId);
    if (!cardNumber || !productPrices || !group.abbreviation) continue;

    for (const printKey of getPrintKeyAliases(group.abbreviation, cardNumber.split('/')[0])) {
      const existing = pricesByPrintKey.get(printKey) ?? new Map<RiftboundFinish, number | null>();
      productPrices.forEach((price, finish) => {
        if (!existing.has(finish) || price !== null) existing.set(finish, price);
      });
      pricesByPrintKey.set(printKey, existing);
    }
  }

  return pricesByPrintKey;
}

export async function fetchRiftboundPriceSnapshot(setCodes: string[]) {
  const [groupResponse, snapshotText] = await Promise.all([
    fetchJson<TcgCsvResponse<TcgCsvGroup>>(`${TCGCSV_BASE_URL}/groups`),
    fetchText(TCGCSV_LAST_UPDATED_URL),
  ]);
  const sourceSnapshotAt = new Date(snapshotText.trim());
  if (Number.isNaN(sourceSnapshotAt.getTime())) {
    throw new Error('The Riftbound price source returned an invalid snapshot timestamp.');
  }

  const requestedSetCodes = new Set(setCodes.map((setCode) => setCode.toUpperCase()));
  const groups = (groupResponse.results ?? []).filter((group) => requestedSetCodes.has(String(group.abbreviation ?? '').toUpperCase()));
  const pricesByPrintKey: RiftboundTcgPriceMap = new Map();
  const groupMaps = await Promise.all(groups.map((group) => fetchGroupPriceMap(group)));
  groupMaps.forEach((groupMap) => mergePriceMap(pricesByPrintKey, groupMap));

  return {
    pricesByPrintKey,
    sourceSnapshotAt: sourceSnapshotAt.toISOString(),
    snapshotDate: sourceSnapshotAt.toISOString().slice(0, 10),
  };
}

export function buildRiftboundPriceSnapshotRows(
  cards: RiftboundCard[],
  pricesByPrintKey: RiftboundTcgPriceMap,
): RiftboundPriceSnapshotRow[] {
  return cards.flatMap((card) => card.finishOptions.map((finish) => {
    const aliasPrices = getPrintKeyAliases(card.setCode, card.collectorNumber)
      .map((printKey) => pricesByPrintKey.get(printKey)?.get(finish))
      .filter((price): price is number | null => price !== undefined);
    const sourcePrice = aliasPrices.find((price) => price !== null) ?? aliasPrices[0];

    if (sourcePrice !== undefined) {
      return {
        card_id: card.id,
        finish,
        price_cents: sourcePrice,
        capture_status: sourcePrice === null ? 'no_market_price' : 'live',
      };
    }

    const catalogPrice = normalizePriceCents(card.marketPrices[finish]);
    return {
      card_id: card.id,
      finish,
      price_cents: catalogPrice,
      capture_status: catalogPrice === null ? 'source_unmatched' : 'catalog_fallback',
    };
  }));
}
