import {
  ArrowRight,
  BarChart3,
  Clock3,
  Search,
  ShieldQuestion,
  Sparkles,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

type Accent = 'gold' | 'cyan' | 'rose' | 'violet' | 'emerald' | 'sky';

type GameLink = {
  title: string;
  href: string;
  description: string;
  imageUrl: string;
  imageFit?: 'cover' | 'contain';
  gameIcon: LucideIcon;
  modeIcon: LucideIcon;
  accent: Accent;
  kicker: string;
  feature?: boolean;
  mostPlayed?: boolean;
};

const accentStyles: Record<Accent, {
  border: string;
  glow: string;
  icon: string;
  pill: string;
  wash: string;
  line: string;
}> = {
  gold: {
    border: 'border-amber-300/60',
    glow: 'shadow-[0_20px_70px_rgba(245,158,11,0.16)]',
    icon: 'border-amber-200/30 bg-amber-300 text-slate-950',
    pill: 'border-amber-200/40 bg-amber-300 text-slate-950',
    wash: 'from-amber-300/30 via-amber-500/10',
    line: 'bg-amber-300',
  },
  cyan: {
    border: 'border-cyan-300/40',
    glow: 'shadow-[0_20px_70px_rgba(34,211,238,0.12)]',
    icon: 'border-cyan-200/30 bg-cyan-300 text-slate-950',
    pill: 'border-cyan-200/30 bg-cyan-300/15 text-cyan-100',
    wash: 'from-cyan-300/25 via-cyan-500/10',
    line: 'bg-cyan-300',
  },
  rose: {
    border: 'border-rose-400/45',
    glow: 'shadow-[0_20px_70px_rgba(244,63,94,0.13)]',
    icon: 'border-rose-200/30 bg-rose-400 text-white',
    pill: 'border-rose-200/30 bg-rose-400/15 text-rose-100',
    wash: 'from-rose-400/25 via-rose-500/10',
    line: 'bg-rose-400',
  },
  violet: {
    border: 'border-violet-300/45',
    glow: 'shadow-[0_20px_70px_rgba(139,92,246,0.14)]',
    icon: 'border-violet-200/30 bg-violet-400 text-white',
    pill: 'border-violet-200/30 bg-violet-400/15 text-violet-100',
    wash: 'from-violet-400/25 via-violet-500/10',
    line: 'bg-violet-400',
  },
  emerald: {
    border: 'border-emerald-300/40',
    glow: 'shadow-[0_20px_70px_rgba(52,211,153,0.12)]',
    icon: 'border-emerald-200/30 bg-emerald-300 text-slate-950',
    pill: 'border-emerald-200/30 bg-emerald-300/15 text-emerald-100',
    wash: 'from-emerald-300/25 via-emerald-500/10',
    line: 'bg-emerald-300',
  },
  sky: {
    border: 'border-sky-300/40',
    glow: 'shadow-[0_20px_70px_rgba(56,189,248,0.12)]',
    icon: 'border-sky-200/30 bg-sky-300 text-slate-950',
    pill: 'border-sky-200/30 bg-sky-300/15 text-sky-100',
    wash: 'from-sky-300/25 via-sky-500/10',
    line: 'bg-sky-300',
  },
};

const multiplayerGames: GameLink[] = [
  {
    title: 'Skincognito',
    href: '/skincognito',
    description: 'Try to guess your opponents skin before they can decipher yours.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    gameIcon: ShieldQuestion,
    modeIcon: Users,
    accent: 'rose',
    kicker: 'Deduction Duel',
    feature: true,
  },
  {
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    description: 'Race through ability icons in a shared lobby with configurable modifiers.',
    imageUrl: '/game-snapshots/ability_blitz_snapshot.png',
    imageFit: 'contain',
    gameIcon: Clock3,
    modeIcon: Users,
    accent: 'cyan',
    kicker: 'Live Race',
  },
  {
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    description: 'Compete to identify champion skins from image-focused clues.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    modeIcon: Users,
    accent: 'sky',
    kicker: 'Skin Sprint',
  },
];

const singlePlayerGames: GameLink[] = [
  {
    title: 'Skindle',
    href: '/skindle',
    description: 'Solve the daily skin with category clues that sharpen after every guess.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_7.jpg',
    gameIcon: Search,
    modeIcon: User,
    accent: 'gold',
    kicker: 'Daily Puzzle',
    feature: true,
    mostPlayed: true,
  },
  {
    title: 'Ability Blitz',
    href: '/ability-blitz',
    description: 'Push your recall speed through randomized League ability icons.',
    imageUrl: '/game-snapshots/ability_blitz_snapshot.png',
    imageFit: 'contain',
    gameIcon: Clock3,
    modeIcon: User,
    accent: 'violet',
    kicker: 'Time Trial',
  },
  {
    title: 'Skin Champion',
    href: '/skin-champion',
    description: 'Practice champion and cosmetic recognition at your own pace.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    modeIcon: User,
    accent: 'emerald',
    kicker: 'Cosmetic Clues',
  },
];

function GameCard({ game }: { game: GameLink }) {
  const GameIcon = game.gameIcon;
  const ModeIcon = game.modeIcon;
  const accent = accentStyles[game.accent];

  if (game.feature) {
    return (
      <Link
        href={game.href}
        className={`group relative isolate min-h-[24rem] overflow-hidden rounded-2xl border bg-slate-950 ${accent.border} ${accent.glow} transition duration-300 hover:-translate-y-1 hover:border-white/35 focus:outline-none focus:ring-2 focus:ring-amber-200 lg:col-span-2`}
      >
        <Image
          src={game.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="rounded-2xl object-cover transition duration-500 group-hover:scale-105"
          priority={game.title === 'Skindle'}
        />
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${accent.wash} to-slate-950/95`} />
        <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.78)_42%,rgba(2,6,23,0.28)_100%)]" />
        <div className="relative flex min-h-[24rem] flex-col justify-between p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${accent.icon}`}>
                <GameIcon size={22} />
              </span>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/50 text-slate-100 backdrop-blur">
                <ModeIcon size={18} />
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {game.mostPlayed ? (
                <span className="rounded-full border border-amber-100/60 bg-amber-300 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-950">
                  Most Popular
                </span>
              ) : null}
            </div>
          </div>

          <div className="max-w-md">
            <div className={`mb-4 h-1 w-16 rounded-full ${accent.line}`} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{game.kicker}</p>
            <h3 className="mt-3 text-4xl font-black tracking-tight text-white">{game.title}</h3>
            <p className="mt-4 text-sm leading-6 text-slate-200">{game.description}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur transition group-hover:border-amber-200/50 group-hover:bg-amber-300 group-hover:text-slate-950">
              Open game <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={game.href}
      className={`group relative isolate min-h-[24rem] overflow-hidden rounded-2xl border bg-slate-900/80 transition duration-300 hover:-translate-y-1 hover:border-white/35 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 ${accent.border}`}
    >
      <div className="relative h-40 overflow-hidden border-b border-white/10 bg-slate-950">
        <Image
          src={game.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 280px, 100vw"
          className={`transition duration-500 ${
            game.imageFit === 'contain' ? 'scale-105 object-contain p-2 group-hover:scale-110' : 'object-cover group-hover:scale-110'
          }`}
        />
        <div className={`absolute inset-0 bg-gradient-to-t ${accent.wash} to-transparent`} />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${accent.icon}`}>
            <GameIcon size={20} />
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/50 text-slate-100 backdrop-blur">
            <ModeIcon size={16} />
          </span>
        </div>
      </div>
      <div className="flex min-h-[14rem] flex-col p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{game.kicker}</p>
        <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{game.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">{game.description}</p>
        <div className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-amber-300">
          Open game <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}

function GameSection({
  title,
  description,
  games,
  showEyebrow = false,
}: {
  title: string;
  description: string;
  games: GameLink[];
  showEyebrow?: boolean;
}) {
  const sectionId = `${title.toLowerCase().replace(' ', '-')}-heading`;

  return (
    <section aria-labelledby={sectionId} className="grid gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {showEyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Game Modes</p>
          ) : null}
          <h2 id={sectionId} className={showEyebrow ? 'mt-2 text-3xl font-black tracking-tight text-white' : 'text-3xl font-black tracking-tight text-white'}>{title}</h2>
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
    <main className="min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-12 px-6 py-10 lg:px-12">
        <header className="relative grid gap-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(250,204,21,0.14),transparent_32%),radial-gradient(circle_at_88%_0%,rgba(34,211,238,0.12),transparent_28%)]" />
          <div className="relative min-w-0">
            <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">KnowLeague</h1>
          </div>
          <Link
            href="/riot-account-viewer"
            className="group relative inline-flex min-h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-500 px-5 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-lg shadow-amber-950/30 transition hover:-translate-y-0.5 hover:shadow-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-100"
          >
            <span className="absolute inset-y-0 left-0 w-1/3 bg-white/30 opacity-0 blur-xl transition group-hover:opacity-100" />
            <BarChart3 size={20} />
            League Account Viewer
            <ArrowRight size={17} className="transition group-hover:translate-x-1" />
          </Link>
        </header>

        <GameSection
          title="Multiplayer Games"
          description="Create or join a lobby and configure a shared competitive challenge."
          games={multiplayerGames}
          showEyebrow
        />
        <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <GameSection
          title="Solo Games"
          description="Play daily and self-paced modes with personal progress and statistics."
          games={singlePlayerGames}
        />
      </section>
    </main>
  );
}
