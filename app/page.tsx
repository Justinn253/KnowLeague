'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Eye,
  Flame,
  Search,
  ShieldQuestion,
  Sparkles,
  Swords,
  Trophy,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { GameSplashImage } from '@/components/game-asset-image';
import Link from 'next/link';
import { MultiplayerPlayerCountBadge } from '@/components/multiplayer-player-count-badge';
import {
  createEmptyPlayerStats,
  getPlayerGameStreakForMode,
  loadPlayerGameStats,
  PLAYER_GAME_STATS_CHANGED_EVENT,
  STREAK_GAME_IDS,
  type PlayerGameStatsByGame,
  type StreakGameId,
} from '@/lib/game-storage';
import type { MultiplayerPlayerCountGameId } from '@/lib/multiplayer-player-counts';
import { playUiSound } from '@/lib/ui-sounds';

type Accent = 'gold' | 'cyan' | 'rose' | 'violet' | 'emerald' | 'sky';
type GameMode = 'solo' | 'multiplayer' | 'hybrid';

type GameLink = {
  title: string;
  href: string;
  description: string;
  imageUrl: string;
  imageFit?: 'cover' | 'contain';
  gameIcon: LucideIcon;
  mode: GameMode;
  playerCountId?: MultiplayerPlayerCountGameId;
  streakGameId?: StreakGameId;
  streakStyle?: 'single' | 'daily-pair' | 'modes';
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

const modeStyles: Record<GameMode, { label: string; icon: LucideIcon }> = {
  solo: {
    label: 'Solo',
    icon: User,
  },
  multiplayer: {
    label: 'Multiplayer',
    icon: Users,
  },
  hybrid: {
    label: 'Solo/Multiplayer',
    icon: UserPlus,
  },
};

const games: GameLink[] = [
  {
    title: 'Skindle',
    href: '/skindle',
    description: 'Solve the daily League of Legends skin with each guess revealing more information.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_7.jpg',
    gameIcon: Search,
    mode: 'solo',
    streakGameId: 'skindle',
    streakStyle: 'single',
    accent: 'gold',
    kicker: 'Daily Puzzle',
    feature: true,
    mostPlayed: true,
  },
  {
    title: 'Splash Scramble',
    href: '/splash-scramble',
    description: 'Rebuild a scrambled League of Legends skin by swapping pieces.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_0.jpg',
    gameIcon: Eye,
    mode: 'solo',
    streakGameId: 'splash-scramble',
    streakStyle: 'daily-pair',
    accent: 'sky',
    kicker: 'Tile Puzzle',
  },
  {
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    description: 'Play solo or with friends through League of Legends ability icons.',
    imageUrl: '/game-snapshots/ability_blitz_snapshot.png',
    imageFit: 'contain',
    gameIcon: Clock3,
    mode: 'hybrid',
    playerCountId: 'ability-blitz',
    streakGameId: 'ability-blitz',
    streakStyle: 'modes',
    accent: 'cyan',
    kicker: 'Solo or Race',
  },
  {
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    description: 'Play solo or with friends to identify League of Legends skin lines.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    mode: 'hybrid',
    playerCountId: 'skin-champion',
    streakGameId: 'skin-champion',
    streakStyle: 'modes',
    accent: 'sky',
    kicker: 'Solo or Sprint',
  },
  {
    title: 'Skincognito',
    href: '/skincognito',
    description: 'Try to guess your opponents League of Legends skin before they can guess yours.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    gameIcon: ShieldQuestion,
    mode: 'multiplayer',
    playerCountId: 'skincognito',
    accent: 'rose',
    kicker: 'Deduction Duel',
    feature: true,
  },
  {
    title: 'Carving Revelation',
    href: '/carving-revelation',
    description: 'Carve through a hidden League of Legends skin line and figure it out before your opponents do.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jhin_5.jpg',
    gameIcon: Eye,
    mode: 'multiplayer',
    playerCountId: 'carving-revelation',
    accent: 'gold',
    kicker: 'Shared Canvas',
  },
  {
    title: 'Category Clash',
    href: '/category-clash',
    description: 'Name unique League answers from rotating categories and be the last player standing.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Sylas_0.jpg',
    gameIcon: Swords,
    mode: 'multiplayer',
    playerCountId: 'category-clash',
    accent: 'emerald',
    kicker: 'Last Player Standing',
  },
  {
    title: 'Mastery Master',
    href: '/mastery-master',
    description: 'Put a League account&apos;s champion mastery knowledge to the test.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Malzahar_0.jpg',
    gameIcon: Trophy,
    mode: 'solo',
    accent: 'violet',
    kicker: 'Mastery Challenge',
  },
];

function GameModeBadge({ mode, featured = false }: { mode: GameMode; featured?: boolean }) {
  const modeStyle = modeStyles[mode];
  const ModeIcon = modeStyle.icon;
  const sizeClass = featured ? 'h-10 min-w-10' : 'h-9 min-w-9';
  const iconSize = featured ? 18 : 16;

  return (
    <span
      aria-label={modeStyle.label}
      className={`${sizeClass} inline-flex max-w-10 items-center overflow-hidden rounded-2xl border border-white/15 bg-slate-950/50 text-slate-100 backdrop-blur transition-[max-width,background-color,border-color] duration-300 group-hover:max-w-56 group-hover:border-white/25 group-hover:bg-slate-950/70`}
    >
      <span className={`${sizeClass} inline-flex shrink-0 items-center justify-center`}>
        <ModeIcon size={iconSize} />
      </span>
      <span className="translate-x-1 whitespace-nowrap pr-3 text-xs font-black uppercase tracking-[0.14em] opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
        {modeStyle.label}
      </span>
    </span>
  );
}

function StreakBadge({ game, stats }: { game: GameLink; stats?: PlayerGameStatsByGame }) {
  if (!game.streakGameId || !game.streakStyle) {
    return null;
  }

  const gameStats = stats?.[game.streakGameId] ?? createEmptyPlayerStats(game.streakGameId);
  if (game.streakStyle === 'daily-pair') {
    const regular = getPlayerGameStreakForMode(gameStats, 'casual').currentStreak;
    const daily = getPlayerGameStreakForMode(gameStats, 'daily').currentStreak;

    return (
      <span
        title={`Current streaks: Regular ${regular}, Daily ${daily}`}
        className="inline-flex h-8 items-center gap-1 rounded-xl border border-amber-300/25 bg-slate-950/70 px-2 text-xs font-black text-amber-100 backdrop-blur"
      >
        <Flame size={13} className="text-amber-300" />
        {regular}/{daily}
      </span>
    );
  }

  if (game.streakStyle === 'modes') {
    const casual = getPlayerGameStreakForMode(gameStats, 'casual').currentStreak;
    const daily = getPlayerGameStreakForMode(gameStats, 'daily').currentStreak;
    const chaos = getPlayerGameStreakForMode(gameStats, 'chaos').currentStreak;

    return (
      <span
        title={`Current streaks: Casual ${casual}, Daily ${daily}, Chaos ${chaos}`}
        className="inline-flex h-8 items-center gap-1 rounded-xl border border-amber-300/25 bg-slate-950/70 px-2 text-xs font-black text-amber-100 backdrop-blur"
      >
        <Flame size={13} className="text-amber-300" />
        {casual}/{daily}/{chaos}
      </span>
    );
  }

  return (
    <span
      title={`Current streak: ${gameStats.currentStreak}`}
      className="inline-flex h-8 items-center gap-1 rounded-xl border border-amber-300/25 bg-slate-950/70 px-2 text-xs font-black text-amber-100 backdrop-blur"
    >
      <Flame size={13} className="text-amber-300" />
      {gameStats.currentStreak}
    </span>
  );
}

function GameCard({ game, stats }: { game: GameLink; stats?: PlayerGameStatsByGame }) {
  const GameIcon = game.gameIcon;
  const accent = accentStyles[game.accent];
  const featuredOverlayTarget = game.mostPlayed ? 'to-slate-950/60' : 'to-slate-950/90';
  const featuredTextShade = game.mostPlayed
    ? 'bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.56)_42%,rgba(2,6,23,0.08)_100%)]'
    : 'bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.78)_42%,rgba(2,6,23,0.28)_100%)]';
  const featuredBorder = game.title === 'Skindle' ? 'gradient-border' : `border ${accent.border}`;
  const featuredGlow = game.title === 'Skindle'
    ? 'shadow-[0_12px_34px_rgba(250,204,21,0.10)]'
    : game.title === 'Skincognito'
      ? 'shadow-[0_12px_34px_rgba(244,63,94,0.09)]'
      : accent.glow;

  if (game.feature) {
    return (
      <Link
        href={game.href}
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => playUiSound('autocomplete-select')}
        className={`group relative isolate min-h-[24rem] transform-gpu overflow-hidden rounded-2xl bg-slate-950 bg-clip-padding ${featuredBorder} ${featuredGlow} transition-[transform,border-color,box-shadow] duration-300 [backface-visibility:hidden] hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(15,23,42,0.24)] focus:outline-none focus:ring-2 focus:ring-amber-200 lg:col-span-2`}
      >
        <GameSplashImage
          src={game.imageUrl}
          alt={`${game.title} game preview`}
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
            <div className="relative flex items-center gap-2 pb-10">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 ${accent.icon}`}>
                <GameIcon size={22} />
              </span>
              <GameModeBadge mode={game.mode} featured />
              <span className="absolute left-0 top-14">
                <StreakBadge game={game} stats={stats} />
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
            <div className="game-card-cta mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-[color,box-shadow] duration-300">
              <span className="relative z-10">Open game</span>
              <ArrowRight size={16} className="game-card-arrow relative z-10" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={game.href}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => playUiSound('autocomplete-select')}
      className={`group relative isolate min-h-[24rem] transform-gpu overflow-hidden rounded-2xl border bg-slate-900/80 bg-clip-padding transition-[transform,border-color,background-color,box-shadow] duration-300 [backface-visibility:hidden] hover:-translate-y-1 hover:border-white/35 hover:bg-slate-900 hover:shadow-[0_12px_34px_rgba(15,23,42,0.26)] focus:outline-none focus:ring-2 focus:ring-amber-200 ${accent.border}`}
    >
      <div className="relative h-40 overflow-hidden border-b border-white/10 bg-slate-950">
        <GameSplashImage
          src={game.imageUrl}
          alt={`${game.title} game preview`}
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
          <GameModeBadge mode={game.mode} />
          <span className="absolute left-0 top-[3.25rem]">
            <StreakBadge game={game} stats={stats} />
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
        <div className="game-card-cta mt-auto inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-[color,box-shadow] duration-300">
          <span className="relative z-10">Open game</span>
          <ArrowRight size={16} className="game-card-arrow relative z-10" />
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
  stats,
}: {
  title: string;
  description: string;
  games: GameLink[];
  showEyebrow?: boolean;
  stats?: PlayerGameStatsByGame;
}) {
  const sectionId = `${title.toLowerCase().replace(' ', '-')}-heading`;

  return (
    <section aria-labelledby={sectionId} className="grid gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {showEyebrow ? (
            <p className="text-lg font-black uppercase tracking-[0.24em] text-amber-300">Game Modes</p>
          ) : null}
          <h2 id={sectionId} className={showEyebrow ? 'mt-2 text-3xl font-black tracking-tight text-white' : 'text-3xl font-black tracking-tight text-white'}>{title}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {games.map((game) => <GameCard key={game.href} game={game} stats={stats} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const [playerStats, setPlayerStats] = useState<PlayerGameStatsByGame>(() => (
    Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [gameId, createEmptyPlayerStats(gameId)]))
  ));

  useEffect(() => {
    const refreshStats = () => {
      setPlayerStats(Object.fromEntries(STREAK_GAME_IDS.map((gameId) => [gameId, loadPlayerGameStats(gameId)])));
    };

    refreshStats();
    window.addEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, refreshStats);
    return () => window.removeEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, refreshStats);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-12 px-6 py-10 lg:px-12">
        <header className="relative grid gap-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative min-w-0">
            <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">KnowLeague Trivia</h1>
          </div>
          <Link
            href="/riot-account-viewer"
            onMouseEnter={() => playUiSound('autocomplete-hover')}
            onFocus={() => playUiSound('autocomplete-hover')}
            onClick={() => playUiSound('autocomplete-select')}
            className="group relative inline-flex min-h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-500 px-5 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-lg shadow-amber-950/30 transition hover:-translate-y-0.5 hover:shadow-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-100"
          >
            <span className="absolute inset-y-0 left-0 w-1/3 bg-white/30 opacity-0 blur-xl transition group-hover:opacity-100" />
            <BarChart3 size={20} />
            League Account Viewer
            <ArrowRight size={17} className="transition group-hover:translate-x-1" />
          </Link>
        </header>

        <GameSection
          title=""
          description="Try one of our many games from Solo to Multiplayer!"
          games={games}
          showEyebrow
          stats={playerStats}
        />
      </section>
    </main>
  );
}
