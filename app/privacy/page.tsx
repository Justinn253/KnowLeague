import Link from 'next/link';

const sections = [
  {
    title: 'Information We Process',
    body: [
      'Account information you provide through Supabase Auth, including your email address and profile username.',
      'Profile details you choose to save, such as display name, about me text, friend settings, Discord username, and linked Riot account name.',
      'Riot account information you search for or link, including Riot ID, platform/region, public summoner details, ranked entries, match history, champion mastery, and challenge data returned by Riot APIs.',
      'Game and multiplayer data, including lobby codes, player progress, chat messages, friend requests, direct messages, contact submissions, and local gameplay statistics.',
      'Technical information such as request logs, IP-derived rate limiting data, browser storage used for session recovery, and error diagnostics.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'To provide account lookup, match history, mastery, challenge, quiz, multiplayer, social, and profile features.',
      'To remember recent searches, prevent abuse, debug production issues, enforce rate limits, and improve application reliability.',
      'To store aggregate or app-specific rankings based only on accounts searched through KnowLeague. These rankings are not official League of Legends global rankings.',
    ],
  },
  {
    title: 'Riot Games Data',
    body: [
      'KnowLeague uses Riot Games APIs and public game asset sources to display League of Legends account and match information.',
      'Riot account data is owned and controlled by Riot Games and is subject to Riot Games policies. KnowLeague is not endorsed by Riot Games.',
      'Successful Riot account searches may be stored to power shared search suggestions and internal aggregate metrics.',
    ],
  },
  {
    title: 'Storage and Retention',
    body: [
      'Some preferences, game progress, recent searches, and lobby pointers are stored in browser localStorage. Riot profile lookup responses may be cached in browser sessionStorage until the browser session closes.',
      'Server-side Riot lookup responses may be cached briefly to reduce API calls and rate-limit pressure.',
      'Account, profile, friend, message, lobby, contact, and aggregate metric records may remain in Supabase until deleted or cleaned up through future retention tooling.',
    ],
  },
  {
    title: 'Sharing',
    body: [
      'Public profile information may be visible to other users. Private account fields are intended to remain available only to the owner and server-side features.',
      'We do not sell personal information. Future analytics, ads, or payments will require updated disclosures before launch.',
      'We may disclose information when required for security, abuse prevention, legal compliance, or service operation.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can clear browser storage from your browser settings.',
      'You can edit your KnowLeague profile from the profile screen.',
      'For alpha deletion, privacy, or support requests, use the in-app contact action or the contact method provided by the site operator.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="mx-auto grid max-w-4xl gap-6">
        <Link href="/" className="w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200">
          Back to Home
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">KnowLeague Alpha</p>
          <h1 className="mt-3 text-4xl font-black text-white">Privacy Policy</h1>
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
