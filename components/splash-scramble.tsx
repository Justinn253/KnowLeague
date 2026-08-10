'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Flame,
  Grid3X3,
  Lock,
  LockOpen,
  Play,
  RefreshCw,
  RotateCw,
  RotateCcw,
  Search,
  Shuffle,
  Trophy,
  X,
} from 'lucide-react';
import { GameSplashImage } from '@/components/game-asset-image';
import Link from 'next/link';
import { GameInfoMenu } from '@/components/game-info-menu';
import { SplashScrambleDailyLeaderboard } from '@/components/splash-scramble-daily-leaderboard';
import {
  createEmptyPlayerStats,
  getDailyDateKey,
  getOrCreateClientId,
  getPlayerGameStreakForMode,
  loadPlayerGameStats,
  PLAYER_GAME_STATS_CHANGED_EVENT,
  recordAppWin,
  recordPlayerGameCompletion,
  type SoloQuizStreakScope,
  type PlayerGameStats,
} from '@/lib/game-storage';
import type { QuizItem } from '@/lib/quiz';
import { getNextUtcResetLabel } from '@/lib/quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { SplashScrambleLeaderboardSnapshot } from '@/lib/splash-scramble-leaderboard';
import { submitAchievementEvents } from '@/lib/achievement-client';
import { playUiSound } from '@/lib/ui-sounds';

type PuzzlePhase = 'prematch' | 'loading' | 'playing' | 'won' | 'lost';
type PuzzleMode = 'regular' | 'daily';
type RotationDegrees = 0 | 90 | 180 | 270;

type GridOption = {
  size: number;
  label: string;
  description: string;
};

type TimeOption = {
  seconds: number | null;
  label: string;
};

type SplashScrambleSettings = {
  gridSize: number;
  timeLimit: number | null;
  showReference: boolean;
  lockCorrectTiles: boolean;
  rotateTiles: boolean;
};

type SavedRoundState = SplashScrambleSettings & {
  version: 1;
  mode?: PuzzleMode;
  dateKey?: string;
  targetSkin: QuizItem;
  selectedSkin: QuizItem | null;
  tiles: number[];
  rotations: RotationDegrees[];
  lockedPositions: number[];
  moves: number;
  startedAt: number;
  endsAt: number | null;
  pausedAt?: number;
  savedAt: number;
};

type DailyCompletionSummary = {
  version: 1;
  dateKey: string;
  targetSkin: QuizItem;
  timeLimit: number | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  moves: number;
  dailyGlobalSolves: number | null;
  skinSolveCount: number | null;
};

type SplashScrambleStats = {
  solvesByPieceCount: Record<string, number>;
  solvesWithReference: number;
  solvesWithoutReference: number;
  solvesWithLocking: number;
};

type AccountPayload = {
  state: SavedRoundState | null;
  stats: SplashScrambleStats | null;
};

type DailyStatsResponse = {
  correctSolves?: number;
};

type SkinSolveResponse = {
  skinKey?: string;
  solveCount?: number;
};

const ACTIVE_ROUND_STORAGE_KEY = 'knowleague:v1:splash-scramble:active-round';
const DAILY_ROUND_STORAGE_KEY = 'knowleague:v1:splash-scramble:daily-round';
const DAILY_COMPLETION_STORAGE_KEY_PREFIX = 'knowleague:v1:splash-scramble:daily-completion';
const STATS_STORAGE_KEY = 'knowleague:v1:splash-scramble:stats';
const SKIN_SEARCH_ROW_HEIGHT = 56;
const SKIN_SEARCH_MAX_HEIGHT = 360;
const SKIN_SEARCH_OVERSCAN = 4;
const CLOCKWISE_ROTATION_KEYS = new Set(['arrowup', 'arrowleft', 'w', 'a']);
const COUNTER_CLOCKWISE_ROTATION_KEYS = new Set(['arrowdown', 'arrowright', 's', 'd']);
const DEFAULT_SETTINGS: SplashScrambleSettings = {
  gridSize: 6,
  timeLimit: null,
  showReference: true,
  lockCorrectTiles: true,
  rotateTiles: false,
};
const DAILY_SETTINGS: SplashScrambleSettings = {
  gridSize: 8,
  timeLimit: null,
  showReference: true,
  lockCorrectTiles: true,
  rotateTiles: false,
};

const EMPTY_DAILY_LEADERBOARD: SplashScrambleLeaderboardSnapshot = {
  entries: [],
  currentUserEntry: null,
};

const gridOptions: GridOption[] = [
  { size: 5, label: '5 x 5', description: '25 pieces' },
  { size: 6, label: '6 x 6', description: '36 pieces' },
  { size: 8, label: '8 x 8', description: '64 pieces' },
  { size: 10, label: '10 x 10', description: '100 pieces' },
  { size: 12, label: '12 x 12', description: '144 pieces' },
];

const timeOptions: TimeOption[] = [
  { seconds: 180, label: '3:00' },
  { seconds: 300, label: '5:00' },
  { seconds: 480, label: '8:00' },
  { seconds: 720, label: '12:00' },
  { seconds: null, label: 'No Timer' },
];

let splashScrambleSkinsRequest: Promise<QuizItem[]> | null = null;
const splashScrambleDailyTargetRequests = new Map<string, Promise<QuizItem>>();
const splashScrambleAccountRequests = new Map<string, Promise<AccountPayload | null>>();

function createEmptyStats(): SplashScrambleStats {
  return {
    solvesByPieceCount: {},
    solvesWithReference: 0,
    solvesWithoutReference: 0,
    solvesWithLocking: 0,
  };
}

function shuffleTiles(tileCount: number) {
  const tiles = Array.from({ length: tileCount }, (_, index) => index);

  // Sattolo's algorithm creates one random cycle, so no tile can remain in its original position.
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * index);
    [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
  }

  return tiles;
}

function createInitialRotations(tileCount: number, rotateTiles: boolean): RotationDegrees[] {
  if (!rotateTiles) {
    return Array.from({ length: tileCount }, () => 0);
  }

  const rotationOptions: RotationDegrees[] = [90, 180, 270];
  return Array.from({ length: tileCount }, () => rotationOptions[Math.floor(Math.random() * rotationOptions.length)]);
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function countCorrectPositions(tiles: readonly number[], rotations: readonly RotationDegrees[]) {
  return tiles.reduce((count, tile, index) => count + (tile === index && (rotations[index] ?? 0) === 0 ? 1 : 0), 0);
}

function getMisplacedPositions(tiles: readonly number[], rotations: readonly RotationDegrees[]) {
  return tiles.flatMap((tile, index) => (tile !== index || (rotations[index] ?? 0) !== 0 ? [index] : []));
}

function isSolved(tiles: readonly number[], rotations: readonly RotationDegrees[]) {
  return countCorrectPositions(tiles, rotations) === tiles.length;
}

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to load splash art.'));
    image.src = src;
  });
}

async function fetchSkins() {
  if (splashScrambleSkinsRequest) {
    return splashScrambleSkinsRequest;
  }

  splashScrambleSkinsRequest = fetch('/api/skindle/skins')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to load skin list.');
      }
      return response.json() as Promise<QuizItem[]>;
    })
    .then((skins) => skins.filter((skin) => skin.imageUrl))
    .catch((error) => {
      splashScrambleSkinsRequest = null;
      throw error;
    });

  return splashScrambleSkinsRequest;
}

async function loadRandomSkin(cachedSkins: readonly QuizItem[], excludedSkinId?: string) {
  const eligibleSkins = cachedSkins.length > 0 ? cachedSkins : await fetchSkins();
  const availableSkins = excludedSkinId
    ? eligibleSkins.filter((skin) => skin.id !== excludedSkinId)
    : eligibleSkins;
  const skinPool = availableSkins.length > 0 ? availableSkins : eligibleSkins;
  const skin = skinPool[Math.floor(Math.random() * skinPool.length)];

  if (!skin) {
    throw new Error('No skin splash art is available.');
  }

  return skin;
}

async function loadDailySkin() {
  const dateKey = getDailyDateKey();
  const existingRequest = splashScrambleDailyTargetRequests.get(dateKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch('/api/skindle/target')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to load daily splash art.');
      }
      return response.json() as Promise<QuizItem>;
    });
  splashScrambleDailyTargetRequests.set(dateKey, request);
  void request.catch(() => {
    if (splashScrambleDailyTargetRequests.get(dateKey) === request) {
      splashScrambleDailyTargetRequests.delete(dateKey);
    }
  });
  return request;
}

function getInitialLockedPositions(tiles: readonly number[], rotations: readonly RotationDegrees[], lockCorrectTiles: boolean) {
  if (!lockCorrectTiles) {
    return new Set<number>();
  }

  return new Set(tiles.flatMap((tile, position) => (tile === position && (rotations[position] ?? 0) === 0 ? [position] : [])));
}

function getSavedElapsedMilliseconds(round: SavedRoundState, now = Date.now()) {
  return Math.max(0, (round.pausedAt ?? now) - round.startedAt);
}

function getSavedRemainingMilliseconds(round: SavedRoundState, now = Date.now()) {
  return round.endsAt === null ? 0 : Math.max(0, round.endsAt - (round.pausedAt ?? now));
}

function getSavedElapsedSeconds(round: SavedRoundState, now = Date.now()) {
  return Math.max(0, Math.floor(getSavedElapsedMilliseconds(round, now) / 1000));
}

function getSavedRemainingSeconds(round: SavedRoundState, now = Date.now()) {
  return Math.max(0, Math.ceil(getSavedRemainingMilliseconds(round, now) / 1000));
}

function isRoundResumeable(round: SavedRoundState, now = Date.now()) {
  return round.timeLimit === null || round.endsAt === null || round.endsAt > (round.pausedAt ?? now);
}

function isSavedRoundPlayable(round: SavedRoundState, now = Date.now()) {
  return isRoundResumeable(round, now) && !isSolved(round.tiles, round.rotations);
}

function getStatsKey(columns: number, rows: number) {
  return `${columns}x${rows}`;
}

function getRoundStorageKey(mode: PuzzleMode) {
  return mode === 'daily' ? DAILY_ROUND_STORAGE_KEY : ACTIVE_ROUND_STORAGE_KEY;
}

function readLocalSavedRound(mode: PuzzleMode = 'regular') {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawRound = window.localStorage.getItem(getRoundStorageKey(mode));
    if (!rawRound) {
      return null;
    }

    const round = JSON.parse(rawRound) as SavedRoundState;
    if (round.version !== 1 || !round.targetSkin?.imageUrl || !Array.isArray(round.tiles)) {
      return null;
    }

    if (mode === 'daily' && round.dateKey !== getDailyDateKey()) {
      window.localStorage.removeItem(getRoundStorageKey(mode));
      return null;
    }

    if (!isSavedRoundPlayable(round)) {
      window.localStorage.removeItem(getRoundStorageKey(mode));
      return null;
    }

    return round;
  } catch {
    return null;
  }
}

function saveLocalRound(round: SavedRoundState, mode: PuzzleMode = round.mode ?? 'regular') {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getRoundStorageKey(mode), JSON.stringify(round));
}

function clearLocalRound(mode: PuzzleMode = 'regular') {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getRoundStorageKey(mode));
}

function getDailyCompletionStorageKey(accountId: string) {
  return `${DAILY_COMPLETION_STORAGE_KEY_PREFIX}:${accountId}`;
}

function readLocalDailyCompletion(accountId: string, dateKey = getDailyDateKey()) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storageKey = getDailyCompletionStorageKey(accountId);
    const rawCompletion = window.localStorage.getItem(storageKey);
    if (!rawCompletion) {
      return null;
    }

    const completion = JSON.parse(rawCompletion) as Partial<DailyCompletionSummary>;
    if (
      completion.version !== 1
      || completion.dateKey !== dateKey
      || !completion.targetSkin?.imageUrl
      || typeof completion.timeLimit !== 'number' && completion.timeLimit !== null
      || typeof completion.elapsedSeconds !== 'number'
      || typeof completion.remainingSeconds !== 'number'
      || typeof completion.moves !== 'number'
      || typeof completion.dailyGlobalSolves !== 'number' && completion.dailyGlobalSolves !== null
    ) {
      if (completion.dateKey !== dateKey) {
        window.localStorage.removeItem(storageKey);
      }
      return null;
    }

    return {
      ...completion,
      skinSolveCount: typeof completion.skinSolveCount === 'number' ? completion.skinSolveCount : null,
    } as DailyCompletionSummary;
  } catch {
    return null;
  }
}

function saveLocalDailyCompletion(completion: DailyCompletionSummary, accountId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getDailyCompletionStorageKey(accountId), JSON.stringify(completion));
}

function clearLocalDailyCompletion(accountId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getDailyCompletionStorageKey(accountId));
}

function readLocalStats() {
  if (typeof window === 'undefined') {
    return createEmptyStats();
  }

  try {
    const rawStats = window.localStorage.getItem(STATS_STORAGE_KEY);
    return rawStats ? { ...createEmptyStats(), ...JSON.parse(rawStats) as Partial<SplashScrambleStats> } : createEmptyStats();
  } catch {
    return createEmptyStats();
  }
}

function normalizeStats(stats?: Partial<SplashScrambleStats> | null) {
  return {
    ...createEmptyStats(),
    ...stats,
    solvesByPieceCount: stats?.solvesByPieceCount ?? {},
  };
}

function saveLocalStats(stats: SplashScrambleStats) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
}

async function getAccountToken() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

async function syncAccountRound(round: SavedRoundState | null) {
  const token = await getAccountToken();
  if (!token) {
    return;
  }

  if (round) {
    await fetch('/api/splash-scramble/state', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: round }),
    });
    return;
  }

  await fetch('/api/splash-scramble/state', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function syncAccountStats(stats: SplashScrambleStats) {
  const token = await getAccountToken();
  if (!token) {
    return;
  }

  await fetch('/api/splash-scramble/state', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stats }),
  });
}

async function loadAccountPayload(accessToken?: string | null): Promise<AccountPayload | null> {
  const token = accessToken === undefined ? await getAccountToken() : accessToken;
  if (!token) {
    return null;
  }

  const existingRequest = splashScrambleAccountRequests.get(token);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch('/api/splash-scramble/state', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    if (!response.ok) {
      return null;
    }

    const result = await response.json() as { state?: SavedRoundState | null; stats?: SplashScrambleStats | null };
    const round = result.state ?? null;
    return {
      state: round && isRoundResumeable(round) ? round : null,
      stats: result.stats ? normalizeStats(result.stats) : null,
    };
  });
  splashScrambleAccountRequests.set(token, request);
  const clearRequest = () => {
    if (splashScrambleAccountRequests.get(token) === request) {
      splashScrambleAccountRequests.delete(token);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function SettingButton({
  selected,
  disabled,
  icon,
  title,
  sideLabel,
  description,
  solveCount,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  sideLabel?: string;
  description?: string;
  solveCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        playUiSound('setting-select');
        onClick();
      }}
      disabled={disabled}
      className={`group flex gap-3 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-amber-300/70 bg-amber-300/10  '
          : 'border-white/10 bg-slate-950/70 hover:border-white/25 hover:bg-slate-950'
      } ${description ? 'min-h-20 items-start' : 'min-h-14 items-center'}`}
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
        selected ? 'border-amber-300/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
          <span className="min-w-0 truncate">{title}</span>
          {selected ? <Check size={15} className="shrink-0 text-amber-300" /> : null}
          {sideLabel ? <span className="ml-auto shrink-0 text-xs font-semibold italic text-slate-500">{sideLabel}</span> : null}
        </span>
        {solveCount !== undefined ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[0.68rem] font-bold text-slate-300">
            <Trophy size={11} className="text-amber-300" />
            {solveCount}
          </span>
        ) : null}
        {description ? <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span> : null}
      </span>
    </button>
  );
}

function StatPill({ label, value, valueClassName = 'text-white' }: { label: string; value: string | number; valueClassName?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 sm:px-4 sm:py-3">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">{label}</p>
      <p className={`mt-1 text-base font-black sm:text-lg ${valueClassName}`}>{value}</p>
    </div>
  );
}

function EndStateSettingsCard({
  daily,
  gridSize,
  timeLimit,
  showReference,
  lockCorrectTiles,
  rotateTiles,
}: SplashScrambleSettings & { daily: boolean }) {
  if (daily) {
    return (
      <aside className="flex w-full shrink-0 items-center justify-center self-end rounded-2xl border border-amber-300/35 bg-slate-950/80 px-6 py-5  backdrop-blur-md sm:w-52" aria-label="Daily puzzle">
        <div className="flex items-center gap-3 text-amber-100">
          <CalendarDays size={26} className="text-amber-300" />
          <span className="text-2xl font-black tracking-tight">Daily</span>
        </div>
      </aside>
    );
  }

  const settings = [
    { label: 'Pieces', value: rotateTiles ? '16 x 9' : `${gridSize} x ${gridSize}`, icon: <Grid3X3 size={15} /> },
    { label: 'Timer', value: timeLimit === null ? 'No Timer' : formatTimer(timeLimit), icon: <Clock3 size={15} /> },
    { label: 'Reference', value: showReference ? 'Visible Reference' : 'Hidden Reference', icon: showReference ? <Eye size={15} /> : <EyeOff size={15} /> },
    { label: 'Tile Locking', value: lockCorrectTiles ? 'Locked Tiles' : 'Unlocked Tiles', icon: lockCorrectTiles ? <Lock size={15} /> : <LockOpen size={15} /> },
    { label: 'Rotation', value: rotateTiles ? 'Rotation Enabled' : 'Rotation Disabled', icon: rotateTiles ? <RotateCw size={15} /> : <RotateCcw size={15} /> },
  ];

  return (
    <aside className="w-full shrink-0 self-end rounded-2xl border border-white/10 bg-slate-950/80 p-4  backdrop-blur-md sm:w-60" aria-label="Puzzle settings">
      <div className="space-y-3">
        {settings.map((setting) => (
          <div key={setting.label} className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-amber-200">
              {setting.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{setting.label}</span>
              <span className="block truncate text-sm font-bold text-white">{setting.value}</span>
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

type PuzzleBoardProps = {
  tiles: readonly number[];
  rotations: readonly RotationDegrees[];
  activeColumns: number;
  activeRows: number;
  boardColumns: CSSProperties;
  boardUsesRotatedMobileView: boolean;
  imageUrl: string | null;
  selectedTile: number | null;
  lockedPositions: ReadonlySet<number>;
  flashingPositions: ReadonlySet<number>;
  misplacedHintPositions: ReadonlySet<number>;
  onTileClick: (position: number) => void;
};

const PuzzleBoard = memo(function PuzzleBoard({
  tiles,
  rotations,
  activeColumns,
  activeRows,
  boardColumns,
  boardUsesRotatedMobileView,
  imageUrl,
  selectedTile,
  lockedPositions,
  flashingPositions,
  misplacedHintPositions,
  onTileClick,
}: PuzzleBoardProps) {
  return (
    <div
      className={`grid overflow-hidden ${
        boardUsesRotatedMobileView
          ? 'absolute left-1/2 top-1/2 aspect-video w-[177.777%] -translate-x-1/2 -translate-y-1/2 rotate-90 sm:static sm:h-full sm:w-full sm:translate-x-0 sm:translate-y-0 sm:rotate-0'
          : 'h-full w-full'
      }`}
      style={boardColumns}
      aria-label="Scrambled splash art puzzle"
    >
      {tiles.map((tile, position) => {
        const tileRow = Math.floor(tile / activeColumns);
        const tileColumn = tile % activeColumns;
        const x = activeColumns === 1 ? 0 : (tileColumn / (activeColumns - 1)) * 100;
        const y = activeRows === 1 ? 0 : (tileRow / (activeRows - 1)) * 100;
        const selected = selectedTile === position;
        const locked = lockedPositions.has(position);
        const flashing = flashingPositions.has(position);
        const misplacedHint = misplacedHintPositions.has(position);
        const rotation = rotations[position] ?? 0;

        return (
          <button
            key={position}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onTileClick(position)}
            disabled={locked}
            className={`relative min-h-0 touch-manipulation select-none overflow-hidden border bg-slate-950 transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-default ${
              flashing
                ? 'z-20 border-emerald-300 ring-2 ring-inset ring-emerald-300  brightness-125'
                : selected
                  ? 'z-20 scale-[0.98] border-amber-300 ring-2 ring-inset ring-amber-300 '
                  : misplacedHint
                    ? 'z-10 border-sky-300 ring-2 ring-inset ring-sky-300  brightness-125'
                    : locked
                      ? 'border-emerald-400/40 brightness-105'
                      : 'border-slate-950/60 hover:brightness-110'
            }`}
            aria-label={`Tile ${position + 1}${locked ? ', locked' : ''}`}
            aria-pressed={selected}
          >
            <span
              className="absolute inset-0 bg-cover bg-no-repeat"
              style={{
                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                backgroundPosition: `${x}% ${y}%`,
                backgroundSize: `${activeColumns * 100}% ${activeRows * 100}%`,
                transform: `rotate(${rotation}deg)`,
              }}
            />
            {selected || flashing || misplacedHint ? (
              <span
                className={`pointer-events-none absolute inset-0 z-10 ${
                  flashing
                    ? 'ring-4 ring-inset ring-emerald-300 '
                    : selected
                      ? 'ring-4 ring-inset ring-amber-300 '
                      : 'ring-4 ring-inset ring-sky-300 '
                }`}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
});

export function SplashScramble() {
  const [phase, setPhase] = useState<PuzzlePhase>('prematch');
  const [roundMode, setRoundMode] = useState<PuzzleMode>('regular');
  const [gridSize, setGridSize] = useState(DEFAULT_SETTINGS.gridSize);
  const [timeLimit, setTimeLimit] = useState<number | null>(DEFAULT_SETTINGS.timeLimit);
  const [showReference, setShowReference] = useState(DEFAULT_SETTINGS.showReference);
  const [lockCorrectTiles, setLockCorrectTiles] = useState(DEFAULT_SETTINGS.lockCorrectTiles);
  const [rotateTiles, setRotateTiles] = useState(DEFAULT_SETTINGS.rotateTiles);
  const [mobileViewRotated, setMobileViewRotated] = useState(false);
  const [skinCatalog, setSkinCatalog] = useState<QuizItem[]>([]);
  const [skinSearch, setSkinSearch] = useState('');
  const deferredSkinSearch = useDeferredValue(skinSearch);
  const [skinSearchScrollTop, setSkinSearchScrollTop] = useState(0);
  const [selectedSkin, setSelectedSkin] = useState<QuizItem | null>(null);
  const [skinListError, setSkinListError] = useState('');
  const [targetSkin, setTargetSkin] = useState<QuizItem | null>(null);
  const [targetSkinSolveCount, setTargetSkinSolveCount] = useState<number | null>(null);
  const [tiles, setTiles] = useState<number[]>([]);
  const [rotations, setRotations] = useState<RotationDegrees[]>([]);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [lockedPositions, setLockedPositions] = useState<Set<number>>(new Set());
  const [flashingPositions, setFlashingPositions] = useState<Set<number>>(new Set());
  const [misplacedHintPositions, setMisplacedHintPositions] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [resumeRound, setResumeRound] = useState<SavedRoundState | null>(null);
  const [dailyResumeRound, setDailyResumeRound] = useState<SavedRoundState | null>(null);
  const [stats, setStats] = useState<SplashScrambleStats>(() => createEmptyStats());
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => createEmptyPlayerStats('splash-scramble'));
  const [dailyCompletionSummary, setDailyCompletionSummary] = useState<DailyCompletionSummary | null>(null);
  const [clientStateReady, setClientStateReady] = useState(false);
  const [profileStatsLoaded, setProfileStatsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [timeToNextDaily, setTimeToNextDaily] = useState('00:00:00');
  const [dailyGlobalSolves, setDailyGlobalSolves] = useState<number | null>(null);
  const [dailyLeaderboardSnapshot, setDailyLeaderboardSnapshot] = useState<SplashScrambleLeaderboardSnapshot>(EMPTY_DAILY_LEADERBOARD);
  const [dailyLeaderboardLoading, setDailyLeaderboardLoading] = useState(false);
  const [dailyLeaderboardError, setDailyLeaderboardError] = useState('');
  const [dailyLeaderboardUserId, setDailyLeaderboardUserId] = useState<string | null>(null);
  const [dailyLeaderboardFriendIds, setDailyLeaderboardFriendIds] = useState<Set<string>>(new Set());
  const [dailyCompletionStatus, setDailyCompletionStatus] = useState<boolean | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const misplacedHintTimeoutRef = useRef<number | null>(null);
  const lastAccountSyncMoveRef = useRef<number | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);
  const timerExpiredSoundPlayedRef = useRef(false);
  const hoveredSkinSuggestionIdRef = useRef<string | null>(null);
  const solveRecordedRef = useRef(false);
  const dailyStatsRequestIdRef = useRef(0);
  const dailyLeaderboardRequestIdRef = useRef(0);
  const skinSolveRequestIdRef = useRef(0);
  const dailyLeaderboardUserIdRef = useRef<string | null>(null);
  const guestDailyCompletionRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  const roundModeRef = useRef(roundMode);
  const startedAtRef = useRef<number | null>(startedAt);
  const endsAtRef = useRef<number | null>(endsAt);
  const buildSavedRoundRef = useRef<(() => SavedRoundState | null)>(() => null);
  const rotateSelectedTileRef = useRef<(direction?: 1 | -1) => void>(() => undefined);
  const handleTileClickRef = useRef<(position: number) => void>(() => undefined);
  const activeDateKeyRef = useRef(getDailyDateKey());
  const handleTileClick = useCallback((position: number) => handleTileClickRef.current(position), []);

  phaseRef.current = phase;
  roundModeRef.current = roundMode;
  startedAtRef.current = startedAt;
  endsAtRef.current = endsAt;
  dailyLeaderboardUserIdRef.current = dailyLeaderboardUserId;

  const configuredColumns = rotateTiles ? 16 : gridSize;
  const configuredRows = rotateTiles ? 9 : gridSize;
  const configuredTileCount = configuredColumns * configuredRows;
  const started = phase === 'playing';
  const roundEnded = phase === 'won' || phase === 'lost';
  const activeSquareRoot = Math.sqrt(tiles.length);
  const activeColumns = tiles.length > 0
    ? rotateTiles && tiles.length === 144
      ? 16
      : Number.isInteger(activeSquareRoot)
        ? activeSquareRoot
        : configuredColumns
    : configuredColumns;
  const activeRows = tiles.length > 0 ? Math.ceil(tiles.length / activeColumns) : configuredRows;
  const tileCount = started || roundEnded ? tiles.length : configuredTileCount;
  const puzzleLabel = `${configuredColumns} x ${configuredRows}`;
  const misplacedPositions = useMemo(() => getMisplacedPositions(tiles, rotations), [rotations, tiles]);
  const misplacedPositionCount = misplacedPositions.length;
  const correctPositions = tiles.length - misplacedPositionCount;
  const timerLabel = timeLimit === null ? 'No Timer' : formatTimer(timeLimit);
  const activeTimeValue = timeLimit === null ? formatTimer(elapsedSeconds) : formatTimer(remainingSeconds);
  const timerUrgent = phase === 'playing' && timeLimit !== null && remainingSeconds > 0 && remainingSeconds <= 10;
  const timerValueClassName = timeLimit === null ? 'text-white' : timerUrgent ? 'animate-pulse text-red-300' : 'text-amber-200';
  const boardColumns = useMemo(() => ({
    gridTemplateColumns: `repeat(${activeColumns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${activeRows}, minmax(0, 1fr))`,
  }), [activeColumns, activeRows]);
  const boardUsesRotatedMobileView = mobileViewRotated && !rotateTiles;
  const skinSearchIndex = useMemo(() => (
    skinCatalog.map((skin) => ({
      skin,
      searchText: `${skin.answer} ${skin.champion}`.toLowerCase(),
    }))
  ), [skinCatalog]);
  const filteredSkins = useMemo(() => {
    const query = deferredSkinSearch.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return skinSearchIndex
      .filter((entry) => entry.searchText.includes(query))
      .map((entry) => entry.skin);
  }, [deferredSkinSearch, skinSearchIndex]);
  const skinSearchListHeight = Math.min(SKIN_SEARCH_MAX_HEIGHT, filteredSkins.length * SKIN_SEARCH_ROW_HEIGHT);
  const skinSearchStartIndex = Math.max(0, Math.floor(skinSearchScrollTop / SKIN_SEARCH_ROW_HEIGHT) - SKIN_SEARCH_OVERSCAN);
  const skinSearchVisibleCount = Math.ceil(SKIN_SEARCH_MAX_HEIGHT / SKIN_SEARCH_ROW_HEIGHT) + SKIN_SEARCH_OVERSCAN * 2;
  const visibleFilteredSkins = filteredSkins.slice(skinSearchStartIndex, skinSearchStartIndex + skinSearchVisibleCount);
  const skinSearchIsUpdating = skinSearch !== deferredSkinSearch;
  const pieceStats = useMemo(
    () => [
      ...gridOptions.map((option) => ({
        label: option.label,
        count: stats.solvesByPieceCount[getStatsKey(option.size, option.size)] ?? stats.solvesByPieceCount[String(option.size)] ?? 0,
      })),
      {
        label: '16 x 9',
        count: stats.solvesByPieceCount[getStatsKey(16, 9)] ?? 0,
      },
    ],
    [stats.solvesByPieceCount],
  );
  const regularStreak = getPlayerGameStreakForMode(playerStats, 'casual').currentStreak;
  const dailyStreak = getPlayerGameStreakForMode(playerStats, 'daily').currentStreak;
  const dailyCompletedToday = dailyCompletionStatus === true;
  const getPieceSolveCount = (columns: number, rows = columns) => (
    stats.solvesByPieceCount[getStatsKey(columns, rows)] ?? stats.solvesByPieceCount[String(columns)] ?? 0
  );

  useEffect(() => {
    setSkinSearchScrollTop(0);
  }, [deferredSkinSearch]);

  useEffect(() => {
    if (phase === 'prematch') {
      void loadDailyLeaderboard();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'prematch') {
      return;
    }

    if (!selectedSkin) {
      setTargetSkinSolveCount(null);
      return;
    }

    void loadTargetSkinSolveCount(selectedSkin.id);
  }, [phase, selectedSkin]);

  useEffect(() => {
    const handleStatsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ gameId?: string; stats?: PlayerGameStats }>).detail;
      if (detail?.gameId === 'splash-scramble' && detail.stats) {
        setPlayerStats(detail.stats);
      }
    };

    window.addEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);
    return () => window.removeEventListener(PLAYER_GAME_STATS_CHANGED_EVENT, handleStatsChanged);
  }, []);

  const playSkinSuggestionHoverSound = (skinId: string) => {
    if (hoveredSkinSuggestionIdRef.current === skinId) {
      return;
    }

    hoveredSkinSuggestionIdRef.current = skinId;
    playUiSound('autocomplete-hover');
  };

  const resetTimerSoundRefs = () => {
    lastCountdownSecondRef.current = null;
    timerExpiredSoundPlayedRef.current = false;
  };

  const loadDailyGlobalSolves = async () => {
    const requestId = dailyStatsRequestIdRef.current + 1;
    dailyStatsRequestIdRef.current = requestId;
    setDailyGlobalSolves(null);
    try {
      const response = await fetch('/api/splash-scramble/stats', { cache: 'no-store' });
      if (!response.ok || requestId !== dailyStatsRequestIdRef.current) {
        return;
      }

      const data = await response.json() as DailyStatsResponse;
      if (typeof data.correctSolves === 'number') {
        updateDailyGlobalSolves(data.correctSolves);
      }
    } catch {
      if (requestId === dailyStatsRequestIdRef.current) {
        setDailyGlobalSolves(null);
      }
    }
  };

  const loadDailyLeaderboard = async () => {
    const requestId = dailyLeaderboardRequestIdRef.current + 1;
    dailyLeaderboardRequestIdRef.current = requestId;
    const previousUserId = dailyLeaderboardUserIdRef.current;
    setDailyLeaderboardLoading(true);
    setDailyLeaderboardError('');
    setDailyCompletionStatus(null);

    try {
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const session = data.session;
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
      const [leaderboardResponse, friendsResponse] = await Promise.all([
        fetch('/api/splash-scramble/leaderboard', { headers, cache: 'no-store' }),
        session ? fetch('/api/friends', { headers, cache: 'no-store' }) : Promise.resolve(null),
      ]);
      const leaderboard = await leaderboardResponse.json() as SplashScrambleLeaderboardSnapshot & { error?: string };
      if (!leaderboardResponse.ok) {
        throw new Error(leaderboard.error ?? 'Unable to load the daily leaderboard.');
      }

      const friends = friendsResponse?.ok
        ? await friendsResponse.json() as { friends?: Array<{ id: string }> }
        : null;
      if (requestId !== dailyLeaderboardRequestIdRef.current) {
        return;
      }

      const nextUserId = session?.user.id ?? null;
      dailyLeaderboardUserIdRef.current = nextUserId;
      setDailyLeaderboardSnapshot({
        entries: Array.isArray(leaderboard.entries) ? leaderboard.entries : [],
        currentUserEntry: leaderboard.currentUserEntry ?? null,
      });
      setDailyLeaderboardUserId(nextUserId);
      setDailyLeaderboardFriendIds(new Set((friends?.friends ?? []).map((friend) => friend.id)));
      setDailyCompletionStatus(Boolean(session && leaderboard.currentUserEntry) || (!session && guestDailyCompletionRef.current));
      if (nextUserId !== previousUserId) {
        setDailyCompletionSummary(session ? readLocalDailyCompletion(session.user.id) : null);
      }
    } catch (loadError) {
      if (requestId === dailyLeaderboardRequestIdRef.current) {
        setDailyLeaderboardError(loadError instanceof Error ? loadError.message : 'Unable to load the daily leaderboard.');
        setDailyCompletionStatus(false);
      }
    } finally {
      if (requestId === dailyLeaderboardRequestIdRef.current) {
        setDailyLeaderboardLoading(false);
      }
    }
  };

  const saveCurrentDailyCompletion = (completion: DailyCompletionSummary) => {
    const accountId = dailyLeaderboardUserIdRef.current;
    if (accountId) {
      saveLocalDailyCompletion(completion, accountId);
    }
  };

  const clearCurrentDailyCompletion = () => {
    const accountId = dailyLeaderboardUserIdRef.current;
    if (accountId) {
      clearLocalDailyCompletion(accountId);
    }
  };

  const updateDailyGlobalSolves = (correctSolves: number) => {
    setDailyGlobalSolves(correctSolves);
    setDailyCompletionSummary((current) => {
      if (!current || current.dateKey !== activeDateKeyRef.current) {
        return current;
      }

      const nextCompletion = { ...current, dailyGlobalSolves: correctSolves };
      saveCurrentDailyCompletion(nextCompletion);
      return nextCompletion;
    });
  };

  const recordDailyGlobalSolve = async () => {
    const requestId = dailyStatsRequestIdRef.current + 1;
    dailyStatsRequestIdRef.current = requestId;
    const clientId = getOrCreateClientId();
    if (!clientId) {
      return;
    }

    try {
      const response = await fetch('/api/splash-scramble/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!response.ok) {
        void loadDailyGlobalSolves();
        return;
      }

      const data = await response.json() as DailyStatsResponse;
      const correctSolves = data.correctSolves;
      if (requestId === dailyStatsRequestIdRef.current && typeof correctSolves === 'number') {
        updateDailyGlobalSolves(correctSolves);
      }
    } catch {
      if (requestId === dailyStatsRequestIdRef.current) {
        void loadDailyGlobalSolves();
      }
    }
  };

  const loadTargetSkinSolveCount = async (skinId: string) => {
    const requestId = skinSolveRequestIdRef.current + 1;
    skinSolveRequestIdRef.current = requestId;
    setTargetSkinSolveCount(null);

    try {
      const response = await fetch(`/api/splash-scramble/skins/${encodeURIComponent(skinId)}/solves`, { cache: 'no-store' });
      if (!response.ok || requestId !== skinSolveRequestIdRef.current) {
        return;
      }

      const data = await response.json() as SkinSolveResponse;
      if (typeof data.solveCount === 'number') {
        setTargetSkinSolveCount(data.solveCount);
      }
    } catch {
      if (requestId === skinSolveRequestIdRef.current) {
        setTargetSkinSolveCount(null);
      }
    }
  };

  const recordTargetSkinSolve = async (skinId: string) => {
    const requestId = skinSolveRequestIdRef.current + 1;
    skinSolveRequestIdRef.current = requestId;

    try {
      const response = await fetch(`/api/splash-scramble/skins/${encodeURIComponent(skinId)}/solves`, {
        method: 'POST',
      });
      if (!response.ok || requestId !== skinSolveRequestIdRef.current) {
        return;
      }

      const data = await response.json() as SkinSolveResponse;
      const solveCount = data.solveCount;
      if (typeof solveCount !== 'number') {
        return;
      }

      setTargetSkinSolveCount(solveCount);
      setDailyCompletionSummary((current) => {
        if (!current || current.targetSkin.id !== skinId) {
          return current;
        }

        const nextCompletion = { ...current, skinSolveCount: solveCount };
        saveCurrentDailyCompletion(nextCompletion);
        return nextCompletion;
      });
    } catch {
      // The completion remains valid even if the optional global skin count is unavailable.
    }
  };

  const submitDailyLeaderboard = async (moves: number, completionTimeSeconds: number) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return;
    }

    try {
      await fetch('/api/splash-scramble/leaderboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moves, completionTimeSeconds }),
      });
    } catch {
      // Leaderboard submission is non-blocking; the daily completion remains recorded locally.
    }
  };

  const buildSavedRound = useCallback((savedAt = Date.now()): SavedRoundState | null => {
    if (!targetSkin || phase !== 'playing' || startedAt === null) {
      return null;
    }

    return {
      version: 1,
      mode: roundMode,
      dateKey: roundMode === 'daily' ? activeDateKeyRef.current : undefined,
      gridSize,
      timeLimit,
      showReference,
      lockCorrectTiles,
      rotateTiles,
      selectedSkin,
      targetSkin,
      tiles,
      rotations,
      lockedPositions: Array.from(lockedPositions),
      moves,
      startedAt,
      endsAt,
      pausedAt: pausedAtRef.current ?? undefined,
      savedAt,
    };
  }, [endsAt, gridSize, lockCorrectTiles, lockedPositions, moves, phase, rotateTiles, rotations, roundMode, selectedSkin, showReference, startedAt, targetSkin, tiles, timeLimit]);
  buildSavedRoundRef.current = buildSavedRound;

  const applyRound = async (round: SavedRoundState) => {
    await preloadImage(round.targetSkin.imageUrl);
    const resumedAt = Date.now();
    const hasPausedTimestamp = typeof round.pausedAt === 'number';
    const resumedStartedAt = hasPausedTimestamp
      ? resumedAt - getSavedElapsedMilliseconds(round)
      : round.startedAt;
    const resumedEndsAt = round.endsAt === null
      ? null
      : hasPausedTimestamp
        ? resumedAt + getSavedRemainingMilliseconds(round)
        : round.endsAt;
    setRoundMode(round.mode ?? 'regular');
    setGridSize(round.gridSize);
    setTimeLimit(round.timeLimit);
    setShowReference(round.showReference);
    setLockCorrectTiles(round.lockCorrectTiles);
    setRotateTiles(round.rotateTiles);
    setSelectedSkin(round.selectedSkin);
    setTargetSkin(round.targetSkin);
    void loadTargetSkinSolveCount(round.targetSkin.id);
    setTiles(round.tiles);
    setRotations(round.rotations.length === round.tiles.length ? round.rotations : Array.from({ length: round.tiles.length }, () => 0));
    setLockedPositions(new Set(round.lockedPositions));
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
    setSelectedTile(null);
    setMoves(round.moves);
    setStartedAt(resumedStartedAt);
    setEndsAt(resumedEndsAt);
    setElapsedSeconds(hasPausedTimestamp ? getSavedElapsedSeconds(round) : getSavedElapsedSeconds(round, resumedAt));
    setRemainingSeconds(hasPausedTimestamp ? getSavedRemainingSeconds(round) : getSavedRemainingSeconds(round, resumedAt));
    pausedAtRef.current = null;
    resetTimerSoundRefs();
    setPhase('playing');
  };

  useEffect(() => {
    const localStats = readLocalStats();
    setStats(localStats);
    setPlayerStats(loadPlayerGameStats('splash-scramble'));
    setClientStateReady(true);
    const localRound = readLocalSavedRound('regular');
    const localDailyRound = readLocalSavedRound('daily');
    if (localRound) {
      setResumeRound(localRound);
    }
    if (localDailyRound) {
      setDailyResumeRound(localDailyRound);
    }

    const loadProfileData = (accessToken?: string | null) => {
      loadAccountPayload(accessToken)
        .then((payload) => {
          if (!payload) {
            setProfileStatsLoaded(false);
            return;
          }

          const nextStats = payload.stats ?? createEmptyStats();
          setStats(nextStats);
          saveLocalStats(nextStats);
          setProfileStatsLoaded(true);

          if (payload.state && isSavedRoundPlayable(payload.state)) {
            setResumeRound(payload.state);
            saveLocalRound(payload.state, 'regular');
          } else if (payload.state) {
            setResumeRound(null);
            clearLocalRound('regular');
            syncAccountRound(null).catch(() => undefined);
          } else if (localRound) {
            syncAccountRound(localRound).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };

    loadProfileData();
    const supabase = getOptionalSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadProfileData(session?.access_token ?? null);
        void loadDailyLeaderboard();
      }

      if (event === 'SIGNED_OUT') {
        setStats(readLocalStats());
        setPlayerStats(loadPlayerGameStats('splash-scramble'));
        setProfileStatsLoaded(false);
        dailyLeaderboardUserIdRef.current = null;
        guestDailyCompletionRef.current = false;
        setDailyLeaderboardUserId(null);
        setDailyCompletionStatus(null);
        setDailyCompletionSummary(null);
        void loadDailyLeaderboard();
        const savedRound = readLocalSavedRound('regular');
        const savedDailyRound = readLocalSavedRound('daily');
        if (savedRound) {
          setResumeRound(savedRound);
        }
        if (savedDailyRound) {
          setDailyResumeRound(savedDailyRound);
        }
      }
    });

    return () => subscription?.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const updateDailyReset = () => {
      const nextDateKey = getDailyDateKey();
      setTimeToNextDaily(getNextUtcResetLabel());
      if (nextDateKey === activeDateKeyRef.current) {
        return;
      }

      activeDateKeyRef.current = nextDateKey;
      dailyStatsRequestIdRef.current += 1;
      dailyLeaderboardRequestIdRef.current += 1;
      skinSolveRequestIdRef.current += 1;
      clearLocalRound('daily');
      clearCurrentDailyCompletion();
      setDailyResumeRound(null);
      setDailyCompletionSummary(null);
      setDailyGlobalSolves(null);
      setDailyCompletionStatus(null);
      guestDailyCompletionRef.current = false;
      setDailyLeaderboardSnapshot(EMPTY_DAILY_LEADERBOARD);
      setDailyLeaderboardError('');
      setDailyLeaderboardUserId(null);
      setDailyLeaderboardFriendIds(new Set());
      if (roundMode === 'daily') {
        pausedAtRef.current = null;
        setRoundMode('regular');
        setPhase('prematch');
        setTargetSkin(null);
        setTargetSkinSolveCount(null);
        setSelectedSkin(null);
        setTiles([]);
        setRotations([]);
        setSelectedTile(null);
        setLockedPositions(new Set());
        setFlashingPositions(new Set());
        setMisplacedHintPositions(new Set());
        setMoves(0);
        setStartedAt(null);
        setEndsAt(null);
        setElapsedSeconds(0);
        setRemainingSeconds(0);
        setMobileViewRotated(false);
        lastAccountSyncMoveRef.current = null;
        solveRecordedRef.current = false;
        resetTimerSoundRefs();
      }
    };

    updateDailyReset();
    const interval = window.setInterval(updateDailyReset, 1000);
    return () => window.clearInterval(interval);
  }, [phase, roundMode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.hidden) {
        if (phaseRef.current !== 'playing' || roundModeRef.current !== 'daily' || pausedAtRef.current !== null) {
          return;
        }

        pausedAtRef.current = now;
        const round = buildSavedRoundRef.current();
        if (round) {
          saveLocalRound(round, 'daily');
          setDailyResumeRound(round);
          setElapsedSeconds(getSavedElapsedSeconds(round, now));
          setRemainingSeconds(getSavedRemainingSeconds(round, now));
        }
        return;
      }

      const pausedAt = pausedAtRef.current;
      const currentStartedAt = startedAtRef.current;
      if (pausedAt === null || phaseRef.current !== 'playing' || roundModeRef.current !== 'daily' || currentStartedAt === null) {
        return;
      }

      const pauseDuration = Math.max(0, now - pausedAt);
      const resumedStartedAt = currentStartedAt + pauseDuration;
      const currentEndsAt = endsAtRef.current;
      const resumedEndsAt = currentEndsAt === null ? null : currentEndsAt + pauseDuration;
      pausedAtRef.current = null;
      setStartedAt(resumedStartedAt);
      setEndsAt(resumedEndsAt);

      const round = buildSavedRoundRef.current();
      if (round) {
        saveLocalRound({
          ...round,
          startedAt: resumedStartedAt,
          endsAt: resumedEndsAt,
          pausedAt: undefined,
          savedAt: now,
        }, 'daily');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => () => {
    if (phaseRef.current !== 'playing' || roundModeRef.current !== 'daily') {
      return;
    }

    const round = buildSavedRoundRef.current();
    if (round) {
      saveLocalRound({ ...round, pausedAt: pausedAtRef.current ?? Date.now() }, 'daily');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchSkins()
      .then((skins) => {
        if (!cancelled) {
          setSkinCatalog(skins);
          setSkinListError('');
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSkinListError(loadError instanceof Error ? loadError.message : 'Unable to load skin search.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    if (misplacedHintTimeoutRef.current !== null) {
      window.clearTimeout(misplacedHintTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || startedAt === null) {
      return undefined;
    }

    const updateTimer = () => {
      if (document.hidden) {
        return;
      }

      const nextElapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setElapsedSeconds(nextElapsed);

      if (timeLimit === null || endsAt === null) {
        lastCountdownSecondRef.current = null;
        return;
      }

      const nextRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        if (!timerExpiredSoundPlayedRef.current) {
          timerExpiredSoundPlayedRef.current = true;
          playUiSound('timer-expired');
        }
        setSelectedTile(null);
        clearLocalRound(roundMode);
        if (roundMode === 'daily') {
          setDailyResumeRound(null);
        } else {
          setResumeRound(null);
          syncAccountRound(null).catch(() => undefined);
        }
        setPhase('lost');
        return;
      }

      if (nextRemaining <= 10 && lastCountdownSecondRef.current !== nextRemaining) {
        lastCountdownSecondRef.current = nextRemaining;
        playUiSound('timer-countdown');
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [endsAt, phase, roundMode, startedAt, timeLimit]);

  useEffect(() => {
    const round = buildSavedRound();
    if (!round) {
      return;
    }

    saveLocalRound(round);
    if (round.mode === 'daily') {
      setDailyResumeRound(round);
    } else {
      setResumeRound(round);
    }
  }, [buildSavedRound]);

  useEffect(() => {
    if (phase !== 'playing' || moves === 0 || moves % 5 !== 0 || lastAccountSyncMoveRef.current === moves) {
      return;
    }

    const round = buildSavedRound();
    if (!round) {
      return;
    }

    lastAccountSyncMoveRef.current = moves;
    if (round.mode !== 'daily') {
      syncAccountRound(round).catch(() => undefined);
    }
  }, [buildSavedRound, moves, phase]);

  const recordSolveStats = () => {
    if (solveRecordedRef.current) {
      return;
    }

    solveRecordedRef.current = true;
    const streakScope: SoloQuizStreakScope = roundMode === 'daily' ? 'daily:all' : 'casual:all';
    setPlayerStats(recordPlayerGameCompletion('splash-scramble', [], undefined, streakScope));
    setStats((current) => {
      const nextStats: SplashScrambleStats = {
        solvesByPieceCount: {
          ...current.solvesByPieceCount,
          [getStatsKey(configuredColumns, configuredRows)]: (current.solvesByPieceCount[getStatsKey(configuredColumns, configuredRows)] ?? 0) + 1,
        },
        solvesWithReference: current.solvesWithReference + (showReference ? 1 : 0),
        solvesWithoutReference: current.solvesWithoutReference + (showReference ? 0 : 1),
        solvesWithLocking: current.solvesWithLocking + (lockCorrectTiles ? 1 : 0),
      };
      saveLocalStats(nextStats);
      syncAccountStats(nextStats).catch(() => undefined);
      return nextStats;
    });
  };

  const completeRound = (solvedTiles = tiles, solvedRotations = rotations, completionMoves = moves) => {
    if (phase !== 'playing' || !isSolved(solvedTiles, solvedRotations)) {
      return;
    }

    const completionElapsedSeconds = startedAt === null
      ? elapsedSeconds
      : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    setElapsedSeconds(completionElapsedSeconds);
    playUiSound('puzzle-complete');
    recordSolveStats();
    recordAppWin(`splash-scramble:${roundMode}:${startedAt ?? Date.now()}:${targetSkin?.id ?? 'unknown'}`);
    const achievementEvents = [
      { event: 'splash_scramble_completed' as const, metadata: { variant: 'puzzler' } },
      { event: 'solo_game_won' as const, metadata: { gameId: 'splash-scramble' } },
    ];
    if (roundMode === 'regular' && timeLimit === 180 && !showReference && !lockCorrectTiles) {
      achievementEvents.push({ event: 'splash_scramble_completed', metadata: { variant: 'speed_blitz' } });
    }
    if (roundMode === 'regular' && !showReference && !lockCorrectTiles && rotateTiles) {
      achievementEvents.push({ event: 'splash_scramble_completed', metadata: { variant: 'master_puzzler' } });
    }
    if (roundMode === 'regular' && gridSize === 5 && timeLimit === null && showReference && lockCorrectTiles && !rotateTiles) {
      achievementEvents.push({ event: 'splash_scramble_completed', metadata: { variant: 'novice_puzzler' } });
    }
    void submitAchievementEvents(achievementEvents);
    if (targetSkin) {
      void recordTargetSkinSolve(targetSkin.id);
    }
    if (roundMode === 'daily' && targetSkin) {
      const completion: DailyCompletionSummary = {
        version: 1,
        dateKey: activeDateKeyRef.current,
        targetSkin,
        timeLimit,
        elapsedSeconds: completionElapsedSeconds,
        remainingSeconds,
        moves: completionMoves,
        dailyGlobalSolves,
        skinSolveCount: targetSkinSolveCount,
      };
      saveCurrentDailyCompletion(completion);
      setDailyCompletionSummary(completion);
      if (!dailyLeaderboardUserIdRef.current) {
        guestDailyCompletionRef.current = true;
      }
      setDailyCompletionStatus(true);
      void recordDailyGlobalSolve();
      void submitDailyLeaderboard(completionMoves, completionElapsedSeconds).finally(() => {
        void loadDailyLeaderboard();
      });
    }
    clearLocalRound(roundMode);
    if (roundMode === 'daily') {
      setDailyResumeRound(null);
    } else {
      setResumeRound(null);
      syncAccountRound(null).catch(() => undefined);
    }
    setPhase('won');
  };

  const startRound = async (options?: { forceRandomSkin?: boolean; excludedSkinId?: string; mode?: PuzzleMode }) => {
    const nextMode = options?.mode ?? 'regular';
    const nextSettings = nextMode === 'daily'
      ? DAILY_SETTINGS
      : { gridSize, timeLimit, showReference, lockCorrectTiles, rotateTiles };
    setPhase('loading');
    setRoundMode(nextMode);
    setDailyGlobalSolves(null);
    setError('');
    setSelectedTile(null);
    setLockedPositions(new Set());
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
    setMoves(0);
    setElapsedSeconds(0);
    pausedAtRef.current = null;
    lastAccountSyncMoveRef.current = null;
    resetTimerSoundRefs();
    solveRecordedRef.current = false;

    try {
      const roundSelectedSkin = nextMode === 'daily' || options?.forceRandomSkin ? null : selectedSkin;
      if (nextMode === 'daily') {
        void loadDailyGlobalSolves();
      }
      const skin = nextMode === 'daily'
        ? await loadDailySkin()
        : roundSelectedSkin ?? await loadRandomSkin(skinCatalog, options?.excludedSkinId);
      await preloadImage(skin.imageUrl);
      const nextColumns = nextSettings.rotateTiles ? 16 : nextSettings.gridSize;
      const nextRows = nextSettings.rotateTiles ? 9 : nextSettings.gridSize;
      const nextTileCount = nextColumns * nextRows;
      const nextTiles = shuffleTiles(nextTileCount);
      const nextRotations = createInitialRotations(nextTileCount, nextSettings.rotateTiles);
      const now = Date.now();
      const initialLockedPositions = getInitialLockedPositions(nextTiles, nextRotations, nextSettings.lockCorrectTiles);
      const startedRound: SavedRoundState = {
        version: 1,
        mode: nextMode,
        dateKey: nextMode === 'daily' ? activeDateKeyRef.current : undefined,
        ...nextSettings,
        selectedSkin: roundSelectedSkin,
        targetSkin: skin,
        tiles: nextTiles,
        rotations: nextRotations,
        lockedPositions: Array.from(initialLockedPositions),
        moves: 0,
        startedAt: now,
        endsAt: nextSettings.timeLimit === null ? null : now + nextSettings.timeLimit * 1000,
        savedAt: now,
      };

      setGridSize(nextSettings.gridSize);
      setTimeLimit(nextSettings.timeLimit);
      setShowReference(nextSettings.showReference);
      setLockCorrectTiles(nextSettings.lockCorrectTiles);
      setRotateTiles(nextSettings.rotateTiles);
      setSelectedSkin(roundSelectedSkin);
      setTargetSkin(skin);
      void loadTargetSkinSolveCount(skin.id);
      setTiles(nextTiles);
      setRotations(nextRotations);
      setLockedPositions(initialLockedPositions);
      setRemainingSeconds(nextSettings.timeLimit ?? 0);
      setStartedAt(now);
      setEndsAt(startedRound.endsAt);
      saveLocalRound(startedRound);
      if (nextMode === 'daily') {
        setDailyResumeRound(startedRound);
      } else {
        setResumeRound(startedRound);
        syncAccountRound(startedRound).catch(() => undefined);
      }
      setPhase('playing');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to start the round.');
      setStartedAt(null);
      setEndsAt(null);
      setPhase('prematch');
    }
  };

  const startNewSkinRound = () => {
    if (moves > 0 && !window.confirm('Start a new skin? Your current swaps will be lost.')) {
      return;
    }

    playUiSound('random-select');
    void startRound({ forceRandomSkin: true, excludedSkinId: targetSkin?.id, mode: roundMode });
  };

  const resumeSavedRound = async (mode: PuzzleMode = 'regular') => {
    const round = mode === 'daily' ? dailyResumeRound : resumeRound;
    if (!round) {
      return;
    }

    setPhase('loading');
    setError('');
    setDailyGlobalSolves(null);

    try {
      if (mode === 'daily') {
        void loadDailyGlobalSolves();
      }
      await applyRound(round);
    } catch {
      clearLocalRound(mode);
      if (mode === 'daily') {
        setDailyResumeRound(null);
      } else {
        setResumeRound(null);
      }
      setPhase('prematch');
      setError('Unable to resume that saved round.');
    }
  };

  const returnToPrematch = () => {
    const round = buildSavedRound();
    if (round) {
      saveLocalRound(round);
      if (round.mode === 'daily') {
        setDailyResumeRound(round);
      } else {
        setResumeRound(round);
        syncAccountRound(round).catch(() => undefined);
      }
    }

    if (roundEnded && targetSkin && roundMode !== 'daily') {
      setSelectedSkin(targetSkin);
    }

    setPhase('prematch');
    setDailyGlobalSolves(null);
    setSelectedTile(null);
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
  };

  const clearCompletedRound = () => {
    clearLocalRound(roundMode);
    if (roundMode === 'daily') {
      setDailyResumeRound(null);
    } else {
      setResumeRound(null);
      syncAccountRound(null).catch(() => undefined);
    }
    if (targetSkin && roundMode !== 'daily') {
      setSelectedSkin(targetSkin);
    }
    setPhase('prematch');
    setDailyGlobalSolves(null);
    setSelectedTile(null);
    setStartedAt(null);
    setEndsAt(null);
    setRemainingSeconds(timeLimit ?? 0);
    setElapsedSeconds(0);
    resetTimerSoundRefs();
    setLockedPositions(new Set());
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
  };

  const reopenDailyCompletion = () => {
    if (!dailyCompletionSummary) {
      return;
    }

    setRoundMode('daily');
    setTargetSkin(dailyCompletionSummary.targetSkin);
    setTargetSkinSolveCount(dailyCompletionSummary.skinSolveCount);
    setTimeLimit(dailyCompletionSummary.timeLimit);
    setElapsedSeconds(dailyCompletionSummary.elapsedSeconds);
    setRemainingSeconds(dailyCompletionSummary.remainingSeconds);
    setMoves(dailyCompletionSummary.moves);
    setDailyGlobalSolves(dailyCompletionSummary.dailyGlobalSolves);
    setTiles([]);
    setRotations([]);
    setSelectedTile(null);
    setStartedAt(null);
    setEndsAt(null);
    setLockedPositions(new Set());
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
    setPhase('won');
  };

  const flashPositions = (positions: number[]) => {
    if (positions.length === 0) {
      return;
    }

    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }

    setFlashingPositions(new Set(positions));
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashingPositions(new Set());
      flashTimeoutRef.current = null;
    }, 650);
  };

  const revealMisplacedTiles = () => {
    if (phase !== 'playing' || !lockCorrectTiles) {
      return;
    }

    if (misplacedPositions.length === 0) {
      return;
    }

    if (misplacedHintTimeoutRef.current !== null) {
      window.clearTimeout(misplacedHintTimeoutRef.current);
    }

    setMisplacedHintPositions(new Set(misplacedPositions));
    misplacedHintTimeoutRef.current = window.setTimeout(() => {
      setMisplacedHintPositions(new Set());
      misplacedHintTimeoutRef.current = null;
    }, 900);
  };

  const updateLocksAfterMove = (nextTiles: readonly number[], nextRotations: readonly RotationDegrees[], candidatePositions: readonly number[]) => {
    if (!lockCorrectTiles) {
      return 0;
    }

    const nextLockedPositions = getInitialLockedPositions(nextTiles, nextRotations, true);
    const newlyCorrectPositions = candidatePositions.filter((candidate) => (
      nextLockedPositions.has(candidate) &&
      !lockedPositions.has(candidate)
    ));

    setLockedPositions(nextLockedPositions);

    if (newlyCorrectPositions.length > 0) {
      playUiSound('tile-lock-correct');
      flashPositions(newlyCorrectPositions);
      return newlyCorrectPositions.length;
    }

    playUiSound('tile-lock-miss');
    return 0;
  };

  handleTileClickRef.current = (position: number) => {
    if (phase !== 'playing' || lockedPositions.has(position)) {
      return;
    }

    if (selectedTile === null) {
      setSelectedTile(position);
      return;
    }

    if (lockedPositions.has(selectedTile)) {
      setSelectedTile(position);
      return;
    }

    if (selectedTile === position) {
      setSelectedTile(null);
      return;
    }

    const nextTiles = [...tiles];
    const nextRotations = [...rotations];
    [nextTiles[selectedTile], nextTiles[position]] = [nextTiles[position], nextTiles[selectedTile]];
    [nextRotations[selectedTile], nextRotations[position]] = [nextRotations[position], nextRotations[selectedTile]];

    setTiles(nextTiles);
    setRotations(nextRotations);
    setSelectedTile(null);
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    updateLocksAfterMove(nextTiles, nextRotations, [selectedTile, position]);

    if (isSolved(nextTiles, nextRotations)) {
      completeRound(nextTiles, nextRotations, nextMoves);
    }
  };

  const rotateSelectedTile = (direction: 1 | -1 = 1) => {
    if (phase !== 'playing' || selectedTile === null || lockedPositions.has(selectedTile) || !rotateTiles) {
      return;
    }

    const nextRotations = [...rotations];
    nextRotations[selectedTile] = ((nextRotations[selectedTile] + (direction === 1 ? 90 : 270)) % 360) as RotationDegrees;

    playUiSound('tile-rotate');
    setRotations(nextRotations);
    const newlyLockedCount = updateLocksAfterMove(tiles, nextRotations, [selectedTile]);
    if (newlyLockedCount > 0) {
      setSelectedTile(null);
    }

    if (isSolved(tiles, nextRotations)) {
      completeRound(tiles, nextRotations);
    }
  };
  rotateSelectedTileRef.current = rotateSelectedTile;

  useEffect(() => {
    if (phase !== 'playing' || !rotateTiles || selectedTile === null || lockedPositions.has(selectedTile)) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!CLOCKWISE_ROTATION_KEYS.has(key) && !COUNTER_CLOCKWISE_ROTATION_KEYS.has(key)) {
        return;
      }

      event.preventDefault();
      rotateSelectedTileRef.current(CLOCKWISE_ROTATION_KEYS.has(key) ? 1 : -1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockedPositions, phase, rotateTiles, selectedTile]);

  const renderSkinSearch = () => (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Skin</p>
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={skinSearch}
              onChange={(event) => setSkinSearch(event.target.value)}
              placeholder="Search skins or leave blank for random"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-900 py-2 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/60"
            />
            {filteredSkins.length > 0 ? (
              <div
                className="absolute left-0 right-0 top-12 z-40 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950"
                style={{ height: skinSearchListHeight }}
                onScroll={(event) => setSkinSearchScrollTop(event.currentTarget.scrollTop)}
              >
                <div className="relative" style={{ height: filteredSkins.length * SKIN_SEARCH_ROW_HEIGHT }}>
                  {visibleFilteredSkins.map((skin, index) => (
                    <button
                      key={skin.id}
                      type="button"
                      onPointerEnter={() => playSkinSuggestionHoverSound(skin.id)}
                      onPointerLeave={() => {
                        if (hoveredSkinSuggestionIdRef.current === skin.id) {
                          hoveredSkinSuggestionIdRef.current = null;
                        }
                      }}
                      onFocus={() => playSkinSuggestionHoverSound(skin.id)}
                      onBlur={() => {
                        if (hoveredSkinSuggestionIdRef.current === skin.id) {
                          hoveredSkinSuggestionIdRef.current = null;
                        }
                      }}
                      onClick={() => {
                        playUiSound('autocomplete-select');
                        setSelectedSkin(skin);
                        setSkinSearch('');
                      }}
                      className="absolute left-0 grid min-h-12 w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 border-b border-white/5 p-2 text-left transition last:border-b-0 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300"
                      style={{
                        top: (skinSearchStartIndex + index) * SKIN_SEARCH_ROW_HEIGHT,
                        height: SKIN_SEARCH_ROW_HEIGHT,
                      }}
                    >
                      <span className="relative h-10 overflow-hidden rounded-xl bg-slate-900">
                        <GameSplashImage src={skin.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">{skin.answer}</span>
                        <span className="block truncate text-xs text-slate-500">{skin.champion}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : skinSearchIsUpdating && skinSearch.trim() ? (
              <div className="absolute left-0 right-0 top-12 z-40 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-400">
                Searching...
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              playUiSound('random-select');
              setSelectedSkin(null);
              setSkinSearch('');
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
          >
            <Shuffle size={15} />
            Random
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          {selectedSkin ? `${selectedSkin.answer} selected.` : skinListError || 'A random splash will be selected when the round starts.'}
        </p>
      </div>
    </div>
  );

  const renderDailyAction = () => (
    <button
      type="button"
      onClick={() => {
        if (!clientStateReady || dailyCompletionStatus === null) {
          return;
        }
        if (dailyCompletedToday) {
          reopenDailyCompletion();
          return;
        }
        playUiSound('random-select');
        if (dailyResumeRound) {
          void resumeSavedRound('daily');
          return;
        }
        void startRound({ mode: 'daily' });
      }}
      disabled={!clientStateReady || dailyCompletionStatus === null}
      className="group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-emerald-200/40 bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-4 text-sm font-black text-slate-950   transition-[transform,border-color,filter] duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-50/75  hover:ring-2 hover:ring-inset hover:ring-cyan-50/45 hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-800 disabled:bg-none disabled:text-slate-400 disabled:opacity-100  disabled:hover:translate-y-0 disabled:hover:border-white/10 disabled:hover:ring-0 disabled:hover:brightness-100"
    >
      {dailyCompletionStatus === null ? <RefreshCw size={16} className="animate-spin" /> : dailyCompletedToday ? <Check size={16} /> : dailyResumeRound ? <RefreshCw size={16} /> : <Play size={16} />}
      {dailyCompletionStatus === null ? 'Checking Daily' : dailyCompletedToday ? 'Daily Completed' : dailyResumeRound ? 'Resume Daily' : 'Play Daily'}
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/90 px-2 py-0.5 text-xs text-cyan-100">
        <Flame size={12} />
        {dailyStreak}
      </span>
    </button>
  );

  const renderSetupCard = () => (
    <aside className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Round Setup</p>
            <h3 className="mt-2 text-xl font-black text-white">{puzzleLabel} Puzzle</h3>
          </div>
          <Shuffle size={22} className="text-amber-300" />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          {selectedSkin ? (
            <div className="relative aspect-[16/4] max-h-28">
              <GameSplashImage src={selectedSkin.imageUrl} alt={`${selectedSkin.answer} selected splash art`} fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
            </div>
          ) : (
            <div className="grid aspect-[16/4] max-h-28 place-items-center bg-slate-950/70">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-amber-100">
                <Shuffle size={18} />
                <span className="text-sm font-black">Random skin</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{selectedSkin ? selectedSkin.answer : 'Random skin'}</p>
              <p className="text-xs text-slate-500">
                {selectedSkin
                  ? targetSkinSolveCount === null ? 'Loading global solves...' : `All-time global solves: ${targetSkinSolveCount}`
                  : 'A random splash will be selected'}
              </p>
            </div>
            {selectedSkin ? (
              <button
                type="button"
                onClick={() => setSelectedSkin(null)}
                aria-label="Clear selected skin"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-300 transition hover:text-white"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          <StatPill label="Pieces" value={`${puzzleLabel} = ${configuredTileCount}`} />
          <StatPill label="Time" value={timerLabel} />
          <StatPill label="Reference" value={showReference ? 'On' : 'Off'} />
          <StatPill label="Locking" value={lockCorrectTiles ? 'On' : 'Off'} />
          <StatPill label="Rotation" value={rotateTiles ? 'On' : 'Off'} />
          <StatPill label="Skin" value={selectedSkin ? 'Selected' : 'Random'} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Stats</p>
            <h3 className="mt-2 text-lg font-black text-white">{profileStatsLoaded ? 'Profile Solves' : 'Local Solves'}</h3>
          </div>
          <Trophy size={20} className="text-amber-300" />
        </div>
        <div className="mt-4 grid gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {pieceStats.map((entry) => (
              <StatPill key={entry.label} label={entry.label} value={entry.count} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatPill label="Reference On" value={stats.solvesWithReference} />
            <StatPill label="Reference Off" value={stats.solvesWithoutReference} />
            <StatPill label="Locking Solves" value={stats.solvesWithLocking} />
          </div>
        </div>
      </div>
    </aside>
  );

  const renderPrematch = () => (
    <section className="grid gap-5 rounded-3xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl sm:gap-6 sm:p-6 lg:grid-cols-[1fr_0.82fr]">
      <div className="grid gap-5">
        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid content-start gap-5">
          {renderSkinSearch()}

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pieces</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {gridOptions.map((option) => (
                <SettingButton
                  key={option.size}
                  selected={gridSize === option.size}
                  icon={<Grid3X3 size={17} />}
                  title={option.label}
                  sideLabel={option.description}
                  solveCount={getPieceSolveCount(option.size)}
                  onClick={() => setGridSize(option.size)}
                />
              ))}
            </div>
            {rotateTiles ? (
              <p className="mt-2 text-xs leading-5 text-amber-100/80">Rotation mode uses a fixed 16 x 9 grid so rotated pieces stay square.</p>
            ) : null}
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Timer</p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {timeOptions.map((option) => (
                <SettingButton
                  key={option.label}
                  selected={timeLimit === option.seconds}
                  icon={<Clock3 size={17} />}
                  title={option.label}
                  onClick={() => {
                    setTimeLimit(option.seconds);
                    setRemainingSeconds(option.seconds ?? 0);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reference</p>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                <SettingButton
                  selected={showReference}
                  icon={<Eye size={17} />}
                  title="Visible"
                  description="A reference image is shown."
                  onClick={() => setShowReference(true)}
                />
                <SettingButton
                  selected={!showReference}
                  icon={<EyeOff size={17} />}
                  title="Hidden"
                  description="No reference image is shown."
                  onClick={() => setShowReference(false)}
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tile Locking</p>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                <SettingButton
                  selected={lockCorrectTiles}
                  icon={<Lock size={17} />}
                  title="Lock Correct"
                  description="Correct tiles lock and flash green."
                  onClick={() => setLockCorrectTiles(true)}
                />
                <SettingButton
                  selected={!lockCorrectTiles}
                  icon={<LockOpen size={17} />}
                  title="Unlocked"
                  description="Every tile remains swappable."
                  onClick={() => setLockCorrectTiles(false)}
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Rotation</p>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                <SettingButton
                  selected={rotateTiles}
                  icon={<RotateCw size={17} />}
                  title="Rotated - 16x9"
                  description="Pieces start rotated and must be turned."
                  onClick={() => setRotateTiles(true)}
                />
                <SettingButton
                  selected={!rotateTiles}
                  icon={<RotateCcw size={17} />}
                  title="No Rotation"
                  description="Pieces keep their normal orientation."
                  onClick={() => setRotateTiles(false)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={`grid gap-3 ${resumeRound ? 'sm:grid-cols-2' : ''}`}>
          <button
            type="button"
            onClick={() => {
              playUiSound('random-select');
              void startRound();
            }}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <Play size={16} />
            Play
          </button>
          {resumeRound ? (
            <button
              type="button"
              onClick={() => resumeSavedRound('regular')}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/50 bg-amber-300/10 px-5 text-sm font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <RefreshCw size={16} />
              Resume
            </button>
          ) : null}
        </div>
      </div>

      {renderSetupCard()}
    </section>
  );

  const renderLoading = () => (
    <section className="grid min-h-[28rem] place-items-center rounded-3xl border border-white/10 bg-slate-900/80 p-6  backdrop-blur-xl">
      <div className="text-center">
        <RefreshCw size={34} className="mx-auto animate-spin text-amber-300" />
        <h2 className="mt-5 text-2xl font-black text-white">Preparing puzzle</h2>
        <p className="mt-2 text-sm text-slate-400">Selecting and shuffling the splash art before the round starts.</p>
      </div>
    </section>
  );

  const renderBoard = () => (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3  backdrop-blur-xl sm:p-5">
        <div className="mb-3 grid gap-2 sm:mb-4 sm:gap-3 lg:grid-cols-[1fr_auto]">
          <div className={`order-2 grid ${lockCorrectTiles ? 'grid-cols-3' : 'grid-cols-2'} gap-2 sm:gap-3 lg:order-1`}>
            <StatPill label={timeLimit === null ? 'Elapsed' : 'Time'} value={activeTimeValue} valueClassName={timerValueClassName} />
            <StatPill label="Moves" value={moves} />
            {lockCorrectTiles ? <StatPill label="Correct" value={`${correctPositions}/${tileCount}`} /> : null}
          </div>
          <div className="order-1 flex w-full items-center justify-end gap-2 lg:order-2 lg:w-auto">
            {lockCorrectTiles ? (
              <button
                type="button"
                onClick={revealMisplacedTiles}
                disabled={misplacedPositionCount === 0}
                title="Show misplaced pieces"
                aria-label="Show misplaced pieces"
                className="inline-flex min-h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-300/40 bg-sky-300/10 text-sky-100 transition hover:bg-sky-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Eye size={17} />
              </button>
            ) : null}
            {roundMode !== 'daily' ? (
              <button
                type="button"
                onClick={startNewSkinRound}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200 lg:w-auto lg:flex-none"
              >
                <Shuffle size={15} />
                New Skin
              </button>
            ) : null}
          </div>
        </div>

        {rotateTiles ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
            <p className="text-sm font-semibold text-slate-300">
              {selectedTile === null ? 'Select a tile to rotate it.' : `Rotate with WASD or Arrow Keys`}
            </p>
            <button
              type="button"
              onClick={() => rotateSelectedTile(1)}
              disabled={selectedTile === null || (selectedTile !== null && lockedPositions.has(selectedTile))}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw size={15} />
              Rotate Selected
            </button>
          </div>
        ) : null}

        <div className="mb-3 flex justify-end sm:hidden">
          <button
            type="button"
            onClick={() => setMobileViewRotated((value) => !value)}
            disabled={rotateTiles}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-bold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw size={15} />
            {mobileViewRotated ? 'Normal View' : 'Rotate View'}
          </button>
        </div>

        <div
          className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 ${
            rotateTiles
              ? activeColumns === 16 && activeRows === 9 ? 'aspect-video' : 'aspect-square'
              : mobileViewRotated ? 'aspect-[9/16] sm:aspect-video' : 'aspect-video'
          }`}
        >
          <PuzzleBoard
            tiles={tiles}
            rotations={rotations}
            activeColumns={activeColumns}
            activeRows={activeRows}
            boardColumns={boardColumns}
            boardUsesRotatedMobileView={boardUsesRotatedMobileView}
            imageUrl={targetSkin?.imageUrl ?? null}
            selectedTile={selectedTile}
            lockedPositions={lockedPositions}
            flashingPositions={flashingPositions}
            misplacedHintPositions={misplacedHintPositions}
            onTileClick={handleTileClick}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {showReference && targetSkin ? (
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
            <div className={`relative overflow-hidden bg-slate-950 ${boardUsesRotatedMobileView ? 'aspect-[9/16] sm:aspect-video' : 'aspect-video'}`}>
              {boardUsesRotatedMobileView ? (
                <div className="absolute left-1/2 top-1/2 aspect-video w-[177.777%] -translate-x-1/2 -translate-y-1/2 rotate-90 sm:static sm:h-full sm:w-full sm:translate-x-0 sm:translate-y-0 sm:rotate-0">
                  <GameSplashImage
                    src={targetSkin.imageUrl}
                    alt={`${targetSkin.answer} splash art reference`}
                    fill
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="object-contain"
                  />
                </div>
              ) : (
                <GameSplashImage
                  src={targetSkin.imageUrl}
                  alt={`${targetSkin.answer} splash art reference`}
                  fill
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="object-contain"
                />
              )}
            </div>
            <div className="border-t border-white/10 p-3 sm:p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">Reference</p>
              <p className="mt-1 truncate text-sm font-bold text-white">{targetSkin.answer}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );

  const renderEndState = () => {
    if (!targetSkin) {
      return null;
    }

    const won = phase === 'won';
    const timeSummary = timeLimit === null
      ? `Current time: ${formatTimer(elapsedSeconds)}.`
      : won
        ? `Solved in ${formatTimer(elapsedSeconds)} with ${formatTimer(remainingSeconds)} left.`
        : `You placed ${correctPositions} of ${tileCount} pieces correctly before time expired.`;

    return (
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80  backdrop-blur-xl">
        <div className="relative min-h-[38rem] lg:aspect-video lg:min-h-[18rem]">
          <GameSplashImage
            src={targetSkin.imageUrl}
            alt={`${targetSkin.answer} full splash art`}
            fill
            sizes="(min-width: 1024px) 960px, 100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${
                  won ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100' : 'border-red-300/40 bg-red-300/15 text-red-100'
                }`}>
                  {won ? <Trophy size={14} /> : <Clock3 size={14} />}
                  {won ? 'Puzzle Complete' : 'Time Expired'}
                </p>
                <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">{targetSkin.answer}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {timeSummary} You made {moves} moves.
                </p>
                {won ? (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-slate-950/65 px-3 py-1.5 text-xs font-bold text-amber-100">
                    <Trophy size={14} className="text-amber-300" />
                    All-time global solves: {targetSkinSolveCount ?? '-'}
                  </p>
                ) : null}
                <div className={`mt-6 grid gap-3 ${roundMode === 'daily' ? '' : 'sm:grid-cols-2'}`}>
                  {roundMode !== 'daily' ? (
                    <button
                      type="button"
                      onClick={() => {
                        playUiSound('random-select');
                        void startRound();
                      }}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      <RotateCcw size={16} />
                      Another Round
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={clearCompletedRound}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 px-5 text-sm font-bold text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  >
                    Change Settings
                  </button>
                </div>
              </div>
              <EndStateSettingsCard
                daily={roundMode === 'daily'}
                gridSize={gridSize}
                timeLimit={timeLimit}
                showReference={showReference}
                lockCorrectTiles={lockCorrectTiles}
                rotateTiles={rotateTiles}
              />
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderBackControl = () => {
    if (phase === 'prematch') {
      return (
        <Link
          href="/"
          aria-label="Back to games"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:h-12 sm:w-12"
        >
          <ArrowLeft size={18} />
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={returnToPrematch}
        aria-label="Back to lobby"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:h-12 sm:w-12"
      >
        <ArrowLeft size={18} />
      </button>
    );
  };

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#030712] px-4 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 sm:gap-6">
        <header className="relative z-30 flex min-w-0 flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl sm:gap-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {renderBackControl()}
            <div className="min-w-0">
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500 sm:text-xs sm:tracking-[0.24em]">Single Player Game</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-white sm:text-xl">
                Splash Scramble
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-xs font-bold text-amber-100">
                  <Flame size={12} className="text-amber-300" />
                  {regularStreak}/{dailyStreak}
                </span>
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Daily resets in {timeToNextDaily}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/10 pt-3 sm:w-auto sm:gap-3 sm:border-t-0 sm:pt-0 lg:justify-end">
            <GameInfoMenu
              title="Splash Scramble"
              steps={[
                'Choose a grid size, timer, reference visibility, locking behavior, rotation, and optional skin.',
                'Press Play to load the splash art and start from a shuffled board, or Resume a saved round.',
                'Click two unlocked tiles to swap their positions.',
                'If rotation is enabled, select a tile and use Rotate Selected until it is upright.',
              ]}
            />
            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <Trophy size={16} />
              Daily Leaderboard
            </button>
            {roundMode === 'daily' && phase !== 'prematch' ? (
              <div className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-200">
                <Trophy size={16} className="text-amber-300" />
                All-time global solves: {targetSkinSolveCount ?? '-'}
              </div>
            ) : null}
            {phase === 'prematch' ? renderDailyAction() : null}
          </div>
        </header>

        {phase === 'prematch' ? renderPrematch() : null}
        {phase === 'loading' ? renderLoading() : null}
        {started ? renderBoard() : null}
        {roundEnded ? renderEndState() : null}
      </div>
      <SplashScrambleDailyLeaderboard
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        snapshot={dailyLeaderboardSnapshot}
        loading={dailyLeaderboardLoading}
        error={dailyLeaderboardError}
        currentUserId={dailyLeaderboardUserId}
        friendIds={dailyLeaderboardFriendIds}
      />
    </main>
  );
}
