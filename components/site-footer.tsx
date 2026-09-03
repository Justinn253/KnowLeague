import Link from 'next/link';
import { PrivacySettingsButton } from '@/components/privacy-settings-button';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950 px-4 py-6 text-slate-400">
      <div className="mx-auto grid w-full max-w-7xl gap-4 text-xs leading-5 sm:px-6 lg:px-10">
        <div className="flex flex-wrap gap-x-4 gap-y-2 font-semibold">
          <Link href="/about" prefetch={false} className="transition hover:text-amber-200">About and Data</Link>
          <Link href="/guides" prefetch={false} className="transition hover:text-amber-200">Game Guides</Link>
          <Link href="/contact" prefetch={false} className="transition hover:text-amber-200">Contact</Link>
          <Link href="/privacy" prefetch={false} className="transition hover:text-amber-200">Privacy Policy</Link>
          <Link href="/terms" prefetch={false} className="transition hover:text-amber-200">Terms of Service</Link>
          <PrivacySettingsButton />
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
