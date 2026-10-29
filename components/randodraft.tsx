'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Dices, MapPin, Play, Swords, User } from 'lucide-react';
import { AppSelectMenu } from '@/components/app-select-menu';
import { GameIconImage } from '@/components/game-asset-image';
import { MultiplayerLobbyCard, MultiplayerLobbyHeader, MultiplayerLobbyShell } from '@/components/multiplayer-lobby-layout';
import { RandodraftSpinner, type DraftSpinnerOption } from '@/components/randodraft-spinner';
import { RandodraftResults } from '@/components/randodraft-results';
import {
  availableDraftValues, createDraftState, DEFAULT_DRAFT_SETTINGS, draftCategories, draftReducer, draftTotalPicks,
  draftPickDisplayName, DRAFT_CHAMPION_BY_ID, DRAFT_ITEM_BY_ID, generateDraftBuild, isCompletePick, normalizeDraftSettings, randomDraftValue,
  RANDODRAFT_PLAYER_COUNTS, RANDODRAFT_TEAM_SIZE, RANDODRAFT_VERSION,
  type CompleteDraftPick, type DraftCategory, type DraftGameMode, type DraftSettings, type RandomBuildTypeMode,
} from '@/lib/randodraft';
import { RandodraftCategory } from '@/components/randodraft-category';
import { RandodraftTeam } from '@/components/randodraft-team';
import { RandodraftHistory } from '@/components/randodraft-history';
import { useRandodraftHistory } from '@/components/use-randodraft-history';
import { readSavedRandodraft, randodraftProgressKey, type SavedRandodraft } from '@/lib/randodraft-progress';
import { decodeRandodraftShare, draftStateFromHistoryEntry } from '@/lib/randodraft-share';
import type { DraftHistoryEntry, DraftHistoryInput } from '@/lib/randodraft-history';
import { playUiSound } from '@/lib/ui-sounds';

const INFO_STEPS = [
  'Draft a unique champion for each player.',
  'Choose Champion, Lane, and Class in any order, or spin them at the same time.',
  'Your manual selection allowance resets for every pick. Choose up to that many categories yourself and spin the rest.',
  'Random Build Type controls whether mixed-item Random builds are excluded, allowed, or used for every pick.',
  'Build items follow the official Fighter, Marksman, Assassin, Tank, Mage, and Support shop assignments.',
];
const CATEGORY_CONFIG = {
  champion: { id: 'champion', label: 'Champion', icon: User },
  lane: { id: 'lane', label: 'Lane', icon: MapPin },
  type: { id: 'type', label: 'Class', icon: Swords },
} as const;

function optionFor(category: DraftCategory, id: string): DraftSpinnerOption {
  const champion = category === 'champion' ? DRAFT_CHAMPION_BY_ID.get(id) : null;
  const label = champion?.name ?? id;
  const laneIcons: Record<string, string> = { Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' };
  const image = champion?.imageUrl ?? (category === 'lane' ? `/role-icons/roleicon_${laneIcons[id]}.png` : category === 'type' && id !== 'Random' ? `/class-icons/${id.toLowerCase()}.png` : null);
  return { id, label, content: <>{image ? <GameIconImage src={image} alt="" width={44} height={44} className="rounded-xl" /> : null}<span>{label}</span></> };
}

function BuildSpinner({ pick, gameMode, disabled, onBusyChange, onBuild }: {
  pick: CompleteDraftPick; gameMode: DraftGameMode; disabled: boolean; onBusyChange: (busy: boolean) => void; onBuild: (ids: string[]) => void;
}) {
  function buildOption(ids: string[]): DraftSpinnerOption {
    return {
      id: ids.join(','),
      label: ids.map((id) => DRAFT_ITEM_BY_ID.get(id)!.name).join(', '),
      content: <span className="flex items-center justify-center gap-1 sm:gap-2">{ids.map((id) => <GameIconImage key={id} src={DRAFT_ITEM_BY_ID.get(id)!.imageUrl} alt="" width={36} height={36} className="h-8 w-8 rounded-md sm:h-9 sm:w-9" />)}</span>,
    };
  }
  function drawBuild() {
    return buildOption(generateDraftBuild(DRAFT_CHAMPION_BY_ID.get(pick.champion)!, pick.type, gameMode));
  }
  const [options] = useState(() => [drawBuild(), drawBuild()]);
  return (
    <section className={`mx-auto mt-5 w-full max-w-xl rounded-2xl border p-4 ${pick.build ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'}`}>
      <h3 className="flex items-center justify-center gap-2 text-center text-lg font-bold text-white">Build Path <span aria-hidden="true">&middot;</span> {pick.type !== 'Random' ? <GameIconImage src={`/class-icons/${pick.type.toLowerCase()}.png`} alt="" width={20} height={20} className="rounded-sm" /> : null}<span>{pick.type}</span></h3>
      <p className="mb-3 mt-1 text-center text-xs leading-5 text-slate-400">The build path this pick will follow.</p>
      <RandodraftSpinner label="Build path" options={pick.build ? [...options, buildOption(pick.build)] : options} drawOption={drawBuild} value={pick.build?.join(',') ?? null} disabled={disabled} onBusyChange={onBusyChange} onSpin={(id) => onBuild(id.split(','))} />
    </section>
  );
}

function createHistoryInput(state: { settings: DraftSettings; picks: CompleteDraftPick[] }, id: string): DraftHistoryInput {
  return { id, version: RANDODRAFT_VERSION, settings: normalizeDraftSettings(state.settings), picks: state.picks };
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.src = src;
  });
}

async function drawCanvasImage(context: CanvasRenderingContext2D, src: string, x: number, y: number, size: number) {
  try {
    const image = await loadCanvasImage(src);
    context.drawImage(image, x, y, size, size);
  } catch {
    context.fillStyle = '#1e293b';
    context.fillRect(x, y, size, size);
  }
}

async function drawSharePickMeta(context: CanvasRenderingContext2D, pick: CompleteDraftPick, gameMode: DraftGameMode, x: number, y: number) {
  const laneIcon = gameMode === 'aram' || !pick.lane ? null : '/role-icons/roleicon_' + ({ Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' } as Record<string, string>)[pick.lane] + '.png';
  const classIcon = pick.type !== 'Random' ? '/class-icons/' + pick.type.toLowerCase() + '.png' : null;
  let cursor = x;

  if (laneIcon && pick.lane) {
    await drawCanvasImage(context, laneIcon, cursor, y - 18, 22);
    cursor += 28;
    context.fillText(pick.lane, cursor, y);
    cursor += context.measureText(pick.lane).width + 12;
    context.fillText('·', cursor, y);
    cursor += context.measureText('·').width + 12;
  }
  if (classIcon) {
    await drawCanvasImage(context, classIcon, cursor, y - 18, 22);
    cursor += 28;
  }
  context.fillText(pick.type, cursor, y);
}

async function createShareImage(entry: DraftHistoryEntry): Promise<Blob> {
  const teamSize = entry.settings.playersPerTeam ?? RANDODRAFT_TEAM_SIZE;
  const splitTeams = entry.settings.secondTeam === true;
  const teams = splitTeams ? [entry.picks.slice(0, teamSize), entry.picks.slice(teamSize, teamSize * 2)] : [entry.picks];
  const columns = splitTeams ? 2 : 1;
  const cardWidth = (1800 - 128 - (columns - 1) * 28) / columns;
  const rows = splitTeams ? Math.max(...teams.map((team) => team.length)) : teams[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 170 + rows * 158 + 70;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  context.fillStyle = '#050b1d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f8d56b';
  context.font = '800 42px system-ui';
  context.fillText('KnowLeague - Randodraft', 64, 64);
  context.fillStyle = '#94a3b8';
  context.font = '500 24px system-ui';
  context.fillText(entry.settings.gameMode === 'aram' ? 'ARAM' : "Summoner's Rift", 66, 104);

  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const team = teams[teamIndex];
    const columnX = 64 + teamIndex * (cardWidth + 28);
    let y = 145;
    if (splitTeams) {
      context.fillStyle = teamIndex === 0 ? '#fda4af' : '#7dd3fc';
      context.font = '800 22px system-ui';
      context.fillText(teamIndex === 0 ? 'TEAM 1 · RED SIDE' : 'TEAM 2 · BLUE SIDE', columnX, y);
      y += 32;
    }
    for (const [teamPickIndex, pick] of team.entries()) {
      const champion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
      if (!champion) continue;
      context.fillStyle = '#0f1a35';
      context.fillRect(columnX, y, cardWidth, 126);
      await drawCanvasImage(context, champion.imageUrl, columnX + 18, y + 18, 76);
      context.fillStyle = '#ffffff';
      context.font = '800 27px system-ui';
      context.fillText(draftPickDisplayName(pick, teamIndex * teamSize + teamPickIndex, champion.name), columnX + 114, y + 49, 230);
      context.fillStyle = '#a5b4fc';
      context.font = '500 20px system-ui';
      await drawSharePickMeta(context, pick, entry.settings.gameMode, columnX + 114, y + 82);
      let itemX = columnX + 360;
      for (const id of pick.build ?? []) {
        const item = DRAFT_ITEM_BY_ID.get(id);
        if (!item) continue;
        await drawCanvasImage(context, item.imageUrl, itemX, y + 34, 58);
        itemX += 68;
      }
      y += 158;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png');
  });
}

export function Randodraft() {
  const router = useRouter();
  const [settings, setSettings] = useState<DraftSettings>({ ...DEFAULT_DRAFT_SETTINGS });
  const [state, dispatch] = useReducer(draftReducer, undefined, createDraftState);
  const [busySpinners, setBusySpinners] = useState<Set<DraftCategory | 'build'>>(() => new Set());
  const [quickRolling, setQuickRolling] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'link' | 'image' | null>(null);
  const spinning = busySpinners.size > 0;
  const quickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFinishedEntryRef = useRef<DraftHistoryEntry | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimeRef = useRef<string | null>(null);
  const persistedSharePromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  function setSpinnerBusy(category: DraftCategory | 'build', busy: boolean) {
    setBusySpinners((current) => { const next = new Set(current); if (busy) next.add(category); else next.delete(category); return next; });
  }
  function pushDraftRoute(search: string, entry?: DraftHistoryEntry) {
    if (typeof window === 'undefined') return;
    window.history.pushState(entry ? { randodraftEntry: entry } : { randodraftPhase: search }, '', '/randodraft' + search);
  }
  function replaceDraftRoute(search: string, entry?: DraftHistoryEntry) {
    if (typeof window === 'undefined') return;
    window.history.replaceState(entry ? { randodraftEntry: entry } : { randodraftPhase: search }, '', '/randodraft' + search);
  }
  const history = useRandodraftHistory();
  const draftOwnerRef = useRef<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const [savedProgress, setSavedProgress] = useState<SavedRandodraft | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [loadedProgressKey, setLoadedProgressKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const remainingManual = (state.settings.manualSelections ?? 0) - state.current.manualCategories.length;
  const complete = isCompletePick(state.current, state.settings.gameMode);
  const categories = draftCategories(state.settings.gameMode).map((id) => CATEGORY_CONFIG[id]);
  const totalPicks = draftTotalPicks(state.settings);
  const options = useMemo(() => Object.fromEntries(categories.map(({ id }) => [
    id, availableDraftValues(id, state.picks, state.settings.randomBuildType, state.settings.gameMode, state.settings).map((value) => optionFor(id, value)),
  ])) as Record<DraftCategory, DraftSpinnerOption[]>, [categories, state.picks, state.settings]);
  const categorySummary = state.settings.gameMode === 'aram' ? 'Champion and Class' : 'Champion, Lane, and Class';

  useEffect(() => {
    if (state.phase !== 'lobby') headingRef.current?.focus();
  }, [state.phase, state.picks.length]);

  useEffect(() => {
    if (!history.resolved || typeof window === 'undefined') return;
    const key = randodraftProgressKey(history.userId);
    setBusySpinners(new Set());
    setQuickRolling(false);
    draftOwnerRef.current = history.userId;
    try { setSavedProgress(readSavedRandodraft(history.userId)); setProgressError(null); }
    catch { setSavedProgress(null); setProgressError('Local saving is unavailable in this browser.'); }
    setLoadedProgressKey(key);
  }, [history.resolved, history.userId]);

  useEffect(() => {
    if (!history.resolved || typeof window === 'undefined') return;

    function cacheFinishedEntry(entry: DraftHistoryEntry) {
      lastFinishedEntryRef.current = entry;
      try { window.sessionStorage.setItem('knowleague:randodraft:view:' + entry.id, JSON.stringify(entry)); } catch { /* optional browser cache */ }
    }

    function restoreFinishedEntry(entry: DraftHistoryEntry) {
      cacheFinishedEntry(entry);
      setSettings(entry.settings);
      draftOwnerRef.current = null;
      draftIdRef.current = entry.id;
      completionTimeRef.current = entry.completedAt;
      setBusySpinners(new Set());
      dispatch({ type: 'resume', state: draftStateFromHistoryEntry(entry) });
    }

    async function loadSharedEntry(id: string) {
      let entry: DraftHistoryEntry | null = null;
      try {
        const response = await fetch('/api/randodraft/share/' + encodeURIComponent(id), { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json() as { entry?: DraftHistoryEntry };
          entry = payload.entry ?? null;
        }
      } catch { entry = null; }
      entry ??= decodeRandodraftShare(id);
      if (entry) restoreFinishedEntry(entry);
    }

    function restoreFromUrl() {
      if (quickTimerRef.current) { clearTimeout(quickTimerRef.current); quickTimerRef.current = null; }
      setQuickRolling(false);
      setBusySpinners(new Set());
      const params = new URLSearchParams(window.location.search);
      const share = params.get('share');
      if (share) { void loadSharedEntry(share); return; }

      const view = params.get('view');
      if (view) {
        const historyEntry = window.history.state?.randodraftEntry as DraftHistoryEntry | undefined;
        if (historyEntry?.id === view) { restoreFinishedEntry(historyEntry); return; }
        if (lastFinishedEntryRef.current?.id === view) { restoreFinishedEntry(lastFinishedEntryRef.current); return; }
        try {
          const cached = window.sessionStorage.getItem('knowleague:randodraft:view:' + view);
          if (cached) { restoreFinishedEntry(JSON.parse(cached) as DraftHistoryEntry); return; }
        } catch { /* ignore malformed session state */ }
        const known = [...history.drafts, ...(history.guestDrafts ?? [])].find((entry) => entry.id === view);
        if (known) { restoreFinishedEntry(known); return; }
        void loadSharedEntry(view);
        return;
      }

      if (params.get('play') === '1') {
        const saved = readSavedRandodraft(history.userId);
        if (saved) {
          draftIdRef.current = saved.id;
          draftOwnerRef.current = history.userId;
          setSettings(saved.state.settings);
          setSavedProgress(saved);
          setBusySpinners(new Set());
          dispatch({ type: 'resume', state: saved.state });
        } else dispatch({ type: 'lobby' });
        return;
      }

      dispatch({ type: 'lobby' });
    }

    restoreFromUrl();
    window.addEventListener('popstate', restoreFromUrl);
    return () => window.removeEventListener('popstate', restoreFromUrl);
  }, [history.resolved, history.userId, history.drafts, history.guestDrafts]);
  useEffect(() => {
    if (!history.resolved || loadedProgressKey !== randodraftProgressKey(history.userId) || !draftIdRef.current || draftOwnerRef.current !== history.userId) return;
    try {
      if (state.phase === 'drafting') {
        const saved: SavedRandodraft = { id: draftIdRef.current, version: RANDODRAFT_VERSION, savedAt: new Date().toISOString(), state };
        window.localStorage.setItem(loadedProgressKey, JSON.stringify(saved)); setSavedProgress(saved); setProgressError(null);
      } else if (state.phase === 'finished') { window.localStorage.removeItem(loadedProgressKey); setSavedProgress(null); }
    } catch { setProgressError('Your progress could not be saved locally.'); }
  }, [state, loadedProgressKey, history.resolved, history.userId]);

  useEffect(() => () => { if (quickTimerRef.current) clearTimeout(quickTimerRef.current); if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current); }, []);

  function resume() {
    if (!savedProgress) return;
    pushDraftRoute('?play=1');
    draftIdRef.current = savedProgress.id; draftOwnerRef.current = history.userId; setSettings(savedProgress.state.settings);
    setBusySpinners(new Set()); dispatch({ type: 'resume', state: savedProgress.state });
  }

  function start() {
    pushDraftRoute('?play=1');
    draftOwnerRef.current = history.userId; draftIdRef.current = crypto.randomUUID(); completionTimeRef.current = null; setCopyFeedback(null);
    setBusySpinners(new Set()); setQuickRolling(false); dispatch({ type: 'start', settings }); playUiSound('random-select');
  }

  function persistShareEntry(entry: DraftHistoryEntry): Promise<boolean> {
    const existing = persistedSharePromisesRef.current.get(entry.id);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const response = await fetch('/api/randodraft/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: entry.id, draft: entry, completedAt: entry.completedAt }),
        });
        if (!response.ok) throw new Error('Share persistence failed.');
        return true;
      } catch {
        return false;
      }
    })();
    persistedSharePromisesRef.current.set(entry.id, promise);
    void promise.then((success) => {
      if (!success) persistedSharePromisesRef.current.delete(entry.id);
    });
    return promise;
  }

  function saveFinished(next: { settings: DraftSettings; picks: CompleteDraftPick[] }) {
    const id = draftIdRef.current; if (!id) return;
    const input = createHistoryInput(next, id);
    completionTimeRef.current ??= new Date().toISOString();
    const entry: DraftHistoryEntry = { ...input, completedAt: completionTimeRef.current };
    lastFinishedEntryRef.current = entry;
    try { window.sessionStorage.setItem('knowleague:randodraft:view:' + entry.id, JSON.stringify(entry)); } catch { /* optional browser cache */ }
    replaceDraftRoute('?view=' + encodeURIComponent(entry.id), entry);
    void persistShareEntry(entry);
    void history.save(input, draftOwnerRef.current);
  }

  function applyQuickRoll(base: typeof state) {
    let working = base;
    const actions: Array<{ type: 'select'; category: DraftCategory; value: string; manual: boolean } | { type: 'build'; itemIds: string[] }> = [];
    for (const category of draftCategories(base.settings.gameMode)) {
      const values = availableDraftValues(category, working.picks, working.settings.randomBuildType, working.settings.gameMode, working.settings);
      const value = randomDraftValue(values);
      actions.push({ type: 'select', category, value, manual: false });
      working = draftReducer(working, { type: 'select', category, value, manual: false });
    }
    if (!isCompletePick(working.current, working.settings.gameMode)) return;
    const champion = DRAFT_CHAMPION_BY_ID.get(working.current.champion!);
    if (!champion) return;
    const itemIds = generateDraftBuild(champion, working.current.type!, working.settings.gameMode);
    actions.push({ type: 'build', itemIds });
    actions.forEach((action) => dispatch(action));
  }

  function beginQuickRoll() {
    if (quickRolling || state.phase !== 'drafting') return;
    setQuickRolling(true); applyQuickRoll(state); playUiSound('random-select');
  }

  useEffect(() => {
    if (!quickRolling || state.phase !== 'drafting' || !state.current.build) return;
    quickTimerRef.current = setTimeout(() => {
      quickTimerRef.current = null;
      const next = draftReducer(state, { type: 'next' });
      if (next === state) { setQuickRolling(false); return; }
      if (next.phase === 'finished') {
        dispatch({ type: 'next' }); setQuickRolling(false); saveFinished(next); playUiSound('puzzle-complete');
      } else {
        dispatch({ type: 'next' }); applyQuickRoll(next); playUiSound('item-slide');
      }
    }, 1000);
    return () => { if (quickTimerRef.current) clearTimeout(quickTimerRef.current); };
    // The timer intentionally captures the state snapshot for this one-second step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRolling, state]);

  function showCopyFeedback(kind: 'link' | 'image') {
    setCopyFeedback(kind);
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyFeedback(null);
    }, 1600);
  }

  async function shareCurrentLink() {
    try {
      if (typeof window === 'undefined') throw new Error('Share link is unavailable.');
      const completedAt = completionTimeRef.current ?? new Date().toISOString();
      const entry: DraftHistoryEntry = { ...createHistoryInput(state, draftIdRef.current ?? crypto.randomUUID()), completedAt };
      await persistShareEntry(entry);
      await navigator.clipboard.writeText(window.location.href);
      showCopyFeedback('link');
    } catch {
      // Clipboard support is optional; the draft remains available at its current URL.
    }
  }

  async function shareEntryImage(entry: DraftHistoryEntry) {
    try {
      const blob = await createShareImage(entry);
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showCopyFeedback('image');
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'randodraft.png';
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch {
      // Browser image clipboard support is optional; unsupported browsers keep the download fallback.
    }
  }

  function openHistoryDraft(entry: DraftHistoryEntry) {
    pushDraftRoute('?view=' + encodeURIComponent(entry.id), entry);
    lastFinishedEntryRef.current = entry;
    try { window.sessionStorage.setItem('knowleague:randodraft:view:' + entry.id, JSON.stringify(entry)); } catch { /* optional browser cache */ }
    draftOwnerRef.current = null;
    draftIdRef.current = entry.id;
    completionTimeRef.current = entry.completedAt;
    setSettings(entry.settings);
    void persistShareEntry(entry);
    setBusySpinners(new Set());
    dispatch({ type: 'resume', state: draftStateFromHistoryEntry(entry) });
  }

  return (
    <MultiplayerLobbyShell maxWidthClassName={state.phase === 'lobby' ? 'max-w-6xl' : 'max-w-7xl'}>
      <MultiplayerLobbyHeader title="Randodraft" eyebrow="Single Player Game"
        subtitle={state.phase === 'lobby' ? null : state.phase === 'finished' ? 'Your completed draft' : 'Try to roll for the best random team'}
        hideStatus={state.phase === 'lobby'}
        statusLabel={state.phase === 'finished' ? 'Finished' : `Pick ${state.picks.length + 1} of ${totalPicks}`}
        infoSteps={INFO_STEPS} backLabel={state.phase === 'lobby' ? 'Back to games' : 'Back to lobby'}
        onBack={() => {
          if (state.phase === 'lobby') router.push('/games');
          else { if (quickTimerRef.current) clearTimeout(quickTimerRef.current); setQuickRolling(false); setBusySpinners(new Set()); dispatch({ type: 'lobby' }); replaceDraftRoute(''); }
        }} />

      {state.phase === 'lobby' ? (
        <MultiplayerLobbyCard>
          <div className="grid gap-5 p-1 sm:gap-6 sm:p-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section aria-label="Game settings" className="flex min-w-0 flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Game settings</p>
              <h2 className="mb-5 mt-2 text-xl font-bold text-white">Set your draft rules</h2>
              <AppSelectMenu<DraftGameMode> label="Game mode" value={settings.gameMode} onChange={(value) => setSettings((current) => ({ ...current, gameMode: value }))} headerDescription="Choose the map and draft rules for this Randodraft." options={[
                { value: 'summoners-rift', label: "Summoner's Rift", description: 'Draft unique champions for each selected player with the full Rift item pool.' },
                { value: 'aram', label: 'ARAM', description: 'Draft unique champions without lanes using the Howling Abyss item pool.' },
              ]} className="mb-5" />
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Players per team</p>
                <div role="group" aria-label="Players per team" className="grid grid-cols-5 gap-2">
                  {RANDODRAFT_PLAYER_COUNTS.map((value) => {
                    const selected = (settings.playersPerTeam ?? 5) === value;
                    return <button key={value} type="button" aria-pressed={selected} onClick={() => setSettings((current) => ({ ...current, playersPerTeam: value }))} className={selected ? "h-10 rounded-xl border border-amber-300 bg-amber-300/15 text-sm font-semibold text-amber-200 shadow-[0_0_0_1px_rgba(252,211,77,0.25)]" : "h-10 rounded-xl border border-slate-700 bg-slate-950/50 text-sm font-semibold text-slate-400 transition hover:border-slate-500 hover:text-slate-200"}>{value}</button>;
                  })}
                </div>
              </div>
              <AppSelectMenu<0 | 1 | 2> label="Manual selections per pick" value={settings.manualSelections} onChange={(value) => setSettings((current) => ({ ...current, manualSelections: value }))} headerDescription="This allowance resets for each pick." options={[
                { value: 0, label: '0 · Spin all categories', description: categorySummary + ' must all be spun.' },
                { value: 1, label: '1 · Choose one category', description: 'Manually choose up to one category; spin the others.' },
                { value: 2, label: '2 · Choose two categories', description: 'Manually choose up to two categories; spin the last.' },
              ]} className="mb-5" />
              <AppSelectMenu<RandomBuildTypeMode> label="Random Build Type" value={settings.randomBuildType} onChange={(value) => setSettings((current) => ({ ...current, randomBuildType: value }))} headerDescription="Choose how Random class builds are handled." options={[
                { value: 'none', label: 'No random build types', description: 'Draft one of the six shop classes.' },
                { value: 'allow', label: 'Allow random build types', description: 'Add Random to the class spinner.' },
                { value: 'all', label: 'All build types are random', description: 'Every pick uses a Random class.' },
              ]} className="mb-5" />
              <div className="mb-5 grid gap-2 sm:grid-cols-2">
                <button type="button" role="switch" aria-checked={settings.quickRoll === true} onClick={() => setSettings((current) => ({ ...current, quickRoll: !current.quickRoll }))} className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${settings.quickRoll ? 'border-amber-300/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-950/60 text-slate-300'}`}><span>Quick Roll</span><span className="text-xs text-slate-400">{settings.quickRoll ? 'Enabled' : 'Disabled'}</span></button>
                <button type="button" role="switch" aria-label={settings.secondTeam ? "Two Teams" : "One Team"} aria-checked={settings.secondTeam === true} onClick={() => setSettings((current) => ({ ...current, secondTeam: !current.secondTeam }))} className={settings.secondTeam ? "flex min-h-12 w-full items-center justify-between rounded-xl border border-amber-300/60 bg-amber-300/10 px-4 text-left text-sm font-bold text-amber-100 transition focus:outline-none focus:ring-2 focus:ring-amber-300" : "flex min-h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 text-left text-sm font-bold text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-amber-300"}><span>{settings.secondTeam ? "Two Teams" : "One Team"}</span><span className="text-xs text-slate-400">{settings.secondTeam ? "Team 1 + Team 2" : "Single team"}</span></button>
              </div>
              <button type="button" onClick={start} disabled={!history.resolved} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"><Play size={17} />Play</button>
            </section>
            <div className="min-w-0 space-y-4">
              {savedProgress && savedProgress.state.picks.length > 0 ? <button type="button" onClick={resume} className="w-full rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4 text-left transition hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-300">
                <span className="block text-sm font-bold text-amber-200">Resume Randodraft</span>
                <span className="mt-1 block text-xs text-slate-300">{savedProgress.state.picks.length}/{draftTotalPicks(savedProgress.state.settings)} picks complete</span>
              </button> : null}
              <RandodraftHistory history={history} onOpen={openHistoryDraft} />
            </div>
          </div>
        </MultiplayerLobbyCard>
      ) : (
        <>
          <RandodraftTeam gameMode={state.settings.gameMode} settings={state.settings} picks={state.picks} current={state.phase === 'drafting' ? state.current : undefined} names={state.pickNames} onRename={state.phase === 'drafting' ? (index, name) => dispatch({ type: 'rename', index, name }) : undefined} />
          {state.phase === 'drafting' ? (
            <MultiplayerLobbyCard>
              <div key={`pick-${state.picks.length}`} aria-label="Current pick">
                {!state.settings.quickRoll ? <div className="relative mb-4 flex min-h-7 items-center justify-center">
                  <h2 ref={headingRef} tabIndex={-1} className="text-center text-base font-bold text-white outline-none">{state.pickNames[state.picks.length]} <span className="sr-only">{state.picks.length + 1}/{totalPicks}</span></h2>
                  {state.settings.manualSelections! > 0 ? <p className="absolute right-0 text-xs font-semibold text-amber-200" role="status">{remainingManual} manual {remainingManual === 1 ? 'selection' : 'selections'} remaining this pick</p> : null}
                </div> : null}




                {state.settings.quickRoll ? (
                  <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-6 text-center">
                    <p className="text-sm text-slate-300">{quickRolling ? ('Rolling pick ' + Math.min(state.picks.length + 1, totalPicks) + ' of ' + totalPicks + '...') : 'Quick Roll fills each pick in order, including its build path.'}</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden="true"><div className="h-full rounded-full bg-amber-300 transition-[width] duration-700 ease-out" style={{ width: (Math.min(100, (state.picks.length / totalPicks) * 100)) + '%' }} /></div>
                    <button type="button" onClick={beginQuickRoll} disabled={quickRolling} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-amber-300 px-6 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"><Dices size={17} className={quickRolling ? 'animate-spin' : undefined} />{quickRolling ? 'Rolling teams...' : 'Spin All'}</button>
                  </div>
                ) : (
                  <div className={`mx-auto grid max-w-5xl items-start gap-3 sm:gap-4 ${categories.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                    {categories.map(({ id, label, icon }) => <RandodraftCategory key={id} label={label} icon={icon} options={options[id]} value={state.current[id]} busy={busySpinners.has(id)} manualAllowance={remainingManual} showManualControl={state.settings.manualSelections! > 0} manuallySelected={state.current.manualCategories.includes(id)} onBusyChange={(busy) => setSpinnerBusy(id, busy)} onSelect={(value, manual) => dispatch({ type: 'select', category: id, value, manual })} />)}
                  </div>
                )}
              </div>
              {!state.settings.quickRoll && complete ? <BuildSpinner key={`build-${state.picks.length}`} pick={state.current as CompleteDraftPick} gameMode={state.settings.gameMode} disabled={busySpinners.has('build')} onBusyChange={(busy) => setSpinnerBusy('build', busy)} onBuild={(itemIds) => dispatch({ type: 'build', itemIds })} /> : null}
              {!state.settings.quickRoll ? <div className="mt-5 flex flex-col items-center gap-2">
                <button type="button" disabled={!complete || !state.current.build || spinning} onClick={() => {
                  const next = draftReducer(state, { type: 'next' }); dispatch({ type: 'next' });
                  if (next.phase === 'finished') { saveFinished(next); playUiSound('puzzle-complete'); } else playUiSound('item-slide');
                }} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-8 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                  {state.picks.length === totalPicks - 1 ? 'Finish' : 'Next'}<ArrowRight size={16} />
                </button>
                {complete ? <p className="text-center text-xs text-slate-500">{!state.current.build ? 'Lock in your build to continue.' : 'Your pick is ready.'}</p> : null}
              </div> : null}
            </MultiplayerLobbyCard>
          ) : (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="sr-only">Draft finished</h2>
              <RandodraftResults gameMode={state.settings.gameMode} playersPerTeam={state.settings.playersPerTeam} secondTeam={state.settings.secondTeam} picks={state.picks} copyFeedback={copyFeedback} onShareLink={() => void shareCurrentLink()} onShareImage={() => void shareEntryImage({ ...createHistoryInput(state, draftIdRef.current ?? crypto.randomUUID()), completedAt: completionTimeRef.current ?? new Date().toISOString() })} />
              {history.saving ? <p role="status" className="text-center text-sm text-slate-400">Saving your draft...</p> : null}
              {history.error && history.userId ? <p role="status" className="text-center text-sm text-amber-200">{history.error} <button type="button" onClick={history.retry} className="underline">Retry</button></p> : null}
              <button type="button" onClick={start} className="mx-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"><Dices size={17} />New draft</button>
            </>
          )}
        </>
      )}
      {progressError ? <p role="status" className="text-center text-xs text-amber-200">{progressError}</p> : null}
    </MultiplayerLobbyShell>
  );
}
