import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import {
  buildDiscordSkindleGuessEmbed,
  buildDiscordSkindleShareEmbed,
  DiscordSkindleSessionStore,
  formatDiscordSkindleDate,
  getDiscordSkindleCatalog,
  getDiscordSkindleDailyTarget,
} from '../discord-bot/src/skindle';
import { getDailySkindleTarget } from '@/lib/skindle-daily';
import {
  buildChampionCatalogueSnapshotUrl,
  buildLeagueAccountViewerUrl,
  buildLeagueAccountViewerSnapshotUrl,
  formatChampionCatalogueCaptureFailure,
  getChampionCatalogueSnapshotFileNames,
  getChampionCatalogueSnapshotRequestWeight,
  getLeagueAccountViewerAttachmentError,
  getLeagueAccountViewerAttachmentSetError,
  formatLeagueAccountViewerCaptureFailure,
  formatLeagueAccountViewerError,
  formatLeagueAccountViewerResponseError,
  isTrustedLeagueAccountViewerOrigin,
  normalizeChampionCatalogueSearch,
  normalizeChampionCatalogueSnapshotSection,
  normalizeLeagueRiotId,
  shouldBlockSnapshotBrowserRequest,
} from '../discord-bot/src/league-account-viewer';
import { getRiotAccountViewerErrorStatus } from '@/lib/riot-account-viewer-error-status';

type SerializedCommandOption = {
  choices?: Array<{ name: string; value: string }>;
  description?: string;
  max_length?: number;
  min_length?: number;
  name: string;
  options?: SerializedCommandOption[];
  required?: boolean;
};

describe('Discord Skindle test implementation', () => {
  const day = new Date('2026-10-20T12:00:00.000Z');

  it('uses the website\'s exact UTC daily target', () => {
    expect(getDiscordSkindleDailyTarget(day).id).toBe(getDailySkindleTarget(day)?.id);
  });

  it('uses generated Lane and Resource metadata for Skindle comparisons', () => {
    const missFortune = getDiscordSkindleCatalog().find((skin) => skin.champion === 'Miss Fortune');
    expect(missFortune).toMatchObject({ lane: 'Bottom', resourceType: 'Mana' });
  });

  it('keeps clues and solved state scoped to one Discord user for the daily run', () => {
    const store = new DiscordSkindleSessionStore();
    const target = getDiscordSkindleDailyTarget(day);
    const incorrectGuesses = getDiscordSkindleCatalog().filter((skin) => skin.id !== target.id).slice(0, 4);
    expect(incorrectGuesses).toHaveLength(4);

    const firstGuess = store.guess('123456789012345678', incorrectGuesses[0]!.answer, day);
    expect(firstGuess.kind).toBe('incorrect');
    if (firstGuess.kind !== 'incorrect') return;
    expect(firstGuess.status).toMatchObject({ dateKey: '2026-10-20', guessCount: 1, solved: false });
    const guessEmbed = buildDiscordSkindleGuessEmbed(firstGuess).toJSON();
    expect(guessEmbed.description).not.toContain('private');
    expect(guessEmbed.footer).toBeUndefined();
    expect(guessEmbed.image?.url).toBe(firstGuess.guess.imageUrl);

    const duplicate = store.guess('123456789012345678', incorrectGuesses[0]!.answer, day);
    expect(duplicate.kind).toBe('duplicate');

    for (const guess of incorrectGuesses.slice(1)) {
      expect(store.guess('123456789012345678', guess.answer, day).kind).toBe('incorrect');
    }

    const solve = store.guess('123456789012345678', target.answer, day);
    expect(solve.kind).toBe('correct');
    if (solve.kind !== 'correct') return;
    expect(solve.status).toMatchObject({ guessCount: 5, solved: true });
    expect(solve.target.id).toBe(target.id);
    const shareEmbed = buildDiscordSkindleShareEmbed('Justin', solve).toJSON();
    expect(shareEmbed.description).not.toContain(target.answer);
    const progressRows = shareEmbed.description!.split('\n').slice(-5);
    expect(progressRows).toHaveLength(5);
    expect(progressRows.every((row) => [...row].length === 9)).toBe(true);
    expect([...progressRows.at(-1)!]).toEqual(Array(9).fill('\u{1F7E9}'));

    expect(store.getStatus('999999999999999999', day)).toMatchObject({ guessCount: 0, solved: false });
    expect(store.getStatus('123456789012345678', new Date('2026-10-21T00:00:00.000Z'))).toMatchObject({ guessCount: 0, solved: false });
  });

  it('formats the UTC daily key as the Eastern calendar day for Discord', () => {
    expect(formatDiscordSkindleDate('2026-10-21')).toBe('Oct 20, 2026');
  });

  it('registers the League Account Viewer, Champion Catalogue, and nested Skindle commands with bounded inputs', () => {
    const league = serializedCommandDefinitions().find((definition) => definition.name === 'league');
    const account = league?.options?.find((option) => option.name === 'account') as SerializedCommandOption | undefined;
    const riotId = account?.options?.find((option) => option.name === 'riot-id');
    const region = account?.options?.find((option) => option.name === 'region');
    expect(account?.description).toBe('Post a League Account Viewer image for a Riot ID.');
    expect(riotId).toMatchObject({ min_length: 3, max_length: 64, required: true });
    expect(region).toMatchObject({ required: true });
    expect(region?.choices).toContainEqual({ name: 'NA — North America', value: 'NA1' });
    expect(region?.choices).toContainEqual({ name: 'EUW — Europe West', value: 'EUW1' });

    const champion = league?.options?.find((option) => option.name === 'champion') as SerializedCommandOption | undefined;
    const championName = champion?.options?.find((option) => option.name === 'champion');
    const championSection = champion?.options?.find((option) => option.name === 'section');
    expect(champion?.description).toBe('Post Champion Catalogue images for a champion.');
    expect(championName).toMatchObject({ min_length: 2, max_length: 64, required: true });
    expect(championSection).toMatchObject({ required: true });
    expect(championSection?.choices).toEqual([
      { name: 'All sections (8 images)', value: 'all' },
      { name: 'Overview', value: 'overview' },
      { name: 'Statistics and playstyle', value: 'stats' },
      { name: 'Ability details (5 images)', value: 'abilities' },
      { name: 'All skins', value: 'skins' },
    ]);

    const skindle = league?.options?.find((option) => option.name === 'skindle') as SerializedCommandOption | undefined;
    expect(skindle?.options?.map((option) => option.name)).toEqual(['play', 'guess', 'status']);

    const guess = skindle?.options?.find((option) => option.name === 'guess');
    const skin = guess?.options?.find((option) => option.name === 'skin');
    expect(skin).toMatchObject({ min_length: 2, max_length: 150, required: true });

    const play = skindle?.options?.find((option) => option.name === 'play');
    expect(play?.description).toBe('Play the daily Skindle from KnowLeague.net.');
  });

  it('builds a safe selected-region overview URL from a Riot ID for the website capture', () => {
    expect(normalizeLeagueRiotId('  Thebausffs#COOL  ')).toBe('Thebausffs#COOL');
    expect(() => normalizeLeagueRiotId('Thebausffs')).toThrow('GameName#TagLine');
    expect(buildLeagueAccountViewerUrl({ siteUrl: 'https://knowleague.example' }, 'Thebausffs#COOL', 'EUW1'))
      .toBe('https://knowleague.example/riot-account-viewer?riotId=Thebausffs%23COOL&platform=EUW1&tab=overview');
    expect(buildLeagueAccountViewerSnapshotUrl({ siteUrl: 'https://knowleague.example' }, 'Thebausffs#COOL', 'EUW1'))
      .toBe('https://knowleague.example/riot-account-viewer/discord-snapshot?riotId=Thebausffs%23COOL&platform=EUW1');
  });

  it('normalizes a Champion Catalogue query and captures only its requested sections', () => {
    expect(normalizeChampionCatalogueSearch('  Miss Fortune  ')).toBe('Miss Fortune');
    expect(() => normalizeChampionCatalogueSearch(' ')).toThrow('between 2 and 64 characters');
    expect(normalizeChampionCatalogueSnapshotSection(' ABILITIES ')).toBe('abilities');
    expect(() => normalizeChampionCatalogueSnapshotSection('mastery')).toThrow('Choose all, overview, stats, abilities, or skins.');
    expect(buildChampionCatalogueSnapshotUrl({ siteUrl: 'https://knowleague.example' }, 'Miss Fortune', 'skins'))
      .toBe('https://knowleague.example/champions/discord-snapshot?champion=Miss+Fortune&section=skins');
    expect(getChampionCatalogueSnapshotFileNames('overview')).toEqual(['knowleague-champion-overview.png']);
    expect(getChampionCatalogueSnapshotFileNames('stats')).toEqual(['knowleague-champion-gameplay-statistics.png']);
    expect(getChampionCatalogueSnapshotFileNames('abilities')).toHaveLength(5);
    expect(getChampionCatalogueSnapshotFileNames('skins')).toEqual(['knowleague-champion-skins.png']);
    expect(getChampionCatalogueSnapshotFileNames('all')).toHaveLength(8);
  });

  it('allows only the trusted www canonical-host redirect for the viewer', () => {
    expect(isTrustedLeagueAccountViewerOrigin('https://www.knowleague.net/riot-account-viewer', 'https://knowleague.net/riot-account-viewer')).toBe(true);
    expect(isTrustedLeagueAccountViewerOrigin('https://knowleague.net/riot-account-viewer', 'https://www.knowleague.net/riot-account-viewer')).toBe(true);
    expect(isTrustedLeagueAccountViewerOrigin('http://knowleague.net/riot-account-viewer', 'https://knowleague.net/riot-account-viewer')).toBe(false);
    expect(isTrustedLeagueAccountViewerOrigin('https://accounts.knowleague.net/riot-account-viewer', 'https://knowleague.net/riot-account-viewer')).toBe(false);
  });

  it('budgets multi-image work and blocks off-origin or telemetry browser requests', () => {
    const configuredViewerUrl = 'https://knowleague.net/champions/discord-snapshot';
    expect(getChampionCatalogueSnapshotRequestWeight('overview')).toBe(1);
    expect(getChampionCatalogueSnapshotRequestWeight('abilities')).toBe(3);
    expect(getChampionCatalogueSnapshotRequestWeight('all')).toBe(4);
    expect(shouldBlockSnapshotBrowserRequest('https://www.knowleague.net/champions/discord-snapshot', true, configuredViewerUrl)).toBe(false);
    expect(shouldBlockSnapshotBrowserRequest('https://outside.example/redirect', true, configuredViewerUrl)).toBe(true);
    expect(shouldBlockSnapshotBrowserRequest('https://www.google-analytics.com/analytics.js', false, configuredViewerUrl)).toBe(true);
    expect(shouldBlockSnapshotBrowserRequest('https://ddragon.leagueoflegends.com/cdn/dragontail.png', false, configuredViewerUrl)).toBe(false);
    expect(shouldBlockSnapshotBrowserRequest('not a URL', false, configuredViewerUrl)).toBe(true);
  });

  it('maps website viewer failures to safe, specific Discord messages', () => {
    expect(formatLeagueAccountViewerError('Riot account data not found for that Riot ID and region.'))
      .toBe('No League account was found for that Riot ID in the selected region. Check both and try again.');
    expect(formatLeagueAccountViewerError('Too many Riot account lookups. Try again in 25 seconds.'))
      .toBe('Riot account lookups are temporarily rate-limited. Please wait a moment and try again.');
    expect(formatLeagueAccountViewerError('Request protection is temporarily unavailable. Please try again shortly.'))
      .toBe('Riot account lookup protection is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerError('Riot API key is not configured.'))
      .toBe('Riot account lookup is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerError('Riot API request failed with status 500.'))
      .toBe('League account data is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerError('Data Dragon request failed with status 503.'))
      .toBe('League account data is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerError('Failed to fetch'))
      .toBe('Riot account lookup is temporarily unavailable. Please try again shortly.');
  });

  it('prioritizes the website viewer API status when classifying a screenshot failure', () => {
    expect(formatLeagueAccountViewerResponseError(404))
      .toBe('No League account was found for that Riot ID in the selected region. Check both and try again.');
    expect(formatLeagueAccountViewerResponseError(429))
      .toBe('Riot account lookups are temporarily rate-limited. Please wait a moment and try again.');
    expect(formatLeagueAccountViewerResponseError(401))
      .toBe('Riot account lookup is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerResponseError(503))
      .toBe('League account data is temporarily unavailable. Please try again shortly.');
  });

  it('rejects a screenshot that Discord cannot safely attach', () => {
    expect(getLeagueAccountViewerAttachmentError(8 * 1024 * 1024)).toBeNull();
    expect(getLeagueAccountViewerAttachmentError((8 * 1024 * 1024) + 1))
      .toBe('The League Account Viewer image is too large to attach. Please open the interactive viewer instead.');
    expect(getLeagueAccountViewerAttachmentSetError(20 * 1024 * 1024)).toBeNull();
    expect(getLeagueAccountViewerAttachmentSetError((20 * 1024 * 1024) + 1))
      .toBe('The League Account Viewer images are too large to attach together. Please open the interactive viewer instead.');
  });

  it('returns a safe, actionable failure message for each screenshot capture stage', () => {
    expect(formatLeagueAccountViewerCaptureFailure('start-browser'))
      .toBe('The League Account Viewer screenshot browser is temporarily unavailable. Please try again shortly.');
    expect(formatLeagueAccountViewerCaptureFailure('wait-for-viewer'))
      .toBe('The League Account Viewer did not finish loading in time. Please try again shortly.');
    expect(formatLeagueAccountViewerCaptureFailure('capture-image'))
      .toBe('The League Account Viewer loaded, but its image could not be created. Please try again shortly.');
  });

  it('returns scoped, safe failures for Champion Catalogue capture stages', () => {
    expect(formatChampionCatalogueCaptureFailure('start-browser'))
      .toBe('The Champion Catalogue screenshot browser is temporarily unavailable. Please try again shortly.');
    expect(formatChampionCatalogueCaptureFailure('wait-for-viewer'))
      .toBe('The Champion Catalogue did not finish loading in time. Please try again shortly.');
    expect(formatChampionCatalogueCaptureFailure('capture-image'))
      .toBe('The Champion Catalogue loaded, but its images could not be created. Please try again shortly.');
  });

  it('does not present upstream Riot or data-provider failures as invalid viewer input', () => {
    expect(getRiotAccountViewerErrorStatus(new Error('fetch failed'))).toBe(503);
    expect(getRiotAccountViewerErrorStatus(new Error('Riot API rejected the configured API key.'))).toBe(403);
    expect(getRiotAccountViewerErrorStatus(new Error('Riot API rate limit reached. Try again in a moment.'))).toBe(429);
    expect(getRiotAccountViewerErrorStatus(new Error('Riot API request failed with status 500.'))).toBe(502);
    expect(getRiotAccountViewerErrorStatus(new Error('Enter a Riot ID in the format GameName#TagLine.'))).toBe(400);
  });
});
