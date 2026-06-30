'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, MessageSquare, Play, RefreshCw, Send, SlidersHorizontal, Swords, Timer, Trophy, Users, X } from 'lucide-react';
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
  roundSeconds: number;
  intermissionSeconds: number;
  timerDecrementInterval: number;
};

const ROUND_SECONDS_OPTIONS = [5, 8, 10, 15, 20] as const;
const INTERMISSION_SECONDS_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 3, label: '3 seconds' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
] as const;
const TIMER_DECREMENT_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Every round' },
  { value: 2, label: 'Every 2 rounds' },
  { value: 3, label: 'Every 3 rounds' },
] as const;

function formatSeconds(seconds: number) {
  return `0:${Math.max(0, seconds).toString().padStart(2, '0')}`;
}

function createDraftSettings(view: CategoryClashLobbyView): DraftSettings {
  return {
    gameMode: view.lobby.game_mode,
    isPublic: view.lobby.is_public,
    enabledCategoryIds: view.lobby.enabled_category_ids,
    roundSeconds: view.lobby.round_seconds,
    intermissionSeconds: view.lobby.intermission_seconds,
    timerDecrementInterval: view.lobby.timer_decrement_interval,
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
  if (view.lobby.phase === 'review' || view.lobby.phase === 'intermission') return 'Intermission';
  return view.lobby.game_mode === 'turns' ? 'Turn' : 'Round';
}

type CategorySelectionOption = {
  id: string;
  label: string;
  description: string;
  categoryIds: string[];
  answerCount: number;
};

const CATEGORY_BUNDLES: Record<string, { id: string; label: string; description: string }> = {
  'Champion Classes': {
    id: 'champion-classes',
    label: 'Champion Classes',
    description: 'All champion class prompts',
  },
  Runes: {
    id: 'keystone-minor-runes',
    label: 'Keystone/Minor Runes',
    description: 'Keystone and minor rune prompts',
  },
  Regions: {
    id: 'champion-regions',
    label: 'Champion Regions',
    description: 'All champion region prompts',
  },
};

function getCategorySelectionOptions(categories: CategoryClashCategory[]): CategorySelectionOption[] {
  const bundledCategories = new Map<string, CategoryClashCategory[]>();
  const options: CategorySelectionOption[] = [];

  categories.forEach((category) => {
    const bundle = CATEGORY_BUNDLES[category.group];
    if (!bundle) {
      options.push({
        id: category.id,
        label: category.label,
        description: category.prompt,
        categoryIds: [category.id],
        answerCount: category.answers.length,
      });
      return;
    }

    bundledCategories.set(category.group, [...(bundledCategories.get(category.group) ?? []), category]);
  });

  Object.entries(CATEGORY_BUNDLES).forEach(([group, bundle]) => {
    const groupCategories = bundledCategories.get(group);
    if (!groupCategories?.length) return;
    options.push({
      id: bundle.id,
      label: bundle.label,
      description: bundle.description,
      categoryIds: groupCategories.map((category) => category.id),
      answerCount: groupCategories.reduce((total, category) => total + category.answers.length, 0),
    });
  });

  return options;
}

function getMessageToneClass(message: CategoryClashChatMessage) {
  if (message.tone === 'correct') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (message.tone === 'incorrect') return 'border-red-400/30 bg-red-500/10 text-red-100';
  return 'border-white/10 bg-slate-900/80 text-slate-200';
}

function formatPlacement(place: number) {
  const suffix = place % 100 >= 11 && place % 100 <= 13
    ? 'th'
    : place % 10 === 1
      ? 'st'
      : place % 10 === 2
        ? 'nd'
        : place % 10 === 3
          ? 'rd'
          : 'th';
  return `${place}${suffix}`;
}

function getPlayerPlacements(view: CategoryClashLobbyView) {
  const placements = new Map<string, number>();
  const winnerId = view.lobby.winner_player_id ?? view.players.find((player) => player.result === 'won')?.id ?? null;
  if (winnerId) {
    placements.set(winnerId, 1);
  }

  const rankedEliminatedPlayers = view.players
    .filter((player) => player.result === 'eliminated')
    .sort((first, second) => {
      const updatedDiff = new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime();
      if (updatedDiff !== 0) return updatedDiff;
      return new Date(first.joined_at).getTime() - new Date(second.joined_at).getTime();
    });

  rankedEliminatedPlayers.forEach((player, index) => {
    placements.set(player.id, index + (winnerId ? 2 : 1));
  });

  return placements;
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
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const ignoredLobbyCodeRef = useRef<string | null>(null);
  const requestInFlightRef = useRef(false);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const visibleSettings = draftSettings ?? (view ? createDraftSettings(view) : null);
  const currentPlayer = view?.requestingPlayer ?? null;
  const activePlayers = view?.players.filter((player) => player.result === 'active') ?? [];
  const currentTurnPlayer = view?.players.find((player) => player.id === view.currentTurnPlayerId) ?? null;
  const canAnswer = Boolean(
    view?.lobby.status === 'active' &&
    view.lobby.phase === 'answering' &&
    currentPlayer?.result === 'active' &&
    currentPlayer.connected &&
    (
      view.lobby.game_mode === 'simultaneous' ||
      view.currentTurnPlayerId === currentPlayer.id
    ),
  );
  const canTypeChat = view?.lobby.status === 'finished';
  const settingsDirty = Boolean(draftSettings && view && (
    draftSettings.gameMode !== view.lobby.game_mode ||
    draftSettings.roundSeconds !== view.lobby.round_seconds ||
    draftSettings.intermissionSeconds !== view.lobby.intermission_seconds ||
    draftSettings.timerDecrementInterval !== view.lobby.timer_decrement_interval ||
    draftSettings.enabledCategoryIds.join(',') !== view.lobby.enabled_category_ids.join(',')
  ));
  const categoryOptions = useMemo(() => getCategorySelectionOptions(view?.categories ?? []), [view?.categories]);
  const selectedCategoryOptionCount = useMemo(() => {
    const selectedIds = new Set(visibleSettings?.enabledCategoryIds ?? []);
    return categoryOptions.filter((option) => option.categoryIds.every((id) => selectedIds.has(id))).length;
  }, [categoryOptions, visibleSettings?.enabledCategoryIds]);
  const connectedLobbyCode = view && (view.lobby.status === 'waiting' || view.lobby.status === 'active')
    ? view.lobby.code
    : null;

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
    if (isLeavingLobbyRef.current || ignoredLobbyCodeRef.current === nextView.lobby.code) {
      return nextView;
    }
    setView(nextView);
    setDraftSettings((current) => (
      current && nextView.lobby.status === 'waiting' && settingsDirty ? current : createDraftSettings(nextView)
    ));
    window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    setMessage('');
    return nextView;
  }, [settingsDirty]);

  const refreshView = useCallback(async () => {
    if (!view || !clientId || requestInFlightRef.current || isLeavingLobbyRef.current) return;
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
    setAnswerDraft('');
  }, [view?.lobby.round_number, view?.lobby.turn_sequence, view?.lobby.current_category_id]);

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
    if (!connectedLobbyCode || !clientId) return undefined;
    const code = connectedLobbyCode;
    const sendHeartbeat = async () => {
      try {
        await requestLobby(`${API_BASE}/${code}/heartbeat`, {
          method: 'POST',
          body: JSON.stringify({ clientId, connected: true }),
        });
      } catch {
        // Realtime or the next heartbeat will retry transient failures.
      }
    };
    void sendHeartbeat();
    const interval = window.setInterval(() => {
      void requestLobby(`${API_BASE}/${code}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ clientId, connected: true }),
      }).catch(() => undefined);
    }, MULTIPLAYER_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [clientId, connectedLobbyCode, requestLobby]);

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
    ignoredLobbyCodeRef.current = null;
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
    ignoredLobbyCodeRef.current = null;
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
    const leavingView = view;
    isLeavingLobbyRef.current = true;
    ignoredLobbyCodeRef.current = leavingView.lobby.code;
    window.localStorage.removeItem(STORAGE_KEY);
    setView(null);
    setDraftSettings(null);
    setAnswerDraft('');
    setChatDraft('');
    try {
      await fetch(`${API_BASE}/${leavingView.lobby.code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, forfeit }),
      });
    } finally {
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

  const updatePublicStatus = async () => {
    if (!view || !clientId) return;
    const nextIsPublic = !view.lobby.is_public;
    setBusy(true);
    setDraftSettings((current) => ({ ...(current ?? createDraftSettings(view)), isPublic: nextIsPublic }));
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/settings`, {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          isPublic: nextIsPublic,
          gameMode: view.lobby.game_mode,
          enabledCategoryIds: view.lobby.enabled_category_ids,
          roundSeconds: view.lobby.round_seconds,
          intermissionSeconds: view.lobby.intermission_seconds,
          timerDecrementInterval: view.lobby.timer_decrement_interval,
        }),
      });
      setDraftSettings((current) => (current ? { ...current, isPublic: nextIsPublic } : current));
    } catch (error) {
      setDraftSettings((current) => (current ? { ...current, isPublic: view.lobby.is_public } : current));
      setMessage(error instanceof Error ? error.message : 'Unable to update public lobby status.');
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
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
        <div className="mx-auto max-w-6xl">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-glow backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <Link href="/" className="rounded-2xl border border-white/10 bg-slate-950 p-3 text-slate-200 transition hover:text-white" aria-label="Back to home">
                <ArrowLeft size={22} />
              </Link>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
                <h1 className="text-2xl font-black">Category Clash</h1>
                <p className="mt-1 text-sm text-slate-400">Create or join a lobby</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameInfoMenu
                title="Category Clash"
                steps={[
                  'Name a unique valid answer for the active category before time expires.',
                  'Wrong answers, repeated used answers, and missed turns add one strike.',
                  'Three strikes eliminates a player. The last active player wins.',
                ]}
              />
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
                <Users size={16} className="text-amber-300" />
                Lobby
              </div>
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

          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
            <div className="mx-auto max-w-4xl py-1">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Create or Join</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Set up a Category Clash lobby</h2>
              </div>
              <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
                <button type="button" onClick={createLobby} disabled={busy || !clientId} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                  Create Lobby
                </button>
                <span className="hidden pb-3 text-sm font-semibold text-slate-500 lg:block">OR</span>
                <form onSubmit={(event) => { event.preventDefault(); void joinLobby(); }} className="grid gap-2">
                  <label htmlFor="category-clash-join-code" className="text-xs uppercase tracking-[0.18em] text-slate-500">Join code</label>
                  <div className="flex gap-2">
                    <input
                      id="category-clash-join-code"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))}
                      maxLength={6}
                      autoComplete="off"
                      placeholder="ABC123"
                      className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm uppercase tracking-[0.16em] text-white outline-none placeholder:text-slate-600 focus:border-white/20"
                    />
                    <button type="submit" disabled={busy || joinCode.trim().length !== 6} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60">Join</button>
                  </div>
                </form>
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
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
                  {publicLobbies.length > 0 ? publicLobbies.map((lobby) => (
                    <button key={lobby.code} type="button" onClick={() => void joinLobby(lobby.code)} disabled={busy} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-amber-300/40 hover:bg-slate-950 disabled:opacity-60">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{`${lobby.hostName}'s lobby`}</span>
                        <span className="mt-1 block text-xs text-slate-400">{lobby.mode === 'turns' ? 'Turn based' : 'Simultaneous'} - {lobby.playerCount}/{lobby.maxPlayers}</span>
                      </span>
                    </button>
                  )) : (
                    <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-500">No public lobbies are waiting.</p>
                  )}
                </div>
              </div>
            </div>
            {message ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center text-sm font-semibold text-red-100">{message}</p> : null}
          </section>
        </div>
      </main>
    );
  }

  const connectedPlayers = view.players.filter((player) => player.connected);
  const playerPlacements = getPlayerPlacements(view);
  const shouldShowCategory = view.lobby.phase !== 'countdown' && Boolean(view.currentCategory);
  const timerUrgent = view.lobby.status === 'active' && view.lobby.phase === 'answering' && remainingSeconds > 0 && remainingSeconds <= 3;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className={`mx-auto flex min-h-screen w-full flex-col gap-5 px-6 py-6 lg:px-12 ${view.lobby.status === 'waiting' ? 'max-w-6xl' : 'max-w-7xl'}`}>
        <header className="relative z-30 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void leaveLobby(view.lobby.status === 'active')} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900" aria-label="Leave lobby">
                <ArrowLeft size={20} />
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
                <h1 className="text-xl font-semibold text-white">Category Clash</h1>
                <p className="mt-1 text-xs text-slate-400">{view.lobby.status === 'waiting' ? 'Lobby' : getPhaseLabel(view)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameInfoMenu
                title="Category Clash"
                steps={[
                  'Name a unique valid answer for the active category before time expires.',
                  'Wrong answers, repeated used answers, and missed turns add one strike.',
                  'Three strikes eliminates a player. The last active player wins.',
                  'Spelling is forgiving: punctuation is ignored, & and "and" are interchangeable, and one-character typos are accepted.',
                ]}
              />
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
              <Users size={16} className="text-amber-300" />
                {view.lobby.status === 'waiting'
                  ? `Lobby - ${connectedPlayers.length >= view.lobby.max_players ? 'Full' : 'Waiting for players'}`
                  : view.lobby.status === 'active'
                    ? 'In Progress'
                    : view.lobby.status === 'finished'
                      ? 'Finished'
                      : 'Lobby'}
            </div>
            {view.lobby.status === 'finished' && isHost ? (
              <button type="button" onClick={startNextMatch} disabled={busy || connectedPlayers.length < 2} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                <Trophy size={16} /> Start New Match
              </button>
            ) : null}
          </div>
        </header>

        {view.lobby.status === 'waiting' ? (
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
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
                  countLabel={`${connectedPlayers.length}/${view.lobby.max_players} Players`}
                  canManage={isHost && view.lobby.status === 'waiting'}
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

                <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Game Settings</p>
                      {settingsDirty ? (
                        <button type="button" onClick={applySettings} disabled={!isHost || busy} className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-300 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                          Apply Changes
                        </button>
                      ) : null}
                    </div>
                    <SlidersHorizontal size={20} className="text-amber-300" />
                  </div>
                  <button type="button" disabled={!isHost || busy} onClick={updatePublicStatus} className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${visibleSettings?.isPublic ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'} disabled:opacity-60`}>
                    <span><span className="block text-sm font-semibold text-white">Public lobby</span></span>
                    <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${visibleSettings?.isPublic ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${visibleSettings?.isPublic ? 'translate-x-5' : ''}`} /></span>
                  </button>
                  <fieldset className="mt-5 grid gap-5">
                    <legend className="sr-only">Game settings</legend>
                    <GameSettingsSection title="Mode" defaultOpen summary={visibleSettings?.gameMode === 'turns' ? 'Turn based' : 'Simultaneous'}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { id: 'simultaneous' as const, title: 'Simultaneous', text: 'Everyone answers the same category each round.' },
                          { id: 'turns' as const, title: 'Turn Based', text: 'Players answer one at a time with a short intermission.' },
                        ].map((mode) => (
                          <button key={mode.id} type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, gameMode: mode.id } : current)} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.gameMode === mode.id ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                            <span className="block text-sm font-bold text-white">{mode.title}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-400">{mode.text}</span>
                          </button>
                        ))}
                      </div>
                    </GameSettingsSection>

                    <GameSettingsSection
                      title="Timing"
                      summary={`${visibleSettings?.roundSeconds ?? 10}s rounds`}
                    >
                      <div className="grid gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Round length</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-5">
                            {ROUND_SECONDS_OPTIONS.map((seconds) => (
                              <button key={seconds} type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, roundSeconds: seconds } : current)} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.roundSeconds === seconds ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {seconds}s
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Intermission</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-4">
                            {INTERMISSION_SECONDS_OPTIONS.map((option) => (
                              <button key={option.value} type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, intermissionSeconds: option.value } : current)} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.intermissionSeconds === option.value ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Timer decrement</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-4">
                            {TIMER_DECREMENT_OPTIONS.map((option) => (
                              <button key={option.value} type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, timerDecrementInterval: option.value } : current)} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.timerDecrementInterval === option.value ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </GameSettingsSection>

                    <GameSettingsSection title="Categories" summary={`${selectedCategoryOptionCount} selected`}>
                      <div className={`max-h-[28rem] overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}`}>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <button type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: view.categories.map((category) => category.id) } : current)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Select All</button>
                          <button type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: [] } : current)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Clear</button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {categoryOptions.map((option) => {
                            const selectedIds = new Set(visibleSettings?.enabledCategoryIds ?? []);
                            const checked = option.categoryIds.every((id) => selectedIds.has(id));
                            return (
                              <button key={option.id} type="button" disabled={!isHost || busy} onClick={() => setDraftSettings((current) => {
                                if (!current) return current;
                                const currentIds = new Set(current.enabledCategoryIds);
                                if (checked) {
                                  option.categoryIds.forEach((id) => currentIds.delete(id));
                                } else {
                                  option.categoryIds.forEach((id) => currentIds.add(id));
                                }
                                return {
                                  ...current,
                                  enabledCategoryIds: view.categories
                                    .map((category) => category.id)
                                    .filter((id) => currentIds.has(id)),
                                };
                              })} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${checked ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                                <span className="flex items-start justify-between gap-3">
                                  <span className="min-w-0">
                                    <span className="block text-sm font-bold text-white">{option.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-400">{option.description}</span>
                                    <span className="mt-1 block text-xs text-slate-500">{option.answerCount} answers</span>
                                  </span>
                                  {checked ? <span className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-violet-500 p-0.5 transition"><span className="h-4 w-4 translate-x-4 rounded-full bg-white transition" /></span> : <span className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-700 p-0.5 transition"><span className="h-4 w-4 rounded-full bg-white transition" /></span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </GameSettingsSection>
                  </fieldset>
                  {!isHost ? <p className="mt-4 text-xs text-slate-500">Only the host can change game settings.</p> : null}
                </section>
              </div>

              <div className="flex flex-col items-center gap-3 py-1">
                <button type="button" onClick={startGame} disabled={!isHost || busy || connectedPlayers.length < 2 || !visibleSettings?.enabledCategoryIds.length || settingsDirty} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-8 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <Play size={17} /> Start Game
                </button>
                <p className="text-xs text-slate-500">{settingsDirty ? 'Apply setting changes before starting.' : 'The host can start once at least two players have joined.'}</p>
              </div>
            </div>
            {message ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-300">{message}</p> : null}
          </section>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="grid content-start gap-4">
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Round</p>
                  <p className="mt-1 text-2xl font-black text-white">{view.lobby.round_number}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Timer</p>
                  <p className={`mt-1 text-2xl font-black ${timerUrgent ? 'animate-pulse text-red-300' : 'text-amber-200'}`}>{view.lobby.status === 'active' ? formatSeconds(remainingSeconds) : '--'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{getPhaseLabel(view)}</p>
                  <p className="mt-1 truncate text-lg font-black text-white">{shouldShowCategory ? view.currentCategory?.label : view.lobby.phase === 'countdown' ? 'Get Ready' : 'No category'}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{view.lobby.phase === 'countdown' ? 'Starting' : 'Category'}</p>
                <h2 className="mt-2 text-3xl font-black text-white">{shouldShowCategory ? view.currentCategory?.prompt : view.lobby.phase === 'countdown' ? `Match starts in ${remainingSeconds}` : 'Waiting for next category.'}</h2>
                {view.lobby.phase === 'countdown' ? (
                  <p className="mt-3 text-sm text-slate-400">Get ready. The first category opens when the countdown ends.</p>
                ) : view.lobby.game_mode === 'turns' ? (
                  <p className="mt-3 text-sm font-semibold text-slate-300">
                    Current player: <span className="text-amber-200">{currentTurnPlayer?.display_name ?? 'None'}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    All active players answer this category. Only your latest submission counts.
                  </p>
                )}
                {view.lobby.phase === 'review' ? <p className="mt-3 text-sm text-slate-400">Intermission before the next round.</p> : null}
                {view.lobby.phase === 'intermission' ? <p className="mt-3 text-sm text-slate-400">Intermission before the next turn.</p> : null}

                <form onSubmit={submitAnswer} className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} disabled={!canAnswer || busy} placeholder={canAnswer ? 'Type an answer' : 'Answers are closed'} className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60 disabled:opacity-60" />
                  <button type="submit" disabled={!canAnswer || busy || !answerDraft.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send size={16} /> Submit
                  </button>
                </form>
              </div>

              <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Players</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {view.players.map((player) => {
                    const strikeMarks = [0, 1, 2].map((index) => index < player.strikes);
                    const placement = playerPlacements.get(player.id);
                    const card = (
                      <div className={`h-full rounded-2xl border p-3 ${placement === 1 ? 'border-transparent bg-slate-950' : player.result === 'eliminated' ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-slate-900/70'}`}>
                        <div className="flex h-full flex-col justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">
                              {player.display_name}{player.is_requesting_player ? ' (you)' : ''}{placement ? ` - ${formatPlacement(placement)}` : ''}
                            </p>
                            <p className={`mt-1 text-xs capitalize ${placement === 1 ? 'text-amber-100' : player.result === 'eliminated' ? 'text-red-200' : 'text-slate-500'}`}>
                              {placement === 1 ? 'winner' : player.result === 'active' ? (player.connected ? 'active' : 'disconnected') : player.result}
                            </p>
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
                    return placement === 1
                      ? <div key={player.id} className="multiplayer-victory-border rounded-2xl">{card}</div>
                      : <div key={player.id}>{card}</div>;
                  })}
                </div>
              </section>

              {activePlayers.some((player) => !player.connected && player.disconnected_at) ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activePlayers.filter((player) => !player.connected && player.disconnected_at).map((player) => (
                    <MultiplayerDisconnectStatus key={player.id} playerName={player.display_name} disconnectedAt={player.disconnected_at as string} unavailable={view.lobby.status === 'finished'} />
                  ))}
                </div>
              ) : null}
            </section>

            <aside className="grid gap-4">
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

        {message ? <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{message}</p> : null}
      </section>
    </main>
  );
}
