import { PublicActionLink, PublicContentCard, PublicContentSection } from '@/components/public-content-page';

export function HomeContent() {
  return (
    <section className="border-t border-white/10 bg-[#030712] text-slate-100">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:px-12">
        <PublicContentSection
          eyebrow="A little more context"
          title="Focused tools for League players"
          description="KnowLeague brings several small, purpose-built experiences together without asking you to learn a new system every time you visit."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <PublicContentCard title="Play" accent="amber">
              <p>Daily puzzles, timed quizzes, and multiplayer rounds turn familiar League details into quick challenges you can play alone or with friends.</p>
              <p>Each game explains its objective in the lobby or opening screen, so you can start a round without reading a rulebook first.</p>
            </PublicContentCard>
            <PublicContentCard title="Look up" accent="cyan">
              <p>The League Account Viewer organizes public Riot account information into one readable view, including match history, mastery, ranked data, challenges, and patch notes.</p>
              <p>Results can be delayed or incomplete when the Riot API is unavailable. KnowLeague presents the data as a convenience, not as an official Riot ranking.</p>
            </PublicContentCard>
            <PublicContentCard title="Collect and share" accent="violet">
              <p>Riftbound players can browse cards, track a collection, compare sets, build decks, review market details, and share community ideas.</p>
              <p>Collection values are estimates based on the available market snapshot and should not be treated as a guaranteed sale price.</p>
            </PublicContentCard>
          </div>
        </PublicContentSection>

        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="max-w-2xl">
            <p className="text-sm font-black text-white">Want to know how it all fits together?</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Read the short guides, data notes, and editorial standards behind the games and tools.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PublicActionLink href="/guides">Read the guides</PublicActionLink>
            <PublicActionLink href="/about" secondary>About and data</PublicActionLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GamesOverviewContent() {
  return (
    <section className="border-t border-white/10 bg-[#030712] text-slate-100">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:px-12">
        <PublicContentSection
          eyebrow="Before you start"
          title="Choose the kind of challenge you want"
          description="Some KnowLeague games reward quick recognition. Others reward patience, deduction, or knowing when to take a risk. The game cards above are the fastest way in; this overview explains what each group is built to do."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <PublicContentCard title="Daily puzzles" accent="amber">
              <p>Skindle and Splash Scramble give everyone a shared daily target. Your result is based on how efficiently you use the clues or solve the image, with streaks and personal progress available over time.</p>
            </PublicContentCard>
            <PublicContentCard title="Timed quizzes" accent="cyan">
              <p>Ability Blitz and Skin Champion use a shared catalogue of League details. Difficulty changes how much help you receive and how costly mistakes become, while daily and chaos modes add a repeatable competitive target.</p>
            </PublicContentCard>
            <PublicContentCard title="Live multiplayer" accent="rose">
              <p>Skincognito, Carving Revelation, and Category Clash use a lobby and realtime session so a group can play the same round together. A host sets the match up, and the server keeps the shared state consistent.</p>
            </PublicContentCard>
          </div>
        </PublicContentSection>

        <PublicContentSection title="Good places to begin" description="Start with a daily game for a quick visit, or open a guide if you want to understand the rules before joining a group round.">
          <div className="grid gap-4 md:grid-cols-3">
            <PublicContentCard title="Skindle">
              <p>Use champion, skin line, release year, rarity, role, and other clues to identify the day&apos;s mystery skin.</p>
              <PublicActionLink href="/skindle" secondary>Play Skindle</PublicActionLink>
            </PublicContentCard>
            <PublicContentCard title="Ability Blitz">
              <p>Recognize champions from their ability icons, then choose a difficulty and pace that fits your session.</p>
              <PublicActionLink href="/multiplayer/ability-blitz" secondary>Open Ability Blitz</PublicActionLink>
            </PublicContentCard>
            <PublicContentCard title="Skincognito">
              <p>Join a room and use the available category clues to work out another player&apos;s hidden skin before they find yours.</p>
              <PublicActionLink href="/skincognito" secondary>Open Skincognito</PublicActionLink>
            </PublicContentCard>
          </div>
        </PublicContentSection>

        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-black text-white">Every game has a little more behind it.</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">See the complete game-by-game guide, including the account and Riftbound tools.</p>
          </div>
          <PublicActionLink href="/guides">Open the game guides</PublicActionLink>
        </div>
      </div>
    </section>
  );
}
