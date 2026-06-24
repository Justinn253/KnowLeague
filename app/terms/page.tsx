import Link from 'next/link';

const sections = [
  {
    title: 'Alpha Service',
    body: [
      'KnowLeague is provided as an alpha web application. Features may change, fail, disappear, or return inaccurate results while the product is being tested.',
      'Do not rely on KnowLeague for competitive, financial, legal, employment, or other high-stakes decisions.',
    ],
  },
  {
    title: 'Accounts and Conduct',
    body: [
      'You are responsible for activity from your account and browser session.',
      'Do not abuse public APIs, scrape aggressively, harass users, spam lobbies or messages, bypass rate limits, or attempt to access data you are not authorized to access.',
      'We may restrict, remove, or block accounts, lobbies, messages, or requests that harm the service or other users.',
    ],
  },
  {
    title: 'Riot Games and League of Legends',
    body: [
      'KnowLeague is an independent fan/developer product and is not endorsed by Riot Games.',
      'League of Legends names, marks, champion data, item data, and related assets belong to Riot Games or their respective owners.',
      'Riot account and match data may be delayed, incomplete, unavailable, rate limited, or changed by Riot Games APIs at any time.',
    ],
  },
  {
    title: 'User Content',
    body: [
      'Profile text, chat messages, contact submissions, and similar content must be lawful and respectful.',
      'You grant KnowLeague permission to store, display, transmit, and moderate content as needed to operate the application.',
    ],
  },
  {
    title: 'Monetization',
    body: [
      'KnowLeague currently targets an alpha launch. Ads, subscriptions, cosmetics, or paid upgrades must comply with Riot Games developer policies before release.',
      'Paid features must not sell Riot API data access in a way that violates Riot policies, create gambling mechanics, or imply Riot endorsement.',
    ],
  },
  {
    title: 'Disclaimers and Limitation',
    body: [
      'The service is provided as-is and as-available.',
      'To the maximum extent allowed by law, KnowLeague is not liable for lost data, service interruption, incorrect statistics, third-party API failures, or indirect damages.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="mx-auto grid max-w-4xl gap-6">
        <Link href="/" className="w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200">
          Back to Home
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">KnowLeague Alpha</p>
          <h1 className="mt-3 text-4xl font-black text-white">Terms of Service</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Last updated: June 24, 2026.
          </p>
        </header>

        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-slate-300">
              {section.body.map((item) => <li key={item}>- {item}</li>)}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm leading-6 text-amber-100">
          KnowLeague isn&apos;t endorsed by Riot Games and doesn&apos;t reflect Riot Games&apos; views. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
        </section>
      </section>
    </main>
  );
}
