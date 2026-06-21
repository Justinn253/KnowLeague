import { ArrowRight, Clock3, Crown, Search, ShieldQuestion, Sparkles, Users } from 'lucide-react';
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

const multiplayerGames: GameLink[] = [
  {
    title: 'Skincognito',
    href: '/skincognito',
    description: 'Create a lobby and uncover your opponent\'s hidden skin.',
    status: 'Play',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    icon: ShieldQuestion,
  },
  {
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    description: 'Create a lobby and prepare to race other players through ability icons.',
    status: 'Lobby',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Yasuo.png',
    icon: Users,
  },
  {
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    description: 'Create a lobby for a competitive skin-identification challenge.',
    status: 'Lobby',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Ezreal.png',
    icon: Users,
  },
];

const singlePlayerGames: GameLink[] = [
  {
    title: 'Ability Blitz',
    href: '/ability-blitz',
    description: 'Race the clock through a randomized set of League ability icons.',
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
    title: 'Mastery Master',
    href: '/mastery-master',
    description: 'Build champion knowledge through focused mastery-style challenges.',
    status: 'Coming soon',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Lux.png',
    icon: Crown,
  },
];

function GameCard({ game }: { game: GameLink }) {
  const Icon = game.icon;
  return (
    <Link
      href={game.href}
      className={`group relative flex min-h-[19rem] flex-col justify-between overflow-visible rounded-2xl border bg-slate-900/85 shadow-glow transition hover:-translate-y-1 hover:border-amber-300/60 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
        game.mostPlayed ? 'border-amber-300/80 shadow-amber-950/30' : 'border-white/10'
      }`}
    >
      {game.mostPlayed ? (
        <span className="absolute right-4 top-0 z-40 -translate-y-1/2 rounded-full border border-amber-200/60 bg-amber-300 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-950 shadow-lg shadow-amber-950/30">
          Most Popular
        </span>
      ) : null}
      <div className="relative h-28 rounded-t-2xl border-b border-white/10 bg-slate-950">
        <Image src={game.imageUrl} alt="" width={96} height={96} className="absolute right-5 top-4 h-24 w-24 rounded-2xl object-cover ring-1 ring-white/10" />
        <div className="absolute left-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-amber-300">
          <Icon size={20} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 rounded-b-2xl p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">{game.title}</h3>
            <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-300">{game.status}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{game.description}</p>
        </div>
        <div className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
          Open game <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}

function GameSection({ title, description, games }: { title: string; description: string; games: GameLink[] }) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replace(' ', '-')}-heading`}>
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Game modes</p>
          <h2 id={`${title.toLowerCase().replace(' ', '-')}-heading`} className="mt-2 text-2xl font-bold text-white">{title}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {games.map((game) => <GameCard key={game.href} game={game} />)}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-12 px-6 py-12 lg:px-12">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">League quiz hub</p>
          <h1 className="mt-4 text-5xl font-bold text-white sm:text-6xl">KnowLeague</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Choose a solo challenge or create a lobby to test your League knowledge with other players.
          </p>
        </header>

        <GameSection
          title="Multiplayer"
          description="Create or join a lobby and configure a shared competitive challenge."
          games={multiplayerGames}
        />
        <div className="h-px bg-white/10" />
        <GameSection
          title="Single Player"
          description="Play daily and self-paced modes with personal progress and statistics."
          games={singlePlayerGames}
        />
      </section>
    </main>
  );
}
