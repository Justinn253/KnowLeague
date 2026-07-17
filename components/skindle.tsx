'use client';

import { FormEvent, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ChevronDown, Flame, Search, Sparkles, X } from 'lucide-react';
import { GameSplashImage } from '@/components/game-asset-image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  clearDailyGameState,
  getDailyDateKey,
  getOrCreateClientId,
  loadDailyGameState,
  loadPlayerGameStats,
  recordPlayerGameCompletion,
  saveDailyGameState,
  type PlayerGameStats,
} from '@/lib/game-storage';
import { getNextUtcResetLabel, normalizeAnswer, type QuizItem } from '@/lib/quiz';
import { GameInfoMenu } from '@/components/game-info-menu';
import { submitAchievementEvent } from '@/lib/achievement-client';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { playUiSound, type SoundName } from '@/lib/ui-sounds';

const categories = [
  { id: 'champion', label: 'Champion' },
  { id: 'skinLine', label: 'Skin Line', note: 'The skin line the correct skin belongs to' },
  { id: 'rarity', label: 'Rarity', note: 'The rarity level of the skin in League' },
  { id: 'race', label: 'Species', note: 'The species of the champion - May not be 100% accurate' },
  { id: 'gender', label: 'Gender' },
  { id: 'role', label: 'Role' },
  { id: 'lane', label: 'Lane', note: 'Lane data may not be 100% accurate' },
  { id: 'releaseYear', label: 'Released', note: 'The year this skin was released. arrows indicate newer/older' },
  { id: 'resourceType', label: 'Resource' },
] as const;

type CategoryId = (typeof categories)[number]['id'];
type CategoryDefinition = (typeof categories)[number];
type ActiveCategoryNote = {
  text: string;
  x: number;
  y: number;
};

const revealColumnGroups = [
  ['champion'],
  ['skinLine', 'rarity'],
  ['race', 'gender'],
  ['role', 'lane'],
  ['releaseYear', 'resourceType'],
] as const satisfies readonly (readonly CategoryId[])[];
const revealCellOrder = revealColumnGroups.flat();
const revealCellIndexById = Object.fromEntries(
  revealCellOrder.map((categoryId, index) => [categoryId, index + 1]),
) as Record<CategoryId, number>;
const SKINDLE_REVEAL_DURATION_MS = 336;
const SKINDLE_REVEAL_TOTAL_MS = SKINDLE_REVEAL_DURATION_MS * (categories.length + 1);
const SKINDLE_SUGGESTION_ROW_HEIGHT = 64;
const SKINDLE_SUGGESTION_MAX_HEIGHT = 360;
const SKINDLE_SUGGESTION_OVERSCAN = 4;
const CATEGORY_NOTE_TOOLTIP_HALF_WIDTH = 128;

const categoryById = Object.fromEntries(categories.map((category) => [category.id, category])) as Record<CategoryId, CategoryDefinition>;

type GuessResult = {
  item: QuizItem;
  values: Record<CategoryId, string>;
  matches: Record<CategoryId, boolean>;
  partialMatches: Partial<Record<CategoryId, boolean>>;
  releaseYearDirection: 'higher' | 'lower' | null;
};

type SkindleDailyState = {
  guessIds: string[];
  solvedGuessId: string | null;
  firstGlobalGuessSkinIds?: string[];
};

type SkindleTopGuess = {
  skinId: string;
  answer: string;
  count: number;
};

type SkindleDailyStats = {
  dateKey: string;
  totalGuesses: number;
  correctGuesses: number;
  averageGuessesToSolve: number;
  topGuesses: SkindleTopGuess[];
  guessesBySkin: Record<string, number>;
};

type RecordSkindleGuessResponse = {
  snapshot: SkindleDailyStats;
  accepted: boolean;
  firstForSkin: boolean;
  clientAlreadySolved: boolean;
};

let skindleSkinsRequest: Promise<QuizItem[]> | null = null;
const skindleTargetRequests = new Map<string, Promise<QuizItem>>();
const skindleStatsRequests = new Map<string, Promise<SkindleDailyStats>>();

function loadSkindleSkins() {
  if (skindleSkinsRequest) {
    return skindleSkinsRequest;
  }

  skindleSkinsRequest = fetch('/api/skindle/skins')
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load Skindle skins.');
      return response.json() as Promise<QuizItem[]>;
    })
    .catch((error) => {
      skindleSkinsRequest = null;
      throw error;
    });
  return skindleSkinsRequest;
}

function loadSkindleTarget(dateKey: string) {
  const existingRequest = skindleTargetRequests.get(dateKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch('/api/skindle/target')
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load the daily Skindle target.');
      return response.json() as Promise<QuizItem>;
    });
  skindleTargetRequests.set(dateKey, request);
  void request.catch(() => {
    if (skindleTargetRequests.get(dateKey) === request) {
      skindleTargetRequests.delete(dateKey);
    }
  });
  return request;
}

function loadSkindleDailyStats(includeTopGuesses: boolean) {
  const requestKey = `${getDailyDateKey()}:${includeTopGuesses}`;
  const existingRequest = skindleStatsRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`/api/skindle/stats?includeTop=${includeTopGuesses ? 'true' : 'false'}`, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load Skindle stats.');
      return response.json() as Promise<SkindleDailyStats>;
    });
  skindleStatsRequests.set(requestKey, request);
  void request.then(
    () => {
      if (skindleStatsRequests.get(requestKey) === request) {
        skindleStatsRequests.delete(requestKey);
      }
    },
    () => {
      if (skindleStatsRequests.get(requestKey) === request) {
        skindleStatsRequests.delete(requestKey);
      }
    },
  );
  return request;
}

function getReleaseYear(item: QuizItem) {
  return item.releaseDate?.slice(0, 4) || 'Unknown';
}

function toDisplayTitleCase(value: string) {
  return value.replace(/[A-Za-z]+/g, (word) => {
    if (word.length <= 2 && word === word.toUpperCase()) {
      return word;
    }

    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function formatCategoryValue(value: string) {
  if (value === 'Standard') {
    return 'Common';
  }

  return toDisplayTitleCase(value);
}

function getCategoryValues(item: QuizItem): Record<CategoryId, string> {
  return {
    champion: formatCategoryValue(item.champion || 'Unknown'),
    skinLine: formatCategoryValue(item.skinLine || 'None'),
    releaseYear: getReleaseYear(item),
    rarity: formatCategoryValue(item.rarity || 'Unknown'),
    gender: formatCategoryValue(item.gender || 'Unknown'),
    role: formatCategoryValue(item.role || 'Unknown'),
    race: formatCategoryValue(item.race || 'Unknown'),
    lane: formatCategoryValue(item.lane || 'Unknown'),
    resourceType: formatCategoryValue(item.resourceType || 'Unknown'),
  };
}

function getSpeciesParts(value: string) {
  return value
    .split(',')
    .map((part) => normalizeAnswer(part))
    .filter(Boolean);
}

function compareGuess(item: QuizItem, target: QuizItem): GuessResult {
  const values = getCategoryValues(item);
  const targetValues = getCategoryValues(target);
  const matches = categories.reduce<Record<CategoryId, boolean>>((acc, category) => {
    acc[category.id] = values[category.id] === targetValues[category.id];
    return acc;
  }, {} as Record<CategoryId, boolean>);
  const guessedSpecies = getSpeciesParts(values.race);
  const targetSpecies = getSpeciesParts(targetValues.race);
  const partialMatches: Partial<Record<CategoryId, boolean>> = {
    race:
      !matches.race &&
      guessedSpecies.length > 0 &&
      targetSpecies.length > 0 &&
      guessedSpecies.some((species) => targetSpecies.includes(species)),
  };
  const guessedYear = Number(values.releaseYear);
  const targetYear = Number(targetValues.releaseYear);
  const releaseYearDirection =
    Number.isFinite(guessedYear) && Number.isFinite(targetYear) && guessedYear !== targetYear
      ? guessedYear < targetYear
        ? 'higher'
        : 'lower'
      : null;

  return { item, values, matches, partialMatches, releaseYearDirection };
}

function QuestionPingMark() {
  return (
    <span className="relative inline-flex h-14 w-14 items-center justify-center" aria-hidden="true">
      <span className="absolute -top-1 text-6xl font-black leading-none text-amber-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.7)] [-webkit-text-stroke:1px_#7c5a13]">
        ?
      </span>
      <span className="absolute bottom-0 h-4 w-4 rotate-45 border border-amber-900/80 bg-gradient-to-br from-amber-300 to-yellow-700 shadow-lg shadow-black/50" />
    </span>
  );
}

function getCategoryNotePosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const halfWidth = CATEGORY_NOTE_TOOLTIP_HALF_WIDTH;
  const padding = 12;
  const minX = halfWidth + padding;
  const maxX = Math.max(minX, window.innerWidth - halfWidth - padding);

  return {
    x: Math.min(maxX, Math.max(minX, rect.left + rect.width / 2)),
    y: rect.bottom + 8,
  };
}

function CategoryHeaderLabel({
  categoryId,
  onShowNote,
  onHideNote,
}: {
  categoryId: CategoryId;
  onShowNote: (note: ActiveCategoryNote) => void;
  onHideNote: () => void;
}) {
  const category = categoryById[categoryId];
  const note = 'note' in category ? category.note : undefined;
  const showNote = (element: HTMLElement) => {
    if (!note) {
      return;
    }

    onShowNote({
      text: note,
      ...getCategoryNotePosition(element),
    });
  };

  if (!note) {
    return <span>{category.label}</span>;
  }

  return (
    <span
      tabIndex={0}
      aria-label={`${category.label}: ${note}`}
      onMouseEnter={(event) => showNote(event.currentTarget)}
      onFocus={(event) => showNote(event.currentTarget)}
      onMouseLeave={onHideNote}
      onBlur={onHideNote}
      className="cursor-help underline decoration-slate-600 decoration-dotted underline-offset-4 outline-none focus-visible:text-slate-300"
    >
      {category.label}
    </span>
  );
}

const SkindleGuessRow = memo(function SkindleGuessRow({
  guess,
  isLatestGuess,
  isCorrectGuess,
  revealed,
  globalGuessCount,
  firstGlobalGuess,
  onPreview,
}: {
  guess: GuessResult;
  isLatestGuess: boolean;
  isCorrectGuess: boolean;
  revealed: boolean;
  globalGuessCount: number;
  firstGlobalGuess: boolean;
  onPreview: (skin: QuizItem) => void;
}) {
  const getRevealOverlay = (cellIndex: number) => isLatestGuess ? (
    <div
      className="skindle-cell-reveal pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-800"
      style={{
        animationDelay: `${cellIndex * SKINDLE_REVEAL_DURATION_MS}ms`,
        animationDuration: `${SKINDLE_REVEAL_DURATION_MS}ms`,
      }}
    >
      <QuestionPingMark />
    </div>
  ) : null;
  const renderCategoryCell = (categoryId: CategoryId, compact = false) => (
    <div
      key={categoryId}
      className={`relative flex items-center justify-center overflow-hidden rounded-lg border text-center shadow-inner ${
        compact ? 'min-h-0 px-2 py-2' : 'min-h-28 px-2 py-3'
      } ${
        guess.matches[categoryId]
          ? 'border-slate-300/70 bg-[#00c800] text-white shadow-lime-950/30'
          : guess.partialMatches[categoryId]
          ? 'border-slate-300/70 bg-orange-500/90 text-white shadow-orange-950/30'
          : 'border-slate-300/70 bg-red-500/85 text-white shadow-red-950/30'
      }`}
    >
      <span className={`inline-flex min-w-0 items-center justify-center gap-1.5 font-semibold leading-5 ${compact ? 'text-sm' : 'text-base'}`}>
        <span className="line-clamp-2 min-w-0">{guess.values[categoryId]}</span>
        {categoryId === 'releaseYear' && guess.releaseYearDirection === 'higher' ? (
          <ArrowUp size={compact ? 15 : 18} strokeWidth={2.5} aria-label="Target year is higher" className="shrink-0" />
        ) : null}
        {categoryId === 'releaseYear' && guess.releaseYearDirection === 'lower' ? (
          <ArrowDown size={compact ? 15 : 18} strokeWidth={2.5} aria-label="Target year is lower" className="shrink-0" />
        ) : null}
      </span>
      {getRevealOverlay(revealCellIndexById[categoryId])}
    </div>
  );

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${isLatestGuess ? 'animate-slide-in' : ''} ${
        isCorrectGuess && revealed ? 'skindle-gradient-border shadow-lg shadow-violet-950/30' : ''
      }`}
    >
      <div
        className={`grid grid-cols-[minmax(8.5rem,1.25fr)_minmax(6.5rem,0.9fr)_repeat(4,minmax(7rem,1fr))] gap-2 ${
          isCorrectGuess && revealed ? 'skindle-gradient-border-content' : ''
        }`}
      >
        <div
          className={`relative flex min-h-28 flex-col items-center justify-between overflow-hidden rounded-lg border px-2 py-3 text-center shadow-inner ${
            isCorrectGuess
              ? 'border-slate-300/70 bg-[#00c800] text-white shadow-lime-950/30'
              : 'border-slate-300/70 bg-red-500/85 text-white shadow-red-950/30'
          }`}
        >
          <span className="line-clamp-2 text-base font-semibold leading-5">{guess.item.answer}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-white/80">
            {globalGuessCount > 1 ? `${globalGuessCount} global guesses` : null}
            {globalGuessCount === 1 || firstGlobalGuess ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-slate-950">
                <Sparkles size={11} />
                First
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => onPreview(guess.item)}
            className="mt-2 w-full cursor-zoom-in ring-1 ring-white/30 transition hover:ring-white/70"
            aria-label={`Open ${guess.item.answer} splash art`}
          >
            <GameSplashImage
              src={guess.item.imageUrl}
              alt=""
              width={243}
              height={143}
              sizes="(min-width: 640px) 243px, 100vw"
              className="aspect-[1215/717] w-full shrink-0 object-contain"
            />
          </button>
          {getRevealOverlay(0)}
        </div>
        {renderCategoryCell('champion')}
        {revealColumnGroups.slice(1).map((group) => (
          <div key={group.join('-')} className="grid min-h-28 grid-rows-2 gap-2">
            {group.map((categoryId) => renderCategoryCell(categoryId, true))}
          </div>
        ))}
      </div>
    </div>
  );
});

function SkindleResetCountdown({ activeDateKey, onDateChange }: { activeDateKey: string; onDateChange: (dateKey: string) => void }) {
  const [label, setLabel] = useState(() => getNextUtcResetLabel());

  useEffect(() => {
    const updateReset = () => {
      const nextDateKey = getDailyDateKey();
      if (nextDateKey !== activeDateKey) {
        onDateChange(nextDateKey);
        return;
      }
      setLabel(getNextUtcResetLabel());
    };

    updateReset();
    const interval = window.setInterval(updateReset, 1000);
    return () => window.clearInterval(interval);
  }, [activeDateKey, onDateChange]);

  return <>{label}</>;
}

export function Skindle() {
  const router = useRouter();
  const [activeDateKey, setActiveDateKey] = useState(() => getDailyDateKey());
  const [skins, setSkins] = useState<QuizItem[]>([]);
  const [target, setTarget] = useState<QuizItem | null>(null);
  const [inputValue, setInputValue] = useState('');
  const deferredInputValue = useDeferredValue(inputValue);
  const [suggestions, setSuggestions] = useState<QuizItem[]>([]);
  const [suggestionsScrollTop, setSuggestionsScrollTop] = useState(0);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [revealedSolvedGuessId, setRevealedSolvedGuessId] = useState<string | null>(null);
  const [previewSkin, setPreviewSkin] = useState<QuizItem | null>(null);
  const [dailyStats, setDailyStats] = useState<SkindleDailyStats | null>(null);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [playerStatsMenuOpen, setPlayerStatsMenuOpen] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => loadPlayerGameStats('skindle'));
  const [clientId, setClientId] = useState<string | null>(null);
  const [firstGlobalGuessSkinIds, setFirstGlobalGuessSkinIds] = useState<Set<string>>(() => new Set());
  const [storageReady, setStorageReady] = useState(false);
  const [activeCategoryNote, setActiveCategoryNote] = useState<ActiveCategoryNote | null>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const guessesPanelRef = useRef<HTMLDivElement>(null);
  const topGuessesMenuRef = useRef<HTMLDivElement>(null);
  const playerStatsMenuRef = useRef<HTMLDivElement>(null);
  const soundTimeoutsRef = useRef<number[]>([]);
  const hoveredSuggestionIdRef = useRef<string | null>(null);
  const hasRestoredStateRef = useRef(false);
  const achievementRecordedRef = useRef(false);
  const correctGuessStatsPendingRef = useRef(false);
  const activeDateKeyRef = useRef(activeDateKey);

  const solved = Boolean(target && guesses.some((guess) => guess.item.id === target.id));
  const liveRoundStateRef = useRef({ solved, guessCount: guesses.length, inputValue });
  liveRoundStateRef.current = { solved, guessCount: guesses.length, inputValue };
  const guessedSkinIds = useMemo(() => new Set(guesses.map((guess) => guess.item.id)), [guesses]);
  const averageGuessesLabel = dailyStats?.averageGuessesToSolve
    ? dailyStats.averageGuessesToSolve.toFixed(1)
    : '0.0';
  const skinsById = useMemo(
    () => new Map(skins.map((skin) => [skin.id, skin])),
    [skins],
  );
  const skinSearchIndex = useMemo(() => skins.map((skin) => ({
    skin,
    normalizedAnswer: normalizeAnswer(skin.answer),
  })), [skins]);
  const skinsByNormalizedAnswer = useMemo(() => {
    const index = new Map<string, QuizItem>();
    skinSearchIndex.forEach(({ skin, normalizedAnswer }) => {
      if (!index.has(normalizedAnswer)) {
        index.set(normalizedAnswer, skin);
      }
    });
    return index;
  }, [skinSearchIndex]);
  const mostGuessedSkin = useMemo(
    () =>
      Object.values(playerStats.guessStats).sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))[0] ??
      null,
    [playerStats.guessStats],
  );
  const mostGuessedSkinLine = useMemo(
    () => Object.values(playerStats.skinLineStats).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))[0] ?? null,
    [playerStats.skinLineStats],
  );
  const mostGuessedYear = useMemo(
    () => Object.values(playerStats.releaseYearStats).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))[0] ?? null,
    [playerStats.releaseYearStats],
  );
  const mostGuessedRarity = useMemo(
    () => Object.values(playerStats.rarityStats).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))[0] ?? null,
    [playerStats.rarityStats],
  );
  const displayedGuesses = useMemo(() => [...guesses].reverse(), [guesses]);
  const suggestionsListHeight = Math.min(SKINDLE_SUGGESTION_MAX_HEIGHT, suggestions.length * SKINDLE_SUGGESTION_ROW_HEIGHT);
  const suggestionsStartIndex = Math.max(0, Math.floor(suggestionsScrollTop / SKINDLE_SUGGESTION_ROW_HEIGHT) - SKINDLE_SUGGESTION_OVERSCAN);
  const suggestionsVisibleCount = Math.ceil(SKINDLE_SUGGESTION_MAX_HEIGHT / SKINDLE_SUGGESTION_ROW_HEIGHT) + SKINDLE_SUGGESTION_OVERSCAN * 2;
  const visibleSuggestions = suggestions.slice(suggestionsStartIndex, suggestionsStartIndex + suggestionsVisibleCount);
  const suggestionsAreUpdating = inputValue !== deferredInputValue;
  const averagePlayerGuesses = playerStats.gamesCompleted > 0
    ? (playerStats.totalGuesses / playerStats.gamesCompleted).toFixed(1)
    : '0.0';

  const refreshDailyStats = useCallback(async (includeTopGuesses = false) => {
    try {
      setDailyStats(await loadSkindleDailyStats(includeTopGuesses));
    } catch (error) {
      console.error('Failed to load Skindle stats', error);
    }
  }, []);

  const getMatchingSuggestions = useCallback((value: string) => {
    const query = normalizeAnswer(value);
    if (value.trim().length < 2 || !query || solved) {
      return [];
    }
    return skinSearchIndex
      .filter(({ skin, normalizedAnswer }) => !guessedSkinIds.has(skin.id) && normalizedAnswer.includes(query))
      .map(({ skin }) => skin);
  }, [guessedSkinIds, skinSearchIndex, solved]);

  useEffect(() => {
    activeDateKeyRef.current = activeDateKey;
  }, [activeDateKey]);

  const clearStaleDailyRound = useCallback(() => {
    clearDailyGameState('skindle', activeDateKeyRef.current);
    setGuesses([]);
    setInputValue('');
    setSuggestions([]);
    setRevealedSolvedGuessId(null);
    setFirstGlobalGuessSkinIds(new Set());
  }, []);

  useEffect(() => {
    setClientId(getOrCreateClientId());
    loadSkindleSkins()
      .then((skinData) => {
        if (Array.isArray(skinData)) {
          setSkins(skinData);
        }
      })
      .catch((error) => {
        console.error('Failed to load Skindle skins', error);
      });
  }, []);

  useEffect(() => {
    setStorageReady(false);
    loadSkindleTarget(activeDateKey)
      .then((targetData) => {
        if (targetData?.id) {
          setTarget(targetData);
        }
      })
      .catch((error) => {
        console.error('Failed to load Skindle data', error);
      });

    void refreshDailyStats(false);
  }, [activeDateKey, refreshDailyStats]);

  useEffect(() => {
    if (hasRestoredStateRef.current || skins.length === 0 || !target) {
      return;
    }

    hasRestoredStateRef.current = true;
    const savedState = loadDailyGameState<SkindleDailyState>('skindle', activeDateKey);
    if (!savedState) {
      setStorageReady(true);
      return;
    }

    const restoredGuesses = savedState.guessIds
      .map((guessId) => skinsById.get(guessId))
      .filter((skin): skin is QuizItem => Boolean(skin))
      .map((skin) => compareGuess(skin, target));

    setGuesses(restoredGuesses);
    setRevealedSolvedGuessId(savedState.solvedGuessId);
    setFirstGlobalGuessSkinIds(new Set(savedState.firstGlobalGuessSkinIds ?? []));
    setStorageReady(true);
  }, [activeDateKey, skins.length, skinsById, target]);

  useEffect(() => {
    if (!storageReady || (guesses.length === 0 && !revealedSolvedGuessId)) {
      return;
    }

    saveDailyGameState<SkindleDailyState>('skindle', {
      guessIds: guesses.map((guess) => guess.item.id),
      solvedGuessId: revealedSolvedGuessId,
      firstGlobalGuessSkinIds: Array.from(firstGlobalGuessSkinIds),
    }, activeDateKey);
  }, [activeDateKey, firstGlobalGuessSkinIds, guesses, revealedSolvedGuessId, storageReady]);

  useEffect(() => {
    if (storageReady && solved) {
      if (!correctGuessStatsPendingRef.current) {
        void refreshDailyStats(true);
      }
      if (target && !achievementRecordedRef.current) {
        achievementRecordedRef.current = true;
        void submitAchievementEvent('daily_skindle_completed', { skinId: target.id });
      }
    }
  }, [refreshDailyStats, solved, storageReady, target]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;

      if (!inputAreaRef.current?.contains(targetNode)) {
        setSuggestions([]);
      }

      if (!topGuessesMenuRef.current?.contains(targetNode)) {
        setStatsMenuOpen(false);
      }

      if (!playerStatsMenuRef.current?.contains(targetNode)) {
        setPlayerStatsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const scheduleSound = useCallback((sound: SoundName, delay: number) => {
    const timeout = window.setTimeout(() => {
      playUiSound(sound);
      soundTimeoutsRef.current = soundTimeoutsRef.current.filter((entry) => entry !== timeout);
    }, delay);

    soundTimeoutsRef.current.push(timeout);
  }, []);

  useEffect(() => {
    return () => {
      soundTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      soundTimeoutsRef.current = [];
    };
  }, []);

  const playSuggestionHoverSound = (skinId: string) => {
    if (hoveredSuggestionIdRef.current === skinId) {
      return;
    }

    hoveredSuggestionIdRef.current = skinId;
    playUiSound('autocomplete-hover');
  };

  const handleDateChange = useCallback((nextDateKey: string) => {
    const currentRound = liveRoundStateRef.current;
    const hadUnfinishedRound = !currentRound.solved && (currentRound.guessCount > 0 || currentRound.inputValue.trim().length > 0);
    clearStaleDailyRound();
    setTarget(null);
    setDailyStats(null);
    hasRestoredStateRef.current = false;
    achievementRecordedRef.current = false;
    activeDateKeyRef.current = nextDateKey;
    setActiveDateKey(nextDateKey);
    if (hadUnfinishedRound) {
      router.push('/');
    }
  }, [clearStaleDailyRound, router]);

  useEffect(() => {
    setSuggestions(getMatchingSuggestions(deferredInputValue));
  }, [deferredInputValue, getMatchingSuggestions]);

  useEffect(() => {
    setSuggestionsScrollTop(0);
  }, [deferredInputValue]);

  useEffect(() => {
    if (guesses.length === 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      guessesPanelRef.current?.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  }, [guesses.length]);

  useEffect(() => {
    if (!target || guesses.length === 0) {
      return;
    }

    const latestGuess = guesses[guesses.length - 1];
    if (latestGuess.item.id !== target.id || revealedSolvedGuessId === latestGuess.item.id) {
      return;
    }

    setRevealedSolvedGuessId(null);
    const timeout = window.setTimeout(() => {
      setRevealedSolvedGuessId(latestGuess.item.id);
      playUiSound('skindle-answer-reveal');
      setPlayerStats(
        recordPlayerGameCompletion(
          'skindle',
          guesses.map((guess) => ({
            itemId: guess.item.id,
            answer: guess.item.answer,
            imageUrl: guess.item.imageUrl,
            skinLine: formatCategoryValue(guess.item.skinLine || 'None'),
            releaseYear: getReleaseYear(guess.item),
            rarity: formatCategoryValue(guess.item.rarity || 'Unknown'),
          })),
        ),
      );
      if (!achievementRecordedRef.current) {
        achievementRecordedRef.current = true;
        void submitAchievementEvent('daily_skindle_completed', { skinId: target.id });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, SKINDLE_REVEAL_TOTAL_MS);

    return () => window.clearTimeout(timeout);
  }, [guesses, revealedSolvedGuessId, target]);

  const openSkinPreview = useCallback((skin: QuizItem) => setPreviewSkin(skin), []);

  const submitGuess = (skin: QuizItem | undefined) => {
    if (!skin || !target || solved) {
      return;
    }

    if (activeDateKeyRef.current !== getDailyDateKey()) {
      clearStaleDailyRound();
      router.push('/');
      return;
    }

    if (guessedSkinIds.has(skin.id)) {
      return;
    }

    const result = compareGuess(skin, target);
    const isCorrectGuess = skin.id === target.id;
    correctGuessStatsPendingRef.current = Boolean(clientId && isCorrectGuess);
    setGuesses((current) => [...current, result]);
    setInputValue('');
    setSuggestions([]);
    scheduleSound(
      isCorrectGuess ? 'skindle-guess-correct' : 'skindle-guess-incorrect',
      Math.max(0, SKINDLE_REVEAL_TOTAL_MS - 220),
    );

    if (clientId) {
      let statsRecorded = false;
      fetch('/api/skindle/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          skinId: skin.id,
          answer: skin.answer,
          isCorrect: isCorrectGuess,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Unable to record Skindle guess.');
          return response.json();
        })
        .then((data: RecordSkindleGuessResponse) => {
          statsRecorded = true;
          if (data.snapshot) {
            setDailyStats(data.snapshot);
          }

          if (data.firstForSkin) {
            setFirstGlobalGuessSkinIds((current) => new Set(current).add(skin.id));
          }
        })
        .catch((error) => {
          console.error('Failed to record Skindle guess', error);
        })
        .finally(() => {
          if (!isCorrectGuess) return;
          correctGuessStatsPendingRef.current = false;
          if (!statsRecorded) {
            void refreshDailyStats(true);
          }
        });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAnswer(inputValue);
    const exact = skinsByNormalizedAnswer.get(normalized);

    if (!exact || guessedSkinIds.has(exact.id)) {
      return;
    }

    submitGuess(exact);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-12">
        <header className="relative z-30 flex flex-col gap-5 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to game hub"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Single Player Game</p>
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-white">
                Skindle
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-xs font-bold text-amber-100">
                  <Flame size={12} className="text-amber-300" />
                  {playerStats.currentStreak}
                </span>
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Daily skin resets in <SkindleResetCountdown activeDateKey={activeDateKey} onDateChange={handleDateChange} />
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <GameInfoMenu title="Skindle" steps={[
              'Guess the daily mystery League of Legends skin.',
              'Each guess compares champion, skin line, rarity, species, gender, role, lane, release year, and resource against the target.',
              'Green means a match, orange means a partial match, and release year arrows point toward the target.',
            ]} />
            <div ref={playerStatsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setPlayerStatsMenuOpen((open) => !open)}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
              >
                <BarChart3 size={16} className="text-amber-300" />
                Player Stats
                <ChevronDown
                  size={16}
                  className={playerStatsMenuOpen ? 'rotate-180 transition' : 'transition'}
                  aria-hidden="true"
                />
              </button>

              {playerStatsMenuOpen ? (
                <div className="absolute right-0 top-14 z-50 w-[min(30rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Completed</p>
                      <p className="mt-2 text-xl font-semibold text-white">{playerStats.gamesCompleted}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg Guesses</p>
                      <p className="mt-2 text-xl font-semibold text-white">{averagePlayerGuesses}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current</p>
                      <p className="mt-2 text-xl font-semibold text-white">{playerStats.currentStreak}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Highest</p>
                      <p className="mt-2 text-xl font-semibold text-white">{playerStats.highestStreak}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Skin Highlights</p>
                      {playerStats.lastCorrectGuess ? (
                        <div className="mt-3 flex items-center gap-3">
                          {playerStats.lastCorrectGuess.imageUrl ? (
                            <GameSplashImage
                              src={playerStats.lastCorrectGuess.imageUrl}
                              alt=""
                              width={96}
                              height={57}
                              className="aspect-[1215/717] w-20 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Last correct skin</p>
                            <p className="mt-1 truncate text-sm font-semibold text-white">{playerStats.lastCorrectGuess.answer}</p>
                            <p className="mt-1 text-xs text-slate-400">{playerStats.lastCorrectGuess.dateKey}</p>
                          </div>
                        </div>
                      ) : null}
                      {mostGuessedSkin ? (
                        <div className={`${playerStats.lastCorrectGuess ? 'mt-4 border-t border-white/10 pt-3' : 'mt-3'} flex items-center gap-3`}>
                          {mostGuessedSkin.imageUrl ? (
                            <GameSplashImage
                              src={mostGuessedSkin.imageUrl}
                              alt=""
                              width={96}
                              height={57}
                              className="aspect-[1215/717] w-20 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Most guessed skin</p>
                            <p className="mt-1 truncate text-sm font-semibold text-white">{mostGuessedSkin.answer}</p>
                            <p className="mt-1 text-xs text-slate-400">{mostGuessedSkin.count} guesses</p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No guesses yet.</p>
                      )}
                      {playerStats.firstGuess ? (
                        <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
                          {playerStats.firstGuess.imageUrl ? (
                            <GameSplashImage
                              src={playerStats.firstGuess.imageUrl}
                              alt=""
                              width={96}
                              height={57}
                              className="aspect-[1215/717] w-20 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">First guessed skin</p>
                            <p className="mt-1 truncate text-sm font-semibold text-white">{playerStats.firstGuess.answer}</p>
                            <p className="mt-1 text-xs text-slate-400">{playerStats.firstGuess.dateKey}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Guess Tendencies</p>
                      <div className="mt-3 grid gap-2 text-sm">
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2">
                          <span className="text-slate-400">Skin line</span>
                          <span className="min-w-0 truncate font-semibold text-white">{mostGuessedSkinLine ? `${mostGuessedSkinLine.value} (${mostGuessedSkinLine.count})` : 'No guesses'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2">
                          <span className="text-slate-400">Year</span>
                          <span className="font-semibold text-white">{mostGuessedYear ? `${mostGuessedYear.value} (${mostGuessedYear.count})` : 'No guesses'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2">
                          <span className="text-slate-400">Rarity</span>
                          <span className="font-semibold text-white">{mostGuessedRarity ? `${mostGuessedRarity.value} (${mostGuessedRarity.count})` : 'No guesses'}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
              {guesses.length} guesses
            </div>
          </div>
        </header>

        <section className="relative z-20 grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Global Guesses</p>
            <p className="mt-2 text-2xl font-semibold text-white">{dailyStats?.totalGuesses ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Correct Solves</p>
            <p className="mt-2 text-2xl font-semibold text-white">{dailyStats?.correctGuesses ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Average Solve</p>
            <p className="mt-2 text-2xl font-semibold text-white">{averageGuessesLabel}</p>
          </div>
          <div ref={topGuessesMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                if (solved) {
                  setStatsMenuOpen((open) => !open);
                }
              }}
              disabled={!solved}
              className="flex h-full min-h-[5.75rem] w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>
                <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Top Guesses</span>
                <span className="mt-2 block text-sm font-semibold text-white">
                  {solved ? 'Global top 10' : 'Unlock after solving'}
                </span>
              </span>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition ${statsMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {statsMenuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-72 rounded-2xl border border-white/10 bg-slate-950 p-2">
                {dailyStats?.topGuesses.length ? (
                  dailyStats.topGuesses.map((guess, index) => {
                    const skin = skinsById.get(guess.skinId);

                    return (
                      <div
                        key={guess.skinId}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-slate-200"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {skin ? (
                            <GameSplashImage
                              src={skin.imageUrl}
                              alt=""
                              width={72}
                              height={42}
                              className="aspect-[1215/717] w-16 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <span className="min-w-0 truncate">
                            {index + 1}. {guess.answer}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                          {guess.count}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="px-3 py-2 text-sm text-slate-500">No global guesses yet.</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-300">Daily Skindle</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {solved && target ? 'The skin was: ' + target.answer : 'Mystery Skin'}
                </h2>
              </div>
              {target && revealedSolvedGuessId === target.id ? (
                <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-right shadow-lg shadow-emerald-950/30">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Congratulations</p>
                  <p className="mt-1 text-sm font-semibold text-white">Solved in {guesses.length} guesses</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Guess the League of Legends skin!</p>
              )}
            </div>

            {target && revealedSolvedGuessId === target.id ? (
              <button
                type="button"
                onClick={() => setPreviewSkin(target)}
                className="mb-6 block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-slate-300/50 bg-slate-950 transition hover:border-slate-100/80"
                aria-label={`Open ${target.answer} splash art`}
              >
                <GameSplashImage
                  src={target.imageUrl}
                  alt={target.answer}
                  width={1215}
                  height={717}
                  className="aspect-[1215/717] w-full object-contain"
                  priority
                  sizes="(min-width: 1024px) 640px, 100vw"
                />
              </button>
            ) : null}

            <div className={`overflow-x-auto ${THEMED_SCROLLBAR_CLASS}`}>
              <div className="w-full min-w-[58rem]">
                <div className="grid grid-cols-[minmax(8.5rem,1.25fr)_minmax(6.5rem,0.9fr)_repeat(4,minmax(7rem,1fr))] gap-2 pb-3 pl-1 pr-5 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
                  <div>Guess</div>
                  {revealColumnGroups.map((group) => (
                    <div key={group.join('-')} className={group.length > 1 ? 'grid grid-rows-2 gap-1' : ''}>
                      {group.map((categoryId) => (
                        <div key={categoryId}>
                          <CategoryHeaderLabel
                            categoryId={categoryId}
                            onShowNote={setActiveCategoryNote}
                            onHideNote={() => setActiveCategoryNote(null)}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div ref={guessesPanelRef} className={`max-h-[34rem] overflow-y-scroll pr-2 [scrollbar-gutter:stable] ${THEMED_SCROLLBAR_CLASS}`}>
                  {guesses.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-center text-sm text-slate-500">
                      Your guesses will appear here.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {displayedGuesses.map((guess) => (
                        <SkindleGuessRow
                          key={guess.item.id}
                          guess={guess}
                          isLatestGuess={guess.item.id === guesses[guesses.length - 1]?.item.id}
                          isCorrectGuess={target?.id === guess.item.id}
                          revealed={revealedSolvedGuessId === guess.item.id}
                          globalGuessCount={dailyStats?.guessesBySkin[guess.item.id] ?? 0}
                          firstGlobalGuess={firstGlobalGuessSkinIds.has(guess.item.id)}
                          onPreview={openSkinPreview}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!solved ? <form
            onSubmit={handleSubmit}
            className={`mt-6 rounded-3xl border bg-slate-950/80 p-5 shadow-inner shadow-slate-950/40 transition ${
              guesses.length === 0 ? 'border-amber-300 bg-amber-300/5 ring-2 ring-amber-300/25 shadow-amber-950/30' : 'border-white/10'
            }`}
          >
            <div ref={inputAreaRef} className="relative flex flex-col gap-3 sm:flex-row">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onFocus={() => {
                  const nextSuggestions = getMatchingSuggestions(inputValue);
                  if (nextSuggestions.length > 0) {
                    setSuggestions(nextSuggestions);
                    setSuggestionsScrollTop(0);
                  }
                }}
                disabled={!target}
                autoComplete="off"
                spellCheck={false}
                placeholder="Type a skin name"
                className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/10 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {suggestions.length > 0 ? (
                <div
                  className={`absolute left-0 top-full z-50 mt-2 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 sm:w-[calc(100%-8rem)] ${THEMED_SCROLLBAR_CLASS}`}
                  style={{ height: suggestionsListHeight }}
                  onScroll={(event) => setSuggestionsScrollTop(event.currentTarget.scrollTop)}
                >
                  <div className="relative" style={{ height: suggestions.length * SKINDLE_SUGGESTION_ROW_HEIGHT }}>
                    {visibleSuggestions.map((skin, index) => (
                      <button
                        key={skin.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onPointerEnter={() => playSuggestionHoverSound(skin.id)}
                        onPointerLeave={() => {
                          if (hoveredSuggestionIdRef.current === skin.id) {
                            hoveredSuggestionIdRef.current = null;
                          }
                        }}
                        onFocus={() => playSuggestionHoverSound(skin.id)}
                        onBlur={() => {
                          if (hoveredSuggestionIdRef.current === skin.id) {
                            hoveredSuggestionIdRef.current = null;
                          }
                        }}
                        onClick={() => {
                          playUiSound('autocomplete-select');
                          submitGuess(skin);
                        }}
                        className="absolute left-0 grid w-full grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 rounded-xl px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                        style={{
                          top: (suggestionsStartIndex + index) * SKINDLE_SUGGESTION_ROW_HEIGHT,
                          height: SKINDLE_SUGGESTION_ROW_HEIGHT,
                        }}
                      >
                        <span className="relative h-12 overflow-hidden rounded-xl bg-slate-900">
                          <GameSplashImage src={skin.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">{skin.answer}</span>
                          <span className="block truncate text-xs text-slate-500">{skin.champion}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : suggestionsAreUpdating && inputValue.trim().length >= 2 ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-400 sm:w-[calc(100%-8rem)]">
                  Searching...
                </div>
              ) : null}
              <button
                type="submit"
                disabled={!target}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search size={16} />
                Guess
              </button>
            </div>
          </form> : null}
        </section>
      </section>
      {previewSkin ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewSkin.answer} splash art preview`}
          onMouseDown={() => setPreviewSkin(null)}
        >
          <div
            className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl shadow-black/60"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewSkin(null)}
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-white transition hover:bg-slate-900"
              aria-label="Close splash art preview"
            >
              <X size={18} />
            </button>
            <GameSplashImage
              src={previewSkin.imageUrl}
              alt={previewSkin.answer}
              width={1215}
              height={717}
              className="max-h-[82vh] w-full object-contain"
              priority
              sizes="(min-width: 1280px) 1152px, 92vw"
            />
            <div className="border-t border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">{previewSkin.answer}</p>
            </div>
          </div>
        </div>
      ) : null}
      {activeCategoryNote ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[70] w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-left text-xs font-semibold leading-5 normal-case tracking-normal text-slate-200 shadow-2xl shadow-black/40"
          style={{
            left: activeCategoryNote.x,
            top: activeCategoryNote.y,
          }}
        >
          {activeCategoryNote.text}
        </div>
      ) : null}
    </main>
  );
}
