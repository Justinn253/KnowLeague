'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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

type CategoryId = (typeof categories)[number]['id'];

type GuessResult = {
  item: QuizItem;
  values: Record<CategoryId, string>;
  matches: Record<CategoryId, boolean>;
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

function compareGuess(item: QuizItem, target: QuizItem): GuessResult {
  const values = getCategoryValues(item);
  const targetValues = getCategoryValues(target);
  const matches = categories.reduce<Record<CategoryId, boolean>>((acc, category) => {
    acc[category.id] = values[category.id] === targetValues[category.id];
    return acc;
  }, {} as Record<CategoryId, boolean>);

  return { item, values, matches };
}

export function Skindle() {
  const [skins, setSkins] = useState<QuizItem[]>([]);
  const [target, setTarget] = useState<QuizItem | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<QuizItem[]>([]);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [message, setMessage] = useState('');
  const [timeToNextSet, setTimeToNextSet] = useState('00:00:00');
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const guessesPanelRef = useRef<HTMLDivElement>(null);

  const solved = Boolean(target && guesses.some((guess) => guess.item.id === target.id));
  const answerPool = useMemo(() => skins.filter((skin) => !guesses.some((guess) => guess.item.id === skin.id)), [guesses, skins]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!inputAreaRef.current?.contains(event.target as Node)) {
        setSuggestions([]);
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
    if (inputValue.trim().length < 3 || !query || solved) {
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

          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
            {guesses.length} guesses
          </div>
        </header>

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

            <div className="overflow-x-auto">
              <div className="w-full min-w-[58rem]">
                <div className="grid grid-cols-[minmax(8.5rem,1.35fr)_repeat(7,minmax(5.5rem,1fr))] gap-2 px-1 pb-3 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
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
                              isCorrectGuess
                                ? 'skindle-gradient-border shadow-lg shadow-violet-950/30'
                                : ''
                            }`}
                          >
                            <div
                              className={`grid grid-cols-[minmax(8.5rem,1.35fr)_repeat(7,minmax(5.5rem,1fr))] gap-2 ${
                                isCorrectGuess ? 'skindle-gradient-border-content' : ''
                              }`}
                            >
                              <div
                                className={`flex min-h-28 flex-col items-center justify-between rounded-lg border px-2 py-3 text-center shadow-inner ${
                                  isCorrectGuess
                                    ? 'border-lime-400/30 bg-lime-500 text-slate-950 shadow-lime-950/30'
                                    : 'border-red-400/70 bg-red-500/85 text-white shadow-red-950/30'
                                }`}
                              >
                                <span className="line-clamp-2 text-sm font-semibold leading-5">{guess.item.answer}</span>
                                <Image
                                  src={guess.item.imageUrl}
                                  alt=""
                                  width={243}
                                  height={143}
                                  className="mt-2 aspect-[1215/717] w-full shrink-0 object-contain ring-1 ring-white/30"
                                />
                              </div>
                              {categories.map((category) => (
                                <div
                                  key={category.id}
                                  className={`flex min-h-28 items-center justify-center rounded-lg border px-2 py-3 text-center shadow-inner ${
                                    guess.matches[category.id]
                                      ? 'border-lime-400/30 bg-lime-500 text-slate-950 shadow-lime-950/30'
                                      : 'border-red-400/70 bg-red-500/85 text-white shadow-red-950/30'
                                  }`}
                                >
                                  <span className="text-sm font-semibold leading-5">{guess.values[category.id]}</span>
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
                  if (inputValue.trim().length >= 3 && query && !solved) {
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
    </main>
  );
}
