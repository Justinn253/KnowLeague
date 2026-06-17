'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ChevronDown, Flame, Search, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  getOrCreateClientId,
  loadDailyGameState,
  loadPlayerGameStats,
  recordPlayerGameCompletion,
  saveDailyGameState,
  type PlayerGameStats,
} from '@/lib/game-storage';
import { getNextUtcResetLabel, normalizeAnswer, type QuizItem } from '@/lib/quiz';

const categories = [
  { id: 'champion', label: 'Champion' },
  { id: 'skinLine', label: 'Skin Line' },
  { id: 'releaseYear', label: 'Release Year' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'gender', label: 'Gender' },
  { id: 'role', label: 'Role' },
  { id: 'race', label: 'Species' },
] as const;

const SKINDLE_REVEAL_DURATION_MS = 1170;

type CategoryId = (typeof categories)[number]['id'];

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

export function Skindle() {
  const [skins, setSkins] = useState<QuizItem[]>([]);
  const [target, setTarget] = useState<QuizItem | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<QuizItem[]>([]);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [message, setMessage] = useState('');
  const [timeToNextSet, setTimeToNextSet] = useState('00:00:00');
  const [revealedSolvedGuessId, setRevealedSolvedGuessId] = useState<string | null>(null);
  const [previewSkin, setPreviewSkin] = useState<QuizItem | null>(null);
  const [dailyStats, setDailyStats] = useState<SkindleDailyStats | null>(null);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [playerStatsMenuOpen, setPlayerStatsMenuOpen] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => loadPlayerGameStats('skindle'));
  const [clientId, setClientId] = useState<string | null>(null);
  const [firstGlobalGuessSkinIds, setFirstGlobalGuessSkinIds] = useState<Set<string>>(() => new Set());
  const [storageReady, setStorageReady] = useState(false);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const guessesPanelRef = useRef<HTMLDivElement>(null);
  const topGuessesMenuRef = useRef<HTMLDivElement>(null);
  const playerStatsMenuRef = useRef<HTMLDivElement>(null);
  const hasRestoredStateRef = useRef(false);

  const solved = Boolean(target && guesses.some((guess) => guess.item.id === target.id));
  const answerPool = useMemo(() => skins.filter((skin) => !guesses.some((guess) => guess.item.id === skin.id)), [guesses, skins]);
  const averageGuessesLabel = dailyStats?.averageGuessesToSolve
    ? dailyStats.averageGuessesToSolve.toFixed(1)
    : '0.0';
  const skinsById = useMemo(
    () => new Map(skins.map((skin) => [skin.id, skin])),
    [skins],
  );
  const mostGuessedSkin = useMemo(
    () =>
      Object.values(playerStats.guessStats).sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))[0] ??
      null,
    [playerStats.guessStats],
  );
  const averagePlayerGuesses = playerStats.gamesCompleted > 0
    ? (playerStats.totalGuesses / playerStats.gamesCompleted).toFixed(1)
    : '0.0';

  const refreshDailyStats = (includeTopGuesses = false) => {
    fetch(`/api/skindle/stats?includeTop=${includeTopGuesses ? 'true' : 'false'}`)
      .then((response) => response.json())
      .then((data) => setDailyStats(data))
      .catch((error) => {
        console.error('Failed to load Skindle stats', error);
      });
  };

  useEffect(() => {
    setClientId(getOrCreateClientId());

    Promise.all([
      fetch('/api/skindle/skins').then((response) => response.json()),
      fetch('/api/skindle/target').then((response) => response.json()),
    ])
      .then(([skinData, targetData]) => {
        if (Array.isArray(skinData)) {
          setSkins(skinData);
        }

        if (targetData?.id) {
          setTarget(targetData);
        }
      })
      .catch((error) => {
        console.error('Failed to load Skindle data', error);
        setMessage('Unable to load Skindle data.');
      });

    refreshDailyStats(false);
  }, []);

  useEffect(() => {
    if (hasRestoredStateRef.current || skins.length === 0 || !target) {
      return;
    }

    hasRestoredStateRef.current = true;
    const savedState = loadDailyGameState<SkindleDailyState>('skindle');
    if (!savedState) {
      setStorageReady(true);
      return;
    }

    const restoredGuesses = savedState.guessIds
      .map((guessId) => skins.find((skin) => skin.id === guessId))
      .filter((skin): skin is QuizItem => Boolean(skin))
      .map((skin) => compareGuess(skin, target));

    setGuesses(restoredGuesses);
    setRevealedSolvedGuessId(savedState.solvedGuessId);
    setFirstGlobalGuessSkinIds(new Set(savedState.firstGlobalGuessSkinIds ?? []));
    setStorageReady(true);
  }, [skins, target]);

  useEffect(() => {
    if (!storageReady || (guesses.length === 0 && !revealedSolvedGuessId)) {
      return;
    }

    saveDailyGameState<SkindleDailyState>('skindle', {
      guessIds: guesses.map((guess) => guess.item.id),
      solvedGuessId: revealedSolvedGuessId,
      firstGlobalGuessSkinIds: Array.from(firstGlobalGuessSkinIds),
    });
  }, [firstGlobalGuessSkinIds, guesses, revealedSolvedGuessId, storageReady]);

  useEffect(() => {
    if (storageReady && solved) {
      refreshDailyStats(true);
    }
  }, [solved, storageReady]);

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

  useEffect(() => {
    const updateReset = () => setTimeToNextSet(getNextUtcResetLabel());

    updateReset();
    const interval = window.setInterval(updateReset, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const query = normalizeAnswer(inputValue);
    if (inputValue.trim().length < 2 || !query || solved) {
      setSuggestions([]);
      return;
    }

    setSuggestions(answerPool.filter((skin) => normalizeAnswer(skin.answer).includes(query)));
  }, [answerPool, inputValue, solved]);

  useEffect(() => {
    if (guesses.length === 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      guessesPanelRef.current?.scrollTo({
        top: guessesPanelRef.current.scrollHeight,
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
      setPlayerStats(
        recordPlayerGameCompletion(
          'skindle',
          guesses.map((guess) => ({
            itemId: guess.item.id,
            answer: guess.item.answer,
            imageUrl: guess.item.imageUrl,
          })),
        ),
      );
      refreshDailyStats(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, SKINDLE_REVEAL_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [guesses, revealedSolvedGuessId, target]);

  const submitGuess = (skin: QuizItem | undefined) => {
    if (!skin || !target || solved) {
      return;
    }

    if (guesses.some((guess) => guess.item.id === skin.id)) {
      setMessage('Already guessed.');
      return;
    }

    const result = compareGuess(skin, target);
    setGuesses((current) => [...current, result]);
    setInputValue('');
    setSuggestions([]);
    setMessage(skin.id === target.id ? 'Solved.' : '');

    if (clientId) {
      fetch('/api/skindle/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          skinId: skin.id,
          answer: skin.answer,
          isCorrect: skin.id === target.id,
        }),
      })
        .then((response) => response.json())
        .then((data: RecordSkindleGuessResponse) => {
          if (data.snapshot) {
            setDailyStats(data.snapshot);
          }

          if (data.firstForSkin) {
            setFirstGlobalGuessSkinIds((current) => new Set(current).add(skin.id));
          }
        })
        .catch((error) => {
          console.error('Failed to record Skindle guess', error);
        });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAnswer(inputValue);
    const exact = answerPool.find((skin) => normalizeAnswer(skin.answer) === normalized);

    if (!exact) {
      setMessage('Choose a skin from the list.');
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
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Game mode</p>
              <h1 className="text-xl font-semibold text-white">Skindle</h1>
              <p className="mt-1 text-xs text-slate-400">
                {solved ? `Solved in ${guesses.length}` : `Daily skin resets in ${timeToNextSet}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-200">
              <Flame size={16} className="text-amber-300" />
              {playerStats.currentStreak} day streak
            </div>

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
                <div className="absolute right-0 top-14 z-50 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Completed</p>
                      <p className="mt-2 text-xl font-semibold text-white">{playerStats.gamesCompleted}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg Guesses</p>
                      <p className="mt-2 text-xl font-semibold text-white">{averagePlayerGuesses}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Most Guessed Skin</p>
                      {mostGuessedSkin ? (
                        <div className="mt-3 flex items-center gap-3">
                          {mostGuessedSkin.imageUrl ? (
                            <Image
                              src={mostGuessedSkin.imageUrl}
                              alt=""
                              width={96}
                              height={57}
                              className="aspect-[1215/717] w-20 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{mostGuessedSkin.answer}</p>
                            <p className="mt-1 text-xs text-slate-400">{mostGuessedSkin.count} guesses</p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No guesses yet.</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">First Guessed Skin</p>
                      {playerStats.firstGuess ? (
                        <div className="mt-3 flex items-center gap-3">
                          {playerStats.firstGuess.imageUrl ? (
                            <Image
                              src={playerStats.firstGuess.imageUrl}
                              alt=""
                              width={96}
                              height={57}
                              className="aspect-[1215/717] w-20 shrink-0 object-cover ring-1 ring-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{playerStats.firstGuess.answer}</p>
                            <p className="mt-1 text-xs text-slate-400">{playerStats.firstGuess.dateKey}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No guesses yet.</p>
                      )}
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
              <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-72 rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50">
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
                            <Image
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
              {solved ? (
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
                <Image
                  src={target.imageUrl}
                  alt={target.answer}
                  width={1215}
                  height={717}
                  className="aspect-[1215/717] w-full object-contain"
                  priority
                />
              </button>
            ) : null}

            <div className="overflow-x-auto">
              <div className="w-full min-w-[58rem]">
                <div className="grid grid-cols-[minmax(8.5rem,1.35fr)_repeat(7,minmax(5.5rem,1fr))] gap-2 pl-1 pr-3 pb-3 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
                  <div className="text-left">Guess</div>
                  {categories.map((category) => (
                    <div key={category.id}>{category.label}</div>
                  ))}
                </div>

                <div ref={guessesPanelRef} className="max-h-[34rem] overflow-y-auto pr-2">
                  {guesses.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-center text-sm text-slate-500">
                      Your guesses will appear here.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {guesses.map((guess, index) => {
                        const isLatestGuess = index === guesses.length - 1;
                        const isCorrectGuess = target?.id === guess.item.id;

                        return (
                          <div
                            key={guess.item.id}
                            className={`relative overflow-hidden rounded-xl ${
                              isLatestGuess ? 'animate-slide-in' : ''
                            } ${
                              isCorrectGuess && revealedSolvedGuessId === guess.item.id
                                ? 'skindle-gradient-border shadow-lg shadow-violet-950/30'
                                : ''
                            }`}
                          >
                            <div
                              className={`grid grid-cols-[minmax(8.5rem,1.35fr)_repeat(7,minmax(5.5rem,1fr))] gap-2 ${
                                isCorrectGuess && revealedSolvedGuessId === guess.item.id ? 'skindle-gradient-border-content' : ''
                              }`}
                            >
                              <div
                                className={`flex min-h-28 flex-col items-center justify-between rounded-lg border px-2 py-3 text-center shadow-inner ${
                                  isCorrectGuess
                                    ? 'border-slate-300/70 bg-[#00c800] text-white shadow-lime-950/30'
                                    : 'border-slate-300/70 bg-red-500/85 text-white shadow-red-950/30'
                                }`}
                              >
                                <span className="line-clamp-2 text-base font-semibold leading-5">{guess.item.answer}</span>
                                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-white/80">
                                  {(dailyStats?.guessesBySkin[guess.item.id] ?? 0) > 1 ? (
                                    `${dailyStats?.guessesBySkin[guess.item.id] ?? 0} global guesses`
                                  ) : null}
                                  {(dailyStats?.guessesBySkin[guess.item.id] ?? 0) === 1 || firstGlobalGuessSkinIds.has(guess.item.id) ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-slate-950">
                                      <Sparkles size={11} />
                                      First
                                    </span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewSkin(guess.item)}
                                  className="mt-2 w-full cursor-zoom-in ring-1 ring-white/30 transition hover:ring-white/70"
                                  aria-label={`Open ${guess.item.answer} splash art`}
                                >
                                  <Image
                                    src={guess.item.imageUrl}
                                    alt=""
                                    width={243}
                                    height={143}
                                    className="aspect-[1215/717] w-full shrink-0 object-contain"
                                  />
                                </button>
                              </div>
                              {categories.map((category) => (
                                <div
                                  key={category.id}
                                  className={`flex min-h-28 items-center justify-center rounded-lg border px-2 py-3 text-center shadow-inner ${
                                    guess.matches[category.id]
                                      ? 'border-slate-300/70 bg-[#00c800] text-white shadow-lime-950/30'
                                      : guess.partialMatches[category.id]
                                      ? 'border-slate-300/70 bg-orange-500/90 text-white shadow-orange-950/30'
                                      : 'border-slate-300/70 bg-red-500/85 text-white shadow-red-950/30'
                                  }`}
                                >
                                  <span className="inline-flex items-center justify-center gap-1.5 text-base font-semibold leading-5">
                                    {guess.values[category.id]}
                                    {category.id === 'releaseYear' && guess.releaseYearDirection === 'higher' ? (
                                      <ArrowUp size={18} strokeWidth={2.5} aria-label="Target year is higher" />
                                    ) : null}
                                    {category.id === 'releaseYear' && guess.releaseYearDirection === 'lower' ? (
                                      <ArrowDown size={18} strokeWidth={2.5} aria-label="Target year is lower" />
                                    ) : null}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {isLatestGuess ? (
                              <div className="pointer-events-none absolute inset-0 z-10 animate-skindle-reveal rounded-xl bg-slate-900" />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-inner shadow-slate-950/40"
          >
            <div ref={inputAreaRef} className="relative flex flex-col gap-3 sm:flex-row">
              <input
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setMessage('');
                }}
                onFocus={() => {
                  const query = normalizeAnswer(inputValue);
                  if (inputValue.trim().length >= 2 && query && !solved) {
                    setSuggestions(answerPool.filter((skin) => normalizeAnswer(skin.answer).includes(query)));
                  }
                }}
                disabled={!target || solved}
                autoComplete="off"
                spellCheck={false}
                placeholder={solved ? 'You have already guessed correctly' : 'Type a skin name'}
                className="min-h-14 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/10 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {suggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-50 mt-2 grid max-h-72 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50 sm:w-[calc(100%-8rem)]">
                  {suggestions.map((skin) => (
                    <button
                      key={skin.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => submitGuess(skin)}
                      className="rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                    >
                      {skin.answer}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={!target || solved}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search size={16} />
                Guess
              </button>
            </div>
          </form>
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
            <Image
              src={previewSkin.imageUrl}
              alt={previewSkin.answer}
              width={1215}
              height={717}
              className="max-h-[82vh] w-full object-contain"
              priority
            />
            <div className="border-t border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">{previewSkin.answer}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
