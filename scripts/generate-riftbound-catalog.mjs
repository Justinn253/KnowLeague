import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OFFICIAL_GALLERY_SNAPSHOT_URL = 'https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json?download=true';
const DOMAIN_SNAPSHOT_API_URL = 'https://runeweave.com/api/search';
const TCGCSV_CATEGORY_ID = 89;
const TCGCSV_BASE_URL = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY_ID}`;
const TCGCSV_LAST_UPDATED_URL = 'https://tcgcsv.com/last-updated.txt';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'catalogs', 'riftbound-cards.json');
const DOMAIN_PAGE_SIZE = 100;
const MARKET_PAGE_SIZE = 100;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'KnowLeague Riftbound catalogue generator',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'KnowLeague Riftbound catalogue generator',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCardNumber(cardNumber) {
  const parts = cardNumber.split('-');
  const lastPart = parts.at(-1) ?? cardNumber;

  if (/^\d+$/.test(lastPart) && parts.length > 1) {
    const collectorNumber = parts.slice(0, -1).join('-').toUpperCase();
    const printedTotal = Number(lastPart);

    return {
      collectorNumber,
      printedTotal,
      numberLabel: `${collectorNumber}/${printedTotal}`,
    };
  }

  const collectorNumber = cardNumber.toUpperCase();
  return {
    collectorNumber,
    printedTotal: null,
    numberLabel: collectorNumber,
  };
}

function normalizePrintKey(value) {
  const [printCode] = value.toUpperCase().split('/');
  const separatorIndex = printCode.indexOf('-');
  if (separatorIndex === -1) return printCode;

  const setCode = printCode.slice(0, separatorIndex);
  const collectorNumber = printCode.slice(separatorIndex + 1).replace(/-STAR$/, '*');
  return `${setCode}:${collectorNumber}`;
}

function getPrintKey(card) {
  const number = parseCardNumber(card.cardNumber);
  return normalizePrintKey(`${card.setCode}-${number.collectorNumber}`);
}

function getDomains(card, domainCardsByKey) {
  const key = `${card.setCode.toUpperCase()}:${normalizeName(card.fullName || card.name)}`;
  const domainCard = domainCardsByKey.get(key);

  if (domainCard?.domains?.length) {
    return domainCard.domains;
  }

  return String(card.domain || 'Colorless')
    .split(/[;,/]/)
    .map((domain) => domain.trim())
    .filter(Boolean);
}

async function fetchDomainCards() {
  const firstPage = await fetchJson(`${DOMAIN_SNAPSHOT_API_URL}?q=&per_page=${DOMAIN_PAGE_SIZE}&page=1&sort=name`);
  const pages = [firstPage];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    pages.push(await fetchJson(`${DOMAIN_SNAPSHOT_API_URL}?q=&per_page=${DOMAIN_PAGE_SIZE}&page=${page}&sort=name`));
  }

  return pages.flatMap((page) => page.cards ?? []);
}

async function fetchMarketCards(setCodes) {
  const marketCards = [];
  const filters = ['', 'r:showcase', 'is:signature'];

  for (const setCode of setCodes) {
    for (const filter of filters) {
      const query = [`set:${setCode.toLowerCase()}`, filter].filter(Boolean).join(' ');
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const encodedQuery = encodeURIComponent(query);
        const response = await fetchJson(`${DOMAIN_SNAPSHOT_API_URL}?q=${encodedQuery}&per_page=${MARKET_PAGE_SIZE}&page=${page}&sort=name`);
        marketCards.push(...(response.cards ?? []));
        totalPages = response.totalPages ?? 1;
        page += 1;
      }
    }
  }

  return marketCards;
}

function createMarketPriceByPrintKey(marketCards) {
  const prices = new Map();

  for (const card of marketCards) {
    const publicCode = card.print?.publicCode;
    if (!publicCode) continue;

    const key = normalizePrintKey(publicCode);
    const price = card.price;
    if (!price || !prices.has(key) || card.print?.isSignature) {
      prices.set(key, {
        marketPrice: typeof price?.market === 'number' ? price.market : null,
        marketPriceUpdatedAt: typeof price?.date === 'string' ? price.date : null,
      });
    }
  }

  return prices;
}

function getExtendedDataValue(product, fieldName) {
  const field = (product.extendedData ?? []).find((entry) => String(entry.name).toLowerCase() === fieldName.toLowerCase());
  return typeof field?.value === 'string' ? field.value : null;
}

function getPrintKeyAliases(setCode, collectorNumber) {
  const normalizedSetCode = setCode.toUpperCase();
  const normalizedCollectorNumber = String(collectorNumber).trim().toUpperCase();
  const unpaddedCollectorNumber = normalizedCollectorNumber.replace(/^0+(?=\d)/, '');
  return Array.from(new Set([
    `${normalizedSetCode}:${normalizedCollectorNumber}`,
    `${normalizedSetCode}:${unpaddedCollectorNumber}`,
  ]));
}

function getTcgFinishName(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'normal') return 'normal';
  if (normalized === 'foil' || normalized === 'holofoil') return 'foil';
  return null;
}

function isShowcasePrint(number) {
  const collectorNumber = number.collectorNumber.toUpperCase();
  if (collectorNumber.endsWith('A') || collectorNumber.endsWith('-STAR') || /^SP\d+$/.test(collectorNumber)) return true;

  const numericNumber = Number(collectorNumber.match(/^\d+/)?.[0]);
  return Number.isFinite(numericNumber) && number.printedTotal !== null && numericNumber > number.printedTotal;
}

async function fetchTcgCsvMarketPrices(setCodes) {
  const groupResponse = await fetchJson(`${TCGCSV_BASE_URL}/groups`);
  const requestedSetCodes = new Set(setCodes.map((setCode) => setCode.toUpperCase()));
  const groups = (groupResponse.results ?? []).filter((group) => requestedSetCodes.has(String(group.abbreviation ?? '').toUpperCase()));
  const pricesByPrintKey = new Map();
  const snapshotText = (await fetchText(TCGCSV_LAST_UPDATED_URL)).trim();
  const snapshotDate = Number.isNaN(Date.parse(snapshotText)) ? new Date().toISOString() : new Date(snapshotText).toISOString();

  for (const group of groups) {
    const [productResponse, priceResponse] = await Promise.all([
      fetchJson(`${TCGCSV_BASE_URL}/${group.groupId}/products`),
      fetchJson(`${TCGCSV_BASE_URL}/${group.groupId}/prices`),
    ]);
    const pricesByProductId = new Map();

    for (const price of priceResponse.results ?? []) {
      const finish = getTcgFinishName(price.subTypeName);
      if (!finish) continue;

      const productPrices = pricesByProductId.get(price.productId) ?? { normal: null, foil: null };
      if (typeof price.marketPrice === 'number') {
        productPrices[finish] = price.marketPrice;
      }
      pricesByProductId.set(price.productId, productPrices);
    }

    for (const product of productResponse.results ?? []) {
      const cardNumber = getExtendedDataValue(product, 'Number');
      const productPrices = pricesByProductId.get(product.productId);
      if (!cardNumber || !productPrices) continue;

      for (const printKey of getPrintKeyAliases(group.abbreviation, cardNumber.split('/')[0])) {
        const existing = pricesByPrintKey.get(printKey) ?? { normal: null, foil: null, updatedAt: snapshotDate };
        pricesByPrintKey.set(printKey, {
          normal: productPrices.normal ?? existing.normal,
          foil: productPrices.foil ?? existing.foil,
          updatedAt: snapshotDate,
        });
      }
    }
  }

  return pricesByPrintKey;
}

function normalizeCard(card, domainCardsByKey, marketPriceByPrintKey, tcgMarketPricesByPrintKey) {
  const setCode = card.setCode.toUpperCase();
  const number = parseCardNumber(card.cardNumber);
  const rarity = isShowcasePrint(number) ? 'Showcase' : card.rarity;
  const finishOptions = rarity === 'Rare' || rarity === 'Epic' || rarity === 'Showcase'
    ? ['foil']
    : ['normal', 'foil'];
  const defaultFinish = rarity === 'Rare' || rarity === 'Epic' || rarity === 'Showcase' ? 'foil' : 'normal';
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const fullName = card.fullName || card.name;
  const displayName = fullName;
  const printKey = getPrintKey(card);
  const marketPrice = marketPriceByPrintKey.get(printKey);
  const fallbackMarketPrices = {
    normal: marketPrice?.marketPrice ?? null,
    foil: null,
    updatedAt: marketPrice?.marketPriceUpdatedAt ?? null,
  };
  const marketPrices = tcgMarketPricesByPrintKey.get(printKey) ?? fallbackMarketPrices;

  return {
    id: card.cardCode,
    displayName,
    name: card.name,
    fullName,
    setCode,
    setName: card.cardSet,
    collectorNumber: number.collectorNumber,
    printedTotal: number.printedTotal,
    numberLabel: number.numberLabel,
    rarity,
    energyCost: card.energy ?? 0,
    powerCost: card.power ?? 0,
    might: card.might ?? 0,
    cardType: card.cardType,
    cardTypeLabels: Array.isArray(card.cardTypeLabels) ? card.cardTypeLabels : [card.cardType],
    tags,
    domains: getDomains(card, domainCardsByKey),
    productDetails: card.abilityEffective || card.abilityOriginal || '—',
    imageUrl: card.imageUrl,
    sourceUrl: card.sourceUrl,
    artist: card.artist,
    hasErrata: Boolean(card.hasErrata),
    marketPrice: marketPrice?.marketPrice ?? null,
    marketPriceUpdatedAt: marketPrice?.marketPriceUpdatedAt ?? null,
    marketPriceCurrency: 'USD',
    marketPrices,
    finishOptions,
    defaultFinish,
  };
}

async function main() {
  const [officialCards, domainCards] = await Promise.all([
    fetchJson(OFFICIAL_GALLERY_SNAPSHOT_URL),
    fetchDomainCards(),
  ]);
  const setCodes = Array.from(new Set(officialCards.map((card) => card.setCode)));
  const [marketCards, tcgMarketPricesByPrintKey] = await Promise.all([
    fetchMarketCards(setCodes),
    fetchTcgCsvMarketPrices(setCodes),
  ]);
  const marketPriceByPrintKey = createMarketPriceByPrintKey(marketCards);

  const domainCardsByKey = new Map();
  for (const card of domainCards) {
    const setCode = card.print?.set?.code;
    if (!setCode || !card.name) continue;

    domainCardsByKey.set(`${setCode.toUpperCase()}:${normalizeName(card.name)}`, card);
  }

  const catalog = officialCards
    .map((card) => normalizeCard(card, domainCardsByKey, marketPriceByPrintKey, tcgMarketPricesByPrintKey))
    .sort((left, right) => left.id.localeCompare(right.id));

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const setCounts = catalog.reduce((counts, card) => {
    counts[card.setCode] = (counts[card.setCode] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`Wrote ${catalog.length} Riftbound card records to ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
  console.log(`Set counts: ${Object.entries(setCounts).map(([setCode, count]) => `${setCode}=${count}`).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
