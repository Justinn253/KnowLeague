export type NewsEntry = {
  id: string;
  /** Publication timestamp in UTC (ISO 8601). Future entries stay hidden. */
  publishedAt: string;
  title: string;
  /** Short text used by the home preview when supplied. */
  summary?: string;
  paragraphs: readonly string[];
  sections?: readonly {
    heading: 'New Game' | 'New Feature' | 'Bug Fixes';
    items: readonly string[];
  }[];
} & ({ kind: 'update'; version: `${number}.${number}.${number}` } | { kind: 'news' });

/** Manually add a post for each production release or announcement. Keep IDs unique. Use major.minor.patch versions for updates. */
export const NEWS_ENTRIES: readonly NewsEntry[] = [
  {
    id: 'update-2026-09-16-randodraft-and-site-improvements',
    kind: 'update',
    version: '0.1.0',
    publishedAt: '2026-09-16T00:00:00.000Z',
    title: 'Update 0.1.0 - Randodraft and other fixes',
    summary: 'Introducing Randodraft, News and Updates, and Riftbound mobile fixes.',
    paragraphs: [],
    sections: [
      {
        heading: 'New Game',
        items: [
          "Randodraft: draft randomized champions and six-item builds for Summoner's Rift or ARAM.",
          "Create one or two teams of up to five players, with lane assignments on Summoner's Rift.",
          'Spin each pick manually (or use quick roll) to see how good your team will be.',
          'Use it to mess around or be daring and try your picks in a real game.',
          'Each draft is shareable, so try it today with your friends!'
        ],
      },
      {
        heading: 'New Feature',
        items: [
          'News and Updates: browse the latest release notes and announcements for KnowLeague.',
        ],
      },
      {
        heading: 'Bug Fixes',
        items: ['Riftbound catalogue fixes for mobile'],
      },
    ],
  },
];

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function getNewsEntries(now = Date.now(), entries: readonly NewsEntry[] = NEWS_ENTRIES) {
  const published = entries
    .filter((entry) => Date.parse(entry.publishedAt) <= now)
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return {
    latest: published[0],
    recent: published.filter((entry) => Date.parse(entry.publishedAt) > now - RECENT_WINDOW_MS),
    archived: published.filter((entry) => Date.parse(entry.publishedAt) <= now - RECENT_WINDOW_MS),
  };
}

export function formatNewsDate(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(timestamp));
}
