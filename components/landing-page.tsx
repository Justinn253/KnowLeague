'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Gamepad2, LogIn, Swords, UserPlus } from 'lucide-react';
import { GameIconImage, GameSplashImage } from '@/components/game-asset-image';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { playUiSound } from '@/lib/ui-sounds';

type LandingCardProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  theme: {
    border: string;
    icon: string;
    divider: string;
    title: string;
  };
  backgroundImage: string;
  children?: ReactNode;
};

function LandingCard({ href, title, description, icon, theme, backgroundImage, children }: LandingCardProps) {
  return (
    <article className={`group relative isolate overflow-hidden rounded-3xl border bg-slate-950 ${theme.border} transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5`}>
      <div className="flex min-w-0 flex-1 flex-col min-[1000px]:flex-row">
        <Link
          href={href}
          prefetch={false}
          onMouseEnter={() => playUiSound('autocomplete-hover')}
          onFocus={() => playUiSound('autocomplete-hover')}
          onClick={() => playUiSound('autocomplete-select')}
          className="group/card flex min-w-0 flex-1 flex-col outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200 min-[1000px]:flex-row"
        >
          <div className="relative h-20 shrink-0 overflow-hidden border-b border-white/15 bg-slate-950/80 sm:h-24 min-[1000px]:h-auto min-[1000px]:min-h-40 min-[1000px]:w-80 min-[1000px]:border-b-0 min-[1000px]:border-r lg:w-[22rem]">
            <GameSplashImage
              src={backgroundImage}
              alt=""
              fill
              sizes="(min-width: 1280px) 22rem, (min-width: 1000px) 20rem, 100vw"
              className="object-contain p-2 transition-transform duration-300 ease-out group-hover:scale-[1.025]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/10 via-transparent to-slate-950/25" />
          </div>
          <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-3 bg-slate-950/95 p-3 transition-colors duration-200 ease-out group-hover:bg-slate-900/95 sm:gap-4 sm:p-4 min-[1000px]:flex-nowrap min-[1000px]:gap-4 min-[1000px]:p-6">
            <div className="grid w-full min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 min-[1000px]:grid-cols-[auto_auto_minmax(0,1fr)_auto] min-[1000px]:gap-4">
              <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border p-2 transition-[background-color,border-color,transform] duration-200 ease-out group-hover:scale-[1.02] group-hover:border-white/55 group-hover:bg-white/[0.06] min-[1000px]:h-16 min-[1000px]:w-16 min-[1000px]:p-3 ${theme.icon}`}>
                {icon}
              </span>
              <span aria-hidden="true" className={`hidden h-14 w-px shrink-0 bg-gradient-to-b from-transparent via-current to-transparent min-[1000px]:block ${theme.divider}`} />
              <span className="min-w-0">
                <span className={`block text-xl font-black leading-tight tracking-tight text-white transition-colors sm:text-2xl min-[1000px]:text-3xl ${theme.title}`}>{title}</span>
                <span className="mt-1.5 block max-w-3xl text-[0.8125rem] leading-5 text-slate-200 min-[1000px]:mt-2 min-[1000px]:text-sm min-[1000px]:leading-6">{description}</span>
              </span>
              <ArrowRight size={20} className="h-5 w-5 shrink-0 text-slate-400 transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-amber-200 min-[1000px]:h-6 min-[1000px]:w-6" />
            </div>
          </div>
        </Link>
        {children ? <div className="w-full shrink-0 border-t border-white/10 bg-slate-950/80 p-3 transition-colors duration-200 ease-out group-hover:bg-slate-900/90 min-[1000px]:flex min-[1000px]:w-56 min-[1000px]:items-center min-[1000px]:border-l min-[1000px]:border-t-0 min-[1000px]:p-5">{children}</div> : null}
      </div>
    </article>
  );
}

function SmallActionLink({ href, children, icon, className = '', fullWidth = false }: { href: string; children: ReactNode; icon: ReactNode; className?: string; fullWidth?: boolean }) {
  const defaultClassName = className || 'border-white/15 bg-slate-900 text-slate-100 hover:border-amber-200/50 hover:bg-slate-800 hover:text-amber-100';
  const widthClassName = fullWidth ? 'w-full' : 'w-full md:w-auto';
  const heightClassName = fullWidth ? 'min-h-10 min-[1000px]:min-h-11' : 'min-h-11';

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => playUiSound('autocomplete-select')}
      className={`inline-flex ${heightClassName} ${widthClassName} items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${defaultClassName}`}
    >
      {icon}
      {children}
    </Link>
  );
}

export function LandingPage({ newsPanel }: { newsPanel?: ReactNode }) {
  const [sessionResolved, setSessionResolved] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [linkedRiotId, setLinkedRiotId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadAccountDetails = async (session: Parameters<Parameters<typeof subscribeToAuthSession>[0]>[0]) => {
      if (disposed) return;
      if (!session) {
        setIsLoggedIn(false);
        setLinkedRiotId(null);
        setSessionResolved(true);
        return;
      }

      setIsLoggedIn(true);
      setLinkedRiotId(null);
      const supabase = getOptionalSupabaseClient();
      if (!supabase) {
        setSessionResolved(true);
        return;
      }

      const { data } = await supabase
        .from('profile_private_details')
        .select('riot_account_name')
        .eq('user_id', session.user.id)
        .maybeSingle<{ riot_account_name: string | null }>();

      if (disposed) return;
      setLinkedRiotId(data?.riot_account_name?.trim() || null);
      setSessionResolved(true);
    };

    const unsubscribe = subscribeToAuthSession((session) => {
      setSessionResolved(false);
      void loadAccountDetails(session);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const linkedRiotHref = linkedRiotId
    ? `/riot-account-viewer?riotId=${encodeURIComponent(linkedRiotId)}`
    : '/riot-account-viewer';

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#030712] text-slate-100">
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:gap-14 sm:px-6 sm:py-16 lg:px-12">
        <header className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Welcome to KnowLeague</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
            One home for your games, accounts, and communities.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            Pick a destination below and jump straight into the part of KnowLeague you want to explore.
          </p>
        </header>

        <div className="relative grid gap-5">
          <LandingCard
            href="/games"
            title="Games"
            description="Click here to play one of our many games, solo or multiplayer. Test your League knowledge, compete with friends, or start with our daily Skindle puzzle."
            icon={<Gamepad2 size={36} className="h-9 w-9 text-amber-200 min-[1000px]:h-[42px] min-[1000px]:w-[42px]" />}
            theme={{
              border: 'border-amber-300/45 hover:border-amber-200/75',
              icon: 'border-amber-200/45 bg-amber-300/10 text-amber-100',
              divider: 'text-amber-200/80',
              title: 'group-hover:text-amber-100',
            }}
            backgroundImage="/game-snapshots/skindle_snapshot.png"
          >
            <SmallActionLink fullWidth href="/skindle" icon={<ArrowRight size={15} />} className="border-amber-200/55 bg-amber-300 text-slate-950 hover:border-amber-100 hover:bg-amber-200 focus:ring-amber-100">
              Try Skindle now
            </SmallActionLink>
          </LandingCard>

          <LandingCard
            href="/riot-account-viewer"
            title="League Account Viewer"
            description="Want to look up your League of Legends profile? View match history, champion mastery, challenges, and other account information."
            icon={<GameIconImage src="/Icons/LoL-Symbol.png" alt="" width={96} height={96} className="h-10 w-10 shrink-0 object-contain min-[1000px]:h-16 min-[1000px]:w-16 min-[1000px]:scale-110" />}
            theme={{
              border: 'border-cyan-300/45 hover:border-cyan-200/75',
              icon: 'border-cyan-200/45 bg-cyan-300/10 text-cyan-100',
              divider: 'text-cyan-200/80',
              title: 'group-hover:text-cyan-100',
            }}
            backgroundImage="/game-snapshots/lav_snapshot.png"
          >
            {sessionResolved && isLoggedIn && linkedRiotId ? (
              <SmallActionLink fullWidth href={linkedRiotHref} icon={<ArrowRight size={15} />} className="border-cyan-200/45 bg-cyan-300/15 text-cyan-100 hover:border-cyan-100 hover:bg-cyan-300/25 focus:ring-cyan-100">
                View my linked profile
              </SmallActionLink>
            ) : sessionResolved && isLoggedIn ? (
              <SmallActionLink fullWidth href="/profile" icon={<ArrowRight size={15} />} className="border-cyan-200/45 bg-cyan-300/15 text-cyan-100 hover:border-cyan-100 hover:bg-cyan-300/25 focus:ring-cyan-100">
                Your League profile
              </SmallActionLink>
            ) : null}
          </LandingCard>

          <LandingCard
            href="/champions"
            title="Champion Catalogue"
            description="Browse every League champion by name, lane, and class. Explore their overview, skins, chromas, and gameplay details."
            icon={<Swords size={36} className="h-9 w-9 text-red-100 min-[1000px]:h-[42px] min-[1000px]:w-[42px]" />}
            theme={{
              border: 'border-red-300/45 hover:border-red-200/75',
              icon: 'border-red-200/45 bg-red-400/10 text-red-100',
              divider: 'text-red-200/80',
              title: 'group-hover:text-red-100',
            }}
            backgroundImage="/game-snapshots/champion_catalogue.png"
          >
            <SmallActionLink fullWidth href="/champions" icon={<ArrowRight size={15} />} className="border-red-200/45 bg-red-400/15 text-red-100 hover:border-red-100 hover:bg-red-400/25 focus:ring-red-100">
              Browse catalogue
            </SmallActionLink>
          </LandingCard>

          <LandingCard
            href="/riftbound/community"
            title="Riftbound"
            description="Are you a Riftbound player? Track your collection, create decks, and participate in conversations with other Riftbound players."
            icon={<GameIconImage src="/Icons/riftbound.png" alt="" width={72} height={72} className="h-10 w-10 object-contain min-[1000px]:h-14 min-[1000px]:w-14" />}
            theme={{
              border: 'border-violet-300/45 hover:border-violet-200/75',
              icon: 'border-orange-300/45 bg-orange-300/10 text-orange-100',
              divider: 'text-orange-200/80',
              title: 'group-hover:text-orange-100',
            }}
            backgroundImage="/game-snapshots/riftbound_snapshot.png"
          >
            <SmallActionLink fullWidth href="/riftbound/inventory" icon={<ArrowRight size={15} />} className="border-orange-300/45 bg-orange-300/10 text-orange-100 hover:border-orange-200 hover:bg-orange-300/20 focus:ring-orange-100">
              Manage inventory
            </SmallActionLink>
          </LandingCard>
        </div>

        {newsPanel}

        {!isLoggedIn && sessionResolved ? (
          <aside className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-sm font-black text-white">Get more from KnowLeague</p>
              <p className="mt-1 text-sm text-slate-400">Account owners have access to more features across the app.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SmallActionLink href="/login" icon={<LogIn size={15} />}>Log in</SmallActionLink>
              <SmallActionLink href="/login?mode=signup" icon={<UserPlus size={15} />}>Sign up</SmallActionLink>
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
