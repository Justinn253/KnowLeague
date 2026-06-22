'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Play, RefreshCw, SlidersHorizontal, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getOrCreateClientId } from '@/lib/game-storage';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { AbilityBlitz } from '@/components/ability-blitz';
import { SkinChampion } from '@/components/skin-champion';
import { MultiplayerGameProgress } from '@/components/multiplayer-game-progress';
import { ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { DifficultyLabel, getDifficultyStyle } from '@/components/difficulty-style';
import { GameSettingsSection } from '@/components/game-settings-section';
import { GameInfoMenu } from '@/components/game-info-menu';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { ABILITY_SLOTS, formatAbilitySlotSelection, type AbilitySlotId } from '@/lib/ability-slots';
import type {
  MultiplayerQuizDifficulty,
  MultiplayerQuizGameMode,
  MultiplayerQuizLobbyView,
  MultiplayerQuizPlayerResult,
  MultiplayerQuizPublicLobby,
} from '@/lib/multiplayer-quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';

type SettingOption = { id: string; name: string; description: string };
type MultiplayerQuizConfig = {
  gameMode: MultiplayerQuizGameMode;
  title: string;
  route: string;
  difficulties: SettingOption[];
  modifiers: SettingOption[];
};

const difficulties: SettingOption[] = [
  { id: 'iron', name: 'Iron', description: 'Most forgiving timing, hints, and upcoming-item visibility.' },
  { id: 'gold', name: 'Gold', description: 'Balanced timing, delayed hints, and standard penalties.' },
  { id: 'diamond', name: 'Diamond', description: 'Long hint delays, hidden previews, and scaling penalties.' },
  { id: 'challenger', name: 'Challenger', description: 'No hints, no auto-fill, and a single wrong answer ends the run.' },
];

const configs: Record<MultiplayerQuizGameMode, MultiplayerQuizConfig> = {
  ability_blitz: {
    gameMode: 'ability_blitz',
    title: 'Ability Blitz',
    route: '/multiplayer/ability-blitz',
    difficulties,
    modifiers: [
      { id: 'greyscale', name: 'Greyscale', description: 'Ability icons are greyscaled.' },
      { id: 'pixelated', name: 'Pixelated', description: 'Ability icons are pixelated.' },
      { id: 'rotating', name: 'Rotating', description: 'Ability icons continuously rotate.' },
      { id: 'disappearing', name: 'Disappearing', description: 'Ability icons disappear after five seconds.' },
      { id: 'hiddenTimer', name: 'Hidden Timer', description: 'The timer is hidden during play.' },
      { id: 'confirmEntry', name: 'Confirm Entry', description: 'Answers require confirmation before submission.' },
    ],
  },
  skin_champion: {
    gameMode: 'skin_champion',
    title: 'Skin Champion',
    route: '/multiplayer/skin-champion',
    difficulties,
    modifiers: [
      { id: 'greyscale', name: 'Greyscale', description: 'Skin splash art is greyscaled.' },
      { id: 'blurred', name: 'Blurred', description: 'Skin splash art is slightly blurred.' },
      { id: 'cropped', name: 'Cropped', description: 'Only a cropped section of the splash art is shown.' },
      { id: 'hiddenTimer', name: 'Hidden Timer', description: 'The timer is hidden during play.' },
      { id: 'confirmEntry', name: 'Confirm Entry', description: 'Answers require confirmation before submission.' },
    ],
  },
};

const getLobbyStorageKey = (gameMode: MultiplayerQuizGameMode) => `knowleague:v1:multiplayer:${gameMode}:lobby-code`;

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Multiplayer lobby request failed.');
  }
  return data as MultiplayerQuizLobbyView;
}

export function MultiplayerQuizLobby({ gameMode }: { gameMode: MultiplayerQuizGameMode }) {
  const router = useRouter();
  const config = configs[gameMode];
  const [clientId, setClientId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [view, setView] = useState<MultiplayerQuizLobbyView | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [publicLobbies, setPublicLobbies] = useState<MultiplayerQuizPublicLobby[]>([]);
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const latestLobbyRef = useRef<{ code: string; clientId: string; status: MultiplayerQuizLobbyView['lobby']['status'] } | null>(null);
  const isLeavingLobbyRef = useRef(false);

  useMultiplayerAuthTransition(async () => {
    const activeLobby = latestLobbyRef.current;
    if (!activeLobby) return;

    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    window.localStorage.removeItem(getLobbyStorageKey(gameMode));
    setView(null);
    setMessage('');
    window.history.replaceState(null, '', config.route);
    await fetch(`/api/multiplayer/lobbies/${activeLobby.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: activeLobby.clientId, forfeit: true }),
    }).catch(() => undefined);
    router.push('/');
  });

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const selectedModifiers = useMemo(() => new Set(view?.lobby.modifiers ?? []), [view?.lobby.modifiers]);
  const connectedLobbyCode = view && (view.lobby.status === 'waiting' || view.lobby.status === 'active')
    ? view.lobby.code
    : null;

  useEffect(() => {
    latestLobbyRef.current = view && clientId
      ? { code: view.lobby.code, clientId, status: view.lobby.status }
      : null;
  }, [clientId, view]);

  useEffect(() => {
    const disconnectOnPageExit = () => {
      const activeLobby = latestLobbyRef.current;
      if (!activeLobby) return;
      const endpoint = activeLobby.status === 'waiting' ? 'leave' : 'heartbeat';
      if (endpoint === 'leave') window.localStorage.removeItem(getLobbyStorageKey(gameMode));
      const body = JSON.stringify({
        clientId: activeLobby.clientId,
        ...(endpoint === 'heartbeat' ? { connected: false } : {}),
      });
      const url = `/api/multiplayer/lobbies/${activeLobby.code}/${endpoint}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      }
    };
    window.addEventListener('pagehide', disconnectOnPageExit);
    return () => window.removeEventListener('pagehide', disconnectOnPageExit);
  }, [gameMode]);

  const applyView = useCallback((nextView: MultiplayerQuizLobbyView) => {
    if (isLeavingLobbyRef.current) return;
    if (nextView.lobby.status === 'terminated') {
      latestLobbyRef.current = null;
      window.localStorage.removeItem(getLobbyStorageKey(gameMode));
      setRejoinCandidate(null);
      setView(null);
      router.replace('/');
      return;
    }
    if (!nextView.requestingPlayer && latestLobbyRef.current) {
      latestLobbyRef.current = null;
      setView(null);
      setMessage('You were removed from the lobby.');
      window.history.replaceState(null, '', config.route);
      return;
    }
    setView(nextView);
    setRejoinCandidate(null);
    if (nextView.lobby.status === 'waiting' || nextView.lobby.status === 'active') {
      window.localStorage.setItem(getLobbyStorageKey(gameMode), nextView.lobby.code);
    } else {
      window.localStorage.removeItem(getLobbyStorageKey(gameMode));
    }
    window.history.replaceState(null, '', `${config.route}?code=${nextView.lobby.code}`);
  }, [config.route, gameMode, router]);

  const refreshLobby = useCallback(async (code: string, activeClientId: string) => {
    if (isLeavingLobbyRef.current) return;
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${code}?clientId=${encodeURIComponent(activeClientId)}`);
      if (response.status === 404) {
        latestLobbyRef.current = null;
        setView(null);
        router.replace('/');
        return;
      }
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to refresh lobby.');
    }
  }, [applyView, router]);

  const loadPublicLobbies = useCallback(async () => {
    try {
      const response = await fetch(`/api/multiplayer/lobbies/public?gameMode=${gameMode}`);
      if (response.ok) setPublicLobbies(await response.json());
    } catch {
      // Public discovery is optional; code-based joining remains available.
    }
  }, [gameMode]);

  useEffect(() => {
    if (view || isLeavingLobbyRef.current) return undefined;
    void loadPublicLobbies();
    return undefined;
  }, [loadPublicLobbies, view]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const nextClientId = getOrCreateClientId();
      if (!nextClientId) {
        return;
      }
      setClientId(nextClientId);
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (cancelled) {
        return;
      }

      const inviteCode = new URLSearchParams(window.location.search).get('code')?.trim().toUpperCase();
      if (!inviteCode) {
        const storedCode = window.localStorage.getItem(getLobbyStorageKey(gameMode));
        if (storedCode) {
          try {
            const response = await fetch(`/api/multiplayer/lobbies/${storedCode}/rejoin?clientId=${encodeURIComponent(nextClientId)}`);
            const eligibility = await response.json() as ReconnectCandidate & { eligible: boolean };
            if (eligibility.eligible && !cancelled) {
              setRejoinCandidate({ code: eligibility.code, expiresAt: eligibility.expiresAt });
            } else {
              window.localStorage.removeItem(getLobbyStorageKey(gameMode));
            }
          } catch {
            window.localStorage.removeItem(getLobbyStorageKey(gameMode));
          }
        }
        return;
      }
      setJoinCode(inviteCode);
      setBusy(true);
      try {
        const response = await fetch('/api/multiplayer/lobbies/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
          },
          body: JSON.stringify({
            code: inviteCode,
            gameMode,
            clientId: nextClientId,
          }),
        });
        applyView(await readResponse(response));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to join lobby.');
        window.history.replaceState(null, '', config.route);
      } finally {
        setBusy(false);
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [applyView, config.route, gameMode]);

  useEffect(() => {
    if (!view?.lobby.id || !clientId) {
      return undefined;
    }
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }
    const channel = supabase
      .channel(`multiplayer-quiz-lobby:${view.lobby.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'multiplayer_quiz_lobby_events',
        filter: `lobby_id=eq.${view.lobby.id}`,
      }, () => void refreshLobby(view.lobby.code, clientId))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, refreshLobby, view?.lobby.code, view?.lobby.id]);

  useEffect(() => {
    if (!connectedLobbyCode || !clientId) {
      return undefined;
    }
    const code = connectedLobbyCode;
    const sendHeartbeat = async () => {
      try {
        const response = await fetch(`/api/multiplayer/lobbies/${code}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
        applyView(await readResponse(response));
      } catch {
        // Realtime or the next heartbeat will retry transient failures.
      }
    };
    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, MULTIPLAYER_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [connectedLobbyCode, applyView, clientId]);

  useEffect(() => {
    if (!view || !clientId || view.lobby.status !== 'active') return undefined;
    const deadlines = view.players
      .filter((player) => !player.connected && player.result === 'active' && player.disconnected_at)
      .map((player) => new Date(player.disconnected_at as string).getTime() + 60_000);
    if (deadlines.length === 0) return undefined;
    const delay = Math.max(0, Math.min(...deadlines) - Date.now() + 150);
    const timeout = window.setTimeout(() => void refreshLobby(view.lobby.code, clientId), delay);
    return () => window.clearTimeout(timeout);
  }, [clientId, refreshLobby, view]);

  const createLobby = async () => {
    if (!clientId) {
      return;
    }
    setBusy(true);
    isLeavingLobbyRef.current = false;
    setMessage('');
    try {
      const { data } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch('/api/multiplayer/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ gameMode, clientId }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobbyByCode = async (code: string) => {
    if (!clientId) {
      return;
    }
    setBusy(true);
    isLeavingLobbyRef.current = false;
    setMessage('');
    try {
      const { data } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch('/api/multiplayer/lobbies/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ code, gameMode, clientId }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobby = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await joinLobbyByCode(joinCode);
  };

  const leaveLobby = async () => {
    if (!view || !clientId) {
      router.push('/');
      return;
    }
    const code = view.lobby.code;
    const wasWaiting = view.lobby.status === 'waiting';
    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    setView(null);
    setMessage('');
    window.history.replaceState(null, '', config.route);
    if (wasWaiting) window.localStorage.removeItem(getLobbyStorageKey(gameMode));
    setPublicLobbies((current) => current.filter((lobby) => lobby.code !== code));
    await fetch(`/api/multiplayer/lobbies/${code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    }).catch(() => undefined);
    if (wasWaiting) {
      isLeavingLobbyRef.current = false;
      await loadPublicLobbies();
    } else {
      router.push('/');
    }
  };

  const updateSettings = async (
    difficulty: MultiplayerQuizDifficulty,
    modifiers: string[],
    totalItems = view?.lobby.total_items ?? 50,
    isPublic = view?.lobby.is_public ?? false,
    abilitySlots: AbilitySlotId[] = view?.lobby.ability_slots ?? [...ABILITY_SLOTS.map((slot) => slot.id)],
  ) => {
    if (!view || !clientId || !isHost) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, difficulty, modifiers, totalItems, isPublic, abilitySlots }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby settings.');
    } finally {
      setBusy(false);
    }
  };

  const managePlayer = async (action: 'kick' | 'make-host', targetPlayerId: string) => {
    if (!view || !clientId || !isHost) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, targetPlayerId }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby player.');
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!view || !clientId || !isHost) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  };

  const reportProgress = useCallback(async (progress: number, elapsedSeconds: number, result: MultiplayerQuizPlayerResult) => {
    if (!view || !clientId) {
      return;
    }
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, progress, elapsedSeconds, result }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update multiplayer progress.');
    }
  }, [applyView, clientId, view]);

  const copyInvite = () => {
    if (!view) {
      return;
    }
    void navigator.clipboard.writeText(`${window.location.origin}${config.route}?code=${view.lobby.code}`);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1400);
  };

  if (view && view.lobby.status !== 'waiting' && view.requestingPlayer && view.quizItems.length > 0) {
    const runtime = {
      items: view.quizItems,
      difficulty: view.lobby.difficulty,
      modifiers: view.lobby.modifiers,
      initialProgress: view.requestingPlayer.progress,
      initialElapsedSeconds: view.requestingPlayer.elapsed_seconds,
      gameEnded: view.lobby.status === 'finished',
      progressPanel: <MultiplayerGameProgress players={view.players} totalItems={view.lobby.total_items} />,
      onProgress: reportProgress,
      onExit: leaveLobby,
    };
    return gameMode === 'ability_blitz'
      ? <AbilityBlitz multiplayer={runtime} />
      : <SkinChampion multiplayer={runtime} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-6 py-6 lg:px-12">
        <header className="relative z-30 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={leaveLobby} aria-label="Back" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
              <h1 className="text-xl font-semibold text-white">{config.title}</h1>
              <p className="mt-1 text-xs text-slate-400">{view ? 'Lobby' : 'Create or join a lobby'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GameInfoMenu title={config.title} steps={gameMode === 'ability_blitz' ? [
              'Identify the ability shown and submit its exact name.',
              'Correct answers advance through the shared randomized set; difficulty controls hints and penalties.',
              'Finish the set before your opponents.',
            ] : [
              'Identify the skin splash art and submit its exact skin name.',
              'Use hints and autocomplete when the selected difficulty allows them.',
              'Finish the shared randomized set before your opponents.',
            ]} />
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
              <Users size={16} className="text-amber-300" />
              {view?.lobby.status === 'waiting'
                ? `Lobby - ${view.players.length >= view.lobby.max_players ? 'Full' : 'Waiting for players'}`
                : view?.lobby.status === 'active'
                  ? 'In Progress'
                  : view?.lobby.status === 'finished'
                    ? 'Finished'
                    : 'Lobby'}
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
          {!view ? (
            <div className="mx-auto max-w-4xl py-1">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Create or Join</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Set up an {config.title} lobby</h2>
              </div>
              <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
                <button type="button" onClick={createLobby} disabled={busy || !clientId} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                  Create Lobby
                </button>
                <span className="hidden pb-3 text-sm font-semibold text-slate-500 lg:block">OR</span>
                <form onSubmit={joinLobby} className="grid gap-2">
                  <label htmlFor="join-code" className="text-xs uppercase tracking-[0.18em] text-slate-500">Join code</label>
                  <div className="flex gap-2">
                    <input id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} maxLength={6} autoComplete="off" placeholder="ABC123" className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm uppercase tracking-[0.16em] text-white outline-none placeholder:text-slate-600 focus:border-white/20" />
                    <button type="submit" disabled={busy || joinCode.trim().length !== 6} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60">Join</button>
                  </div>
                </form>
              </div>
              <div className="mt-8 border-t border-white/10 pt-6">
                {rejoinCandidate ? (
                  <ReconnectButton
                    candidate={rejoinCandidate}
                    disabled={busy}
                    onReconnect={() => void joinLobbyByCode(rejoinCandidate.code)}
                    onExpire={() => {
                      window.localStorage.removeItem(getLobbyStorageKey(gameMode));
                      setRejoinCandidate(null);
                    }}
                  />
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Public Lobbies</p>
                    <p className="mt-1 text-sm text-slate-400">Join a waiting game without a code.</p>
                  </div>
                  <button type="button" onClick={() => void loadPublicLobbies()} disabled={busy} title="Refresh public lobbies" aria-label="Refresh public lobbies" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-60">
                    <RefreshCw size={17} />
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {publicLobbies.length ? publicLobbies.map((lobby) => (
                    <button key={lobby.code} type="button" onClick={() => joinLobbyByCode(lobby.code)} disabled={busy} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-amber-300/40 hover:bg-slate-950 disabled:opacity-60">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{lobby.hostName}&apos;s lobby</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                          <DifficultyLabel difficulty={lobby.difficulty} />
                          <span aria-hidden="true">|</span>
                          <span>{lobby.totalItems} Entries</span>
                          {lobby.gameMode === 'ability_blitz' ? (
                            <><span aria-hidden="true">|</span><span>Abilities: {formatAbilitySlotSelection(lobby.abilitySlots)}</span></>
                          ) : null}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {lobby.modifiers.length > 0 ? lobby.modifiers.map((modifierId) => (
                            <span key={modifierId} className="rounded-md border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[0.65rem] font-semibold text-violet-200">
                              {config.modifiers.find((modifier) => modifier.id === modifierId)?.name ?? modifierId}
                            </span>
                          )) : <span className="text-[0.65rem] text-slate-500">No modifiers</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-slate-300">{lobby.playerCount}/{lobby.maxPlayers}</span>
                    </button>
                  )) : <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-500">No public lobbies are waiting.</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Lobby code</span>
                <span className="font-mono text-lg font-semibold tracking-[0.24em] text-white">{codeRevealed ? view.lobby.code : '******'}</span>
                <button type="button" onClick={() => setCodeRevealed((value) => !value)} aria-label={codeRevealed ? 'Hide lobby code' : 'Reveal lobby code'} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800">
                  {codeRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button type="button" onClick={copyInvite} aria-label="Copy lobby invite" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800">
                  {codeCopied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                </button>
              </div>

              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                <MultiplayerLobbyRoster
                  countLabel={`${view.players.length}/${view.lobby.max_players} Players`}
                  canManage={isHost && view.lobby.status === 'waiting'}
                  players={view.players.map((player) => ({
                    id: player.id,
                    authUserId: player.auth_user_id,
                    displayName: player.display_name,
                    role: player.role,
                    isCurrentUser: player.is_requesting_player,
                    isHost: player.id === view.lobby.host_player_id,
                    status: player.id === view.lobby.host_player_id ? <Check size={16} className="text-emerald-300" /> : null,
                  }))}
                  onKick={(playerId) => managePlayer('kick', playerId)}
                  onMakeHost={(playerId) => managePlayer('make-host', playerId)}
                />

                <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Game Settings</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Difficulty and modifiers</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                        Entries
                        <select value={view.lobby.total_items} disabled={!isHost || busy} onChange={(event) => updateSettings(view.lobby.difficulty, view.lobby.modifiers, Number(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none disabled:opacity-60">
                          {[10, 25, 50, 75, 100].map((count) => <option key={count} value={count}>{count}</option>)}
                        </select>
                      </label>
                      <SlidersHorizontal size={20} className="text-amber-300" />
                    </div>
                  </div>
                  <button type="button" disabled={!isHost || busy} onClick={() => updateSettings(view.lobby.difficulty, view.lobby.modifiers, view.lobby.total_items, !view.lobby.is_public)} className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${view.lobby.is_public ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'} disabled:opacity-60`}>
                    <span><span className="block text-sm font-semibold text-white">Public lobby</span><span className="mt-1 block text-xs text-slate-400">Allow players to discover and join this lobby.</span></span>
                    <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${view.lobby.is_public ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${view.lobby.is_public ? 'translate-x-5' : ''}`} /></span>
                  </button>
                  <fieldset className="mt-5 grid gap-5">
                    <legend className="sr-only">Game settings</legend>
                    <GameSettingsSection title="Difficulty" defaultOpen summary={<DifficultyLabel difficulty={view.lobby.difficulty} />}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {config.difficulties.map((difficulty) => (
                          <button key={difficulty.id} type="button" disabled={!isHost || busy} onClick={() => updateSettings(difficulty.id as MultiplayerQuizDifficulty, view.lobby.modifiers)} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${view.lobby.difficulty === difficulty.id ? getDifficultyStyle(difficulty.id).selected : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                            <DifficultyLabel difficulty={difficulty.id} className="text-sm" />
                            <span className="mt-1 block text-xs leading-5 text-slate-400">{difficulty.description}</span>
                          </button>
                        ))}
                      </div>
                    </GameSettingsSection>
                    <GameSettingsSection title="Modifiers" summary={`${view.lobby.modifiers.length} active`}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {config.modifiers.map((modifier) => {
                          const checked = selectedModifiers.has(modifier.id);
                          return (
                            <button key={modifier.id} type="button" disabled={!isHost || busy} onClick={() => updateSettings(view.lobby.difficulty, checked ? view.lobby.modifiers.filter((id) => id !== modifier.id) : [...view.lobby.modifiers, modifier.id])} className={`flex items-start justify-between gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${checked ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                              <span><span className="block text-sm font-bold text-white">{modifier.name}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{modifier.description}</span></span>
                              <span className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-violet-500' : 'bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} /></span>
                            </button>
                          );
                        })}
                      </div>
                    </GameSettingsSection>
                    {gameMode === 'ability_blitz' ? (
                      <GameSettingsSection title="Ability Set" summary={`${view.lobby.ability_slots.length}/5`}>
                        <p className="mb-3 text-xs leading-5 text-slate-400">Select which abilities can appear in the shared round.</p>
                        <div className="grid grid-cols-5 gap-2">
                          {ABILITY_SLOTS.map((slot) => {
                            const selected = view.lobby.ability_slots.includes(slot.id);
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                title={slot.name}
                                disabled={!isHost || busy}
                                onClick={() => {
                                  if (selected && view.lobby.ability_slots.length === 1) return;
                                  const nextSlots = selected
                                    ? view.lobby.ability_slots.filter((id) => id !== slot.id)
                                    : [...view.lobby.ability_slots, slot.id];
                                  void updateSettings(view.lobby.difficulty, view.lobby.modifiers, view.lobby.total_items, view.lobby.is_public, nextSlots);
                                }}
                                className={`flex h-12 items-center justify-center rounded-xl border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-65 ${selected ? 'border-amber-300/60 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900/80 text-slate-400 hover:border-white/25'}`}
                              >
                                {slot.label}
                              </button>
                            );
                          })}
                        </div>
                      </GameSettingsSection>
                    ) : null}
                  </fieldset>
                  {!isHost ? <p className="mt-4 text-xs text-slate-500">Only the host can change game settings.</p> : null}
                </section>
              </div>

              <div className="flex flex-col items-center gap-3 py-1">
                <button type="button" disabled={!isHost || view.players.length < 2 || busy} onClick={startGame} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-8 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <Play size={17} /> Start Game
                </button>
                <p className="text-xs text-slate-500">The host can start once at least two players have joined.</p>
              </div>
            </div>
          )}

          {message ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-300">{message}</p> : null}
        </section>

      </section>
    </main>
  );
}
