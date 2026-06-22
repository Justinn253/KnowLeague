'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Flame, Play, SlidersHorizontal, ThumbsUp, Trophy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  loadDailyGameState,
  loadPlayerGameStats,
  recordPlayerGameCompletion,
  saveDailyGameState,
  type PlayerGameStats,
} from '@/lib/game-storage';
import {
  formatSeconds,
  normalizeAnswer,
  OPTION_DELAY_SECONDS,
  PENALTY_TIMES_SECONDS,
  shuffle,
  type CompletedTime,
  type QuizItem,
} from '@/lib/quiz';
import type { MultiplayerGameRuntime } from '@/components/multiplayer-game-progress';
import { GameInfoMenu } from '@/components/game-info-menu';
import { DifficultyLabel, getDifficultyStyle } from '@/components/difficulty-style';

const modifiers = [
  { id: 'greyscale', name: 'Greyscale', description: 'Splash art appears in greyscale.' },
  { id: 'blurred', name: 'Blurred', description: 'Splash art is slightly blurred.' },
  { id: 'cropped', name: 'Cropped', description: 'Only a cropped section is shown, with wrong guesses zooming out.' },
  { id: 'hiddenTimer', name: 'Hidden Timer', description: 'Timer no longer displays.' },
  { id: 'confirmEntry', name: 'Confirm Entry', description: 'Guesses require a second submit or Enter press.' },
] as const;

const difficulties = [
  {
    id: 'iron',
    name: 'Iron',
    description: 'No upcoming skin blur, hints appear instantly, wrong guesses add no time, and auto-fill is active.',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Upcoming skins are blurred, hints appear after 10 seconds, wrong guesses add 5 seconds, and auto-fill is active.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Upcoming skins are blocked, hints appear after 30 seconds, wrong guesses scale upward, and auto-fill is active.',
  },
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Upcoming skins are blocked, hints are disabled, wrong guesses end the game, and auto-fill is off.',
  },
] as const;

type DifficultyId = (typeof difficulties)[number]['id'];
type ModifierId = (typeof modifiers)[number]['id'];
type OpenMenu = 'difficulty' | 'modifiers' | null;
type ModifierState = Record<ModifierId, boolean>;

type SkinChampionDailyState = {
  items: QuizItem[];
  selectedDifficulty: DifficultyId;
  activeModifiers: ModifierState;
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
  upcomingVisibility: 'clear' | 'blurred' | 'blocked';
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

const CROPPED_INITIAL_ZOOM = 2;
const CROPPED_ZOOM_STEP = 0.25;
const CROPPED_MIN_ZOOM = 1;

function ToggleSwitch({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        checked ? 'border-amber-300/50 bg-amber-300' : 'border-white/10 bg-slate-950'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </span>
  );
}

function getSkinMeta(item?: QuizItem | null) {
  if (!item) {
    return null;
  }

  return [item.champion, item.releaseDate ? `Released ${item.releaseDate}` : null].filter(Boolean);
}

function getCropOrigin(item?: QuizItem | null) {
  const seed = item?.id ?? 'skin';
  let hashA = 0;
  let hashB = 0;

  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    hashA = Math.imul(31, hashA) + code;
    hashB = Math.imul(131, hashB) + code;
  }

  const x = Math.abs(hashA % 101);
  const y = Math.abs(hashB % 101);

  return `${x}% ${y}%`;
}

export function SkinChampion({ multiplayer }: { multiplayer?: MultiplayerGameRuntime }) {
  const multiplayerItems = multiplayer?.items.map((item, index) => ({
    ...item,
    guessed: index < multiplayer.initialProgress,
  }));
  const [items, setItems] = useState<QuizItem[]>(multiplayerItems ?? []);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>((multiplayer?.difficulty as DifficultyId) ?? 'gold');
  const [activeModifiers, setActiveModifiers] = useState<ModifierState>(multiplayer ? createModifierState(multiplayer.modifiers) : defaultModifiers);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [started, setStarted] = useState(Boolean(multiplayer && !multiplayer.gameEnded && multiplayer.initialProgress < multiplayer.items.length));
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [activeIndex, setActiveIndex] = useState(multiplayer ? Math.min(multiplayer.initialProgress, Math.max(0, multiplayer.items.length - 1)) : 0);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(multiplayer?.initialElapsedSeconds ?? 0);
  const [showOptions, setShowOptions] = useState(false);
  const [timeUntilOptions, setTimeUntilOptions] = useState(OPTION_DELAY_SECONDS);
  const [options, setOptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [penaltyMessage, setPenaltyMessage] = useState('');
  const [croppedZoom, setCroppedZoom] = useState(CROPPED_INITIAL_ZOOM);
  const [completedTimes, setCompletedTimes] = useState<Record<string, CompletedTime>>({});
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(multiplayer));
  const [finished, setFinished] = useState(Boolean(multiplayer && (multiplayer.gameEnded || multiplayer.initialProgress >= multiplayer.items.length)));
  const [failed, setFailed] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [pendingConfirmedGuess, setPendingConfirmedGuess] = useState('');
  const [storageReady, setStorageReady] = useState(Boolean(multiplayer));
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => loadPlayerGameStats('skin-champion'));
  const difficultyMenuRef = useRef<HTMLDivElement>(null);
  const modifiersMenuRef = useRef<HTMLDivElement>(null);
  const answerInputAreaRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const hasRestoredStateRef = useRef(false);

  const currentItem = started ? items[activeIndex] ?? null : null;
  const nextItem = started ? items[activeIndex + 1] ?? null : null;
  const afterNextItem = started ? items[activeIndex + 2] ?? null : null;
  const previousItem = activeIndex > 0 ? items[activeIndex - 1] : null;
  const multiplayerRaceEndedEarly = Boolean(multiplayer?.gameEnded && multiplayer.initialProgress < multiplayer.items.length);
  const multiplayerGameEnded = multiplayer?.gameEnded ?? false;
  const multiplayerInitialProgress = multiplayer?.initialProgress;
  const activeModifierCount = Object.values(activeModifiers).filter(Boolean).length;
  const configurationLocked = started || countdown !== null;
  const difficultyRule = difficultyRules[selectedDifficulty];
  const hintsDisabled = difficultyRule.hintDelaySeconds === null;
  const autocompleteEnabled = difficultyRule.autocomplete;
  const shouldHideTimers = activeModifiers.hiddenTimer;
  const shouldRevealChampion = selectedDifficulty === 'iron';
  const completedProgressCount = items.filter((item) => item.guessed).length;

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

  const getSkinImageClassName = (cardLabel: string) => {
    const classes = ['h-full w-full object-contain transition duration-300'];

    if (activeModifiers.greyscale) {
      classes.push('grayscale');
    }

    if (activeModifiers.blurred || (cardLabel === 'Next item' && difficultyRule.upcomingVisibility === 'blurred')) {
      classes.push('blur-sm');
    }

    return classes.join(' ');
  };

  const filteredAnswers = useMemo(
    () => Array.from(new Set(items.map((item) => item.answer))).sort(),
    [items],
  );

  const autocompleteAnswers = useMemo(
    () => (answers.length ? answers : filteredAnswers),
    [answers, filteredAnswers],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!difficultyMenuRef.current?.contains(target) && !modifiersMenuRef.current?.contains(target)) {
        setOpenMenu(null);
      }

      if (!answerInputAreaRef.current?.contains(target)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    fetch('/api/skin-champion/quiz-answers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAnswers(data);
        }
      })
      .catch((error) => {
        console.error('Failed to load skin answer suggestions', error);
      });
  }, []);

  useEffect(() => {
    if (hasRestoredStateRef.current) {
      return;
    }

    hasRestoredStateRef.current = true;
    if (multiplayer) {
      return;
    }
    const savedState = loadDailyGameState<SkinChampionDailyState>('skin-champion');
    if (!savedState) {
      setStorageReady(true);
      return;
    }

    setItems(savedState.items);
    setSelectedDifficulty(savedState.selectedDifficulty);
    setActiveModifiers(savedState.activeModifiers);
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

    saveDailyGameState<SkinChampionDailyState>('skin-champion', {
      items,
      selectedDifficulty,
      activeModifiers,
      started,
      activeIndex,
      currentTime,
      totalTime,
      completedTimes,
      finished,
      failed,
    });
  }, [activeIndex, activeModifiers, completedTimes, currentTime, failed, finished, hasLoadedOnce, items, multiplayer, selectedDifficulty, started, storageReady, totalTime]);

  useEffect(() => {
    if (finished && !multiplayer) {
      setPlayerStats(recordPlayerGameCompletion('skin-champion'));
    }
  }, [finished, multiplayer]);

  useEffect(() => {
    const query = normalizeAnswer(inputValue);
    if (!currentItem || inputValue.trim().length < 3 || !query || !autocompleteEnabled) {
      setSuggestions([]);
      return;
    }

    setSuggestions(autocompleteAnswers.filter((answer) => normalizeAnswer(answer).includes(query)));
  }, [autocompleteAnswers, autocompleteEnabled, currentItem, inputValue]);

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    const answerPool = answers.length ? answers : filteredAnswers;
    const wrongAnswers = shuffle(answerPool.filter((answer) => answer !== currentItem.answer)).slice(0, 9);

    setOptions(shuffle([currentItem.answer, ...wrongAnswers]));
    setShowOptions(false);
    setTimeUntilOptions(difficultyRule.hintDelaySeconds ?? 0);
    setPenaltyCount(0);
    setPenaltyMessage('');
    setCroppedZoom(CROPPED_INITIAL_ZOOM);
    setStatus('idle');
    setInputValue('');
    setSuggestions([]);
    setPendingConfirmedGuess('');
  }, [answers, currentItem, difficultyRule.hintDelaySeconds, filteredAnswers]);

  useEffect(() => {
    if (!started || countdown !== null || !currentItem || finished || showOptions || hintsDisabled) {
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

    const interval = window.setInterval(() => {
      setTimeUntilOptions((value) => Math.max(0, value - 1));
    }, 1000);

    const timeout = window.setTimeout(() => setShowOptions(true), hintDelaySeconds * 1000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [countdown, currentItem, difficultyRule.hintDelaySeconds, finished, hintsDisabled, showOptions, started]);

  useEffect(() => {
    if (multiplayer || !started || hasLoadedOnce) {
      return;
    }

    const loadItems = async () => {
      try {
        const response = await fetch('/api/skin-champion/quiz-items');
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setItems(shuffle(data));
        }
      } catch (error) {
        console.error('Failed to fetch randomized skin set', error);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [hasLoadedOnce, multiplayer, started]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    if (countdown === 0) {
      setStarted(true);
      setCountdown(null);
      return;
    }

    const timeout = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [countdown]);

  useEffect(() => {
    if (!started || finished || countdown !== null) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTime((value) => value + 1);
      setTotalTime((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [countdown, finished, started]);

  useEffect(() => {
    if (!started || activeIndex === 0) {
      return;
    }

    progressContainerRef.current?.scrollTo({
      top: Math.max(0, Math.floor((activeIndex - 1) / 4) * 86),
      behavior: 'smooth',
    });
  }, [activeIndex, started]);

  const handleTogglePlay = () => {
    if (multiplayer) {
      return;
    }
    if (countdown !== null || (started && !finished)) {
      return;
    }

    setCurrentTime(0);
    setTotalTime(0);
    setActiveIndex(0);
    setFinished(false);
    setFailed(false);
    setPenaltyMessage('');
    setPendingConfirmedGuess('');
    setHasLoadedOnce(false);
    setItems([]);
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

  const advance = () => {
    const item = items[activeIndex];
    setCompletedTimes((current) => ({
      ...current,
      [item.id]: {
        total: totalTime,
        duration: currentTime,
      },
    }));
    setItems((current) => current.map((candidate, index) => (index === activeIndex ? { ...candidate, guessed: true } : candidate)));
    if (activeIndex >= items.length - 1) {
      setSuccessFlash(true);
      window.setTimeout(() => setSuccessFlash(false), 260);
      setInputValue('');
      setSuggestions([]);
      setShowOptions(false);
      setPendingConfirmedGuess('');
      setFinished(true);
      setStarted(false);
      multiplayer?.onProgress(activeIndex + 1, totalTime, 'completed');
      return;
    }

    multiplayer?.onProgress(activeIndex + 1, totalTime, 'active');

    setSuccessFlash(true);
    window.setTimeout(() => setSuccessFlash(false), 260);
    setIsSliding(true);

    window.setTimeout(() => {
      setActiveIndex((value) => Math.min(value + 1, items.length - 1));
      setInputValue('');
      setSuggestions([]);
      setShowOptions(false);
      setPenaltyMessage('');
      setPendingConfirmedGuess('');
      setCurrentTime(0);
      setIsSliding(false);
    }, 600);
  };

  const applyWrongGuess = (wrongOption?: string) => {
    if (activeModifiers.cropped) {
      setCroppedZoom((value) => Math.max(CROPPED_MIN_ZOOM, value - CROPPED_ZOOM_STEP));
    }

    if (difficultyRule.wrongGuess === 'game-over') {
      setFailed(true);
      setStarted(false);
      setStatus('incorrect');
      setPenaltyMessage('Game Over');
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

  const submitGuess = (guess: string) => {
    if (!started || !currentItem || finished) {
      return;
    }

    const normalized = normalizeAnswer(guess);
    if (!normalized) {
      return;
    }

    if (activeModifiers.confirmEntry && pendingConfirmedGuess !== normalized) {
      setPendingConfirmedGuess(normalized);
      setStatus('idle');
      setPenaltyMessage('Submit again to confirm');
      return;
    }

    setPendingConfirmedGuess('');
    setPenaltyMessage('');

    if (normalized === normalizeAnswer(currentItem.answer)) {
      setStatus('correct');
      advance();
      return;
    }

    applyWrongGuess();
    setInputValue('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitGuess(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    submitGuess(suggestion);
  };

  const handleOptionClick = (option: string) => {
    if (!currentItem) {
      return;
    }

    if (normalizeAnswer(option) === normalizeAnswer(currentItem.answer)) {
      advance();
      return;
    }

    applyWrongGuess(option);
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
              <h1 className="text-xl font-semibold text-white">Skin Champion</h1>
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
                    ? 'Multiplayer race in progress'
                    : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <GameInfoMenu title="Skin Champion" steps={[
              'Identify the skin splash art and submit its exact skin name.',
              'Use hints and autocomplete when the selected difficulty allows them.',
              multiplayer ? 'Finish the shared randomized set before your opponents.' : 'Complete the randomized set as quickly as possible.',
            ]} />
            <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100">
              <Flame size={16} className="text-amber-300" />
              {playerStats.currentStreak} day streak
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div ref={difficultyMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu((current) => (current === 'difficulty' ? null : 'difficulty'))}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                        Difficulty changes hint timing, wrong-guess penalties, and auto-fill.
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
                  onClick={() => setOpenMenu((current) => (current === 'modifiers' ? null : 'modifiers'))}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-expanded={openMenu === 'modifiers'}
                >
                  <SlidersHorizontal size={16} className="text-amber-300" />
                  Modifiers
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{activeModifierCount}</span>
                  <ChevronDown size={16} className={openMenu === 'modifiers' ? 'rotate-180 transition' : 'transition'} />
                </button>

                {openMenu === 'modifiers' ? (
                  <div className="absolute right-0 top-14 z-40 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/40">
                    <div className="mb-4 border-b border-white/10 pb-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Modifiers</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Optional rule changes can be selected before the game starts.
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
                    {configurationLocked ? (
                      <p className="mt-3 text-xs text-slate-500">Modifiers are locked while a round is active.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950/90 px-4 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={countdown !== null || (started && !finished) || Boolean(multiplayer)}
            >
              <Play size={16} />
              {countdown !== null ? `Starting in ${countdown}` : started && !finished ? 'In Progress' : 'Play'}
            </button>
          </div>
        </header>

        {multiplayer?.progressPanel}

        <section className="overflow-visible rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
          {afterNextItem?.imageUrl ? (
            <Image
              key={`preload-${afterNextItem.id}`}
              src={afterNextItem.imageUrl}
              alt=""
              width={1215}
              height={717}
              aria-hidden="true"
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
          ) : null}
          <div className="overflow-hidden">
            <div className={`grid gap-4 lg:grid-cols-3 lg:items-start transition-none ${isSliding ? 'animate-carousel-slide' : ''}`}>
              {[
                { label: 'Next item', item: nextItem, fallback: 'Next skin will appear here' },
                { label: 'Current item', item: currentItem, fallback: 'Press Play to reveal the next skin' },
                { label: 'Completed', item: previousItem, fallback: 'Your completed skins appear here' },
              ].map((card) => (
                <div
                  key={card.label}
                  className={`min-w-0 transition ${
                    card.label === 'Current item' && successFlash ? 'rounded-2xl ring-1 ring-emerald-400/40' : ''
                  }`}
                >
                  <div className="mb-3 flex min-h-[4.75rem] flex-col gap-2 px-1 text-slate-400 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em]">{card.label}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {card.label === 'Completed' ? card.item?.answer ?? 'Waiting...' : card.item?.title ?? 'Skin Splash'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400 sm:text-[0.75rem]">
                        {card.label === 'Completed' && getSkinMeta(card.item) ? (
                          getSkinMeta(card.item)?.map((meta, index) => (
                            <span key={meta}>{index === 0 ? meta : `- ${meta}`}</span>
                          ))
                        ) : (
                          <span>{shouldRevealChampion && card.item?.champion ? card.item.champion : 'Champion unknown'}</span>
                        )}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                      {card.label === 'Completed' ? <Check size={14} className="inline text-emerald-300" /> : 'Skin'}
                    </span>
                  </div>
                  <div className="relative flex aspect-[1215/717] w-full items-center justify-center overflow-hidden border-2 border-slate-400/70 bg-slate-950/50 text-white shadow-2xl shadow-black/20">
                    {card.item && card.label === 'Next item' && difficultyRule.upcomingVisibility === 'blocked' ? (
                      <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-4 text-center text-slate-500">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em]">Hidden</p>
                      </div>
                    ) : card.item?.imageUrl ? (
                      <Image
                        key={`${card.label}-${card.item.id}`}
                        src={card.item.imageUrl}
                        alt={card.item.question}
                        width={1215}
                        height={717}
                        className={getSkinImageClassName(card.label)}
                        priority={card.label === 'Current item'}
                        style={{
                          transform:
                            activeModifiers.cropped && card.label !== 'Completed'
                              ? `scale(${card.label === 'Current item' ? croppedZoom : CROPPED_INITIAL_ZOOM})`
                              : undefined,
                          transformOrigin:
                            activeModifiers.cropped && card.label !== 'Completed'
                              ? getCropOrigin(card.item)
                              : undefined,
                          transition: 'transform 240ms ease',
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-950/70 p-4 text-center text-slate-400">
                        <p className="text-sm leading-6">{card.fallback}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`relative z-30 mt-8 flex flex-col gap-4 rounded-3xl border bg-slate-950/80 p-5 shadow-inner shadow-slate-950/40 transition ${
              successFlash ? 'border-emerald-400/40 ring-1 ring-emerald-400/20' : 'border-white/10'
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
                    onClick={() => handleOptionClick(option)}
                    className="min-h-14 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-300/60 hover:bg-slate-800"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : started && hintsDisabled ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
                Hints disabled
              </div>
            ) : started ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
                Hints available in {formatSeconds(timeUntilOptions)}
              </div>
            ) : null}

            <div ref={answerInputAreaRef} className="relative flex flex-col gap-3 sm:flex-row">
              <input
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setStatus('idle');
                  setPendingConfirmedGuess('');
                }}
                name="skin-answer"
                autoComplete="off"
                spellCheck={false}
                disabled={!started || finished}
                placeholder={started ? 'Type the skin name' : 'Press Play to begin'}
                onFocus={() => {
                  const query = normalizeAnswer(inputValue);
                  if (!currentItem || inputValue.trim().length < 3 || !query || !autocompleteEnabled) {
                    return;
                  }

                  setSuggestions(autocompleteAnswers.filter((answer) => normalizeAnswer(answer).includes(query)));
                }}
                className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/10 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {suggestions.length > 0 && autocompleteEnabled ? (
                <div className="absolute left-0 top-full z-50 mt-2 grid max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50 sm:w-[calc(100%-8rem)]">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={!started || finished}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ThumbsUp size={16} />
                {activeModifiers.confirmEntry && pendingConfirmedGuess ? 'Confirm' : 'Submit'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              {!shouldHideTimers ? (
                <>
                  <span>Total time: <span className="text-white">{formatSeconds(totalTime)}</span></span>
                  <span className="hidden h-3 w-3 rounded-full bg-slate-500 sm:inline-block" />
                  <span>Current item: <span className="text-white">{formatSeconds(currentTime)}</span></span>
                </>
              ) : (
                <span>Timer hidden</span>
              )}
              {status === 'incorrect' ? <span className="font-semibold text-red-300">Incorrect</span> : null}
              {penaltyMessage ? <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-300">{penaltyMessage}</span> : null}
              {activeModifiers.confirmEntry && pendingConfirmedGuess ? (
                <span className="font-semibold text-amber-300">Submit again to confirm</span>
              ) : null}
            </div>
          </form>

          <section className="relative z-0 mt-8 rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm uppercase tracking-[0.24em] text-slate-500">Round progress</h2>
              <div className="flex items-center gap-3">
                {multiplayerGameEnded ? <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Race Ended</span> : null}
                <span className="text-xs text-slate-500">{completedProgressCount}/{items.length}</span>
              </div>
            </div>
            <div ref={progressContainerRef} className="grid max-h-72 gap-3 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => {
                const completed = item.guessed || index < activeIndex;
                const active = started && index === activeIndex && !finished;
                const time = completedTimes[item.id];

                return (
                  <div
                    key={item.id}
                    className={`min-h-20 rounded-2xl border p-4 text-sm ${
                      active
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : completed
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-950/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`h-11 w-11 shrink-0 overflow-hidden border ${
                            completed ? 'border-slate-400/70' : 'border-white/10'
                          }`}
                        >
                          <Image
                            src={item.imageUrl}
                            alt=""
                            width={44}
                            height={44}
                            className={`h-full w-full object-cover ${completed ? '' : 'blur-sm brightness-75 scale-105'}`}
                          />
                        </span>
                        <span className="truncate font-semibold text-white">{completed ? item.answer : '???'}</span>
                      </div>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] uppercase text-slate-300">
                        {active ? 'Now' : completed ? 'Done' : 'Next'}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      {time ? `${formatSeconds(time.total)} - ${formatSeconds(time.duration)}` : 'TBD - TBD'}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
