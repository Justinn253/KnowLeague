'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Play, ThumbsUp } from 'lucide-react';
import Image from 'next/image';
import {
  formatSeconds,
  getAbilityKeyLabel,
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
    id: 'sample-spell',
    type: 'spell',
    title: 'Ability Icon',
    question: 'Guess the ability',
    answer: 'Steel Tempest',
    imageUrl: '',
    champion: 'Yasuo',
  },
];

export function GameScreen() {
  const [items, setItems] = useState<QuizItem[]>(placeholderItems);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseQueued, setPauseQueued] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [timeUntilOptions, setTimeUntilOptions] = useState(10);
  const [options, setOptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [categoryAnswers, setCategoryAnswers] = useState<Record<string, string[]>>({});
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [penaltyMessage, setPenaltyMessage] = useState('');
  const [completedTimes, setCompletedTimes] = useState<Record<string, CompletedTime>>({});
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [finished, setFinished] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [timeToNextSet, setTimeToNextSet] = useState('00:00:00');
  const progressSectionRef = useRef<HTMLDivElement | null>(null);
  const currentProgressItemRef = useRef<HTMLDivElement | null>(null);

  const currentItem = items[activeIndex];
  const nextItem = items[activeIndex + 1];
  const previousItem = items[activeIndex - 1];

  const progressList = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        state: index === activeIndex ? 'current' : index < activeIndex ? 'completed' : 'pending',
      })),
    [items, activeIndex],
  );

  useEffect(() => {
    if (!started || paused || countdown !== null || finished) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime((value) => value + 1);
      setTotalTime((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [started, paused, countdown, finished]);

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
    setTimeUntilOptions(OPTION_DELAY_SECONDS);

    const answerPool = categoryAnswers['all']?.length
      ? categoryAnswers['all']
      : items.map((item) => item.answer);

    const wrongAnswers = shuffle(answerPool.filter((answer) => answer !== currentItem.answer)).slice(0, 9);
    setOptions(shuffle([currentItem.answer, ...wrongAnswers]));
  }, [currentItem, items, categoryAnswers]);

  useEffect(() => {
    if (!started || paused || countdown !== null || !currentItem || showOptions) {
      return;
    }

    setTimeUntilOptions(OPTION_DELAY_SECONDS);
    setShowOptions(false);

    const interval = window.setInterval(() => {
      setTimeUntilOptions((value) => Math.max(0, value - 1));
    }, 1000);

    const timeout = window.setTimeout(() => setShowOptions(true), OPTION_DELAY_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [activeIndex, started, paused, countdown, currentItem, showOptions]);

  useEffect(() => {
    if (categoryAnswers['all']?.length) {
      return;
    }

    fetch(`/api/ddragon/quiz-answers`)
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
    const query = normalizeAnswer(inputValue);
    if (!currentItem || !query) {
      setSuggestions([]);
      return;
    }

    const candidateAnswers = categoryAnswers['all']?.length
      ? categoryAnswers['all']
      : Array.from(new Set(items.map((item) => item.answer)));

    const matches = candidateAnswers
      .filter((answer) => normalizeAnswer(answer).includes(query))
      .slice(0, 8);
    setSuggestions(matches);
  }, [inputValue, currentItem, items, categoryAnswers]);

  useEffect(() => {
    if (!started || hasLoadedOnce) {
      return;
    }

    const loadItems = async () => {
      try {
        const res = await fetch('/api/ddragon/quiz-items');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setItems(shuffle(data));
        }
      } catch (err) {
        console.error('Failed to fetch daily set', err);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [started, hasLoadedOnce]);

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

    currentProgressItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeIndex]);

  useEffect(() => {
    if (status === 'incorrect' || status === 'correct') {
      const timeout = window.setTimeout(() => setStatus('idle'), 600);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [status]);

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
    if (isFinalItem) {
      setFinished(true);
      setStarted(false);
      setPauseQueued(false);
      return;
    }

    if (pauseQueued) {
      setPaused(true);
      setPauseQueued(false);
      return;
    }

    setTimeout(handleAdvance, 300);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentItem) {
      return;
    }

    const normalized = normalizeAnswer(inputValue);
    if (!normalized) {
      return;
    }

    if (normalized === normalizeAnswer(currentItem.answer)) {
      handleCorrectGuess();
    } else {
      setStatus('incorrect');
      setInputValue('');
      setPenaltyMessage('');
    }
  };

  const applyOption = (option: string) => {
    if (!currentItem) {
      return;
    }

    if (option.toLowerCase() === currentItem.answer.toLowerCase()) {
      handleCorrectGuess();
      return;
    }

    const penalty = PENALTY_TIMES_SECONDS[Math.min(penaltyCount, PENALTY_TIMES_SECONDS.length - 1)];
    setPenaltyCount((count) => count + 1);
    setCurrentTime((value) => value + penalty);
    setTotalTime((value) => value + penalty);
    setPenaltyMessage(`+${penalty}s`);
    setStatus('incorrect');
    setOptions((current) => current.filter((answer) => answer !== option));
    window.setTimeout(() => setPenaltyMessage(''), 1200);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setInputValue(suggestion);
    setSuggestions([]);

    if (currentItem && normalizeAnswer(suggestion) === normalizeAnswer(currentItem.answer)) {
      handleCorrectGuess();
    }
  };

  useEffect(() => {
    const getNextReset = () => {
      setTimeToNextSet(getNextUtcResetLabel());
    };

    getNextReset();
    const interval = window.setInterval(getNextReset, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleTogglePlay = () => {
    if (countdown !== null) {
      return;
    }

    if (started && !paused) {
      setPauseQueued(true);
      return;
    }

    if (started && paused) {
      setPaused(false);
      setPauseQueued(false);
      handleAdvance();
      return;
    }

    setCurrentTime(0);
    setTotalTime(0);
    setActiveIndex(0);
    setPaused(false);
    setPauseQueued(false);
    setFinished(false);
    setHasLoadedOnce(false);
    setItems(placeholderItems);
    setCountdown(3);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:px-12">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Game mode</p>
              <h1 className="text-xl font-semibold text-white">League Quiz Arena</h1>
              <p className="mt-1 text-xs text-slate-400">
                {finished ? `Completed in ${formatSeconds(totalTime)}` : `Daily set resets in ${timeToNextSet}`}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950/90 px-4 py-3 text-sm font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-900"
              disabled={countdown !== null}
            >
              <Play size={16} />
              {countdown !== null
                ? `Starting in ${countdown}`
                : paused
                ? 'Continue'
                : pauseQueued
                ? 'Pause Queued'
                : started
                ? 'Pause'
                : 'Play'}
            </button>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl overflow-hidden">
          <div className={`grid gap-4 lg:grid-cols-3 lg:items-center transition-none ${isSliding ? 'animate-carousel-slide' : ''}`}>
            {/* Next Item Card */}
            <div className="rounded-[2.5rem] border border-slate-700/50 bg-slate-950/80 p-8 shadow-lg">
              <div className="mb-5 flex flex-col gap-2 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em]">Next item</p>
                  <p className="mt-1 text-sm text-slate-300">{nextItem?.title || 'Upcoming'}</p>
                </div>
                <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {nextItem?.type || '???'}
                </span>
              </div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                <div className="absolute inset-0 bg-grid-slate opacity-10" />
                <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                  {nextItem ? (
                    <div className="flex h-36 w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800/90 p-4 shadow-inner shadow-slate-950/60">
                      {nextItem.imageUrl ? (
                        <Image
                          src={nextItem.imageUrl}
                          alt={nextItem.question}
                          width={96}
                          height={96}
                          className="h-24 w-24 rounded-3xl object-cover opacity-50 blur-sm"
                        />
                      ) : (
                        <span className="text-4xl opacity-30">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-36 w-full max-w-xs items-center justify-center rounded-3xl bg-slate-800/80 p-4 text-center text-slate-400">
                      <p className="text-sm leading-6">Next item will appear here</p>
                    </div>
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
              <div className="mb-5 flex flex-col gap-2 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em]">Current item</p>
                  <p className="mt-1 text-sm text-slate-300">{currentItem?.title}</p>
                </div>
                <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {currentItem?.type}
                </span>
              </div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900/90 text-white shadow-2xl shadow-black/20">
                <div className="absolute inset-0 bg-grid-slate opacity-10" />
                <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                  {started && currentItem ? (
                    <div className="flex h-36 w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800/90 p-4 shadow-inner shadow-slate-950/60">
                      {currentItem.imageUrl ? (
                        <Image
                          src={currentItem.imageUrl}
                          alt={currentItem.question}
                          width={96}
                          height={96}
                          className="h-24 w-24 rounded-3xl object-cover"
                        />
                      ) : (
                        <span className="text-4xl">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-36 w-full max-w-xs items-center justify-center rounded-3xl bg-slate-800/80 p-4 text-center text-slate-400">
                      <p className="text-sm leading-6">Press Play to reveal the next ability.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Previous Item Card */}
            <div className="rounded-[2.5rem] border border-emerald-500/20 bg-slate-950/80 p-8 shadow-lg">
              <div className="mb-5 flex flex-col gap-2 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em]">Completed</p>
                  <p className="mt-1 text-sm text-slate-300">{previousItem?.answer ?? 'Waiting...'}</p>
                  {previousItem ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400 sm:text-[0.75rem]">
                      <span>{previousItem.champion}</span>
                      <span>-</span>
                      <span>{getAbilityKeyLabel(previousItem)}</span>
                    </div>
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
                        <Image
                          src={previousItem.imageUrl}
                          alt={previousItem.question}
                          width={96}
                          height={96}
                          className="h-24 w-24 rounded-3xl object-cover"
                        />
                      ) : (
                        <span className="text-4xl">?</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-36 w-full max-w-xs items-center justify-center rounded-3xl bg-slate-800/80 p-4 text-center text-slate-400">
                      <p className="text-sm leading-6">Your completed items appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`mt-8 flex flex-col gap-4 rounded-3xl border p-5 bg-slate-950/80 shadow-inner shadow-slate-950/40 transition ${
              successFlash
                ? 'border-emerald-400/40 ring-1 ring-emerald-400/20 shadow-emerald-500/10'
                : 'border-white/10'
            }`}
          >
            {started && showOptions && options.length > 0 ? (
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
            ) : started ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-400">
                Answers appear in <span className="font-semibold text-slate-100">{timeUntilOptions}s</span>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-400">
                Press Play to begin and reveal the first ability.
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="guess-input">
                Enter answer
              </label>
              <div className="relative flex-1">
                <input
                  id="guess-input"
                  name="quiz-answer"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={started ? 'Type your guess here' : 'Press Play to start'}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
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
                {suggestions.length > 0 && started ? (
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
                Submit
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>Total time: <span className="text-white">{formatSeconds(totalTime)}</span></span>
              <span className="hidden h-3 w-3 rounded-full bg-slate-500 sm:inline-block" />
              <span>Current item: <span className="text-white">{formatSeconds(currentTime)}</span></span>
              {penaltyMessage ? <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-300">{penaltyMessage}</span> : null}
            </div>
          </form>

          <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <h2 className="mb-4 text-sm uppercase tracking-[0.24em] text-slate-500">Round progress</h2>
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
                      className={`rounded-3xl border p-4 transition ${itemClass}`}
                    >
                      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-100">
                        <span>{item.guessed ? item.answer : '???'}</span>
                        {item.state === 'current' ? (
                          <span className="rounded-full bg-slate-900/80 px-2 py-1 text-xs text-slate-300">Now</span>
                        ) : item.state === 'completed' ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">Done</span>
                        ) : (
                          <span className="rounded-full bg-slate-800/80 px-2 py-1 text-xs text-slate-500">Next</span>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        {item.state === 'current'
                          ? formatSeconds(currentTime)
                          : item.state === 'completed' && completedTimes[item.id]
                          ? `${formatSeconds(completedTimes[item.id].total)} - ${formatSeconds(completedTimes[item.id].duration)}`
                          : item.state === 'completed'
                          ? 'Completed'
                          : 'TBD - TBD'}
                      </p>
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
