export type HelpCenterArticle = {
  id: string;
  title: string;
  category: string;
  summary: string;
  keywords: readonly string[];
};

export const HELP_CENTER_ARTICLES: readonly HelpCenterArticle[] = [
  {
    id: 'account-and-profile',
    title: 'Account, profile, and privacy controls',
    category: 'Account',
    summary: 'Update your profile in Account Info. You can make your profile private and independently choose whether aggregate game statistics are public.',
    keywords: ['account', 'profile', 'privacy', 'private', 'username', 'public statistics', 'stats'],
  },
  {
    id: 'friends-and-messages',
    title: 'Friends, requests, and messages',
    category: 'Social',
    summary: 'Use the friends menu to search for players, send requests, manage incoming requests, and message accepted friends. You can close friend requests in Account Info.',
    keywords: ['friend', 'friends', 'request', 'message', 'chat', 'social', 'block'],
  },
  {
    id: 'game-statistics',
    title: 'How game statistics work',
    category: 'Gameplay',
    summary: 'Your detailed game history stays private. The public-statistics option shares only aggregate totals and never individual guesses, dates, or match records.',
    keywords: ['statistics', 'stats', 'streak', 'guesses', 'scores', 'leaderboard'],
  },
  {
    id: 'multiplayer-lobbies',
    title: 'Joining a multiplayer lobby',
    category: 'Gameplay',
    summary: 'Create or join a lobby from a multiplayer game. Share the lobby code or send an invite to an accepted friend from the friends menu.',
    keywords: ['multiplayer', 'lobby', 'invite', 'code', 'join', 'reconnect'],
  },
  {
    id: 'reporting-and-safety',
    title: 'Report a problem or player',
    category: 'Safety',
    summary: 'Use Contact Us to report a bug, billing issue, account concern, or player behavior. Include only the details needed for staff to investigate.',
    keywords: ['report', 'moderation', 'safety', 'abuse', 'harassment', 'contact', 'ticket'],
  },
  {
    id: 'riftbound-scanning',
    title: 'Riftbound card scanning',
    category: 'Riftbound',
    summary: 'Riftbound card scanning is temporarily unavailable while it is reviewed. Other Riftbound features are unaffected.',
    keywords: ['riftbound', 'scan', 'scanner', 'card', 'camera'],
  },
] as const;

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function searchHelpCenter(query: string, articles = HELP_CENTER_ARTICLES): HelpCenterArticle[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [...articles];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return articles
    .map((article) => {
      const title = article.title.toLocaleLowerCase();
      const category = article.category.toLocaleLowerCase();
      const summary = article.summary.toLocaleLowerCase();
      const keywords = article.keywords.join(' ').toLocaleLowerCase();
      const score = terms.reduce((total, term) => total
        + (title.includes(term) ? 5 : 0)
        + (keywords.includes(term) ? 3 : 0)
        + (category.includes(term) ? 2 : 0)
        + (summary.includes(term) ? 1 : 0), 0);
      return { article, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title))
    .map(({ article }) => article);
}
