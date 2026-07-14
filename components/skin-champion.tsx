'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Flame, Play, SlidersHorizontal, ThumbsUp, Trophy } from 'lucide-react';
import Image from 'next/image';
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
import { QuizItemCarousel } from '@/components/quiz-item-carousel';
import { SoloQuizPrematch } from '@/components/solo-quiz-prematch';
import { getSkinThemeAnswer } from '@/lib/skin-themes';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { CHAOS_DIFFICULTY, CHAOS_ROUND_TIME_LIMIT_SECONDS, forceAllModifiers, isLeaderboardMode, type SoloQuizMode } from '@/lib/solo-quiz';
import { playUiSound } from '@/lib/ui-sounds';

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
    description: 'No upcoming preview blur, hints appear instantly, wrong guesses add no time, and auto-fill is active.',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Upcoming previews are blurred, hints appear after 10 seconds, wrong guesses add 5 seconds, and auto-fill is active.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Upcoming previews are blocked, hints appear after 30 seconds, wrong guesses scale upward, and auto-fill is active.',
  },
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Upcoming previews are blocked, hints are disabled, wrong guesses end the game, and auto-fill is off.',
  },
] as const;

type DifficultyId = (typeof difficulties)[number]['id'];
type ModifierId = (typeof modifiers)[number]['id'];
type OpenMenu = 'difficulty' | 'modifiers' | null;
type ModifierState = Record<ModifierId, boolean>;
type ModeStatus = 'not-started' | 'in-progress' | 'completed';

type SkinChampionDailyState = {
  items: QuizItem[];
  soloMode?: SoloQuizMode;
  selectedDifficulty: DifficultyId;
  activeModifiers: ModifierState;
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

const entryCountOptions = [10, 25, 50, 75, 100] as const;

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
  const [soloMode, setSoloMode] = useState<SoloQuizMode>('daily');
  const [entryCount, setEntryCount] = useState(25);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const multiplayerStartCountdown = multiplayer?.startCountdownSeconds && multiplayer.startCountdownSeconds > 0 ? multiplayer.startCountdownSeconds : null;
  const [started, setStarted] = useState(Boolean(multiplayer && !multiplayerStartCountdown && !multiplayer.gameEnded && multiplayer.initialProgress < multiplayer.items.length));
  const [countdown, setCountdown] = useState<number | null>(multiplayerStartCountdown);
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
  const [failureReason, setFailureReason] = useState<'wrong' | 'timeout' | null>(null);
  const [wrongGuessCount, setWrongGuessCount] = useState(0);
  const [successFlash, setSuccessFlash] = useState(false);
  const [pendingConfirmedGuess, setPendingConfirmedGuess] = useState('');
  const [storageReady, setStorageReady] = useState(Boolean(multiplayer));
  const [playerStats, setPlayerStats] = useState<PlayerGameStats>(() => createEmptyPlayerStats('skin-champion'));
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
  const difficultyMenuRef = useRef<HTMLDivElement>(null);
  const modifiersMenuRef = useRef<HTMLDivElement>(null);
  const answerInputAreaRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const hasRestoredStateRef = useRef(false);
  const statsRecordedRef = useRef<string | null>(null);
  const multiplayerResultSoundRef = useRef<string | null>(null);

  const currentItem = started ? items[activeIndex] ?? null : null;
  const nextItem = started ? items[activeIndex + 1] ?? null : null;
  const afterNextItem = started ? items[activeIndex + 2] ?? null : null;
  const previousItem = activeIndex > 0 ? items[activeIndex - 1] : null;
  const multiplayerRaceEndedEarly = Boolean(multiplayer?.gameEnded && multiplayer.initialProgress < multiplayer.items.length);
  const multiplayerGameEnded = multiplayer?.gameEnded ?? false;
  const multiplayerInitialProgress = multiplayer?.initialProgress;
  const activeModifierCount = Object.values(activeModifiers).filter(Boolean).length;
  const configurationLocked = started || countdown !== null || finished || failed;
  const difficultyRule = difficultyRules[selectedDifficulty];
  const hintsDisabled = difficultyRule.hintDelaySeconds === null;
  const autocompleteEnabled = difficultyRule.autocomplete;
  const chaosMode = soloMode === 'chaos';
  const shouldHideTimers = activeModifiers.hiddenTimer && !chaosMode;
  const completedProgressCount = items.filter((item) => item.guessed).length;
  const showSinglePlayerEndState = !multiplayer && finished;
  const showEndState = showSinglePlayerEndState || Boolean(multiplayer && finished);
  const showSoloPrematch = !multiplayer && !started && !finished && !failed;
  const leaderboardMode = isLeaderboardMode(soloMode);
  const casualSettingsAvailable = soloMode === 'casual';
  const answerLabel = 'skin line';
  const promptLabel = 'skin line';
  const itemBadgeLabel = 'Line';
  const getAnswerForItem = useCallback(
    (item: QuizItem) => getSkinThemeAnswer(item) ?? item.answer,
    [],
  );
  const currentAnswer = currentItem ? getAnswerForItem(currentItem) : '';

  useEffect(() => {
    setPlayerStats(loadPlayerGameStats('skin-champion'));
  }, []);

  useEffect(() => {
    if (!multiplayer?.gameEnded || multiplayerResultSoundRef.current === multiplayer.matchId) {
      return;
    }

    multiplayerResultSoundRef.current = multiplayer.matchId ?? 'ended';
    playUiSound(multiplayer.lost ? 'timer-expired' : 'puzzle-complete');
  }, [multiplayer]);

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
    () => Array.from(new Set(items.map(getAnswerForItem).filter(Boolean))).sort(),
    [getAnswerForItem, items],
  );

  const autocompleteAnswers = useMemo(
    () => (answers.length ? answers : filteredAnswers),
    [answers, filteredAnswers],
  );

  useEffect(() => {
    if (multiplayer || !storageReady) {
      return;
    }

    setCompletedDailyMode(hasCompletedSoloQuizMode('skin-champion', soloMode, selectedDifficulty));
  }, [multiplayer, selectedDifficulty, soloMode, storageReady]);

  useEffect(() => {
    if (soloMode === 'chaos' && !multiplayer && !configurationLocked) {
      setActiveModifiers(forceAllModifiers(defaultModifiers));
      setSelectedDifficulty(CHAOS_DIFFICULTY);
    }
  }, [configurationLocked, multiplayer, soloMode]);

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
    const params = new URLSearchParams({ answerMode: 'skin-line' });

    fetch(`/api/skin-champion/quiz-answers${params.size ? `?${params}` : ''}`)
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
    setCountdown(null);
    setIsSliding(false);
    setStorageReady(true);
  }, [multiplayer, selectedDifficulty, soloMode]);

  useEffect(() => {
    if (multiplayer || !storageReady || !showSoloPrematch) {
      return;
    }

    const savedState = loadSoloQuizGameState<SkinChampionDailyState>('skin-champion', soloMode, selectedDifficulty);
    setResumeAvailable(Boolean(savedState?.started && !savedState.finished && !savedState.failed));
  }, [multiplayer, selectedDifficulty, showSoloPrematch, soloMode, storageReady]);

  useEffect(() => {
    if (multiplayer || !storageReady || (!hasLoadedOnce && !started && !finished && !failed)) {
      return;
    }

    saveSoloQuizGameState<SkinChampionDailyState>('skin-champion', soloMode, selectedDifficulty, {
      items,
      soloMode,
      selectedDifficulty,
      activeModifiers,
      entryCount,
      started,
      activeIndex,
      currentTime,
      totalTime,
      completedTimes,
      finished,
      failed,
    });
  }, [activeIndex, activeModifiers, completedTimes, currentTime, entryCount, failed, finished, hasLoadedOnce, items, multiplayer, selectedDifficulty, soloMode, started, storageReady, totalTime]);

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
      gameId: 'skin-champion',
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
        recordCompletedSoloQuizMode('skin-champion', soloMode, selectedDifficulty);
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
              gameId: 'skin-champion',
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
              gameId: 'skin-champion',
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
      setPlayerStats(recordPlayerGameCompletion('skin-champion', [], undefined, streakScope));
    } else if (failed && !multiplayer && leaderboardMode) {
      recordCompletedSoloQuizMode('skin-champion', soloMode, selectedDifficulty);
      setCompletedDailyMode(true);
      if (soloMode !== 'chaos' && selectedDifficulty !== CHAOS_DIFFICULTY) {
        return;
      }
      setPlayerStats(recordPlayerGameCompletion('skin-champion', [], undefined, 'chaos:challenger'));
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
            gameId: 'skin-champion',
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

    setSuggestions(autocompleteAnswers.filter((answer) => normalizeAnswer(answer).includes(query)));
  }, [autocompleteAnswers, autocompleteEnabled, currentItem, inputValue]);

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    const answerPool = answers.length ? answers : filteredAnswers;
    const wrongAnswers = shuffle(answerPool.filter((answer) => answer !== currentAnswer)).slice(0, 9);

    setOptions(shuffle([currentAnswer, ...wrongAnswers]));
    setShowOptions(false);
    setTimeUntilOptions(difficultyRule.hintDelaySeconds ?? 0);
    setPenaltyCount(0);
    setPenaltyMessage('');
    setCroppedZoom(CROPPED_INITIAL_ZOOM);
    setStatus('idle');
    setInputValue('');
    setSuggestions([]);
    setPendingConfirmedGuess('');
  }, [answers, currentAnswer, currentItem, difficultyRule.hintDelaySeconds, filteredAnswers]);

  useEffect(() => {
    if (!started || countdown !== null || isSliding || !currentItem || finished || showOptions || hintsDisabled) {
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

    const timeout = window.setTimeout(() => {
      playUiSound('setting-select');
      setShowOptions(true);
    }, hintDelaySeconds * 1000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [countdown, currentItem, difficultyRule.hintDelaySeconds, finished, hintsDisabled, isSliding, showOptions, started]);

  useEffect(() => {
    if (multiplayer || !started || hasLoadedOnce) {
      return;
    }

    const loadItems = async () => {
      try {
        const params = new URLSearchParams({
          mode: soloMode,
          difficulty: selectedDifficulty,
          entries: String(entryCount),
        });
        const response = await fetch(`/api/skin-champion/quiz-items?${params}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setItems(soloMode === 'casual' ? shuffle(data).slice(0, entryCount) : data.slice(0, entryCount));
        }
      } catch (error) {
        console.error('Failed to fetch randomized skin set', error);
      } finally {
        setHasLoadedOnce(true);
      }
    };

    loadItems();
  }, [entryCount, hasLoadedOnce, multiplayer, selectedDifficulty, soloMode, started]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    if (countdown === 0) {
      setStarted(true);
      setCountdown(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setCountdown((value) => {
        if (value === null) {
          return null;
        }
        const nextValue = value - 1;
        if (nextValue > 0) {
          playUiSound('timer-countdown');
        }
        return nextValue;
      });
    }, 1000);
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
    setCroppedZoom(CROPPED_INITIAL_ZOOM);
    setPendingConfirmedGuess('');
    setSuccessFlash(false);
    setHasLoadedOnce(false);
    statsRecordedRef.current = null;
    setItems([]);
    clearSoloQuizGameState('skin-champion', soloMode, selectedDifficulty);
    clearDailyGameState('skin-champion');
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
        gameId: 'skin-champion',
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
        gameId: 'skin-champion',
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
        recordCompletedSoloQuizMode('skin-champion', soloMode, selectedDifficulty);
        setCompletedDailyMode(true);
      }
      resetSinglePlayerRound();
      return;
    }

    const savedState = loadSoloQuizGameState<SkinChampionDailyState>('skin-champion', soloMode, selectedDifficulty);
    if (savedState?.started && !savedState.finished && !savedState.failed) {
      setItems(savedState.items);
      setSelectedDifficulty(savedState.selectedDifficulty);
      setActiveModifiers(savedState.activeModifiers);
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
    setCroppedZoom(CROPPED_INITIAL_ZOOM);
    setPendingConfirmedGuess('');
    setSuccessFlash(false);
    setHasLoadedOnce(false);
    setItems([]);
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
    }
    if (mode === 'chaos') {
      setSelectedDifficulty(CHAOS_DIFFICULTY);
      setEntryCount(50);
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
      void submitOfficialAttemptState('failed');
      multiplayer?.onProgress(activeIndex, totalTime, 'failed');
    }
  }, [activeIndex, chaosMode, countdown, currentTime, failed, finished, isSliding, multiplayer, started, status, submitOfficialAttemptState, totalTime]);

  const getModeStatus = useCallback((mode: SoloQuizMode, difficulty: DifficultyId): ModeStatus => {
    if (hasCompletedSoloQuizMode('skin-champion', mode, difficulty)) {
      const savedState = loadSoloQuizGameState<SkinChampionDailyState>('skin-champion', mode, difficulty);
      if (mode !== 'chaos' && savedState?.started && !savedState.finished && !savedState.failed) {
        return 'in-progress';
      }
      return 'completed';
    }

    const savedState = loadSoloQuizGameState<SkinChampionDailyState>('skin-champion', mode, difficulty);
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

  const advance = () => {
    const item = items[activeIndex];
    playUiSound('skindle-guess-correct');
    setCompletedTimes((current) => ({
      ...current,
      [item.id]: {
        total: totalTime,
        duration: currentTime,
      },
    }));
    setItems((current) => current.map((candidate, index) => (index === activeIndex ? { ...candidate, guessed: true } : candidate)));
    if (activeIndex >= items.length - 1) {
      playUiSound('puzzle-complete');
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
    playUiSound('item-slide');
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
    playUiSound('skindle-guess-incorrect');
    setWrongGuessCount((count) => count + 1);
    if (activeModifiers.cropped) {
      setCroppedZoom((value) => Math.max(CROPPED_MIN_ZOOM, value - CROPPED_ZOOM_STEP));
    }

    if (difficultyRule.wrongGuess === 'game-over') {
      playUiSound('timer-expired');
      setFailed(true);
      setFailureReason('wrong');
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

    if (answerMatches(guess, currentAnswer)) {
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

    if (answerMatches(option, currentAnswer)) {
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
              <Link href="/multiplayer/skin-champion" aria-label="Back to Skin Champion lobby setup" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
                <ArrowLeft size={20} />
              </Link>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{multiplayer ? 'Multiplayer Game' : 'Single Player Game'}</p>
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-white">
                Skin Champion
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
            <GameInfoMenu title="Skin Champion" steps={[
              'Identify the skin line shown by the splash art.',
              'Use hints and autocomplete when the selected difficulty allows them.',
              multiplayer ? 'Finish the shared randomized set before your opponents.' : 'Complete the randomized set as quickly as possible.',
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
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{activeModifierCount}</span>
                  <ChevronDown size={16} className={openMenu === 'modifiers' ? 'rotate-180 transition' : 'transition'} />
                </button>

                {openMenu === 'modifiers' ? (
                  <div className="absolute right-0 top-14 z-40 w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-slate-950 p-4">
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
                          <span className="mt-1 block text-xs leading-5 text-slate-400">Select how many {promptLabel}s appear this round.</span>
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
            gameId="skin-champion"
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
              slots={[
                {
                  id: 'next',
                  label: 'Next item',
                  badge: <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">{itemBadgeLabel}</span>,
                },
                {
                  id: 'current',
                  label: 'Current item',
                  badge: <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">{itemBadgeLabel}</span>,
                },
                {
                  id: 'completed',
                  label: 'Completed',
                  subLabel: previousItem ? getAnswerForItem(previousItem) : undefined,
                  badge: <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-300"><Check size={14} /></span>,
                },
              ]}
              afterNextItem={afterNextItem}
              nextItem={nextItem}
              currentItem={currentItem}
              previousItem={previousItem}
              isSliding={isSliding}
              renderItem={(item, role) => {
                const isCurrent = role === 'current';
                const isCompleted = role === 'previous';
                const cardLabel = isCompleted ? 'Completed' : isCurrent ? 'Current item' : 'Next item';
                const fallback = isCompleted
                  ? `Your completed ${promptLabel}s appear here`
                  : isCurrent
                    ? `Press Play to reveal the next ${promptLabel}`
                    : `Next ${promptLabel} will appear here`;

                return (
                  <div
                    className={`relative flex aspect-[1215/717] w-full items-center justify-center overflow-hidden border-2 bg-slate-950/50 text-white shadow-2xl shadow-black/20 transition ${
                      isCurrent && successFlash
                        ? 'border-emerald-400/70 ring-1 ring-emerald-400/40'
                        : isCurrent
                          ? 'border-violet-500/50'
                          : isCompleted
                            ? 'border-emerald-500/20'
                            : 'border-slate-400/70'
                    }`}
                  >
                    {item && role === 'next' && difficultyRule.upcomingVisibility === 'blocked' ? (
                      <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-4 text-center text-slate-500">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em]">Hidden</p>
                      </div>
                    ) : item?.imageUrl ? (
                      <div className="relative z-10 flex h-full w-full flex-col">
                        <div className="relative h-full min-h-0 flex-1">
                          <Image
                            key={`${cardLabel}-${item.id}`}
                            src={item.imageUrl}
                            alt={item.question}
                            width={1215}
                            height={717}
                            className={getSkinImageClassName(cardLabel)}
                            priority={isCurrent}
                            style={{
                              transform:
                                activeModifiers.cropped && !isCompleted
                                  ? `scale(${isCurrent ? croppedZoom : CROPPED_INITIAL_ZOOM})`
                                  : undefined,
                              transformOrigin:
                                activeModifiers.cropped && !isCompleted
                                  ? getCropOrigin(item)
                                  : undefined,
                              transition: 'transform 240ms ease',
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative z-10 flex h-full w-full items-center justify-center bg-slate-950/70 p-4 text-center text-slate-400">
                        <p className="text-sm leading-6">{fallback}</p>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          ) : null}

          {!showEndState ? <form
            onSubmit={handleSubmit}
            className={`relative z-30 mt-8 flex flex-col gap-4 rounded-3xl border bg-slate-950/80 p-5 shadow-inner shadow-slate-950/40 transition ${
              successFlash ? 'border-emerald-400/40 ring-1 ring-emerald-400/20' : 'border-white/10'
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
                      handleOptionClick(option);
                    }}
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
                placeholder={started ? `Type the ${answerLabel}` : 'Press Play to begin'}
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
                <div className="absolute left-0 top-full z-50 mt-2 grid max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 sm:w-[calc(100%-8rem)]">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => playUiSound('autocomplete-hover')}
                      onFocus={() => playUiSound('autocomplete-hover')}
                      onClick={() => {
                        playUiSound('autocomplete-select');
                        handleSuggestionClick(suggestion);
                      }}
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
              ) : (
                <span>Timer hidden</span>
              )}
              {status === 'incorrect' ? <span className="font-semibold text-red-300">Incorrect</span> : null}
              {penaltyMessage ? <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-red-300">{penaltyMessage}</span> : null}
              {activeModifiers.confirmEntry && pendingConfirmedGuess ? (
                <span className="font-semibold text-amber-300">Submit again to confirm</span>
              ) : null}
            </div>
          </form> : null}

          <section className={`relative z-0 mt-8 rounded-3xl bg-slate-950/70 p-5 ${showEndState ? 'app-gradient-border' : 'border border-white/10'}`}>
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
                <span className="text-xs text-slate-500">{completedProgressCount}/{items.length}</span>
              </div>
            </div>
            <div ref={progressContainerRef} className="grid max-h-72 gap-3 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((item, index) => {
                const completed = item.guessed || index < activeIndex;
                const active = started && index === activeIndex && !finished;
                const time = completedTimes[item.id];

                return (
                  <div
                    key={item.id}
                    className={`relative min-h-20 overflow-hidden rounded-3xl border px-4 py-3 pr-16 text-sm transition ${
                      active
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : completed
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-950/70'
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">
                      <span>{completed ? getAnswerForItem(item) : '???'}</span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-400">
                      {time ? `${formatSeconds(time.total)} - ${formatSeconds(time.duration)}` : 'TBD - TBD'}
                    </p>
                    <Image
                      src={item.imageUrl}
                      alt=""
                      width={40}
                      height={40}
                      className={`absolute right-3 top-3 h-10 w-10 rounded-xl border border-white/10 object-cover ${completed ? '' : 'blur-sm brightness-75 scale-105'}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </section> : null}
      </section>
    </main>
  );
}
