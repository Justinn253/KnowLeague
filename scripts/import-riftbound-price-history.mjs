import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TCGCSV_CATEGORY_ID = 89;
const TCGCSV_ARCHIVE_BASE_URL = 'https://tcgcsv.com/archive/tcgplayer';
const TCGCSV_API_BASE_URL = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY_ID}`;
const RIFTBOUND_MARKET_VALUE_SOURCE = 'tcgcsv';
const DEFAULT_START_DATE = '2025-10-31';
const DAILY_HISTORY_DAYS = 90;
const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_ATTEMPTS = 3;
const REQUEST_DELAY_MS = 125;
const DATABASE_BATCH_SIZE = 500;
const USER_AGENT = 'KnowLeague Riftbound historical price importer/1.0';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} is not a valid calendar date.`);
  }

  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function getPrintKeyAliases(setCode, collectorNumber) {
  const normalizedSetCode = String(setCode).trim().toUpperCase();
  const normalizedCollectorNumber = String(collectorNumber).trim().toUpperCase().replace(/-STAR$/, '*');
  const unpaddedCollectorNumber = normalizedCollectorNumber.replace(/^0+(?=\d)/, '');
  return [
    `${normalizedSetCode}:${normalizedCollectorNumber}`,
    `${normalizedSetCode}:${unpaddedCollectorNumber}`,
  ];
}

function getExtendedDataValue(product, fieldName) {
  const field = (product.extendedData ?? []).find((entry) => String(entry.name).toLowerCase() === fieldName.toLowerCase());
  return typeof field?.value === 'string' ? field.value : null;
}

function getFinish(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'normal') return 'normal';
  if (normalized === 'foil' || normalized === 'holofoil') return 'foil';
  return null;
}

function normalizePriceCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function getOptionValue(argumentsList, name, fallback) {
  const index = argumentsList.indexOf(name);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : fallback;
}

function parseOptions(argumentsList) {
  if (argumentsList.includes('--help')) {
    console.log('Usage: node --env-file=.env.local scripts/import-riftbound-price-history.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]');
    process.exit(0);
  }

  const startDate = parseDate(getOptionValue(argumentsList, '--from', DEFAULT_START_DATE), '--from');
  const endDate = parseDate(getOptionValue(argumentsList, '--to', formatDate(new Date())), '--to');
  if (startDate > endDate) throw new Error('--from must be on or before --to.');

  return {
    startDate,
    endDate,
    dryRun: argumentsList.includes('--dry-run'),
  };
}

async function fetchResponse(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status} ${response.statusText}: ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await sleep(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to request ${url}.`);
}

async function fetchJson(url) {
  return (await fetchResponse(url)).json();
}

async function fetchArchive(date, archivePath) {
  const url = `${TCGCSV_ARCHIVE_BASE_URL}/prices-${date}.ppmd.7z`;
  let lastError = null;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`Archive request failed with ${response.status} ${response.statusText}: ${url}`);
      await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await sleep(500 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to download ${url}.`);
}

async function getArchiveEntries(archivePath, date) {
  const { stdout } = await execFileAsync('tar', ['-tf', archivePath], { maxBuffer: 32 * 1024 * 1024 });
  const prefix = `${date}/${TCGCSV_CATEGORY_ID}/`;
  return stdout
    .split(/\r?\n/)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('/prices'));
}

async function extractArchiveEntries(archivePath, extractPath, entries) {
  if (entries.length === 0) return;
  await execFileAsync('tar', ['-xf', archivePath, '-C', extractPath, ...entries], { maxBuffer: 32 * 1024 * 1024 });
}

async function loadProductMap(cards) {
  const groupsPayload = await fetchJson(`${TCGCSV_API_BASE_URL}/groups`);
  const requestedSetCodes = new Set(cards.map((card) => String(card.setCode).toUpperCase()));
  const groups = (groupsPayload.results ?? []).filter((group) => requestedSetCodes.has(String(group.abbreviation ?? '').toUpperCase()));
  const cardsByPrintKey = new Map();

  cards.forEach((card) => {
    getPrintKeyAliases(card.setCode, card.collectorNumber).forEach((printKey) => {
      if (!cardsByPrintKey.has(printKey)) cardsByPrintKey.set(printKey, card);
    });
  });

  const productMap = new Map();
  for (const group of groups) {
    await sleep(REQUEST_DELAY_MS);
    const productsPayload = await fetchJson(`${TCGCSV_API_BASE_URL}/${group.groupId}/products`);
    for (const product of productsPayload.results ?? []) {
      const cardNumber = getExtendedDataValue(product, 'Number');
      if (!cardNumber) continue;
      const card = getPrintKeyAliases(group.abbreviation, cardNumber.split('/')[0])
        .map((printKey) => cardsByPrintKey.get(printKey))
        .find(Boolean);
      if (!card) continue;
      productMap.set(`${group.groupId}:${product.productId}`, {
        cardId: card.id,
        finishOptions: new Set(card.finishOptions),
      });
    }
  }

  return { groups, productMap };
}

async function readArchivePrices(extractPath, entries, date, productMap) {
  const pricesByCardFinish = new Map();
  let sourcePriceCount = 0;
  let matchedPriceCount = 0;

  for (const entry of entries) {
    const groupId = entry.split('/')[2];
    const rawFile = await readFile(path.join(extractPath, ...entry.split('/')), 'utf8');
    const payload = JSON.parse(rawFile);
    for (const price of payload.results ?? []) {
      sourcePriceCount += 1;
      const product = productMap.get(`${groupId}:${price.productId}`);
      const finish = getFinish(price.subTypeName);
      if (!product || !finish || !product.finishOptions.has(finish)) continue;
      const priceCents = normalizePriceCents(price.marketPrice);
      const lowPriceCents = normalizePriceCents(price.lowPrice);
      const highPriceCents = normalizePriceCents(price.highPrice);
      if (priceCents === null && lowPriceCents === null && highPriceCents === null) continue;
      matchedPriceCount += 1;
      const key = `${product.cardId}:${finish}`;
      if (!pricesByCardFinish.has(key)) {
        pricesByCardFinish.set(key, {
          cardId: product.cardId,
          finish,
          priceCents,
          lowPriceCents,
          highPriceCents,
          date,
        });
      }
    }
  }

  return { pricesByCardFinish, sourcePriceCount, matchedPriceCount };
}

function toDatabaseRow(entry) {
  const capturedAt = `${entry.date}T20:00:00.000Z`;
  return {
    card_id: entry.cardId,
    finish: entry.finish,
    snapshot_date: entry.date,
    price_cents: entry.priceCents,
    low_price_cents: entry.lowPriceCents,
    high_price_cents: entry.highPriceCents,
    currency: 'USD',
    source: RIFTBOUND_MARKET_VALUE_SOURCE,
    source_snapshot_at: capturedAt,
    capture_status: entry.priceCents === null ? 'no_market_price' : 'live',
    captured_at: capturedAt,
  };
}

function isHigherMonthlyMarketPeak(candidate, existing) {
  if (!existing) return true;
  if (candidate.priceCents === null) return false;
  if (existing.priceCents === null) return true;
  return candidate.priceCents > existing.priceCents;
}

async function upsertRows(supabase, rows, dryRun) {
  if (rows.length === 0) return;
  if (dryRun) return;

  for (let index = 0; index < rows.length; index += DATABASE_BATCH_SIZE) {
    const batch = rows.slice(index, index + DATABASE_BATCH_SIZE);
    const { error } = await supabase
      .from('riftbound_card_price_snapshots')
      .upsert(batch, { onConflict: 'card_id,finish,snapshot_date,source' });
    if (error) throw error;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options.dryRun && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.');
  }
  const cards = JSON.parse(await readFile(new URL('../data/catalogs/riftbound-cards.json', import.meta.url), 'utf8'));
  const { groups, productMap } = await loadProductMap(cards);
  const monthlyPeaks = new Map();
  const dailyHistoryStartDate = addDays(options.endDate, -(DAILY_HISTORY_DAYS - 1));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'knowleague-riftbound-history-'));
  const supabase = options.dryRun
    ? null
    : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`Matched ${productMap.size} TCGCSV products across ${groups.length} Riftbound groups.`);
  console.log(`Importing ${formatDate(options.startDate)} through ${formatDate(options.endDate)}; daily from ${formatDate(dailyHistoryStartDate)}, then monthly peaks.`);

  let archiveCount = 0;
  let missingArchiveCount = 0;
  let dailyRowCount = 0;
  let monthlyRowCount = 0;
  let sourcePriceCount = 0;
  let matchedPriceCount = 0;

  try {
    for (let currentDate = options.startDate; currentDate <= options.endDate; currentDate = addDays(currentDate, 1)) {
      const date = formatDate(currentDate);
      const archivePath = path.join(tempRoot, `prices-${date}.ppmd.7z`);
      const extractPath = path.join(tempRoot, date);
      await rm(extractPath, { recursive: true, force: true });
      const downloaded = await fetchArchive(date, archivePath);
      if (!downloaded) {
        missingArchiveCount += 1;
        await rm(archivePath, { force: true });
        console.warn(`Archive unavailable for ${date}; skipping.`);
        continue;
      }

      const entries = await getArchiveEntries(archivePath, date);
      await mkdir(extractPath, { recursive: true });
      await extractArchiveEntries(archivePath, extractPath, entries);
      const archivePrices = await readArchivePrices(extractPath, entries, date, productMap);
      sourcePriceCount += archivePrices.sourcePriceCount;
      matchedPriceCount += archivePrices.matchedPriceCount;

      if (currentDate >= dailyHistoryStartDate) {
        const rows = Array.from(archivePrices.pricesByCardFinish.values()).map(toDatabaseRow);
        await upsertRows(supabase, rows, options.dryRun);
        dailyRowCount += rows.length;
      } else {
        archivePrices.pricesByCardFinish.forEach((entry) => {
          const month = date.slice(0, 7);
          const key = `${entry.cardId}:${entry.finish}:${month}`;
          const existing = monthlyPeaks.get(key);
          if (isHigherMonthlyMarketPeak(entry, existing)) monthlyPeaks.set(key, entry);
        });
      }

      archiveCount += 1;
      console.log(`${date}: ${entries.length} Riftbound files, ${archivePrices.pricesByCardFinish.size} matched prices`);
      await rm(archivePath, { force: true });
      await rm(extractPath, { recursive: true, force: true });
      await sleep(REQUEST_DELAY_MS);
    }

    const monthlyRows = Array.from(monthlyPeaks.values()).map(toDatabaseRow);
    await upsertRows(supabase, monthlyRows, options.dryRun);
    monthlyRowCount = monthlyRows.length;

    console.log(JSON.stringify({
      dryRun: options.dryRun,
      archiveCount,
      missingArchiveCount,
      dailyRowCount,
      monthlyRowCount,
      sourcePriceCount,
      matchedPriceCount,
      unmatchedPriceCount: sourcePriceCount - matchedPriceCount,
    }, null, 2));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
