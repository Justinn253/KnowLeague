'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Play, SlidersHorizontal, ThumbsUp, Trophy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  formatSeconds,
  getNextUtcResetLabel,
  normalizeAnswer,
  OPTION_DELAY_SECONDS,
  PENALTY_TIMES_SECONDS,
  shuffle,
  type CompletedTime,
  type QuizItem,
} from '@/lib/quiz';

const placeholderItems: QuizItem[] = [
  {
    id: 'sample-skin',
    type: 'skin',
    title: 'Skin Splash',
    question: 'Guess the skin',
    answer: 'Arcade Ezreal',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Ezreal.png',
    champion: 'Ezreal',
    releaseDate: null,
  },
];

const modifiers = [
  { id: 'greyscale', name: 'Greyscale', description: 'Splash art appears in greyscale.' },
  { id: 'blurred', name: 'Blurred', description: 'Splash art starts blurred.' },
  { id: 'cropped', name: 'Cropped', description: 'Only a cropped section is shown.' },
  { id: 'hiddenTimer', name: 'Hidden Timer', description: 'Timer no longer displays.' },
  { id: 'confirmEntry', name: 'Confirm Entry', description: 'Guesses require a second submit or Enter press.' },
] as const;

const difficulties = [
  {
    id: 'iron',
    name: 'Iron',
    description: 'Hints appear instantly, wrong guesses add no time, and auto-fill is active.',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Hints appear after 10 seconds, wrong guesses add 5 seconds, and auto-fill is active.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Hints appear after 30 seconds, wrong guesses scale upward, and auto-fill is active.',
  },
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Hints are disabled, wrong guesses end the game, and auto-fill is off.',
  },
] as const;

type DifficultyId = (typeof difficulties)[number]['id'];
type ModifierId = (typeof modifiers)[number]['id'];
type OpenMenu = 'difficulty' | 'modifiers' | null;
type ModifierState = Record<ModifierId, boolean>;

type DifficultyRule = {
  hintDelaySeconds: number | null;
  wrongGuess: 'none' | 'flat-five' | 'scaled' | 'game-over';
  autocomplete: boolean;
};

const difficultyRules: Record<DifficultyId, DifficultyRule> = {
  iron: {
    hintDelaySeconds: 0,
    wrongGuess: 'none',
    autocomplete: true,
  },
  gold: {
    hintDelaySeconds: 10,
    wrongGuess: 'flat-five',
    autocomplete: true,
  },
  diamond: {
    hintDelaySeconds: 30,
    wrongGuess: 'scaled',
    autocomplete: true,
  },
  challenger: {
    hintDelaySeconds: null,
    wrongGuess: 'game-over',
    autocomplete: false,
  },
};

const defaultModifiers = modifiers.reduce(
  (state, modifier) => ({ ...state, [modifier.id]: false }),
  {} as ModifierState,
);

const CROPPED_INITIAL_ZOOM = 2.1;
const CROPPED_ZOOM_STEP = 0.35;
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

export function SkinChampion() {
  const [items, setItems] = useState<QuizItem[]>(placeholderItems);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>('gold');
  const [activeModifiers, setActiveModifiers] = useState<ModifierState>(defaultModifiers);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [started, setStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [timeUntilOptions, setTimeUntilOptions] = useState(OPTION_DELAY_SECONDS);
  const [options, setOptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [penaltyMessage, setPenaltyMessage] = useState('');
  const [croppedZoom, setCroppedZoom] = useState(CROPPED_INITIAL_ZOOM);
  const [completedTimes, setCompletedTimes] = useState<Record<string, CompletedTime>>({});
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [pendingConfirmedGuess, setPendingConfirmedGuess] = useState('');
  const [timeToNextSet, setTimeToNextSet] = useState('00:00:00');
  const difficultyMenuRef = useRef<HTMLDivElement>(null);
  const modifiersMenuRef = useRef<HTMLDivElement>(null);
  const answerInputAreaRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  const currentItem = started ? items[activeIndex] : null;
  const nextItem = started ? items[activeIndex + 1] : null;
  const previousItem = activeIndex > 0 ? items[activeIndex - 1] : null;
  const selectedDifficultyName = difficulties.find((difficulty) => difficulty.id === selectedDifficulty)?.name;
  const activeModifierCount = Object.values(activeModifiers).filter(Boolean).length;
  const configurationLocked = started || countdown !== null;
  const difficultyRule = difficultyRules[selectedDifficulty];
  const hintsDisabled = difficultyRule.hintDelaySeconds === null;
  const autocompleteEnabled = difficultyRule.autocomplete;
  const shouldHideTimers = activeModifiers.hiddenTimer;

  const itemClassName = 'h-full w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10';

  const filteredAnswers = useMemo(
    () => Array.from(new Set(items.map((item) => item.answer))).sort(),
    [items],
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
    const query = normalizeAnswer(inputValue);
    if (!currentItem || !query || !autocompleteEnabled) {
      setSuggestions([]);
      return;
    }

    const pool = answers.length ? answers : filteredAnswers;
    setSuggestions(pool.filter((answer) => normalizeAnswer(answer).includes(query)).slice(0, 8));
  }, [answers, autocompleteEnabled, currentItem, filteredAnswers, inputValue]);

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
    if (!started || hasLoadedOnce) {
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
        console.error('Failed to fetch daily skin set', error);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [hasLoadedOnce, started]);

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
    const getNextReset = () => setTimeToNextSet(getNextUtcResetLabel());

    getNextReset();
    const interval = window.setInterval(getNextReset, 1000);
    return () => window.clearInterval(interval);
  }, []);

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
      return;
    }

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
            <Link
              href="/"
              aria-label="Back to game hub"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Game mode</p>
              <h1 className="text-xl font-semibold text-white">Skin Champion</h1>
              <p className="mt-1 text-xs text-slate-400">
                {failed
                  ? 'Game over'
                  : finished
                  ? shouldHideTimers
                    ? 'Completed'
                    : `Completed in ${formatSeconds(totalTime)}`
                  : `Daily set resets in ${timeToNextSet}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
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
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    {selectedDifficultyName}
                  </span>
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
                                ? 'border-amber-300/60 bg-amber-300/10'
                                : 'border-white/10 bg-slate-900/80 hover:border-white/25'
                            } ${configurationLocked ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-white">{difficulty.name}</span>
                              <span className={`h-3 w-3 rounded-full border ${isSelected ? 'border-amber-300 bg-amber-300' : 'border-slate-500'}`} />
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
              disabled={countdown !== null || (started && !finished)}
            >
              <Play size={16} />
              {countdown !== null ? `Starting in ${countdown}` : started && !finished ? 'In Progress' : 'Play'}
            </button>
          </div>
        </header>

        <section className="overflow-visible rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          <div className={`grid gap-4 lg:grid-cols-3 lg:items-center transition-none ${isSliding ? 'animate-carousel-slide' : ''}`}>
            {[
              { label: 'Next item', item: nextItem, fallback: 'Next skin will appear here' },
              { label: 'Current item', item: currentItem, fallback: 'Press Play to reveal the next skin' },
              { label: 'Completed', item: previousItem, fallback: 'Your completed skins appear here' },
            ].map((card) => (
              <div
                key={card.label}
                className={`rounded-[2.5rem] border bg-slate-950/80 p-8 shadow-lg ${
                  card.label === 'Current item' && successFlash
                    ? 'border-emerald-400/40 ring-1 ring-emerald-400/20'
                    : card.label === 'Completed'
                    ? 'border-emerald-500/20'
                    : 'border-slate-700/50'
                }`}
              >
                <div className="mb-5 flex flex-col gap-2 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em]">{card.label}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {card.label === 'Completed' ? card.item?.answer ?? 'Waiting...' : card.item?.title ?? 'Skin Splash'}
                    </p>
                    {card.label === 'Completed' && getSkinMeta(card.item) ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400 sm:text-[0.75rem]">
                        {getSkinMeta(card.item)?.map((meta, index) => (
                          <span key={meta}>{index === 0 ? meta : `- ${meta}`}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                    {card.label === 'Completed' ? <Check size={14} className="inline text-emerald-300" /> : 'Skin'}
                  </span>
                </div>
                <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                  <div className="absolute inset-0 bg-grid-slate opacity-10" />
                  <div className="relative z-10 flex h-full w-full items-center justify-center px-2">
                    {card.item?.imageUrl ? (
                      <Image
                        src={card.item.imageUrl}
                        alt={card.item.question}
                        width={1215}
                        height={717}
                        className={itemClassName}
                        priority={card.label === 'Current item'}
                        style={{
                          transform:
                            card.label === 'Current item' && activeModifiers.cropped
                              ? `scale(${croppedZoom})`
                              : undefined,
                          transition: 'transform 240ms ease',
                        }}
                      />
                    ) : (
                      <div className="flex h-36 w-full max-w-xs items-center justify-center rounded-3xl bg-slate-800/80 p-4 text-center text-slate-400">
                        <p className="text-sm leading-6">{card.fallback}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSubmit}
            className={`relative z-20 mt-8 flex flex-col gap-4 rounded-3xl border bg-slate-950/80 p-5 shadow-inner shadow-slate-950/40 transition ${
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
                className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {suggestions.length > 0 && autocompleteEnabled ? (
                <div className="absolute left-0 top-full z-30 mt-2 grid max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50 sm:w-[calc(100%-8rem)]">
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {!shouldHideTimers ? (
                <>
                  <span>Total time: {formatSeconds(totalTime)}</span>
                  <span className="h-2 w-2 rounded-full bg-slate-700" />
                  <span>Current item: {formatSeconds(currentTime)}</span>
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
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Round progress</p>
            <span className="text-xs text-slate-500">{Math.min(activeIndex + (finished ? 1 : 0), items.length)}/{items.length}</span>
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
                      <Image
                        src={item.imageUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                      />
                      <span className="truncate font-semibold text-white">{completed ? item.answer : '???'}</span>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] uppercase text-slate-300">
                      {active ? 'Now' : completed ? 'Done' : 'Next'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">{time ? formatSeconds(time.duration) : 'TBD'}</p>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
