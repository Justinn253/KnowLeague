'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Play, RefreshCw, Search, Users } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { getOrCreateClientId, loadPlayerDisplayName, savePlayerDisplayName } from '@/lib/game-storage';
import { normalizeAnswer } from '@/lib/quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { SkincognitoCategoryId, SkincognitoLobbyView, SkincognitoPublicLobby, SkincognitoPublicPlayer } from '@/lib/skincognito';

type SkinAnswer = {
  id: string;
  label: string;
  imageUrl: string;
};

type SkincognitoAnswers = {
  skin: SkinAnswer[];
  champion: string[];
  skinLine: string[];
  releaseYear: string[];
  rarity: string[];
  gender: string[];
  role: string[];
  race: string[];
};

type ChatGroup = {
  key: string;
  playerId: string | null;
  label: string;
  alignRight: boolean;
  colorClassName: string;
  messages: string[];
};

const LOBBY_STORAGE_KEY = 'knowleague:v1:skincognito:lobby-code';
const CHAT_MESSAGE_MAX_LENGTH = 240;

const CATEGORY_DEFINITIONS: Array<{ id: Exclude<SkincognitoCategoryId, 'skin'>; label: string }> = [
  { id: 'champion', label: 'Champion' },
  { id: 'skinLine', label: 'Skin Line' },
  { id: 'releaseYear', label: 'Release Year' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'gender', label: 'Gender' },
  { id: 'role', label: 'Role' },
  { id: 'race', label: 'Species' },
];

const INPUT_CATEGORIES: Array<{ id: SkincognitoCategoryId; label: string }> = [
  { id: 'skin', label: 'Skin' },
  ...CATEGORY_DEFINITIONS,
];

const EMPTY_ANSWERS: SkincognitoAnswers = {
  skin: [],
  champion: [],
  skinLine: [],
  releaseYear: [],
  rarity: [],
  gender: [],
  role: [],
  race: [],
};

function getPlayerById(view: SkincognitoLobbyView | null, playerId?: string | null) {
  if (!view || !playerId) {
    return null;
  }

  return view.players.find((player) => player.id === playerId) ?? null;
}

function getCategoryCorrectSet(view: SkincognitoLobbyView | null, playerId?: string | null) {
  if (!view || !playerId) {
    return new Set<SkincognitoCategoryId>();
  }

  return new Set(
    view.actions
      .filter((action) => action.player_id === playerId && action.is_correct && action.category_id)
      .map((action) => action.category_id as SkincognitoCategoryId),
  );
}

function getCorrectCategoryValue(view: SkincognitoLobbyView | null, playerId: string | null | undefined, categoryId: SkincognitoCategoryId) {
  if (!view || !playerId) {
    return null;
  }

  return view.actions.find((action) => (
    action.player_id === playerId &&
    action.category_id === categoryId &&
    action.is_correct
  ))?.guess_value ?? null;
}

function getPlayerLabel(player: SkincognitoPublicPlayer | null) {
  if (!player) {
    return 'Player';
  }

  return `${player.display_name}${player.auth_user_id ? '' : ' (Guest)'}`;
}

function getSkincognitoInviteUrl(message: string) {
  const match = message.match(/Join my Skincognito game:\s*(https?:\/\/\S+)/i);
  if (!match?.[1]) {
    return null;
  }

  try {
    const url = new URL(match[1]);
    return url.pathname === '/skincognito' && url.searchParams.get('code') ? url.toString() : null;
  } catch {
    return null;
  }
}

function isScrolledToBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 12;
}

function getChatColorClassName(view: SkincognitoLobbyView, playerId?: string | null) {
  if (!playerId) {
    return 'text-amber-300';
  }

  if (playerId === view.lobby.player_one_id) {
    return 'text-sky-300';
  }

  if (playerId === view.lobby.player_two_id) {
    return 'text-red-300';
  }

  const spectatorIndex = view.players
    .filter((player) => player.role === 'spectator')
    .findIndex((player) => player.id === playerId);
  const spectatorColors = ['text-emerald-300', 'text-violet-300', 'text-amber-300', 'text-cyan-300', 'text-pink-300'];
  return spectatorColors[Math.max(0, spectatorIndex) % spectatorColors.length];
}

function getNextAvailableCategory(correctCategories: Set<SkincognitoCategoryId>) {
  return INPUT_CATEGORIES.find((category) => !correctCategories.has(category.id))?.id ?? 'skin';
}

function createChatGroups(
  messages: SkincognitoLobbyView['chatMessages'],
  view: SkincognitoLobbyView,
  requestingPlayerId?: string | null,
) {
  return messages.reduce<ChatGroup[]>((groups, chat) => {
    const actor = getPlayerById(view, chat.player_id);
    const spectatorTag = actor?.role === 'spectator' ? ' (spectator)' : '';
    const label = chat.message_type === 'system' ? 'System' : `${getPlayerLabel(actor)}${spectatorTag}`;
    const alignRight = Boolean(chat.player_id && chat.player_id === requestingPlayerId);
    const previousGroup = groups[groups.length - 1];

    if (previousGroup && previousGroup.playerId === chat.player_id && previousGroup.label === label) {
      previousGroup.messages.push(chat.message);
      return groups;
    }

    return [
      ...groups,
      {
        key: chat.id,
        playerId: chat.player_id,
        label,
        alignRight,
        colorClassName: getChatColorClassName(view, chat.player_id),
        messages: [chat.message],
      },
    ];
  }, []);
}

function isRoutineSystemMessage(message: string) {
  return (
    message.includes(' created the lobby.') ||
    message.includes(' joined the lobby.') ||
    message.includes(' selected a skin.') ||
    message.includes('The game started.') ||
    message.includes(' guessed ')
  );
}

function getLobbyStatusLabel(view: SkincognitoLobbyView | null) {
  if (!view) {
    return 'Create or join a lobby';
  }

  if (view.lobby.status === 'waiting') {
    return 'Lobby';
  }

  if (view.lobby.status === 'active') {
    return 'Game in progress';
  }

  if (view.lobby.status === 'finished') {
    return 'Game finished';
  }

  return 'Lobby closed';
}

function getHeaderActionLabel(view: SkincognitoLobbyView | null) {
  if (view?.lobby.status === 'active') {
    return 'In Progress';
  }

  if (view?.lobby.status === 'finished') {
    return 'Finished';
  }

  if (view?.lobby.status === 'waiting') {
    return `Lobby - ${view.players.length >= 10 ? 'Full' : 'Waiting for players'}`;
  }

  return 'Lobby';
}

function getFinishedTargetPlayer(view: SkincognitoLobbyView | null) {
  if (!view?.lobby.winner_player_id) {
    return null;
  }

  if (view.lobby.winner_player_id === view.lobby.player_one_id) {
    return getPlayerById(view, view.lobby.player_two_id);
  }

  if (view.lobby.winner_player_id === view.lobby.player_two_id) {
    return getPlayerById(view, view.lobby.player_one_id);
  }

  return null;
}

export function Skincognito() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('Player');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyView, setLobbyView] = useState<SkincognitoLobbyView | null>(null);
  const [answers, setAnswers] = useState<SkincognitoAnswers>(EMPTY_ANSWERS);
  const [skinQuery, setSkinQuery] = useState('');
  const [selectedSkin, setSelectedSkin] = useState<SkinAnswer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SkincognitoCategoryId>('skin');
  const [guessQuery, setGuessQuery] = useState('');
  const [guessMenuOpen, setGuessMenuOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [returnToLobbyCountdown, setReturnToLobbyCountdown] = useState<number | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [publicLobbies, setPublicLobbies] = useState<SkincognitoPublicLobby[]>([]);
  const skinSearchRef = useRef<HTMLDivElement>(null);
  const guessSearchRef = useRef<HTMLDivElement>(null);
  const guessesScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const wasGuessesAtBottomRef = useRef(true);
  const wasChatAtBottomRef = useRef(true);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const nameDraftDirtyRef = useRef(false);
  const skinQueryDirtyRef = useRef(false);
  const hasRequestingPlayerRef = useRef(false);
  const latestLobbyRef = useRef<{ code: string; clientId: string; status: SkincognitoLobbyView['lobby']['status'] } | null>(null);

  const requestingPlayer = lobbyView?.requestingPlayer ?? null;
  const isHost = Boolean(requestingPlayer && lobbyView?.lobby.host_player_id === requestingPlayer.id);
  const canSelectSkin = Boolean(
    requestingPlayer &&
      requestingPlayer.role !== 'spectator' &&
      lobbyView?.lobby.status === 'waiting',
  );
  const activePlayers = lobbyView
    ? lobbyView.players.filter((player) => player.id === lobbyView.lobby.player_one_id || player.id === lobbyView.lobby.player_two_id)
    : [];
  const spectatorCount = lobbyView ? lobbyView.players.length - activePlayers.length : 0;
  const canStart = Boolean(isHost && lobbyView?.lobby.status === 'waiting' && activePlayers.length === 2 && activePlayers.every((player) => player.has_selected_skin));
  const playerOne = getPlayerById(lobbyView, lobbyView?.lobby.player_one_id);
  const playerTwo = getPlayerById(lobbyView, lobbyView?.lobby.player_two_id);
  const winnerPlayer = getPlayerById(lobbyView, lobbyView?.lobby.winner_player_id);
  const finishedTargetPlayer = getFinishedTargetPlayer(lobbyView);
  const finishedTargetSkin = finishedTargetPlayer?.selected_skin ?? null;
  const opponentPlayer = requestingPlayer?.id === playerOne?.id ? playerTwo : playerOne;
  const topPlayer = requestingPlayer?.role === 'spectator' ? playerOne : opponentPlayer;
  const bottomPlayer = requestingPlayer?.role === 'spectator' ? playerTwo : requestingPlayer;
  const topCorrectCategories = getCategoryCorrectSet(lobbyView, topPlayer?.id);
  const bottomCorrectCategories = getCategoryCorrectSet(lobbyView, bottomPlayer?.id);
  const isTurn = Boolean(requestingPlayer && lobbyView?.lobby.current_turn_player_id === requestingPlayer.id);
  const canSubmitAction = Boolean(lobbyView?.lobby.status === 'active' && requestingPlayer?.role !== 'spectator' && isTurn);
  const guessedValues = useMemo(() => new Set(
    (lobbyView?.actions ?? [])
      .filter((action) => action.player_id === requestingPlayer?.id && action.category_id === selectedCategory)
      .map((action) => normalizeAnswer(action.guess_value)),
  ), [lobbyView?.actions, requestingPlayer?.id, selectedCategory]);
  const ownCorrectCategories = useMemo(
    () => getCategoryCorrectSet(lobbyView, requestingPlayer?.id),
    [lobbyView, requestingPlayer?.id],
  );
  const availableInputCategories = useMemo(() => (
    INPUT_CATEGORIES.filter((category) => !ownCorrectCategories.has(category.id))
  ), [ownCorrectCategories]);
  const suggestions = useMemo(() => {
    const query = normalizeAnswer(skinQuery);
    if (query.length < 2 || selectedSkin?.label === skinQuery) {
      return [];
    }

    return answers.skin
      .filter((skin) => normalizeAnswer(skin.label).includes(query));
  }, [answers.skin, selectedSkin?.label, skinQuery]);

  const guessSuggestions = useMemo(() => {
    const query = normalizeAnswer(guessQuery);
    if (selectedCategory === 'skin' && query.length < 2) {
      return [];
    }

    if (selectedCategory === 'skin') {
      return answers.skin
        .filter((skin) => normalizeAnswer(skin.label).includes(query))
        .filter((skin) => !guessedValues.has(normalizeAnswer(skin.label)))
        .map((skin) => ({ id: skin.id, label: skin.label, imageUrl: skin.imageUrl }));
    }

    return answers[selectedCategory]
      .filter((value) => normalizeAnswer(value).includes(query))
      .filter((value) => !guessedValues.has(normalizeAnswer(value)))
      .map((value) => ({ id: value, label: value, imageUrl: null }));
  }, [answers, guessedValues, guessQuery, selectedCategory]);

  const recentActions = useMemo(() => (
    [...(lobbyView?.actions ?? [])].slice(-8)
  ), [lobbyView?.actions]);
  const visibleChatMessages = useMemo(() => (
    (lobbyView?.chatMessages ?? []).filter((chat) => chat.message_type !== 'system' || !isRoutineSystemMessage(chat.message))
  ), [lobbyView?.chatMessages]);
  const chatGroups = useMemo(() => (
    lobbyView ? createChatGroups(visibleChatMessages, lobbyView, requestingPlayer?.id) : []
  ), [lobbyView, requestingPlayer?.id, visibleChatMessages]);
  const exactGuessSuggestion = useMemo(() => {
    const query = normalizeAnswer(guessQuery);
    if (!query || guessedValues.has(query)) {
      return null;
    }

    if (selectedCategory === 'skin') {
      const skin = answers.skin.find((answer) => normalizeAnswer(answer.label) === query);
      return skin ? { id: skin.id, label: skin.label, imageUrl: skin.imageUrl } : null;
    }

    const value = answers[selectedCategory].find((answer) => normalizeAnswer(answer) === query);
    return value ? { id: value, label: value, imageUrl: null } : null;
  }, [answers, guessedValues, guessQuery, selectedCategory]);
  const canSubmitExactGuess = Boolean(canSubmitAction && exactGuessSuggestion);
  const finishedCorrectGuesses = lobbyView?.actions.filter((action) => action.is_correct).length ?? 0;
  const finishedWrongGuesses = lobbyView?.actions.filter((action) => !action.is_correct).length ?? 0;
  const isFinishedWinner = Boolean(requestingPlayer && winnerPlayer && requestingPlayer.id === winnerPlayer.id);
  const isFinishedLoser = Boolean(requestingPlayer && finishedTargetPlayer && requestingPlayer.id === finishedTargetPlayer.id);

  const selectedSkinPreview = selectedSkin ?? (
    requestingPlayer?.selected_skin
      ? {
          id: requestingPlayer.selected_skin.id,
          label: requestingPlayer.selected_skin.answer,
          imageUrl: requestingPlayer.selected_skin.imageUrl,
        }
      : null
  );

  const updateLobbyView = useCallback((view: SkincognitoLobbyView) => {
    hasRequestingPlayerRef.current = Boolean(view.requestingPlayer);
    setLobbyView(view);
    window.localStorage.setItem(LOBBY_STORAGE_KEY, view.lobby.code);

    if (view.requestingPlayer?.display_name && !nameDraftDirtyRef.current) {
      setDisplayName(view.requestingPlayer.display_name);
      savePlayerDisplayName(view.requestingPlayer.display_name);
    }

    if (view.requestingPlayer?.selected_skin) {
      const nextSelectedSkin = {
        id: view.requestingPlayer.selected_skin.id,
        label: view.requestingPlayer.selected_skin.answer,
        imageUrl: view.requestingPlayer.selected_skin.imageUrl,
      };
      setSelectedSkin(nextSelectedSkin);
      if (!skinQueryDirtyRef.current) {
        setSkinQuery(nextSelectedSkin.label);
      }
    } else if (view.requestingPlayer) {
      setSelectedSkin(null);
      if (view.requestingPlayer.role === 'spectator' || !skinQueryDirtyRef.current) {
        skinQueryDirtyRef.current = false;
        setSkinQuery('');
      }
    }
  }, []);

  const requestLobby = useCallback(async (url: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Skincognito request failed.');
      }

      if (data.lobby && !data.requestingPlayer && hasRequestingPlayerRef.current) {
        window.localStorage.removeItem(LOBBY_STORAGE_KEY);
        setLobbyView(null);
        setMessage('You are no longer in this lobby.');
        return null;
      }

      updateLobbyView(data);
      return data as SkincognitoLobbyView;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Skincognito request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [updateLobbyView]);

  const refreshLobbyView = useCallback(async (code: string, nextClientId: string) => {
    try {
      const response = await fetch(`/api/skincognito/lobbies/${code}?clientId=${nextClientId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to refresh Skincognito lobby.');
      }

      if (data.lobby && !data.requestingPlayer && hasRequestingPlayerRef.current) {
        window.localStorage.removeItem(LOBBY_STORAGE_KEY);
        setLobbyView(null);
        setMessage('You are no longer in this lobby.');
        return;
      }

      updateLobbyView(data);
    } catch (error) {
      console.error('Failed to refresh Skincognito lobby', error);
    }
  }, [updateLobbyView]);

  useEffect(() => {
    const nextClientId = getOrCreateClientId();
    setClientId(nextClientId);
    const fallbackName = nextClientId ? `Player ${nextClientId.slice(-4).toUpperCase()}` : 'Player';
    const storedName = loadPlayerDisplayName(fallbackName);
    setDisplayName(storedName);

    const supabase = getOptionalSupabaseClient();
    supabase?.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id ?? null;
      setAuthUserId(userId);
      if (!userId || !data.session) {
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', userId)
        .maybeSingle<{ username: string; display_name: string }>();
      const profileName = profile?.display_name || profile?.username;
      if (profileName) {
        setDisplayName(profileName);
      }

    });

    fetch('/api/skincognito/answers')
      .then((response) => response.json())
      .then((data: SkincognitoAnswers) => setAnswers({ ...EMPTY_ANSWERS, ...data, skin: data.skin ?? [] }))
      .catch((error) => {
        console.error('Failed to load Skincognito skin answers', error);
        setMessage('Unable to load skin search data.');
      });

    const reconnectCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '';
    if (nextClientId && reconnectCode) {
      setJoinCode(reconnectCode);
      fetch(`/api/skincognito/lobbies/${reconnectCode}?clientId=${nextClientId}`)
        .then((response) => response.json())
        .then(async (data) => {
          if (!data.error && data.requestingPlayer) {
            updateLobbyView(data);
            return;
          }

          if (!data.error && reconnectCode) {
            let joinAuthUserId: string | null = null;
            let joinDisplayName = storedName;
            const authData = await supabase?.auth.getSession();
            const session = authData?.data.session ?? null;
            if (session) {
              joinAuthUserId = session.user.id;
              const { data: profile } = await supabase!
                .from('profiles')
                .select('username, display_name')
                .eq('id', session.user.id)
                .maybeSingle<{ username: string; display_name: string }>();
              joinDisplayName = profile?.display_name || profile?.username || storedName;
              setAuthUserId(session.user.id);
              setDisplayName(joinDisplayName);
            }

            fetch('/api/skincognito/lobbies/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: reconnectCode,
                clientId: nextClientId,
                authUserId: joinAuthUserId,
                displayName: joinDisplayName,
                selectedSkinId: null,
              }),
            })
              .then((response) => response.json())
              .then((joinData) => {
                if (!joinData.error) {
                  updateLobbyView(joinData);
                }
              })
              .catch(() => undefined);
            return;
          }

          if (!data.error) {
            window.localStorage.removeItem(LOBBY_STORAGE_KEY);
          }
        })
        .catch(() => undefined);
    }
  }, [updateLobbyView]);

  useEffect(() => {
    const code = lobbyView?.lobby.code;
    const status = lobbyView?.lobby.status;
    latestLobbyRef.current = code && status && clientId
      ? { code, clientId, status }
      : null;
  }, [clientId, lobbyView?.lobby.code, lobbyView?.lobby.status]);

  useEffect(() => {
    const leaveWaitingLobbyOnPageExit = () => {
      const activeLobby = latestLobbyRef.current;
      if (!activeLobby) {
        return;
      }

      const endpoint = activeLobby.status === 'waiting' ? 'leave' : 'heartbeat';
      if (endpoint === 'leave') window.localStorage.removeItem(LOBBY_STORAGE_KEY);
      const body = JSON.stringify({ clientId: activeLobby.clientId, ...(endpoint === 'heartbeat' ? { connected: false } : {}) });
      const url = `/api/skincognito/lobbies/${activeLobby.code}/${endpoint}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }

      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    };

    window.addEventListener('pagehide', leaveWaitingLobbyOnPageExit);
    return () => window.removeEventListener('pagehide', leaveWaitingLobbyOnPageExit);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!skinSearchRef.current?.contains(event.target as Node)) {
        if (selectedSkin) {
          skinQueryDirtyRef.current = false;
          setSkinQuery(selectedSkin.label);
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selectedSkin]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!guessSearchRef.current?.contains(event.target as Node)) {
        setGuessMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!ownCorrectCategories.has(selectedCategory)) {
      return;
    }

    setSelectedCategory(getNextAvailableCategory(ownCorrectCategories));
    setGuessQuery('');
    setGuessMenuOpen(false);
  }, [ownCorrectCategories, selectedCategory]);

  useEffect(() => {
    const guessesElement = guessesScrollRef.current;
    if (!guessesElement || !wasGuessesAtBottomRef.current) {
      return;
    }

    guessesElement.scrollTop = guessesElement.scrollHeight;
  }, [recentActions.length]);

  useEffect(() => {
    const chatElement = chatScrollRef.current;
    if (!chatElement || !wasChatAtBottomRef.current) {
      return;
    }

    chatElement.scrollTop = chatElement.scrollHeight;
  }, [visibleChatMessages.length]);

  useEffect(() => {
    if (!lobbyView?.lobby.return_to_lobby_at || !clientId) {
      setReturnToLobbyCountdown(null);
      return undefined;
    }

    const code = lobbyView.lobby.code;
    const updateCountdown = () => {
      const secondsRemaining = Math.max(
        0,
        Math.ceil((new Date(lobbyView.lobby.return_to_lobby_at as string).getTime() - Date.now()) / 1000),
      );
      setReturnToLobbyCountdown(secondsRemaining);

      if (secondsRemaining === 0) {
        void refreshLobbyView(code, clientId);
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [clientId, lobbyView?.lobby.code, lobbyView?.lobby.return_to_lobby_at, refreshLobbyView]);

  useEffect(() => {
    if (!lobbyView?.lobby.id || !lobbyView.lobby.code || !clientId || lobbyView.lobby.status === 'terminated') {
      return undefined;
    }

    const code = lobbyView.lobby.code;
    const nextClientId = clientId;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      console.warn('Supabase realtime is not available because public Supabase environment variables are not loaded.');
      return undefined;
    }

    const channel = supabase
      .channel(`skincognito-lobby-events:${lobbyView.lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'skincognito_lobby_events',
          filter: `lobby_id=eq.${lobbyView.lobby.id}`,
        },
        () => {
          if (realtimeRefreshTimeoutRef.current) {
            window.clearTimeout(realtimeRefreshTimeoutRef.current);
          }

          realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
            realtimeRefreshTimeoutRef.current = null;
            void refreshLobbyView(code, nextClientId);
          }, 100);
        },
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [clientId, lobbyView?.lobby.code, lobbyView?.lobby.id, lobbyView?.lobby.status, refreshLobbyView]);

  const loadPublicLobbies = useCallback(async () => {
    try {
      const response = await fetch('/api/skincognito/lobbies/public');
      if (response.ok) setPublicLobbies(await response.json());
    } catch {
      // Code-based joining remains available if discovery is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    if (lobbyView) return undefined;
    void loadPublicLobbies();
    return undefined;
  }, [loadPublicLobbies, lobbyView]);

  useEffect(() => {
    if (!clientId || !lobbyView?.lobby.code) {
      return;
    }

    const code = lobbyView.lobby.code;
    const sendHeartbeat = () => {
      fetch(`/api/skincognito/lobbies/${code}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, connected: true }),
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 25000);
    return () => window.clearInterval(interval);
  }, [clientId, lobbyView?.lobby.code]);

  const createLobby = () => {
    if (!clientId) {
      return;
    }

    void requestLobby('/api/skincognito/lobbies', {
      clientId,
      authUserId,
      displayName,
      selectedSkinId: selectedSkin?.id ?? null,
    });
  };

  const joinLobbyByCode = (code: string) => {
    if (!clientId) {
      return;
    }

    void requestLobby('/api/skincognito/lobbies/join', {
      code: code.trim().toUpperCase(),
      clientId,
      authUserId,
      displayName,
      selectedSkinId: selectedSkin?.id ?? null,
    });
  };

  const joinLobby = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    joinLobbyByCode(joinCode);
  };

  const updateLobbyVisibility = () => {
    if (!clientId || !lobbyView || !isHost) return;
    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/visibility`, {
      clientId,
      isPublic: !lobbyView.lobby.is_public,
    });
  };

  const chooseSkin = (skin: SkinAnswer) => {
    if (!canSelectSkin) {
      return;
    }

    setSelectedSkin(skin);
    setSkinQuery(skin.label);
    skinQueryDirtyRef.current = false;

    if (clientId && lobbyView) {
      void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/skin`, {
        clientId,
        skinId: skin.id,
      });
    }
  };

  const startGame = () => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/start`, {
      clientId,
    });
  };

  const copyCode = () => {
    if (!lobbyView) {
      return;
    }

    const lobbyUrl = `${window.location.origin}/skincognito?code=${lobbyView.lobby.code}`;
    void navigator.clipboard.writeText(lobbyUrl);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1400);
  };

  const leaveLobby = async () => {
    if (!lobbyView) {
      router.push('/');
      return;
    }

    if (lobbyView.lobby.status !== 'waiting') {
      window.localStorage.removeItem(LOBBY_STORAGE_KEY);
      setLobbyView(null);
      setSelectedSkin(null);
      setSkinQuery('');
      setGuessQuery('');
      setMessage('');
      window.history.replaceState(null, '', '/skincognito');
      return;
    }

    if (clientId) {
      await requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/leave`, { clientId });
    }

    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
    router.push('/');
  };

  const kickPlayer = (targetPlayerId: string) => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/kick`, {
      clientId,
      targetPlayerId,
    });
  };

  const promoteSpectator = (targetPlayerId: string) => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/promote`, {
      clientId,
      targetPlayerId,
    });
  };

  const makeHost = (targetPlayerId: string) => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/make-host`, {
      clientId,
      targetPlayerId,
    });
  };

  const updateDisplayName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId || !lobbyView) {
      return;
    }

    nameDraftDirtyRef.current = false;
    savePlayerDisplayName(displayName);
    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/name`, {
      clientId,
      displayName,
    }).then((view) => {
      if (view) {
        nameDraftDirtyRef.current = false;
      }
    });
  };

  const submitGuessValue = useCallback((guessValue: string, categoryId = selectedCategory) => {
    if (!clientId || !lobbyView || !canSubmitAction || !guessValue.trim()) {
      return;
    }

    const code = lobbyView.lobby.code;
    setGuessMenuOpen(false);
    void requestLobby(`/api/skincognito/lobbies/${code}/actions`, {
      clientId,
      actionType: categoryId === 'skin' ? 'skin_guess' : 'category_guess',
      categoryId,
      guessValue: guessValue.trim(),
    }).then((view) => {
      if (view) {
        setGuessQuery('');
      }

      if (categoryId === 'skin') {
        window.setTimeout(() => {
          void refreshLobbyView(code, clientId);
        }, 150);
      }
    });
  }, [canSubmitAction, clientId, lobbyView, refreshLobbyView, requestLobby, selectedCategory]);

  const chooseGuess = (label: string) => {
    setGuessQuery(label);
    submitGuessValue(label);
  };

  const submitGuess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!exactGuessSuggestion) {
      return;
    }

    submitGuessValue(exactGuessSuggestion.label);
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = chatDraft.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    if (!clientId || !lobbyView || !cleanMessage) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/chat`, {
      clientId,
      message: cleanMessage,
    }).then((view) => {
      if (view) {
        setChatDraft('');
      }
    });
  };

  const scheduleReturnToLobby = () => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/return`, {
      clientId,
    });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-6 py-6 lg:px-12">
        <header className="relative z-30 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={leaveLobby}
              aria-label="Back to game hub"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
              <h1 className="text-xl font-semibold text-white">Skincognito</h1>
              <p className="mt-1 text-xs text-slate-400">{getLobbyStatusLabel(lobbyView)}</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
            <Users size={16} className="text-amber-300" />
            {getHeaderActionLabel(lobbyView)}
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
          {!lobbyView ? (
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Create or Join</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Set up a Skincognito lobby</h2>
            </div>
          ) : null}

          {!lobbyView ? (
            <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
              <button
                type="button"
                onClick={createLobby}
                disabled={busy || !clientId}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create Lobby
              </button>

              <div className="hidden pb-3 text-sm font-semibold text-slate-500 lg:block">OR</div>

              <form onSubmit={joinLobby} className="grid gap-2">
                <label htmlFor="join-code" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Join code
                </label>
                <div className="flex gap-2">
                  <input
                    id="join-code"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="ABC123"
                    className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm uppercase tracking-[0.16em] text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                  />
                  <button
                    type="submit"
                    disabled={busy || joinCode.trim().length < 6}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          ) : lobbyView.lobby.status === 'waiting' ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:flex-row">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Lobby code</span>
              <span className="font-mono text-lg font-semibold tracking-[0.24em] text-white">
                {codeRevealed ? lobbyView.lobby.code : '******'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCodeRevealed((revealed) => !revealed)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                  aria-label={codeRevealed ? 'Hide lobby code' : 'Reveal lobby code'}
                >
                  {codeRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                  aria-label="Copy lobby link"
                >
                  {codeCopied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          ) : null}

          {!lobbyView ? (
            <div className="mx-auto mt-8 max-w-3xl border-t border-white/10 pt-6 text-left">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Public Lobbies</p><p className="mt-1 text-sm text-slate-400">Join a waiting game without a code.</p></div>
                <button type="button" onClick={() => void loadPublicLobbies()} disabled={busy} title="Refresh public lobbies" aria-label="Refresh public lobbies" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-60">
                  <RefreshCw size={17} />
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {publicLobbies.length ? publicLobbies.map((lobby) => (
                  <button key={lobby.code} type="button" onClick={() => joinLobbyByCode(lobby.code)} disabled={busy} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-amber-300/40 hover:bg-slate-950 disabled:opacity-60">
                    <span className="truncate text-sm font-semibold text-white">{lobby.hostName}&apos;s lobby</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-300">{lobby.playerCount}/{lobby.maxPlayers}</span>
                  </button>
                )) : <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-500">No public lobbies are waiting.</p>}
              </div>
            </div>
          ) : null}

          {message ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-300">
              {message}
            </p>
          ) : null}

          {lobbyView && lobbyView.lobby.status === 'waiting' ? (
            <div className="mt-8 border-t border-white/10 pt-8">
              <button type="button" disabled={!isHost || busy} onClick={updateLobbyVisibility} className={`mb-5 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${lobbyView.lobby.is_public ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-950/70'} disabled:opacity-60`}>
                <span><span className="block text-sm font-semibold text-white">Public lobby</span><span className="mt-1 block text-xs text-slate-400">Allow players to discover and join this lobby.</span></span>
                <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${lobbyView.lobby.is_public ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white transition ${lobbyView.lobby.is_public ? 'translate-x-5' : ''}`} /></span>
              </button>
              <form onSubmit={updateDisplayName} className="mb-5 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-2">
                  <label htmlFor="display-name" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value.slice(0, 16));
                      nameDraftDirtyRef.current = true;
                    }}
                    maxLength={16}
                    className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                  />
                  {displayName.length >= 16 ? (
                    <span className="text-xs font-semibold text-amber-200">16/16</span>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={busy || displayName.trim().length === 0}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 px-5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Update
                </button>
              </form>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
                <MultiplayerLobbyRoster
                  countLabel={`${activePlayers.length}/2 Players - ${spectatorCount}/8 Spectators`}
                  canManage={isHost && lobbyView.lobby.status === 'waiting'}
                  players={lobbyView.players.map((player) => ({
                    id: player.id,
                    authUserId: player.auth_user_id,
                    displayName: player.display_name,
                    role: player.role,
                    isCurrentUser: player.is_requesting_player,
                    isHost: player.id === lobbyView.lobby.host_player_id,
                    canPromote: player.role === 'spectator',
                    status: (
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                          player.has_selected_skin
                            ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                            : 'border-white/10 bg-slate-950 text-slate-500'
                        }`}
                        aria-label={player.has_selected_skin ? 'Skin selected' : 'No skin selected'}
                      >
                        <Check size={15} />
                      </span>
                    ),
                  }))}
                  onKick={kickPlayer}
                  onPromote={promoteSpectator}
                  onMakeHost={makeHost}
                />

                <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your skin</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {requestingPlayer?.role === 'spectator' ? 'Spectating' : 'Choose your skin'}
                    </h3>
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-[14rem_1fr]">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                      {selectedSkinPreview ? (
                        <Image
                          src={selectedSkinPreview.imageUrl}
                          alt={selectedSkinPreview.label}
                          width={360}
                          height={213}
                          className="aspect-[1215/717] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[1215/717] items-center justify-center text-sm text-slate-500">
                          {requestingPlayer?.role === 'spectator' ? 'Spectators do not select skins' : 'No skin selected'}
                        </div>
                      )}
                      <div className="border-t border-white/10 px-3 py-3">
                        <p className="line-clamp-2 text-sm font-semibold text-white">
                          {selectedSkinPreview?.label ?? 'Select a skin'}
                        </p>
                      </div>
                    </div>

                    <div ref={skinSearchRef} className="relative">
                      <label htmlFor="skin-search" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Search skins
                      </label>
                      <div className="relative mt-2">
                        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                          id="skin-search"
                          value={skinQuery}
                          onChange={(event) => {
                            skinQueryDirtyRef.current = true;
                            setSkinQuery(event.target.value);
                            setSelectedSkin(null);
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="Type a skin name"
                          disabled={!canSelectSkin}
                          className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>

                      {suggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-40 mt-2 grid max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50">
                          {suggestions.map((skin) => (
                            <button
                              key={skin.id}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => chooseSkin(skin)}
                              className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                            >
                              <Image
                                src={skin.imageUrl}
                                alt=""
                                width={72}
                                height={42}
                                className="aspect-[1215/717] w-16 shrink-0 object-cover ring-1 ring-white/10"
                              />
                              <span className="min-w-0 truncate">{skin.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {requestingPlayer?.role === 'spectator'
                          ? 'Spectators can watch the lobby but do not need a hidden skin.'
                          : 'Your selected skin is only visible to you until the game ends.'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={startGame}
                  disabled={busy || !canStart}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-8 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={16} />
                  Start Game
                </button>
              </div>

              {!canStart && lobbyView.lobby.status === 'waiting' ? (
                <p className="mt-3 text-center text-xs text-slate-500">
                  The host can start once two active players have selected skins.
                </p>
              ) : null}
            </div>
          ) : null}

          {lobbyView && lobbyView.lobby.status !== 'waiting' ? (
            <div className="mt-4">
              <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-300">
                      {lobbyView.lobby.status === 'finished' ? 'Game finished' : 'Current turn'}
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-white">
                      {lobbyView.lobby.status === 'finished'
                        ? `${getPlayerLabel(getPlayerById(lobbyView, lobbyView.lobby.winner_player_id))} found the skin`
                        : `${getPlayerLabel(getPlayerById(lobbyView, lobbyView.lobby.current_turn_player_id))}'s turn`}
                    </h2>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                    canSubmitAction
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 bg-slate-900 text-slate-400'
                  }`}>
                    {requestingPlayer?.role === 'spectator' ? 'Spectating' : canSubmitAction ? 'Your turn' : 'Waiting'}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {CATEGORY_DEFINITIONS.map((category) => {
                    const isCorrect = topCorrectCategories.has(category.id);
                    const correctValue = getCorrectCategoryValue(lobbyView, topPlayer?.id, category.id);
                    return (
                      <div
                        key={category.id}
                        className={`min-h-16 rounded-2xl border p-2 text-center transition ${
                          isCorrect
                            ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 bg-slate-900 text-slate-400'
                        }`}
                      >
                        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{category.label}</p>
                        <p className="mt-2 text-sm font-semibold">{isCorrect ? correctValue : 'Unknown'}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {`${getPlayerLabel(topPlayer)}'s correct category guesses`}
                </p>
              </section>

              <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="flex h-72 flex-col rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent guesses</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400">
                      {recentActions.length}
                    </span>
                  </div>

                  <div
                    ref={guessesScrollRef}
                    onScroll={(event) => {
                      wasGuessesAtBottomRef.current = isScrolledToBottom(event.currentTarget);
                    }}
                    className="mt-3 grid flex-1 content-start gap-2 overflow-y-auto pr-3"
                  >
                    {recentActions.map((action) => {
                      const actor = getPlayerById(lobbyView, action.player_id);
                      const categoryLabel = INPUT_CATEGORIES.find((category) => category.id === action.category_id)?.label ?? 'Guess';
                      return (
                        <div
                          key={action.id}
                          className={`rounded-2xl border p-3 ${
                            action.is_correct
                              ? 'border-emerald-400/30 bg-emerald-500/10'
                              : 'border-red-400/25 bg-red-500/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">{getPlayerLabel(actor)}</p>
                              <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                                {categoryLabel} - <span className="normal-case tracking-normal text-slate-200">{action.guess_value}</span>
                                {action.category_id === 'releaseYear' && action.result_hint ? (
                                  <span className="ml-2 text-amber-200">{action.result_hint === 'higher' ? '\u2191' : '\u2193'}</span>
                                ) : null}
                              </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              action.is_correct ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'
                            }`}>
                              {action.is_correct ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="flex h-72 flex-col rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chat</p>
                  </div>

                  <div
                    ref={chatScrollRef}
                    onScroll={(event) => {
                      wasChatAtBottomRef.current = isScrolledToBottom(event.currentTarget);
                    }}
                    className="mt-3 grid flex-1 content-start gap-3 overflow-y-auto pr-5"
                  >
                    {chatGroups.map((group) => {
                      return (
                        <div
                          key={group.key}
                          className={`max-w-[78%] ${group.alignRight ? 'ml-auto mr-3 text-right' : 'mr-auto text-left'}`}
                        >
                          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${group.colorClassName}`}>
                            {group.label}
                          </p>
                          <div className="mt-1 grid gap-1 text-sm text-slate-200">
                            {group.messages.map((chatMessage, index) => {
                              const inviteUrl = getSkincognitoInviteUrl(chatMessage);
                              return inviteUrl ? (
                                <div key={`${group.key}-${index}`} className={`flex flex-wrap items-center gap-2 ${group.alignRight ? 'justify-end' : 'justify-start'}`}>
                                  <span>Skincognito invite</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      window.location.href = inviteUrl;
                                    }}
                                    className="inline-flex min-h-8 items-center justify-center rounded-xl bg-amber-300 px-3 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
                                  >
                                    Join Game
                                  </button>
                                </div>
                              ) : (
                                <p key={`${group.key}-${index}`}>{chatMessage}</p>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={submitChat} className="mt-3 flex gap-2">
                    <input
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      maxLength={CHAT_MESSAGE_MAX_LENGTH}
                      autoComplete="off"
                      placeholder={`Send a message (${chatDraft.length}/${CHAT_MESSAGE_MAX_LENGTH})`}
                      className="min-h-10 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                    />
                    <button
                      type="submit"
                      disabled={busy || !chatDraft.trim()}
                      className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-slate-800 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  </form>
                </section>
              </div>

              <section className="mt-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {CATEGORY_DEFINITIONS.map((category) => {
                    const isCorrect = bottomCorrectCategories.has(category.id);
                    const correctValue = getCorrectCategoryValue(lobbyView, bottomPlayer?.id, category.id);
                    return (
                      <div
                        key={category.id}
                        className={`min-h-16 rounded-2xl border p-2 text-center transition ${
                          isCorrect
                            ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 bg-slate-900 text-slate-400'
                        }`}
                      >
                        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{category.label}</p>
                        <p className="mt-2 text-sm font-semibold">{isCorrect ? correctValue : 'Unknown'}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {`${getPlayerLabel(bottomPlayer)}'s correct category guesses`}
                </p>
              </section>

              {lobbyView.lobby.status === 'finished' ? (
                <section className={`relative isolate mt-4 rounded-2xl ${
                  isFinishedWinner
                    ? 'skindle-gradient-border shadow-lg shadow-violet-950/30'
                    : isFinishedLoser
                      ? 'border border-red-400/60 bg-red-500/10 shadow-lg shadow-red-950/30'
                      : 'border border-amber-300/40 bg-amber-300/10 shadow-lg shadow-amber-950/20'
                }`}>
                  <div className={isFinishedWinner ? 'relative z-10 rounded-2xl bg-slate-950 p-4' : 'rounded-2xl p-4'}>
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                        {finishedTargetSkin ? (
                          <Image
                            src={finishedTargetSkin.imageUrl}
                            alt={finishedTargetSkin.answer}
                            width={729}
                            height={430}
                            className="aspect-[1215/717] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[1215/717] items-center justify-center text-sm text-slate-500">
                            Final skin unavailable
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Game Complete</p>
                            <h3 className="mt-2 text-3xl font-bold text-white">
                              {winnerPlayer ? `${winnerPlayer.display_name} won` : 'Game finished'}
                            </h3>
                            <p className="mt-3 text-lg font-semibold text-slate-100">
                              The skin was {finishedTargetSkin?.answer ?? 'unknown'}.
                            </p>
                          </div>

                          {isHost ? (
                            <button
                              type="button"
                              onClick={scheduleReturnToLobby}
                              disabled={busy || Boolean(lobbyView.lobby.return_to_lobby_at)}
                              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {lobbyView.lobby.return_to_lobby_at
                                ? `Returning in ${returnToLobbyCountdown ?? 5}s`
                                : 'Return to Lobby'}
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Turns</p>
                            <p className="mt-2 text-xl font-bold text-white">{lobbyView.actions.length}</p>
                          </div>
                          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Correct</p>
                            <p className="mt-2 text-xl font-bold text-white">{finishedCorrectGuesses}</p>
                          </div>
                          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-red-200">Wrong</p>
                            <p className="mt-2 text-xl font-bold text-white">{finishedWrongGuesses}</p>
                          </div>
                          <div className="rounded-2xl border border-violet-300/30 bg-violet-400/10 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-violet-200">Skin Uses</p>
                            <p className="mt-2 text-xl font-bold text-white">{lobbyView.finishedSkinUseCount ?? 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              ) : requestingPlayer?.role !== 'spectator' ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
                  {selectedSkinPreview ? (
                    <Image
                      src={selectedSkinPreview.imageUrl}
                      alt={selectedSkinPreview.label}
                      width={729}
                      height={430}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[1215/717] items-center justify-center text-sm text-slate-500">
                      Hidden skin unavailable
                    </div>
                  )}
                  <div className="border-t border-white/10 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your skin</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedSkinPreview?.label ?? 'Spectator view'}
                    </p>
                  </div>
                </section>

                <section className={`rounded-3xl border bg-slate-950/70 p-4 transition ${
                  canSubmitAction ? 'border-amber-400/70 shadow-[0_0_28px_rgba(251,191,36,0.18)]' : 'border-white/10'
                }`}>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Submit a guess</p>
                    <h3 className="mt-1 text-base font-semibold text-white">
                      {canSubmitAction ? 'Choose a category and answer' : 'Wait for your turn'}
                    </h3>
                  </div>

                  <form onSubmit={submitGuess} className="mt-4 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                      <select
                        value={selectedCategory}
                        onChange={(event) => {
                          setSelectedCategory(event.target.value as SkincognitoCategoryId);
                          setGuessQuery('');
                          setGuessMenuOpen(false);
                        }}
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                          backgroundPosition: 'right 1.15rem center',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '16px 16px',
                        }}
                        className="min-h-11 appearance-none rounded-2xl border border-white/10 bg-slate-950 px-4 pr-12 text-sm font-semibold text-white outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {availableInputCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                      </select>

                      <div ref={guessSearchRef} className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                          value={guessQuery}
                          onChange={(event) => {
                            setGuessQuery(event.target.value);
                            setGuessMenuOpen(true);
                          }}
                          onFocus={() => setGuessMenuOpen(true)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder={selectedCategory === 'skin' ? 'Guess a skin' : `Guess ${INPUT_CATEGORIES.find((category) => category.id === selectedCategory)?.label.toLowerCase()}`}
                          disabled={!canSubmitAction || availableInputCategories.length === 0}
                          className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        {guessMenuOpen && guessSuggestions.length > 0 && canSubmitAction ? (
                          <div className="absolute left-0 right-0 top-full z-40 mt-2 grid max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50">
                            {guessSuggestions.map((suggestion) => (
                              <button
                                key={`${selectedCategory}-${suggestion.id}`}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseGuess(suggestion.label)}
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                              >
                                {suggestion.imageUrl ? (
                                  <Image
                                    src={suggestion.imageUrl}
                                    alt=""
                                    width={72}
                                    height={42}
                                    className="aspect-[1215/717] w-16 shrink-0 object-cover ring-1 ring-white/10"
                                  />
                                ) : null}
                                <span className="min-w-0 truncate">{suggestion.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy || !canSubmitExactGuess || availableInputCategories.length === 0}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-6 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Search size={16} />
                      Submit Guess
                    </button>
                  </form>
                </section>
              </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
