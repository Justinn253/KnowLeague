'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Flame, Play, SlidersHorizontal, ThumbsUp, Trophy } from 'lucide-react';
import { GameIconImage } from '@/components/game-asset-image';
import Link from 'next/link';
import {
  clearDailyGameState,
  clearSoloQuizGameState,
  createEmptyPlayerStats,
  getPlayerGameStreakForMode,
  hasCompletedSoloQuizMode,
  loadSoloQuizGameState,
  loadPlayerGameStats,
  recordCompletedSoloQuizMode,
  recordPlayerGameCompletion,
  recordQuizGameStats,
  saveSoloQuizGameState,
  type PlayerGameStats,
  type SoloQuizStreakScope,
} from '@/lib/game-storage';
import {
  answerMatches,
  formatSeconds,
  getAbilityKeyLabel,
  normalizeAnswer,
  PENALTY_TIMES_SECONDS,
  shuffle,
  type CompletedTime,
  type QuizItem,
} from '@/lib/quiz';
import type { MultiplayerGameRuntime } from '@/components/multiplayer-game-progress';
import { GameInfoMenu } from '@/components/game-info-menu';
import { DifficultyLabel, getDifficultyStyle } from '@/components/difficulty-style';
import { ABILITY_SLOTS as abilitySlots, filterItemsByAbilitySlots, type AbilitySlotId, type AbilitySlotState } from '@/lib/ability-slots';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { CHAOS_DIFFICULTY, CHAOS_ROUND_TIME_LIMIT_SECONDS, forceAllModifiers, isLeaderboardMode, type SoloQuizMode } from '@/lib/solo-quiz';
import { SoloQuizPrematch } from '@/components/solo-quiz-prematch';
import { QuizItemCarousel, type QuizCarouselRole } from '@/components/quiz-item-carousel';
import { QuizProgressCard } from '@/components/quiz-progress-card';
import { playUiSound } from '@/lib/ui-sounds';

const placeholderItems: QuizItem[] = [
  {
    id: 'sample-spell',
    type: 'spell',
    title: 'Ability Icon',
    question: 'Guess the ability',
    answer: 'Steel Tempest',
    imageUrl: '',
    champion: 'Yasuo',
  },
];

const difficulties = [
  {
    id: 'iron',
    name: 'Iron',
    description: 'No upcoming item blur, hints appear instantly, wrong guesses add no time, and auto-fill is active.',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Upcoming items are blurred, hints appear after 10 seconds, wrong guesses add 5 seconds, and auto-fill is active.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Upcoming items are blocked, hints appear after 30 seconds, wrong guesses scale upward, and auto-fill is active.',
  },
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Upcoming items are blocked, hints are disabled, wrong guesses end the game, and auto-fill is off.',
  },
] as const;

const modifiers = [
  {
    id: 'greyscale',
    name: 'Greyscale',
    description: 'Icons are greyscaled.',
  },
  {
    id: 'pixelated',
    name: 'Pixelated',
    description: 'Item icons are slightly pixelated.',
  },
  {
    id: 'rotating',
    name: 'Rotating',
    description: 'Icons continuously rotate.',
  },
  {
    id: 'disappearing',
    name: 'Disappearing',
    description: 'Icons disappear after 5 seconds.',
  },
  {
    id: 'hiddenTimer',
    name: 'Hidden Timer',
    description: 'Timer no longer displays.',
  },
  {
    id: 'confirmEntry',
    name: 'Confirm Entry',
    description: 'Guesses require a second submit or Enter press.',
  },
] as const;

type DifficultyId = (typeof difficulties)[number]['id'];
type ModifierId = (typeof modifiers)[number]['id'];
type OpenMenu = 'difficulty' | 'modifiers' | null;
type ModifierState = Record<ModifierId, boolean>;
type ModeStatus = 'not-started' | 'in-progress' | 'completed';
type UpcomingVisibility = 'clear' | 'blurred' | 'blocked';

type AbilityBlitzDailyState = {
  items: QuizItem[];
  soloMode?: SoloQuizMode;
  selectedDifficulty: DifficultyId;
  activeModifiers: ModifierState;
  selectedAbilitySlots: AbilitySlotState;
  entryCount: number;
  started: boolean;
  activeIndex: number;
  currentTime: number;
  totalTime: number;
  completedTimes: Record<string, CompletedTime>;
  finished: boolean;
  failed: boolean;
};

type DifficultyRule = {
  hintDelaySeconds: number | null;
  wrongGuess: 'none' | 'flat-five' | 'scaled' | 'game-over';
  upcomingVisibility: UpcomingVisibility;
  autocomplete: boolean;
};

const difficultyRules: Record<DifficultyId, DifficultyRule> = {
  iron: {
    hintDelaySeconds: 0,
    wrongGuess: 'none',
    upcomingVisibility: 'clear',
    autocomplete: true,
  },
  gold: {
    hintDelaySeconds: 10,
    wrongGuess: 'flat-five',
    upcomingVisibility: 'blurred',
    autocomplete: true,
  },
  diamond: {
    hintDelaySeconds: 30,
    wrongGuess: 'scaled',
    upcomingVisibility: 'blocked',
    autocomplete: true,
  },
  challenger: {
    hintDelaySeconds: null,
    wrongGuess: 'game-over',
    upcomingVisibility: 'blocked',
    autocomplete: false,
  },
};

const defaultModifiers = modifiers.reduce(
  (state, modifier) => ({ ...state, [modifier.id]: false }),
  {} as ModifierState,
);

function createModifierState(activeIds: readonly string[] = []) {
  return modifiers.reduce(
    (state, modifier) => ({ ...state, [modifier.id]: activeIds.includes(modifier.id) }),
    {} as ModifierState,
  );
}

const defaultAbilitySlots = abilitySlots.reduce(
  (state, slot) => ({ ...state, [slot.id]: true }),
  {} as AbilitySlotState,
);

const entryCountOptions = [10, 25, 50, 75, 100] as const;
let abilityAnswersRequest: Promise<string[]> | null = null;
const abilityItemsRequests = new Map<string, Promise<QuizItem[]>>();

function loadAbilityAnswers() {
  if (!abilityAnswersRequest) {
    abilityAnswersRequest = fetch('/api/ability-blitz/quiz-answers')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load ability answers.');
        return response.json() as Promise<string[]>;
      })
      .catch((error) => {
        abilityAnswersRequest = null;
        throw error;
      });
  }
  return abilityAnswersRequest;
}

function loadAbilityItems(url: string) {
  const existingRequest = abilityItemsRequests.get(url);
  if (existingRequest) return existingRequest;

  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error('Unable to load abilities.');
    return response.json() as Promise<QuizItem[]>;
  });
  abilityItemsRequests.set(url, request);
  const clearRequest = () => {
    if (abilityItemsRequests.get(url) === request) abilityItemsRequests.delete(url);
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function ToggleSwitch({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        checked
          ? 'border-amber-300/50 bg-amber-300'
          : 'border-white/10 bg-slate-950'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </span>
  );
}

function PixelatedIcon({
  src,
  alt,
  pixelated,
  className,
}: {
  src: string;
  alt: string;
  pixelated: boolean;
  className: string;
}) {
  const [renderedSrc, setRenderedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;

    if (!pixelated) {
      setRenderedSrc(src);
      return () => {
        cancelled = true;
      };
    }

    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.src = src;

    image.onload = () => {
      if (cancelled) {
        return;
      }

      try {
        const outputSize = 96;
        const sourceSize = 24;

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceSize;
        sourceCanvas.height = sourceSize;

        const sourceContext = sourceCanvas.getContext('2d');
        if (!sourceContext) {
          setRenderedSrc(src);
          return;
        }

        sourceContext.drawImage(image, 0, 0, sourceSize, sourceSize);

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = outputSize;
        outputCanvas.height = outputSize;

        const outputContext = outputCanvas.getContext('2d');
        if (!outputContext) {
          setRenderedSrc(src);
          return;
        }

        outputContext.imageSmoothingEnabled = false;
        outputContext.drawImage(sourceCanvas, 0, 0, outputSize, outputSize);
        setRenderedSrc(outputCanvas.toDataURL('image/png'));
      } catch {
        setRenderedSrc(src);
      }
    };

    image.onerror = () => {
      if (!cancelled) {
        setRenderedSrc(src);
      }
    };

    return () => {
      cancelled = true;
    };
  }, [src, pixelated]);

  return (
    <GameIconImage
      src={pixelated ? renderedSrc : src}
      alt={alt}
      width={96}
      height={96}
      className={className}
    />
  );
}

export function AbilityBlitz({ multiplayer }: { multiplayer?: MultiplayerGameRuntime }) {
  const [items, setItems] = useState<QuizItem[]>(() => {
    const multiplayerItems = multiplayer?.items.map((item, index) => ({
      ...item,
      guessed: index < multiplayer.initialProgress,
    }));
    return multiplayerItems?.length ? multiplayerItems : placeholderItems;
  });
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>((multiplayer?.difficulty as DifficultyId) ?? 'gold');
  const [activeModifiers, setActiveModifiers] = useState<ModifierState>(multiplayer ? createModifierState(multiplayer.modifiers) : defaultModifiers);
  const [soloMode, setSoloMode] = useState<SoloQuizMode>('daily');
  const [selectedAbilitySlots, setSelectedAbilitySlots] = useState<AbilitySlotState>(defaultAbilitySlots);
  const [entryCount, setEntryCount] = useState(25);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const multiplayerStartCountdown = multiplayer?.startCountdownSeconds && multiplayer.startCountdownSeconds > 0 ? multiplayer.startCountdownSeconds : null;
  const [started, setStarted] = useState(Boolean(multiplayer && !multiplayerStartCountdown && !multiplayer.gameEnded && multiplayer.initialProgress < multiplayer.items.length));
  const [isSliding, setIsSliding] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(multiplayerStartCountdown);
  const [activeIndex, setActiveIndex] = useState(multiplayer ? Math.min(multiplayer.initialProgress, Math.max(0, multiplayer.items.length - 1)) : 0);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(multiplayer?.initialElapsedSeconds ?? 0);
  const [showOptions, setShowOptions] = useState(false);
  const [timeUntilOptions, setTimeUntilOptions] = useState(10);
  const [options, setOptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [categoryAnswers, setCategoryAnswers] = useState<Record<string, string[]>>({});
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [penaltyMessage, setPenaltyMessage] = useState('');
  const [completedTimes, setCompletedTimes] = useState<Record<string, CompletedTime>>({});
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(multiplayer));
  const [finished, setFinished] = useState(Boolean(multiplayer && (multiplayer.gameEnded || multiplayer.initialProgress >= multiplayer.items.length)));
  const [failed, setFailed] = useState(false);
  const [wrongGuessCount, setWrongGuessCount] = useState(0);
  const [failureReason, setFailureReason] = useState<'wrong' | 'timeout' | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [suppressHints, setSuppressHints] = useState(false);
  const [pendingConfirmedGuess, setPendingConfirmedGuess] = useState('');
  const [storageReady, setStorageReady] = useState(Boolean(multiplayer));
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => createEmptyPlayerStats('ability-blitz'));
  const [leaderboardNotice, setLeaderboardNotice] = useState('');
  const [completedDailyMode, setCompletedDailyMode] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [modeStatuses, setModeStatuses] = useState<Record<SoloQuizMode, ModeStatus>>({
    casual: 'not-started',
    daily: 'not-started',
    chaos: 'not-started',
  });
  const [dailyDifficultyStatuses, setDailyDifficultyStatuses] = useState<Record<DifficultyId, ModeStatus>>({
    iron: 'not-started',
    gold: 'not-started',
    diamond: 'not-started',
    challenger: 'not-started',
  });
  const progressSectionRef = useRef<HTMLDivElement | null>(null);
  const currentProgressItemRef = useRef<HTMLDivElement | null>(null);
  const difficultyMenuRef = useRef<HTMLDivElement | null>(null);
  const modifiersMenuRef = useRef<HTMLDivElement | null>(null);
  const answerInputAreaRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredStateRef = useRef(false);
  const statsRecordedRef = useRef<string | null>(null);
  const multiplayerResultSoundRef = useRef<string | null>(null);
  const persistenceSnapshotRef = useRef<{
    mode: SoloQuizMode;
    difficulty: DifficultyId;
    state: AbilityBlitzDailyState;
    enabled: boolean;
  } | null>(null);
  const persistCurrentGameState = useCallback(() => {
    const snapshot = persistenceSnapshotRef.current;
    if (snapshot?.enabled) {
      saveSoloQuizGameState('ability-blitz', snapshot.mode, snapshot.difficulty, snapshot.state);
    }
  }, []);

  const currentItem = items[activeIndex];
  const nextItem = items[activeIndex + 1];
  const afterNextItem = items[activeIndex + 2] ?? null;
  const previousItem = items[activeIndex - 1];
  const configurationLocked = started || countdown !== null || finished || failed;
  const multiplayerRaceEndedEarly = Boolean(multiplayer?.gameEnded && multiplayer.initialProgress < multiplayer.items.length);
  const multiplayerGameEnded = multiplayer?.gameEnded ?? false;
  const showSinglePlayerEndState = !multiplayer && finished;
  const showEndState = showSinglePlayerEndState || Boolean(multiplayer && finished);
  const showSoloPrematch = !multiplayer && !started && !finished && !failed;
  const leaderboardMode = isLeaderboardMode(soloMode);
  const casualSettingsAvailable = soloMode === 'casual';
  const chaosMode = soloMode === 'chaos';
  const multiplayerInitialProgress = multiplayer?.initialProgress;
  const activeModifierCount = Object.values(activeModifiers).filter(Boolean).length;
  const selectedAbilitySlotCount = Object.values(selectedAbilitySlots).filter(Boolean).length;
  const difficultyRule = difficultyRules[selectedDifficulty];
  const hintsDisabled = difficultyRule.hintDelaySeconds === null;
  const autocompleteEnabled = difficultyRule.autocomplete;
  const shouldHideTimers = activeModifiers.hiddenTimer && !chaosMode;
  persistenceSnapshotRef.current = {
    mode: soloMode,
    difficulty: selectedDifficulty,
    enabled: !multiplayer && storageReady && (hasLoadedOnce || started || finished || failed),
    state: {
      items,
      soloMode,
      selectedDifficulty,
      activeModifiers,
      selectedAbilitySlots,
      entryCount,
      started,
      activeIndex,
      currentTime,
      totalTime,
      completedTimes,
      finished,
      failed,
    },
  };

  useEffect(() => {
    setPlayerStats(loadPlayerGameStats('ability-blitz'));
  }, []);

  useEffect(() => {
    if (!multiplayer?.gameEnded || multiplayerResultSoundRef.current === multiplayer.matchId) {
      return;
    }

    multiplayerResultSoundRef.current = multiplayer.matchId ?? 'ended';
    playUiSound(multiplayer.lost ? 'timer-expired' : 'puzzle-complete');
  }, [multiplayer]);
  const currentIconHidden = activeModifiers.disappearing && started && currentTime >= 5;
  const filteredItems = useMemo(
    () => filterItemsByAbilitySlots(items, selectedAbilitySlots),
    [items, selectedAbilitySlots],
  );
  const filteredAnswers = useMemo(
    () => Array.from(new Set(filteredItems.map((item) => item.answer))).sort(),
    [filteredItems],
  );
  const autocompleteSearchIndex = useMemo(() => {
    const candidateAnswers = categoryAnswers['all']?.length ? categoryAnswers['all'] : filteredAnswers;
    return candidateAnswers.map((answer) => ({ answer, normalized: normalizeAnswer(answer) }));
  }, [categoryAnswers, filteredAnswers]);

  useEffect(() => {
    if (multiplayer || !storageReady) {
      return;
    }

    setCompletedDailyMode(hasCompletedSoloQuizMode('ability-blitz', soloMode, selectedDifficulty));
  }, [multiplayer, selectedDifficulty, soloMode, storageReady]);

  useEffect(() => {
    if (soloMode === 'chaos' && !multiplayer && !configurationLocked) {
      setActiveModifiers(forceAllModifiers(defaultModifiers));
      setSelectedDifficulty(CHAOS_DIFFICULTY);
    }
  }, [configurationLocked, multiplayer, soloMode]);

  const getIconClassName = useCallback((visibility: QuizCarouselRole) => {
    const classes = ['h-32 w-32 rounded-3xl object-cover transition duration-300'];

    if (activeModifiers.greyscale) {
      classes.push('grayscale');
    }

    if (activeModifiers.pixelated) {
      classes.push('[image-rendering:pixelated]');
    }

    if (activeModifiers.rotating) {
      classes.push('animate-spin-slow');
    }

    if (visibility === 'next' && difficultyRule.upcomingVisibility === 'blurred') {
      classes.push('opacity-50 blur-sm');
    }

    if (visibility === 'current' && currentIconHidden) {
      classes.push('opacity-0');
    }

    return classes.join(' ');
  }, [activeModifiers.greyscale, activeModifiers.pixelated, activeModifiers.rotating, currentIconHidden, difficultyRule.upcomingVisibility]);

  const progressList = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        state: item.guessed || index < activeIndex
          ? 'completed'
          : index === activeIndex && !finished
            ? 'current'
            : 'pending',
      })),
    [items, activeIndex, finished],
  );
  const completedProgressCount = useMemo(
    () => progressList.filter((item) => item.state === 'completed').length,
    [progressList],
  );
  const carouselSlots = useMemo(() => ([
    {
      id: 'next',
      label: 'Next item',
      badge: <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">Ability</span>,
    },
    {
      id: 'current',
      label: 'Current item',
      badge: <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">Ability</span>,
    },
    {
      id: 'completed',
      label: 'Completed',
      subLabel: previousItem ? (
        <>
          {previousItem.answer}{' '}
          <span className="text-xs text-slate-400">{previousItem.champion} / {getAbilityKeyLabel(previousItem)}</span>
        </>
      ) : undefined,
      badge: <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-300">✓</span>,
    },
  ] as const), [previousItem]);
  const renderCarouselItem = useCallback((item: QuizItem | null, role: QuizCarouselRole) => {
    const isCurrent = role === 'current';
    const isCompleted = role === 'previous';

    return (
      <div
        className={`relative flex aspect-[1215/717] w-full items-center justify-center overflow-hidden border-2 bg-slate-950/50 text-white shadow-2xl shadow-black/20 transition ${
          isCurrent && successFlash
            ? 'border-emerald-400/70 ring-1 ring-emerald-400/40'
            : isCurrent
              ? 'border-violet-500/50'
              : isCompleted
                ? 'border-emerald-500/20'
                : 'border-slate-400/50'
        }`}
      >
        <div className="absolute inset-0 bg-grid-slate opacity-10" />
        {item ? (
          difficultyRule.upcomingVisibility === 'blocked' && role === 'next' ? (
            <div className="relative z-10 flex h-full w-full items-center justify-center bg-slate-950/70 p-4 text-center text-slate-500">
              <p className="text-xs font-semibold uppercase tracking-[0.24em]">Hidden</p>
            </div>
          ) : (
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 p-4">
              {item.imageUrl ? (
                <PixelatedIcon
                  src={item.imageUrl}
                  alt={item.question}
                  className={getIconClassName(role)}
                  pixelated={activeModifiers.pixelated}
                />
              ) : (
                <span className="text-4xl opacity-30">?</span>
              )}
            </div>
          )
        ) : (
          <div className="relative z-10 h-full w-full bg-slate-950/30" />
        )}
      </div>
    );
  }, [activeModifiers.pixelated, difficultyRule.upcomingVisibility, getIconClassName, successFlash]);

  useEffect(() => {
    if (multiplayerInitialProgress === undefined) return;
    setItems((current) => current.map((item, index) => (
      index < multiplayerInitialProgress ? { ...item, guessed: true } : item
    )));
    if (multiplayerGameEnded) {
      setStarted(false);
      setFinished(true);
    }
  }, [multiplayerGameEnded, multiplayerInitialProgress]);

  useEffect(() => {
    if (!started || countdown !== null || finished) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime((value) => value + 1);
      setTotalTime((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [started, countdown, finished]);

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    setOptions([]);
    setShowOptions(false);
    setPenaltyCount(0);
    setPenaltyMessage('');
    setStatus('idle');
    setInputValue('');
    setPendingConfirmedGuess('');
    setTimeUntilOptions(difficultyRule.hintDelaySeconds ?? 0);

    const answerPool = categoryAnswers['all']?.length
      ? categoryAnswers['all']
      : filteredAnswers.length
        ? filteredAnswers
        : items.map((item) => item.answer);

    const wrongAnswers = shuffle(answerPool.filter((answer) => answer !== currentItem.answer)).slice(0, 9);
    setOptions(shuffle([currentItem.answer, ...wrongAnswers]));
  }, [currentItem, items, filteredAnswers, difficultyRule.hintDelaySeconds, categoryAnswers]);

  useEffect(() => {
    if (!started || countdown !== null || suppressHints || !currentItem || showOptions || hintsDisabled) {
      return;
    }

    const hintDelaySeconds = difficultyRule.hintDelaySeconds;
    if (hintDelaySeconds === null) {
      return;
    }

    if (hintDelaySeconds === 0) {
      setShowOptions(true);
      return;
    }

    setTimeUntilOptions(hintDelaySeconds);
    setShowOptions(false);

    const interval = window.setInterval(() => {
      setTimeUntilOptions((value) => Math.max(0, value - 1));
    }, 1000);

    const timeout = window.setTimeout(() => {
      playUiSound('setting-select');
      setShowOptions(true);
    }, hintDelaySeconds * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeIndex, started, countdown, suppressHints, currentItem, showOptions, hintsDisabled, difficultyRule.hintDelaySeconds]);

  useEffect(() => {
    if (categoryAnswers['all']?.length) {
      return;
    }

    loadAbilityAnswers()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategoryAnswers((current) => ({
            ...current,
            all: data,
          }));
        }
      })
      .catch((error) => {
        console.error('Failed to load quiz answer suggestions', error);
      });
  }, [categoryAnswers]);

  useEffect(() => {
    if (hasRestoredStateRef.current) {
      return;
    }

    hasRestoredStateRef.current = true;
    if (multiplayer) {
      return;
    }
    setCountdown(null);
    setIsSliding(false);
    setStorageReady(true);
  }, [multiplayer, selectedDifficulty, soloMode]);

  useEffect(() => {
    if (multiplayer || !storageReady || !showSoloPrematch) {
      return;
    }

    const savedState = loadSoloQuizGameState<AbilityBlitzDailyState>('ability-blitz', soloMode, selectedDifficulty);
    setResumeAvailable(Boolean(savedState?.started && !savedState.finished && !savedState.failed));
  }, [multiplayer, selectedDifficulty, showSoloPrematch, soloMode, storageReady]);

  useEffect(() => {
    persistCurrentGameState();
  }, [
    activeIndex,
    activeModifiers,
    completedTimes,
    entryCount,
    failed,
    finished,
    hasLoadedOnce,
    items,
    selectedAbilitySlots,
    selectedDifficulty,
    started,
    storageReady,
    multiplayer,
    penaltyCount,
    soloMode,
    persistCurrentGameState,
  ]);

  useEffect(() => {
    if (totalTime > 0 && totalTime % 5 === 0) {
      persistCurrentGameState();
    }
  }, [persistCurrentGameState, totalTime]);

  useEffect(() => {
    window.addEventListener('pagehide', persistCurrentGameState);
    return () => {
      window.removeEventListener('pagehide', persistCurrentGameState);
      persistCurrentGameState();
    };
  }, [persistCurrentGameState]);

  useEffect(() => {
    const shouldRecord = multiplayer ? multiplayerGameEnded : finished || failed;
    if (!shouldRecord || items.length === 0) {
      return;
    }

    const statsKey = multiplayer?.matchId ?? `solo:${items.map((item) => item.id).join('|')}:${finished}:${failed}`;
    if (statsRecordedRef.current === statsKey) {
      return;
    }

    statsRecordedRef.current = statsKey;
    const completedItems = multiplayer ? Math.min(items.length, multiplayer.initialProgress) : finished ? items.length : completedProgressCount;
    recordQuizGameStats({
      gameId: 'ability-blitz',
      mode: multiplayer ? 'multiplayer' : 'solo',
      completedItems,
      totalItems: items.length,
      wrongGuesses: wrongGuessCount,
      elapsedSeconds: multiplayer && multiplayerGameEnded ? multiplayer.initialElapsedSeconds : totalTime,
      won: multiplayer ? Boolean(multiplayer.won) : finished,
      lost: multiplayer ? Boolean(multiplayer.lost) : failed,
      matchId: multiplayer?.matchId,
    });

    if (finished && !multiplayer) {
      if (leaderboardMode) {
        recordCompletedSoloQuizMode('ability-blitz', soloMode, selectedDifficulty);
        setCompletedDailyMode(true);
        const submitLeaderboard = async () => {
          const supabase = getOptionalSupabaseClient();
          const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
          const token = data.session?.access_token;
          if (!token) {
            setLeaderboardNotice('Create an account or sign in before finishing to place this score on the global leaderboard.');
            return;
          }

          await fetch('/api/solo-quiz/attempt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'finish',
              gameId: 'ability-blitz',
              mode: soloMode,
              difficulty: selectedDifficulty,
              itemIds: items.map((item) => item.id),
              completedItems,
              elapsedSeconds: totalTime,
              wrongGuesses: wrongGuessCount,
              result: 'completed',
            }),
          });

          const response = await fetch('/api/solo-quiz/leaderboard', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              gameId: 'ability-blitz',
              mode: soloMode,
              difficulty: selectedDifficulty,
              itemIds: items.map((item) => item.id),
              completionTimeSeconds: totalTime,
              wrongGuesses: wrongGuessCount,
            }),
          });
          const result = await response.json();
          setLeaderboardNotice(result.recorded ? 'Score recorded on the global leaderboard.' : 'You already have a leaderboard entry for this mode today.');
        };

        void submitLeaderboard();
      }
      const streakScope: SoloQuizStreakScope = soloMode === 'casual' ? 'casual:all' : soloMode === 'daily' ? 'daily:all' : 'chaos:challenger';
      setPlayerStats(recordPlayerGameCompletion('ability-blitz', [], undefined, streakScope));
    } else if (failed && !multiplayer && leaderboardMode) {
      recordCompletedSoloQuizMode('ability-blitz', soloMode, selectedDifficulty);
      setCompletedDailyMode(true);
      if (soloMode !== 'chaos' && selectedDifficulty !== CHAOS_DIFFICULTY) {
        return;
      }
      setPlayerStats(recordPlayerGameCompletion('ability-blitz', [], undefined, 'chaos:challenger'));
      const submitFailure = async () => {
        const supabase = getOptionalSupabaseClient();
        const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
        const token = data.session?.access_token;
        if (!token) {
          return;
        }

        await fetch('/api/solo-quiz/attempt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'finish',
            gameId: 'ability-blitz',
            mode: soloMode,
            difficulty: selectedDifficulty,
            itemIds: items.map((item) => item.id),
            completedItems,
            elapsedSeconds: totalTime,
            wrongGuesses: wrongGuessCount,
            result: 'failed',
          }),
        });
      };

      void submitFailure();
    }
  }, [completedProgressCount, failed, finished, items, leaderboardMode, multiplayer, multiplayerGameEnded, selectedDifficulty, soloMode, totalTime, wrongGuessCount]);

  useEffect(() => {
    const query = normalizeAnswer(inputValue);
    if (!currentItem || inputValue.trim().length < 3 || !query || !autocompleteEnabled) {
      setSuggestions([]);
      return;
    }

    setSuggestions(
      autocompleteSearchIndex
        .filter((entry) => entry.normalized.includes(query))
        .map((entry) => entry.answer),
    );
  }, [autocompleteEnabled, autocompleteSearchIndex, currentItem, inputValue]);

  useEffect(() => {
    if (multiplayer || !started || hasLoadedOnce) {
      return;
    }

    const loadItems = async () => {
      try {
        const params = new URLSearchParams({
          mode: soloMode,
          difficulty: selectedDifficulty,
          entries: String(soloMode === 'casual' ? 100 : entryCount),
        });
        const data = await loadAbilityItems(`/api/ability-blitz/quiz-items?${params}`);
        if (Array.isArray(data) && data.length > 0) {
          if (soloMode === 'casual') {
            const filteredData = filterItemsByAbilitySlots(data, selectedAbilitySlots);
            setItems(shuffle(filteredData.length ? filteredData : data).slice(0, entryCount));
          } else {
            setItems(data.slice(0, entryCount));
          }
        }
      } catch (err) {
        console.error('Failed to fetch randomized ability set', err);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [started, hasLoadedOnce, selectedAbilitySlots, entryCount, multiplayer, selectedDifficulty, soloMode]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setStarted(true);
        setCountdown(null);
      } else {
        const nextCountdown = countdown - 1;
        setCountdown(nextCountdown);
        playUiSound('timer-countdown');
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!progressSectionRef.current || !currentProgressItemRef.current) {
      return;
    }

    const container = progressSectionRef.current;
    const item = currentProgressItemRef.current;
    container.scrollTo({ top: Math.max(0, item.offsetTop - container.offsetTop - 8), behavior: 'smooth' });
  }, [activeIndex]);

  useEffect(() => {
    if (status === 'incorrect' || status === 'correct') {
      const timeout = window.setTimeout(() => setStatus('idle'), 600);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [status]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (difficultyMenuRef.current?.contains(target)) {
        return;
      }

      if (modifiersMenuRef.current?.contains(target)) {
        return;
      }

      setOpenMenu(null);

      if (!answerInputAreaRef.current?.contains(target)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const markGuessed = (itemId: string) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, guessed: true } : item)),
    );
  };

  const handleAdvance = () => {
    playUiSound('item-slide');
    setIsSliding(true);
    setTimeout(() => {
      setActiveIndex((current) => Math.min(current + 1, items.length - 1));
      setCurrentTime(0);
      setShowOptions(false);
      setPenaltyMessage('');
      setIsSliding(false);
      setSuppressHints(false);
    }, 600);
  };

  const handleCorrectGuess = () => {
    if (!currentItem) {
      return;
    }

    const completedAt = totalTime;
    const duration = currentTime;
    setCompletedTimes((current) => ({
      ...current,
      [currentItem.id]: { total: completedAt, duration },
    }));

    markGuessed(currentItem.id);
    playUiSound('skindle-guess-correct');
    setStatus('correct');
    setSuccessFlash(true);
    setShowOptions(false);

    window.setTimeout(() => setSuccessFlash(false), 700);

    const isFinalItem = activeIndex >= items.length - 1;
    multiplayer?.onProgress(activeIndex + 1, completedAt, isFinalItem ? 'completed' : 'active');
    if (isFinalItem) {
      playUiSound('puzzle-complete');
      setFinished(true);
      setStarted(false);
      return;
    }

    setSuppressHints(true);
    setTimeout(handleAdvance, 300);
  };

  const applyWrongGuess = (wrongOption?: string) => {
    playUiSound('skindle-guess-incorrect');
    setWrongGuessCount((count) => count + 1);
    if (difficultyRule.wrongGuess === 'game-over') {
      playUiSound('timer-expired');
      setFailed(true);
      setFailureReason('wrong');
      setStarted(false);
      setStatus('incorrect');
      setPenaltyMessage('Game Over');
      setSuppressHints(false);
      multiplayer?.onProgress(activeIndex, totalTime, 'failed');
      return;
    }

    const penalty =
      difficultyRule.wrongGuess === 'scaled'
        ? PENALTY_TIMES_SECONDS[Math.min(penaltyCount, PENALTY_TIMES_SECONDS.length - 1)]
        : difficultyRule.wrongGuess === 'flat-five'
        ? 5
        : 0;

    setPenaltyCount((count) => count + 1);
    setStatus('incorrect');

    if (wrongOption) {
      setOptions((current) => current.filter((answer) => answer !== wrongOption));
    }

    if (penalty > 0) {
      setCurrentTime((value) => value + penalty);
      setTotalTime((value) => value + penalty);
      setPenaltyMessage(`+${penalty}s`);
      window.setTimeout(() => setPenaltyMessage(''), 1200);
    } else {
      setPenaltyMessage('');
    }
  };

  const submitGuess = (rawGuess: string) => {
    if (!currentItem) {
      return;
    }

    const normalized = normalizeAnswer(rawGuess);
    if (!normalized) {
      return;
    }

    if (activeModifiers.confirmEntry && pendingConfirmedGuess !== normalized) {
      setPendingConfirmedGuess(normalized);
      setPenaltyMessage('Submit again to confirm');
      return;
    }

    setPendingConfirmedGuess('');
    setPenaltyMessage('');

    if (answerMatches(rawGuess, currentItem.answer)) {
      handleCorrectGuess();
    } else {
      applyWrongGuess();
      setInputValue('');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitGuess(inputValue);
  };

  const applyOption = (option: string) => {
    if (!currentItem) {
      return;
    }

    if (answerMatches(option, currentItem.answer)) {
      handleCorrectGuess();
      return;
    }

    applyWrongGuess(option);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setInputValue(suggestion);
    setSuggestions([]);
    submitGuess(suggestion);
  };

  const resetSinglePlayerRound = () => {
    setStarted(false);
    setFinished(false);
    setFailed(false);
    setFailureReason(null);
    setCountdown(null);
    setIsSliding(false);
    setActiveIndex(0);
    setCurrentTime(0);
    setTotalTime(0);
    setCompletedTimes({});
    setInputValue('');
    setStatus('idle');
    setShowOptions(false);
    setOptions([]);
    setSuggestions([]);
    setPenaltyCount(0);
    setWrongGuessCount(0);
    setPenaltyMessage('');
    setPendingConfirmedGuess('');
    setSuccessFlash(false);
    setSuppressHints(false);
    setHasLoadedOnce(false);
    statsRecordedRef.current = null;
    setItems(placeholderItems);
    clearSoloQuizGameState('ability-blitz', soloMode, selectedDifficulty);
    clearDailyGameState('ability-blitz');
    setResumeAvailable(false);
  };

  const markOfficialAttemptStarted = async () => {
    if (!leaderboardMode) {
      return true;
    }

    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      return true;
    }

    const response = await fetch('/api/solo-quiz/attempt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'start',
        gameId: 'ability-blitz',
        mode: soloMode,
        difficulty: selectedDifficulty,
      }),
    });
    const result = await response.json();
    if (result.alreadyPlayed) {
      setCompletedDailyMode(true);
      return false;
    }
    return true;
  };

  const submitOfficialAttemptState = useCallback(async (result: 'completed' | 'failed' | 'abandoned', completedItems = completedProgressCount) => {
    if (!leaderboardMode || items.length === 0) {
      return;
    }

    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      return;
    }

    await fetch('/api/solo-quiz/attempt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'finish',
        gameId: 'ability-blitz',
        mode: soloMode,
        difficulty: selectedDifficulty,
        itemIds: items.map((item) => item.id),
        completedItems,
        elapsedSeconds: totalTime,
        wrongGuesses: wrongGuessCount,
        result,
      }),
    });
  }, [completedProgressCount, items, leaderboardMode, selectedDifficulty, soloMode, totalTime, wrongGuessCount]);

  const handleGameControl = async () => {
    if (multiplayer) {
      return;
    }
    if (countdown !== null) {
      return;
    }

    if (started || finished || failed) {
      playUiSound('timer-expired');
      if (started && leaderboardMode) {
        await submitOfficialAttemptState('abandoned');
        recordCompletedSoloQuizMode('ability-blitz', soloMode, selectedDifficulty);
        setCompletedDailyMode(true);
      }
      resetSinglePlayerRound();
      return;
    }

    const savedState = loadSoloQuizGameState<AbilityBlitzDailyState>('ability-blitz', soloMode, selectedDifficulty);
    if (savedState?.started && !savedState.finished && !savedState.failed) {
      setItems(savedState.items.length ? savedState.items : placeholderItems);
      setSelectedDifficulty(savedState.selectedDifficulty);
      setActiveModifiers(savedState.activeModifiers);
      setSelectedAbilitySlots(savedState.selectedAbilitySlots);
      setEntryCount(savedState.entryCount ?? 50);
      setStarted(true);
      setActiveIndex(savedState.activeIndex);
      setCurrentTime(savedState.currentTime);
      setTotalTime(savedState.totalTime);
      setCompletedTimes(savedState.completedTimes);
      setFinished(false);
      setFailed(false);
      setHasLoadedOnce(savedState.items.length > 0);
      setCountdown(null);
      setIsSliding(false);
      setResumeAvailable(false);
      return;
    }

    const canStart = await markOfficialAttemptStarted();
    if (!canStart) {
      return;
    }

    setCurrentTime(0);
    setTotalTime(0);
    setActiveIndex(0);
    setCompletedTimes({});
    setWrongGuessCount(0);
    statsRecordedRef.current = null;
    setInputValue('');
    setStatus('idle');
    setShowOptions(false);
    setOptions([]);
    setSuggestions([]);
    setPenaltyCount(0);
    setFinished(false);
    setFailed(false);
    setFailureReason(null);
    setPenaltyMessage('');
    setPendingConfirmedGuess('');
    setSuccessFlash(false);
    setSuppressHints(false);
    setHasLoadedOnce(false);
    setItems(placeholderItems);
    setLeaderboardNotice('');
    if (soloMode === 'chaos') {
      setSelectedDifficulty(CHAOS_DIFFICULTY);
      setActiveModifiers(forceAllModifiers(defaultModifiers));
    }
    playUiSound('random-select');
    setCountdown(5);
    playUiSound('timer-countdown');
  };

  const handleDifficultySelect = (difficultyId: DifficultyId) => {
    if (configurationLocked) {
      return;
    }
    if (soloMode === 'chaos') {
      return;
    }

    playUiSound('autocomplete-select');
    setSelectedDifficulty(difficultyId);
  };

  const handleSoloModeSelect = (mode: SoloQuizMode) => {
    if (configurationLocked) {
      return;
    }

    setSoloMode(mode);
    setLeaderboardNotice('');
    if (mode === 'daily') {
      setSelectedDifficulty('gold');
      setEntryCount(10);
      setActiveModifiers(defaultModifiers);
      setSelectedAbilitySlots(defaultAbilitySlots);
    }
    if (mode === 'chaos') {
      setSelectedDifficulty(CHAOS_DIFFICULTY);
      setEntryCount(50);
      setSelectedAbilitySlots(defaultAbilitySlots);
      setActiveModifiers(forceAllModifiers(defaultModifiers));
    }
  };

  const handleModifierToggle = (modifierId: ModifierId) => {
    if (configurationLocked) {
      return;
    }
    if (!casualSettingsAvailable) {
      return;
    }

    setActiveModifiers((current) => ({
      ...current,
      [modifierId]: !current[modifierId],
    }));
    playUiSound('autocomplete-select');
  };

  const handleEntryCountChange = (count: number) => {
    if (configurationLocked) {
      return;
    }
    if (!casualSettingsAvailable) {
      return;
    }

    setEntryCount(count);
    playUiSound('autocomplete-select');
  };

  const handleAbilitySlotToggle = (slotId: AbilitySlotId) => {
    if (configurationLocked) {
      return;
    }
    if (!casualSettingsAvailable) {
      return;
    }

    setSelectedAbilitySlots((current) => {
      const activeCount = Object.values(current).filter(Boolean).length;

      if (current[slotId] && activeCount <= 1) {
        return current;
      }

      return {
        ...current,
        [slotId]: !current[slotId],
      };
    });
    playUiSound('autocomplete-select');
  };

  useEffect(() => {
    if (!started || countdown !== null || finished || failed || !chaosMode || isSliding || status === 'correct') {
      return;
    }

    if (currentTime >= CHAOS_ROUND_TIME_LIMIT_SECONDS) {
      playUiSound('timer-expired');
      setFailed(true);
      setFailureReason('timeout');
      setStarted(false);
      setStatus('incorrect');
      setPenaltyMessage('Time Up');
      setSuppressHints(false);
      void submitOfficialAttemptState('failed');
      multiplayer?.onProgress(activeIndex, totalTime, 'failed');
    }
  }, [activeIndex, chaosMode, countdown, currentTime, failed, finished, isSliding, multiplayer, started, status, submitOfficialAttemptState, totalTime]);

  const getModeStatus = useCallback((mode: SoloQuizMode, difficulty: DifficultyId): ModeStatus => {
    if (hasCompletedSoloQuizMode('ability-blitz', mode, difficulty)) {
      const savedState = loadSoloQuizGameState<AbilityBlitzDailyState>('ability-blitz', mode, difficulty);
      if (mode !== 'chaos' && savedState?.started && !savedState.finished && !savedState.failed) {
        return 'in-progress';
      }
      return 'completed';
    }

    const savedState = loadSoloQuizGameState<AbilityBlitzDailyState>('ability-blitz', mode, difficulty);
    if (mode !== 'chaos' && savedState?.started && !savedState.finished && !savedState.failed) {
      return 'in-progress';
    }
    return 'not-started';
  }, []);

  useEffect(() => {
    if (multiplayer || !storageReady || !showSoloPrematch) {
      return;
    }

    setModeStatuses({
      casual: getModeStatus('casual', selectedDifficulty),
      daily: getModeStatus('daily', soloMode === 'chaos' ? 'gold' : selectedDifficulty),
      chaos: getModeStatus('chaos', CHAOS_DIFFICULTY),
    });
    setDailyDifficultyStatuses({
      iron: getModeStatus('daily', 'iron'),
      gold: getModeStatus('daily', 'gold'),
      diamond: getModeStatus('daily', 'diamond'),
      challenger: getModeStatus('daily', 'challenger'),
    });
  }, [completedDailyMode, getModeStatus, multiplayer, resumeAvailable, selectedDifficulty, showSoloPrematch, soloMode, storageReady]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-12">
        <header className="relative z-30 flex flex-col gap-5 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {multiplayer ? (
              <button type="button" onClick={multiplayer.onExit} aria-label="Leave multiplayer game" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
                <ArrowLeft size={20} />
              </button>
            ) : (
              <Link href="/multiplayer/ability-blitz" aria-label="Back to Ability Blitz lobby setup" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
                <ArrowLeft size={20} />
              </Link>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{multiplayer ? 'Multiplayer Game' : 'Single Player Game'}</p>
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-white">
                Ability Blitz
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-xs font-bold text-amber-100">
                  <Flame size={12} className="text-amber-300" />
                  {playerStats.currentStreak}
                </span>
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                {failed
                  ? 'Game over'
                  : multiplayerRaceEndedEarly
                  ? ''
                  : finished
                  ? shouldHideTimers
                    ? 'Completed'
                    : `Completed in ${formatSeconds(totalTime)}`
                  : countdown !== null
                    ? `Starting in ${countdown}`
                  : multiplayer
                    ? 'Match in progress'
                    : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <GameInfoMenu title="Ability Blitz" steps={[
              'Identify the ability shown and submit its exact name.',
              'Correct answers advance through the randomized set; difficulty controls hints and penalties.',
              multiplayer ? 'Finish the shared set before your opponents.' : 'Complete the set as quickly as possible.',
            ]} />
            {multiplayer?.gameEnded && multiplayer.canReturnToLobby ? (
              <button
                type="button"
                onClick={multiplayer.onReturnToLobby}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
              >
                {multiplayer.returnToLobbyLabel ?? 'Return to Lobby'}
              </button>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <div ref={difficultyMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (configurationLocked || soloMode === 'chaos') return;
                    setOpenMenu((current) => (current === 'difficulty' ? null : 'difficulty'));
                  }}
                  disabled={configurationLocked || soloMode === 'chaos'}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                  aria-expanded={openMenu === 'difficulty'}
                >
                  <Trophy size={16} className="text-amber-300" />
                  Difficulty
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs"><DifficultyLabel difficulty={selectedDifficulty} /></span>
                  <ChevronDown size={16} className={openMenu === 'difficulty' ? 'rotate-180 transition' : 'transition'} />
                </button>

                {openMenu === 'difficulty' ? (
                  <div className="absolute right-0 top-14 z-40 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4">
                    <div className="mb-4 border-b border-white/10 pb-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Difficulty</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Difficulty changes affect wrong-guess time, hint timing, upcoming item visibility, and auto-fill.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {difficulties.map((difficulty) => {
                        const isSelected = selectedDifficulty === difficulty.id;

                        return (
                          <button
                            key={difficulty.id}
                            type="button"
                            onMouseEnter={() => playUiSound('autocomplete-hover')}
                            onFocus={() => playUiSound('autocomplete-hover')}
                            onClick={() => handleDifficultySelect(difficulty.id)}
                            disabled={configurationLocked}
                            className={`rounded-xl border p-3 text-left transition ${
                              isSelected
                                ? getDifficultyStyle(difficulty.id).selected
                                : 'border-white/10 bg-slate-900/80 hover:border-white/25'
                            } ${configurationLocked ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <DifficultyLabel difficulty={difficulty.id} />
                              <span className={`h-3 w-3 rounded-full border ${isSelected ? getDifficultyStyle(difficulty.id).dot : 'border-slate-500'}`} />
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-slate-400">{difficulty.description}</span>
                          </button>
                        );
                      })}
                    </div>
                    {configurationLocked ? (
                      <p className="mt-3 text-xs text-slate-500">Difficulty is locked while a round is active.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div ref={modifiersMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (configurationLocked || !casualSettingsAvailable) return;
                    setOpenMenu((current) => (current === 'modifiers' ? null : 'modifiers'));
                  }}
                  disabled={configurationLocked || !casualSettingsAvailable}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                  aria-expanded={openMenu === 'modifiers'}
                >
                  <SlidersHorizontal size={16} className="text-amber-300" />
                  Modifiers
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    {activeModifierCount}
                  </span>
                  <ChevronDown size={16} className={openMenu === 'modifiers' ? 'rotate-180 transition' : 'transition'} />
                </button>

                {openMenu === 'modifiers' ? (
                  <div className="absolute right-0 top-14 z-40 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4">
                    <div className="mb-4 border-b border-white/10 pb-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Modifiers</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Optional rule changes can be enabled before the game starts.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {modifiers.map((modifier) => {
                        const isActive = activeModifiers[modifier.id];

                        return (
                          <button
                            key={modifier.id}
                            type="button"
                            onMouseEnter={() => playUiSound('autocomplete-hover')}
                            onFocus={() => playUiSound('autocomplete-hover')}
                            onClick={() => handleModifierToggle(modifier.id)}
                            disabled={configurationLocked || !casualSettingsAvailable}
                            className={`flex items-center justify-between gap-4 rounded-xl border p-3 text-left transition ${
                              isActive
                                ? 'border-amber-300/60 bg-amber-300/10'
                                : 'border-white/10 bg-slate-900/80 hover:border-white/25'
                            } ${configurationLocked || !casualSettingsAvailable ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <span>
                              <span className="block font-semibold text-white">{modifier.name}</span>
                              <span className="mt-1 block text-xs leading-5 text-slate-400">{modifier.description}</span>
                            </span>
                            <ToggleSwitch checked={isActive} disabled={configurationLocked} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <label className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block text-sm font-semibold text-white">Entries</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">Select how many abilities appear this round.</span>
                        </span>
                        <select
                          value={entryCount}
                          disabled={configurationLocked || !casualSettingsAvailable}
                          onChange={(event) => {
                            playUiSound('autocomplete-select');
                            handleEntryCountChange(Number(event.target.value));
                          }}
                          className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {entryCountOptions.map((count) => <option key={count} value={count}>{count}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Ability Set</p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Select which abilities can appear this round.
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                          {selectedAbilitySlotCount}/5
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {abilitySlots.map((slot) => {
                          const isSelected = selectedAbilitySlots[slot.id];

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onMouseEnter={() => playUiSound('autocomplete-hover')}
                              onFocus={() => playUiSound('autocomplete-hover')}
                              onClick={() => handleAbilitySlotToggle(slot.id)}
                              disabled={configurationLocked || !casualSettingsAvailable}
                              title={slot.name}
                              className={`flex h-12 items-center justify-center rounded-xl border text-sm font-semibold transition ${
                                isSelected
                                  ? 'border-amber-300/60 bg-amber-300 text-slate-950'
                                  : 'border-white/10 bg-slate-900/80 text-slate-400 hover:border-white/25'
                              } ${configurationLocked || !casualSettingsAvailable ? 'cursor-not-allowed opacity-70' : ''}`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {configurationLocked ? (
                      <p className="mt-3 text-xs text-slate-500">Modifiers are locked while a round is active.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {!multiplayer && !showSoloPrematch ? <button
              type="button"
              onClick={handleGameControl}
              hidden={leaderboardMode}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                started || finished || failed
                  ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
              disabled={countdown !== null || Boolean(multiplayer)}
            >
              {started || finished || failed ? null : <Play size={16} />}
              {countdown !== null ? `Starting in ${countdown}` : started || finished || failed ? 'End Game' : 'Play'}
            </button> : null}
          </div>
        </header>

        {multiplayer?.progressPanel}

        {showSoloPrematch ? (
          <SoloQuizPrematch
            gameId="ability-blitz"
            selectedMode={soloMode}
            selectedDifficulty={selectedDifficulty}
            countdown={countdown}
            playerStats={playerStats}
            streaks={{
              casual: getPlayerGameStreakForMode(playerStats, 'casual').currentStreak,
              daily: getPlayerGameStreakForMode(playerStats, 'daily').currentStreak,
              chaos: getPlayerGameStreakForMode(playerStats, 'chaos').currentStreak,
            }}
            completedToday={completedDailyMode}
            modeStatuses={modeStatuses}
            dailyDifficultyStatuses={dailyDifficultyStatuses}
            authRequiredNote={leaderboardNotice}
            onModeSelect={handleSoloModeSelect}
            onPlay={handleGameControl}
          />
        ) : null}

        {!showSoloPrematch ? <section className="overflow-visible rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
          {!showEndState ? (
            <QuizItemCarousel
              slots={carouselSlots}
              afterNextItem={afterNextItem}
              nextItem={nextItem ?? null}
              currentItem={started ? currentItem ?? null : null}
              previousItem={previousItem ?? null}
              isSliding={isSliding}
              renderItem={renderCarouselItem}
            />
          ) : null}

          {!showEndState ? <form
            onSubmit={handleSubmit}
            className={`mt-8 flex flex-col gap-4 rounded-3xl border p-5 bg-slate-950/80 shadow-inner shadow-slate-950/40 transition ${
              successFlash
                ? 'border-emerald-400/40 ring-1 ring-emerald-400/20 shadow-emerald-500/10'
                : 'border-white/10'
            }`}
          >
            {failed ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
                {failureReason === 'timeout' ? 'Time is up.' : 'Challenger rules: a wrong guess ended the round.'}
              </div>
            ) : started && showOptions && options.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-5">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseEnter={() => playUiSound('autocomplete-hover')}
                    onFocus={() => playUiSound('autocomplete-hover')}
                    onClick={() => {
                      playUiSound('autocomplete-select');
                      applyOption(option);
                    }}
                    className="rounded-3xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-slate-100 transition hover:border-violet-400 hover:bg-slate-800"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : started && hintsDisabled ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-400">
                Hints are disabled for this difficulty.
              </div>
            ) : started ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-400">
                Answers appear in <span className="font-semibold text-slate-100">{timeUntilOptions}s</span>
              </div>
            ) : (
              null
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="guess-input">
                Enter answer
              </label>
              <div ref={answerInputAreaRef} className="relative flex-1">
                <input
                  id="guess-input"
                  name="quiz-answer"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={started ? 'Type your guess here' : 'Press Play to start'}
                  value={inputValue}
                  onChange={(event) => {
                    setInputValue(event.target.value);
                    setPendingConfirmedGuess('');
                  }}
                  onFocus={() => {
                    const query = normalizeAnswer(inputValue);
                    if (!currentItem || inputValue.trim().length < 3 || !query || !autocompleteEnabled) {
                      return;
                    }

                    setSuggestions(
                      autocompleteSearchIndex
                        .filter((entry) => entry.normalized.includes(query))
                        .map((entry) => entry.answer),
                    );
                  }}
                  disabled={!started}
                  className={`w-full rounded-3xl border px-5 py-4 text-lg text-slate-100 outline-none transition duration-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                    status === 'incorrect'
                      ? 'border-red-500 bg-slate-950/90 text-white shadow-[0_0_0_3px_rgba(244,63,94,0.16)] animate-shake'
                      : status === 'correct'
                      ? 'border-emerald-400 bg-slate-950/90 text-white shadow-[0_0_0_3px_rgba(52,211,153,0.16)]'
                      : 'border-white/10 bg-slate-950/80'
                  }`}
                  type="text"
                />
                {suggestions.length > 0 && started && autocompleteEnabled ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onMouseEnter={() => playUiSound('autocomplete-hover')}
                        onFocus={() => playUiSound('autocomplete-hover')}
                        onClick={() => {
                          playUiSound('autocomplete-select');
                          handleSuggestionSelect(suggestion);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-slate-900"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={!started}
                className="inline-flex h-16 items-center justify-center rounded-3xl bg-violet-500 px-6 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ThumbsUp size={18} className="mr-2" />
                {activeModifiers.confirmEntry && pendingConfirmedGuess ? 'Confirm' : 'Submit'}
              </button>
            </div>
            {!shouldHideTimers || penaltyMessage ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                {!shouldHideTimers ? (
                  <>
                    {chaosMode ? (
                      <>
                        <span className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-red-100">
                          Round limit {formatSeconds(Math.max(0, CHAOS_ROUND_TIME_LIMIT_SECONDS - currentTime))}
                        </span>
                        <span className="hidden h-3 w-3 rounded-full bg-slate-500 sm:inline-block" />
                      </>
                    ) : null}
                    <span>Total time: <span className="text-white">{formatSeconds(totalTime)}</span></span>
                    <span className="hidden h-3 w-3 rounded-full bg-slate-500 sm:inline-block" />
                    <span>Current item: <span className="text-white">{formatSeconds(currentTime)}</span></span>
                  </>
                ) : null}
                {penaltyMessage ? <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-300">{penaltyMessage}</span> : null}
              </div>
            ) : null}
          </form> : null}

          <div className={`${showEndState ? 'app-gradient-border' : 'border border-white/10'} mt-8 overflow-hidden rounded-3xl bg-slate-950/70 p-5`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm uppercase tracking-[0.24em] text-slate-500">Round progress</h2>
              <div className="flex items-center gap-3">
                {showSinglePlayerEndState ? (
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('random-select');
                      resetSinglePlayerRound();
                    }}
                    className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300 hover:text-slate-950"
                  >
                    Start Another
                  </button>
                ) : null}
                {multiplayerGameEnded ? <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Race Ended</span> : null}
                <span className="text-xs text-slate-500">{completedProgressCount}/{progressList.length}</span>
              </div>
            </div>
            <div ref={progressSectionRef} className="max-h-[22rem] overflow-y-auto scroll-smooth pr-2">
              <div className="grid gap-3 lg:grid-cols-4">
                {progressList.map((item) => {
                  return (
                    <QuizProgressCard
                      key={item.id}
                      ref={item.state === 'current' ? currentProgressItemRef : undefined}
                      item={item}
                      state={item.state === 'completed' ? 'completed' : item.state === 'current' ? 'current' : 'pending'}
                      title={item.guessed ? item.answer : '???'}
                      detail={shouldHideTimers
                          ? item.state === 'completed'
                            ? 'Completed'
                            : 'Timer hidden'
                          : item.state === 'current'
                            ? formatSeconds(currentTime)
                            : item.state === 'completed' && completedTimes[item.id]
                              ? `${formatSeconds(completedTimes[item.id].total)} - ${formatSeconds(completedTimes[item.id].duration)}`
                              : item.state === 'completed'
                                ? 'Completed'
                                : 'TBD - TBD'}
                      activeClassName="border-violet-400/50 bg-violet-500/10 ring-1 ring-violet-400/20"
                      completedClassName="border-emerald-500/20 bg-emerald-500/5"
                      pendingClassName="border-white/10 bg-slate-950/70"
                      pendingImageClassName="blur-sm brightness-50"
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section> : null}
      </section>
    </main>
  );
}
