import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type BrowserContext } from 'puppeteer-core';
import type { DiscordBotConfig } from './config.js';

const CAPTURE_VIEWPORT = { width: 1_400, height: 900 };
const PAGE_LOAD_TIMEOUT_MS = 45_000;
const IMAGE_SETTLE_TIMEOUT_MS = 10_000;
const MAX_PENDING_CAPTURES = 2;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const DISCORD_SNAPSHOT_TARGETS = [
  { id: 'overview', fileName: 'knowleague-league-account-overview.png' },
  { id: 'mastery', fileName: 'knowleague-league-account-mastery.png' },
  { id: 'matches', fileName: 'knowleague-league-account-match-history.png' },
] as const;

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
  files: Array<{
    buffer: Buffer;
    fileName: string;
  }>;
  riotId: string;
  viewerUrl: string;
};

type LeagueAccountViewerBrowserConnection = {
  browser: Browser;
  isRemote: boolean;
};

type LeagueAccountViewerCaptureStage = 'start-browser' | 'create-context' | 'load-viewer' | 'wait-for-viewer' | 'capture-image';

let browserConnectionPromise: Promise<LeagueAccountViewerBrowserConnection> | null = null;
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

export function formatLeagueAccountViewerCaptureFailure(stage: LeagueAccountViewerCaptureStage) {
  if (stage === 'start-browser' || stage === 'create-context') {
    return 'The League Account Viewer screenshot browser is temporarily unavailable. Please try again shortly.';
  }
  if (stage === 'load-viewer' || stage === 'wait-for-viewer') {
    return 'The League Account Viewer did not finish loading in time. Please try again shortly.';
  }
  return 'The League Account Viewer loaded, but its image could not be created. Please try again shortly.';
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

function isLeagueAccountViewerPage(url: URL, expectedPath: string) {
  return url.pathname.replace(/\/+$/, '') === expectedPath;
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

export function buildLeagueAccountViewerSnapshotUrl(
  config: Pick<DiscordBotConfig, 'siteUrl'>,
  riotId: string,
  platform: LeagueAccountViewerPlatform,
) {
  const viewerUrl = new URL('/riot-account-viewer/discord-snapshot', config.siteUrl);
  viewerUrl.searchParams.set('riotId', riotId);
  viewerUrl.searchParams.set('platform', platform);
  return viewerUrl.toString();
}

async function getBrowser(config: Pick<DiscordBotConfig, 'leagueAccountViewerBrowserWsEndpoint' | 'leagueAccountViewerChromeExecutablePath'>) {
  if (browserConnectionPromise) return browserConnectionPromise;

  const isRemote = Boolean(config.leagueAccountViewerBrowserWsEndpoint);
  if (!isRemote) {
    const executablePath = config.leagueAccountViewerChromeExecutablePath;
    if (!executablePath || !existsSync(executablePath)) {
      throw new LeagueAccountViewerSnapshotError('The League Account Viewer screenshot browser is not available on this bot deployment.');
    }
  }

  const request = isRemote
    ? puppeteer.connect({
      browserWSEndpoint: config.leagueAccountViewerBrowserWsEndpoint!,
      protocolTimeout: PAGE_LOAD_TIMEOUT_MS,
    })
    : puppeteer.launch({
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
      executablePath: config.leagueAccountViewerChromeExecutablePath!,
      headless: true,
      protocolTimeout: PAGE_LOAD_TIMEOUT_MS,
    });
  const connection = request.then((browser) => {
    browser.on('disconnected', () => {
      if (browserConnectionPromise === connection) browserConnectionPromise = null;
    });
    return { browser, isRemote };
  });
  browserConnectionPromise = connection;
  try {
    return await connection;
  } catch (error) {
    if (browserConnectionPromise === connection) browserConnectionPromise = null;
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
  config: Pick<DiscordBotConfig, 'leagueAccountViewerBrowserWsEndpoint' | 'leagueAccountViewerChromeExecutablePath' | 'siteUrl'>,
  submittedRiotId: string,
  submittedPlatform: string,
): Promise<LeagueAccountViewerSnapshot> {
  const riotId = normalizeLeagueRiotId(submittedRiotId);
  const platform = submittedPlatform.trim().toUpperCase();
  if (!isLeagueAccountViewerPlatform(platform)) {
    throw new LeagueAccountViewerSnapshotError('Choose a supported League region.');
  }
  const viewerUrl = buildLeagueAccountViewerUrl(config, riotId, platform);
  const snapshotUrl = buildLeagueAccountViewerSnapshotUrl(config, riotId, platform);
  let resolvedViewerUrl = viewerUrl;

  return runOneCapture(async () => {
    let context: BrowserContext | null = null;
    let captureStage: LeagueAccountViewerCaptureStage = 'start-browser';
    try {
      const browserConnection = await getBrowser(config);
      captureStage = 'create-context';
      context = await browserConnection.browser.createBrowserContext();
      const page = await context.newPage();
      let viewerApiResponseStatus: number | null = null;
      page.on('response', (response) => {
        const responseUrl = new URL(response.url());
        if (isTrustedLeagueAccountViewerOrigin(responseUrl.toString(), snapshotUrl) && responseUrl.pathname === '/api/riot-account/viewer') {
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
      captureStage = 'load-viewer';
      const navigationResponse = await page.goto(snapshotUrl, { timeout: PAGE_LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      if (navigationResponse && navigationResponse.status() >= 500) {
        throw new LeagueAccountViewerSnapshotError('The KnowLeague website is temporarily unavailable. Please try again shortly.');
      }
      if (navigationResponse && navigationResponse.status() >= 400) {
        throw new LeagueAccountViewerSnapshotError('The League Account Viewer could not be opened. Please try again shortly.');
      }
      const finalViewerUrl = new URL(page.url());
      if (!isTrustedLeagueAccountViewerOrigin(finalViewerUrl.toString(), snapshotUrl) || !isLeagueAccountViewerPage(finalViewerUrl, '/riot-account-viewer/discord-snapshot')) {
        throw new LeagueAccountViewerSnapshotError('The League Account Viewer redirected unexpectedly. Please try again shortly.');
      }
      const finalInteractiveViewerUrl = new URL('/riot-account-viewer', finalViewerUrl);
      finalInteractiveViewerUrl.search = new URL(viewerUrl).search;
      resolvedViewerUrl = finalInteractiveViewerUrl.toString();
      captureStage = 'wait-for-viewer';
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
      }).catch(() => undefined);
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), {
        timeout: IMAGE_SETTLE_TIMEOUT_MS,
      }).catch(() => undefined);

      captureStage = 'capture-image';
      const files = [] as LeagueAccountViewerSnapshot['files'];
      for (const target of DISCORD_SNAPSHOT_TARGETS) {
        const selector = `[data-lav-discord-snapshot="${target.id}"]`;
        const targetElement = await page.waitForSelector(selector, { timeout: PAGE_LOAD_TIMEOUT_MS });
        if (!targetElement) {
          throw new LeagueAccountViewerSnapshotError('The League Account Viewer did not finish loading in time. Please try again shortly.');
        }
        const image = await targetElement.screenshot({ type: 'png' });
        const buffer = Buffer.from(image);
        const attachmentError = getLeagueAccountViewerAttachmentError(buffer.byteLength);
        if (attachmentError) {
          throw new LeagueAccountViewerSnapshotError(attachmentError);
        }
        files.push({ buffer, fileName: target.fileName });
      }
      return {
        files,
        riotId,
        viewerUrl: resolvedViewerUrl,
      };
    } catch (error) {
      if (error instanceof LeagueAccountViewerSnapshotError) throw error;
      console.warn('Discord League Account Viewer snapshot capture failed.', {
        errorName: error instanceof Error ? error.name : 'non-error',
        stage: captureStage,
      });
      throw new LeagueAccountViewerSnapshotError(formatLeagueAccountViewerCaptureFailure(captureStage));
    } finally {
      await context?.close().catch(() => undefined);
    }
  });
}

export async function closeLeagueAccountViewerBrowser() {
  const currentConnection = browserConnectionPromise;
  browserConnectionPromise = null;
  if (!currentConnection) return;

  const connection = await currentConnection.catch(() => null);
  if (!connection) return;
  if (connection.isRemote) {
    connection.browser.disconnect();
    return;
  }
  await connection.browser.close().catch(() => undefined);
}
