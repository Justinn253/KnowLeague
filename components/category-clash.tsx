'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, MessageSquare, Play, RefreshCw, Send, Swords, Timer, Trophy, Users, X } from 'lucide-react';
import Link from 'next/link';
import { GameInfoMenu } from '@/components/game-info-menu';
import { GameSettingsSection } from '@/components/game-settings-section';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { MultiplayerDisconnectStatus, ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { getChatBubbleStyle, getChatNameStyle } from '@/lib/chat-colors';
import { getOrCreateClientId } from '@/lib/game-storage';
import { getReconnectDeadline, MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import type {
  CategoryClashCategory,
  CategoryClashChatMessage,
  CategoryClashGameMode,
  CategoryClashLobbyView,
  CategoryClashPublicLobby,
} from '@/lib/category-clash';

const STORAGE_KEY = 'knowleague:v1:category-clash:lobby-code';
const API_BASE = '/api/category-clash/lobbies';

type DraftSettings = {
  gameMode: CategoryClashGameMode;
  isPublic: boolean;
  enabledCategoryIds: string[];
};

function formatSeconds(seconds: number) {
  return `0:${Math.max(0, seconds).toString().padStart(2, '0')}`;
}

function createDraftSettings(view: CategoryClashLobbyView): DraftSettings {
  return {
    gameMode: view.lobby.game_mode,
    isPublic: view.lobby.is_public,
    enabledCategoryIds: view.lobby.enabled_category_ids,
  };
}

async function readLobbyResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Category Clash request failed.');
  }
  return data as CategoryClashLobbyView;
}

async function readPublicLobbiesResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load public lobbies.');
  }
  return data as CategoryClashPublicLobby[];
}

async function getAuthHeaders() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

function getPhaseLabel(view: CategoryClashLobbyView) {
  if (view.lobby.status === 'waiting') return 'Lobby';
  if (view.lobby.status === 'finished') return 'Finished';
  if (view.lobby.phase === 'countdown') return 'Starting';
  if (view.lobby.phase === 'review') return 'Review';
  if (view.lobby.phase === 'intermission') return 'Next turn';
  return view.lobby.game_mode === 'turns' ? 'Turn' : 'Round';
}

function getCategoryGroups(categories: CategoryClashCategory[]) {
  return [...categories.reduce((groups, category) => {
    const group = groups.get(category.group) ?? [];
    group.push(category);
    groups.set(category.group, group);
    return groups;
  }, new Map<string, CategoryClashCategory[]>()).entries()];
}

function getMessageToneClass(message: CategoryClashChatMessage) {
  if (message.tone === 'correct') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (message.tone === 'incorrect') return 'border-red-400/30 bg-red-500/10 text-red-100';
  return 'border-white/10 bg-slate-900/80 text-slate-200';
}

export function CategoryClash() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [view, setView] = useState<CategoryClashLobbyView | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<CategoryClashPublicLobby[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [draftSettings, setDraftSettings] = useState<DraftSettings | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const currentPlayer = view?.requestingPlayer ?? null;
  const activePlayers = view?.players.filter((player) => player.result === 'active') ?? [];
  const currentTurnPlayer = view?.players.find((player) => player.id === view.currentTurnPlayerId) ?? null;
  const currentPlayerSubmitted = Boolean(view && currentPlayer && view.submissions.some((submission) => (
    submission.player_id === currentPlayer.id &&
    submission.round_number === view.lobby.round_number &&
    submission.turn_sequence === view.lobby.turn_sequence
  )));
  const canAnswer = Boolean(
    view?.lobby.status === 'active' &&
    view.lobby.phase === 'answering' &&
    currentPlayer?.result === 'active' &&
    currentPlayer.connected &&
    (
      view.lobby.game_mode === 'simultaneous'
        ? !currentPlayerSubmitted
        : view.currentTurnPlayerId === currentPlayer.id
    ),
  );
  const canTypeChat = view?.lobby.status === 'finished';
  const settingsDirty = Boolean(draftSettings && view && (
    draftSettings.gameMode !== view.lobby.game_mode ||
    draftSettings.isPublic !== view.lobby.is_public ||
    draftSettings.enabledCategoryIds.join(',') !== view.lobby.enabled_category_ids.join(',')
  ));
  const categoryGroups = useMemo(() => getCategoryGroups(view?.categories ?? []), [view?.categories]);

  useEffect(() => {
    const id = getOrCreateClientId();
    setClientId(id);
  }, []);

  const requestLobby = useCallback(async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    Object.entries(await getAuthHeaders()).forEach(([key, value]) => headers.set(key, value));
    if (options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(path, { ...options, headers });
    const nextView = await readLobbyResponse(response);
    setView(nextView);
    setDraftSettings((current) => (
      current && nextView.lobby.status === 'waiting' && settingsDirty ? current : createDraftSettings(nextView)
    ));
    window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    setMessage('');
    return nextView;
  }, [settingsDirty]);

  const refreshView = useCallback(async () => {
    if (!view || !clientId || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}?clientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to refresh lobby.');
    } finally {
      requestInFlightRef.current = false;
    }
  }, [clientId, requestLobby, view]);

  const loadPublicLobbies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/public`, { cache: 'no-store' });
      setPublicLobbies(await readPublicLobbiesResponse(response));
    } catch {
      setPublicLobbies([]);
    }
  }, []);

  useEffect(() => {
    void loadPublicLobbies();
  }, [loadPublicLobbies]);

  useEffect(() => {
    if (!clientId || view) return;
    const code = window.localStorage.getItem(STORAGE_KEY);
    if (!code) return;
    fetch(`${API_BASE}/${code}/rejoin?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((candidate) => {
        if (candidate?.eligible && candidate.disconnectedAt) {
          setRejoinCandidate({
            code: candidate.lobbyCode,
            expiresAt: new Date(getReconnectDeadline(candidate.disconnectedAt)).toISOString(),
          });
        }
      })
      .catch(() => undefined);
  }, [clientId, view]);

  useEffect(() => {
    if (!view) return;
    setDraftSettings((current) => current ?? createDraftSettings(view));
  }, [view]);

  useEffect(() => {
    if (!view?.phaseEndsAt || view.lobby.status !== 'active') {
      setRemainingSeconds(0);
      return undefined;
    }

    let refreshedExpiredPhase = false;
    const updateTimer = () => {
      const nextRemainingSeconds = Math.max(0, Math.ceil((new Date(view.phaseEndsAt as string).getTime() - Date.now()) / 1000));
      setRemainingSeconds(nextRemainingSeconds);
      if (nextRemainingSeconds === 0 && !refreshedExpiredPhase) {
        refreshedExpiredPhase = true;
        window.setTimeout(() => void refreshView(), 150);
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [refreshView, view?.lobby.status, view?.phaseEndsAt]);

  useEffect(() => {
    if (!view || !clientId || view.lobby.status === 'terminated') return undefined;
    const interval = window.setInterval(() => {
      void requestLobby(`${API_BASE}/${view.lobby.code}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ clientId, connected: true }),
      }).catch(() => undefined);
    }, MULTIPLAYER_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [clientId, requestLobby, view]);

  useEffect(() => {
    if (!view || !clientId) return undefined;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return undefined;
    const channel = supabase.channel(`category-clash:${view.lobby.id}`);
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'category_clash_lobby_events',
        filter: `lobby_id=eq.${view.lobby.id}`,
      }, () => {
        void refreshView();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, refreshView, view]);

  useEffect(() => {
    const element = chatScrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [view?.chatMessages]);

  const hardLeaveForAuthChange = useCallback(async () => {
    if (!view || !clientId || isLeavingLobbyRef.current) return;
    isLeavingLobbyRef.current = true;
    try {
      await fetch(`${API_BASE}/${view.lobby.code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, forfeit: true }),
      });
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      setView(null);
    }
  }, [clientId, view]);
  useMultiplayerAuthTransition(hardLeaveForAuthChange);

  const createLobby = async () => {
    if (!clientId) return;
    setBusy(true);
    try {
      await requestLobby(API_BASE, { method: 'POST', body: JSON.stringify({ clientId }) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobby = async (code = joinCode) => {
    if (!clientId || !code.trim()) return;
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/join`, {
        method: 'POST',
        body: JSON.stringify({ clientId, code: code.trim() }),
      });
      setJoinCode('');
      setRejoinCandidate(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join lobby.');
    } finally {
      setBusy(false);
    }
  };

  const leaveLobby = async (forfeit = false) => {
    if (!view || !clientId) return;
    isLeavingLobbyRef.current = true;
    try {
      await fetch(`${API_BASE}/${view.lobby.code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, forfeit }),
      });
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      setView(null);
      setDraftSettings(null);
      setAnswerDraft('');
      setChatDraft('');
      isLeavingLobbyRef.current = false;
      void loadPublicLobbies();
    }
  };

  const applySettings = async () => {
    if (!view || !clientId || !draftSettings) return;
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/settings`, {
        method: 'POST',
        body: JSON.stringify({ clientId, ...draftSettings }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update settings.');
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!view || !clientId) return;
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/start`, {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  };

  const startNextMatch = async () => {
    if (!view || !clientId) return;
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/next-match`, {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start next match.');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!view || !clientId || !canAnswer || !answerDraft.trim()) return;
    const guess = answerDraft.trim();
    setAnswerDraft('');
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/submit`, {
        method: 'POST',
        body: JSON.stringify({ clientId, guess }),
      });
    } catch (error) {
      setAnswerDraft(guess);
      setMessage(error instanceof Error ? error.message : 'Unable to submit answer.');
    }
  };

  const submitChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!view || !clientId || !canTypeChat || !chatDraft.trim()) return;
    const nextMessage = chatDraft.trim();
    setChatDraft('');
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/chat`, {
        method: 'POST',
        body: JSON.stringify({ clientId, message: nextMessage }),
      });
    } catch (error) {
      setChatDraft(nextMessage);
      setMessage(error instanceof Error ? error.message : 'Unable to send message.');
    }
  };

  const managePlayer = async (action: 'kick' | 'make-host', playerId: string) => {
    if (!view || !clientId) return;
    await requestLobby(`${API_BASE}/${view.lobby.code}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ clientId, targetPlayerId: playerId }),
    });
  };

  const copyInvite = async () => {
    if (!view) return;
    await navigator.clipboard.writeText(`${window.location.origin}/category-clash?code=${view.lobby.code}`);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1400);
  };

  if (!view) {
    return (
      <main className="min-h-screen bg-[#030712] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
        <div className="mx-auto grid w-full max-w-6xl gap-6">
          <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Multiplayer Game</p>
                <h1 className="mt-2 text-4xl font-black text-white">Category Clash</h1>
              </div>
              <Link href="/" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800" aria-label="Back to home">
                <ArrowLeft size={20} />
              </Link>
            </div>
          </header>

          {rejoinCandidate ? (
            <ReconnectButton
              candidate={rejoinCandidate}
              disabled={busy}
              onReconnect={() => void joinLobby(rejoinCandidate.code)}
              onExpire={() => setRejoinCandidate(null)}
            />
          ) : null}

          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Create</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Start a lobby</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Name unique League answers from rotating categories until one player remains.</p>
              <button type="button" onClick={createLobby} disabled={busy || !clientId} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-60">
                <Users size={17} /> Create Lobby
              </button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void joinLobby(); }} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Join</p>
              <label className="mt-3 block">
                <span className="sr-only">Lobby code</span>
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Lobby code" className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold uppercase tracking-[0.16em] text-white outline-none placeholder:text-slate-600 focus:border-amber-300/60" />
              </label>
              <button type="submit" disabled={busy || !joinCode.trim()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-slate-800 px-5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-60">
                Join Lobby
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Public Lobbies</p>
              <button type="button" onClick={() => void loadPublicLobbies()} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800" aria-label="Refresh public lobbies">
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {publicLobbies.length > 0 ? publicLobbies.map((lobby) => (
                <button key={lobby.code} type="button" onClick={() => void joinLobby(lobby.code)} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left transition hover:bg-slate-900">
                  <span>
                    <span className="block text-sm font-bold text-white">{`${lobby.hostName}'s lobby`}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.12em] text-slate-500">{lobby.mode === 'turns' ? 'Turn based' : 'Simultaneous'} - {lobby.playerCount}/{lobby.maxPlayers}</span>
                  </span>
                  <span className="font-mono text-sm font-black text-amber-200">{lobby.code}</span>
                </button>
              )) : (
                <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No public lobbies right now.</p>
              )}
            </div>
          </section>
          {message ? <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{message}</p> : null}
        </div>
      </main>
    );
  }

  const connectedPlayers = view.players.filter((player) => player.connected);
  const winner = view.players.find((player) => player.id === view.lobby.winner_player_id);

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-7xl gap-5">
        <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void leaveLobby(view.lobby.status === 'active')} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800" aria-label="Leave lobby">
                <ArrowLeft size={20} />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Multiplayer Game</p>
                <h1 className="mt-1 text-3xl font-black text-white">Category Clash</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyInvite} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 hover:bg-slate-800">
                {codeCopied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                {view.lobby.code}
              </button>
              <GameInfoMenu
                title="Category Clash"
                steps={[
                  'Name a unique valid answer for the active category before time expires.',
                  'Wrong answers, repeated used answers, and missed turns add one strike.',
                  'Three strikes eliminates a player. The last active player wins.',
                  'Spelling is forgiving: punctuation is ignored, & and “and” are interchangeable, and one-character typos are accepted.',
                ]}
              />
            </div>
          </div>
        </header>

        {view.lobby.status === 'waiting' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <MultiplayerLobbyRoster
              countLabel={`${connectedPlayers.length}/${view.lobby.max_players} Players`}
              canManage={isHost}
              players={view.players.map((player) => ({
                id: player.id,
                authUserId: player.auth_user_id,
                displayName: player.display_name,
                avatarUrl: player.avatar_url,
                role: player.id === view.lobby.host_player_id ? 'host' : 'player',
                isCurrentUser: player.is_requesting_player,
                isHost: player.id === view.lobby.host_player_id,
                status: player.connected ? <Check size={16} className="text-emerald-300" /> : <X size={16} className="text-red-300" />,
              }))}
              onKick={(playerId) => managePlayer('kick', playerId)}
              onMakeHost={(playerId) => managePlayer('make-host', playerId)}
            />

            <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Game Settings</p>
                  <h2 className="mt-2 text-xl font-bold text-white">{draftSettings?.gameMode === 'turns' ? 'Turn Based' : 'Simultaneous'} Mode</h2>
                </div>
                {settingsDirty ? (
                  <button type="button" onClick={applySettings} disabled={!isHost || busy} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-60">
                    Apply
                  </button>
                ) : null}
              </div>

              <fieldset className="mt-5 grid gap-5">
                <GameSettingsSection title="Mode" defaultOpen summary={draftSettings?.gameMode === 'turns' ? 'Turn based' : 'Simultaneous'}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { id: 'simultaneous' as const, title: 'Simultaneous', text: 'Everyone answers the same category each round.' },
                      { id: 'turns' as const, title: 'Turn Based', text: 'Players answer one at a time with a short intermission.' },
                    ].map((mode) => (
                      <button key={mode.id} type="button" disabled={!isHost} onClick={() => setDraftSettings((current) => current ? { ...current, gameMode: mode.id } : current)} className={`rounded-2xl border p-4 text-left transition disabled:opacity-60 ${draftSettings?.gameMode === mode.id ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                        <span className="block text-sm font-bold text-white">{mode.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">{mode.text}</span>
                      </button>
                    ))}
                  </div>
                </GameSettingsSection>

                <GameSettingsSection title="Categories" summary={`${draftSettings?.enabledCategoryIds.length ?? 0} selected`}>
                  <div className={`max-h-[28rem] overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}`}>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button type="button" disabled={!isHost} onClick={() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: view.categories.map((category) => category.id) } : current)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Select All</button>
                      <button type="button" disabled={!isHost} onClick={() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: [] } : current)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Clear</button>
                    </div>
                    <div className="grid gap-4">
                      {categoryGroups.map(([group, categories]) => (
                        <div key={group}>
                          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{group}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {categories.map((category) => {
                              const checked = Boolean(draftSettings?.enabledCategoryIds.includes(category.id));
                              return (
                                <button key={category.id} type="button" disabled={!isHost} onClick={() => setDraftSettings((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    enabledCategoryIds: checked
                                      ? current.enabledCategoryIds.filter((id) => id !== category.id)
                                      : [...current.enabledCategoryIds, category.id],
                                  };
                                })} className={`rounded-2xl border p-3 text-left transition disabled:opacity-60 ${checked ? 'border-emerald-300/50 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                                  <span className="block text-sm font-bold text-white">{category.label}</span>
                                  <span className="mt-1 block text-xs text-slate-500">{category.answers.length} answers</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </GameSettingsSection>

                <button type="button" disabled={!isHost} onClick={() => setDraftSettings((current) => current ? { ...current, isPublic: !current.isPublic } : current)} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${draftSettings?.isPublic ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'}`}>
                  <span className="text-sm font-bold text-white">Public lobby</span>
                  <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${draftSettings?.isPublic ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${draftSettings?.isPublic ? 'translate-x-5' : ''}`} /></span>
                </button>
              </fieldset>

              <button type="button" onClick={startGame} disabled={!isHost || busy || connectedPlayers.length < 2 || !draftSettings?.enabledCategoryIds.length || settingsDirty} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                <Play size={17} /> Start Game
              </button>
            </section>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="grid gap-4">
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Round</p>
                  <p className="mt-2 text-3xl font-black text-white">{view.lobby.round_number}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Timer</p>
                  <p className="mt-2 text-3xl font-black text-amber-200">{view.lobby.status === 'active' ? formatSeconds(remainingSeconds) : '--'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{getPhaseLabel(view)}</p>
                  <p className="mt-2 truncate text-xl font-black text-white">{view.currentCategory?.label ?? 'No category'}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Category</p>
                <h2 className="mt-2 text-3xl font-black text-white">{view.currentCategory?.prompt ?? 'Waiting for next category.'}</h2>
                {view.lobby.game_mode === 'turns' ? (
                  <p className="mt-3 text-sm font-semibold text-slate-300">
                    Current player: <span className="text-amber-200">{currentTurnPlayer?.display_name ?? 'None'}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    {currentPlayerSubmitted ? 'Answer submitted. Waiting for the round to resolve.' : 'All active players answer this category.'}
                  </p>
                )}
                {view.lobby.phase === 'review' ? <p className="mt-3 text-sm text-slate-400">Review answers in chat before the next round starts.</p> : null}
                {view.lobby.phase === 'countdown' ? <p className="mt-3 text-sm text-slate-400">The first category opens when the countdown ends.</p> : null}
                {view.lobby.phase === 'intermission' ? <p className="mt-3 text-sm text-slate-400">Next turn starts shortly.</p> : null}

                <form onSubmit={submitAnswer} className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} disabled={!canAnswer || busy} placeholder={canAnswer ? 'Type an answer' : 'Answers are closed'} className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60 disabled:opacity-60" />
                  <button type="submit" disabled={!canAnswer || busy || !answerDraft.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send size={16} /> Submit
                  </button>
                </form>
              </div>

              {activePlayers.some((player) => !player.connected && player.disconnected_at) ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activePlayers.filter((player) => !player.connected && player.disconnected_at).map((player) => (
                    <MultiplayerDisconnectStatus key={player.id} playerName={player.display_name} disconnectedAt={player.disconnected_at as string} unavailable={view.lobby.status === 'finished'} />
                  ))}
                </div>
              ) : null}
            </section>

            <aside className="grid gap-4">
              <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Players</p>
                <div className="mt-4 grid gap-2">
                  {view.players.map((player) => {
                    const strikeMarks = [0, 1, 2].map((index) => index < player.strikes);
                    return (
                      <div key={player.id} className={`rounded-2xl border p-3 ${player.result === 'won' ? 'border-amber-300/50 bg-amber-300/10' : player.result === 'eliminated' ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-slate-900/70'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{player.display_name}{player.is_requesting_player ? ' (you)' : ''}</p>
                            <p className="mt-1 text-xs capitalize text-slate-500">{player.result === 'active' ? (player.connected ? 'active' : 'disconnected') : player.result}</p>
                          </div>
                          <div className="flex gap-1">
                            {strikeMarks.map((struck, index) => (
                              <span key={index} className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black ${struck ? 'border-red-400/50 bg-red-500/20 text-red-200' : 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200'}`}>
                                {struck ? <X size={14} /> : <Check size={14} />}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="flex h-[34rem] flex-col rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chat</p>
                  <MessageSquare size={18} className="text-amber-300" />
                </div>
                <div ref={chatScrollRef} className={`mt-4 grid flex-1 content-start gap-2 overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}`}>
                  {view.chatMessages.map((chatMessage) => {
                    const player = view.players.find((candidate) => candidate.id === chatMessage.player_id);
                    if (chatMessage.message_type === 'player') {
                      const isOwnMessage = player?.id === currentPlayer?.id;
                      return (
                        <div key={chatMessage.id} className={`max-w-[86%] ${isOwnMessage ? 'ml-auto text-right' : 'mr-auto text-left'}`}>
                          <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={getChatNameStyle(chatMessage.chat_color)}>{player?.display_name ?? 'Player'}</p>
                          <div className="rounded-xl px-3 py-2 text-sm font-medium [overflow-wrap:anywhere]" style={getChatBubbleStyle(chatMessage.chat_color, chatMessage.chat_border)}>{chatMessage.message}</div>
                        </div>
                      );
                    }
                    return (
                      <div key={chatMessage.id} className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${getMessageToneClass(chatMessage)}`}>
                        {chatMessage.message}
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={submitChat} className="mt-3 flex gap-2">
                  <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value.slice(0, 1000))} disabled={!canTypeChat} placeholder={canTypeChat ? 'Send a message' : 'Chat opens after the match'} className="min-h-10 flex-1 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-60" />
                  <button type="submit" disabled={!canTypeChat || !chatDraft.trim()} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300 text-slate-950 disabled:opacity-60">
                    <Send size={15} />
                  </button>
                </form>
              </section>
            </aside>
          </div>
        )}

        {view.lobby.status === 'finished' ? (
          <section className="rounded-3xl border border-amber-300/40 bg-amber-300/10 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Winner</p>
                <h2 className="mt-2 text-3xl font-black text-white">{winner?.display_name ?? 'Match finished'}</h2>
              </div>
              {isHost ? (
                <button type="button" onClick={startNextMatch} disabled={busy || connectedPlayers.length < 2} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-60">
                  <Trophy size={17} /> Start New Match
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {message ? <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{message}</p> : null}
      </div>
    </main>
  );
}
