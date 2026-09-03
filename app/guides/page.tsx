import type { Metadata } from 'next';
import { PublicActionLink, PublicContentCard, PublicContentSection, PublicPageShell, PublicProse } from '@/components/public-content-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'KnowLeague Game and Feature Guides',
  description: 'Learn how KnowLeague games, the League Account Viewer, and Riftbound collection tools work before you play.',
  path: '/guides',
  keywords: [
    'KnowLeague games guide',
    'League of Legends puzzle games',
    'League Account Viewer guide',
    'Riftbound collection tracker guide',
  ],
});

const gameGuides = [
  {
    title: 'Skindle',
    href: '/skindle',
    accent: 'amber' as const,
    summary: 'A daily skin-identification puzzle built around useful clues instead of a single lucky guess.',
    details: 'Start with a champion, skin line, release year, rarity, gender, role, or species clue and narrow the possibilities with each guess. The target is shared for the day, so a good result is easy to compare with friends without spoiling tomorrow\'s puzzle.',
  },
  {
    title: 'Splash Scramble',
    href: '/splash-scramble',
    accent: 'sky' as const,
    summary: 'Rebuild a scrambled League splash image by putting its pieces back in the right places.',
    details: 'The puzzle rewards visual memory and steady solving. Swap tiles, watch the image take shape, and use the daily result to track how efficiently you recognized the skin or champion represented by the artwork.',
  },
  {
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    accent: 'cyan' as const,
    summary: 'Identify champions from their ability icons in a solo round or a race with friends.',
    details: 'Daily and chaos modes give players a shared target, while casual mode lets you choose a difficulty and play at your own pace. Higher difficulties reduce the help available and make mistakes more expensive, so the mode can grow with your knowledge.',
  },
  {
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    accent: 'sky' as const,
    summary: 'Recognize League skin lines under time pressure, alone or alongside other players.',
    details: 'The game uses the same broad solo-quiz structure as Ability Blitz while asking a different visual question. Choose daily, casual, or chaos play, then use the difficulty and modifiers to decide how much assistance you want.',
  },
  {
    title: 'Skincognito',
    href: '/skincognito',
    accent: 'rose' as const,
    summary: 'A live deduction game where players try to identify one another\'s hidden skins.',
    details: 'Create or join a room, pick or be given a random skin, choose from the available category clues, and make guesses before the other players solve yours. Think of it like guess who with league skins.',
  },
  {
    title: 'Carving Revelation',
    href: '/carving-revelation',
    accent: 'amber' as const,
    summary: 'Reveal a hidden League skin through shared carving actions and make the right guess before the room moves on.',
    details: 'Players take turns exposing parts of the hidden artwork and guessing when the visible evidence is enough. ',
  },
  {
    title: 'Category Clash',
    href: '/category-clash',
    accent: 'emerald' as const,
    summary: 'Name valid, distinct League answers from rotating categories while the clock is running.',
    details: 'The challenge is not only speed; it is finding an answer that another player has not already used. If you miss, you get a strike and the round continues until the game\'s last-player-standing rules determine a winner.',
  },
  {
    title: 'Mastery Master',
    href: '/mastery-master',
    accent: 'violet' as const,
    summary: 'Put your League champion-mastery knowledge to the test with a focused solo challenge.',
    details: 'Mastery Master is a standalone challenge for players who enjoy account context and champion knowledge together. Put yours or anothers Riot ID in and try to guess the "higher or lower" mastery.',
  },
];

export default function GuidesPage() {
  return (
    <PublicPageShell
      eyebrow="KnowLeague guides"
      title="Know what you are opening before the timer starts."
      description="These short guides explain the question each game asks, what affects your result, and where the account and Riftbound tools fit in. You can play immediately or use the details to choose a better starting point."
      actions={<PublicActionLink href="/games">Open the game hub</PublicActionLink>}
    >
      <PublicContentSection id="game-guides" eyebrow="Game guide" title="Eight ways to test what you know" description="Every game is free to play. Some modes are daily, some are repeatable, and multiplayer games need a room before the match begins.">
        <div className="grid gap-4 md:grid-cols-2">
          {gameGuides.map((guide) => (
            <PublicContentCard key={guide.href} title={guide.title} accent={guide.accent}>
              <p className="font-semibold text-slate-200">{guide.summary}</p>
              <p>{guide.details}</p>
              <PublicActionLink href={guide.href} secondary>Open {guide.title}</PublicActionLink>
            </PublicContentCard>
          ))}
        </div>
      </PublicContentSection>

      <PublicContentSection id="tools" eyebrow="Tools guide" title="More than games">
        <div className="grid gap-4 md:grid-cols-2">
          <PublicContentCard title="League Account Viewer" accent="cyan">
            <p>Enter a Riot ID and choose its platform to view public account context such as match history, champion mastery, ranked entries, challenges, and live-game information when the relevant Riot data is available.</p>
            <p>The viewer can cache recent profile snapshots to avoid unnecessary repeat requests, but Riot remains the source of the account data. A result can be delayed or unavailable and should not be treated as an official rating.</p>
            <PublicActionLink href="/riot-account-viewer" secondary>Open Account Viewer</PublicActionLink>
          </PublicContentCard>
          <PublicContentCard title="Riftbound collection tools" accent="violet">
            <p>Browse the card catalogue by set and card details, then use the inventory, binder, deck, sharing, and community tools to organize what you own and what you want to build.</p>
            <p>Market values are estimates from periodic snapshots. They are useful for context and history, not a promise that a card will sell for the displayed amount. It is a large dataset so some information may be missing.</p>
            <PublicActionLink href="/riftbound/inventory" secondary>Browse the catalogue</PublicActionLink>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="getting-started" eyebrow="Getting started" title="A simple way to pick your first session">
        <PublicProse>
          <p>Choose Skindle or Splash Scramble if you want a short daily visit. Choose Ability Blitz or Skin Champion if you want to set a difficulty and play several rounds. Choose Skincognito, Carving Revelation, or Category Clash when you have a group ready to join a room.</p>
          <p>If you are here to understand your own account or collection, start with the League Account Viewer or the Riftbound catalogue. An account is useful for saving progress and social features, but it is not required for the public games.</p>
        </PublicProse>
      </PublicContentSection>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-black text-white">Want the sources and standards behind the features?</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">The About page explains catalogue maintenance, account lookups, market estimates, and our independence from Riot Games.</p>
        </div>
        <PublicActionLink href="/about">Read About and Data</PublicActionLink>
      </div>
    </PublicPageShell>
  );
}
