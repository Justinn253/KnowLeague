'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Flame, Play, SlidersHorizontal, ThumbsUp, Trophy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  clearDailyGameState,
  loadDailyGameState,
  loadPlayerGameStats,
  recordPlayerGameCompletion,
  recordQuizGameStats,
  saveDailyGameState,
  type PlayerGameStats,
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
type UpcomingVisibility = 'clear' | 'blurred' | 'blocked';

type AbilityBlitzDailyState = {
  items: QuizItem[];
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
    <Image
      src={pixelated ? renderedSrc : src}
      alt={alt}
      width={96}
      height={96}
      unoptimized={pixelated}
      className={className}
    />
  );
}

export function AbilityBlitz({ multiplayer }: { multiplayer?: MultiplayerGameRuntime }) {
  const multiplayerItems = multiplayer?.items.map((item, index) => ({
    ...item,
    guessed: index < multiplayer.initialProgress,
  }));
  const [items, setItems] = useState<QuizItem[]>(multiplayerItems?.length ? multiplayerItems : placeholderItems);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>((multiplayer?.difficulty as DifficultyId) ?? 'gold');
  const [activeModifiers, setActiveModifiers] = useState<ModifierState>(multiplayer ? createModifierState(multiplayer.modifiers) : defaultModifiers);
  const [selectedAbilitySlots, setSelectedAbilitySlots] = useState<AbilitySlotState>(defaultAbilitySlots);
  const [entryCount, setEntryCount] = useState(50);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [started, setStarted] = useState(Boolean(multiplayer && !multiplayer.gameEnded && multiplayer.initialProgress < multiplayer.items.length));
  const [isSliding, setIsSliding] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
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
  const [successFlash, setSuccessFlash] = useState(false);
  const [suppressHints, setSuppressHints] = useState(false);
  const [pendingConfirmedGuess, setPendingConfirmedGuess] = useState('');
  const [storageReady, setStorageReady] = useState(Boolean(multiplayer));
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => loadPlayerGameStats('ability-blitz'));
  const progressSectionRef = useRef<HTMLDivElement | null>(null);
  const currentProgressItemRef = useRef<HTMLDivElement | null>(null);
  const difficultyMenuRef = useRef<HTMLDivElement | null>(null);
  const modifiersMenuRef = useRef<HTMLDivElement | null>(null);
  const answerInputAreaRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredStateRef = useRef(false);
  const statsRecordedRef = useRef<string | null>(null);

  const currentItem = items[activeIndex];
  const nextItem = items[activeIndex + 1];
  const previousItem = items[activeIndex - 1];
  const configurationLocked = started || countdown !== null || finished || failed;
  const multiplayerRaceEndedEarly = Boolean(multiplayer?.gameEnded && multiplayer.initialProgress < multiplayer.items.length);
  const multiplayerGameEnded = multiplayer?.gameEnded ?? false;
  const showSinglePlayerEndState = !multiplayer && finished;
  const showEndState = showSinglePlayerEndState || Boolean(multiplayer && multiplayerGameEnded);
  const multiplayerInitialProgress = multiplayer?.initialProgress;
  const activeModifierCount = Object.values(activeModifiers).filter(Boolean).length;
  const selectedAbilitySlotCount = Object.values(selectedAbilitySlots).filter(Boolean).length;
  const difficultyRule = difficultyRules[selectedDifficulty];
  const hintsDisabled = difficultyRule.hintDelaySeconds === null;
  const autocompleteEnabled = difficultyRule.autocomplete;
  const shouldHideTimers = activeModifiers.hiddenTimer;
  const currentIconHidden = activeModifiers.disappearing && started && currentTime >= 5;
  const filteredItems = useMemo(
    () => filterItemsByAbilitySlots(items, selectedAbilitySlots),
    [items, selectedAbilitySlots],
  );
  const filteredAnswers = useMemo(
    () => Array.from(new Set(filteredItems.map((item) => item.answer))).sort(),
    [filteredItems],
  );

  const getIconClassName = (visibility: 'current' | 'next' | 'previous') => {
    const classes = ['h-24 w-24 rounded-3xl object-cover transition duration-300'];

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
  };

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
  const completedProgressCount = progressList.filter((item) => item.state === 'completed').length;

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

    const timeout = window.setTimeout(() => setShowOptions(true), hintDelaySeconds * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeIndex, started, countdown, suppressHints, currentItem, showOptions, hintsDisabled, difficultyRule.hintDelaySeconds]);

  useEffect(() => {
    if (categoryAnswers['all']?.length) {
      return;
    }

    fetch(`/api/ability-blitz/quiz-answers`)
      .then((res) => res.json())
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
    const savedState = loadDailyGameState<AbilityBlitzDailyState>('ability-blitz');
    if (!savedState) {
      setStorageReady(true);
      return;
    }

    setItems(savedState.items.length ? savedState.items : placeholderItems);
    setSelectedDifficulty(savedState.selectedDifficulty);
    setActiveModifiers(savedState.activeModifiers);
    setSelectedAbilitySlots(savedState.selectedAbilitySlots);
    setEntryCount(savedState.entryCount ?? 50);
    setStarted(savedState.started);
    setActiveIndex(savedState.activeIndex);
    setCurrentTime(savedState.currentTime);
    setTotalTime(savedState.totalTime);
    setCompletedTimes(savedState.completedTimes);
    setFinished(savedState.finished);
    setFailed(savedState.failed);
    setHasLoadedOnce(savedState.items.length > 0);
    setCountdown(null);
    setIsSliding(false);
    setStorageReady(true);
  }, [multiplayer]);

  useEffect(() => {
    if (multiplayer || !storageReady || (!hasLoadedOnce && !started && !finished && !failed)) {
      return;
    }

    saveDailyGameState<AbilityBlitzDailyState>('ability-blitz', {
      items,
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
    });
  }, [
    activeIndex,
    activeModifiers,
    completedTimes,
    entryCount,
    currentTime,
    failed,
    finished,
    hasLoadedOnce,
    items,
    selectedAbilitySlots,
    selectedDifficulty,
    started,
    storageReady,
    totalTime,
    multiplayer,
  ]);

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
      setPlayerStats(recordPlayerGameCompletion('ability-blitz'));
    }
  }, [completedProgressCount, failed, finished, items, multiplayer, multiplayerGameEnded, totalTime, wrongGuessCount]);

  useEffect(() => {
    const query = normalizeAnswer(inputValue);
    if (!currentItem || inputValue.trim().length < 3 || !query || !autocompleteEnabled) {
      setSuggestions([]);
      return;
    }

    const candidateAnswers = categoryAnswers['all']?.length
      ? categoryAnswers['all']
      : filteredAnswers.length
      ? filteredAnswers
      : Array.from(new Set(items.map((item) => item.answer)));

    setSuggestions(candidateAnswers.filter((answer) => normalizeAnswer(answer).includes(query)));
  }, [inputValue, currentItem, items, filteredAnswers, autocompleteEnabled, categoryAnswers]);

  useEffect(() => {
    if (multiplayer || !started || hasLoadedOnce) {
      return;
    }

    const loadItems = async () => {
      try {
        const res = await fetch('/api/ability-blitz/quiz-items');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const filteredData = filterItemsByAbilitySlots(data, selectedAbilitySlots);
          setItems(shuffle(filteredData.length ? filteredData : data).slice(0, entryCount));
        }
      } catch (err) {
        console.error('Failed to fetch randomized ability set', err);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [started, hasLoadedOnce, selectedAbilitySlots, entryCount, multiplayer]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setStarted(true);
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
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
    setStatus('correct');
    setSuccessFlash(true);
    setShowOptions(false);

    window.setTimeout(() => setSuccessFlash(false), 700);

    const isFinalItem = activeIndex >= items.length - 1;
    multiplayer?.onProgress(activeIndex + 1, completedAt, isFinalItem ? 'completed' : 'active');
    if (isFinalItem) {
      setFinished(true);
      setStarted(false);
      return;
    }

    setSuppressHints(true);
    setTimeout(handleAdvance, 300);
  };

  const applyWrongGuess = (wrongOption?: string) => {
    setWrongGuessCount((count) => count + 1);
    if (difficultyRule.wrongGuess === 'game-over') {
      setFailed(true);
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
    clearDailyGameState('ability-blitz');
  };

  const handleGameControl = () => {
    if (multiplayer) {
      return;
    }
    if (countdown !== null) {
      return;
    }

    if (started || finished || failed) {
      resetSinglePlayerRound();
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
    setPenaltyMessage('');
    setPendingConfirmedGuess('');
    setSuccessFlash(false);
    setSuppressHints(false);
    setHasLoadedOnce(false);
    setItems(placeholderItems);
    setCountdown(3);
  };

  const handleDifficultySelect = (difficultyId: DifficultyId) => {
    if (configurationLocked) {
      return;
    }

    setSelectedDifficulty(difficultyId);
  };

  const handleModifierToggle = (modifierId: ModifierId) => {
    if (configurationLocked) {
      return;
    }

    setActiveModifiers((current) => ({
      ...current,
      [modifierId]: !current[modifierId],
    }));
  };

  const handleEntryCountChange = (count: number) => {
    if (configurationLocked) {
      return;
    }

    setEntryCount(count);
  };

  const handleAbilitySlotToggle = (slotId: AbilitySlotId) => {
    if (configurationLocked) {
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
  };

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
              <Link href="/" aria-label="Back to game hub" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
                <ArrowLeft size={20} />
              </Link>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{multiplayer ? 'Multiplayer Game' : 'Single Player Game'}</p>
              <h1 className="text-xl font-semibold text-white">Ability Blitz</h1>
              <p className="mt-1 text-xs text-slate-400">
                {failed
                  ? 'Game over'
                  : multiplayerRaceEndedEarly
                  ? ''
                  : finished
                  ? shouldHideTimers
                    ? 'Completed'
                    : `Completed in ${formatSeconds(totalTime)}`
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
            <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100">
              <Flame size={16} className="text-amber-300" />
              {playerStats.currentStreak} day streak
            </div>
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
                    if (configurationLocked) return;
                    setOpenMenu((current) => (current === 'difficulty' ? null : 'difficulty'));
                  }}
                  disabled={configurationLocked}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                  aria-expanded={openMenu === 'difficulty'}
                >
                  <Trophy size={16} className="text-amber-300" />
                  Difficulty
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs"><DifficultyLabel difficulty={selectedDifficulty} /></span>
                  <ChevronDown size={16} className={openMenu === 'difficulty' ? 'rotate-180 transition' : 'transition'} />
                </button>

                {openMenu === 'difficulty' ? (
                  <div className="absolute right-0 top-14 z-40 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/40">
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
                    if (configurationLocked) return;
                    setOpenMenu((current) => (current === 'modifiers' ? null : 'modifiers'));
                  }}
                  disabled={configurationLocked}
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
                  <div className="absolute right-0 top-14 z-40 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/40">
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
                            onClick={() => handleModifierToggle(modifier.id)}
                            disabled={configurationLocked}
                            className={`flex items-center justify-between gap-4 rounded-xl border p-3 text-left transition ${
                              isActive
                                ? 'border-amber-300/60 bg-amber-300/10'
                                : 'border-white/10 bg-slate-900/80 hover:border-white/25'
                            } ${configurationLocked ? 'cursor-not-allowed opacity-70' : ''}`}
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
                          disabled={configurationLocked}
                          onChange={(event) => handleEntryCountChange(Number(event.target.value))}
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
                              onClick={() => handleAbilitySlotToggle(slot.id)}
                              disabled={configurationLocked}
                              title={slot.name}
                              className={`flex h-12 items-center justify-center rounded-xl border text-sm font-semibold transition ${
                                isSelected
                                  ? 'border-amber-300/60 bg-amber-300 text-slate-950'
                                  : 'border-white/10 bg-slate-900/80 text-slate-400 hover:border-white/25'
                              } ${configurationLocked ? 'cursor-not-allowed opacity-70' : ''}`}
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

            {!multiplayer ? <button
              type="button"
              onClick={handleGameControl}
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

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl overflow-hidden">
          {!showEndState ? <div className={`grid gap-4 lg:grid-cols-3 lg:items-center transition-none ${isSliding ? 'animate-carousel-slide' : ''}`}>
            {/* Next Item Card */}
            <div className="rounded-[2.5rem] border border-slate-700/50 bg-slate-950/80 p-8 shadow-lg">
              <div className="mb-5 flex items-center justify-between gap-3 text-slate-400">
                <p className="text-xs uppercase tracking-[0.22em]">Next item</p>
                <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  Ability
                </span>
              </div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                <div className="absolute inset-0 bg-grid-slate opacity-10" />
                <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                  {nextItem ? (
                    <div className="flex h-36 w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800/90 p-4 shadow-inner shadow-slate-950/60">
                      {difficultyRule.upcomingVisibility === 'blocked' ? (
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Hidden
                        </span>
                      ) : nextItem.imageUrl ? (
                        <PixelatedIcon
                          src={nextItem.imageUrl}
                          alt={nextItem.question}
                          className={getIconClassName('next')}
                          pixelated={activeModifiers.pixelated}
                        />
                      ) : (
                        <span className="text-4xl opacity-30">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="h-36 w-full max-w-xs rounded-3xl bg-slate-800/80 p-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Current Item Card */}
            <div
              key={activeIndex}
              className={`rounded-[2.5rem] bg-slate-950/80 p-8 shadow-xl transition-all duration-300 ${
                successFlash
                  ? 'border border-emerald-400/40 ring-1 ring-emerald-400/20 shadow-emerald-500/10'
                  : 'border border-violet-500/20 shadow-violet-500/10'
              }`}
            >
              <div className="mb-5 flex items-center justify-between gap-3 text-slate-400">
                <p className="text-xs uppercase tracking-[0.22em]">Current item</p>
                <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  Ability
                </span>
              </div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                <div className="absolute inset-0 bg-grid-slate opacity-10" />
                <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                  {started && currentItem ? (
                    <div className="flex h-36 w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800/90 p-4 shadow-inner shadow-slate-950/60">
                      {currentItem.imageUrl ? (
                        <PixelatedIcon
                          src={currentItem.imageUrl}
                          alt={currentItem.question}
                          className={getIconClassName('current')}
                          pixelated={activeModifiers.pixelated}
                        />
                      ) : (
                        <span className="text-4xl">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="h-36 w-full max-w-xs rounded-3xl bg-slate-800/80 p-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Previous Item Card */}
            <div className="rounded-[2.5rem] border border-emerald-500/20 bg-slate-950/80 p-8 shadow-lg">
              <div className="mb-5 flex items-start justify-between gap-3 text-slate-400">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.22em]">Completed</p>
                  {previousItem ? (
                    <p className="mt-1 truncate text-sm text-slate-300">
                      <span>{previousItem.answer}</span>
                      <span className="ml-3 text-xs text-slate-400">{previousItem.champion} - {getAbilityKeyLabel(previousItem)}</span>
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-300">
                  <Check size={14} className="inline" />
                </span>
              </div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                <div className="absolute inset-0 bg-grid-slate opacity-10" />
                <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                  {previousItem ? (
                    <div className="flex h-36 w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800/90 p-4 shadow-inner shadow-slate-950/60">
                      {previousItem.imageUrl ? (
                        <PixelatedIcon
                          src={previousItem.imageUrl}
                          alt={previousItem.question}
                          className={getIconClassName('previous')}
                          pixelated={activeModifiers.pixelated}
                        />
                      ) : (
                        <span className="text-4xl">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="h-36 w-full max-w-xs rounded-3xl bg-slate-800/80 p-4" />
                  )}
                </div>
              </div>
            </div>
          </div> : null}

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
                Challenger rules: a wrong guess ended the round.
              </div>
            ) : started && showOptions && options.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-5">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => applyOption(option)}
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

                    const candidateAnswers = categoryAnswers['all']?.length
                      ? categoryAnswers['all']
                      : filteredAnswers.length
                      ? filteredAnswers
                      : Array.from(new Set(items.map((item) => item.answer)));

                    setSuggestions(candidateAnswers.filter((answer) => normalizeAnswer(answer).includes(query)));
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
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSuggestionSelect(suggestion)}
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
                {multiplayerGameEnded ? <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Race Ended</span> : null}
                <span className="text-xs text-slate-500">{completedProgressCount}/{progressList.length}</span>
              </div>
            </div>
            <div ref={progressSectionRef} className="max-h-[22rem] overflow-y-auto scroll-smooth pr-2">
              <div className="grid gap-3 lg:grid-cols-4">
                {progressList.map((item) => {
                  const itemClass =
                    item.state === 'current'
                      ? 'border-violet-400/50 bg-violet-500/10 ring-1 ring-violet-400/20'
                      : item.state === 'completed'
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-white/10 bg-slate-950/70';

                  return (
                    <div
                      key={item.id}
                      ref={item.state === 'current' ? currentProgressItemRef : undefined}
                      className={`relative min-h-20 overflow-hidden rounded-3xl border px-4 py-3 pr-16 transition ${itemClass}`}
                    >
                      <div className="text-sm font-semibold text-slate-100">
                        <span>{item.guessed ? item.answer : '???'}</span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-slate-400">
                        {shouldHideTimers
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
                      </p>
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          width={40}
                          height={40}
                          className={`absolute right-3 top-3 h-10 w-10 rounded-xl border border-white/10 object-cover ${item.state === 'pending' ? 'blur-sm brightness-50' : ''}`}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
