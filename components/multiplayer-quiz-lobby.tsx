'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getOrCreateClientId, loadDetailedGameStats, queuePendingQuizGameStats, recordQuizGameStats, type DetailedGameStats } from '@/lib/game-storage';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { AbilityBlitz } from '@/components/ability-blitz';
import { SkinChampion } from '@/components/skin-champion';
import { MultiplayerGameProgress } from '@/components/multiplayer-game-progress';
import { ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { DifficultyLabel, getDifficultyStyle } from '@/components/difficulty-style';
import { GameSettingsSection } from '@/components/game-settings-section';
import {
  MultiplayerCreateJoinPanel,
  MultiplayerLobbyCard,
  MultiplayerLobbyCodeStrip,
  MultiplayerLobbyGrid,
  MultiplayerLobbyHeader,
  MultiplayerLobbyMessage,
  MultiplayerLobbyPanel,
  MultiplayerLobbyDescriptionInput,
  MultiplayerLobbyShell,
  MultiplayerModifierToggle,
  MultiplayerPublicLobbyButton,
  MultiplayerPublicLobbyEmpty,
  MultiplayerStartGameControl,
  MultiplayerVisibilityToggle,
} from '@/components/multiplayer-lobby-layout';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { useMultiplayerHeartbeat } from '@/components/use-multiplayer-heartbeat';
import { subscribeToRealtimeChannel } from '@/components/multiplayer-realtime';
import { ABILITY_SLOTS, formatAbilitySlotSelection, type AbilitySlotId } from '@/lib/ability-slots';
import { submitAchievementEvents } from '@/lib/achievement-client';
import { addMultiplayerDisconnectListeners, disconnectMultiplayerSession, getMultiplayerQuizLobbyStorageKey } from '@/lib/multiplayer-client-session';
import type {
  MultiplayerQuizDifficulty,
  MultiplayerQuizGameMode,
  MultiplayerQuizLobbyView,
  MultiplayerQuizProgressDelta,
  MultiplayerQuizPlayerResult,
  MultiplayerQuizPublicLobby,
} from '@/lib/multiplayer-quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { CHAT_COLOR_NAME_HEX, getChatNameStyle } from '@/lib/chat-colors';
import { playUiSound } from '@/lib/ui-sounds';

type SettingOption = { id: string; name: string; description: string };
type MultiplayerQuizConfig = {
  gameMode: MultiplayerQuizGameMode;
  title: string;
  route: string;
  soloRoute: string;
  difficulties: SettingOption[];
  modifiers: SettingOption[];
};
type DraftQuizSettings = {
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  totalItems: number;
  abilitySlots: AbilitySlotId[];
};
type LatestLobbySnapshot = {
  code: string;
  clientId: string;
  status: MultiplayerQuizLobbyView['lobby']['status'];
  lobbyId: string;
  progress: number;
  elapsedSeconds: number;
  totalItems: number;
  result: MultiplayerQuizPlayerResult;
};

const MIN_PLAYERS_TO_START = 2;
const DEFAULT_TOTAL_ITEMS = 25;

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
    soloRoute: '/ability-blitz',
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
    soloRoute: '/skin-champion',
    difficulties,
    modifiers: [
      { id: 'greyscale', name: 'Greyscale', description: 'Splash art is greyscaled.' },
      { id: 'blurred', name: 'Blurred', description: 'Splash art is slightly blurred.' },
      { id: 'cropped', name: 'Cropped', description: 'Only a cropped section of the splash art is shown.' },
      { id: 'hiddenTimer', name: 'Hidden Timer', description: 'The timer is hidden during play.' },
      { id: 'confirmEntry', name: 'Confirm Entry', description: 'Answers require confirmation before submission.' },
    ],
  },
};

type MultiplayerQuizProgressResponse = {
  kind: 'player_progress';
  player: MultiplayerQuizProgressDelta;
};

function isProgressResponse(value: unknown): value is MultiplayerQuizProgressResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; player?: { id?: unknown; progress?: unknown } };
  return candidate.kind === 'player_progress'
    && typeof candidate.player?.id === 'string'
    && typeof candidate.player.progress === 'number';
}

async function readResponse<T = MultiplayerQuizLobbyView>(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Multiplayer lobby request failed.');
  }
  return data as T;
}

function compareRacePlayers(
  first: MultiplayerQuizLobbyView['players'][number],
  second: MultiplayerQuizLobbyView['players'][number],
) {
  if (first.result === 'failed' && second.result !== 'failed') return 1;
  if (first.result !== 'failed' && second.result === 'failed') return -1;
  if (first.result === 'completed' && second.result !== 'completed') return -1;
  if (first.result !== 'completed' && second.result === 'completed') return 1;

  if (first.result === 'completed' && second.result === 'completed') {
    return new Date(first.finished_at as string).getTime() - new Date(second.finished_at as string).getTime();
  }

  if (first.progress !== second.progress) {
    return second.progress - first.progress;
  }

  if (first.elapsed_seconds !== second.elapsed_seconds) {
    return first.elapsed_seconds - second.elapsed_seconds;
  }

  return new Date(first.joined_at).getTime() - new Date(second.joined_at).getTime();
}

function getMultiplayerQuizResult(
  players: MultiplayerQuizLobbyView['players'],
  playerId: string,
  matchFinished: boolean,
): 'win' | 'loss' | null {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return null;
  }
  if (player.result === 'failed') return 'loss';
  if (player.result === 'active' && !matchFinished) return null;

  const standings = [...players].sort(compareRacePlayers);
  const placementIndex = standings.findIndex((player) => player.id === playerId);
  if (placementIndex < 0) {
    return 'loss';
  }

  const playersBeaten = players.length - placementIndex - 1;
  return playersBeaten >= Math.ceil(players.length / 2) ? 'win' : 'loss';
}

function createDraftSettings(view: MultiplayerQuizLobbyView): DraftQuizSettings {
  return {
    difficulty: view.lobby.difficulty,
    modifiers: view.lobby.modifiers,
    totalItems: view.lobby.total_items,
    abilitySlots: view.lobby.ability_slots,
  };
}

function areDraftSettingsDirty(view: MultiplayerQuizLobbyView, draft: DraftQuizSettings) {
  const currentAbilitySlots = [...view.lobby.ability_slots].sort().join(',');
  const draftAbilitySlots = [...draft.abilitySlots].sort().join(',');
  return (
    draft.difficulty !== view.lobby.difficulty ||
    draft.totalItems !== view.lobby.total_items ||
    [...draft.modifiers].sort().join(',') !== [...view.lobby.modifiers].sort().join(',') ||
    draftAbilitySlots !== currentAbilitySlots
  );
}

function getQuizMultiplayerRecord(stats: DetailedGameStats, gameMode: MultiplayerQuizGameMode) {
  return gameMode === 'ability_blitz'
    ? stats.abilityBlitz.multiplayer
    : stats.skinChampion.multiplayer;
}

function getLocalRecordSnapshot(gameMode: MultiplayerQuizGameMode) {
  const stats = getQuizMultiplayerRecord(loadDetailedGameStats(), gameMode);
  return {
    wins: stats.matchesWon,
    losses: stats.matchesLost,
  };
}

function recordFinishedMultiplayerQuizStats(gameMode: MultiplayerQuizGameMode, view: MultiplayerQuizLobbyView) {
  if (view.lobby.status !== 'finished' || !view.requestingPlayer) {
    return;
  }

  const result = getMultiplayerQuizResult(view.players, view.requestingPlayer.id, true);
  if (!result) {
    return;
  }

  recordQuizGameStats({
    gameId: gameMode === 'ability_blitz' ? 'ability-blitz' : 'skin-champion',
    mode: 'multiplayer',
    completedItems: Math.min(view.lobby.total_items, view.requestingPlayer.progress),
    totalItems: view.lobby.total_items,
    wrongGuesses: 0,
    elapsedSeconds: view.requestingPlayer.elapsed_seconds,
    won: result === 'win',
    lost: result === 'loss',
    matchId: view.lobby.id,
  });
}

function queuePendingMultiplayerQuizLoss(gameMode: MultiplayerQuizGameMode, snapshot: LatestLobbySnapshot | null) {
  if (!snapshot || snapshot.status !== 'active' || snapshot.result !== 'active') {
    return;
  }

  queuePendingQuizGameStats({
    gameId: gameMode === 'ability_blitz' ? 'ability-blitz' : 'skin-champion',
    mode: 'multiplayer',
    completedItems: Math.min(snapshot.totalItems, snapshot.progress),
    totalItems: snapshot.totalItems,
    wrongGuesses: 0,
    elapsedSeconds: snapshot.elapsedSeconds,
    won: false,
    lost: true,
    matchId: snapshot.lobbyId,
  }, Date.now() + 61_000);
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
  const [lobbyDescription, setLobbyDescription] = useState('');
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const [draftSettings, setDraftSettings] = useState<DraftQuizSettings | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const latestLobbyRef = useRef<LatestLobbySnapshot | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshVersionRef = useRef(0);
  const previousLobbyRosterRef = useRef<{ hostPlayerId: string | null; playerIds: Set<string> }>({ hostPlayerId: null, playerIds: new Set() });
  const isLeavingLobbyRef = useRef(false);
  const achievementLobbyRef = useRef<string | null>(null);

  useMultiplayerAuthTransition(async () => {
    const activeLobby = latestLobbyRef.current;
    if (!activeLobby) return;

    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
    setView(null);
    setMessage('');
    window.history.replaceState(null, '', config.route);
    await fetch(`/api/multiplayer/lobbies/${activeLobby.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: activeLobby.clientId, forfeit: true }),
    }).catch(() => undefined);
    router.push('/games');
  });

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const lobbyId = view?.lobby.id ?? null;
  const serverLobbyDescription = view?.lobby.lobby_description ?? '';
  const lobbyDescriptionDirty = lobbyDescription !== serverLobbyDescription;
  const visibleSettings = draftSettings ?? (view ? createDraftSettings(view) : null);
  const selectedModifiers = useMemo(() => new Set(visibleSettings?.modifiers ?? []), [visibleSettings?.modifiers]);
  const connectedLobbyCode = view && (view.lobby.status === 'waiting' || view.lobby.status === 'active')
    ? view.lobby.code
    : null;

  useEffect(() => {
    latestLobbyRef.current = view && clientId && view.requestingPlayer
      ? {
          code: view.lobby.code,
          clientId,
          status: view.lobby.status,
          lobbyId: view.lobby.id,
          progress: view.requestingPlayer.progress,
          elapsedSeconds: view.requestingPlayer.elapsed_seconds,
          totalItems: view.lobby.total_items,
          result: view.requestingPlayer.result,
        }
      : null;
  }, [clientId, view]);

  useEffect(() => {
    if (!view || settingsDirty) {
      return;
    }

    setDraftSettings(createDraftSettings(view));
  }, [settingsDirty, view?.lobby.ability_slots, view?.lobby.difficulty, view?.lobby.modifiers, view?.lobby.total_items, view]);

  useEffect(() => {
    if (!view || view.lobby.status !== 'finished' || !view.requestingPlayer || achievementLobbyRef.current === view.lobby.id) {
      return;
    }

    const result = getMultiplayerQuizResult(view.players, view.requestingPlayer.id, true);
    if (!result) {
      return;
    }

    achievementLobbyRef.current = view.lobby.id;
    const gameId = gameMode === 'ability_blitz' ? 'ability-blitz' : 'skin-champion';
    const developerPresent = view.players.some((player) => player.display_name.trim().toLowerCase() === 'justin');
    void submitAchievementEvents([
      { event: 'multiplayer_result', metadata: { gameId, result } },
      ...(developerPresent ? [{ event: 'developer_moment' as const, metadata: { gameId, developerPresent } }] : []),
    ]);
  }, [gameMode, view]);

  useEffect(() => {
    if (lobbyId) {
      setLobbyDescription(serverLobbyDescription);
    }
  }, [lobbyId, serverLobbyDescription]);


  useEffect(() => {
    const disconnectOnPageExit = () => {
      const activeLobby = latestLobbyRef.current;
      if (!activeLobby) return;
      queuePendingMultiplayerQuizLoss(gameMode, activeLobby);
      disconnectMultiplayerSession({
        ...activeLobby,
        storageKey: getMultiplayerQuizLobbyStorageKey(gameMode),
        baseUrl: '/api/multiplayer/lobbies',
      });
    };
    return addMultiplayerDisconnectListeners(disconnectOnPageExit);
  }, [gameMode]);

  const applyView = useCallback((nextView: MultiplayerQuizLobbyView) => {
    if (isLeavingLobbyRef.current) return;
    if (nextView.lobby.status === 'terminated') {
      latestLobbyRef.current = null;
      window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
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
      playUiSound('player-management');
      return;
    }
    const previousRoster = previousLobbyRosterRef.current;
    const nextPlayerIds = new Set(nextView.players.map((player) => player.id));
    const hostChanged = Boolean(previousRoster.hostPlayerId && previousRoster.hostPlayerId !== nextView.lobby.host_player_id);
    const playerRemoved = [...previousRoster.playerIds].some((playerId) => !nextPlayerIds.has(playerId));
    if (hostChanged || playerRemoved) {
      playUiSound('player-management');
    }
    previousLobbyRosterRef.current = {
      hostPlayerId: nextView.lobby.host_player_id,
      playerIds: nextPlayerIds,
    };
    setView(nextView);
    setRejoinCandidate(null);
    if (nextView.lobby.status === 'waiting' || nextView.lobby.status === 'active') {
      window.localStorage.setItem(getMultiplayerQuizLobbyStorageKey(gameMode), nextView.lobby.code);
    } else {
      window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
    }
    window.history.replaceState(null, '', `${config.route}?code=${nextView.lobby.code}`);
  }, [config.route, gameMode, router]);

  const applyProgressDelta = useCallback((delta: MultiplayerQuizProgressDelta) => {
    setView((current) => {
      if (!current) return current;
      const nextPlayers = current.players.map((player) => (
        player.id === delta.id ? { ...player, ...delta } : player
      ));
      const nextRequestingPlayer = current.requestingPlayer?.id === delta.id
        ? { ...current.requestingPlayer, ...delta }
        : current.requestingPlayer;
      return { ...current, players: nextPlayers, requestingPlayer: nextRequestingPlayer };
    });
  }, []);

  const refreshLobby = useCallback(async (code: string, activeClientId: string) => {
    if (isLeavingLobbyRef.current) return;
    refreshVersionRef.current += 1;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const request = (async () => {
      let handledVersion = 0;
      while (handledVersion !== refreshVersionRef.current && !isLeavingLobbyRef.current) {
        handledVersion = refreshVersionRef.current;
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
      }
    })();
    refreshInFlightRef.current = request;
    const clearRequest = () => {
      if (refreshInFlightRef.current === request) refreshInFlightRef.current = null;
    };
    void request.then(clearRequest, clearRequest);
    return request;
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
        const storedCode = window.localStorage.getItem(getMultiplayerQuizLobbyStorageKey(gameMode));
        if (storedCode) {
          try {
            const response = await fetch(`/api/multiplayer/lobbies/${storedCode}/rejoin?clientId=${encodeURIComponent(nextClientId)}`);
            const eligibility = await response.json() as ReconnectCandidate & { eligible: boolean };
            if (eligibility.eligible && !cancelled) {
              setRejoinCandidate({ code: eligibility.code, expiresAt: eligibility.expiresAt });
            } else {
              try {
                const finishedResponse = await fetch(`/api/multiplayer/lobbies/${storedCode}?clientId=${encodeURIComponent(nextClientId)}`);
                if (finishedResponse.ok) {
                  const finishedView = await readResponse(finishedResponse);
                  recordFinishedMultiplayerQuizStats(gameMode, finishedView);
                }
              } catch {
                // If the lobby no longer exists, there is no final result to recover.
              }
              window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
            }
          } catch {
            window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
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
            record: getLocalRecordSnapshot(gameMode),
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
      }, (payload) => {
        const event = payload.new as { event_type?: unknown; payload?: unknown };
        if (event.event_type === 'progress_updated' && isProgressResponse(event.payload)) {
          applyProgressDelta(event.payload.player);
          return;
        }
        void refreshLobby(view.lobby.code, clientId);
      });
    subscribeToRealtimeChannel(channel, () => refreshLobby(view.lobby.code, clientId));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyProgressDelta, clientId, refreshLobby, view?.lobby.code, view?.lobby.id]);

  const sendHeartbeat = useCallback(async () => {
    if (!connectedLobbyCode || !clientId) return;

    try {
      const response = await fetch(`/api/multiplayer/lobbies/${connectedLobbyCode}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, record: getLocalRecordSnapshot(gameMode) }),
      });
      if (!response.ok) await readResponse(response);
    } catch {
      // Realtime or the next heartbeat will retry transient failures.
    }
  }, [clientId, connectedLobbyCode, gameMode]);

  useMultiplayerHeartbeat({
    enabled: Boolean(connectedLobbyCode && clientId),
    onHeartbeat: sendHeartbeat,
    onReconcile: view?.lobby.status === 'active' && clientId
      ? () => { void refreshLobby(view.lobby.code, clientId); }
      : undefined,
  });

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
        body: JSON.stringify({ gameMode, clientId, record: getLocalRecordSnapshot(gameMode) }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobbyByCode = async (code: string, requirePublic = false) => {
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
        body: JSON.stringify({ code, gameMode, clientId, requirePublic, record: getLocalRecordSnapshot(gameMode) }),
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
      router.push('/games');
      return;
    }
    const code = view.lobby.code;
    const wasWaiting = view.lobby.status === 'waiting';
    const forfeit = !wasWaiting;
    queuePendingMultiplayerQuizLoss(gameMode, latestLobbyRef.current);
    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    setView(null);
    setMessage('');
    window.history.replaceState(null, '', config.route);
    window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
    setPublicLobbies((current) => current.filter((lobby) => lobby.code !== code));
    await fetch(`/api/multiplayer/lobbies/${code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, forfeit }),
      keepalive: true,
    }).catch(() => undefined);
    setRejoinCandidate(null);
    isLeavingLobbyRef.current = false;
    await loadPublicLobbies();
  };

  const updateSettings = async (
    difficulty: MultiplayerQuizDifficulty,
    modifiers: string[],
    totalItems = view?.lobby.total_items ?? DEFAULT_TOTAL_ITEMS,
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
        body: JSON.stringify({ clientId, difficulty, modifiers, totalItems, isPublic, abilitySlots, lobbyDescription: view.lobby.lobby_description }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby settings.');
    } finally {
      setBusy(false);
    }
  };

  const updateDraftSettings = (updater: (current: DraftQuizSettings) => DraftQuizSettings) => {
    if (!view || !isHost) {
      return;
    }

    setDraftSettings((current) => {
      const nextSettings = updater(current ?? createDraftSettings(view));
      setSettingsDirty(areDraftSettingsDirty(view, nextSettings));
      return nextSettings;
    });
  };

  const applyDraftSettings = async () => {
    if (!view || !clientId || !isHost || !draftSettings || (!settingsDirty && !lobbyDescriptionDirty)) {
      return;
    }

    setBusy(true);
    setMessage('');
    playUiSound('setting-select');
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          difficulty: draftSettings.difficulty,
          modifiers: draftSettings.modifiers,
          totalItems: draftSettings.totalItems,
          isPublic: view.lobby.is_public,
          abilitySlots: draftSettings.abilitySlots,
          lobbyDescription,
        }),
      });
      const nextView = await readResponse(response);
      setSettingsDirty(false);
      setDraftSettings(createDraftSettings(nextView));
      applyView(nextView);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to apply lobby settings.');
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

  const startGame = useCallback(async () => {
    if (!view || !clientId || !isHost) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, record: getLocalRecordSnapshot(gameMode) }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  }, [applyView, clientId, gameMode, isHost, view]);

  const reportProgress = useCallback(async (progress: number, elapsedSeconds: number, result: MultiplayerQuizPlayerResult) => {
    if (!view || !clientId) {
      return;
    }
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, progress, elapsedSeconds, result, record: getLocalRecordSnapshot(gameMode) }),
      });
      const data = await readResponse<MultiplayerQuizProgressResponse>(response);
      if (!isProgressResponse(data)) {
        throw new Error('Invalid multiplayer progress response.');
      }
      applyProgressDelta(data.player);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update multiplayer progress.');
    }
  }, [applyProgressDelta, clientId, gameMode, view]);

  const returnToLobby = async () => {
    if (!view || !clientId || !isHost) {
      return;
    }

    playUiSound('random-select');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/multiplayer/lobbies/${view.lobby.code}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to return to lobby.');
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = () => {
    if (!view) {
      return;
    }
    void navigator.clipboard.writeText(`${window.location.origin}${config.route}?code=${view.lobby.code}`);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1400);
  };

  if (view && view.lobby.status !== 'waiting' && view.requestingPlayer && view.quizItems.length > 0) {
    const matchFinished = view.lobby.status === 'finished';
    const recordResult = getMultiplayerQuizResult(view.players, view.requestingPlayer.id, matchFinished);
    const multiplayerStats = getQuizMultiplayerRecord(loadDetailedGameStats(), gameMode);
    const multiplayerMatchRecorded = multiplayerStats.recordedMatchIds.includes(view.lobby.id);
    const displayedMultiplayerWins = Math.max(0, multiplayerStats.matchesWon - (multiplayerMatchRecorded && recordResult === 'win' ? 1 : 0));
    const displayedMultiplayerLosses = Math.max(0, multiplayerStats.matchesLost - (multiplayerMatchRecorded && recordResult === 'loss' ? 1 : 0));
    const playerResults = Object.fromEntries(
      view.players
        .map((player) => {
          const result = getMultiplayerQuizResult(view.players, player.id, matchFinished);
          if (!result) return null;
          const isRequestingPlayer = player.id === view.requestingPlayer?.id;
          return [
            player.id,
            {
              result,
              wins: isRequestingPlayer ? displayedMultiplayerWins : player.record_wins,
              losses: isRequestingPlayer ? displayedMultiplayerLosses : player.record_losses,
            },
          ] as const;
        })
        .filter((entry): entry is readonly [string, { result: 'win' | 'loss'; wins: number; losses: number }] => Boolean(entry)),
    );
    const runtime = {
      items: view.quizItems,
      difficulty: view.lobby.difficulty,
      modifiers: view.lobby.modifiers,
      initialProgress: view.requestingPlayer.progress,
      initialElapsedSeconds: view.requestingPlayer.elapsed_seconds,
      startCountdownSeconds: view.lobby.status === 'active' && view.lobby.started_at
        ? Math.max(0, Math.ceil((new Date(view.lobby.started_at).getTime() - Date.now()) / 1000))
        : 0,
      gameEnded: view.lobby.status === 'finished',
      matchId: view.lobby.id,
      won: recordResult === 'win',
      lost: recordResult === 'loss',
      recordResult,
      canReturnToLobby: view.lobby.status === 'finished' && isHost,
      returnToLobbyLabel: busy ? 'Returning...' : 'Return to Lobby',
      progressPanel: (
        <MultiplayerGameProgress
          players={view.players}
          totalItems={view.lobby.total_items}
          playerResults={playerResults}
          recordSummary={{
            wins: displayedMultiplayerWins,
            losses: displayedMultiplayerLosses,
            result: recordResult,
          }}
        />
      ),
      onProgress: reportProgress,
      onExit: leaveLobby,
      onReturnToLobby: returnToLobby,
    };
    return gameMode === 'ability_blitz'
      ? <AbilityBlitz multiplayer={runtime} />
      : <SkinChampion multiplayer={runtime} />;
  }

  const infoSteps = gameMode === 'ability_blitz' ? [
    'Identify the ability shown and submit its exact name.',
    'Correct answers advance through the shared randomized set; difficulty controls hints and penalties.',
    'Finish the set before your opponents.',
  ] : [
    'Identify the skin line shown by the splash art.',
    'Use hints and autocomplete when the selected difficulty allows them.',
    'Finish the shared randomized set before your opponents.',
  ];
  const connectedWaitingPlayers = view?.players.filter((player) => player.connected).length ?? 0;
  const statusLabel = view?.lobby.status === 'waiting'
    ? `Lobby - ${view.players.length >= view.lobby.max_players ? 'Full' : connectedWaitingPlayers >= MIN_PLAYERS_TO_START ? 'Ready to start' : 'Waiting for players'}`
    : view?.lobby.status === 'active'
      ? 'In Progress'
      : view?.lobby.status === 'finished'
        ? 'Finished'
        : 'Lobby';

  return (
    <MultiplayerLobbyShell>
      <MultiplayerLobbyHeader
        title={config.title}
        subtitle={view ? 'Lobby' : 'Create or join a lobby'}
        statusLabel={statusLabel}
        infoSteps={infoSteps}
        onBack={view ? leaveLobby : () => router.push('/games')}
      />

      <MultiplayerLobbyCard>
        {!view ? (
          <MultiplayerCreateJoinPanel
            title={`Set up an ${config.title} lobby`}
            joinCode={joinCode}
            onJoinCodeChange={setJoinCode}
            onJoin={joinLobby}
            onCreate={createLobby}
            canCreate={Boolean(clientId)}
            busy={busy}
            soloHref={config.soloRoute}
            soloDescription={`Open ${config.title} Solo`}
            onRefreshPublicLobbies={() => void loadPublicLobbies()}
            reconnectPrompt={rejoinCandidate ? (
              <ReconnectButton
                candidate={rejoinCandidate}
                disabled={busy}
                onReconnect={() => void joinLobbyByCode(rejoinCandidate.code)}
                onExpire={() => {
                  window.localStorage.removeItem(getMultiplayerQuizLobbyStorageKey(gameMode));
                  setRejoinCandidate(null);
                }}
              />
            ) : null}
            publicLobbyContent={publicLobbies.length ? publicLobbies.map((lobby) => (
              <MultiplayerPublicLobbyButton
                key={lobby.code}
                hostName={lobby.hostName}
                hostNameStyle={getChatNameStyle(lobby.hostChatColor)}
                playerCount={lobby.playerCount}
                maxPlayers={lobby.maxPlayers}
                disabled={busy}
                onClick={() => joinLobbyByCode(lobby.code, true)}
                details={(
                  <>
                    {lobby.description ? (
                      <>
                        <span className="basis-full text-slate-300">{lobby.description}</span>
                      </>
                    ) : null}
                    <DifficultyLabel difficulty={lobby.difficulty} />
                    <span aria-hidden="true">|</span>
                    <span>{lobby.totalItems} Entries</span>
                    {lobby.gameMode === 'ability_blitz' ? (
                      <>
                        <span aria-hidden="true">|</span>
                        <span>Abilities: {formatAbilitySlotSelection(lobby.abilitySlots)}</span>
                      </>
                    ) : null}
                  </>
                )}
                badges={lobby.modifiers.length > 0 ? lobby.modifiers.map((modifierId) => (
                  <span key={modifierId} className="rounded-md border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[0.65rem] font-semibold text-violet-200">
                    {config.modifiers.find((modifier) => modifier.id === modifierId)?.name ?? modifierId}
                  </span>
                )) : null}
              />
            )) : <MultiplayerPublicLobbyEmpty />}
          />
        ) : (
          <div className="grid gap-5">
            <MultiplayerLobbyCodeStrip
              code={view.lobby.code}
              revealed={codeRevealed}
              copied={codeCopied}
              onToggleReveal={() => setCodeRevealed((value) => !value)}
              onCopy={copyInvite}
            />

            <MultiplayerLobbyGrid>
              <MultiplayerLobbyRoster
                countLabel={`${view.players.length}/${view.lobby.max_players} Players`}
                canManage={isHost && view.lobby.status === 'waiting'}
                players={view.players.map((player) => ({
                  id: player.id,
                  authUserId: player.auth_user_id,
                  displayName: player.display_name,
                  nameColor: CHAT_COLOR_NAME_HEX[player.chat_color],
                  avatarUrl: player.avatar_url,
                  role: player.role,
                  isCurrentUser: player.is_requesting_player,
                  isHost: player.id === view.lobby.host_player_id,
                  status: player.id === view.lobby.host_player_id ? <Check size={16} className="text-emerald-300" /> : null,
                }))}
                onKick={(playerId) => managePlayer('kick', playerId)}
                onMakeHost={(playerId) => managePlayer('make-host', playerId)}
              />

              <MultiplayerLobbyPanel
                title="Game Settings"
                headerAction={settingsDirty || lobbyDescriptionDirty ? (
                  <button type="button" onClick={applyDraftSettings} disabled={!isHost || busy} className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-300 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    Apply Changes
                  </button>
                ) : null}
                trailing={(
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                      Entries
                      <select value={visibleSettings?.totalItems ?? view.lobby.total_items} disabled={!isHost || busy} onChange={(event) => {
                        playUiSound('autocomplete-select');
                        updateDraftSettings((current) => ({ ...current, totalItems: Number(event.target.value) }));
                      }} className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none disabled:opacity-60">
                        {[10, 25, 50, 75, 100].map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </label>
                    <SlidersHorizontal size={20} className="text-amber-300" />
                  </div>
                )}
                lockedHint={!isHost ? 'Only the host can change game settings.' : null}
              >
                <MultiplayerVisibilityToggle
                  enabled={view.lobby.is_public}
                  disabled={!isHost || busy}
                  onToggle={() => updateSettings(view.lobby.difficulty, view.lobby.modifiers, view.lobby.total_items, !view.lobby.is_public, view.lobby.ability_slots)}
                />
                <MultiplayerLobbyDescriptionInput
                  value={lobbyDescription}
                  disabled={!isHost || busy}
                  onChange={setLobbyDescription}
                />
                <fieldset className="mt-5 grid gap-5">
                  <legend className="sr-only">Game settings</legend>
                  <GameSettingsSection title="Difficulty" defaultOpen summary={<DifficultyLabel difficulty={visibleSettings?.difficulty ?? view.lobby.difficulty} />}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {config.difficulties.map((difficulty) => (
                        <button
                          key={difficulty.id}
                          type="button"
                          disabled={!isHost || busy}
                          onMouseEnter={() => playUiSound('autocomplete-hover')}
                          onFocus={() => playUiSound('autocomplete-hover')}
                          onClick={() => {
                            playUiSound('autocomplete-select');
                            updateDraftSettings((current) => ({ ...current, difficulty: difficulty.id as MultiplayerQuizDifficulty }));
                          }}
                          className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${(visibleSettings?.difficulty ?? view.lobby.difficulty) === difficulty.id ? getDifficultyStyle(difficulty.id).selected : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}
                        >
                          <DifficultyLabel difficulty={difficulty.id} className="text-sm" />
                          <span className="mt-1 block text-xs leading-5 text-slate-400">{difficulty.description}</span>
                        </button>
                      ))}
                    </div>
                  </GameSettingsSection>
                  <GameSettingsSection title="Modifiers" summary={`${visibleSettings?.modifiers.length ?? view.lobby.modifiers.length} active`}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {config.modifiers.map((modifier) => {
                        const checked = selectedModifiers.has(modifier.id);
                        return (
                          <MultiplayerModifierToggle
                            key={modifier.id}
                            name={modifier.name}
                            description={modifier.description}
                            checked={checked}
                            disabled={!isHost || busy}
                            onToggle={() => updateDraftSettings((current) => ({
                              ...current,
                              modifiers: checked ? current.modifiers.filter((id) => id !== modifier.id) : [...current.modifiers, modifier.id],
                            }))}
                          />
                        );
                      })}
                    </div>
                  </GameSettingsSection>
                  {gameMode === 'ability_blitz' ? (
                    <GameSettingsSection title="Ability Set" summary={`${visibleSettings?.abilitySlots.length ?? view.lobby.ability_slots.length}/5`}>
                      <p className="mb-3 text-xs leading-5 text-slate-400">Select which abilities can appear in the shared round.</p>
                      <div className="grid grid-cols-5 gap-2">
                        {ABILITY_SLOTS.map((slot) => {
                          const selected = (visibleSettings?.abilitySlots ?? view.lobby.ability_slots).includes(slot.id);
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              title={slot.name}
                              disabled={!isHost || busy}
                              onMouseEnter={() => playUiSound('autocomplete-hover')}
                              onFocus={() => playUiSound('autocomplete-hover')}
                              onClick={() => {
                                playUiSound('autocomplete-select');
                                const currentSlots = visibleSettings?.abilitySlots ?? view.lobby.ability_slots;
                                if (selected && currentSlots.length === 1) return;
                                updateDraftSettings((current) => ({
                                  ...current,
                                  abilitySlots: selected
                                    ? current.abilitySlots.filter((id) => id !== slot.id)
                                    : [...current.abilitySlots, slot.id],
                                }));
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
              </MultiplayerLobbyPanel>
            </MultiplayerLobbyGrid>

            <MultiplayerStartGameControl
              disabled={!isHost || connectedWaitingPlayers < MIN_PLAYERS_TO_START || busy || settingsDirty || lobbyDescriptionDirty}
              onStart={startGame}
              hint={settingsDirty || lobbyDescriptionDirty ? 'Apply setting changes before starting.' : 'The host can start once at least two players have joined.'}
            />
          </div>
        )}

        <MultiplayerLobbyMessage>{message}</MultiplayerLobbyMessage>
      </MultiplayerLobbyCard>
    </MultiplayerLobbyShell>
  );
}
