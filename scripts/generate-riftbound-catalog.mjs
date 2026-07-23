import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OFFICIAL_GALLERY_SNAPSHOT_URL = 'https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json?download=true';
const DOMAIN_SNAPSHOT_API_URL = 'https://runeweave.com/api/search';
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

function normalizeCard(card, domainCardsByKey, marketPriceByPrintKey) {
  const setCode = card.setCode.toUpperCase();
  const number = parseCardNumber(card.cardNumber);
  const rarity = card.rarity;
  const defaultFinish = rarity === 'Rare' || rarity === 'Epic' ? 'foil' : 'normal';
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const fullName = card.fullName || card.name;
  const displayName = tags[0] && !fullName.toLowerCase().includes(tags[0].toLowerCase())
    ? `${tags[0]} — ${fullName}`
    : fullName;
  const marketPrice = marketPriceByPrintKey.get(getPrintKey(card));

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
    finishOptions: ['normal', 'foil'],
    defaultFinish,
  };
}

async function main() {
  const [officialCards, domainCards] = await Promise.all([
    fetchJson(OFFICIAL_GALLERY_SNAPSHOT_URL),
    fetchDomainCards(),
  ]);
  const marketCards = await fetchMarketCards(Array.from(new Set(officialCards.map((card) => card.setCode))));
  const marketPriceByPrintKey = createMarketPriceByPrintKey(marketCards);

  const domainCardsByKey = new Map();
  for (const card of domainCards) {
    const setCode = card.print?.set?.code;
    if (!setCode || !card.name) continue;

    domainCardsByKey.set(`${setCode.toUpperCase()}:${normalizeName(card.name)}`, card);
  }

  const catalog = officialCards
    .map((card) => normalizeCard(card, domainCardsByKey, marketPriceByPrintKey))
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
