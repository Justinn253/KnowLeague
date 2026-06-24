import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-6 text-slate-400">
      <div className="mx-auto grid w-full max-w-7xl gap-4 text-xs leading-5 sm:px-6 lg:px-10">
        <div className="flex flex-wrap gap-x-4 gap-y-2 font-semibold">
          <Link href="/privacy" className="transition hover:text-amber-200">Privacy Policy</Link>
          <Link href="/terms" className="transition hover:text-amber-200">Terms of Service</Link>
          <Link href="https://developer.riotgames.com/" className="transition hover:text-amber-200">Riot Developer Portal</Link>
        </div>
        <p>
          KnowLeague isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially
          involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or
          registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
