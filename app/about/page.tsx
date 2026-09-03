import type { Metadata } from 'next';
import { Database, Gamepad2, ShieldCheck, Users } from 'lucide-react';
import { PublicActionLink, PublicContentCard, PublicContentSection, PublicPageShell, PublicProse } from '@/components/public-content-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'About KnowLeague and Our Data',
  description: 'Learn what KnowLeague is, how its games and tools work, and how League and Riftbound data is sourced and maintained.',
  path: '/about',
  keywords: ['about KnowLeague', 'KnowLeague data sources', 'League of Legends game tools', 'Riftbound collection tracker'],
});

export default function AboutPage() {
  return (
    <PublicPageShell
      eyebrow="About KnowLeague"
      title="Small games, useful context, and room to compete."
      description="KnowLeague is an independent fan-made web app for League of Legends puzzles, account context, and Riftbound collection tools. We build focused experiences that are quick to understand and easy to return to."
      actions={
        <>
          <PublicActionLink href="/games">Explore the games</PublicActionLink>
          <PublicActionLink href="/guides" secondary>Read the guides</PublicActionLink>
        </>
      }
    >
      <PublicContentSection id="what-we-do" eyebrow="What we do" title="A home for a few different kinds of play">
        <div className="grid gap-4 md:grid-cols-3">
          <PublicContentCard
            title="Games"
            accent="amber"
            icon={<Gamepad2 size={22} className="shrink-0 text-amber-200" aria-hidden="true" />}
          >
            <p>Daily puzzles, timed quizzes, deduction rounds, and group games turn familiar League details into short, replayable challenges.</p>
          </PublicContentCard>
          <PublicContentCard
            title="Account tools"
            accent="cyan"
            icon={<Database size={22} className="shrink-0 text-cyan-200" aria-hidden="true" />}
          >
            <p>The League Account Viewer brings public Riot account details, match history, mastery, ranked information, challenges, and patch notes into one place.</p>
          </PublicContentCard>
          <PublicContentCard
            title="Riftbound"
            accent="violet"
            icon={<Users size={22} className="shrink-0 text-violet-200" aria-hidden="true" />}
          >
            <p>Riftbound players can browse cards, track inventory, compare sets, build decks, review market details, and share ideas with the community.</p>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="how-it-works" eyebrow="How it works" title="The rules are different, but the goal is the same">
        <PublicProse>
          <p>KnowLeague games are designed around a clear question: can you recognize the answer, solve the image, or outlast the people in the room? Each mode keeps the interaction focused on that question instead of burying it under setup.</p>
          <p>Daily games use a shared target so players have the same puzzle to discuss. Solo quizzes use the local catalogue and shared difficulty rules to make a result meaningful across sessions. Multiplayer games use a server-authoritative lobby and realtime updates so everyone sees the same match state.</p>
        </PublicProse>
      </PublicContentSection>

      <PublicContentSection id="data" eyebrow="Data and methodology" title="Where the information comes from" description="We separate game content, live account lookups, and market estimates because they have different sources and different levels of certainty.">
        <div className="grid gap-4 md:grid-cols-3">
          <PublicContentCard title="League game catalogues" accent="amber">
            <p>Ability, champion, skin, and descriptive metadata are normalized during catalogue maintenance from Riot&apos;s Data Dragon and CommunityDragon resources, together with documented metadata sources and manual overrides where a field needs clarification.</p>
            <p>The generated catalogue ships with the application. Gameplay does not download a full third-party dataset every time someone opens a game.</p>
          </PublicContentCard>
          <PublicContentCard title="Riot account information" accent="cyan">
            <p>The Account Viewer requests public account and match information through Riot&apos;s developer APIs after a visitor supplies a Riot ID and platform. Results may be delayed, incomplete, rate limited, or unavailable when Riot changes or limits an endpoint.</p>
            <p>Displayed account information is a convenience view. It is not an official Riot leaderboard, endorsement, or competitive rating.</p>
          </PublicContentCard>
          <PublicContentCard title="Riftbound cards and prices" accent="violet">
            <p>The Riftbound catalogue uses the source feeds configured for card metadata and artwork. Market snapshots use TCGCSV&apos;s TCGplayer product data when available, with catalogue fallback values clearly treated as estimates.</p>
            <p>A displayed market value is not a guaranteed sale price. Prices vary by condition, finish, listing, location, and time.</p>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="scoring" eyebrow="Results and scoring" title="What your result means">
        <div className="grid gap-4 md:grid-cols-3">
          <PublicContentCard title="Daily results">
            <p>Skindle and Splash Scramble use a shared daily target. Your result reflects how many guesses or moves you needed, how quickly you solved the puzzle where a timer applies, and whether you kept your streak alive.</p>
          </PublicContentCard>
          <PublicContentCard title="Quiz results">
            <p>Ability Blitz and Skin Champion record completed items, time, and mistakes. Difficulty changes the help available, the visibility of upcoming items, and the cost of wrong guesses.</p>
          </PublicContentCard>
          <PublicContentCard title="Multiplayer results">
            <p>Live games keep lobby membership, progress, turns, reconnect windows, and completion on the server. The winner is determined by the rules of that game, not by a client-side display alone.</p>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="standards" eyebrow="Our standards" title="Original work, clear boundaries, and corrections when needed">
        <div className="grid gap-4 md:grid-cols-2">
          <PublicContentCard title="Editorial and product standards" accent="emerald">
            <p>KnowLeague&apos;s rules, interface, explanations, scoring behavior, and data transformations are our own product work. We aim to explain what a feature does, identify its important limits, and avoid presenting an estimate as a fact.</p>
            <p>We do not publish copied articles as filler. When we use third-party names, data, or artwork, we keep the source and ownership boundary clear.</p>
          </PublicContentCard>
          <PublicContentCard
            title="Corrections and community safety"
            accent="rose"
            icon={<ShieldCheck size={22} className="shrink-0 text-rose-200" aria-hidden="true" />}
          >
            <p>Data can change and mistakes can happen. If a catalogue field, account result, price estimate, or game rule looks wrong, contact us with the page and a short description so we can investigate it.</p>
            <p>Community posts, chat, reports, and profiles are subject to moderation. We remove or restrict content that harms other players or the service.</p>
          </PublicContentCard>
        </div>
      </PublicContentSection>

      <PublicContentSection id="audience" eyebrow="Who it is for" title="Built for players who like to know one more thing">
        <PublicProse>
          <p>You can use KnowLeague casually, compete with friends, or use the account and collection tools to organize information you already care about. The games are meant for both experienced players and curious newcomers; you do not need an account to try the public games.</p>
          <p>KnowLeague is independent. League of Legends and its related names and assets belong to Riot Games and their respective owners. Riftbound and its related names and assets belong to their respective owners. KnowLeague is not endorsed by Riot Games.</p>
        </PublicProse>
      </PublicContentSection>

      <PublicContentSection id="monetization" eyebrow="Transparency" title="About advertising and monetization">
        <PublicProse>
          <p>KnowLeague is currently an alpha service. We are preparing for possible Google AdSense use, but advertising is not active while the site addresses its AdSense content review. Any future advertising will be disclosed in the Privacy Policy and will not change the game rules, account data, or community moderation standards.</p>
          <p>We will keep paid features, if any are introduced, separate from Riot account data access and compliant with the relevant platform policies.</p>
        </PublicProse>
      </PublicContentSection>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-black text-white">Have a correction or a good idea?</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">Tell us what you found and include the page or feature involved.</p>
        </div>
        <PublicActionLink href="/contact">Contact KnowLeague</PublicActionLink>
      </div>
    </PublicPageShell>
  );
}
