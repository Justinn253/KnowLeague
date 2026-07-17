'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, MessageSquare, Play, RefreshCw, Send, SlidersHorizontal, Trophy, Users, X } from 'lucide-react';
import { GameInfoMenu } from '@/components/game-info-menu';
import { GameSettingsSection } from '@/components/game-settings-section';
import {
  MultiplayerCreateJoinPanel,
  MultiplayerLobbyDescriptionInput,
  MultiplayerPublicLobbyButton,
  MultiplayerPublicLobbyEmpty,
} from '@/components/multiplayer-lobby-layout';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { MultiplayerDisconnectStatus, ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { useMultiplayerHeartbeat } from '@/components/use-multiplayer-heartbeat';
import { CHAT_COLOR_NAME_HEX, getChatBubbleStyle, getChatNameStyle } from '@/lib/chat-colors';
import { getOrCreateClientId } from '@/lib/game-storage';
import { addMultiplayerDisconnectListeners, disconnectMultiplayerSession } from '@/lib/multiplayer-client-session';
import { getReconnectDeadline } from '@/lib/multiplayer-lifecycle';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { playUiSound } from '@/lib/ui-sounds';
import type {
  CategoryClashCategory,
  CategoryClashChatMessage,
  CategoryClashGameMode,
  CategoryClashLobbyView,
  CategoryClashPublicLobby,
} from '@/lib/category-clash';

const STORAGE_KEY = 'knowleague:v1:category-clash:lobby-code';
const API_BASE = '/api/category-clash/lobbies';
let categoryClashPublicLobbiesRequest: Promise<CategoryClashPublicLobby[]> | null = null;

function loadCategoryClashPublicLobbies() {
  if (categoryClashPublicLobbiesRequest) return categoryClashPublicLobbiesRequest;
  const request = fetch(`${API_BASE}/public`, { cache: 'no-store' }).then(readPublicLobbiesResponse);
  categoryClashPublicLobbiesRequest = request;
  const clear = () => {
    if (categoryClashPublicLobbiesRequest === request) categoryClashPublicLobbiesRequest = null;
  };
  void request.then(clear, clear);
  return request;
}

type DraftSettings = {
  gameMode: CategoryClashGameMode;
  isPublic: boolean;
  enabledCategoryIds: string[];
  roundSeconds: number;
  intermissionSeconds: number;
  timerDecrementInterval: number;
  maxStrikes: number;
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
const MAX_STRIKES_OPTIONS = [1, 2, 3, 4, 5] as const;
const ANSWER_GRADING_GRACE_MS = 1000;

function formatSeconds(seconds: number) {
  return `0:${Math.max(0, seconds).toString().padStart(2, '0')}`;
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createDraftSettings(view: CategoryClashLobbyView): DraftSettings {
  return {
    gameMode: view.lobby.game_mode,
    isPublic: view.lobby.is_public,
    enabledCategoryIds: view.lobby.enabled_category_ids,
    roundSeconds: view.lobby.round_seconds,
    intermissionSeconds: view.lobby.intermission_seconds,
    timerDecrementInterval: view.lobby.timer_decrement_interval,
    maxStrikes: view.lobby.max_strikes,
  };
}

type CategoryClashChatResponse = {
  kind: 'chat_message';
  chatMessage: CategoryClashChatMessage;
};

function isCategoryClashChatResponse(value: unknown): value is CategoryClashChatResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; chatMessage?: { id?: unknown; lobby_id?: unknown } };
  return candidate.kind === 'chat_message'
    && typeof candidate.chatMessage?.id === 'number'
    && typeof candidate.chatMessage.lobby_id === 'string';
}

async function readLobbyResponse<T = CategoryClashLobbyView>(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Category Clash request failed.');
  }
  return data as T;
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
  if (view.lobby.status !== 'finished') {
    return placements;
  }
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

  let previousEliminatedAt: number | null = null;
  let currentPlace = winnerId ? 2 : 1;
  let playersAtPreviousPlaces = 0;

  rankedEliminatedPlayers.forEach((player, index) => {
    const eliminatedAt = new Date(player.updated_at).getTime();
    if (previousEliminatedAt !== null && eliminatedAt !== previousEliminatedAt) {
      currentPlace = (winnerId ? 2 : 1) + playersAtPreviousPlaces;
    }
    placements.set(player.id, currentPlace);
    previousEliminatedAt = eliminatedAt;
    playersAtPreviousPlaces = index + 1;
  });

  return placements;
}

function getSubmissionFailureLabel(reason: string | null | undefined, expectedAnswer: boolean) {
  if (reason === 'duplicate') return 'Duplicate answer.';
  if (!expectedAnswer || reason === 'no_answer') return 'No answer submitted.';
  return 'Wrong answer.';
}

function getSoundOptionHandlers(onClick: () => void) {
  return {
    onMouseEnter: () => playUiSound('autocomplete-hover'),
    onFocus: () => playUiSound('autocomplete-hover'),
    onClick: () => {
      playUiSound('setting-select');
      onClick();
    },
  };
}

export function CategoryClash() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [view, setView] = useState<CategoryClashLobbyView | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<CategoryClashPublicLobby[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [draftSettings, setDraftSettings] = useState<DraftSettings | null>(null);
  const [lobbyDescription, setLobbyDescription] = useState('');
  const [answerDraft, setAnswerDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const previousRemainingSecondsRef = useRef<number | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const ignoredLobbyCodeRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshVersionRef = useRef(0);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const viewRef = useRef<CategoryClashLobbyView | null>(null);
  const settingsDirtyRef = useRef(false);
  const countdownSoundSecondRef = useRef<number | null>(null);
  const submissionSoundIdsRef = useRef<Set<number>>(new Set());
  const submissionSoundLobbyIdRef = useRef<string | null>(null);
  const finishSoundLobbyIdRef = useRef<string | null>(null);
  const previousRosterSnapshotRef = useRef<{ hostId: string | null; roles: Map<string, string>; playerIds: Set<string> } | null>(null);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const lobbyId = view?.lobby.id ?? null;
  const serverLobbyDescription = view?.lobby.lobby_description ?? '';
  const lobbyDescriptionDirty = lobbyDescription !== serverLobbyDescription;
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
  const settingsDirty = Boolean(lobbyDescriptionDirty || (draftSettings && view && (
    draftSettings.gameMode !== view.lobby.game_mode ||
    draftSettings.roundSeconds !== view.lobby.round_seconds ||
    draftSettings.intermissionSeconds !== view.lobby.intermission_seconds ||
    draftSettings.timerDecrementInterval !== view.lobby.timer_decrement_interval ||
    draftSettings.maxStrikes !== view.lobby.max_strikes ||
    draftSettings.enabledCategoryIds.join(',') !== view.lobby.enabled_category_ids.join(',')
  )));
  const categoryOptions = useMemo(() => getCategorySelectionOptions(view?.categories ?? []), [view?.categories]);
  const selectedCategoryOptionCount = useMemo(() => {
    const selectedIds = new Set(visibleSettings?.enabledCategoryIds ?? []);
    return categoryOptions.filter((option) => option.categoryIds.every((id) => selectedIds.has(id))).length;
  }, [categoryOptions, visibleSettings?.enabledCategoryIds]);
  const connectedLobbyCode = view && (view.lobby.status === 'waiting' || view.lobby.status === 'active')
    ? view.lobby.code
    : null;
  const activeLobbyId = view?.lobby.id ?? null;
  const connectedPlayerCount = view?.players.filter((player) => player.connected).length ?? 0;
  const hasVotedForNextMatch = Boolean(currentPlayer && view?.nextMatchVotes.includes(currentPlayer.id));
  const nextMatchVotePlayers = view?.players.filter((player) => view.nextMatchVotes.includes(player.id)) ?? [];
  const nextMatchVoteThreshold = Math.floor(connectedPlayerCount / 2) + 1;
  const canHostStartNextMatch = Boolean(isHost && view?.lobby.status === 'finished' && view.nextMatchVotes.length >= nextMatchVoteThreshold);
  const currentPlayerCurrentSubmission = view && currentPlayer
    ? [...view.submissions].reverse().find((submission) => (
      submission.player_id === currentPlayer.id &&
      submission.round_number === view.lobby.round_number &&
      submission.turn_sequence === view.lobby.turn_sequence &&
      submission.category_id === view.lobby.current_category_id
    )) ?? null
    : null;
  const lastCurrentPlayerSubmission = view?.lobby.phase !== 'answering' ? currentPlayerCurrentSubmission : null;
  const currentPlayerWasExpectedToAnswer = Boolean(
    view &&
    currentPlayer &&
    view.lobby.phase !== 'answering' &&
    view.lobby.phase !== 'countdown' &&
    (
      view.lobby.game_mode === 'simultaneous' ||
      currentTurnPlayer?.id === currentPlayer.id
    ),
  );
  const lastCurrentPlayerCorrect = lastCurrentPlayerSubmission?.correct ?? (currentPlayerWasExpectedToAnswer ? false : null);
  const lastCurrentPlayerFailureText = lastCurrentPlayerCorrect === false
    ? getSubmissionFailureLabel(lastCurrentPlayerSubmission?.reason, Boolean(lastCurrentPlayerSubmission))
    : null;
  const matchElapsedSeconds = view?.lobby.started_at
    ? Math.max(0, Math.floor(((view.lobby.finished_at ? new Date(view.lobby.finished_at).getTime() : Date.now()) - new Date(view.lobby.started_at).getTime()) / 1000))
    : 0;

  useEffect(() => {
    const id = getOrCreateClientId();
    setClientId(id);
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const disconnectCurrentSession = () => {
      if (isLeavingLobbyRef.current) return;
      const currentView = viewRef.current;
      if (!currentView || !clientId) return;
      disconnectMultiplayerSession({
        code: currentView.lobby.code,
        clientId,
        status: currentView.lobby.status,
        storageKey: STORAGE_KEY,
        baseUrl: API_BASE,
      });
    };

    return addMultiplayerDisconnectListeners(disconnectCurrentSession);
  }, [clientId]);

  useEffect(() => {
    settingsDirtyRef.current = settingsDirty;
  }, [settingsDirty]);

  useEffect(() => {
    if (lobbyId) {
      setLobbyDescription(serverLobbyDescription);
    }
  }, [lobbyId, serverLobbyDescription]);

  const requestResponse = useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    Object.entries(await getAuthHeaders()).forEach(([key, value]) => headers.set(key, value));
    if (options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(path, { ...options, headers });
    return readLobbyResponse<T>(response);
  }, []);

  const requestLobby = useCallback(async (path: string, options: RequestInit = {}) => {
    const nextView = await requestResponse<CategoryClashLobbyView>(path, options);
    if (isLeavingLobbyRef.current || ignoredLobbyCodeRef.current === nextView.lobby.code) {
      return nextView;
    }
    setView(nextView);
    setDraftSettings((current) => (
      current && nextView.lobby.status === 'waiting' && settingsDirtyRef.current ? current : createDraftSettings(nextView)
    ));
    window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    setMessage('');
    return nextView;
  }, [requestResponse]);

  const appendChatMessage = useCallback((chatMessage: CategoryClashChatMessage) => {
    setView((current) => {
      if (!current || current.lobby.id !== chatMessage.lobby_id) return current;
      if (current.chatMessages.some((message) => message.id === chatMessage.id)) return current;
      return { ...current, chatMessages: [...current.chatMessages, chatMessage] };
    });
  }, []);

  const refreshView = useCallback(async () => {
    refreshVersionRef.current += 1;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const request = (async () => {
      let handledVersion = 0;
      while (handledVersion !== refreshVersionRef.current && !isLeavingLobbyRef.current) {
        handledVersion = refreshVersionRef.current;
        const currentView = viewRef.current;
        if (!currentView || !clientId) return;
        try {
          await requestLobby(`${API_BASE}/${currentView.lobby.code}?clientId=${encodeURIComponent(clientId)}`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to refresh lobby.');
        }
      }
    })();
    refreshInFlightRef.current = request;
    const clear = () => {
      if (refreshInFlightRef.current === request) refreshInFlightRef.current = null;
    };
    void request.then(clear, clear);
    return request;
  }, [clientId, requestLobby]);

  const loadPublicLobbies = useCallback(async () => {
    try {
      setPublicLobbies(await loadCategoryClashPublicLobbies());
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
    if (!canAnswer || view?.lobby.phase !== 'answering') return;
    const focusTimer = window.setTimeout(() => answerInputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [canAnswer, view?.lobby.current_category_id, view?.lobby.phase, view?.lobby.round_number, view?.lobby.turn_sequence]);

  useEffect(() => {
    const previous = previousRemainingSecondsRef.current;
    previousRemainingSecondsRef.current = remainingSeconds;
    if (view?.lobby.status !== 'active' || view.lobby.phase !== 'answering') return;
    if (previous === null || remainingSeconds > previous) {
      countdownSoundSecondRef.current = null;
      return;
    }
    if (remainingSeconds <= 0 || remainingSeconds > 3) return;
    if (countdownSoundSecondRef.current === remainingSeconds) return;
    countdownSoundSecondRef.current = remainingSeconds;
    playUiSound('timer-countdown');
  }, [remainingSeconds, view?.lobby.phase, view?.lobby.status]);

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
        const refreshDelay = view.lobby.phase === 'answering' ? ANSWER_GRADING_GRACE_MS + 150 : 150;
        window.setTimeout(() => void refreshView(), refreshDelay);
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [refreshView, view?.lobby.phase, view?.lobby.status, view?.phaseEndsAt]);

  const sendHeartbeat = useCallback(async () => {
    if (!connectedLobbyCode || !clientId) return;

    try {
      const response = await fetch(`${API_BASE}/${connectedLobbyCode}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, connected: true }),
      });
      if (!response.ok) await readLobbyResponse(response);
    } catch {
      // Realtime or the next heartbeat will retry transient failures.
    }
  }, [clientId, connectedLobbyCode]);

  useMultiplayerHeartbeat({
    enabled: Boolean(connectedLobbyCode && clientId),
    onHeartbeat: sendHeartbeat,
  });

  useEffect(() => {
    if (!activeLobbyId || !clientId) return undefined;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return undefined;
    const channel = supabase.channel(`category-clash:${activeLobbyId}`);
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'category_clash_lobby_events',
        filter: `lobby_id=eq.${activeLobbyId}`,
      }, (payload) => {
        const event = payload.new as { event_type?: unknown; payload?: unknown };
        if (event.event_type === 'answer_submitted') {
          return;
        }
        if (event.event_type === 'chat_message_posted' && isCategoryClashChatResponse(event.payload)) {
          appendChatMessage(event.payload.chatMessage);
          return;
        }
        if (realtimeRefreshTimeoutRef.current) window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
          realtimeRefreshTimeoutRef.current = null;
          void refreshView();
        }, 100);
      })
      .subscribe();
    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [activeLobbyId, appendChatMessage, clientId, refreshView]);

  useEffect(() => {
    const element = chatScrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [view?.chatMessages]);

  useEffect(() => {
    const resolvedOwnSubmissions = (view?.submissions ?? []).filter((submission) => (
      submission.player_id === currentPlayer?.id && typeof submission.correct === 'boolean'
    ));
    const nextIds = new Set(resolvedOwnSubmissions.map((submission) => submission.id));
    const previousIds = submissionSoundIdsRef.current;
    const lobbyChanged = submissionSoundLobbyIdRef.current !== (view?.lobby.id ?? null);

    if (!lobbyChanged) {
      resolvedOwnSubmissions
        .filter((submission) => !previousIds.has(submission.id))
        .forEach((submission) => {
          playUiSound(submission.correct ? 'skindle-guess-correct' : 'skindle-guess-incorrect');
        });
    }

    submissionSoundLobbyIdRef.current = view?.lobby.id ?? null;
    submissionSoundIdsRef.current = nextIds;
  }, [currentPlayer?.id, view?.lobby.id, view?.submissions]);

  useEffect(() => {
    if (!view || view.lobby.status !== 'finished') {
      finishSoundLobbyIdRef.current = null;
      return;
    }

    if (finishSoundLobbyIdRef.current === view.lobby.id) return;
    finishSoundLobbyIdRef.current = view.lobby.id;
    playUiSound(currentPlayer?.result === 'won' ? 'puzzle-complete' : 'timer-expired');
  }, [currentPlayer?.result, view]);

  useEffect(() => {
    if (!view || view.lobby.status !== 'waiting') {
      previousRosterSnapshotRef.current = null;
      return;
    }

    const nextSnapshot = {
      hostId: view.lobby.host_player_id,
      roles: new Map(view.players.map((player) => [player.id, player.role])),
      playerIds: new Set(view.players.map((player) => player.id)),
    };
    const previousSnapshot = previousRosterSnapshotRef.current;

    if (previousSnapshot) {
      const hostChanged = previousSnapshot.hostId !== nextSnapshot.hostId;
      const roleChanged = view.players.some((player) => previousSnapshot.roles.get(player.id) && previousSnapshot.roles.get(player.id) !== player.role);
      const playerRemoved = [...previousSnapshot.playerIds].some((playerId) => !nextSnapshot.playerIds.has(playerId));

      if (hostChanged || roleChanged || playerRemoved) {
        playUiSound('player-management');
      }
    }

    previousRosterSnapshotRef.current = nextSnapshot;
  }, [view]);

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

  const joinLobbyByCode = async (code: string, requirePublic = false) => {
    if (!clientId || !code.trim()) return;
    ignoredLobbyCodeRef.current = null;
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/join`, {
        method: 'POST',
        body: JSON.stringify({ clientId, code: code.trim(), requirePublic }),
      });
      setJoinCode('');
      setRejoinCandidate(null);
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
    playUiSound('setting-select');
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/settings`, {
        method: 'POST',
        body: JSON.stringify({ clientId, ...draftSettings, lobbyDescription }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update settings.');
    } finally {
      setBusy(false);
    }
  };

  const updatePublicStatus = async () => {
    if (!view || !clientId) return;
    playUiSound('setting-select');
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
          maxStrikes: view.lobby.max_strikes,
          lobbyDescription: view.lobby.lobby_description,
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
    playUiSound('random-select');
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
    playUiSound('random-select');
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

  const returnToLobby = async () => {
    if (!view || !clientId || !isHost) return;
    playUiSound('random-select');
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/return`, {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to return to lobby.');
    } finally {
      setBusy(false);
    }
  };

  const voteNextMatch = async () => {
    if (!view || !clientId || view.lobby.status !== 'finished') return;
    playUiSound('random-select');
    setBusy(true);
    try {
      await requestLobby(`${API_BASE}/${view.lobby.code}/next-match-vote`, {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to vote to play another match.');
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
      await requestResponse<{ kind: 'answer_submitted' }>(`${API_BASE}/${view.lobby.code}/submit`, {
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
    playUiSound('message-sent');
    const nextMessage = chatDraft.trim();
    setChatDraft('');
    try {
      const data = await requestResponse<CategoryClashChatResponse>(`${API_BASE}/${view.lobby.code}/chat`, {
        method: 'POST',
        body: JSON.stringify({ clientId, message: nextMessage }),
      });
      if (!isCategoryClashChatResponse(data)) {
        throw new Error('Invalid chat response.');
      }
      appendChatMessage(data.chatMessage);
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
              <button type="button" onClick={() => { window.location.href = '/'; }} className="rounded-2xl border border-white/10 bg-slate-950 p-3 text-slate-200 transition hover:text-white" aria-label="Back to home">
                <ArrowLeft size={22} />
              </button>
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

          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
            <MultiplayerCreateJoinPanel
              title="Set up a Category Clash lobby"
              joinCode={joinCode}
              onJoinCodeChange={setJoinCode}
              onJoin={joinLobby}
              onCreate={createLobby}
              canCreate={Boolean(clientId)}
              busy={busy}
              onRefreshPublicLobbies={() => void loadPublicLobbies()}
              reconnectPrompt={rejoinCandidate ? (
                <ReconnectButton
                  candidate={rejoinCandidate}
                  disabled={busy}
                  onReconnect={() => void joinLobbyByCode(rejoinCandidate.code)}
                  onExpire={() => setRejoinCandidate(null)}
                />
              ) : null}
              publicLobbyContent={publicLobbies.length > 0 ? publicLobbies.map((lobby) => (
                <MultiplayerPublicLobbyButton
                  key={lobby.code}
                  hostName={lobby.hostName}
                  hostNameStyle={getChatNameStyle(lobby.hostChatColor)}
                  playerCount={lobby.playerCount}
                  maxPlayers={lobby.maxPlayers}
                  disabled={busy}
                  onClick={() => void joinLobbyByCode(lobby.code, true)}
                  details={(
                    <>
                      {lobby.description ? <span className="basis-full text-slate-300">{lobby.description}</span> : null}
                      <span>{lobby.mode === 'turns' ? 'Turn based' : 'Simultaneous'}</span>
                    </>
                  )}
                />
              )) : <MultiplayerPublicLobbyEmpty />}
            />
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
  const shouldShowCategoryPanel = view.lobby.status !== 'finished';
  const categoryIsActiveForCurrentPlayer = view.lobby.phase === 'answering' && Boolean(
    currentPlayer?.result === 'active' &&
    currentPlayer.connected &&
    (
      view.lobby.game_mode === 'simultaneous' ||
      view.currentTurnPlayerId === currentPlayer.id
    ),
  );
  const categoryPanelClassName = categoryIsActiveForCurrentPlayer
    ? 'border-amber-300/60 bg-slate-950/80'
    : (view.lobby.phase === 'review' || view.lobby.phase === 'intermission') && lastCurrentPlayerCorrect === true
      ? 'border-emerald-400/50 bg-emerald-500/10'
      : (view.lobby.phase === 'review' || view.lobby.phase === 'intermission') && lastCurrentPlayerCorrect === false
        ? 'border-red-400/50 bg-red-500/10'
        : 'border-white/10 bg-slate-950/80';

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
            {view.lobby.status !== 'finished' ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
                <Users size={16} className="text-amber-300" />
                  {view.lobby.status === 'waiting'
                    ? `Lobby - ${connectedPlayers.length >= view.lobby.max_players ? 'Full' : connectedPlayers.length >= 2 ? 'Ready to start' : 'Waiting for players'}`
                    : view.lobby.status === 'active'
                      ? 'In Progress'
                      : 'Lobby'}
              </div>
            ) : null}
            {view.lobby.status === 'finished' ? (
              <>
                {canHostStartNextMatch ? (
                  <button type="button" onClick={startNextMatch} disabled={busy || connectedPlayers.length < 2} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    <Trophy size={16} /> Start New Match
                  </button>
                ) : (
                  <button type="button" onClick={voteNextMatch} disabled={busy || hasVotedForNextMatch} title={nextMatchVotePlayers.length > 0 ? nextMatchVotePlayers.map((player) => player.display_name).join(', ') : 'No votes yet'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-60">
                    <Check size={16} /> {hasVotedForNextMatch ? 'Voted' : 'Vote Next'} {view.nextMatchVotes.length}/{connectedPlayerCount}
                  </button>
                )}
                {isHost ? (
                  <button type="button" onClick={returnToLobby} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                    <RefreshCw size={16} /> Return to Lobby
                  </button>
                ) : null}
              </>
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
                    nameColor: CHAT_COLOR_NAME_HEX[player.chat_color],
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
                  <MultiplayerLobbyDescriptionInput
                    value={lobbyDescription}
                    disabled={!isHost || busy}
                    onChange={setLobbyDescription}
                  />
                  <fieldset className="mt-5 grid gap-5">
                    <legend className="sr-only">Game settings</legend>
                    <GameSettingsSection title="Mode" defaultOpen summary={visibleSettings?.gameMode === 'turns' ? 'Turn based' : 'Simultaneous'}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { id: 'simultaneous' as const, title: 'Simultaneous', text: 'Everyone answers the same category each round.' },
                          { id: 'turns' as const, title: 'Turn Based', text: 'Players answer one at a time with a short intermission.' },
                        ].map((mode) => (
                          <button key={mode.id} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, gameMode: mode.id } : current))} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.gameMode === mode.id ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
                            <span className="block text-sm font-bold text-white">{mode.title}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-400">{mode.text}</span>
                          </button>
                        ))}
                      </div>
                    </GameSettingsSection>

                    <GameSettingsSection
                      title="Timing"
                      summary={`${visibleSettings?.roundSeconds ?? 10}s ${visibleSettings?.gameMode === 'turns' ? 'turns' : 'rounds'}`}
                    >
                      <div className="grid gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{visibleSettings?.gameMode === 'turns' ? 'Turn length' : 'Round length'}</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-5">
                            {ROUND_SECONDS_OPTIONS.map((seconds) => (
                              <button key={seconds} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, roundSeconds: seconds } : current))} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.roundSeconds === seconds ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {seconds}s
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Intermission</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-4">
                            {INTERMISSION_SECONDS_OPTIONS.map((option) => (
                              <button key={option.value} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, intermissionSeconds: option.value } : current))} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.intermissionSeconds === option.value ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Timer decrement</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-4">
                            {TIMER_DECREMENT_OPTIONS.map((option) => (
                              <button key={option.value} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, timerDecrementInterval: option.value } : current))} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.timerDecrementInterval === option.value ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </GameSettingsSection>

                    <GameSettingsSection title="Strikes" defaultOpen={!isHost} summary={`${visibleSettings?.maxStrikes ?? 3} strikes`}>
                      <div className="grid gap-2 sm:grid-cols-5">
                        {MAX_STRIKES_OPTIONS.map((strikes) => (
                          <button key={strikes} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, maxStrikes: strikes } : current))} className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-65 ${visibleSettings?.maxStrikes === strikes ? 'border-amber-300/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900'}`}>
                            {strikes}
                          </button>
                        ))}
                      </div>
                    </GameSettingsSection>

                    <GameSettingsSection title="Categories" summary={`${selectedCategoryOptionCount} selected`}>
                      <div className={`max-h-[28rem] overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}`}>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <button type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: view.categories.map((category) => category.id) } : current))} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Select All</button>
                          <button type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => current ? { ...current, enabledCategoryIds: [] } : current))} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60">Clear</button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {categoryOptions.map((option) => {
                            const selectedIds = new Set(visibleSettings?.enabledCategoryIds ?? []);
                            const checked = option.categoryIds.every((id) => selectedIds.has(id));
                            return (
                              <button key={option.id} type="button" disabled={!isHost || busy} {...getSoundOptionHandlers(() => setDraftSettings((current) => {
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
                              }))} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${checked ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}>
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
              <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:grid-cols-[1fr_1fr_2fr]">
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{view.lobby.game_mode === 'turns' ? 'Turn' : 'Round'}</p>
                  <p className="mt-1 text-2xl font-black text-white">{view.lobby.game_mode === 'turns' ? view.lobby.turn_sequence : view.lobby.round_number}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{view.lobby.status === 'finished' ? 'Total Time' : 'Timer'}</p>
                  <p className={`mt-1 text-2xl font-black ${timerUrgent ? 'animate-pulse text-red-300' : 'text-amber-200'}`}>{view.lobby.status === 'finished' ? formatDuration(matchElapsedSeconds) : view.lobby.status === 'active' ? formatSeconds(remainingSeconds) : '--'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{getPhaseLabel(view)}</p>
                  <p className="mt-1 truncate text-lg font-black text-white">{shouldShowCategory ? view.currentCategory?.label : view.lobby.phase === 'countdown' ? 'Get Ready' : 'No category'}</p>
                </div>
              </div>

              {shouldShowCategoryPanel ? <div className={`rounded-3xl border p-5 ${categoryPanelClassName}`}>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{view.lobby.phase === 'countdown' ? 'Starting' : 'Category'}</p>
                <h2 className="mt-2 text-3xl font-black text-white">{shouldShowCategory ? view.currentCategory?.prompt : view.lobby.phase === 'countdown' ? `Match starts in ${remainingSeconds}` : 'Waiting for next category.'}</h2>
                {view.lobby.phase === 'countdown' ? (
                  <p className="mt-3 text-sm text-slate-400">Get ready. The first category opens when the countdown ends.</p>
                ) : view.lobby.game_mode === 'turns' ? (
                  <p className="mt-3 text-sm font-semibold text-slate-300">
                    Current player: <span style={currentTurnPlayer ? getChatNameStyle(currentTurnPlayer.chat_color) : undefined}>{currentTurnPlayer?.display_name ?? 'None'}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    All active players answer this category. Only your latest submission counts.
                  </p>
                )}
                {view.lobby.phase === 'review' ? <p className="mt-3 text-sm text-slate-400">Intermission before the next round.</p> : null}
                {view.lobby.phase === 'intermission' ? <p className="mt-3 text-sm text-slate-400">Intermission before the next turn.</p> : null}
                {lastCurrentPlayerFailureText ? (
                  <p className="mt-3 inline-flex rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100">
                    {lastCurrentPlayerFailureText}
                  </p>
                ) : null}
                {shouldShowCategory && canAnswer ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Your submission: <span className="normal-case tracking-normal text-slate-200">{currentPlayerCurrentSubmission?.guess ?? 'None yet'}</span>
                  </p>
                ) : null}

                <form onSubmit={submitAnswer} className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input ref={answerInputRef} value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} disabled={!canAnswer || busy} placeholder={canAnswer ? 'Type an answer' : 'Answers are closed'} className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60 disabled:opacity-60" />
                  <button type="submit" disabled={!canAnswer || busy || !answerDraft.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send size={16} /> Submit
                  </button>
                </form>
              </div> : null}

              <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Players</p>
                <div className="mt-4">
                  <MultiplayerLobbyRoster
                    showHeader={false}
                    compactColumns
                    canManage={false}
                    players={view.players.map((player) => {
                      const disconnectedBeforeFinish = !player.connected && Boolean(player.disconnected_at) && (
                        view.lobby.status === 'active' ||
                        Boolean(view.lobby.finished_at && new Date(player.disconnected_at as string).getTime() <= new Date(view.lobby.finished_at as string).getTime())
                      );
                      const disconnectedAfterFinish = !player.connected && view.lobby.status === 'finished' && !disconnectedBeforeFinish;
                      const placement = disconnectedBeforeFinish ? null : playerPlacements.get(player.id);
                      const strikeMarks = Array.from({ length: view.lobby.max_strikes }, (_, index) => index < player.strikes);
                      return {
                        id: player.id,
                        authUserId: player.auth_user_id,
                        displayName: `${player.display_name}${placement ? ` - ${formatPlacement(placement)}` : disconnectedBeforeFinish ? ' - Disconnected' : ''}`,
                        avatarUrl: player.avatar_url,
                        nameColor: CHAT_COLOR_NAME_HEX[player.chat_color],
                        role: placement === 1 ? 'Winner' : disconnectedBeforeFinish ? 'Disconnected' : player.result === 'active' ? (player.connected ? 'Active' : 'Disconnected') : player.result,
                        isCurrentUser: player.is_requesting_player,
                        isHost: player.id === view.lobby.host_player_id,
                        cardTone: placement === 1 ? 'victory' : player.result === 'eliminated' || disconnectedBeforeFinish ? 'danger' : 'default',
                        disconnected: disconnectedAfterFinish,
                        muted: disconnectedAfterFinish,
                        status: (
                          <div className="flex gap-0.5">
                            {strikeMarks.map((struck, index) => (
                              <span key={index} className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[0.6rem] font-black ${struck ? 'border-red-400/50 bg-red-500/20 text-red-200' : 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200'}`}>
                                {struck ? <X size={11} /> : <Check size={11} />}
                              </span>
                            ))}
                          </div>
                        ),
                      };
                    })}
                  />
                </div>
              </section>

              {activePlayers.some((player) => !player.connected && player.disconnected_at) ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activePlayers.filter((player) => !player.connected && player.disconnected_at).map((player) => (
                    <MultiplayerDisconnectStatus key={player.id} playerName={player.display_name} playerNameStyle={getChatNameStyle(player.chat_color)} disconnectedAt={player.disconnected_at as string} unavailable={view.lobby.status === 'finished'} />
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
                    const messageText = chatMessage.message.trim();
                    const roundStartParts = messageText.startsWith('__round_start__|')
                      ? messageText.split('|')
                      : null;
                    const turnStartParts = messageText.startsWith('__turn_start__|')
                      ? messageText.split('|')
                      : null;
                    const isEliminationNote = chatMessage.message_type !== 'player' && messageText.endsWith(' was eliminated.');
                    const isWinnerMessage = chatMessage.message_type !== 'player' && /\bwins\. /.test(messageText);
                    const styledResultMessage = player && messageText.startsWith(player.display_name) ? (
                      <>
                        <span style={getChatNameStyle(player.chat_color)}>{player.display_name}</span>
                        {messageText.slice(player.display_name.length)}
                      </>
                    ) : messageText;
                    if (roundStartParts) {
                      return (
                        <div key={chatMessage.id} className="py-2">
                          <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-white/10" />
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-300">Round {roundStartParts[1]}</span>
                            <span className="h-px flex-1 bg-white/10" />
                          </div>
                          <p className="mt-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-50">{roundStartParts.slice(2).join('|')}</p>
                        </div>
                      );
                    }
                    if (turnStartParts) {
                      return (
                        <div key={chatMessage.id} className="py-2">
                          <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-white/10" />
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-300">Turn {turnStartParts[1]} - {turnStartParts[2]}</span>
                            <span className="h-px flex-1 bg-white/10" />
                          </div>
                          <p className="mt-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-50">{turnStartParts.slice(3).join('|')}</p>
                        </div>
                      );
                    }
                    if (messageText.toLowerCase() === '__game_over__') {
                      return (
                        <div key={chatMessage.id} className="py-2">
                          <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-white/10" />
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-300">Game Over</span>
                            <span className="h-px flex-1 bg-white/10" />
                          </div>
                        </div>
                      );
                    }
                    if (isWinnerMessage) {
                      return (
                        <div key={chatMessage.id} className="multiplayer-victory-border rounded-2xl">
                          <div className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-black text-white">
                            {styledResultMessage}
                          </div>
                        </div>
                      );
                    }
                    if (isEliminationNote) {
                      return (
                        <div key={chatMessage.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${getMessageToneClass(chatMessage)}`}>
                          <X size={14} className="shrink-0 text-red-200" />
                          <span>{styledResultMessage}</span>
                        </div>
                      );
                    }
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
                        {chatMessage.message_type === 'result' ? styledResultMessage : chatMessage.message}
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
