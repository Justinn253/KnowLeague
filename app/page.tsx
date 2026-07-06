import {
  ArrowRight,
  BarChart3,
  Clock3,
  Eye,
  Search,
  ShieldQuestion,
  Sparkles,
  Swords,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { MultiplayerPlayerCountBadge } from '@/components/multiplayer-player-count-badge';
import type { MultiplayerPlayerCountGameId } from '@/lib/multiplayer-player-counts';

type Accent = 'gold' | 'cyan' | 'rose' | 'violet' | 'emerald' | 'sky';

type GameLink = {
  title: string;
  href: string;
  description: string;
  imageUrl: string;
  imageFit?: 'cover' | 'contain';
  gameIcon: LucideIcon;
  modeIcon: LucideIcon;
  playerCountId?: MultiplayerPlayerCountGameId;
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
    description: 'Try to guess your opponents League of Legends skin before they can decipher yours.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    gameIcon: ShieldQuestion,
    modeIcon: Users,
    playerCountId: 'skincognito',
    accent: 'rose',
    kicker: 'Deduction Duel',
    feature: true,
  },
  {
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    description: 'Race through League of Legends ability icons in a shared lobby with configurable modifiers.',
    imageUrl: '/game-snapshots/ability_blitz_snapshot.png',
    imageFit: 'contain',
    gameIcon: Clock3,
    modeIcon: Users,
    playerCountId: 'ability-blitz',
    accent: 'cyan',
    kicker: 'Live Race',
  },
  {
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    description: 'Compete to identify League of Legends champion skins from image-focused clues.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    modeIcon: Users,
    playerCountId: 'skin-champion',
    accent: 'sky',
    kicker: 'Skin Sprint',
  },
  {
    title: 'Carving Revelation',
    href: '/carving-revelation',
    description: 'Take turns carving reveal lines into one shared hidden skin canvas before someone names it.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jhin_5.jpg',
    gameIcon: Eye,
    modeIcon: Users,
    playerCountId: 'carving-revelation',
    accent: 'gold',
    kicker: 'Shared Canvas',
  },
  {
    title: 'Category Clash',
    href: '/category-clash',
    description: 'Name unique League answers from rotating categories before strikes knock you out.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Sylas_0.jpg',
    gameIcon: Swords,
    modeIcon: Users,
    playerCountId: 'category-clash',
    accent: 'emerald',
    kicker: 'Last Player Standing',
  },
];

const singlePlayerGames: GameLink[] = [
  {
    title: 'Skindle',
    href: '/skindle',
    description: 'Solve the daily League of Legends skin with category clues that sharpen after every guess.',
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
    description: 'Push your recall speed through randomized League of Legends ability icons.',
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
    description: 'Practice League of Legends champion skin recognition at your own pace.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    modeIcon: User,
    accent: 'emerald',
    kicker: 'Cosmetic Clues',
  },
  {
    title: 'Splash Scramble',
    href: '/splash-scramble',
    description: 'Rebuild a scrambled League of Legends splash art by swapping tiles before time runs out.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_0.jpg',
    gameIcon: Eye,
    modeIcon: User,
    accent: 'sky',
    kicker: 'Tile Puzzle',
  },
];

function GameCard({ game }: { game: GameLink }) {
  const GameIcon = game.gameIcon;
  const ModeIcon = game.modeIcon;
  const accent = accentStyles[game.accent];
  const featuredOverlayTarget = game.mostPlayed ? 'to-slate-950/60' : 'to-slate-950/90';
  const featuredTextShade = game.mostPlayed
    ? 'bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.56)_42%,rgba(2,6,23,0.08)_100%)]'
    : 'bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.78)_42%,rgba(2,6,23,0.28)_100%)]';

  if (game.feature) {
    return (
      <Link
        href={game.href}
        className={`group relative isolate min-h-[24rem] transform-gpu overflow-hidden rounded-2xl border bg-slate-950 bg-clip-padding ${accent.border} ${accent.glow} transition-[transform,border-color,box-shadow] duration-300 [backface-visibility:hidden] hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_14px_38px_rgba(15,23,42,0.28)] focus:outline-none focus:ring-2 focus:ring-amber-200 lg:col-span-2`}
      >
        <Image
          src={game.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover transition duration-700 ease-out will-change-transform group-hover:scale-[1.04]"
          priority={game.title === 'Skindle'}
        />
        <div className={`absolute inset-0 bg-gradient-to-br ${accent.wash} ${featuredOverlayTarget}`} />
        <div className={`absolute inset-0 ${featuredTextShade}`} />
        <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/10 opacity-0 blur-lg transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 transition duration-300 group-hover:ring-white/15" />
        <div className="relative flex min-h-[24rem] flex-col justify-between p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 ${accent.icon}`}>
                <GameIcon size={22} />
              </span>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/50 text-slate-100 backdrop-blur">
                <ModeIcon size={18} />
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {game.playerCountId ? (
                <MultiplayerPlayerCountBadge gameId={game.playerCountId} />
              ) : null}
              {game.mostPlayed ? (
                <span className="rounded-full border border-amber-100/60 bg-amber-300 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-950">
                  Most Popular
                </span>
              ) : null}
            </div>
          </div>

          <div className="max-w-md">
            <div className={`mb-4 h-1 w-16 rounded-full transition-all duration-300 group-hover:w-24 ${accent.line}`} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{game.kicker}</p>
            <h3 className="mt-3 text-4xl font-black tracking-tight text-white">{game.title}</h3>
            <p className="mt-4 text-sm leading-6 text-slate-200">{game.description}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur transition-[background-color,border-color,color,box-shadow] duration-300 group-hover:border-amber-200/50 group-hover:bg-amber-300 group-hover:text-slate-950 group-hover:shadow-lg group-hover:shadow-amber-950/20">
              Open game <ArrowRight size={16} className="game-card-arrow" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={game.href}
      className={`group relative isolate min-h-[24rem] transform-gpu overflow-hidden rounded-2xl border bg-slate-900/80 bg-clip-padding transition-[transform,border-color,background-color,box-shadow] duration-300 [backface-visibility:hidden] hover:-translate-y-1 hover:border-white/35 hover:bg-slate-900 hover:shadow-[0_12px_34px_rgba(15,23,42,0.26)] focus:outline-none focus:ring-2 focus:ring-amber-200 ${accent.border}`}
    >
      <div className="relative h-40 overflow-hidden border-b border-white/10 bg-slate-950">
        <Image
          src={game.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 280px, 100vw"
          className={`transition duration-700 ease-out will-change-transform ${
            game.imageFit === 'contain' ? 'scale-105 object-contain p-2 group-hover:scale-[1.09]' : 'object-cover group-hover:scale-[1.08]'
          }`}
        />
        <div className={`absolute inset-0 bg-gradient-to-t ${accent.wash} to-transparent`} />
        <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/10 opacity-0 blur-md transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 ${accent.icon}`}>
            <GameIcon size={20} />
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/50 text-slate-100 backdrop-blur">
            <ModeIcon size={16} />
          </span>
        </div>
        {game.playerCountId ? (
          <MultiplayerPlayerCountBadge gameId={game.playerCountId} className="absolute right-4 top-4" />
        ) : null}
      </div>
      <div className="relative z-10 flex min-h-[14rem] flex-col p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{game.kicker}</p>
        <h3 className="mt-2 text-2xl font-black tracking-tight text-white transition-colors duration-300 group-hover:text-amber-100">{game.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">{game.description}</p>
        <div className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-amber-300">
          Open game <ArrowRight size={16} className="game-card-arrow" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 transition duration-300 group-hover:ring-white/10" />
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
            <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">KnowLeague Trivia</h1>
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
          title="Solo Games"
          description="Play daily and self-paced modes with personal progress and statistics."
          games={singlePlayerGames}
          showEyebrow
        />
        <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <GameSection
          title="Multiplayer Games"
          description="Create or join a lobby and configure a shared competitive challenge."
          games={multiplayerGames}
        />
      </section>
    </main>
  );
}
