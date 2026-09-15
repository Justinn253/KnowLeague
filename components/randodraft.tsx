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
  availableDraftValues, createDraftState, DEFAULT_DRAFT_SETTINGS, draftCategories, DRAFT_CHAMPION_BY_ID,
  DRAFT_ITEM_BY_ID, draftReducer, generateDraftBuild,
  isCompletePick, RANDODRAFT_TEAM_SIZE, RANDODRAFT_VERSION,
  type CompleteDraftPick, type DraftCategory, type DraftGameMode, type DraftSettings, type RandomBuildTypeMode,
} from '@/lib/randodraft';
import { RandodraftCategory } from '@/components/randodraft-category';
import { RandodraftTeam } from '@/components/randodraft-team';
import { RandodraftHistory } from '@/components/randodraft-history';
import { useRandodraftHistory } from '@/components/use-randodraft-history';
import { readSavedRandodraft, randodraftProgressKey, type SavedRandodraft } from '@/lib/randodraft-progress';
import { playUiSound } from '@/lib/ui-sounds';

const INFO_STEPS = [
  'Draft a team of five unique champions. Summoner\'s Rift assigns one champion to each lane; ARAM has no lanes.',
  'Choose Champion, Lane, and Class in any order, or spin them at the same time. Each result locks in.',
  'Your manual-selection allowance resets for every pick. Choose up to that many categories yourself; spin the rest. Locked results cannot be changed.',
  'Random Build Type controls whether mixed-item Random builds are excluded, allowed alongside the six shop classes, or used for every pick.',
  'Build items follow the official Fighter, Marksman, Assassin, Tank, Mage, and Support shop assignments. Items can belong to multiple classes.',
  'After the required categories are locked, roll and lock a six-item build before continuing. Boots are allowed for every shop class. Duplicate items and incompatible item groups are excluded.',
  'Press Next to draft another champion, then Finish to see the team on Summoner’s Rift. Back returns to the pre-game lobby.',
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
  return {
    id, label,
    content: <>{image ? <GameIconImage src={image} alt="" width={44} height={44} className="rounded-xl" /> : null}<span>{label}</span></>,
  };
}

function BuildSpinner({ pick, gameMode, disabled, onBusyChange, onBuild }: {
  pick: CompleteDraftPick; gameMode: DraftGameMode; disabled: boolean; onBusyChange: (busy: boolean) => void; onBuild: (ids: string[]) => void;
}) {
  function buildOption(ids: string[]): DraftSpinnerOption {
    return {
      id: ids.join(','),
      label: ids.map((id) => DRAFT_ITEM_BY_ID.get(id)!.name).join(', '),
      content: <span className="flex items-center justify-center gap-1 sm:gap-2">{ids.map((id) => {
        const item = DRAFT_ITEM_BY_ID.get(id)!;
        return <GameIconImage key={id} src={item.imageUrl} alt="" width={36} height={36} className="h-8 w-8 rounded-md sm:h-9 sm:w-9" />;
      })}</span>,
    };
  }
  function drawBuild() {
    return buildOption(generateDraftBuild(DRAFT_CHAMPION_BY_ID.get(pick.champion)!, pick.type, gameMode));
  }
  // These are decorative previews; the winning build is generated when Spin is clicked.
  const [options] = useState(() => [drawBuild(), drawBuild()]);
  return (
    <section className={`mx-auto mt-5 w-full max-w-xl rounded-2xl border p-4 ${pick.build ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'}`}>
      <h3 className="flex items-center justify-center gap-2 text-center text-lg font-bold text-white">Build Path <span aria-hidden="true">-</span> {pick.type !== 'Random' ? <GameIconImage src={`/class-icons/${pick.type.toLowerCase()}.png`} alt="" width={20} height={20} className="rounded-sm" /> : null}<span>{pick.type}</span></h3>
      <p className="mb-3 mt-1 text-center text-xs leading-5 text-slate-400">The build path this pick will follow.</p>
      <RandodraftSpinner label="Build path" options={pick.build ? [...options, buildOption(pick.build)] : options} drawOption={drawBuild} value={pick.build?.join(',') ?? null} disabled={disabled} onBusyChange={onBusyChange} onSpin={(id) => onBuild(id.split(','))} />
    </section>
  );
}

export function Randodraft() {
  const router = useRouter();
  const [settings, setSettings] = useState<DraftSettings>({ ...DEFAULT_DRAFT_SETTINGS });
  const [state, dispatch] = useReducer(draftReducer, undefined, createDraftState);
  const [busySpinners, setBusySpinners] = useState<Set<DraftCategory | 'build'>>(() => new Set());
  const spinning = busySpinners.size > 0;
  function setSpinnerBusy(category: DraftCategory | 'build', busy: boolean) {
    setBusySpinners((current) => {
      const next = new Set(current);
      if (busy) next.add(category); else next.delete(category);
      return next;
    });
  }
  const history = useRandodraftHistory();
  const draftOwnerRef = useRef<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const [savedProgress, setSavedProgress] = useState<SavedRandodraft | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [loadedProgressKey, setLoadedProgressKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const remainingManual = state.settings.manualSelections - state.current.manualCategories.length;
  const complete = isCompletePick(state.current, state.settings.gameMode);
  const categories = draftCategories(state.settings.gameMode).map((id) => CATEGORY_CONFIG[id]);
  const categorySummary = state.settings.gameMode === 'aram' ? 'Champion and Class' : 'Champion, Lane, and Class';
  const options = useMemo(() => Object.fromEntries(categories.map(({ id }) => [
    id, availableDraftValues(id, state.picks, state.settings.randomBuildType, state.settings.gameMode).map((value) => optionFor(id, value)),
  ])) as Record<DraftCategory, DraftSpinnerOption[]>, [categories, state.picks, state.settings.gameMode, state.settings.randomBuildType]);
  useEffect(() => {
    if (state.phase !== 'lobby') headingRef.current?.focus();
  }, [state.phase, state.picks.length]);


  useEffect(() => {
    if (!history.resolved) return;
    const key = randodraftProgressKey(history.userId);
    setBusySpinners(new Set());
    dispatch({ type: 'lobby' });
    draftIdRef.current = null;
    draftOwnerRef.current = history.userId;
    try {
      setSavedProgress(readSavedRandodraft(history.userId));
      setProgressError(null);
    } catch {
      setSavedProgress(null);
      setProgressError('Local saving is unavailable in this browser.');
    }
    setLoadedProgressKey(key);
  }, [history.resolved, history.userId]);

  useEffect(() => {
    if (!history.resolved || loadedProgressKey !== randodraftProgressKey(history.userId)
      || !draftIdRef.current || draftOwnerRef.current !== history.userId) return;
    try {
      if (state.phase === 'drafting') {
        const saved: SavedRandodraft = { id: draftIdRef.current, version: RANDODRAFT_VERSION, savedAt: new Date().toISOString(), state };
        window.localStorage.setItem(loadedProgressKey, JSON.stringify(saved));
        setSavedProgress(saved);
        setProgressError(null);
      } else if (state.phase === 'finished') {
        window.localStorage.removeItem(loadedProgressKey);
        setSavedProgress(null);
      }
    } catch {
      setProgressError('Your progress could not be saved locally.');
    }
  }, [state, loadedProgressKey, history.resolved, history.userId]);

  function resume() {
    if (!savedProgress) return;
    draftIdRef.current = savedProgress.id;
    draftOwnerRef.current = history.userId;
    setSettings(savedProgress.state.settings);
    setBusySpinners(new Set());
    dispatch({ type: 'resume', state: savedProgress.state });
  }

  function start() {
    draftOwnerRef.current = history.userId;
    draftIdRef.current = crypto.randomUUID();
    setBusySpinners(new Set());
    dispatch({ type: 'start', settings });
    playUiSound('random-select');
  }

  return (
    <MultiplayerLobbyShell maxWidthClassName={state.phase === 'lobby' ? 'max-w-6xl' : 'max-w-7xl'}>
      <MultiplayerLobbyHeader title="Randodraft" eyebrow="Single Player Game"
        subtitle={state.phase === 'lobby' ? null : state.phase === 'finished' ? 'Your completed draft' : 'Try to roll for the best random team'}
        hideStatus={state.phase === 'lobby'}
        statusLabel={state.phase === 'finished' ? 'Finished' : `Pick ${state.picks.length + 1} of 5`}
        infoSteps={INFO_STEPS} backLabel={state.phase === 'lobby' ? 'Back to games' : 'Back to lobby'}
        onBack={() => {
          if (state.phase === 'lobby') router.push('/games');
          else { setBusySpinners(new Set()); dispatch({ type: 'lobby' }); }
        }} />

      {state.phase === 'lobby' ? (
        <MultiplayerLobbyCard>
          <div className="grid gap-5 p-1 sm:gap-6 sm:p-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section aria-label="Game settings" className="flex min-w-0 flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Game settings</p>
              <h2 className="mb-5 mt-2 text-xl font-bold text-white">Set your draft rules</h2>
              <AppSelectMenu<DraftGameMode> label="Game mode" value={settings.gameMode}
                onChange={(value) => setSettings((current) => ({ ...current, gameMode: value }))}
                headerDescription="Choose the map and draft rules for this Randodraft."
                options={[
                  { value: 'summoners-rift', label: "Summoner's Rift", description: 'Draft one unique champion for each lane with the full Rift item pool.' },
                  { value: 'aram', label: 'ARAM', description: 'Draft five unique champions without lanes using the Howling Abyss item pool.' },
                ]} />
              <p className="mb-5 mt-2 text-xs leading-5 text-slate-400">{settings.gameMode === 'aram' ? 'ARAM hides lane selection and uses Howling Abyss items.' : "Summoner's Rift uses one champion per lane."}</p>
              <AppSelectMenu<0 | 1 | 2> label="Manual selections per pick" value={settings.manualSelections}
                onChange={(value) => setSettings((current) => ({ ...current, manualSelections: value }))}
                headerDescription="This allowance resets for each of your five picks. You can always choose to spin instead."
                options={[
                  { value: 0, label: '0 · Spin all categories', description: categorySummary + ' must all be spun.' },
                  { value: 1, label: '1 · Choose one category', description: 'Manually choose up to one category; spin the others in ' + categorySummary + '.' },
                  { value: 2, label: '2 · Choose two categories', description: 'Manually choose up to two categories; spin the last in ' + categorySummary + '.' },
                ]} />
              <p className="mb-5 mt-2 text-xs leading-5 text-slate-400">Choose up to {Math.min(settings.manualSelections, categories.length)} of the {categories.length} categories yourself for every pick.</p>
              <AppSelectMenu<RandomBuildTypeMode> label="Random Build Type" value={settings.randomBuildType}
                onChange={(value) => setSettings((current) => ({ ...current, randomBuildType: value }))}
                headerDescription="Random builds can mix items from any type while keeping normal equipment restrictions."
                options={[
                  { value: 'none', label: 'No random build types', description: 'Draft Fighter, Marksman, Assassin, Tank, Mage, or Support builds.' },
                  { value: 'allow', label: 'Allow random build types', description: 'Add \'Random\' to the build type options.' },
                  { value: 'all', label: 'All build types are random', description: 'Every pick uses a Random build type.' },
                ]} />
              <p className="mb-5 mt-2 text-xs leading-5 text-slate-400">Random builds mean any item can be chosen.</p>
              <button type="button" onClick={start} disabled={!history.resolved} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <Play size={17} />Play
              </button>
            </section>
            <div className="min-w-0 space-y-4">
              {savedProgress && savedProgress.state.picks.length > 0 ? <button type="button" onClick={resume} className="w-full rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4 text-left transition hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-300">
                <span className="block text-sm font-bold text-amber-200">Resume Randodraft</span>
                <span className="mt-1 block text-xs text-slate-300">{savedProgress.state.picks.length}/5 picks complete</span>
              </button> : null}
              <RandodraftHistory history={history} />
            </div>
          </div>
        </MultiplayerLobbyCard>
      ) : (
        <>
          <RandodraftTeam gameMode={state.settings.gameMode} picks={state.picks} current={state.phase === 'drafting' ? state.current : undefined} names={state.pickNames}
            onRename={state.phase === 'drafting' ? (index, name) => dispatch({ type: 'rename', index, name }) : undefined} />
          {state.phase === 'drafting' ? (
            <MultiplayerLobbyCard>
              <div key={`pick-${state.picks.length}`} aria-label="Current pick">
                <div className="relative mb-4 flex min-h-7 items-center justify-center">
                  <h2 ref={headingRef} tabIndex={-1} className="text-center text-base font-bold text-white outline-none">{state.pickNames[state.picks.length]} <span className="sr-only">{state.picks.length + 1}/{RANDODRAFT_TEAM_SIZE}</span></h2>
                  {state.settings.manualSelections > 0 ? <p className="absolute right-0 text-xs font-semibold text-amber-200" role="status">{remainingManual} manual {remainingManual === 1 ? 'selection' : 'selections'} remaining this pick</p> : null}
                </div>
                <div className={`mx-auto grid max-w-5xl items-start gap-3 sm:gap-4 ${categories.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                  {categories.map(({ id, label, icon }) => (
                    <RandodraftCategory key={id} label={label} icon={icon} options={options[id]} value={state.current[id]}
                      busy={busySpinners.has(id)} manualAllowance={remainingManual} showManualControl={state.settings.manualSelections > 0}
                      manuallySelected={state.current.manualCategories.includes(id)}
                      onBusyChange={(busy) => setSpinnerBusy(id, busy)}
                      onSelect={(value, manual) => dispatch({ type: 'select', category: id, value, manual })} />
                  ))}
                </div>
              </div>
              {complete ? <BuildSpinner key={`build-${state.picks.length}`} pick={state.current as CompleteDraftPick} gameMode={state.settings.gameMode} disabled={busySpinners.has('build')} onBusyChange={(busy) => setSpinnerBusy('build', busy)} onBuild={(itemIds) => dispatch({ type: 'build', itemIds })} /> : null}
              <div className="mt-5 flex flex-col items-center gap-2">
                <button type="button" disabled={!complete || !state.current.build || spinning} onClick={() => {
                  const next = draftReducer(state, { type: 'next' });
                  dispatch({ type: 'next' });
                  if (next.phase === 'finished' && draftIdRef.current && draftOwnerRef.current === history.userId) {
                    void history.save({ id: draftIdRef.current, settings: next.settings, picks: next.picks, version: RANDODRAFT_VERSION }, draftOwnerRef.current);
                  }
                  playUiSound(next.phase === 'finished' ? 'puzzle-complete' : 'item-slide');
                }}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-8 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                  {state.picks.length === RANDODRAFT_TEAM_SIZE - 1 ? 'Finish' : 'Next'}<ArrowRight size={16} />
                </button>
                {complete ? <p className="text-center text-xs text-slate-500">{!state.current.build ? 'Lock in your build to continue.' : 'Your pick is ready.'}</p> : null}
              </div>
            </MultiplayerLobbyCard>
          ) : (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="sr-only">Draft finished</h2>
              <RandodraftResults gameMode={state.settings.gameMode} picks={state.picks} />
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
