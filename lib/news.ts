export type NewsEntry = {
  id: string;
  /** Publication timestamp in UTC (ISO 8601). Future entries stay hidden. */
  publishedAt: string;
  title: string;
  /** Short text used by the home preview when supplied. */
  summary?: string;
  paragraphs: readonly string[];
  sections?: readonly {
    heading: 'New Game' | 'New Tool' | 'New Feature' | 'Bug Fixes';
    items: readonly string[];
  }[];
} & ({ kind: 'update'; version: `${number}.${number}.${number}` } | { kind: 'news' });

/** Manually add a post for each production release or announcement. Keep IDs unique. Use major.minor.patch versions for updates. */
export const NEWS_ENTRIES: readonly NewsEntry[] = [
  {
    id: 'update-2026-10-14-champion-catalogue',
    kind: 'update',
    version: '0.4.0',
    publishedAt: '2026-10-14T23:43:05.8705304Z',
    title: 'Update 0.4.0 - Champion Catalogue',
    summary: 'Browse the League roster and explore champion overviews, skins, and gameplay details.',
    paragraphs: [],
    sections: [
      {
        heading: 'New Feature',
        items: [
          'Champion Catalogue: browse all current champions and view their details.',
          'Champion profiles: inspect official overview lore, combat style, abilities, skins, chromas, and available in-depth gameplay details.',
          'Skin collections: navigate each champion’s cosmetics with release, price, availability, skin-line, rarity, official lore, chroma, and Model Viewer information.',
        ],
      },
    ],
  },
  {
    id: 'update-2026-10-07-token-leaderboards',
    kind: 'update',
    version: '0.3.0',
    publishedAt: '2026-10-07T17:54:46.0202622Z',
    title: 'Update 0.3.0 - Token Leaderboards',
    summary: 'Browse League Challenge token rankings by region and search for individual players.',
    paragraphs: [],
    sections: [
      {
        heading: 'New Tool',
        items: [
          'Token Leaderboards: browse League Challenge tokens.',
          'View the top 250 players for each region or all regions combined.',
          'Token leaderboards refresh daily at 5pm EST.',
        ],
      },
    ],
  },
  {
    id: 'update-2026-09-22-augment-builder',
    kind: 'update',
    version: '0.2.0',
    publishedAt: '2026-09-22T20:30:00.000Z',
    title: 'Update 0.2.0 - Augment Builder Arrives!',
    summary: 'Create, publish, and discover custom ARAM Mayhem augments.',
    paragraphs: [],
    sections: [
      {
        heading: 'New Tool',
        items: [
          'ARAM Mayhem Augment Builder: create custom augments with selectable rarity, icons, descriptions, and extra details.',
          'Publish your creations to the community hub, where players can browse, rate, and react to augments.',
        ],
      },
    ],
  },
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
