'use client';

import { FormEvent, PointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, LogOut, PencilLine, RefreshCw, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GameSettingsSection } from '@/components/game-settings-section';
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
  MultiplayerModifierToggle,
  MultiplayerPublicLobbyButton,
  MultiplayerPublicLobbyEmpty,
  MultiplayerStartGameControl,
  MultiplayerVisibilityToggle,
} from '@/components/multiplayer-lobby-layout';
import { MultiplayerDisconnectStatus, ReconnectButton, type ReconnectCandidate } from '@/components/multiplayer-reconnect';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { getOrCreateClientId } from '@/lib/game-storage';
import { addMultiplayerDisconnectListeners, disconnectMultiplayerSession } from '@/lib/multiplayer-client-session';
import { getReconnectDeadline, MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';
import { normalizeAnswer } from '@/lib/quiz';
import type { CarvingRevelationAction, CarvingRevelationLobbyView, CarvingRevelationModifier, CarvingRevelationPublicLobby, CarvingRevelationWinCondition } from '@/lib/carving-revelation';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';

const STORAGE_KEY = 'knowleague:v1:carving-revelation:lobby-code';
const API_BASE = '/api/carving-revelation/lobbies';
const FORFEIT_DISCONNECTED_AT = '1970-01-01T00:00:00.000Z';
const PHASE_TIME_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '60 seconds' },
  { value: null, label: 'None' },
];
const WIN_CONDITION_OPTIONS: Array<{ value: CarvingRevelationWinCondition; label: string; description: string }> = [
  { value: 'everyone_correct', label: 'Everyone guesses correct', description: 'The match continues until every remaining player guesses correctly or forfeits.' },
  { value: 'first_correct', label: 'First correct guess wins', description: 'The first correct guess immediately wins the match.' },
];
const CARVING_MODIFIERS: Array<{ id: CarvingRevelationModifier; name: string; description: string }> = [
  { id: 'greyscale', name: 'Greyscale', description: 'Skin splash art is greyscaled.' },
  { id: 'blurred', name: 'Blurred', description: 'Skin splash art is slightly blurred.' },
  { id: 'cropped', name: 'Cropped', description: 'Only a cropped section of the splash art is shown.' },
];
const STARTING_LINE_LENGTH_OPTIONS = [5, 8, 10, 15, 20];
const LINE_LENGTH_INCREMENT_OPTIONS = [1, 2, 3, 4, 5];

type DraftCarvingSettings = {
  phaseDurationSeconds: number | null;
  winCondition: CarvingRevelationWinCondition;
  modifiers: CarvingRevelationModifier[];
  startingLineLengthPercent: number;
  lineLengthIncrementPercent: number;
};

type Stroke = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type RevealPoint = {
  x: number;
  y: number;
};

type RevealShape = {
  points: RevealPoint[];
};

async function readLobbyResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Carving Revelation request failed.');
  }
  return data as CarvingRevelationLobbyView;
}

async function readPublicLobbiesResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load public lobbies.');
  }
  return data as CarvingRevelationPublicLobby[];
}

function getDrawPayload(action: CarvingRevelationAction): RevealShape | Stroke | null {
  if (action.action_type !== 'draw') return null;
  const { points, x1, y1, x2, y2 } = action.payload;
  if (Array.isArray(points)) {
    const normalizedPoints = points
      .map((point) => (
        typeof point === 'object' && point !== null && 'x' in point && 'y' in point
          ? { x: Number(point.x), y: Number(point.y) }
          : null
      ))
      .filter((point): point is RevealPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)));
    return normalizedPoints.length >= 3 ? { points: normalizedPoints } : null;
  }
  if (typeof x1 === 'number' && typeof y1 === 'number' && typeof x2 === 'number' && typeof y2 === 'number') {
    return { x1, y1, x2, y2 };
  }
  return null;
}

function getPlayerColor(playerId: string | null | undefined) {
  const palette = ['#f59e0b', '#22d3ee', '#a78bfa', '#fb7185', '#34d399', '#f472b6', '#60a5fa', '#facc15'];
  if (!playerId) return palette[0];
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

function getPathLength(points: RevealPoint[]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function appendCappedPoint(points: RevealPoint[], point: RevealPoint, lineLengthLimit: number) {
  const lastPoint = points[points.length - 1];
  if (!lastPoint) return { points: [point], locked: false };
  const currentLength = getPathLength(points);
  const remaining = lineLengthLimit - currentLength;
  if (remaining <= 0) return { points, locked: true };

  const segmentLength = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
  if (segmentLength <= 0.002) return { points, locked: false };
  if (segmentLength <= remaining) {
    return { points: [...points, point], locked: false };
  }

  const scale = remaining / segmentLength;
  return {
    points: [
      ...points,
      {
        x: lastPoint.x + (point.x - lastPoint.x) * scale,
        y: lastPoint.y + (point.y - lastPoint.y) * scale,
      },
    ],
    locked: true,
  };
}

function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createDraftSettings(view: CarvingRevelationLobbyView): DraftCarvingSettings {
  return {
    phaseDurationSeconds: view.lobby.phase_duration_seconds,
    winCondition: view.lobby.win_condition,
    modifiers: view.lobby.modifiers,
    startingLineLengthPercent: view.lobby.starting_line_length_percent,
    lineLengthIncrementPercent: view.lobby.line_length_increment_percent,
  };
}

function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  actions: CarvingRevelationAction[],
  draftPath: RevealPoint[],
  currentRound: number,
  phase: 'carve' | 'guess',
  playerColorById: Record<string, string>,
  draftColor: string,
) {
  const fadeStartByActionIdRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let animationFrame = 0;
    const fadeDurationMs = 750;

    const render = () => {
      if (disposed || !canvas.parentElement) return;
      let hasActiveFade = false;
      const bounds = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(320, Math.floor(bounds.width));
      const height = Math.floor(width * 0.5625);
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgb(2, 6, 23)';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'destination-out';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = Math.max(34, width * 0.048);

      const drawStroke = (stroke: Stroke) => {
        context.beginPath();
        context.moveTo(stroke.x1 * width, stroke.y1 * height);
        context.lineTo(stroke.x2 * width, stroke.y2 * height);
        context.stroke();
      };

      const drawPolygon = (points: RevealPoint[], mode: 'fill' | 'preview') => {
        if (points.length < 2) return;
        context.beginPath();
        context.moveTo(points[0].x * width, points[0].y * height);
        points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
        if (mode === 'fill') {
          context.closePath();
          context.fill();
          return;
        }
        context.stroke();
      };

      actions.forEach((action) => {
        const visible = action.round_number < currentRound || phase !== 'carve';
        if (!visible) return;
        const payload = getDrawPayload(action);
        if (!payload) return;
        const shouldFade = phase === 'guess' && action.round_number === currentRound;
        const fadeStart = shouldFade
          ? fadeStartByActionIdRef.current.get(action.id) ?? performance.now()
          : null;
        if (shouldFade && fadeStart && !fadeStartByActionIdRef.current.has(action.id)) {
          fadeStartByActionIdRef.current.set(action.id, fadeStart);
        }
        const alpha = fadeStart ? Math.min(1, (performance.now() - fadeStart) / fadeDurationMs) : 1;
        if (alpha < 1) hasActiveFade = true;
        context.save();
        context.globalAlpha = alpha;
        if ('points' in payload) {
          drawPolygon(payload.points, 'fill');
        } else {
          drawStroke(payload);
        }
        context.restore();
      });

      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = 'rgba(250, 204, 21, 0.42)';
      context.lineWidth = 2;
      context.strokeRect(1, 1, width - 2, height - 2);

      actions.forEach((action) => {
        const visible = action.round_number < currentRound || phase !== 'carve';
        if (!visible) return;
        const outlineRound = phase === 'guess' ? currentRound : currentRound - 1;
        if (action.round_number !== outlineRound) return;
        const payload = getDrawPayload(action);
        if (!payload || !('points' in payload)) return;
        const fadeStart = phase === 'guess' && action.round_number === currentRound
          ? fadeStartByActionIdRef.current.get(action.id)
          : null;
        const alpha = fadeStart ? Math.min(1, (performance.now() - fadeStart) / fadeDurationMs) : 1;
        if (alpha < 1) hasActiveFade = true;
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = alpha;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = 2.5;
        context.strokeStyle = action.player_id ? playerColorById[action.player_id] ?? getPlayerColor(action.player_id) : getPlayerColor(action.player_id);
        drawPolygon(payload.points, 'preview');
        context.restore();
      });

      if (draftPath.length >= 2) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = 3;
        context.strokeStyle = draftColor;
        drawPolygon(draftPath, 'preview');
        if (draftPath.length >= 3) {
          const firstPoint = draftPath[0];
          const lastPoint = draftPath[draftPath.length - 1];
          context.save();
          context.setLineDash([8, 8]);
          context.strokeStyle = 'rgba(226, 232, 240, 0.75)';
          context.beginPath();
          context.moveTo(lastPoint.x * width, lastPoint.y * height);
          context.lineTo(firstPoint.x * width, firstPoint.y * height);
          context.stroke();
          context.restore();
        }
      }

      if (hasActiveFade) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    render();
    window.addEventListener('resize', render);
    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', render);
    };
  }, [actions, canvasRef, currentRound, draftColor, draftPath, phase, playerColorById]);
}

export function CarvingRevelation() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestSessionRef = useRef<{ code: string; clientId: string; status: CarvingRevelationLobbyView['lobby']['status'] } | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const autoSubmittedCarveKeyRef = useRef<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [view, setView] = useState<CarvingRevelationLobbyView | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<CarvingRevelationPublicLobby[]>([]);
  const [lobbyDescription, setLobbyDescription] = useState('');
  const [rejoinCandidate, setRejoinCandidate] = useState<ReconnectCandidate | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [guess, setGuess] = useState('');
  const [skinAnswers, setSkinAnswers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPath, setDraftPath] = useState<RevealPoint[]>([]);
  const [confirmedCarvePath, setConfirmedCarvePath] = useState<RevealPoint[]>([]);
  const [draftLocked, setDraftLocked] = useState(false);
  const [phaseRemainingSeconds, setPhaseRemainingSeconds] = useState(0);
  const [matchElapsedSeconds, setMatchElapsedSeconds] = useState(0);
  const [draftSettings, setDraftSettings] = useState<DraftCarvingSettings | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const lobbyId = view?.lobby.id ?? null;
  const serverLobbyDescription = view?.lobby.lobby_description ?? '';
  const lobbyDescriptionDirty = lobbyDescription !== serverLobbyDescription;
  const isActivePlayer = Boolean(view?.requestingPlayer?.result === 'active' && view.requestingPlayer.connected);
  const hasWonCurrentMatch = Boolean(view?.requestingPlayer?.result === 'won');
  const hasForfeitedCurrentMatch = Boolean(view?.requestingPlayer?.result === 'eliminated');
  const shouldShowGuessForm = !hasWonCurrentMatch && !hasForfeitedCurrentMatch;
  const shouldShowWinnerImageBorder = Boolean(view?.lobby.status === 'active' && hasWonCurrentMatch);
  const canCarve = Boolean(view?.lobby.status === 'active' && view.lobby.phase === 'carve' && isActivePlayer);
  const canGuess = Boolean(view?.lobby.status === 'active' && view.lobby.phase === 'guess' && isActivePlayer);
  const winner = view?.players.find((player) => player.id === view.lobby.winner_player_id) ?? null;
  const winningPlayers = view?.players.filter((player) => player.result === 'won') ?? [];
  const nextRoundVotePlayers = view?.players.filter((player) => view.nextRoundVotes.includes(player.id)) ?? [];
  const hasVotedForNextRound = Boolean(view?.requestingPlayer && view.nextRoundVotes.includes(view.requestingPlayer.id));
  const lineLimitPercent = view ? Math.round((view.lineLengthLimit / view.maxLineLength) * 100) : 0;
  const visibleSettings = draftSettings ?? (view ? createDraftSettings(view) : null);
  const settingsPending = settingsDirty || lobbyDescriptionDirty;
  const selectedModifiers = useMemo(() => new Set(visibleSettings?.modifiers ?? []), [visibleSettings?.modifiers]);
  const activeModifiers = useMemo(() => new Set(view?.lobby.modifiers ?? []), [view?.lobby.modifiers]);
  const phaseTimeSummary = visibleSettings?.phaseDurationSeconds === null ? 'None' : `${visibleSettings?.phaseDurationSeconds ?? 30}s`;
  const winConditionSummary = WIN_CONDITION_OPTIONS.find((option) => option.value === visibleSettings?.winCondition)?.label ?? 'Everyone guess correct';
  const imageModifierClassName = [
    'absolute inset-0 bg-cover bg-center transition duration-300',
    activeModifiers.has('greyscale') ? 'grayscale' : '',
    activeModifiers.has('blurred') ? 'blur-sm' : '',
  ].filter(Boolean).join(' ');
  const imageModifierStyle = view?.skin?.imageUrl
    ? {
      backgroundImage: `url("${view.skin.imageUrl}")`,
      transform: activeModifiers.has('cropped') ? 'scale(1.65)' : undefined,
      transformOrigin: '50% 42%',
      transition: 'filter 240ms ease, transform 240ms ease',
    }
    : undefined;
  const guessActions = useMemo(
    () => view?.actions.filter((action) => action.action_type === 'guess').reverse() ?? [],
    [view?.actions],
  );
  const guessActionsByRound = useMemo(() => {
    const groups = new Map<number, CarvingRevelationAction[]>();
    guessActions.forEach((action) => {
      const roundActions = groups.get(action.round_number) ?? [];
      roundActions.push(action);
      groups.set(action.round_number, roundActions);
    });
    return [...groups.entries()].map(([roundNumber, actions]) => ({ roundNumber, actions }));
  }, [guessActions]);
  const submittedPlayerIds = useMemo(() => {
    if (!view || view.lobby.status !== 'active') return new Set<string>();
    const actionType = view.lobby.phase === 'carve' ? 'draw' : 'guess';
    return new Set(view.actions
      .filter((action) => (
        action.action_type === actionType &&
        action.round_number === view.lobby.round_number &&
        action.player_id
      ))
      .map((action) => action.player_id as string));
  }, [view]);
  const exactGuessSuggestion = useMemo(() => {
    const query = normalizeAnswer(guess);
    if (!query) return null;
    return skinAnswers.find((answer) => normalizeAnswer(answer) === query) ?? null;
  }, [guess, skinAnswers]);
  const playerColorById = useMemo(() => Object.fromEntries(
    view?.players.map((player) => [player.id, player.carve_color]) ?? [],
  ), [view?.players]);

  useEffect(() => {
    const query = normalizeAnswer(guess);
    if (!canGuess || query.length < 2 || (exactGuessSuggestion && normalizeAnswer(exactGuessSuggestion) === query)) {
      setSuggestions([]);
      return;
    }
    setSuggestions(skinAnswers
      .filter((answer) => normalizeAnswer(answer).includes(query))
      .slice(0, 12));
  }, [canGuess, exactGuessSuggestion, guess, skinAnswers]);

  const previewPath = draftPath.length > 0 ? draftPath : confirmedCarvePath;
  useCanvasRenderer(
    canvasRef,
    view?.actions ?? [],
    previewPath,
    view?.lobby.round_number ?? 1,
    view?.lobby.phase ?? 'carve',
    playerColorById,
    view?.requestingPlayer?.carve_color ?? '#facc15',
  );

  const applyView = useCallback((nextView: CarvingRevelationLobbyView) => {
    if (isLeavingLobbyRef.current) return;
    if (nextView.lobby.status === 'terminated') {
      window.localStorage.removeItem(STORAGE_KEY);
      setRejoinCandidate(null);
      setView(null);
      router.replace('/');
      return;
    }
    setRejoinCandidate(null);
    setView(nextView);
    if (nextView.lobby.status === 'waiting' || nextView.lobby.status === 'active') {
      window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [router]);

  const getAuthHeaders = useCallback(async () => {
    const { data } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
    const headers: HeadersInit = {};
    if (data.session) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    return headers;
  }, []);

  const loadPublicLobbies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/public`);
      setPublicLobbies(await readPublicLobbiesResponse(response));
    } catch {
      setPublicLobbies([]);
    }
  }, []);

  const refreshLobby = useCallback(async (code: string, activeClientId: string) => {
    const response = await fetch(`${API_BASE}/${code}?clientId=${encodeURIComponent(activeClientId)}`);
    const nextView = await readLobbyResponse(response);
    applyView(nextView);
    return nextView;
  }, [applyView]);

  const leaveCurrentLobby = useCallback(async (forfeit = false) => {
    const session = latestSessionRef.current;
    if (!session) return;
    isLeavingLobbyRef.current = true;
    latestSessionRef.current = null;
    if (forfeit || session.status === 'waiting') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    await fetch(`${API_BASE}/${session.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: session.clientId, forfeit }),
      keepalive: true,
    }).catch(() => undefined);
    setView(null);
    await loadPublicLobbies();
  }, [loadPublicLobbies]);

  useMultiplayerAuthTransition(() => leaveCurrentLobby(true));

  useEffect(() => {
    let cancelled = false;
    const nextClientId = getOrCreateClientId();
    if (!nextClientId) {
      setMessage('Browser storage is required for multiplayer lobbies.');
      return undefined;
    }
    setClientId(nextClientId);
    const storedCode = window.localStorage.getItem(STORAGE_KEY);

    const restoreStoredLobby = async () => {
      if (!storedCode) return;
      try {
        const response = await fetch(`${API_BASE}/${storedCode}/rejoin?clientId=${encodeURIComponent(nextClientId)}`);
        const eligibility = await response.json() as ReconnectCandidate & { eligible: boolean };
        if (cancelled) return;
        if (eligibility.eligible) {
          setRejoinCandidate({ code: eligibility.code, expiresAt: eligibility.expiresAt });
          return;
        }
        await refreshLobby(storedCode, nextClientId);
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    };

    void restoreStoredLobby();
    void loadPublicLobbies();
    return () => {
      cancelled = true;
    };
  }, [loadPublicLobbies, refreshLobby]);

  useEffect(() => {
    fetch('/api/skin-champion/quiz-answers')
      .then((response) => response.json())
      .then((answers: string[]) => setSkinAnswers(Array.isArray(answers) ? answers : []))
      .catch(() => setSkinAnswers([]));
  }, []);

  useEffect(() => {
    if (!view || settingsDirty) return;
    setDraftSettings(createDraftSettings(view));
  }, [
    settingsDirty,
    view,
    view?.lobby.line_length_increment_percent,
    view?.lobby.modifiers,
    view?.lobby.phase_duration_seconds,
    view?.lobby.starting_line_length_percent,
    view?.lobby.win_condition,
  ]);

  useEffect(() => {
    if (lobbyId) {
      setLobbyDescription(serverLobbyDescription);
    }
  }, [lobbyId, serverLobbyDescription]);

  useEffect(() => {
    setDraftPath([]);
    setConfirmedCarvePath([]);
    setIsDrawing(false);
    setDraftLocked(false);
  }, [view?.lobby.round_number, view?.lobby.phase]);

  useEffect(() => {
    latestSessionRef.current = view && clientId
      ? { code: view.lobby.code, clientId, status: view.lobby.status }
      : null;
  }, [clientId, view]);

  useEffect(() => {
    const disconnectCurrentSession = () => {
      if (isLeavingLobbyRef.current) return;
      const session = latestSessionRef.current;
      if (!session) return;
      disconnectMultiplayerSession({
        ...session,
        storageKey: STORAGE_KEY,
        baseUrl: API_BASE,
      });
    };

    return addMultiplayerDisconnectListeners(disconnectCurrentSession);
  }, []);

  useEffect(() => {
    if (!view || !clientId || view.lobby.status === 'terminated') return undefined;
    const heartbeat = async () => {
      try {
        const response = await fetch(`${API_BASE}/${view.lobby.code}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
        applyView(await readLobbyResponse(response));
      } catch (error) {
        if (error instanceof Error && (error.message.includes('cannot rejoin') || error.message.includes('Player not found'))) {
          window.localStorage.removeItem(STORAGE_KEY);
          setView(null);
          router.replace('/');
          return;
        }
        setMessage(error instanceof Error ? error.message : 'Unable to update lobby presence.');
      }
    };
    const interval = window.setInterval(() => void heartbeat(), MULTIPLAYER_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [applyView, clientId, router, view]);

  useEffect(() => {
    if (!view || !clientId || view.lobby.status !== 'active') return undefined;
    const deadlines = view.players
      .filter((player) => player.result === 'active' && !player.connected && player.disconnected_at)
      .map((player) => getReconnectDeadline(player.disconnected_at as string));
    if (deadlines.length === 0) return undefined;
    const delay = Math.max(0, Math.min(...deadlines) - Date.now() + 150);
    const timeout = window.setTimeout(() => void refreshLobby(view.lobby.code, clientId).catch(() => undefined), delay);
    return () => window.clearTimeout(timeout);
  }, [clientId, refreshLobby, view]);

  useEffect(() => {
    if (!view?.lobby.phase_deadline_at || view.lobby.status !== 'active') {
      setPhaseRemainingSeconds(0);
      return undefined;
    }
    let refreshed = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(view.lobby.phase_deadline_at as string).getTime() - Date.now()) / 1000));
      setPhaseRemainingSeconds(remaining);
      if (remaining === 0 && !refreshed && clientId) {
        refreshed = true;
        window.setTimeout(() => void refreshLobby(view.lobby.code, clientId).catch(() => undefined), 200);
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [clientId, refreshLobby, view]);

  useEffect(() => {
    if (!view?.lobby.started_at || (view.lobby.status !== 'active' && view.lobby.status !== 'finished')) {
      setMatchElapsedSeconds(0);
      return undefined;
    }
    const startedAtMs = new Date(view.lobby.started_at).getTime();
    const finishedAtMs = view.lobby.finished_at ? new Date(view.lobby.finished_at).getTime() : null;
    const update = () => {
      const endMs = finishedAtMs ?? Date.now();
      setMatchElapsedSeconds(Math.max(0, Math.floor((endMs - startedAtMs) / 1000)));
    };
    update();
    if (finishedAtMs) return undefined;
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [view?.lobby.finished_at, view?.lobby.started_at, view?.lobby.status]);

  useEffect(() => {
    if (!view || !clientId) return undefined;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`carving-revelation-lobby:${view.lobby.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'carving_revelation_lobby_events',
        filter: `lobby_id=eq.${view.lobby.id}`,
      }, () => {
        void refreshLobby(view.lobby.code, clientId).catch(() => undefined);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, refreshLobby, view]);

  const createLobby = async () => {
    if (!clientId) return;
    setBusy(true);
    isLeavingLobbyRef.current = false;
    setMessage('');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobbyByCode = useCallback(async (code: string, requirePublic = false) => {
    if (!clientId) return;
    setBusy(true);
    isLeavingLobbyRef.current = false;
    setMessage('');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ code, clientId, requirePublic }),
      });
      applyView(await readLobbyResponse(response));
      setJoinCode('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join lobby.');
    } finally {
      setBusy(false);
    }
  }, [applyView, clientId, getAuthHeaders]);

  useEffect(() => {
    if (!clientId || view) return;
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;
    window.history.replaceState(null, '', '/carving-revelation');
    void joinLobbyByCode(code);
  }, [clientId, joinLobbyByCode, view]);

  const joinLobby = async (event: FormEvent) => {
    event.preventDefault();
    await joinLobbyByCode(joinCode);
  };

  const updateDraftSettings = (updater: (current: DraftCarvingSettings) => DraftCarvingSettings) => {
    if (!view) return;
    setDraftSettings((current) => updater(current ?? createDraftSettings(view)));
    setSettingsDirty(true);
  };

  const updateSettings = async (settings: {
    isPublic?: boolean;
    phaseDurationSeconds?: number | null;
    winCondition?: CarvingRevelationWinCondition;
    modifiers?: CarvingRevelationModifier[];
    startingLineLengthPercent?: number;
    lineLengthIncrementPercent?: number;
    lobbyDescription?: string;
  }) => {
    if (!clientId || !view || !isHost) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          isPublic: settings.isPublic ?? view.lobby.is_public,
          phaseDurationSeconds: settings.phaseDurationSeconds !== undefined ? settings.phaseDurationSeconds : view.lobby.phase_duration_seconds,
          winCondition: settings.winCondition ?? view.lobby.win_condition,
          modifiers: settings.modifiers ?? view.lobby.modifiers,
          startingLineLengthPercent: settings.startingLineLengthPercent ?? view.lobby.starting_line_length_percent,
          lineLengthIncrementPercent: settings.lineLengthIncrementPercent ?? view.lobby.line_length_increment_percent,
          lobbyDescription: settings.lobbyDescription ?? view.lobby.lobby_description,
        }),
      });
      applyView(await readLobbyResponse(response));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby settings.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updatePublicStatus = async () => {
    await updateSettings({ isPublic: !view?.lobby.is_public });
  };

  const applySettings = async () => {
    if (!draftSettings) return;
    const applied = await updateSettings({
      phaseDurationSeconds: draftSettings.phaseDurationSeconds,
      winCondition: draftSettings.winCondition,
      modifiers: draftSettings.modifiers,
      startingLineLengthPercent: draftSettings.startingLineLengthPercent,
      lineLengthIncrementPercent: draftSettings.lineLengthIncrementPercent,
      lobbyDescription,
    });
    if (applied) setSettingsDirty(false);
  };

  const managePlayer = async (action: 'kick' | 'make-host', targetPlayerId: string) => {
    if (!clientId || !view || !isHost) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, targetPlayerId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby player.');
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!clientId || !view || !isHost) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  };

  const startNextRound = async () => {
    if (!clientId || !view || !isHost) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
      setConfirmedCarvePath([]);
      setDraftPath([]);
      setIsDrawing(false);
      setDraftLocked(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start the next round.');
    } finally {
      setBusy(false);
    }
  };

  const voteNextRound = async () => {
    if (!clientId || !view || view.lobby.status !== 'finished') return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/next-round-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to vote for the next round.');
    } finally {
      setBusy(false);
    }
  };

  const leaveGame = async () => {
    if (!view) return;
    if (!window.confirm('Leave this game permanently? You will not be able to reconnect to this match.')) return;
    await leaveCurrentLobby(true);
    router.push('/');
  };

  const handleBack = async () => {
    if (!view) {
      router.push('/');
      return;
    }
    if (view.lobby.status === 'active' || view.lobby.status === 'finished') {
      await leaveCurrentLobby(true);
      return;
    }
    router.push('/');
  };

  const giveUp = async () => {
    if (!clientId || !view) return;
    if (!window.confirm('Give up this match? You will stay connected but cannot keep playing this skin.')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/give-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to give up.');
    } finally {
      setBusy(false);
    }
  };

  const submitGuessValue = async (guessValue: string) => {
    if (!clientId || !view || !canGuess) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, guess: guessValue }),
      });
      applyView(await readLobbyResponse(response));
      setGuess('');
      setSuggestions([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit guess.');
    } finally {
      setBusy(false);
    }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    await submitGuessValue(guess);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setGuess(suggestion);
    setSuggestions([]);
    void submitGuessValue(suggestion);
  };

  const submitShape = useCallback(async (points: RevealPoint[]) => {
    if (!clientId || !view || !canCarve) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, points }),
      });
      applyView(await readLobbyResponse(response));
      setConfirmedCarvePath(points);
      setDraftPath([]);
      setIsDrawing(false);
      setDraftLocked(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reveal that area.');
    } finally {
      setBusy(false);
    }
  }, [applyView, canCarve, clientId, view]);

  useEffect(() => {
    if (!clientId || !view || !canCarve || busy || !view.lobby.phase_deadline_at) return;
    const msRemaining = new Date(view.lobby.phase_deadline_at).getTime() - Date.now();
    if (msRemaining > 1000) return;
    const points = draftPath.length >= 3 ? draftPath : confirmedCarvePath.length >= 3 ? confirmedCarvePath : [];
    if (points.length < 3) return;
    const key = `${view.lobby.id}:${view.lobby.round_number}:${view.requestingPlayer?.id ?? 'unknown'}`;
    if (autoSubmittedCarveKeyRef.current === key) return;
    autoSubmittedCarveKeyRef.current = key;
    void submitShape(points);
  }, [busy, canCarve, clientId, confirmedCarvePath, draftPath, phaseRemainingSeconds, submitShape, view]);

  const copyInvite = async () => {
    if (!view) return;
    await navigator.clipboard.writeText(`${window.location.origin}/carving-revelation?code=${view.lobby.code}`).catch(() => undefined);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1200);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canCarve || busy || view?.lobby.status !== 'active') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    setIsDrawing(true);
    setDraftLocked(false);
    setConfirmedCarvePath([]);
    setDraftPath([point]);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !view || draftLocked) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    setDraftPath((currentPath) => {
      const next = appendCappedPoint(currentPath, point, view.lineLengthLimit);
      if (next.locked) setDraftLocked(true);
      return next.points;
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDrawing(false);
  };

  const connectedPlayerCount = view?.players.filter((player) => player.connected).length ?? 0;
  const headerStatus = view?.lobby.status === 'waiting'
    ? `Lobby - ${view.players.length >= view.lobby.max_players ? 'Full' : connectedPlayerCount >= 2 ? 'Ready to start' : 'Waiting for players'}`
    : view?.lobby.status === 'active'
      ? view.lobby.phase === 'carve' ? 'Carving' : 'Guessing'
      : view?.lobby.status === 'finished'
        ? 'Finished'
        : 'Lobby';
  const rosterPlayers = view?.players.map((player) => ({
    id: player.id,
    authUserId: player.auth_user_id,
    displayName: player.display_name,
    avatarUrl: player.avatar_url,
    nameColor: player.carve_color,
    role: player.role,
    isCurrentUser: player.is_requesting_player,
    isHost: player.id === view.lobby.host_player_id,
    cardTone: player.result === 'won'
      ? view.lobby.status === 'active' ? 'victory' as const : 'success' as const
      : player.result === 'eliminated' || (!player.connected && player.disconnected_at === FORFEIT_DISCONNECTED_AT) ? 'danger' as const : 'default' as const,
    status: player.result === 'eliminated'
      ? <span className="text-xs font-black uppercase tracking-[0.12em] text-red-300">Forfeit</span>
      : player.result === 'won'
        ? <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Winner</span>
        : !player.connected && player.disconnected_at
          ? (
            <span className="text-xs font-black uppercase tracking-[0.12em] text-red-300">
              {player.disconnected_at === FORFEIT_DISCONNECTED_AT ? 'Forfeit' : 'Disconnected'}
            </span>
          )
          : view.lobby.status === 'waiting'
        ? player.id === view.lobby.host_player_id ? <Check size={16} className="text-emerald-300" /> : null
            : view.lobby.status === 'active' && submittedPlayerIds.has(player.id)
              ? <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Submitted</span>
              : null,
  })) ?? [];
  const disconnectedActivePlayers = view?.lobby.status === 'active'
    ? view.players.filter((player) => (
      player.result === 'active' &&
      !player.connected &&
      player.disconnected_at &&
      player.disconnected_at !== FORFEIT_DISCONNECTED_AT
    ))
    : [];

  const header = (
    <MultiplayerLobbyHeader
      title="Carving Revelation"
      subtitle={view ? (view.lobby.status === 'waiting' ? 'Lobby' : '') : 'Create or join a lobby'}
      statusLabel={headerStatus}
      infoSteps={[
        'A secret skin is selected when the host starts the game.',
        'Players take turns carving one reveal line into the shared canvas or guessing the skin.',
        'The reveal line limit grows each round until someone finds the answer.',
      ]}
      onBack={handleBack}
      backLabel={view?.lobby.status === 'active' || view?.lobby.status === 'finished' ? 'Back to lobby' : 'Back to home'}
      actions={(
        <>
          {view?.lobby.status === 'finished' ? (
            <>
              <button
                type="button"
                onClick={voteNextRound}
                disabled={busy || hasVotedForNextRound}
                title={nextRoundVotePlayers.length > 0 ? nextRoundVotePlayers.map((player) => player.display_name).join(', ') : 'No votes yet'}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check size={16} /> {hasVotedForNextRound ? 'Voted' : 'Vote Next'} {view.nextRoundVotes.length}/{connectedPlayerCount}
              </button>
              {isHost ? (
                <button
                  type="button"
                  onClick={startNextRound}
                  disabled={busy || connectedPlayerCount < 2}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={16} /> Start Next Round
                </button>
              ) : null}
            </>
          ) : null}
          {view?.lobby.status === 'active' || view?.lobby.status === 'finished' ? (
          <>
            {view.lobby.status === 'active' ? (
              <button
                type="button"
                onClick={giveUp}
                disabled={busy || !isActivePlayer}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 text-sm font-black text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XCircle size={16} /> Give Up
              </button>
            ) : null}
            <button
              type="button"
              onClick={leaveGame}
              disabled={busy}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-black text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <LogOut size={16} /> Leave Game
              </button>
            </>
          ) : null}
        </>
      )}
    />
  );

  if (!view) {
    return (
      <MultiplayerLobbyShell>
        {header}
        <MultiplayerLobbyCard>
          <MultiplayerCreateJoinPanel
            title="Set up a Carving Revelation lobby"
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
                  window.localStorage.removeItem(STORAGE_KEY);
                  setRejoinCandidate(null);
                }}
              />
            ) : null}
            publicLobbyContent={publicLobbies.length ? publicLobbies.map((lobby) => (
              <MultiplayerPublicLobbyButton
                key={lobby.code}
                hostName={lobby.hostName}
                hostNameStyle={{ color: lobby.hostColor }}
                playerCount={lobby.playerCount}
                maxPlayers={lobby.maxPlayers}
                disabled={busy}
                onClick={() => joinLobbyByCode(lobby.code, true)}
                details={lobby.description ? <span className="basis-full text-slate-300">{lobby.description}</span> : null}
              />
            )) : <MultiplayerPublicLobbyEmpty />}
          />
          <MultiplayerLobbyMessage>{message}</MultiplayerLobbyMessage>
        </MultiplayerLobbyCard>
      </MultiplayerLobbyShell>
    );
  }

  if (view.lobby.status === 'waiting') {
    return (
      <MultiplayerLobbyShell>
        {header}
        <MultiplayerLobbyCard>
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
                canManage={isHost}
                players={rosterPlayers}
                onKick={(playerId) => managePlayer('kick', playerId)}
                onMakeHost={(playerId) => managePlayer('make-host', playerId)}
              />

              <MultiplayerLobbyPanel
                title="Game Settings"
                lockedHint={!isHost ? 'Only the host can change game settings.' : null}
              >
                <MultiplayerVisibilityToggle
                  enabled={view.lobby.is_public}
                  disabled={!isHost || busy}
                  onToggle={updatePublicStatus}
                />
                <MultiplayerLobbyDescriptionInput
                  value={lobbyDescription}
                  disabled={!isHost || busy}
                  onChange={setLobbyDescription}
                />
                <fieldset className="mt-5 grid gap-5">
                    <legend className="sr-only">Carving Revelation settings</legend>
                    <GameSettingsSection title="Settings" defaultOpen summary={`${phaseTimeSummary} - ${winConditionSummary}`}>
                      <div className="grid gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-bold text-white">Phase Time</span>
                          <select
                            value={visibleSettings?.phaseDurationSeconds ?? 'none'}
                            disabled={!isHost || busy}
                            onChange={(event) => updateDraftSettings((current) => ({ ...current, phaseDurationSeconds: event.target.value === 'none' ? null : Number(event.target.value) }))}
                            className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-65"
                          >
                            {PHASE_TIME_OPTIONS.map((option) => (
                              <option key={option.value ?? 'none'} value={option.value ?? 'none'}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm font-bold text-white">Win Condition</span>
                          <select
                            value={visibleSettings?.winCondition ?? 'everyone_correct'}
                            disabled={!isHost || busy}
                            onChange={(event) => updateDraftSettings((current) => ({ ...current, winCondition: event.target.value as CarvingRevelationWinCondition }))}
                            className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-65"
                          >
                            {WIN_CONDITION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold text-white">Starting Line Length</span>
                            <select
                              value={visibleSettings?.startingLineLengthPercent ?? 8}
                              disabled={!isHost || busy}
                              onChange={(event) => updateDraftSettings((current) => ({ ...current, startingLineLengthPercent: Number(event.target.value) }))}
                              className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-65"
                            >
                              {STARTING_LINE_LENGTH_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}%</option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-2">
                            <span className="text-sm font-bold text-white">Round Increment</span>
                            <select
                              value={visibleSettings?.lineLengthIncrementPercent ?? 2}
                              disabled={!isHost || busy}
                              onChange={(event) => updateDraftSettings((current) => ({ ...current, lineLengthIncrementPercent: Number(event.target.value) }))}
                              className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-65"
                            >
                              {LINE_LENGTH_INCREMENT_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}%</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    </GameSettingsSection>
                  <GameSettingsSection title="Modifiers" summary={`${visibleSettings?.modifiers.length ?? view.lobby.modifiers.length} active`}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CARVING_MODIFIERS.map((modifier) => {
                        const checked = selectedModifiers.has(modifier.id);
                        return (
                          <MultiplayerModifierToggle
                            key={modifier.id}
                            name={modifier.name}
                            description={modifier.description}
                            checked={checked}
                            disabled={!isHost || busy}
                            onToggle={() => {
                              const nextModifiers = checked
                                ? (visibleSettings?.modifiers ?? view.lobby.modifiers).filter((id) => id !== modifier.id)
                                : [...(visibleSettings?.modifiers ?? view.lobby.modifiers), modifier.id];
                              updateDraftSettings((current) => ({ ...current, modifiers: nextModifiers }));
                            }}
                          />
                        );
                      })}
                    </div>
                  </GameSettingsSection>
                  {settingsPending ? (
                    <div className="flex justify-end">
                      <button type="button" disabled={!isHost || busy} onClick={() => void applySettings()} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                        Apply Settings
                      </button>
                    </div>
                  ) : null}
                </fieldset>
              </MultiplayerLobbyPanel>
            </MultiplayerLobbyGrid>

            <MultiplayerStartGameControl
              disabled={!isHost || connectedPlayerCount < 2 || busy || settingsPending}
              onStart={startGame}
              hint={settingsPending ? 'Apply setting changes before starting.' : 'The host can start once at least two players have joined.'}
            />
          </div>
          <MultiplayerLobbyMessage>{message}</MultiplayerLobbyMessage>
        </MultiplayerLobbyCard>
      </MultiplayerLobbyShell>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">{header}</div>
        <div className="grid gap-6">
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(180px,240px)_minmax(280px,420px)] lg:items-stretch lg:justify-between">
              {view.lobby.status === 'active' ? (
                <div className={`flex min-h-24 flex-col justify-center rounded-2xl border px-6 py-4 shadow-lg ${
                  view.lobby.phase === 'carve'
                    ? 'border-amber-300/50 bg-amber-300/10 shadow-amber-950/40'
                    : 'border-violet-300/50 bg-violet-300/10 shadow-violet-950/40'
                }`}>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Round {view.lobby.round_number}</p>
                  <p className={`text-xs font-black uppercase tracking-[0.26em] ${
                    view.lobby.phase === 'carve' ? 'text-amber-200' : 'text-violet-200'
                  }`}>
                    {view.lobby.phase === 'carve' ? 'Carving Phase' : 'Guessing Phase'}
                  </p>
                  <p className="mt-1 font-mono text-5xl font-black leading-none text-white">
                    {view.lobby.phase_duration_seconds === null ? '--' : `0:${phaseRemainingSeconds.toString().padStart(2, '0')}`}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-24 flex-col justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-6 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Round {view.lobby.round_number}</p>
                  <h2 className="mt-1 text-xl font-black">
                    {winningPlayers.length > 1
                      ? `${winningPlayers.map((player) => player.display_name).join(', ')} found the skin`
                      : winner ? `${winner.display_name} found the skin` : 'Game complete'}
                  </h2>
                </div>
              )}
              <div className="flex min-h-24 flex-col justify-center rounded-2xl border border-white/10 bg-slate-950/80 px-6 py-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Match Time</p>
                <p className="mt-1 font-mono text-4xl font-black leading-none text-white">
                  {formatElapsedTime(matchElapsedSeconds)}
                </p>
              </div>
              <div className="flex min-h-24 flex-col justify-center rounded-2xl border border-[#8a6a14]/70 bg-slate-950/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em]">
                  <span className="text-[#d4af37]">Current {(view.lineLengthLimit * 100).toFixed(0)}%</span>
                  <span className="text-slate-400">Total {(view.maxLineLength * 100).toFixed(0)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-[#b8871f]" style={{ width: `${lineLimitPercent}%` }} />
                </div>
              </div>
            </div>

            {disconnectedActivePlayers.length > 0 ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {disconnectedActivePlayers.map((player) => (
                  <MultiplayerDisconnectStatus
                    key={player.id}
                    playerName={player.display_name}
                    playerNameStyle={{ color: player.carve_color }}
                    disconnectedAt={player.disconnected_at as string}
                  />
                ))}
              </div>
            ) : null}

            <div className={shouldShowWinnerImageBorder ? 'multiplayer-victory-border' : ''}>
              <div
                className="relative aspect-video overflow-hidden border-2 border-[#8a6a14] bg-slate-950 bg-cover bg-center"
              >
                {view.skin?.imageUrl ? <div className={imageModifierClassName} style={imageModifierStyle} /> : null}
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 block h-full w-full touch-none select-none ${canCarve ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerCancel={() => {
                    setIsDrawing(false);
                  }}
                />
              </div>
            </div>

            {canCarve ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <p className="text-sm font-semibold text-slate-300">
                  {draftPath.length >= 3
                    ? 'Submit your carve.'
                    : 'Carve an area on the canvas.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={draftPath.length === 0 || busy}
                    onClick={() => {
                      setDraftPath([]);
                      setConfirmedCarvePath([]);
                      setIsDrawing(false);
                      setDraftLocked(false);
                    }}
                    className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    disabled={draftPath.length < 3 || busy}
                    onClick={() => draftPath.length >= 3 ? void submitShape(draftPath) : undefined}
                    className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm Carve
                  </button>
                </div>
              </div>
            ) : null}

            {view.lobby.status === 'finished' && view.skin?.answer ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">The skin was</p>
                <p className="mt-1 text-2xl font-black">{view.skin.answer}</p>
                <p className="mt-3 text-sm font-semibold text-emerald-50/80">
                  Next round votes: {nextRoundVotePlayers.length > 0
                    ? nextRoundVotePlayers.map((player) => player.display_name).join(', ')
                    : 'None yet'}
                </p>
              </div>
            ) : null}

            {shouldShowGuessForm ? (
              <form id="carving-revelation-guess-form" onSubmit={submitGuess} className="relative mt-4 flex gap-3">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    onFocus={() => {
                      const query = normalizeAnswer(guess);
                      if (!canGuess || query.length < 2) return;
                      setSuggestions(skinAnswers.filter((answer) => normalizeAnswer(answer).includes(query)).slice(0, 12));
                    }}
                    disabled={!canGuess || busy}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-300/60 disabled:opacity-60"
                    placeholder={canGuess ? 'Type the skin name' : view.lobby.phase === 'carve' ? 'Carving phase in progress' : 'Waiting'}
                  />
                  {suggestions.length > 0 && canGuess ? (
                    <div className="absolute left-0 top-full z-50 mt-2 grid max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="submit" disabled={!canGuess || !guess.trim() || busy} className="inline-flex items-center gap-2 rounded-2xl bg-violet-400 px-5 py-3 font-black text-white transition hover:bg-violet-300 disabled:opacity-60">
                  <PencilLine size={18} /> Guess
                </button>
              </form>
            ) : null}
          </section>

          <div className="grid gap-5 lg:grid-cols-[3fr_1fr]">
            <MultiplayerLobbyRoster
              players={rosterPlayers}
              canManage={false}
              showHeader={false}
              compactColumns
            />

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Recent Guesses</p>
              </div>
              <div className={`${guessActions.length >= 8 ? `max-h-[32rem] overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}` : ''} space-y-4`}>
                {guessActionsByRound.length > 0 ? guessActionsByRound.map((group, groupIndex) => (
                  <div key={group.roundNumber} className={groupIndex > 0 ? 'border-t border-white/10 pt-4' : ''}>
                    <div className="mb-3 flex items-center gap-3">
                      <p className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-500">Round {group.roundNumber}</p>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="space-y-3">
                      {group.actions.map((action) => {
                        const player = view.players.find((candidate) => candidate.id === action.player_id);
                        const roundHasEnded = view.lobby.status === 'finished' || action.round_number < view.lobby.round_number;
                        const correctGuess = action.payload.correct === true;
                        return (
                          <div key={action.id} className={`rounded-2xl border p-3 ${correctGuess && roundHasEnded ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-white/10 bg-slate-950'}`}>
                            <p className="text-sm font-bold" style={player?.carve_color ? { color: player.carve_color } : undefined}>{player?.display_name ?? 'Player'}</p>
                            <p className="mt-1 text-sm text-slate-300">
                              {!roundHasEnded
                                ? 'Submitted a guess.'
                                : correctGuess
                                  ? 'Got it correct.'
                                  : String(action.payload.guess ?? '')}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )) : (
                  <p className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-400">No guesses yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
        {message ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{message}</p> : null}
      </div>
    </main>
  );
}
