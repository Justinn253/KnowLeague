import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type BrowserContext } from 'puppeteer-core';
import type { DiscordBotConfig } from './config.js';

const CAPTURE_VIEWPORT = { width: 1_400, height: 900 };
const PAGE_LOAD_TIMEOUT_MS = 45_000;
const IMAGE_SETTLE_TIMEOUT_MS = 10_000;
const MAX_PENDING_CAPTURES = 2;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const SCREENSHOT_FILE_NAME = 'knowleague-league-account.png';

export const LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS = [
  { label: 'BR — Brazil', value: 'BR1' },
  { label: 'EUNE — Europe Nordic & East', value: 'EUN1' },
  { label: 'EUW — Europe West', value: 'EUW1' },
  { label: 'JP — Japan', value: 'JP1' },
  { label: 'KR — Korea', value: 'KR' },
  { label: 'LAN — Latin America North', value: 'LA1' },
  { label: 'LAS — Latin America South', value: 'LA2' },
  { label: 'NA — North America', value: 'NA1' },
  { label: 'OCE — Oceania', value: 'OC1' },
  { label: 'TR — Türkiye', value: 'TR1' },
  { label: 'RU — Russia', value: 'RU' },
  { label: 'PH — Philippines', value: 'PH2' },
  { label: 'SG — Singapore', value: 'SG2' },
  { label: 'TH — Thailand', value: 'TH2' },
  { label: 'TW — Taiwan', value: 'TW2' },
  { label: 'VN — Vietnam', value: 'VN2' },
] as const;

export type LeagueAccountViewerPlatform = (typeof LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS)[number]['value'];

export class LeagueAccountViewerSnapshotError extends Error {}

type LeagueAccountViewerSnapshot = {
  buffer: Buffer;
  riotId: string;
  viewerUrl: string;
};

let browserPromise: Promise<Browser> | null = null;
let captureTail: Promise<void> = Promise.resolve();
let pendingCaptureCount = 0;

export function normalizeLeagueRiotId(value: string) {
  const riotId = value.trim();
  const separatorIndex = riotId.lastIndexOf('#');
  if (
    riotId.length < 3
    || riotId.length > 64
    || separatorIndex <= 0
    || separatorIndex === riotId.length - 1
    || /[\u0000-\u001F\u007F]/.test(riotId)
  ) {
    throw new LeagueAccountViewerSnapshotError('Enter a Riot ID in the format GameName#TagLine.');
  }

  return riotId;
}

export function formatLeagueAccountViewerError(viewerError: string) {
  const normalizedError = viewerError.toLowerCase();
  if (normalizedError.includes('not found')) {
    return 'No League account was found for that Riot ID in the selected region. Check both and try again.';
  }
  if (normalizedError.includes('too many riot account lookups') || normalizedError.includes('rate limit')) {
    return 'Riot account lookups are temporarily rate-limited. Please wait a moment and try again.';
  }
  if (normalizedError.includes('request protection')) {
    return 'Riot account lookup protection is temporarily unavailable. Please try again shortly.';
  }
  if (normalizedError.includes('not configured') || normalizedError.includes('rejected')) {
    return 'Riot account lookup is temporarily unavailable. Please try again shortly.';
  }
  if (
    normalizedError.includes('riot api request failed')
    || normalizedError.includes('data dragon request failed')
    || normalizedError.includes('unable to load riot account data')
  ) {
    return 'League account data is temporarily unavailable. Please try again shortly.';
  }
  if (normalizedError.includes('invalid')) {
    return 'The Riot ID or selected region was not accepted. Check both and try again.';
  }
  return 'Riot account lookup is temporarily unavailable. Please try again shortly.';
}

export function formatLeagueAccountViewerResponseError(status: number) {
  if (status === 404) {
    return 'No League account was found for that Riot ID in the selected region. Check both and try again.';
  }
  if (status === 429) {
    return 'Riot account lookups are temporarily rate-limited. Please wait a moment and try again.';
  }
  if (status === 401 || status === 403) {
    return 'Riot account lookup is temporarily unavailable. Please try again shortly.';
  }
  if (status >= 500) {
    return 'League account data is temporarily unavailable. Please try again shortly.';
  }
  if (status === 400) {
    return 'The Riot ID or selected region was not accepted. Check both and try again.';
  }
  return null;
}

export function getLeagueAccountViewerAttachmentError(byteLength: number) {
  return byteLength > MAX_SCREENSHOT_BYTES
    ? 'The League Account Viewer image is too large to attach. Please open the interactive viewer instead.'
    : null;
}

function hostnameWithoutWww(hostname: string) {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export function isTrustedLeagueAccountViewerOrigin(candidateUrl: string, configuredViewerUrl: string) {
  const candidate = new URL(candidateUrl);
  const configured = new URL(configuredViewerUrl);
  return candidate.protocol === configured.protocol
    && candidate.port === configured.port
    && hostnameWithoutWww(candidate.hostname) === hostnameWithoutWww(configured.hostname);
}

function isLeagueAccountViewerPage(url: URL) {
  return url.pathname.replace(/\/+$/, '') === '/riot-account-viewer';
}

function isLeagueAccountViewerPlatform(value: string): value is LeagueAccountViewerPlatform {
  return LEAGUE_ACCOUNT_VIEWER_PLATFORM_OPTIONS.some((platform) => platform.value === value);
}

export function buildLeagueAccountViewerUrl(
  config: Pick<DiscordBotConfig, 'siteUrl'>,
  riotId: string,
  platform: LeagueAccountViewerPlatform,
) {
  const viewerUrl = new URL('/riot-account-viewer', config.siteUrl);
  viewerUrl.searchParams.set('riotId', riotId);
  viewerUrl.searchParams.set('platform', platform);
  viewerUrl.searchParams.set('tab', 'overview');
  return viewerUrl.toString();
}

async function getBrowser(config: Pick<DiscordBotConfig, 'leagueAccountViewerChromeExecutablePath'>) {
  if (browserPromise) return browserPromise;

  const executablePath = config.leagueAccountViewerChromeExecutablePath;
  if (!executablePath || !existsSync(executablePath)) {
    throw new LeagueAccountViewerSnapshotError('The League Account Viewer screenshot browser is not available on this bot deployment.');
  }

  const request = puppeteer.launch({
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-sync',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
    ],
    executablePath,
    headless: true,
    protocolTimeout: PAGE_LOAD_TIMEOUT_MS,
  });
  browserPromise = request;
  try {
    const browser = await request;
    browser.on('disconnected', () => {
      if (browserPromise === request) browserPromise = null;
    });
    return browser;
  } catch (error) {
    if (browserPromise === request) browserPromise = null;
    throw error;
  }
}

async function runOneCapture<T>(operation: () => Promise<T>) {
  if (pendingCaptureCount >= MAX_PENDING_CAPTURES) {
    throw new LeagueAccountViewerSnapshotError('League Account Viewer snapshots are busy. Please try again shortly.');
  }

  pendingCaptureCount += 1;
  const previousCapture = captureTail;
  let releaseCapture!: () => void;
  captureTail = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });

  await previousCapture;
  try {
    return await operation();
  } finally {
    releaseCapture();
    pendingCaptureCount -= 1;
  }
}

export async function captureLeagueAccountViewer(
  config: Pick<DiscordBotConfig, 'leagueAccountViewerChromeExecutablePath' | 'siteUrl'>,
  submittedRiotId: string,
  submittedPlatform: string,
): Promise<LeagueAccountViewerSnapshot> {
  const riotId = normalizeLeagueRiotId(submittedRiotId);
  const platform = submittedPlatform.trim().toUpperCase();
  if (!isLeagueAccountViewerPlatform(platform)) {
    throw new LeagueAccountViewerSnapshotError('Choose a supported League region.');
  }
  const viewerUrl = buildLeagueAccountViewerUrl(config, riotId, platform);
  let resolvedViewerUrl = viewerUrl;

  return runOneCapture(async () => {
    const browser = await getBrowser(config);
    let context: BrowserContext | null = null;
    try {
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      let viewerApiResponseStatus: number | null = null;
      page.on('response', (response) => {
        const responseUrl = new URL(response.url());
        if (isTrustedLeagueAccountViewerOrigin(responseUrl.toString(), viewerUrl) && responseUrl.pathname === '/api/riot-account/viewer') {
          viewerApiResponseStatus = response.status();
        }
      });
      page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => undefined);
      });
      await page.setViewport({ ...CAPTURE_VIEWPORT, deviceScaleFactor: 1 });
      page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT_MS);
      page.setDefaultTimeout(PAGE_LOAD_TIMEOUT_MS);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const navigationResponse = await page.goto(viewerUrl, { timeout: PAGE_LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      if (navigationResponse && navigationResponse.status() >= 500) {
        throw new LeagueAccountViewerSnapshotError('The KnowLeague website is temporarily unavailable. Please try again shortly.');
      }
      if (navigationResponse && navigationResponse.status() >= 400) {
        throw new LeagueAccountViewerSnapshotError('The League Account Viewer could not be opened. Please try again shortly.');
      }
      const finalViewerUrl = new URL(page.url());
      if (!isTrustedLeagueAccountViewerOrigin(finalViewerUrl.toString(), viewerUrl) || !isLeagueAccountViewerPage(finalViewerUrl)) {
        throw new LeagueAccountViewerSnapshotError('The League Account Viewer redirected unexpectedly. Please try again shortly.');
      }
      resolvedViewerUrl = finalViewerUrl.toString();
      await page.waitForSelector('[data-lav-capture-ready="true"], [data-lav-capture-error="true"]', {
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });

      const viewerError = await page.$('[data-lav-capture-error="true"]');
      if (viewerError) {
        const viewerErrorText = await viewerError.evaluate((element) => element.textContent ?? '');
        throw new LeagueAccountViewerSnapshotError(
          viewerApiResponseStatus === null
            ? formatLeagueAccountViewerError(viewerErrorText)
            : formatLeagueAccountViewerResponseError(viewerApiResponseStatus) ?? formatLeagueAccountViewerError(viewerErrorText),
        );
      }

      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-delay: 0ms !important;
            animation-duration: 0ms !important;
            caret-color: transparent !important;
            transition-delay: 0ms !important;
            transition-duration: 0ms !important;
          }
        `,
      });
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), {
        timeout: IMAGE_SETTLE_TIMEOUT_MS,
      }).catch(() => undefined);

      const image = await page.screenshot({ captureBeyondViewport: true, fullPage: true, type: 'png' });
      const buffer = Buffer.from(image);
      const attachmentError = getLeagueAccountViewerAttachmentError(buffer.byteLength);
      if (attachmentError) {
        throw new LeagueAccountViewerSnapshotError(attachmentError);
      }
      return {
        buffer,
        riotId,
        viewerUrl: resolvedViewerUrl,
      };
    } catch (error) {
      if (error instanceof LeagueAccountViewerSnapshotError) throw error;
      throw new LeagueAccountViewerSnapshotError('KnowLeague could not create the League Account Viewer snapshot. Please try again shortly.');
    } finally {
      await context?.close().catch(() => undefined);
    }
  });
}

export async function closeLeagueAccountViewerBrowser() {
  const currentBrowser = browserPromise;
  browserPromise = null;
  if (!currentBrowser) return;

  const browser = await currentBrowser.catch(() => null);
  await browser?.close().catch(() => undefined);
}

export { SCREENSHOT_FILE_NAME };
