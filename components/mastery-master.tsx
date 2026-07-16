'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, RotateCcw, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppSelectMenu } from '@/components/app-select-menu';
import { MultiplayerCreateJoinPanel, MultiplayerLobbyCard, MultiplayerLobbyHeader, MultiplayerLobbyShell, MultiplayerPublicLobbyEmpty } from '@/components/multiplayer-lobby-layout';
import { playUiSound } from '@/lib/ui-sounds';

type PlatformRoute = 'BR1' | 'EUN1' | 'EUW1' | 'JP1' | 'KR' | 'LA1' | 'LA2' | 'NA1' | 'OC1' | 'TR1' | 'RU' | 'PH2' | 'SG2' | 'TH2' | 'TW2' | 'VN2';
type GameStage = 'lobby' | 'settings' | 'playing' | 'ended';
type MasteryMode = 'dual' | 'custom';
type QuestionMode = 'highest' | 'lowest' | 'specific' | 'grouped';
type OrderMode = 'none' | 'required';

type MasteryChampion = {
  id: number;
  key: string;
  name: string;
  title: string;
  imageUrl: string;
  splashUrl: string;
  championLevel: number;
  championPoints: number;
};

type MasteryProfile = {
  riotId: string;
  platform: PlatformRoute;
  champions: MasteryChampion[];
};

type GameSettings = {
  timerSeconds: number | null;
  mode: MasteryMode;
  choiceCount: number;
  order: OrderMode;
  questions: QuestionMode[];
  showAnswer: boolean;
};

type GameRound = {
  id: string;
  choices: MasteryChampion[];
  question: QuestionMode;
  prompt: string;
  correctIds: Set<number>;
  orderedIds: number[];
};

const platforms: Array<{ id: PlatformRoute; label: string }> = [
  { id: 'NA1', label: 'NA - North America' }, { id: 'BR1', label: 'BR - Brazil' }, { id: 'LA1', label: 'LAN - Latin America North' },
  { id: 'LA2', label: 'LAS - Latin America South' }, { id: 'EUW1', label: 'EUW - Europe West' }, { id: 'EUN1', label: 'EUNE - Europe Nordic & East' },
  { id: 'KR', label: 'KR - Korea' }, { id: 'JP1', label: 'JP - Japan' }, { id: 'OC1', label: 'OCE - Oceania' },
  { id: 'TR1', label: 'TR - Turkey' }, { id: 'RU', label: 'RU - Russia' }, { id: 'PH2', label: 'PH - Philippines' },
  { id: 'SG2', label: 'SG - Singapore' }, { id: 'TH2', label: 'TH - Thailand' }, { id: 'TW2', label: 'TW - Taiwan' }, { id: 'VN2', label: 'VN - Vietnam' },
];

const defaultSettings: GameSettings = {
  timerSeconds: null,
  mode: 'dual',
  choiceCount: 2,
  order: 'none',
  questions: ['highest'],
  showAnswer: true,
};

function formatPoints(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatOrdinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
  return `${value}${suffix}`;
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function sampleChoices(champions: MasteryChampion[], count: number) {
  return shuffle(champions).slice(0, Math.min(count, champions.length));
}

function getQuestion(settings: GameSettings): QuestionMode {
  return shuffle(settings.questions)[0] ?? 'highest';
}

function createRound(champions: MasteryChampion[], settings: GameSettings): GameRound {
  const question = getQuestion(settings);
  const choiceCount = settings.choiceCount;
  let choices = sampleChoices(champions, choiceCount);
  let correctIds = new Set<number>();
  let orderedIds: number[] = [];
  let prompt = 'Choose the champion with the highest mastery points.';

  if (question === 'grouped') {
    const target = choices[Math.floor(Math.random() * choices.length)] ?? champions[0];
    const level = target.championLevel;
    const matching = champions.filter((champion) => champion.championLevel === level);
    const nonMatching = champions.filter((champion) => champion.championLevel !== level);
    const selectedMatches = sampleChoices(matching, Math.min(Math.max(1, Math.min(2, matching.length)), choiceCount));
    choices = shuffle([...selectedMatches, ...sampleChoices(nonMatching, Math.max(0, choiceCount - selectedMatches.length))]);
    correctIds = new Set(selectedMatches.map((champion) => champion.id));
    prompt = `Select every champion at Mastery Level ${level}.`;
  } else if (question === 'specific') {
    const target = choices[Math.floor(Math.random() * choices.length)] ?? champions[0];
    const otherChoices = sampleChoices(
      champions.filter((champion) => champion.id !== target.id && champion.championPoints !== target.championPoints),
      choiceCount - 1,
    );
    if (otherChoices.length === choiceCount - 1) {
      choices = shuffle([target, ...otherChoices]);
    }
    correctIds = new Set([target.id]);
    prompt = `Choose the champion with exactly ${formatPoints(target.championPoints)} mastery points.`;
  } else {
    const descending = [...choices].sort((left, right) => right.championPoints - left.championPoints);
    const ordered = question === 'lowest' ? [...descending].reverse() : descending;
    orderedIds = ordered.map((champion) => champion.id);
    correctIds = new Set([orderedIds[0]]);
    if (settings.order === 'required') {
      prompt = question === 'lowest'
        ? 'Select every champion from lowest to highest mastery points.'
        : 'Select every champion from highest to lowest mastery points.';
    } else {
      prompt = question === 'lowest'
        ? 'Choose the champion with the lowest mastery points.'
        : 'Choose the champion with the highest mastery points.';
    }
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    choices,
    question,
    prompt,
    correctIds,
    orderedIds,
  };
}

function getAnswerStates(round: GameRound, correctAnswerIds: Iterable<number>) {
  const states = new Map<number, 'correct' | 'incorrect'>();
  const correctIds = new Set(correctAnswerIds);
  round.choices.forEach((champion) => states.set(champion.id, correctIds.has(champion.id) ? 'correct' : 'incorrect'));
  return states;
}

function ShowcaseCard({ champion, revealed, selected, answerState, showMasteryLevel, showMasteryPoints, selectionPosition, correctPosition, showCorrectPosition, groupedSelected, direction, gridMode, preload, disabled, onClick }: {
  champion: MasteryChampion;
  revealed: boolean;
  selected: boolean;
  answerState?: 'correct' | 'incorrect';
  showMasteryLevel: boolean;
  showMasteryPoints: boolean;
  selectionPosition?: number;
  correctPosition?: number;
  showCorrectPosition: boolean;
  groupedSelected: boolean;
  direction: 'left' | 'right';
  gridMode: boolean;
  preload: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const positionBadge = selectionPosition;
  const showOrderResult = answerState && (selectionPosition !== undefined || (showCorrectPosition && correctPosition !== undefined));

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={gridMode ? undefined : () => playUiSound('autocomplete-hover')}
      onFocus={gridMode ? undefined : () => playUiSound('autocomplete-hover')}
      disabled={disabled}
      className={`group relative min-h-0 overflow-hidden ${gridMode ? 'rounded-lg' : 'rounded-2xl'} border-2 text-left transition duration-300 focus:outline-none disabled:cursor-not-allowed ${gridMode ? 'h-auto aspect-[1215/717] self-center bg-slate-950' : `h-full ${direction === 'right' ? 'grid grid-cols-[20%_80%]' : 'grid grid-cols-[80%_20%]'}`} ${
        answerState === 'correct' ? 'border-emerald-300/75 bg-emerald-300/5' : answerState === 'incorrect' ? 'border-rose-400/75 bg-rose-400/5' : selected ? 'border-sky-300 bg-sky-300/10' : gridMode ? 'border-white/15 bg-slate-950 hover:-translate-y-1 hover:border-amber-200 hover:shadow-[0_0_0_1px_rgba(253,224,71,0.75),0_0_26px_rgba(245,158,11,0.22)] focus:border-amber-200' : 'border-white/15 bg-slate-950 hover:border-amber-200 focus:border-amber-200'
      }`}
      aria-label={`Select ${champion.name}`}
    >
      {gridMode ? <>
        <Image src={champion.splashUrl} alt="" fill loading={preload ? 'eager' : 'lazy'} sizes="(min-width: 1024px) 40vw, 80vw" className="object-cover object-center transition duration-500 group-hover:scale-[1.02]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/10" />
        <div className={`absolute bottom-0 p-3 sm:p-4 ${direction === 'right' ? 'left-0 text-left' : 'right-0 text-right'}`}><p className="text-sm font-black text-white sm:text-base">{champion.name}</p><p className="mt-1 text-xs font-semibold text-slate-300">{champion.title}</p></div>
      </> : direction === 'right' ? <>
        <div className="flex min-w-0 items-center justify-center bg-slate-950 p-3 text-center"><div><p className="text-xl font-black text-white sm:text-2xl">{champion.name}</p><p className="mt-1 text-xs font-semibold text-slate-300">{champion.title}</p></div></div>
        <div className="relative min-w-0 bg-slate-950"><Image src={champion.splashUrl} alt="" fill loading={preload ? 'eager' : 'lazy'} sizes="(min-width: 1024px) 40vw, 80vw" className="object-contain object-right" /></div>
      </> : <>
        <div className="relative min-w-0 bg-slate-950"><Image src={champion.splashUrl} alt="" fill loading={preload ? 'eager' : 'lazy'} sizes="(min-width: 1024px) 40vw, 80vw" className="object-contain object-left" /></div>
        <div className="flex min-w-0 items-center justify-center bg-slate-950 p-3 text-center"><div><p className="text-xl font-black text-white sm:text-2xl">{champion.name}</p><p className="mt-1 text-xs font-semibold text-slate-300">{champion.title}</p></div></div>
      </>}
      {positionBadge !== undefined ? <span className={`absolute z-20 inline-flex min-w-10 items-center justify-center rounded-full border border-sky-300/80 bg-slate-950/90 px-2 py-1 text-xs font-black text-sky-100 ${gridMode ? 'top-3' : 'top-1/2 -translate-y-1/2'} ${direction === 'right' ? 'right-3' : 'left-3'}`}>{formatOrdinal(positionBadge)}</span> : null}
      {groupedSelected ? <span className={`absolute top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-300/80 bg-slate-950/90 text-sky-100 ${direction === 'right' ? 'right-3' : 'left-3'}`} aria-label="Selected"><Check size={18} strokeWidth={3} /></span> : null}
      {answerState ? <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center ${answerState === 'correct' ? 'bg-emerald-400/30' : 'bg-rose-500/30'}`}><span className={`inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/80 ${answerState === 'correct' ? 'bg-emerald-950/85 text-emerald-200' : 'bg-rose-950/85 text-rose-100'}`}>{answerState === 'correct' ? <Check size={34} strokeWidth={3} /> : <X size={34} strokeWidth={3} />}</span>{revealed && showMasteryPoints ? <p className="mt-3 rounded-full bg-slate-950/90 px-4 py-1.5 text-sm font-black text-amber-200">{showMasteryLevel ? `Mastery Level ${champion.championLevel}` : `${formatPoints(champion.championPoints)} points`}</p> : null}</div> : null}
      {showOrderResult ? <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-wrap items-center justify-center gap-1.5 px-3 text-[0.65rem] font-black text-white">{selectionPosition !== undefined ? <span className="rounded-full border border-sky-300/70 bg-slate-950/90 px-2 py-1">Selected {formatOrdinal(selectionPosition)}</span> : null}{showCorrectPosition && correctPosition !== undefined && correctPosition !== selectionPosition ? <span className="rounded-full border border-amber-300/70 bg-slate-950/90 px-2 py-1 text-amber-100">Correct {formatOrdinal(correctPosition)}</span> : null}</div> : null}
    </button>
  );
}

export function MasteryMaster() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRiotId = searchParams.get('riotId') ?? '';
  const initialPlatform = (searchParams.get('platform')?.toUpperCase() as PlatformRoute | undefined) ?? 'NA1';
  const [stage, setStage] = useState<GameStage>('lobby');
  const [riotId, setRiotId] = useState(initialRiotId);
  const [platform, setPlatform] = useState<PlatformRoute>(platforms.some((item) => item.id === initialPlatform) ? initialPlatform : 'NA1');
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [profile, setProfile] = useState<MasteryProfile | null>(null);
  const [round, setRound] = useState<GameRound | null>(null);
  const [incomingRound, setIncomingRound] = useState<GameRound | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [answerStates, setAnswerStates] = useState<Map<number, 'correct' | 'incorrect'>>(new Map());
  const [score, setScore] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sliding, setSliding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const [startAction, setStartAction] = useState<'new' | 'restart' | null>(null);
  const [message, setMessage] = useState('');
  const transitionTimeouts = useRef<number[]>([]);

  const clearTransitionTimeouts = useCallback(() => {
    transitionTimeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    transitionTimeouts.current = [];
  }, []);

  useEffect(() => clearTransitionTimeouts, [clearTransitionTimeouts]);

  useEffect(() => {
    if (initialRiotId) return;
    try {
      const raw = window.localStorage.getItem('knowleague:riot-account-viewer:last-search');
      if (!raw) return;
      const saved = JSON.parse(raw) as { riotId?: string; platform?: PlatformRoute };
      if (saved.riotId) setRiotId(saved.riotId);
      if (saved.platform && platforms.some((item) => item.id === saved.platform)) setPlatform(saved.platform);
    } catch {
      // Account input remains available when the previous LAV search is unavailable.
    }
  }, [initialRiotId]);

  useEffect(() => {
    if (stage !== 'playing' || secondsRemaining === null) return undefined;
    if (secondsRemaining <= 0) {
      clearTransitionTimeouts();
      setStage('ended');
      setRevealed(true);
      return undefined;
    }
    const timeout = window.setTimeout(() => setSecondsRemaining((current) => current === null ? null : Math.max(0, current - 1)), 1000);
    if (secondsRemaining <= 10) playUiSound('timer-countdown');
    return () => window.clearTimeout(timeout);
  }, [clearTransitionTimeouts, secondsRemaining, stage]);

  const activeChoiceCount = settings.choiceCount;
  const canStart = riotId.trim().includes('#');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const url = new URL('/api/riot-account/mastery', window.location.origin);
      url.searchParams.set('riotId', riotId.trim());
      url.searchParams.set('platform', platform);
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load mastery data.');
      const nextProfile = data as MasteryProfile;
      if (nextProfile.champions.length < activeChoiceCount) {
        throw new Error(`This account needs at least ${activeChoiceCount} champions with mastery data.`);
      }
      setProfile(nextProfile);
      const nextRound = createRound(nextProfile.champions, settings);
      setRound(nextRound);
      setIncomingRound(null);
      setSelectedIds(new Set());
      setSelectedOrder([]);
      setAnswerStates(new Map());
      setScore(0);
      setRevealed(false);
      setSliding(false);
      setSecondsRemaining(settings.timerSeconds);
      setStage('playing');
      window.history.replaceState(null, '', `/mastery-master?riotId=${encodeURIComponent(nextProfile.riotId)}&platform=${nextProfile.platform}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start Mastery Master.');
    } finally {
      setLoading(false);
    }
  }, [activeChoiceCount, platform, riotId, settings]);

  const restartLoadedRun = useCallback(() => {
    if (!profile) return;
    clearTransitionTimeouts();
    setRound(createRound(profile.champions, settings));
    setIncomingRound(null);
    setSelectedIds(new Set());
    setSelectedOrder([]);
    setAnswerStates(new Map());
    setScore(0);
    setRevealed(false);
    setSliding(false);
    setSecondsRemaining(settings.timerSeconds);
    setStage('playing');
  }, [clearTransitionTimeouts, profile, settings]);

  const beginStart = useCallback((action: 'new' | 'restart') => {
    setMessage('');
    setStartAction(action);
    setStartCountdown(action === 'restart' ? 3 : 5);
  }, []);

  useEffect(() => {
    if (startCountdown === null || !startAction) return undefined;
    if (startCountdown === 0) {
      const action = startAction;
      setStartCountdown(null);
      setStartAction(null);
      if (action === 'new') void loadProfile();
      else restartLoadedRun();
      return undefined;
    }
    playUiSound('timer-countdown');
    const timeout = window.setTimeout(() => setStartCountdown((current) => current === null ? null : current - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [loadProfile, restartLoadedRun, startAction, startCountdown]);

  const advanceRound = useCallback(() => {
    if (!profile || !round) return;
    const nextRound = createRound(profile.champions, settings);
    const beginSlide = () => {
      setIncomingRound(nextRound);
      window.requestAnimationFrame(() => {
        setSliding(true);
        const finishTimeout = window.setTimeout(() => {
          setRound(nextRound);
          setIncomingRound(null);
          setSelectedIds(new Set());
          setSelectedOrder([]);
          setAnswerStates(new Map());
          setRevealed(false);
          setSliding(false);
        }, 700);
        transitionTimeouts.current.push(finishTimeout);
      });
    };
    setIncomingRound(nextRound);
    if (settings.showAnswer) {
      setRevealed(true);
      const revealTimeout = window.setTimeout(beginSlide, settings.choiceCount === 2 ? 2600 : 1600);
      transitionTimeouts.current.push(revealTimeout);
    } else {
      beginSlide();
    }
  }, [profile, round, settings]);

  const endGame = useCallback(() => {
    clearTransitionTimeouts();
    setRevealed(true);
    setSliding(false);
    setStage('ended');
    playUiSound('skindle-guess-incorrect');
  }, [clearTransitionTimeouts]);

  const chooseChampion = useCallback((champion: MasteryChampion) => {
    if (!round || sliding || revealed) return;
    if (round.question === 'grouped') {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(champion.id)) next.delete(champion.id);
        else next.add(champion.id);
        return next;
      });
      playUiSound('setting-select');
      return;
    }
    if (settings.order === 'required') {
      setSelectedOrder((current) => current.includes(champion.id) ? current.filter((id) => id !== champion.id) : [...current, champion.id]);
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(champion.id)) next.delete(champion.id); else next.add(champion.id);
        return next;
      });
      playUiSound('setting-select');
      return;
    }
    if (!round.correctIds.has(champion.id)) {
      const states = settings.choiceCount > 2
        ? getAnswerStates(round, round.correctIds)
        : new Map<number, 'correct' | 'incorrect'>([...round.correctIds].map((id) => [id, 'correct'])).set(champion.id, 'incorrect');
      setAnswerStates(states);
      endGame();
      return;
    }
    setSelectedIds(new Set([champion.id]));
    setAnswerStates(getAnswerStates(round, [champion.id]));
    setScore((current) => current + 1);
    playUiSound('skindle-guess-correct');
    advanceRound();
  }, [advanceRound, endGame, revealed, round, settings.choiceCount, settings.order, sliding]);

  const confirmGrouped = useCallback(() => {
    if (!round || round.question !== 'grouped') return;
    const correct = selectedIds.size === round.correctIds.size && [...selectedIds].every((id) => round.correctIds.has(id));
    if (!correct) {
      const states = settings.choiceCount > 2
        ? getAnswerStates(round, round.correctIds)
        : new Map<number, 'correct' | 'incorrect'>([...round.correctIds].map((id) => [id, 'correct']));
      selectedIds.forEach((id) => { if (!round.correctIds.has(id)) states.set(id, 'incorrect'); });
      setAnswerStates(states);
      endGame();
      return;
    }
    setAnswerStates(getAnswerStates(round, round.correctIds));
    setScore((current) => current + 1);
    playUiSound('skindle-guess-correct');
    advanceRound();
  }, [advanceRound, endGame, round, selectedIds, settings.choiceCount]);

  const confirmOrder = useCallback(() => {
    if (!round || settings.order !== 'required') return;
    const correct = selectedOrder.length === round.orderedIds.length && selectedOrder.every((id, index) => id === round.orderedIds[index]);
    if (!correct) {
      const states = settings.choiceCount > 2
        ? getAnswerStates(round, round.orderedIds)
        : new Map<number, 'correct' | 'incorrect'>(round.orderedIds.map((id) => [id, 'correct']));
      selectedOrder.forEach((id) => { if (id !== round.orderedIds[selectedOrder.indexOf(id)]) states.set(id, 'incorrect'); });
      setAnswerStates(states);
      endGame();
      return;
    }
    setAnswerStates(getAnswerStates(round, round.orderedIds));
    setScore((current) => current + 1);
    playUiSound('skindle-guess-correct');
    advanceRound();
  }, [advanceRound, endGame, round, selectedOrder, settings.choiceCount, settings.order]);

  const restart = () => {
    if (!profile) {
      setStage('settings');
      return;
    }
    beginStart('restart');
  };

  const renderRound = (displayRound: GameRound, incoming = false) => {
    const rows = activeChoiceCount === 2
      ? [displayRound.choices.slice(0, 1), displayRound.choices.slice(1, 2)]
      : Array.from({ length: Math.ceil(displayRound.choices.length / 2) }, (_, index) => displayRound.choices.slice(index * 2, index * 2 + 2));
    return (
      <div className={`absolute inset-1 grid min-h-0 gap-3 ${sliding && !incoming ? 'pointer-events-none' : ''}`} style={{ gridTemplateRows: activeChoiceCount > 2 ? `repeat(${rows.length}, auto)` : `repeat(${rows.length}, minmax(0, 1fr))`, alignContent: activeChoiceCount > 2 ? 'start' : undefined }}>
        {rows.map((row, rowIndex) => {
          const direction = rowIndex % 2 === 0 ? 'right' : 'left';
          const outgoingTransform = direction === 'right' ? 'translate-x-[120%]' : '-translate-x-[120%]';
          const incomingTransform = direction === 'right' ? '-translate-x-[120%]' : 'translate-x-[120%]';
          const rowTransform = sliding && !incoming ? outgoingTransform : incoming && sliding ? 'translate-x-0 opacity-100' : incoming ? `${incomingTransform} opacity-0` : '';
          return (
            <div key={`${displayRound.id}-${rowIndex}`} className={`grid min-h-0 ${activeChoiceCount === 2 ? 'grid-cols-1' : 'grid-cols-2'} gap-3 transition-[transform,opacity] duration-700 ease-in-out ${rowTransform}`}>
              {row.map((champion) => <ShowcaseCard key={champion.id} champion={champion} revealed={incoming ? false : revealed} selected={!incoming && selectedIds.has(champion.id)} answerState={incoming ? undefined : answerStates.get(champion.id)} showMasteryLevel={displayRound.question === 'grouped'} showMasteryPoints={activeChoiceCount === 2 ? revealed : settings.showAnswer} selectionPosition={settings.order === 'required' && !incoming && selectedOrder.includes(champion.id) ? selectedOrder.indexOf(champion.id) + 1 : undefined} correctPosition={settings.order === 'required' && !incoming && displayRound.orderedIds.includes(champion.id) ? displayRound.orderedIds.indexOf(champion.id) + 1 : undefined} showCorrectPosition={settings.order === 'required' && !incoming && stage === 'ended' && answerStates.size > 0} groupedSelected={displayRound.question === 'grouped' && !incoming && selectedIds.has(champion.id)} direction={direction} gridMode={activeChoiceCount > 2} preload={incoming} disabled={sliding || revealed || stage === 'ended'} onClick={() => chooseChampion(champion)} />)}
            </div>
          );
        })}
      </div>
    );
  };

  const timerLabel = secondsRemaining === null ? 'No timer' : `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`;
  const timerUrgent = secondsRemaining !== null && secondsRemaining <= 10;
  const groupedRound = round?.question === 'grouped';
  const showcaseRowCount = activeChoiceCount === 2 ? 2 : Math.ceil(activeChoiceCount / 2);
  const gameplayMinHeight = activeChoiceCount === 2 ? 'min-h-[36rem]' : showcaseRowCount === 2 ? 'min-h-[46rem]' : showcaseRowCount === 3 ? 'min-h-[68rem]' : 'min-h-[90rem]';

  const infoSteps = ['Choose the champion with the mastery value requested by the prompt.', 'A wrong answer ends the run immediately.', 'Custom mode supports more choices, ordered picks, exact scores, and mastery-level groups.'];
  const confirmationRequired = groupedRound || settings.order === 'required';
  const orderDisabled = settings.questions.includes('specific') || settings.questions.includes('grouped');
  const orderDisabledDescription = settings.questions.includes('specific')
    ? "You cannot play 'Specific Mastery' with Order Required"
    : settings.questions.includes('grouped')
      ? "You cannot play 'Grouped' with Order Required"
      : undefined;
  const toggleQuestion = (question: QuestionMode) => {
    setSettings((current) => {
      const questions = current.questions.includes(question)
        ? current.questions.filter((item) => item !== question)
        : [...current.questions, question];
      if (questions.length === 0) return current;
      return {
        ...current,
        questions,
        order: questions.includes('specific') || questions.includes('grouped') ? 'none' : current.order,
      };
    });
  };

  return (
    <MultiplayerLobbyShell maxWidthClassName="max-w-7xl">
      <MultiplayerLobbyHeader title="Mastery Master" subtitle={stage === 'lobby' ? 'Create or join a lobby' : stage === 'settings' ? '' : null} statusLabel="Lobby" hideStatus={stage !== 'lobby'} eyebrow="Single Player Game" infoSteps={infoSteps} onBack={() => stage === 'lobby' ? router.push('/') : stage === 'settings' ? setStage('lobby') : setStage('settings')} actions={stage === 'ended' ? <button type="button" onClick={restart} disabled={startCountdown !== null} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-400 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"><RotateCcw size={17} />{startCountdown === null ? 'Start over' : `Starting in ${startCountdown}`}</button> : undefined} />

        {stage === 'lobby' ? <MultiplayerLobbyCard><MultiplayerCreateJoinPanel title="Set up a Mastery Master lobby" joinCode="" onJoinCodeChange={() => undefined} onJoin={(event) => event.preventDefault()} onCreate={() => undefined} canCreate={false} canJoin={false} soloAction={() => setStage('settings')} soloLabel="Play Solo" soloDescription="Open Mastery Master Solo" publicLobbyContent={<MultiplayerPublicLobbyEmpty />} onRefreshPublicLobbies={() => undefined} /></MultiplayerLobbyCard> : null}

        {stage === 'settings' ? (
          <MultiplayerLobbyCard><section className="grid gap-6 p-2 lg:grid-cols-[1.1fr_0.9fr]">
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Game Settings</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">League account</span><input value={riotId} onChange={(event) => setRiotId(event.target.value)} placeholder="GameName#TagLine" className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none focus:border-amber-300/70" /></label>
              <AppSelectMenu label="Region" value={platform} options={platforms.map((item) => ({ value: item.id, label: item.label }))} onChange={setPlatform} />
              <AppSelectMenu label="Countdown timer" value={settings.timerSeconds ?? 'none'} headerDescription="This is how long the game will last. Selecting 'No Timer' will allow the game to continue until you get an answer incorrect." options={[{ value: 60, label: '1 minute' }, { value: 120, label: '2 minutes' }, { value: 180, label: '3 minutes' }, { value: 240, label: '4 minutes' }, { value: 300, label: '5 minutes' }, { value: 'none', label: 'No Timer' }]} onChange={(value) => setSettings((current) => ({ ...current, timerSeconds: value === 'none' ? null : value }))} />
              <AppSelectMenu label="Mode" value={settings.mode} disabled disabledDescription="More Modes coming soon" options={[{ value: 'dual', label: 'Default', description: 'Two champions are displayed and you must select which champion has more mastery.' }, { value: 'custom', label: 'Custom', description: 'Allows you to set custom rules to change up how the game plays.' }]} onChange={(value) => setSettings((current) => ({ ...current, mode: value, order: 'none', questions: value === 'dual' ? ['highest'] : current.questions }))} />
              <AppSelectMenu label="Number of choices" value={settings.choiceCount} headerDescription="Number of items that will appear each round." options={[2, 3, 4, 5, 6, 7, 8].map((value) => ({ value, label: String(value) }))} onChange={(value) => setSettings((current) => ({ ...current, choiceCount: current.order === 'required' ? Math.max(3, value) : value }))} />
              <AppSelectMenu label="Order" value={settings.order} disabled={orderDisabled} disabledDescription={orderDisabledDescription} options={[{ value: 'none', label: 'No Order', description: 'Select the top answer for the question (e.g. select the champion with the highest mastery).' }, { value: 'required', label: 'Order Required', description: 'You must select each answer in order (e.g. Highest to lowest, lowest to highest).' }]} onChange={(value) => setSettings((current) => ({ ...current, order: value, choiceCount: value === 'required' ? Math.max(3, current.choiceCount) : current.choiceCount }))} />
              <AppSelectMenu label="Questions" value={settings.questions[0] ?? 'highest'} selectedValues={settings.questions} multiple headerDescription="Select one or more question types. A random selected type will be used each round." options={[{ value: 'highest', label: 'Highest Mastery', description: 'Select the champion with the highest mastery.' }, { value: 'lowest', label: 'Lowest Mastery', description: 'Select the champion with the lowest mastery.' }, { value: 'specific', label: 'Specific Mastery', description: 'Select which champion has the specific amount of mastery points.' }, { value: 'grouped', label: 'Grouped', description: 'Select all champions that are at the given mastery level.' }]} onToggle={toggleQuestion} />
              <div className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-transparent" aria-hidden="true">Setting</span><label className="flex h-12 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950 px-4"><span className="block text-sm font-bold text-white">Show mastery when correct</span><input type="checkbox" checked={settings.showAnswer} onChange={(event) => setSettings((current) => ({ ...current, showAnswer: event.target.checked }))} className="h-5 w-5 accent-amber-300" /></label></div>
            </div>
            {message ? <p className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{message}</p> : null}
            <button type="button" onClick={() => { if (startCountdown === null) beginStart('new'); else { setStartCountdown(null); setStartAction(null); } }} disabled={loading || (startCountdown === null && !canStart)} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"><>{loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}{loading ? 'Loading mastery' : startCountdown === null ? 'Play' : `Cancel (${startCountdown})`}</></button></div>
            <aside className="min-h-64 rounded-3xl border border-white/10 bg-slate-950/80 p-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Mastery Master</p><h3 className="mt-3 text-2xl font-black text-white">Build your challenge</h3><p className="mt-3 text-sm leading-6 text-slate-400">Choose a League account, tailor the rules, then beat the clock by reading champion mastery at a glance.</p></aside>
          </section></MultiplayerLobbyCard>
        ) : null}

        {(stage === 'playing' || stage === 'ended') && round ? (
          <section className={`grid min-h-[calc(100vh-9rem)] content-start ${settings.order === 'required' ? 'grid-rows-[auto_auto_minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)_auto]'} gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-4 sm:p-5`}>
             <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{profile?.riotId}</p><h2 className="mt-1 text-xl font-black text-white">{round.prompt}</h2></div><div className="flex items-center gap-2">{confirmationRequired && stage === 'playing' ? <button type="button" onClick={groupedRound ? confirmGrouped : confirmOrder} disabled={selectedIds.size === 0 || sliding} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"><Check size={17} />Confirm</button> : null}{stage === 'ended' ? <div className="min-w-[8.5rem] rounded-2xl border border-rose-400/35 bg-rose-950/30 px-4 py-2 text-right"><p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-rose-200">Game Ended</p><p className="mt-1 text-sm font-black text-white">{score} correct {score === 1 ? 'guess' : 'guesses'}</p></div> : <div className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-right"><p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">Correct</p><p className="text-lg font-black text-emerald-300">{score}</p></div>}{secondsRemaining !== null ? <div className="rounded-2xl border border-amber-300/25 bg-slate-950 px-4 py-2 text-right"><p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">Countdown</p><p className={`font-mono text-2xl font-black ${timerUrgent ? 'animate-pulse text-red-400' : 'text-amber-300'}`}>{timerLabel}</p></div> : null}</div></div>
            {settings.order === 'required' ? <p className="text-sm font-bold text-sky-100">{selectedIds.size}/{round.orderedIds.length} selected in order</p> : null}
            <div className={`relative ${gameplayMinHeight} overflow-hidden p-1`}>{renderRound(round)}{incomingRound ? renderRound(incomingRound, true) : null}</div>
           </section>
        ) : null}
    </MultiplayerLobbyShell>
  );
}
