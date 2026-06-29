'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Check, Clock3, Eye, EyeOff, Grid3X3, Play, RefreshCw, RotateCcw, Shuffle, Trophy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { GameInfoMenu } from '@/components/game-info-menu';
import type { QuizItem } from '@/lib/quiz';

type PuzzlePhase = 'prematch' | 'loading' | 'playing' | 'won' | 'lost';

type GridOption = {
  size: number;
  label: string;
  description: string;
};

type TimeOption = {
  seconds: number;
  label: string;
  description: string;
};

const gridOptions: GridOption[] = [
  { size: 4, label: '4 x 4', description: '16 pieces' },
  { size: 5, label: '5 x 5', description: '25 pieces' },
  { size: 6, label: '6 x 6', description: '36 pieces' },
  { size: 8, label: '8 x 8', description: '64 pieces' },
  { size: 10, label: '10 x 10', description: '100 pieces' },
];

const timeOptions: TimeOption[] = [
  { seconds: 180, label: '3:00', description: 'Fast solve' },
  { seconds: 300, label: '5:00', description: 'Standard' },
  { seconds: 480, label: '8:00', description: 'Measured' },
  { seconds: 720, label: '12:00', description: 'Practice' },
];

function shuffleTiles(tileCount: number) {
  const tiles = Array.from({ length: tileCount }, (_, index) => index);

  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
  }

  if (tiles.every((tile, index) => tile === index) && tiles.length > 1) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }

  return tiles;
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function isSolved(tiles: readonly number[]) {
  return tiles.every((tile, index) => tile === index);
}

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to load splash art.'));
    image.src = src;
  });
}

async function loadRandomSkin() {
  const response = await fetch('/api/skin-champion/quiz-items', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load a skin splash.');
  }

  const skins = await response.json() as QuizItem[];
  const eligibleSkins = skins.filter((skin) => skin.imageUrl);
  const skin = eligibleSkins[Math.floor(Math.random() * eligibleSkins.length)];

  if (!skin) {
    throw new Error('No skin splash art is available.');
  }

  return skin;
}

function SettingButton({
  selected,
  disabled,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-amber-300/70 bg-amber-300/10 shadow-lg shadow-amber-500/10'
          : 'border-white/10 bg-slate-950/70 hover:border-white/25 hover:bg-slate-950'
      }`}
    >
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
        selected ? 'border-amber-300/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300'
      }`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-base font-bold text-white">
          {title}
          {selected ? <Check size={16} className="text-amber-300" /> : null}
        </span>
        <span className="mt-1 block text-sm leading-6 text-slate-400">{description}</span>
      </span>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

export function SplashScramble() {
  const [phase, setPhase] = useState<PuzzlePhase>('prematch');
  const [gridSize, setGridSize] = useState(5);
  const [timeLimit, setTimeLimit] = useState(300);
  const [showReference, setShowReference] = useState(true);
  const [targetSkin, setTargetSkin] = useState<QuizItem | null>(null);
  const [tiles, setTiles] = useState<number[]>([]);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(timeLimit);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  const tileCount = gridSize * gridSize;
  const started = phase === 'playing';
  const roundEnded = phase === 'won' || phase === 'lost';
  const boardColumns = useMemo(() => ({ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }), [gridSize]);

  useEffect(() => {
    if (phase !== 'playing' || endsAt === null) {
      return undefined;
    }

    const updateTimer = () => {
      const nextRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        setSelectedTile(null);
        setPhase('lost');
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [endsAt, phase]);

  const startRound = async () => {
    setPhase('loading');
    setError('');
    setSelectedTile(null);
    setMoves(0);

    try {
      const skin = await loadRandomSkin();
      await preloadImage(skin.imageUrl);
      const nextTiles = shuffleTiles(tileCount);

      setTargetSkin(skin);
      setTiles(nextTiles);
      setRemainingSeconds(timeLimit);
      setEndsAt(Date.now() + timeLimit * 1000);
      setPhase('playing');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to start the round.');
      setEndsAt(null);
      setPhase('prematch');
    }
  };

  const returnToPrematch = () => {
    setPhase('prematch');
    setSelectedTile(null);
    setEndsAt(null);
    setRemainingSeconds(timeLimit);
  };

  const handleTileClick = (position: number) => {
    if (phase !== 'playing') {
      return;
    }

    if (selectedTile === null) {
      setSelectedTile(position);
      return;
    }

    if (selectedTile === position) {
      setSelectedTile(null);
      return;
    }

    const nextTiles = [...tiles];
    [nextTiles[selectedTile], nextTiles[position]] = [nextTiles[position], nextTiles[selectedTile]];
    setTiles(nextTiles);
    setSelectedTile(null);
    setMoves((current) => current + 1);

    if (isSolved(nextTiles)) {
      setPhase('won');
    }
  };

  const renderPrematch = () => (
    <section className="grid gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl lg:grid-cols-[1fr_0.9fr]">
      <div className="grid gap-6">
        <div>
          <h2 className="mt-2 text-3xl font-black text-white">Splash Scramble</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Choose the puzzle size, timer, and reference visibility. If no skin is selected, one will be chosen at random.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pieces</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {gridOptions.map((option) => (
                <SettingButton
                  key={option.size}
                  selected={gridSize === option.size}
                  icon={<Grid3X3 size={18} />}
                  title={option.label}
                  description={option.description}
                  onClick={() => setGridSize(option.size)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Timer</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {timeOptions.map((option) => (
                <SettingButton
                  key={option.seconds}
                  selected={timeLimit === option.seconds}
                  icon={<Clock3 size={18} />}
                  title={option.label}
                  description={option.description}
                  onClick={() => {
                    setTimeLimit(option.seconds);
                    setRemainingSeconds(option.seconds);
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reference</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingButton
                selected={showReference}
                icon={<Eye size={18} />}
                title="Visible"
                description="Show a small splash art reference while solving."
                onClick={() => setShowReference(true)}
              />
              <SettingButton
                selected={!showReference}
                icon={<EyeOff size={18} />}
                title="Hidden"
                description="Solve from the scrambled image alone."
                onClick={() => setShowReference(false)}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={startRound}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-auto"
        >
          <Play size={16} />
          Play
        </button>
      </div>

      <aside className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Round Setup</p>
            <h3 className="mt-2 text-xl font-black text-white">{gridSize} x {gridSize} Puzzle</h3>
          </div>
          <Shuffle size={22} className="text-amber-300" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <StatPill label="Pieces" value={tileCount} />
          <StatPill label="Time" value={formatTimer(timeLimit)} />
          <StatPill label="Reference" value={showReference ? 'On' : 'Off'} />
        </div>
      </aside>
    </section>
  );

  const renderLoading = () => (
    <section className="grid min-h-[28rem] place-items-center rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
      <div className="text-center">
        <RefreshCw size={34} className="mx-auto animate-spin text-amber-300" />
        <h2 className="mt-5 text-2xl font-black text-white">Preparing puzzle</h2>
        <p className="mt-2 text-sm text-slate-400">Selecting and shuffling the splash art before the round starts.</p>
      </div>
    </section>
  );

  const renderBoard = () => (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatPill label="Time" value={formatTimer(remainingSeconds)} />
          <StatPill label="Moves" value={moves} />
          <StatPill label="Pieces" value={tileCount} />
        </div>

        <div
          className="grid aspect-video overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
          style={boardColumns}
          aria-label="Scrambled splash art puzzle"
        >
          {tiles.map((tile, position) => {
            const tileRow = Math.floor(tile / gridSize);
            const tileColumn = tile % gridSize;
            const x = gridSize === 1 ? 0 : (tileColumn / (gridSize - 1)) * 100;
            const y = gridSize === 1 ? 0 : (tileRow / (gridSize - 1)) * 100;
            const selected = selectedTile === position;

            return (
              <button
                key={position}
                type="button"
                onClick={() => handleTileClick(position)}
                className={`relative min-h-0 border border-slate-950/50 bg-cover bg-no-repeat transition focus:z-10 focus:outline-none focus:ring-2 focus:ring-amber-200 ${
                  selected ? 'z-10 scale-[0.98] shadow-[inset_0_0_0_3px_rgba(251,191,36,0.95)]' : 'hover:brightness-110'
                }`}
                style={{
                  backgroundImage: targetSkin ? `url(${targetSkin.imageUrl})` : undefined,
                  backgroundPosition: `${x}% ${y}%`,
                  backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                }}
                aria-label={`Tile ${position + 1}`}
                aria-pressed={selected}
              />
            );
          })}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Target</p>
          <h2 className="mt-2 text-2xl font-black text-white">Mystery Splash</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Select two tiles to swap them. The round ends as soon as every tile is back in its original position.</p>
        </div>

        {showReference && targetSkin ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
            <div className="relative aspect-video">
              <Image
                src={targetSkin.imageUrl}
                alt={`${targetSkin.answer} splash art reference`}
                fill
                sizes="288px"
                className="object-cover"
              />
            </div>
            <div className="border-t border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Reference</p>
              <p className="mt-1 text-sm font-bold text-white">{targetSkin.answer}</p>
            </div>
          </div>
        ) : null}
      </aside>
    </section>
  );

  const renderEndState = () => {
    if (!targetSkin) {
      return null;
    }

    const won = phase === 'won';

    return (
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-glow backdrop-blur-xl">
        <div className="relative aspect-video min-h-[18rem]">
          <Image
            src={targetSkin.imageUrl}
            alt={`${targetSkin.answer} full splash art`}
            fill
            sizes="(min-width: 1024px) 960px, 100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <div className="max-w-2xl">
              <p className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${
                won ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100' : 'border-red-300/40 bg-red-300/15 text-red-100'
              }`}>
                {won ? <Trophy size={14} /> : <Clock3 size={14} />}
                {won ? 'Puzzle Complete' : 'Time Expired'}
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-white">{targetSkin.answer}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {won ? `Solved in ${moves} swaps with ${formatTimer(remainingSeconds)} left.` : `The puzzle was not solved in time. You made ${moves} swaps in ${formatTimer(timeLimit)}.`}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={startRound}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <RotateCcw size={16} />
                  Another Round
                </button>
                <button
                  type="button"
                  onClick={returnToPrematch}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 px-5 text-sm font-bold text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  Change Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#030712] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              aria-label="Back to games"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Single Player Game</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Splash Scramble</h1>
            </div>
          </div>
          <GameInfoMenu
            title="Splash Scramble"
            steps={[
              'Choose a grid size, timer, and whether the reference image is visible.',
              'Press Play to load a random skin splash and start from a shuffled board.',
              'Click two tiles to swap their positions.',
              'Restore every tile to the original splash art before the timer expires.',
            ]}
          />
        </header>

        {phase === 'prematch' ? renderPrematch() : null}
        {phase === 'loading' ? renderLoading() : null}
        {started ? renderBoard() : null}
        {roundEnded ? renderEndState() : null}
      </div>
    </main>
  );
}
