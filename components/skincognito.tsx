'use client';

import { forwardRef, memo, type CSSProperties, FormEvent, type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Shuffle } from 'lucide-react';
import { GameSplashImage } from '@/components/game-asset-image';
import { useRouter } from 'next/navigation';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
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
  MultiplayerPublicLobbyButton,
  MultiplayerPublicLobbyEmpty,
  MultiplayerStartGameControl,
  MultiplayerVisibilityToggle,
} from '@/components/multiplayer-lobby-layout';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { useMultiplayerHeartbeat } from '@/components/use-multiplayer-heartbeat';
import { MultiplayerDisconnectStatus, ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { getOrCreateClientId, loadDetailedGameStats, recordSkincognitoStats, type DetailedGameStats } from '@/lib/game-storage';
import { addMultiplayerDisconnectListeners, disconnectMultiplayerSession, SKINCOGNITO_LOBBY_STORAGE_KEY } from '@/lib/multiplayer-client-session';
import { normalizeAnswer } from '@/lib/quiz';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { SkincognitoCategoryId, SkincognitoLobbyView, SkincognitoPublicLobby, SkincognitoPublicPlayer } from '@/lib/skincognito';
import { CHAT_COLOR_NAME_HEX, getChatBubbleStyle, getChatInviteButtonStyle, getChatNameStyle, normalizeChatBorder, normalizeChatColor } from '@/lib/chat-colors';
import { MultiplayerRecordDelta } from '@/components/multiplayer-record-delta';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { playUiSound } from '@/lib/ui-sounds';

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
  nameStyle: CSSProperties;
  avatarUrl: string | null;
  chatColor: string;
  chatBorder: string;
  messages: string[];
};

type SkincognitoChatMessage = SkincognitoLobbyView['chatMessages'][number];
type SkincognitoChatResponse = {
  kind: 'chat_message';
  chatMessage: SkincognitoChatMessage;
};

function isSkincognitoChatResponse(value: unknown): value is SkincognitoChatResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; chatMessage?: { id?: unknown; lobby_id?: unknown } };
  return candidate.kind === 'chat_message'
    && typeof candidate.chatMessage?.id === 'string'
    && typeof candidate.chatMessage.lobby_id === 'string';
}

type NormalizedAnswer<T> = {
  value: T;
  normalized: string;
};

const LOBBY_STORAGE_KEY = SKINCOGNITO_LOBBY_STORAGE_KEY;
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

let skincognitoAnswersRequest: Promise<SkincognitoAnswers> | null = null;
let skincognitoPublicLobbiesRequest: Promise<SkincognitoPublicLobby[]> | null = null;

function loadSkincognitoAnswers() {
  if (!skincognitoAnswersRequest) {
    skincognitoAnswersRequest = fetch('/api/skincognito/answers')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load Skincognito answers.');
        return response.json() as Promise<SkincognitoAnswers>;
      })
      .catch((error) => {
        skincognitoAnswersRequest = null;
        throw error;
      });
  }
  return skincognitoAnswersRequest;
}

function loadSkincognitoPublicLobbies() {
  if (skincognitoPublicLobbiesRequest) return skincognitoPublicLobbiesRequest;

  const request = fetch('/api/skincognito/lobbies/public').then((response) => {
    if (!response.ok) throw new Error('Unable to load public Skincognito lobbies.');
    return response.json() as Promise<SkincognitoPublicLobby[]>;
  });
  skincognitoPublicLobbiesRequest = request;
  const clearRequest = () => {
    if (skincognitoPublicLobbiesRequest === request) skincognitoPublicLobbiesRequest = null;
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

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

function getChatNameStyleForPlayer(view: SkincognitoLobbyView, playerId?: string | null) {
  if (!playerId) {
    return getChatNameStyle('amber');
  }

  const player = getPlayerById(view, playerId);
  if (player?.chat_color) {
    return getChatNameStyle(player.chat_color);
  }

  if (playerId === view.lobby.player_one_id) {
    return { color: '#7dd3fc' };
  }

  if (playerId === view.lobby.player_two_id) {
    return { color: '#fca5a5' };
  }

  const spectatorIndex = view.players
    .filter((player) => player.role === 'spectator')
    .findIndex((player) => player.id === playerId);
  const spectatorColors = ['#6ee7b7', '#c4b5fd', '#fcd34d', '#67e8f9', '#f9a8d4'];
  return { color: spectatorColors[Math.max(0, spectatorIndex) % spectatorColors.length] };
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

    const chatColor = normalizeChatColor(chat.chat_color);
    const chatBorder = normalizeChatBorder(chat.chat_border);

    if (
      previousGroup &&
      previousGroup.playerId === chat.player_id &&
      previousGroup.label === label &&
      previousGroup.chatColor === chatColor &&
      previousGroup.chatBorder === chatBorder
    ) {
      previousGroup.messages.push(chat.message);
      return groups;
    }

    groups.push({
      key: chat.id,
      playerId: chat.player_id,
      label,
      alignRight,
      nameStyle: getChatNameStyleForPlayer(view, chat.player_id),
      avatarUrl: actor?.avatar_url ?? null,
      chatColor,
      chatBorder,
      messages: [chat.message],
    });
    return groups;
  }, []);
}

const ChatMessageList = memo(forwardRef<HTMLDivElement, {
  groups: ChatGroup[];
  wasAtBottomRef: MutableRefObject<boolean>;
}>(function ChatMessageList({ groups, wasAtBottomRef }, ref) {
  return (
    <div
      ref={ref}
      onScroll={(event) => {
        wasAtBottomRef.current = isScrolledToBottom(event.currentTarget);
      }}
      className={`mt-3 grid flex-1 content-start gap-3 overflow-y-auto pr-5 ${THEMED_SCROLLBAR_CLASS}`}
    >
      {groups.map((group) => {
        const bubbleStyle = getChatBubbleStyle(group.chatColor, group.chatBorder);
        const inviteButtonStyle = getChatInviteButtonStyle(group.chatColor, group.alignRight);
        return (
          <div
            key={group.key}
            className={`min-w-0 max-w-[78%] ${group.alignRight ? 'ml-auto mr-3 text-right' : 'mr-auto text-left'}`}
          >
            <div className={`flex items-end gap-2 ${group.alignRight ? 'flex-row-reverse' : ''}`}>
              <span
                className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 bg-cover bg-center text-xs font-black text-amber-200"
                style={group.avatarUrl ? { backgroundImage: `url(${group.avatarUrl})` } : undefined}
              >
                {group.avatarUrl ? null : group.label.slice(0, 1).toUpperCase()}
              </span>
              <div className={`min-w-0 ${group.alignRight ? 'text-right' : 'text-left'}`}>
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={group.nameStyle}>
                  {group.label}
                </p>
                <div className={`grid gap-1 text-sm ${group.alignRight ? 'justify-items-end' : 'justify-items-start'}`}>
                  {group.messages.map((chatMessage, index) => {
                    const inviteUrl = getSkincognitoInviteUrl(chatMessage);
                    return inviteUrl ? (
                      <div
                        key={`${group.key}-${index}`}
                        className={`max-w-full break-words rounded-xl px-3 py-2 font-medium [overflow-wrap:anywhere] ${group.alignRight ? 'text-right' : 'text-left'}`}
                        style={bubbleStyle}
                      >
                        <div className={`flex flex-wrap items-center gap-2 ${group.alignRight ? 'justify-end' : 'justify-start'}`}>
                          <span>Skincognito invite</span>
                          <button
                            type="button"
                            disabled={group.alignRight}
                            onClick={() => {
                              if (group.alignRight) return;
                              window.location.href = inviteUrl;
                            }}
                            className={`inline-flex min-h-8 items-center justify-center rounded-xl px-3 text-xs font-bold transition ${
                              group.alignRight ? 'cursor-not-allowed' : ''
                            }`}
                            style={inviteButtonStyle}
                          >
                            {group.alignRight ? 'Sent' : 'Join Game'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        key={`${group.key}-${index}`}
                        className={`max-w-full break-words rounded-xl px-3 py-2 font-medium [overflow-wrap:anywhere] ${group.alignRight ? 'text-right' : 'text-left'}`}
                        style={bubbleStyle}
                      >
                        {chatMessage}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}));

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
    const activePlayers = view.players.filter((player) => (
      player.id === view.lobby.player_one_id ||
      player.id === view.lobby.player_two_id
    ));
    const readyToStart = activePlayers.length === 2 && activePlayers.every((player) => player.connected);
    return `Lobby - ${view.players.length >= 10 ? 'Full' : readyToStart ? 'Ready to start' : 'Waiting for players'}`;
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
  const [joinCode, setJoinCode] = useState('');
  const [lobbyView, setLobbyView] = useState<SkincognitoLobbyView | null>(null);
  const [answers, setAnswers] = useState<SkincognitoAnswers>(EMPTY_ANSWERS);
  const [skinQuery, setSkinQuery] = useState('');
  const [selectedSkin, setSelectedSkin] = useState<SkinAnswer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SkincognitoCategoryId>('skin');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [guessQuery, setGuessQuery] = useState('');
  const [guessMenuOpen, setGuessMenuOpen] = useState(false);
  const [startCountdownSeconds, setStartCountdownSeconds] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [publicLobbies, setPublicLobbies] = useState<SkincognitoPublicLobby[]>([]);
  const [lobbyDescription, setLobbyDescription] = useState('');
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const [detailedStats, setDetailedStats] = useState<DetailedGameStats>(() => loadDetailedGameStats());
  const skinSearchRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const guessSearchRef = useRef<HTMLDivElement>(null);
  const guessesScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const wasGuessesAtBottomRef = useRef(true);
  const wasChatAtBottomRef = useRef(true);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const lobbyRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lobbyRefreshVersionRef = useRef(0);
  const skinQueryDirtyRef = useRef(false);
  const hasRequestingPlayerRef = useRef(false);
  const statsRecordedRef = useRef<string | null>(null);
  const latestLobbyRef = useRef<{ code: string; clientId: string; status: SkincognitoLobbyView['lobby']['status'] } | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const seenActionIdsRef = useRef<Set<string>>(new Set());
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const seenActionLobbyIdRef = useRef<string | null>(null);
  const seenChatLobbyIdRef = useRef<string | null>(null);
  const previousLobbyRosterRef = useRef<{ hostId: string | null; roles: Map<string, string>; playerIds: Set<string> } | null>(null);
  const finishSoundLobbyIdRef = useRef<string | null>(null);
  const countdownSoundSecondRef = useRef<number | null>(null);
  const previousLobbyStatusRef = useRef<SkincognitoLobbyView['lobby']['status'] | null>(null);

  useMultiplayerAuthTransition(async () => {
    const activeLobby = latestLobbyRef.current;
    if (!activeLobby) return;

    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
    setLobbyView(null);
    setSelectedSkin(null);
    setSkinQuery('');
    setGuessQuery('');
    setMessage('');
    window.history.replaceState(null, '', '/skincognito');
    await fetch(`/api/skincognito/lobbies/${activeLobby.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: activeLobby.clientId, forfeit: true }),
    }).catch(() => undefined);
    router.push('/');
  });

  const requestingPlayer = lobbyView?.requestingPlayer ?? null;
  const isHost = Boolean(requestingPlayer && lobbyView?.lobby.host_player_id === requestingPlayer.id);
  const canSelectSkin = Boolean(
    requestingPlayer &&
      requestingPlayer.role !== 'spectator' &&
      lobbyView?.lobby.status === 'waiting',
  );
  const activePlayers = useMemo(() => lobbyView
    ? lobbyView.players.filter((player) => player.id === lobbyView.lobby.player_one_id || player.id === lobbyView.lobby.player_two_id)
    : [], [lobbyView]);
  const spectatorCount = lobbyView ? lobbyView.players.length - activePlayers.length : 0;
  const canStart = Boolean(isHost && lobbyView?.lobby.status === 'waiting' && activePlayers.length === 2 && activePlayers.every((player) => player.connected));
  const lobbyId = lobbyView?.lobby.id ?? null;
  const serverLobbyDescription = lobbyView?.lobby.lobby_description ?? '';
  const lobbyDescriptionDirty = lobbyDescription !== serverLobbyDescription;
  const playerOne = getPlayerById(lobbyView, lobbyView?.lobby.player_one_id);
  const playerTwo = getPlayerById(lobbyView, lobbyView?.lobby.player_two_id);
  const winnerPlayer = getPlayerById(lobbyView, lobbyView?.lobby.winner_player_id);
  const currentTurnPlayer = getPlayerById(lobbyView, lobbyView?.lobby.current_turn_player_id);
  const finishedTargetPlayer = getFinishedTargetPlayer(lobbyView);
  const finishedTargetSkin = finishedTargetPlayer?.selected_skin ?? null;
  const opponentPlayer = requestingPlayer?.id === playerOne?.id ? playerTwo : playerOne;
  const topPlayer = requestingPlayer?.role === 'spectator' ? playerOne : opponentPlayer;
  const bottomPlayer = requestingPlayer?.role === 'spectator' ? playerTwo : requestingPlayer;
  const topCorrectCategories = useMemo(
    () => getCategoryCorrectSet(lobbyView, topPlayer?.id),
    [lobbyView, topPlayer?.id],
  );
  const bottomCorrectCategories = useMemo(
    () => getCategoryCorrectSet(lobbyView, bottomPlayer?.id),
    [bottomPlayer?.id, lobbyView],
  );
  const isTurn = Boolean(requestingPlayer && lobbyView?.lobby.current_turn_player_id === requestingPlayer.id);
  const isStartCountdownPending = Boolean(
    lobbyView?.lobby.status === 'active' &&
      lobbyView.lobby.started_at &&
      new Date(lobbyView.lobby.started_at).getTime() > Date.now(),
  );
  const displayedStartCountdownSeconds = startCountdownSeconds ?? (
    isStartCountdownPending && lobbyView?.lobby.started_at
      ? Math.max(1, Math.ceil((new Date(lobbyView.lobby.started_at).getTime() - Date.now()) / 1000))
      : null
  );
  const canSubmitAction = Boolean(lobbyView?.lobby.status === 'active' && !isStartCountdownPending && !startCountdownSeconds && requestingPlayer?.role !== 'spectator' && isTurn);
  const lobbyProfileSubscriptionKey = useMemo(() => (
    (lobbyView?.players ?? [])
      .map((player) => player.auth_user_id)
      .filter(Boolean)
      .sort()
      .join('|')
  ), [lobbyView?.players]);
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
  const selectedCategoryLabel = INPUT_CATEGORIES.find((category) => category.id === selectedCategory)?.label ?? 'Skin';
  const normalizedSkinAnswers = useMemo<NormalizedAnswer<SkinAnswer>[]>(
    () => answers.skin.map((skin) => ({ value: skin, normalized: normalizeAnswer(skin.label) })),
    [answers.skin],
  );
  const normalizedCategoryAnswers = useMemo(() => ({
    champion: answers.champion.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    skinLine: answers.skinLine.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    releaseYear: answers.releaseYear.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    rarity: answers.rarity.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    gender: answers.gender.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    role: answers.role.map((value) => ({ value, normalized: normalizeAnswer(value) })),
    race: answers.race.map((value) => ({ value, normalized: normalizeAnswer(value) })),
  }), [answers]);
  const suggestions = useMemo(() => {
    const query = normalizeAnswer(skinQuery);
    if (query.length < 2 || selectedSkin?.label === skinQuery) {
      return [];
    }

    return normalizedSkinAnswers
      .filter((entry) => entry.normalized.includes(query))
      .map((entry) => entry.value);
  }, [normalizedSkinAnswers, selectedSkin?.label, skinQuery]);

  const guessSuggestions = useMemo(() => {
    const query = normalizeAnswer(guessQuery);
    if (selectedCategory === 'skin' && query.length < 2) {
      return [];
    }

    if (selectedCategory === 'skin') {
      return normalizedSkinAnswers
        .filter((entry) => entry.normalized.includes(query) && !guessedValues.has(entry.normalized))
        .map(({ value: skin }) => ({ id: skin.id, label: skin.label, imageUrl: skin.imageUrl }));
    }

    return normalizedCategoryAnswers[selectedCategory]
      .filter((entry) => entry.normalized.includes(query) && !guessedValues.has(entry.normalized))
      .map(({ value }) => ({ id: value, label: value, imageUrl: null }));
  }, [guessedValues, guessQuery, normalizedCategoryAnswers, normalizedSkinAnswers, selectedCategory]);

  const recentActions = useMemo(() => (
    (lobbyView?.actions ?? []).slice(-8)
  ), [lobbyView?.actions]);
  const visibleChatMessages = useMemo(() => (
    (lobbyView?.chatMessages ?? []).filter((chat) => chat.message_type !== 'system')
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
      const skin = normalizedSkinAnswers.find((entry) => entry.normalized === query)?.value;
      return skin ? { id: skin.id, label: skin.label, imageUrl: skin.imageUrl } : null;
    }

    const value = normalizedCategoryAnswers[selectedCategory].find((entry) => entry.normalized === query)?.value;
    return value ? { id: value, label: value, imageUrl: null } : null;
  }, [guessedValues, guessQuery, normalizedCategoryAnswers, normalizedSkinAnswers, selectedCategory]);
  const canSubmitExactGuess = Boolean(canSubmitAction && exactGuessSuggestion);
  const finishedPlayerStats = useMemo(() => [playerOne, playerTwo]
    .filter((player): player is SkincognitoPublicPlayer => Boolean(player))
    .map((player) => {
      const stats = { turns: 0, correct: 0, wrong: 0, skinGuesses: 0 };
      (lobbyView?.actions ?? []).forEach((action) => {
        if (action.player_id !== player.id) return;
        stats.turns += 1;
        if (action.is_correct) stats.correct += 1;
        else stats.wrong += 1;
        if (action.action_type === 'skin_guess') stats.skinGuesses += 1;
      });
      return { player, ...stats };
    }), [lobbyView?.actions, playerOne, playerTwo]);
  const isFinishedWinner = Boolean(requestingPlayer && winnerPlayer && requestingPlayer.id === winnerPlayer.id);
  const isFinishedLoser = Boolean(requestingPlayer && finishedTargetPlayer && requestingPlayer.id === finishedTargetPlayer.id);
  const skincognitoRecordResult = lobbyView?.lobby.status === 'finished' && requestingPlayer?.role !== 'spectator'
    ? isFinishedWinner ? 'win' as const : 'loss' as const
    : null;
  const skincognitoStats = detailedStats.skincognito;
  const skincognitoMatchRecorded = Boolean(lobbyView?.lobby.id && skincognitoStats.recordedMatchIds.includes(lobbyView.lobby.id));
  const displayedSkincognitoWins = Math.max(0, skincognitoStats.totalWins - (skincognitoMatchRecorded && skincognitoRecordResult === 'win' ? 1 : 0));
  const displayedSkincognitoLosses = Math.max(0, skincognitoStats.totalLosses - (skincognitoMatchRecorded && skincognitoRecordResult === 'loss' ? 1 : 0));

  useEffect(() => {
    if (!lobbyView || lobbyView.lobby.status !== 'finished' || !requestingPlayer || requestingPlayer.role === 'spectator') {
      return;
    }

    if (statsRecordedRef.current === lobbyView.lobby.id) {
      return;
    }

    statsRecordedRef.current = lobbyView.lobby.id;
    const playerActions = lobbyView.actions.filter((action) => action.player_id === requestingPlayer.id);
    const skinGuesses = playerActions.filter((action) => action.action_type === 'skin_guess');
    const won = lobbyView.lobby.winner_player_id === requestingPlayer.id;
    const updatedStats = recordSkincognitoStats({
      matchId: lobbyView.lobby.id,
      won,
      totalGuesses: playerActions.length,
      correctGuesses: playerActions.filter((action) => action.is_correct).length,
      turnsUntilVictory: won ? playerActions.length : null,
      mostRecentSkinGuess: skinGuesses[skinGuesses.length - 1]?.guess_value ?? null,
    });
    setDetailedStats(updatedStats);
  }, [lobbyView, requestingPlayer]);

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
    if (isLeavingLobbyRef.current) return;
    if (view.lobby.status === 'terminated') {
      hasRequestingPlayerRef.current = false;
      window.localStorage.removeItem(LOBBY_STORAGE_KEY);
      setLobbyView(null);
      setSelectedSkin(null);
      setSkinQuery('');
      setGuessQuery('');
      setMessage('');
      router.replace('/');
      return;
    }
    hasRequestingPlayerRef.current = Boolean(view.requestingPlayer);
    setLobbyView(view);
    setRejoinCandidate(null);
    if (view.lobby.status === 'waiting' || view.lobby.status === 'active') {
      window.localStorage.setItem(LOBBY_STORAGE_KEY, view.lobby.code);
    } else {
      window.localStorage.removeItem(LOBBY_STORAGE_KEY);
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
  }, [router]);

  useEffect(() => {
    if (lobbyId) {
      setLobbyDescription(serverLobbyDescription);
    }
  }, [lobbyId, serverLobbyDescription]);

  const requestLobby = useCallback(async (url: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setMessage('');

    try {
      const { data: authData } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? {
          'Content-Type': 'application/json',
          ...(authData.session ? { Authorization: `Bearer ${authData.session.access_token}` } : {}),
        } : undefined,
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

  const appendChatMessage = useCallback((chatMessage: SkincognitoChatMessage) => {
    setLobbyView((current) => {
      if (!current || current.lobby.id !== chatMessage.lobby_id) return current;
      if (current.chatMessages.some((message) => message.id === chatMessage.id)) return current;
      return { ...current, chatMessages: [...current.chatMessages, chatMessage] };
    });
  }, []);

  const refreshLobbyView = useCallback(async (code: string, nextClientId: string) => {
    if (isLeavingLobbyRef.current) return;
    lobbyRefreshVersionRef.current += 1;
    if (lobbyRefreshInFlightRef.current) {
      return lobbyRefreshInFlightRef.current;
    }

    const request = (async () => {
      let handledVersion = 0;
      while (handledVersion !== lobbyRefreshVersionRef.current && !isLeavingLobbyRef.current) {
        handledVersion = lobbyRefreshVersionRef.current;
        try {
          const response = await fetch(`/api/skincognito/lobbies/${code}?clientId=${encodeURIComponent(nextClientId)}`);
          const data = await response.json();

          if (!response.ok) {
            if (response.status === 404) {
              window.localStorage.removeItem(LOBBY_STORAGE_KEY);
              setLobbyView(null);
              router.replace('/');
              return;
            }
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
      }
    })();

    lobbyRefreshInFlightRef.current = request;
    void request.then(() => {
      if (lobbyRefreshInFlightRef.current === request) {
        lobbyRefreshInFlightRef.current = null;
      }
    });
    return request;
  }, [router, updateLobbyView]);

  useEffect(() => {
    const nextClientId = getOrCreateClientId();
    setClientId(nextClientId);
    const supabase = getOptionalSupabaseClient();

    loadSkincognitoAnswers()
      .then((data: SkincognitoAnswers) => setAnswers({ ...EMPTY_ANSWERS, ...data, skin: data.skin ?? [] }))
      .catch((error) => {
        console.error('Failed to load Skincognito skin answers', error);
        setMessage('Unable to load skin search data.');
      });

    const reconnectCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '';
    if (nextClientId && !reconnectCode) {
      const storedCode = window.localStorage.getItem(LOBBY_STORAGE_KEY);
      if (storedCode) {
        fetch(`/api/skincognito/lobbies/${storedCode}/rejoin?clientId=${encodeURIComponent(nextClientId)}`)
          .then((response) => response.json())
          .then((eligibility: ReconnectCandidate & { eligible: boolean }) => {
            if (eligibility.eligible) {
              setRejoinCandidate({ code: eligibility.code, expiresAt: eligibility.expiresAt });
            } else {
              window.localStorage.removeItem(LOBBY_STORAGE_KEY);
            }
          })
          .catch(() => window.localStorage.removeItem(LOBBY_STORAGE_KEY));
      }
    }
    if (nextClientId && reconnectCode) {
      setJoinCode(reconnectCode);
      fetch(`/api/skincognito/lobbies/${reconnectCode}?clientId=${nextClientId}`)
        .then((response) => response.json())
        .then(async (data) => {
          if (!data.error && data.requestingPlayer && (data.lobby.status !== 'active' || data.requestingPlayer.connected)) {
            updateLobbyView(data);
            return;
          }

          if (!data.error && reconnectCode && (!data.requestingPlayer || data.requestingPlayer.role !== 'spectator')) {
            const authData = await supabase?.auth.getSession();
            const session = authData?.data.session ?? null;

            fetch('/api/skincognito/lobbies/join', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({
                code: reconnectCode,
                clientId: nextClientId,
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

          if (!data.error && data.requestingPlayer?.role === 'spectator') {
            window.localStorage.removeItem(LOBBY_STORAGE_KEY);
            setMessage('Spectators cannot rejoin a game in progress.');
            window.history.replaceState(null, '', '/skincognito');
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
    if (!lobbyView || !clientId || lobbyView.lobby.status !== 'active') return undefined;
    const deadlines = activePlayers
      .filter((player) => !player.connected && player.disconnected_at)
      .map((player) => new Date(player.disconnected_at as string).getTime() + 60_000);
    if (deadlines.length === 0) return undefined;
    const delay = Math.max(0, Math.min(...deadlines) - Date.now() + 150);
    const timeout = window.setTimeout(() => void refreshLobbyView(lobbyView.lobby.code, clientId), delay);
    return () => window.clearTimeout(timeout);
  }, [activePlayers, clientId, lobbyView, refreshLobbyView]);

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

      disconnectMultiplayerSession({
        ...activeLobby,
        storageKey: LOBBY_STORAGE_KEY,
        baseUrl: '/api/skincognito/lobbies',
      });
    };

    return addMultiplayerDisconnectListeners(leaveWaitingLobbyOnPageExit);
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
      if (!categoryDropdownRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
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
    setCategoryMenuOpen(false);
    setGuessMenuOpen(false);
  }, [ownCorrectCategories, selectedCategory]);

  useEffect(() => {
    const previousStatus = previousLobbyStatusRef.current;
    const nextStatus = lobbyView?.lobby.status ?? null;
    previousLobbyStatusRef.current = nextStatus;

    if (nextStatus === 'active' && previousStatus !== 'active') {
      setSelectedCategory('skin');
      setCategoryMenuOpen(false);
      setGuessMenuOpen(false);
    }
  }, [lobbyView?.lobby.status]);

  useEffect(() => {
    if (lobbyView?.lobby.status !== 'active' || !lobbyView.lobby.started_at) {
      setStartCountdownSeconds(null);
      countdownSoundSecondRef.current = null;
      return undefined;
    }

    const startedAtMs = new Date(lobbyView.lobby.started_at).getTime();
    const updateCountdown = () => {
      const secondsRemaining = Math.max(0, Math.ceil((startedAtMs - Date.now()) / 1000));
      setStartCountdownSeconds(secondsRemaining > 0 ? secondsRemaining : null);
      if (secondsRemaining > 0 && countdownSoundSecondRef.current !== secondsRemaining) {
        countdownSoundSecondRef.current = secondsRemaining;
        playUiSound('timer-countdown');
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(interval);
  }, [lobbyView?.lobby.started_at, lobbyView?.lobby.status]);

  useEffect(() => {
    const actionIds = new Set((lobbyView?.actions ?? []).map((action) => action.id));
    const previousIds = seenActionIdsRef.current;
    const lobbyChanged = seenActionLobbyIdRef.current !== (lobbyView?.lobby.id ?? null);

    if (!lobbyChanged) {
      const newActions = (lobbyView?.actions ?? []).filter((action) => !previousIds.has(action.id));
      newActions.forEach((action) => {
        playUiSound(action.is_correct ? 'skindle-guess-correct' : 'skindle-guess-incorrect');
      });
    }

    seenActionLobbyIdRef.current = lobbyView?.lobby.id ?? null;
    seenActionIdsRef.current = actionIds;
  }, [lobbyView?.actions, lobbyView?.lobby.id]);

  useEffect(() => {
    const playerMessages = (lobbyView?.chatMessages ?? []).filter((chat) => chat.message_type === 'player');
    const messageIds = new Set(playerMessages.map((chat) => chat.id));
    const previousIds = seenChatIdsRef.current;
    const lobbyChanged = seenChatLobbyIdRef.current !== (lobbyView?.lobby.id ?? null);

    if (!lobbyChanged) {
      const newMessages = playerMessages.filter((chat) => !previousIds.has(chat.id));
      newMessages.forEach((chat) => {
        playUiSound(chat.player_id === requestingPlayer?.id ? 'message-sent' : 'message-incoming');
      });
    }

    seenChatLobbyIdRef.current = lobbyView?.lobby.id ?? null;
    seenChatIdsRef.current = messageIds;
  }, [lobbyView?.chatMessages, lobbyView?.lobby.id, requestingPlayer?.id]);

  useEffect(() => {
    if (!lobbyView || lobbyView.lobby.status !== 'waiting') {
      previousLobbyRosterRef.current = null;
      return;
    }

    const nextSnapshot = {
      hostId: lobbyView.lobby.host_player_id,
      roles: new Map(lobbyView.players.map((player) => [player.id, player.role])),
      playerIds: new Set(lobbyView.players.map((player) => player.id)),
    };
    const previousSnapshot = previousLobbyRosterRef.current;

    if (previousSnapshot) {
      const hostChanged = previousSnapshot.hostId !== nextSnapshot.hostId;
      const roleChanged = lobbyView.players.some((player) => previousSnapshot.roles.get(player.id) && previousSnapshot.roles.get(player.id) !== player.role);
      const playerRemoved = [...previousSnapshot.playerIds].some((playerId) => !nextSnapshot.playerIds.has(playerId));

      if (hostChanged || roleChanged || playerRemoved) {
        playUiSound('player-management');
      }
    }

    previousLobbyRosterRef.current = nextSnapshot;
  }, [lobbyView]);

  useEffect(() => {
    if (!lobbyView || lobbyView.lobby.status !== 'finished') {
      finishSoundLobbyIdRef.current = null;
      return;
    }

    if (finishSoundLobbyIdRef.current === lobbyView.lobby.id) {
      return;
    }

    finishSoundLobbyIdRef.current = lobbyView.lobby.id;
    if (requestingPlayer?.role === 'spectator' || lobbyView.lobby.winner_player_id === requestingPlayer?.id) {
      playUiSound('puzzle-complete');
    } else {
      playUiSound('timer-expired');
    }
  }, [lobbyView, requestingPlayer?.id, requestingPlayer?.role]);

  useEffect(() => {
    const guessesElement = guessesScrollRef.current;
    if (!guessesElement) {
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
    if (!lobbyView?.lobby.id || !lobbyView.lobby.code || !clientId || lobbyView.lobby.status === 'terminated') {
      return undefined;
    }

    const code = lobbyView.lobby.code;
    const nextClientId = clientId;
    const lobbyAuthUserIds = lobbyProfileSubscriptionKey ? lobbyProfileSubscriptionKey.split('|') : [];
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      console.warn('Supabase realtime is not available because public Supabase environment variables are not loaded.');
      return undefined;
    }

    const refreshFromRealtimeEvent = (payload: { new: unknown }) => {
      const event = payload.new as { event_type?: unknown; payload?: unknown };
      if (event.event_type === 'chat_message_posted' && isSkincognitoChatResponse(event.payload)) {
        appendChatMessage(event.payload.chatMessage);
        return;
      }
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
        realtimeRefreshTimeoutRef.current = null;
        void refreshLobbyView(code, nextClientId);
      }, 100);
    };

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
        refreshFromRealtimeEvent,
      );

    if (lobbyAuthUserIds.length > 0) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=in.(${lobbyAuthUserIds.join(',')})`,
        },
        refreshFromRealtimeEvent,
      );
    }

    channel.subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [appendChatMessage, clientId, lobbyProfileSubscriptionKey, lobbyView?.lobby.code, lobbyView?.lobby.id, lobbyView?.lobby.status, refreshLobbyView]);

  const loadPublicLobbies = useCallback(async () => {
    try {
      setPublicLobbies(await loadSkincognitoPublicLobbies());
    } catch {
      // Code-based joining remains available if discovery is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    if (lobbyView || isLeavingLobbyRef.current) return undefined;
    void loadPublicLobbies();
    return undefined;
  }, [loadPublicLobbies, lobbyView]);

  const sendHeartbeat = useCallback(async () => {
    if (!clientId || !lobbyView?.lobby.code) return;

    try {
      await fetch(`/api/skincognito/lobbies/${lobbyView.lobby.code}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, connected: true }),
      });
    } catch {
      // Realtime or the next heartbeat will retry transient failures.
    }
  }, [clientId, lobbyView?.lobby.code]);

  useMultiplayerHeartbeat({
    enabled: Boolean(clientId && lobbyView?.lobby.code),
    onHeartbeat: sendHeartbeat,
  });

  const createLobby = () => {
    if (!clientId) {
      return;
    }

    isLeavingLobbyRef.current = false;
    void requestLobby('/api/skincognito/lobbies', {
      clientId,
      selectedSkinId: selectedSkin?.id ?? null,
    });
  };

  const joinLobbyByCode = (code: string, requirePublic = false) => {
    if (!clientId) {
      return;
    }

    isLeavingLobbyRef.current = false;
    void requestLobby('/api/skincognito/lobbies/join', {
      code: code.trim().toUpperCase(),
      clientId,
      selectedSkinId: selectedSkin?.id ?? null,
      requirePublic,
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
      lobbyDescription: lobbyView.lobby.lobby_description,
    });
  };

  const saveLobbyDescription = () => {
    if (!clientId || !lobbyView || !isHost || lobbyDescription === (lobbyView.lobby.lobby_description ?? '')) return;
    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/visibility`, {
      clientId,
      isPublic: lobbyView.lobby.is_public,
      lobbyDescription,
    });
  };

  const chooseSkin = (skin: SkinAnswer, sound: 'autocomplete' | 'random' = 'autocomplete') => {
    if (!canSelectSkin) {
      return;
    }

    playUiSound(sound === 'random' ? 'random-select' : 'autocomplete-select');
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

  const chooseRandomSkin = () => {
    if (!canSelectSkin || answers.skin.length === 0) {
      return;
    }

    const randomSkin = answers.skin[Math.floor(Math.random() * answers.skin.length)];
    chooseSkin(randomSkin, 'random');
  };

  const startGame = () => {
    if (!clientId || !lobbyView) {
      return;
    }

    setSelectedCategory('skin');
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

    const wasWaiting = lobbyView.lobby.status === 'waiting';
    const code = lobbyView.lobby.code;
    isLeavingLobbyRef.current = true;
    latestLobbyRef.current = null;
    if (wasWaiting) window.localStorage.removeItem(LOBBY_STORAGE_KEY);
    setLobbyView(null);
    setSelectedSkin(null);
    setSkinQuery('');
    setGuessQuery('');
    setMessage('');
    setPublicLobbies((current) => current.filter((lobby) => lobby.code !== code));
    if (clientId) {
      await fetch(`/api/skincognito/lobbies/${code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      }).catch(() => undefined);
    }
    window.history.replaceState(null, '', '/skincognito');
    if (wasWaiting) {
      isLeavingLobbyRef.current = false;
      await loadPublicLobbies();
    } else {
      setRejoinCandidate({
        code,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      isLeavingLobbyRef.current = false;
      await loadPublicLobbies();
    }
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

  const makeSpectator = (targetPlayerId: string) => {
    if (!clientId || !lobbyView) {
      return;
    }

    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/spectator`, {
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
    playUiSound('autocomplete-select');
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

    setBusy(true);
    setMessage('');
    void (async () => {
      try {
        const { data: authData } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
        const response = await fetch(`/api/skincognito/lobbies/${lobbyView.lobby.code}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authData.session ? { Authorization: `Bearer ${authData.session.access_token}` } : {}),
          },
          body: JSON.stringify({ clientId, message: cleanMessage }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to send chat message.');
        if (!isSkincognitoChatResponse(data)) throw new Error('Invalid chat response.');
        appendChatMessage(data.chatMessage);
        setChatDraft('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to send chat message.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const scheduleReturnToLobby = () => {
    if (!clientId || !lobbyView) {
      return;
    }

    playUiSound('random-select');
    void requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/return`, {
      clientId,
    });
  };

  return (
    <MultiplayerLobbyShell>
      <MultiplayerLobbyHeader
        title="Skincognito"
        subtitle={getLobbyStatusLabel(lobbyView)}
        statusLabel={getHeaderActionLabel(lobbyView)}
        infoSteps={[
          'Choose a skin for your opponent to identify before the match starts.',
          'Take turns asking category questions and use the answers to narrow down the skin.',
          "Identify your opponent's selected skin before they identify yours.",
        ]}
        onBack={leaveLobby}
        backLabel="Back to game hub"
        actions={(
          <>
            {lobbyView?.lobby.status === 'finished' && isHost ? (
              <button
                type="button"
                onClick={scheduleReturnToLobby}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Return to Lobby
              </button>
            ) : null}
          </>
        )}
      />
      <MultiplayerLobbyCard>
          {!lobbyView ? (
            <MultiplayerCreateJoinPanel
              title="Set up a Skincognito lobby"
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
                  onExpire={() => {
                    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
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
                  details={lobby.description ? <span>{lobby.description}</span> : null}
                />
              )) : <MultiplayerPublicLobbyEmpty />}
            />
          ) : lobbyView.lobby.status === 'waiting' ? (
            <MultiplayerLobbyCodeStrip
              code={lobbyView.lobby.code}
              revealed={codeRevealed}
              copied={codeCopied}
              onToggleReveal={() => setCodeRevealed((revealed) => !revealed)}
              onCopy={copyCode}
            />
          ) : null}

          <MultiplayerLobbyMessage>{message}</MultiplayerLobbyMessage>

          {lobbyView && lobbyView.lobby.status === 'waiting' ? (
            <div className="mt-5 grid gap-5">
              <MultiplayerLobbyGrid>
                <MultiplayerLobbyRoster
                  countLabel={`${activePlayers.length}/2 Players - ${spectatorCount}/8 Spectators`}
                  canManage={isHost && lobbyView.lobby.status === 'waiting'}
                  players={lobbyView.players.map((player) => ({
                    id: player.id,
                    authUserId: player.auth_user_id,
                    displayName: player.display_name,
                    nameColor: CHAT_COLOR_NAME_HEX[player.chat_color],
                    avatarUrl: player.avatar_url,
                    role: player.role,
                    isCurrentUser: player.is_requesting_player,
                    isHost: player.id === lobbyView.lobby.host_player_id,
                    canPromote: player.role === 'spectator',
                    canDemote: player.role !== 'spectator',
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
                  onDemote={makeSpectator}
                  onMakeHost={makeHost}
                />

                <MultiplayerLobbyPanel
                  title="Your Skin"
                  headerAction={lobbyDescriptionDirty ? (
                    <button type="button" onClick={saveLobbyDescription} disabled={!isHost || busy} className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-300 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                      Apply Changes
                    </button>
                  ) : null}
                >
                  <MultiplayerVisibilityToggle
                    enabled={lobbyView.lobby.is_public}
                    disabled={!isHost || busy}
                    onToggle={updateLobbyVisibility}
                  />
                  <MultiplayerLobbyDescriptionInput
                    value={lobbyDescription}
                    disabled={!isHost || busy}
                    onChange={setLobbyDescription}
                  />
                  <h3 className="mt-5 text-lg font-semibold text-white">
                    {requestingPlayer?.role === 'spectator' ? 'Spectating' : 'Choose your skin'}
                  </h3>

                  <div className="mt-5 grid gap-5 md:grid-cols-[14rem_1fr]">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                      {selectedSkinPreview ? (
                        <GameSplashImage
                          src={selectedSkinPreview.imageUrl}
                          alt={selectedSkinPreview.label}
                          width={360}
                          height={213}
                          sizes="(min-width: 768px) 224px, 100vw"
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

                    <div ref={skinSearchRef}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label htmlFor="skin-search" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Search skins
                        </label>
                        <button
                          type="button"
                          disabled={!canSelectSkin || answers.skin.length === 0}
                          onClick={chooseRandomSkin}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Shuffle size={14} />
                          Random Skin
                        </button>
                      </div>
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

                        {suggestions.length > 0 ? (
                          <div className="absolute left-0 right-0 top-full z-40 mt-2 grid max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2">
                            {suggestions.map((skin) => (
                              <button
                                key={skin.id}
                                type="button"
                                onMouseEnter={() => playUiSound('autocomplete-hover')}
                                onFocus={() => playUiSound('autocomplete-hover')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseSkin(skin)}
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                              >
                                <GameSplashImage
                                  src={skin.imageUrl}
                                  alt=""
                                  width={72}
                                  height={42}
                                  sizes="64px"
                                  className="aspect-[1215/717] w-16 shrink-0 object-cover ring-1 ring-white/10"
                                />
                                <span className="min-w-0 truncate">{skin.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {requestingPlayer?.role === 'spectator'
                          ? 'Spectators can watch the lobby but do not need a hidden skin.'
                          : 'Your selected skin is only visible to you until the game ends.'}
                      </p>
                    </div>
                  </div>
                </MultiplayerLobbyPanel>
              </MultiplayerLobbyGrid>

              <MultiplayerStartGameControl
                disabled={busy || !canStart || lobbyDescriptionDirty}
                onStart={startGame}
                hint={lobbyDescriptionDirty ? 'Apply setting changes before starting.' : 'The host can start once two active players have joined. Missing skin selections use a random skin.'}
              />
            </div>
          ) : null}

          {lobbyView && lobbyView.lobby.status !== 'waiting' ? (
            <div className="mt-4">
              {displayedStartCountdownSeconds ? (
                <section className="mb-4 rounded-3xl border border-red-400/60 bg-red-500/10 p-5 text-center   animate-pulse">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">Starting in</p>
                  <p className="mt-2 text-4xl font-black text-red-100">{displayedStartCountdownSeconds}</p>
                </section>
              ) : null}

              <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-300">
                      {lobbyView.lobby.status === 'finished' ? 'Game finished' : 'Current turn'}
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-white">
                      {lobbyView.lobby.status === 'finished' ? (
                        <>
                          <span style={winnerPlayer ? getChatNameStyle(winnerPlayer.chat_color) : undefined}>{getPlayerLabel(winnerPlayer)}</span>
                          {' found the skin'}
                        </>
                      ) : (
                        <>
                          <span style={currentTurnPlayer ? getChatNameStyle(currentTurnPlayer.chat_color) : undefined}>{getPlayerLabel(currentTurnPlayer)}</span>
                          {"'s turn"}
                        </>
                      )}
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

                {activePlayers.some((player) => !player.connected && player.disconnected_at) ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {activePlayers.filter((player) => !player.connected && player.disconnected_at).map((player) => (
                      <MultiplayerDisconnectStatus
                        key={player.id}
                        playerName={player.display_name}
                        playerNameStyle={getChatNameStyle(player.chat_color)}
                        disconnectedAt={player.disconnected_at as string}
                        unavailable={lobbyView.lobby.status === 'finished'}
                      />
                    ))}
                  </div>
                ) : null}

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
                  <span style={topPlayer ? getChatNameStyle(topPlayer.chat_color) : undefined}>{getPlayerLabel(topPlayer)}</span>
                  {"'s correct guesses"}
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
                    className={`mt-3 grid flex-1 content-start gap-2 overflow-y-auto pr-3 ${THEMED_SCROLLBAR_CLASS}`}
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
                              <p className="text-sm font-semibold text-white" style={actor ? getChatNameStyle(actor.chat_color) : undefined}>{getPlayerLabel(actor)}</p>
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

                  <ChatMessageList
                    ref={chatScrollRef}
                    groups={chatGroups}
                    wasAtBottomRef={wasChatAtBottomRef}
                  />

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
                  <span style={bottomPlayer ? getChatNameStyle(bottomPlayer.chat_color) : undefined}>{getPlayerLabel(bottomPlayer)}</span>
                  {"'s correct guesses"}
                </p>
              </section>

              {lobbyView.lobby.status === 'finished' ? (
                <section className={`relative isolate mt-4 rounded-2xl ${
                  isFinishedWinner
                    ? 'skindle-gradient-border  '
                    : isFinishedLoser
                      ? 'border border-red-400/60 bg-red-500/10  '
                      : 'border border-amber-300/40 bg-amber-300/10  '
                }`}>
                  <div className={isFinishedWinner ? 'relative z-10 rounded-2xl bg-slate-950 p-4' : 'rounded-2xl p-4'}>
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                        {finishedTargetSkin ? (
                          <GameSplashImage
                            src={finishedTargetSkin.imageUrl}
                            alt={finishedTargetSkin.answer}
                            width={729}
                            height={430}
                            sizes="(min-width: 1024px) 480px, 100vw"
                            className="aspect-[1215/717] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[1215/717] items-center justify-center text-sm text-slate-500">
                            Final skin unavailable
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Game Complete</p>
                          <h3 className="text-2xl font-bold text-white sm:text-right">
                            {winnerPlayer ? (
                              <>
                                <span style={getChatNameStyle(winnerPlayer.chat_color)}>{winnerPlayer.display_name}</span>
                                {' won'}
                              </>
                            ) : 'Game finished'}
                          </h3>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-lg font-semibold text-slate-100">
                            The skin was {finishedTargetSkin?.answer ?? 'unknown'}.
                          </p>
                          {requestingPlayer?.role !== 'spectator' ? (
                            <MultiplayerRecordDelta
                              wins={displayedSkincognitoWins}
                              losses={displayedSkincognitoLosses}
                              result={skincognitoRecordResult}
                              className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 text-xs font-semibold text-slate-100 sm:justify-self-end"
                            />
                          ) : null}
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          {finishedPlayerStats.map((stats) => (
                            <div key={stats.player.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="truncate text-sm font-bold text-white" style={getChatNameStyle(stats.player.chat_color)}>{stats.player.display_name}</p>
                                <span className="rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {stats.player.id === lobbyView.lobby.winner_player_id ? 'Winner' : 'Player'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3">
                                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Turns</p>
                                  <p className="mt-2 text-xl font-bold text-white">{stats.turns}</p>
                                </div>
                                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-emerald-200">Correct</p>
                                  <p className="mt-2 text-xl font-bold text-white">{stats.correct}</p>
                                </div>
                                <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
                                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-red-200">Wrong</p>
                                  <p className="mt-2 text-xl font-bold text-white">{stats.wrong}</p>
                                </div>
                                <div className="rounded-xl border border-violet-300/30 bg-violet-400/10 p-3">
                                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-violet-200">Skin Guesses</p>
                                  <p className="mt-2 text-xl font-bold text-white">{stats.skinGuesses}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              ) : requestingPlayer?.role !== 'spectator' ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
                  {selectedSkinPreview ? (
                    <GameSplashImage
                      src={selectedSkinPreview.imageUrl}
                      alt={selectedSkinPreview.label}
                      width={729}
                      height={430}
                      sizes="(min-width: 1024px) 420px, 100vw"
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
                  canSubmitAction ? 'border-amber-400/70 ' : 'border-white/10'
                }`}>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Submit a guess</p>
                    <h3 className="mt-1 text-base font-semibold text-white">
                      {canSubmitAction ? 'Choose a category and answer' : 'Wait for your turn'}
                    </h3>
                  </div>

                  <form onSubmit={submitGuess} className="mt-4 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                      <div ref={categoryDropdownRef} className="relative">
                        <button
                          type="button"
                          disabled={!canSubmitAction || availableInputCategories.length === 0}
                          onClick={() => {
                            playUiSound('autocomplete-select');
                            setCategoryMenuOpen((open) => !open);
                            setGuessMenuOpen(false);
                          }}
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 text-left text-sm font-semibold text-white outline-none transition hover:bg-slate-900 focus:border-white/20 focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="truncate">{selectedCategoryLabel}</span>
                          <ChevronDown size={16} className="shrink-0 text-slate-500" />
                        </button>

                        {categoryMenuOpen && canSubmitAction && availableInputCategories.length > 0 ? (
                          <div className="absolute left-0 right-0 top-full z-40 mt-2 grid overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-1">
                            {availableInputCategories.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onMouseEnter={() => playUiSound('autocomplete-hover')}
                                onFocus={() => playUiSound('autocomplete-hover')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  playUiSound('autocomplete-select');
                                  setSelectedCategory(category.id);
                                  setCategoryMenuOpen(false);
                                  setGuessMenuOpen(true);
                                }}
                                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                                  category.id === selectedCategory ? 'bg-violet-500/20 text-violet-100' : 'text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                {category.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

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
                          <div className="absolute left-0 right-0 top-full z-40 mt-2 grid max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2">
                            {guessSuggestions.map((suggestion) => (
                              <button
                                key={`${selectedCategory}-${suggestion.id}`}
                                type="button"
                                onMouseEnter={() => playUiSound('autocomplete-hover')}
                                onFocus={() => playUiSound('autocomplete-hover')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseGuess(suggestion.label)}
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                              >
                                {suggestion.imageUrl ? (
                                  <GameSplashImage
                                    src={suggestion.imageUrl}
                                    alt=""
                                    width={72}
                                    height={42}
                                    sizes="64px"
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
      </MultiplayerLobbyCard>
    </MultiplayerLobbyShell>
  );
}