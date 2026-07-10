'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
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
import Image from 'next/image';
import Link from 'next/link';
import { GameInfoMenu } from '@/components/game-info-menu';
import {
  loadPlayerGameStats,
  PLAYER_GAME_STATS_CHANGED_EVENT,
  recordPlayerGameCompletion,
  type PlayerGameStats,
} from '@/lib/game-storage';
import type { QuizItem } from '@/lib/quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { playUiSound } from '@/lib/ui-sounds';

type PuzzlePhase = 'prematch' | 'loading' | 'playing' | 'won' | 'lost';
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
  targetSkin: QuizItem;
  selectedSkin: QuizItem | null;
  tiles: number[];
  rotations: RotationDegrees[];
  lockedPositions: number[];
  moves: number;
  startedAt: number;
  endsAt: number | null;
  savedAt: number;
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

const ACTIVE_ROUND_STORAGE_KEY = 'knowleague:v1:splash-scramble:active-round';
const STATS_STORAGE_KEY = 'knowleague:v1:splash-scramble:stats';
const SKIN_SEARCH_ROW_HEIGHT = 56;
const SKIN_SEARCH_MAX_HEIGHT = 360;
const SKIN_SEARCH_OVERSCAN = 4;
const DEFAULT_SETTINGS: SplashScrambleSettings = {
  gridSize: 6,
  timeLimit: null,
  showReference: true,
  lockCorrectTiles: true,
  rotateTiles: false,
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

  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
  }

  if (tiles.every((tile, index) => tile === index) && tiles.length > 1) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
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
  const response = await fetch('/api/skindle/skins', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load skin list.');
  }

  return (await response.json() as QuizItem[]).filter((skin) => skin.imageUrl);
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

function getInitialLockedPositions(tiles: readonly number[], rotations: readonly RotationDegrees[], lockCorrectTiles: boolean) {
  if (!lockCorrectTiles) {
    return new Set<number>();
  }

  return new Set(tiles.flatMap((tile, position) => (tile === position && (rotations[position] ?? 0) === 0 ? [position] : [])));
}

function getSavedElapsedSeconds(round: SavedRoundState, now = Date.now()) {
  return Math.max(0, Math.floor((now - round.startedAt) / 1000));
}

function getSavedRemainingSeconds(round: SavedRoundState, now = Date.now()) {
  return round.endsAt === null ? 0 : Math.max(0, Math.ceil((round.endsAt - now) / 1000));
}

function isRoundResumeable(round: SavedRoundState, now = Date.now()) {
  return round.timeLimit === null || round.endsAt === null || round.endsAt > now;
}

function isSavedRoundPlayable(round: SavedRoundState, now = Date.now()) {
  return isRoundResumeable(round, now) && !isSolved(round.tiles, round.rotations);
}

function getStatsKey(columns: number, rows: number) {
  return `${columns}x${rows}`;
}

function readLocalSavedRound() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawRound = window.localStorage.getItem(ACTIVE_ROUND_STORAGE_KEY);
    if (!rawRound) {
      return null;
    }

    const round = JSON.parse(rawRound) as SavedRoundState;
    if (round.version !== 1 || !round.targetSkin?.imageUrl || !Array.isArray(round.tiles)) {
      return null;
    }

    if (!isSavedRoundPlayable(round)) {
      window.localStorage.removeItem(ACTIVE_ROUND_STORAGE_KEY);
      return null;
    }

    return round;
  } catch {
    return null;
  }
}

function saveLocalRound(round: SavedRoundState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACTIVE_ROUND_STORAGE_KEY, JSON.stringify(round));
}

function clearLocalRound() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ACTIVE_ROUND_STORAGE_KEY);
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

async function loadAccountPayload(): Promise<AccountPayload | null> {
  const token = await getAccountToken();
  if (!token) {
    return null;
  }

  const response = await fetch('/api/splash-scramble/state', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return null;
  }

  const result = await response.json() as { state?: SavedRoundState | null; stats?: SplashScrambleStats | null };
  const round = result.state ?? null;
  return {
    state: round && isRoundResumeable(round) ? round : null,
    stats: result.stats ? normalizeStats(result.stats) : null,
  };
}

function SettingButton({
  selected,
  disabled,
  icon,
  title,
  sideLabel,
  description,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  sideLabel?: string;
  description?: string;
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
      className={`group flex gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-amber-300/70 bg-amber-300/10 shadow-lg shadow-amber-500/10'
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

export function SplashScramble() {
  const [phase, setPhase] = useState<PuzzlePhase>('prematch');
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
  const [stats, setStats] = useState<SplashScrambleStats>(() => createEmptyStats());
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => loadPlayerGameStats('splash-scramble'));
  const [profileStatsLoaded, setProfileStatsLoaded] = useState(false);
  const [error, setError] = useState('');
  const flashTimeoutRef = useRef<number | null>(null);
  const misplacedHintTimeoutRef = useRef<number | null>(null);
  const lastAccountSyncMoveRef = useRef<number | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);
  const timerExpiredSoundPlayedRef = useRef(false);
  const hoveredSkinSuggestionIdRef = useRef<string | null>(null);
  const solveRecordedRef = useRef(false);
  const rotateSelectedTileRef = useRef<(direction?: 1 | -1) => void>(() => undefined);

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
  const correctPositions = useMemo(() => countCorrectPositions(tiles, rotations), [rotations, tiles]);
  const misplacedPositionCount = useMemo(() => getMisplacedPositions(tiles, rotations).length, [rotations, tiles]);
  const timerLabel = timeLimit === null ? 'No Timer' : formatTimer(timeLimit);
  const activeTimeValue = timeLimit === null ? formatTimer(elapsedSeconds) : formatTimer(remainingSeconds);
  const timerUrgent = phase === 'playing' && timeLimit !== null && remainingSeconds > 0 && remainingSeconds <= 10;
  const timerValueClassName = timeLimit === null ? 'text-white' : timerUrgent ? 'animate-pulse text-red-300' : 'text-amber-200';
  const boardColumns = useMemo(() => ({
    gridTemplateColumns: `repeat(${activeColumns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${activeRows}, minmax(0, 1fr))`,
  }), [activeColumns, activeRows]);
  const boardUsesRotatedMobileView = mobileViewRotated && !rotateTiles;
  const selectedRotation = selectedTile === null ? 0 : rotations[selectedTile] ?? 0;
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

  useEffect(() => {
    setSkinSearchScrollTop(0);
  }, [deferredSkinSearch]);

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

  const buildSavedRound = useCallback((savedAt = Date.now()): SavedRoundState | null => {
    if (!targetSkin || phase !== 'playing' || startedAt === null) {
      return null;
    }

    return {
      version: 1,
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
      savedAt,
    };
  }, [endsAt, gridSize, lockCorrectTiles, lockedPositions, moves, phase, rotateTiles, rotations, selectedSkin, showReference, startedAt, targetSkin, tiles, timeLimit]);

  const applyRound = async (round: SavedRoundState) => {
    await preloadImage(round.targetSkin.imageUrl);
    setGridSize(round.gridSize);
    setTimeLimit(round.timeLimit);
    setShowReference(round.showReference);
    setLockCorrectTiles(round.lockCorrectTiles);
    setRotateTiles(round.rotateTiles);
    setSelectedSkin(round.selectedSkin);
    setTargetSkin(round.targetSkin);
    setTiles(round.tiles);
    setRotations(round.rotations.length === round.tiles.length ? round.rotations : Array.from({ length: round.tiles.length }, () => 0));
    setLockedPositions(new Set(round.lockedPositions));
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
    setSelectedTile(null);
    setMoves(round.moves);
    setStartedAt(round.startedAt);
    setEndsAt(round.endsAt);
    setElapsedSeconds(getSavedElapsedSeconds(round));
    setRemainingSeconds(getSavedRemainingSeconds(round));
    resetTimerSoundRefs();
    setPhase('playing');
  };

  useEffect(() => {
    const localStats = readLocalStats();
    setStats(localStats);
    const localRound = readLocalSavedRound();
    if (localRound) {
      setResumeRound(localRound);
    }

    const loadProfileData = () => {
      loadAccountPayload()
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
            saveLocalRound(payload.state);
          } else if (payload.state) {
            setResumeRound(null);
            clearLocalRound();
            syncAccountRound(null).catch(() => undefined);
          } else if (localRound) {
            syncAccountRound(localRound).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };

    loadProfileData();
    const supabase = getOptionalSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        loadProfileData();
      }

      if (event === 'SIGNED_OUT') {
        setStats(readLocalStats());
        setProfileStatsLoaded(false);
        const savedRound = readLocalSavedRound();
        if (savedRound) {
          setResumeRound(savedRound);
        }
      }
    });

    return () => subscription?.data.subscription.unsubscribe();
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
        clearLocalRound();
        setResumeRound(null);
        syncAccountRound(null).catch(() => undefined);
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
  }, [endsAt, phase, startedAt, timeLimit]);

  useEffect(() => {
    const round = buildSavedRound();
    if (!round) {
      return;
    }

    saveLocalRound(round);
    setResumeRound(round);
  }, [buildSavedRound, elapsedSeconds]);

  useEffect(() => {
    if (phase !== 'playing' || moves === 0 || moves % 5 !== 0 || lastAccountSyncMoveRef.current === moves) {
      return;
    }

    const round = buildSavedRound();
    if (!round) {
      return;
    }

    lastAccountSyncMoveRef.current = moves;
    syncAccountRound(round).catch(() => undefined);
  }, [buildSavedRound, moves, phase]);

  const recordSolveStats = () => {
    if (solveRecordedRef.current) {
      return;
    }

    solveRecordedRef.current = true;
    setPlayerStats(recordPlayerGameCompletion('splash-scramble'));
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

  const completeRound = (solvedTiles = tiles, solvedRotations = rotations) => {
    if (phase !== 'playing' || !isSolved(solvedTiles, solvedRotations)) {
      return;
    }

    playUiSound('puzzle-complete');
    recordSolveStats();
    clearLocalRound();
    setResumeRound(null);
    syncAccountRound(null).catch(() => undefined);
    setPhase('won');
  };

  const startRound = async (options?: { forceRandomSkin?: boolean; excludedSkinId?: string }) => {
    setPhase('loading');
    setError('');
    setSelectedTile(null);
    setLockedPositions(new Set());
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
    setMoves(0);
    setElapsedSeconds(0);
    lastAccountSyncMoveRef.current = null;
    resetTimerSoundRefs();
    solveRecordedRef.current = false;

    try {
      const roundSelectedSkin = options?.forceRandomSkin ? null : selectedSkin;
      const skin = roundSelectedSkin ?? await loadRandomSkin(skinCatalog, options?.excludedSkinId);
      await preloadImage(skin.imageUrl);
      const nextTiles = shuffleTiles(configuredTileCount);
      const nextRotations = createInitialRotations(configuredTileCount, rotateTiles);
      const now = Date.now();
      const initialLockedPositions = getInitialLockedPositions(nextTiles, nextRotations, lockCorrectTiles);
      const startedRound: SavedRoundState = {
        version: 1,
        gridSize,
        timeLimit,
        showReference,
        lockCorrectTiles,
        rotateTiles,
        selectedSkin: roundSelectedSkin,
        targetSkin: skin,
        tiles: nextTiles,
        rotations: nextRotations,
        lockedPositions: Array.from(initialLockedPositions),
        moves: 0,
        startedAt: now,
        endsAt: timeLimit === null ? null : now + timeLimit * 1000,
        savedAt: now,
      };

      setSelectedSkin(roundSelectedSkin);
      setTargetSkin(skin);
      setTiles(nextTiles);
      setRotations(nextRotations);
      setLockedPositions(initialLockedPositions);
      setRemainingSeconds(timeLimit ?? 0);
      setStartedAt(now);
      setEndsAt(startedRound.endsAt);
      saveLocalRound(startedRound);
      setResumeRound(startedRound);
      syncAccountRound(startedRound).catch(() => undefined);
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
    void startRound({ forceRandomSkin: true, excludedSkinId: targetSkin?.id });
  };

  const resumeSavedRound = async () => {
    if (!resumeRound) {
      return;
    }

    setPhase('loading');
    setError('');

    try {
      await applyRound(resumeRound);
    } catch {
      clearLocalRound();
      setResumeRound(null);
      setPhase('prematch');
      setError('Unable to resume that saved round.');
    }
  };

  const returnToPrematch = () => {
    const round = buildSavedRound();
    if (round) {
      saveLocalRound(round);
      setResumeRound(round);
      syncAccountRound(round).catch(() => undefined);
    }

    if (roundEnded && targetSkin) {
      setSelectedSkin(targetSkin);
    }

    setPhase('prematch');
    setSelectedTile(null);
    setFlashingPositions(new Set());
    setMisplacedHintPositions(new Set());
  };

  const clearCompletedRound = () => {
    clearLocalRound();
    setResumeRound(null);
    syncAccountRound(null).catch(() => undefined);
    if (targetSkin) {
      setSelectedSkin(targetSkin);
    }
    setPhase('prematch');
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

    const misplacedPositions = getMisplacedPositions(tiles, rotations);
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

  const handleTileClick = (position: number) => {
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
    setMoves((current) => current + 1);
    updateLocksAfterMove(nextTiles, nextRotations, [selectedTile, position]);

    if (isSolved(nextTiles, nextRotations)) {
      completeRound(nextTiles, nextRotations);
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
      const clockwiseKeys = new Set(['arrowup', 'arrowleft', 'w', 'a']);
      const counterClockwiseKeys = new Set(['arrowdown', 'arrowright', 's', 'd']);
      if (!clockwiseKeys.has(key) && !counterClockwiseKeys.has(key)) {
        return;
      }

      event.preventDefault();
      rotateSelectedTileRef.current(clockwiseKeys.has(key) ? 1 : -1);
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
                      className="absolute left-0 grid w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 border-b border-white/5 p-2 text-left transition last:border-b-0 hover:bg-white/5"
                      style={{
                        top: (skinSearchStartIndex + index) * SKIN_SEARCH_ROW_HEIGHT,
                        height: SKIN_SEARCH_ROW_HEIGHT,
                      }}
                    >
                      <span className="relative h-10 overflow-hidden rounded-xl bg-slate-900">
                        <Image src={skin.imageUrl} alt="" fill sizes="48px" loading="lazy" className="object-cover" />
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
              <Image src={selectedSkin.imageUrl} alt={`${selectedSkin.answer} selected splash art`} fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
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
              <p className="text-xs text-slate-500">{selectedSkin ? 'Selected skin' : 'A random splash will be selected'}</p>
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
          <div className="grid grid-cols-4 gap-2">
            {pieceStats.map((entry) => (
              <StatPill key={entry.label} label={entry.label} value={entry.count} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <StatPill label="Reference On" value={stats.solvesWithReference} />
            <StatPill label="Reference Off" value={stats.solvesWithoutReference} />
            <StatPill label="Locking Solves" value={stats.solvesWithLocking} />
          </div>
        </div>
      </div>
    </aside>
  );

  const renderPrematch = () => (
    <section className="grid gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl sm:p-6 lg:grid-cols-[1fr_0.82fr]">
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Pre-Game Lobby</p>
          <h2 className="mt-2 text-3xl font-black text-white">Splash Scramble</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Choose the puzzle size, timer, reference, locking behavior, rotation, and a skin.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid gap-5">
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
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <Play size={16} />
            Play
          </button>
          {resumeRound ? (
            <button
              type="button"
              onClick={resumeSavedRound}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/50 bg-amber-300/10 px-5 text-sm font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200"
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
    <section className="grid min-h-[28rem] place-items-center rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
      <div className="text-center">
        <RefreshCw size={34} className="mx-auto animate-spin text-amber-300" />
        <h2 className="mt-5 text-2xl font-black text-white">Preparing puzzle</h2>
        <p className="mt-2 text-sm text-slate-400">Selecting and shuffling the splash art before the round starts.</p>
      </div>
    </section>
  );

  const renderBoard = () => (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3 shadow-glow backdrop-blur-xl sm:p-5">
        <div className="mb-3 grid gap-2 sm:mb-4 sm:gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatPill label={timeLimit === null ? 'Elapsed' : 'Time'} value={activeTimeValue} valueClassName={timerValueClassName} />
            <StatPill label="Moves" value={moves} />
            <StatPill label="Correct" value={`${correctPositions}/${tileCount}`} />
          </div>
          <div className="flex w-full items-center justify-end gap-2 lg:w-auto">
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
            <button
              type="button"
              onClick={startNewSkinRound}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200 lg:w-auto lg:flex-none"
            >
              <Shuffle size={15} />
              New Skin
            </button>
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
                  onClick={() => handleTileClick(position)}
                  disabled={locked}
                  className={`relative min-h-0 overflow-hidden border bg-slate-950 transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-default ${
                    flashing
                      ? 'z-20 border-emerald-300 ring-2 ring-inset ring-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.55)] brightness-125'
                      : selected
                        ? 'z-20 scale-[0.98] border-amber-300 ring-2 ring-inset ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
                        : misplacedHint
                          ? 'z-10 border-sky-300 ring-2 ring-inset ring-sky-300 shadow-[0_0_22px_rgba(125,211,252,0.6)] brightness-125'
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
                      backgroundImage: targetSkin ? `url(${targetSkin.imageUrl})` : undefined,
                      backgroundPosition: `${x}% ${y}%`,
                      backgroundSize: `${activeColumns * 100}% ${activeRows * 100}%`,
                      transform: `rotate(${rotation}deg)`,
                    }}
                  />
                  {selected || flashing || misplacedHint ? (
                    <span
                      className={`pointer-events-none absolute inset-0 z-10 ${
                        flashing
                          ? 'ring-4 ring-inset ring-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.95),0_0_20px_rgba(52,211,153,0.75)]'
                          : selected
                            ? 'ring-4 ring-inset ring-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.95),0_0_18px_rgba(251,191,36,0.55)]'
                            : 'ring-4 ring-inset ring-sky-300 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.95),0_0_20px_rgba(125,211,252,0.75)]'
                      }`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {showReference && targetSkin ? (
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
            <div className={`relative overflow-hidden bg-slate-950 ${boardUsesRotatedMobileView ? 'aspect-[9/16] sm:aspect-video' : 'aspect-video'}`}>
              {boardUsesRotatedMobileView ? (
                <div className="absolute left-1/2 top-1/2 aspect-video w-[177.777%] -translate-x-1/2 -translate-y-1/2 rotate-90 sm:static sm:h-full sm:w-full sm:translate-x-0 sm:translate-y-0 sm:rotate-0">
                  <Image
                    src={targetSkin.imageUrl}
                    alt={`${targetSkin.answer} splash art reference`}
                    fill
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="object-contain"
                  />
                </div>
              ) : (
                <Image
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
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">{targetSkin.answer}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {timeSummary} You made {moves} moves.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
                <button
                  type="button"
                  onClick={clearCompletedRound}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 px-5 text-sm font-bold text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
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

  const renderBackControl = () => {
    if (phase === 'prematch') {
      return (
        <Link
          href="/"
          aria-label="Back to games"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
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
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
      >
        <ArrowLeft size={18} />
      </button>
    );
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#030712] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-5 sm:gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-4">
            {renderBackControl()}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Single Player Game</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Splash Scramble
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-xs font-bold text-amber-100">
                  <Flame size={12} className="text-amber-300" />
                  {playerStats.currentStreak}
                </span>
              </h1>
            </div>
          </div>
          <GameInfoMenu
            title="Splash Scramble"
            steps={[
              'Choose a grid size, timer, reference visibility, locking behavior, rotation, and optional skin.',
              'Press Play to load the splash art and start from a shuffled board, or Resume a saved round.',
              'Click two unlocked tiles to swap their positions.',
              'If rotation is enabled, select a tile and use Rotate Selected until it is upright.',
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
