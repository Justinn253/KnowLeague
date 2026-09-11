'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Dices, Hand, MapPin, Play, Search, Swords, User } from 'lucide-react';
import { AppSelectMenu } from '@/components/app-select-menu';
import { GameIconImage } from '@/components/game-asset-image';
import { MultiplayerLobbyCard, MultiplayerLobbyHeader, MultiplayerLobbyShell } from '@/components/multiplayer-lobby-layout';
import { RandodraftSpinner, type DraftSpinnerOption } from '@/components/randodraft-spinner';
import { DraftBuildItems, RandodraftResults } from '@/components/randodraft-results';
import {
  availableDraftValues, createDraftState, DEFAULT_DRAFT_SETTINGS, DRAFT_CHAMPION_BY_ID,
  DRAFT_ITEM_BY_ID, draftReducer, generateDraftBuild,
  isCompletePick, RANDODRAFT_TEAM_SIZE, RANDODRAFT_VERSION,
  type CompleteDraftPick, type DraftCategory, type DraftPick, type DraftSettings, type RandomBuildTypeMode,
} from '@/lib/randodraft';
import { RandodraftHistory } from '@/components/randodraft-history';
import { useRandodraftHistory } from '@/components/use-randodraft-history';
import { playUiSound } from '@/lib/ui-sounds';

const INFO_STEPS = [
  'Draft a team of five, with one champion in each lane. Champions and lanes cannot repeat.',
  'Choose Champion, Lane, and Type in any order. Spin each vertical reel to lock in a random choice.',
  'Your manual-selection allowance resets for every pick. Choose up to that many categories yourself; spin the rest. Locked results cannot be changed.',
  'Random Build Type controls whether mixed-item Random builds are excluded, allowed alongside AD/AP/Tank, or used for every pick.',
  'AD items grant attack damage or attack speed, AP items grant ability power, and Tank items grant health, armor, or magic resistance. Items can qualify for more than one type.',
  'After all three categories are locked, optionally roll a six-item build. Boots are exempt from the stat type. Duplicate items and incompatible item groups are excluded.',
  'Press Next to draft another champion, then Finish to see the team on Summoner’s Rift. Back returns to the pre-game lobby.',
];
const CATEGORIES = [
  { id: 'champion', label: 'Champion', icon: User, description: 'Who joins your team?' },
  { id: 'lane', label: 'Lane', icon: MapPin, description: 'One pick for every lane.' },
  { id: 'type', label: 'Type', icon: Swords, description: 'Choose their build direction.' },
] as const;

function optionFor(category: DraftCategory, id: string): DraftSpinnerOption {
  const champion = category === 'champion' ? DRAFT_CHAMPION_BY_ID.get(id) : null;
  const label = champion?.name ?? id;
  return {
    id, label,
    content: <>{champion ? <GameIconImage src={champion.imageUrl} alt="" width={44} height={44} className="rounded-xl" /> : null}<span>{label}</span></>,
  };
}

function ManualDraftChoice({ label, options, disabled, onSelect }: {
  label: string; options: DraftSpinnerOption[]; disabled: boolean; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <div className="mt-2">
      <button type="button" disabled={disabled} aria-expanded={open && !disabled}
        onClick={() => { setOpen((current) => !current); setQuery(''); }}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs font-semibold text-slate-300 transition hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
        <Hand size={14} />Choose {label} manually
      </button>
      {open && !disabled ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950 p-2">
          <p className="mb-2 text-xs text-amber-200">Selecting a choice spends 1 manual selection and locks it in.</p>
          {options.length > 5 ? (
            <label className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 px-2">
              <Search size={14} className="text-slate-500" />
              <input aria-label={`Search ${label}`} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Search champions…" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none focus:ring-2 focus:ring-amber-300" />
            </label>
          ) : null}
          <div className="grid max-h-64 gap-1 overflow-y-auto" aria-label={`Manual ${label} choices`}>
            {matches.map((option) => (
              <button key={option.id} type="button" onClick={() => { onSelect(option.id); setOpen(false); playUiSound('autocomplete-select'); }}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-left text-sm text-slate-200 hover:border-amber-300/30 hover:bg-amber-300/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300">
                {option.label}
              </button>
            ))}
            {!matches.length ? <p className="p-2 text-sm text-slate-400">No champions match your search.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DraftProgress({ picks, current }: { picks: CompleteDraftPick[]; current?: DraftPick }) {
  return (
    <section aria-label="Current team" className="rounded-3xl border border-white/10 bg-slate-900/80 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Your team</h2>
        <span className="text-xs font-bold text-amber-200">{picks.length} / {RANDODRAFT_TEAM_SIZE} complete</span>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: RANDODRAFT_TEAM_SIZE }, (_, index) => {
          const pick = picks[index] ?? (index === picks.length ? current : undefined);
          const champion = pick?.champion ? DRAFT_CHAMPION_BY_ID.get(pick.champion) : null;
          const active = Boolean(current && index === picks.length);
          return (
            <li key={index} aria-current={active ? 'step' : undefined}
              className={`min-w-0 rounded-2xl border p-3 ${active ? 'border-amber-300/50 bg-amber-300/5' : 'border-white/10 bg-slate-950/60'}`}>
              <div className="flex items-center gap-2">
                {champion ? <GameIconImage src={champion.imageUrl} alt="" width={32} height={32} className="rounded-lg" />
                  : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-xs text-slate-500">{index + 1}</span>}
                <span className="truncate text-xs font-bold text-white">{champion?.name ?? `Pick ${index + 1}`}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{pick?.lane ?? 'Lane —'} · {pick?.type ?? 'Type —'}</p>
              {pick?.build ? <p className="mt-1 flex items-center gap-1 text-[0.65rem] text-emerald-300"><Check size={11} />Build rolled</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BuildSpinner({ pick, disabled, onBusyChange, onBuild }: {
  pick: CompleteDraftPick; disabled: boolean; onBusyChange: (busy: boolean) => void; onBuild: (ids: string[]) => void;
}) {
  const [options] = useState<DraftSpinnerOption[]>(() => {
    const champion = DRAFT_CHAMPION_BY_ID.get(pick.champion)!;
    return Array.from({ length: 12 }, () => {
      const ids = generateDraftBuild(champion, pick.type);
      return {
        id: ids.join(','),
        label: ids.map((id) => DRAFT_ITEM_BY_ID.get(id)!.name).join(', '),
        content: <span className="flex items-center justify-center gap-1 sm:gap-2">{ids.map((id) => {
          const item = DRAFT_ITEM_BY_ID.get(id)!;
          return <GameIconImage key={id} src={item.imageUrl} alt="" width={36} height={36} className="h-8 w-8 rounded-md sm:h-9 sm:w-9" />;
        })}</span>,
      };
    });
  });
  return (
    <section className="mx-auto mt-5 w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <h3 className="text-center text-lg font-bold text-white">Build path <span className="text-xs font-normal text-slate-400">Optional</span></h3>
      <p className="mb-3 mt-1 text-center text-xs leading-5 text-slate-400">Six items in purchase order. One pair of boots, plus {pick.type === 'Random' ? 'items from any build type' : `${pick.type} items`}.</p>
      <RandodraftSpinner label="Build path" options={options} value={pick.build?.join(',') ?? null} disabled={disabled} onBusyChange={onBusyChange} onSpin={(id) => onBuild(id.split(','))} />
      {pick.build ? <div className="mt-3"><DraftBuildItems ids={pick.build} /></div> : null}
    </section>
  );
}

export function Randodraft() {
  const router = useRouter();
  const [settings, setSettings] = useState<DraftSettings>({ ...DEFAULT_DRAFT_SETTINGS });
  const [state, dispatch] = useReducer(draftReducer, undefined, createDraftState);
  const [spinning, setSpinning] = useState(false);
  const history = useRandodraftHistory();
  const draftOwnerRef = useRef<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const remainingManual = state.settings.manualSelections - state.current.manualCategories.length;
  const complete = isCompletePick(state.current);
  const options = useMemo(() => Object.fromEntries(CATEGORIES.map(({ id }) => [
    id, availableDraftValues(id, state.picks, state.settings.randomBuildType).map((value) => optionFor(id, value)),
  ])) as Record<DraftCategory, DraftSpinnerOption[]>, [state.picks, state.settings.randomBuildType]);

  useEffect(() => {
    if (state.phase !== 'lobby') headingRef.current?.focus();
  }, [state.phase, state.picks.length]);

  function start() {
    draftOwnerRef.current = history.userId;
    draftIdRef.current = crypto.randomUUID();
    setSpinning(false);
    dispatch({ type: 'start', settings });
    playUiSound('random-select');
  }

  return (
    <MultiplayerLobbyShell maxWidthClassName={state.phase === 'lobby' ? 'max-w-6xl' : 'max-w-7xl'}>
      <MultiplayerLobbyHeader title="Randodraft" eyebrow="Single Player Game"
        subtitle={state.phase === 'lobby' ? null : state.phase === 'finished' ? 'Your completed draft' : 'Build the best team from your rolls'}
        hideStatus={state.phase === 'lobby'}
        statusLabel={state.phase === 'finished' ? 'Finished' : `Pick ${state.picks.length + 1} of 5`}
        infoSteps={INFO_STEPS} backLabel={state.phase === 'lobby' ? 'Back to games' : 'Back to lobby'}
        onBack={() => {
          if (state.phase === 'lobby') router.push('/games');
          else { setSpinning(false); dispatch({ type: 'lobby' }); }
        }} />

      {state.phase === 'lobby' ? (
        <MultiplayerLobbyCard>
          <div className="grid gap-5 p-1 sm:gap-6 sm:p-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section aria-label="Game settings" className="flex min-w-0 flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Game settings</p>
              <h2 className="mb-5 mt-2 text-xl font-bold text-white">Set your draft rules</h2>
              <AppSelectMenu<0 | 1 | 2> label="Manual selections per pick" value={settings.manualSelections}
                onChange={(value) => setSettings((current) => ({ ...current, manualSelections: value }))}
                headerDescription="This allowance resets for each of your five picks. You can always choose to spin instead."
                options={[
                  { value: 0, label: '0 · Spin all categories', description: 'Champion, Lane, and Type must all be spun.' },
                  { value: 1, label: '1 · Choose one category', description: 'Manually choose up to one category; spin the others.' },
                  { value: 2, label: '2 · Choose two categories', description: 'Manually choose up to two categories; spin the last.' },
                ]} />
              <p className="mb-5 mt-2 text-xs leading-5 text-slate-400">Choose up to {settings.manualSelections} of the three categories yourself for every pick.</p>
              <AppSelectMenu<RandomBuildTypeMode> label="Random Build Type" value={settings.randomBuildType}
                onChange={(value) => setSettings((current) => ({ ...current, randomBuildType: value }))}
                headerDescription="Random builds can mix items from any type while keeping normal equipment restrictions."
                options={[
                  { value: 'none', label: 'No random build types', description: 'Draft AD, AP, or Tank builds only.' },
                  { value: 'allow', label: 'Allow random build types', description: 'Add Random to the AD, AP, and Tank choices.' },
                  { value: 'all', label: 'All build types are random', description: 'Every pick uses a Random build type.' },
                ]} />
              <p className="mb-5 mt-2 text-xs leading-5 text-slate-400">Random builds can mix AD, AP, and Tank items.</p>
              <button type="button" onClick={start} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <Play size={17} />Play
              </button>
            </section>
            <RandodraftHistory history={history} />
          </div>
        </MultiplayerLobbyCard>
      ) : (
        <>
          <DraftProgress picks={state.picks} current={state.phase === 'drafting' ? state.current : undefined} />
          {state.phase === 'drafting' ? (
            <MultiplayerLobbyCard>
              <div className="mb-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Pick {state.picks.length + 1} / {RANDODRAFT_TEAM_SIZE}</p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black text-white outline-none">Let the draft unfold</h2>
                <p className="mt-2 text-sm text-slate-400">Choose the categories in any order. Every result locks in.</p>
                <p className="mt-2 text-xs font-semibold text-amber-200" role="status">{remainingManual} manual {remainingManual === 1 ? 'selection' : 'selections'} remaining this pick</p>
              </div>
              <div key={`categories-${state.picks.length}`} className="mx-auto grid max-w-5xl items-start gap-3 md:grid-cols-3 sm:gap-4">
                {CATEGORIES.map(({ id, label, icon: Icon, description }) => (
                  <section key={id} className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/60 p-3 sm:p-4">
                    <h3 className="flex items-center justify-center gap-2 text-base font-bold text-white"><Icon size={18} className="text-amber-300" />{label}</h3>
                    <p className="mb-3 mt-1 text-center text-xs text-slate-400">{description}</p>
                    <RandodraftSpinner label={label} options={options[id]} value={state.current[id]} disabled={spinning} onBusyChange={setSpinning}
                      onSpin={(value) => dispatch({ type: 'select', category: id, value, manual: false })} />
                    {state.settings.manualSelections > 0 ? <ManualDraftChoice label={label} options={options[id]}
                      disabled={spinning || remainingManual === 0 || state.current[id] !== null}
                      onSelect={(value) => dispatch({ type: 'select', category: id, value, manual: true })} /> : null}
                    {state.current.manualCategories.includes(id) ? <p className="mt-2 text-center text-xs text-amber-200">Manually selected</p> : null}
                  </section>
                ))}
              </div>
              {complete ? <BuildSpinner key={`build-${state.picks.length}`} pick={state.current as CompleteDraftPick} disabled={spinning} onBusyChange={setSpinning} onBuild={(itemIds) => dispatch({ type: 'build', itemIds })} /> : null}
              <div className="mt-5 flex flex-col items-center gap-2">
                <button type="button" disabled={!complete || spinning} onClick={() => {
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
                <p className="text-center text-xs text-slate-500">{!complete ? 'Lock all three categories to continue.' : !state.current.build ? 'Roll a build, or continue without one.' : 'Your pick is ready.'}</p>
              </div>
            </MultiplayerLobbyCard>
          ) : (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="sr-only">Draft finished</h2>
              <RandodraftResults picks={state.picks} />
              {history.saving ? <p role="status" className="text-center text-sm text-slate-400">Saving your draft...</p> : null}
              {history.error && history.userId ? <p role="status" className="text-center text-sm text-amber-200">{history.error} <button type="button" onClick={history.retry} className="underline">Retry</button></p> : null}
              <button type="button" onClick={() => dispatch({ type: 'lobby' })} className="mx-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 text-sm font-black text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"><Dices size={17} />New draft</button>
            </>
          )}
        </>
      )}
      <p className="text-center text-xs text-slate-600">League catalogue {RANDODRAFT_VERSION}</p>
    </MultiplayerLobbyShell>
  );
}
