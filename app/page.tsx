import { ArrowRight, Clock3, Crown, Search, ShieldQuestion, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type GameLink = {
  title: string;
  href: string;
  description: string;
  status: string;
  imageUrl: string;
  icon: typeof Clock3;
  mostPlayed?: boolean;
};

const games: GameLink[] = [
  {
    title: 'Ability Blitz',
    href: '/ability-blitz',
    description: 'Race the clock through a daily set of League ability icons.',
    status: 'Play',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Yasuo.png',
    icon: Clock3,
  },
  {
    title: 'Skin Champion',
    href: '/skin-champion',
    description: 'Identify champions and cosmetics from skin-focused clues.',
    status: 'Play',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Ezreal.png',
    icon: Sparkles,
  },
  {
    title: 'Skindle',
    href: '/skindle',
    description: 'Guess the daily skin by comparing category clues after each attempt.',
    status: 'Play',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_7.jpg',
    icon: Search,
    mostPlayed: true,
  },
  {
    title: 'Skincognito',
    href: '/skincognito',
    description: 'Create a lobby and uncover your opponent’s hidden skin.',
    status: 'Alpha',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    icon: ShieldQuestion,
  },
  {
    title: 'Mastery Master',
    href: '/mastery-master',
    description: 'Build champion knowledge through focused mastery-style challenges.',
    status: 'Coming soon',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Lux.png',
    icon: Crown,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-10 lg:px-12">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
            League quiz hub
          </p>
          <h1 className="mt-4 text-5xl font-bold text-white sm:text-6xl">KnowLeague</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Choose a focused game mode and sharpen your League of Legends knowledge through fast,
            replayable challenges.
          </p>
        </header>

        <section aria-label="Game modes" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => {
            const Icon = game.icon;

            return (
              <Link
                key={game.href}
                href={game.href}
                className={`group relative flex min-h-[19rem] flex-col justify-between overflow-hidden rounded-2xl border bg-slate-900/85 shadow-glow transition hover:-translate-y-1 hover:border-amber-300/60 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                  game.mostPlayed ? 'border-amber-300/80 shadow-amber-950/30' : 'border-white/10'
                }`}
              >
                {game.mostPlayed ? (
                  <span className="absolute right-4 top-0 z-10 -translate-y-1/2 rounded-full border border-amber-200/60 bg-amber-300 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-950 shadow-lg shadow-amber-950/30">
                    Most Popular
                  </span>
                ) : null}
                <div className="relative h-28 border-b border-white/10 bg-slate-950">
                  <Image
                    src={game.imageUrl}
                    alt=""
                    width={96}
                    height={96}
                    className="absolute right-5 top-4 h-24 w-24 rounded-2xl object-cover ring-1 ring-white/10"
                  />
                  <div className="absolute left-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-amber-300">
                    <Icon size={20} />
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold text-white">{game.title}</h2>
                      <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-300">
                        {game.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{game.description}</p>
                  </div>

                  <div className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                    Open game
                    <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </section>
    </main>
  );
}
