'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Flame,
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
} from '@/lib/game-storage';
import {
  LEAGUE_GAME_NAVIGATION_ITEMS,
  ORIGINAL_GAME_NAVIGATION_ITEMS,
  type Accent,
  type GameLink,
  type GameMode,
} from '@/lib/game-navigation';
import { playUiSound } from '@/lib/ui-sounds';

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
    glow: '',
    icon: 'border-amber-200/30 bg-amber-300 text-slate-950',
    pill: 'border-amber-200/40 bg-amber-300 text-slate-950',
    wash: 'from-amber-300/30 via-amber-500/10',
    line: 'bg-amber-300',
  },
  cyan: {
    border: 'border-cyan-300/40',
    glow: '',
    icon: 'border-cyan-200/30 bg-cyan-300 text-slate-950',
    pill: 'border-cyan-200/30 bg-cyan-300/15 text-cyan-100',
    wash: 'from-cyan-300/25 via-cyan-500/10',
    line: 'bg-cyan-300',
  },
  rose: {
    border: 'border-rose-400/45',
    glow: '',
    icon: 'border-rose-200/30 bg-rose-400 text-white',
    pill: 'border-rose-200/30 bg-rose-400/15 text-rose-100',
    wash: 'from-rose-400/25 via-rose-500/10',
    line: 'bg-rose-400',
  },
  violet: {
    border: 'border-violet-300/45',
    glow: '',
    icon: 'border-violet-200/30 bg-violet-400 text-white',
    pill: 'border-violet-200/30 bg-violet-400/15 text-violet-100',
    wash: 'from-violet-400/25 via-violet-500/10',
    line: 'bg-violet-400',
  },
  emerald: {
    border: 'border-emerald-300/40',
    glow: '',
    icon: 'border-emerald-200/30 bg-emerald-300 text-slate-950',
    pill: 'border-emerald-200/30 bg-emerald-300/15 text-emerald-100',
    wash: 'from-emerald-300/25 via-emerald-500/10',
    line: 'bg-emerald-300',
  },
  sky: {
    border: 'border-sky-300/40',
    glow: '',
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

const leagueGames: GameLink[] = LEAGUE_GAME_NAVIGATION_ITEMS;
const originalGames: GameLink[] = ORIGINAL_GAME_NAVIGATION_ITEMS;

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
    ? ''
    : game.title === 'Skincognito'
      ? ''
      : accent.glow;

  if (game.feature) {
    return (
      <Link
        href={game.href}
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => playUiSound('autocomplete-select')}
        className={`group relative isolate min-h-[18rem] transform-gpu overflow-hidden rounded-2xl bg-slate-950 bg-clip-padding ${featuredBorder} ${featuredGlow} transition-[transform,border-color] duration-300 [backface-visibility:hidden] hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:min-h-[24rem] lg:col-span-2`}
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
        <div className="relative flex min-h-[18rem] flex-col justify-between p-4 sm:min-h-[24rem] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="relative flex items-center gap-2 pb-8 sm:pb-10">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 sm:h-12 sm:w-12 ${accent.icon}`}>
                <GameIcon size={20} className="sm:hidden" />
                <GameIcon size={22} className="hidden sm:block" />
              </span>
              <GameModeBadge mode={game.mode} featured />
              <span className="absolute left-0 top-12 sm:top-14">
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
            <div className={`mb-3 h-1 w-14 rounded-full transition-all duration-300 group-hover:w-24 sm:mb-4 sm:w-16 ${accent.line}`} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{game.kicker}</p>
            <h3 className="mt-2 text-3xl font-black tracking-tight text-white sm:mt-3 sm:text-4xl">{game.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-200 sm:mt-4 sm:leading-6">{game.description}</p>
            <div className="game-card-cta mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-[color] duration-300 sm:mt-6">
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
      className={`group relative isolate min-h-[18rem] transform-gpu overflow-hidden rounded-2xl border bg-slate-900/80 bg-clip-padding transition-[transform,border-color,background-color] duration-300 [backface-visibility:hidden] hover:-translate-y-1 hover:border-white/35 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:min-h-[24rem] ${accent.border}`}
    >
      <div className="relative h-28 overflow-hidden border-b border-white/10 bg-slate-950 sm:h-40">
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
        <div className="absolute left-3 top-3 flex items-center gap-2 sm:left-4 sm:top-4">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 sm:h-11 sm:w-11 ${accent.icon}`}>
            <GameIcon size={18} />
          </span>
          <GameModeBadge mode={game.mode} />
            <span className="absolute left-0 top-12 sm:top-[3.25rem]">
            <StreakBadge game={game} stats={stats} />
          </span>
        </div>
        {game.playerCountId ? (
          <MultiplayerPlayerCountBadge gameId={game.playerCountId} className="absolute right-3 top-3 sm:right-4 sm:top-4" />
        ) : null}
      </div>
      <div className="relative z-10 flex min-h-[10rem] flex-col p-4 sm:min-h-[14rem] sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{game.kicker}</p>
        <h3 className="mt-2 text-xl font-black tracking-tight text-white transition-colors duration-300 group-hover:text-amber-100 sm:text-2xl">{game.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300 sm:mt-3 sm:leading-6">{game.description}</p>
        <div className="game-card-cta mt-auto inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-[color] duration-300">
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

export default function GamesHome() {
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
    <main className="min-h-[100dvh] overflow-hidden bg-[#030712] text-slate-100">
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:gap-12 sm:px-6 sm:py-10 lg:px-12">
        <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:p-6">
          <div className="relative min-w-0">
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">KnowLeague Games</h1>
          </div>
        </header>

        <GameSection
          title="League Games"
          description="League of Legends games for solo play, daily puzzles, and multiplayer sessions."
          games={leagueGames}
          showEyebrow
          stats={playerStats}
        />
        {originalGames.length ? (
          <GameSection
            title="Original Games"
            description="KnowLeague originals with their own worlds, progression, and shared account features."
            games={originalGames}
            stats={playerStats}
          />
        ) : null}
      </section>
    </main>
  );
}
