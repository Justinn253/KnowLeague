'use client';

import { FormEvent, PointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut, PencilLine, RefreshCw, Sparkles, XCircle } from 'lucide-react';
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
import { useMultiplayerHeartbeat } from '@/components/use-multiplayer-heartbeat';
import { subscribeToRealtimeChannel } from '@/components/multiplayer-realtime';
import { getOrCreateClientId, recordAppWin } from '@/lib/game-storage';
import { addMultiplayerDisconnectListeners, disconnectMultiplayerSession } from '@/lib/multiplayer-client-session';
import { getReconnectDeadline } from '@/lib/multiplayer-lifecycle';
import { normalizeAnswer } from '@/lib/quiz';
import type { CarvingRevelationAction, CarvingRevelationLobbyView, CarvingRevelationModifier, CarvingRevelationPowerUpState, CarvingRevelationPublicLobby, CarvingRevelationRoutineActionResponse, CarvingRevelationWinCondition } from '@/lib/carving-revelation';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { playUiSound } from '@/lib/ui-sounds';
import { submitAchievementEvent, submitAchievementEvents } from '@/lib/achievement-client';
import {
  canActivateCarvingRevelationPowerUp,
  CARVING_REVELATION_POWER_UP_DEFINITIONS,
  getCarvingRevelationPowerUpDefinition,
  MAX_CARVING_REVELATION_POWER_UP_COUNT,
} from '@/lib/carving-revelation-power-ups';

const STORAGE_KEY = 'knowleague:v1:carving-revelation:lobby-code';
const API_BASE = '/api/carving-revelation/lobbies';
const FORFEIT_DISCONNECTED_AT = '1970-01-01T00:00:00.000Z';
let carvingSkinAnswersRequest: Promise<string[]> | null = null;
let carvingPublicLobbiesRequest: Promise<CarvingRevelationPublicLobby[]> | null = null;

function loadCarvingSkinAnswers() {
  if (!carvingSkinAnswersRequest) {
    carvingSkinAnswersRequest = fetch('/api/skin-champion/quiz-answers?answerMode=skin-line')
      .then((response) => response.ok ? response.json() as Promise<string[]> : Promise.reject(new Error('Unable to load skin lines.')))
      .catch((error) => {
        carvingSkinAnswersRequest = null;
        throw error;
      });
  }
  return carvingSkinAnswersRequest;
}

function loadCarvingPublicLobbies() {
  if (carvingPublicLobbiesRequest) return carvingPublicLobbiesRequest;
  const request = fetch(`${API_BASE}/public`).then(readPublicLobbiesResponse);
  carvingPublicLobbiesRequest = request;
  const clear = () => {
    if (carvingPublicLobbiesRequest === request) carvingPublicLobbiesRequest = null;
  };
  void request.then(clear, clear);
  return request;
}
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
  { id: 'greyscale', name: 'Greyscale', description: 'Splash art is greyscaled.' },
  { id: 'blurred', name: 'Blurred', description: 'Splash art is slightly blurred.' },
  { id: 'cropped', name: 'Cropped', description: 'Only a cropped section of the splash art is shown.' },
];
const STARTING_LINE_LENGTH_OPTIONS = [5, 8, 10, 15, 20];
const LINE_LENGTH_INCREMENT_OPTIONS = [1, 2, 3, 4, 5];
const POWER_UP_COUNT_OPTIONS = Array.from({ length: MAX_CARVING_REVELATION_POWER_UP_COUNT }, (_, index) => index + 1);

type DraftCarvingSettings = {
  phaseDurationSeconds: number | null;
  winCondition: CarvingRevelationWinCondition;
  modifiers: CarvingRevelationModifier[];
  powerUpsEnabled: boolean;
  powerUpCount: number;
  startingLineLengthPercent: number;
  lineLengthIncrementPercent: number;
};

type SettingOption<T extends string | number | null> = {
  value: T;
  label: string;
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
  outlineOnly?: boolean;
};

function getAspectDistance(first: RevealPoint, second: RevealPoint) {
  return Math.hypot((first.x - second.x) * 16, (first.y - second.y) * 9);
}

function getPointSegmentDistance(point: RevealPoint, start: RevealPoint, end: RevealPoint) {
  const segmentX = (end.x - start.x) * 16;
  const segmentY = (end.y - start.y) * 9;
  const pointX = (point.x - start.x) * 16;
  const pointY = (point.y - start.y) * 9;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return Math.hypot(pointX, pointY);
  const scale = Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / segmentLengthSquared));
  return Math.hypot(pointX - segmentX * scale, pointY - segmentY * scale);
}

function isPointInPolygon(point: RevealPoint, polygon: RevealPoint[]) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function shapeClaimsPowerUp(points: RevealPoint[], powerUp: CarvingRevelationPowerUpState) {
  if (points.length < 3) return false;
  const center = { x: powerUp.x, y: powerUp.y };
  if (isPointInPolygon(center, points)) return true;
  const radius = powerUp.radius * 16;
  return points.some((point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    return getAspectDistance(point, center) <= radius || getPointSegmentDistance(center, point, nextPoint) <= radius;
  });
}

function isCarvingRoutineActionResponse(value: unknown): value is CarvingRevelationRoutineActionResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; playerId?: unknown; actionId?: unknown; actionType?: unknown; roundNumber?: unknown };
  if (candidate.kind === 'next_round_vote') {
    return typeof candidate.playerId === 'string';
  }
  return candidate.kind === 'submission_status'
    && typeof candidate.playerId === 'string'
    && typeof candidate.actionId === 'number'
    && (candidate.actionType === 'draw' || candidate.actionType === 'guess')
    && typeof candidate.roundNumber === 'number';
}

async function readLobbyResponse<T = CarvingRevelationLobbyView>(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Carving Revelation request failed.');
  }
  return data as T;
}

async function readPublicLobbiesResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load public lobbies.');
  }
  return data as CarvingRevelationPublicLobby[];
}

function getSerializedRevealPoints(value: unknown) {
  if (!Array.isArray(value)) return null;
  const normalizedPoints = value
    .map((point) => (
      typeof point === 'object' && point !== null && 'x' in point && 'y' in point
        ? { x: Number(point.x), y: Number(point.y) }
        : null
    ))
    .filter((point): point is RevealPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)));
  return normalizedPoints.length >= 3 ? normalizedPoints : null;
}

function getDrawPayload(action: CarvingRevelationAction): RevealShape | Stroke | null {
  if (action.action_type !== 'draw') return null;
  if (action.payload.hidden === true) return null;
  const { points, outlinePoints, x1, y1, x2, y2 } = action.payload;
  const serializedPoints = Array.isArray(points) ? points : outlinePoints;
  if (Array.isArray(serializedPoints)) {
    const normalizedPoints = getSerializedRevealPoints(serializedPoints);
    return normalizedPoints ? { points: normalizedPoints, outlineOnly: !Array.isArray(points) } : null;
  }
  if (typeof x1 === 'number' && typeof y1 === 'number' && typeof x2 === 'number' && typeof y2 === 'number') {
    return { x1, y1, x2, y2 };
  }
  return null;
}

function getShuffleSourcePoints(action: CarvingRevelationAction) {
  return getSerializedRevealPoints(action.payload.shuffleSourcePoints);
}

function getShuffleImageSwap(action: CarvingRevelationAction) {
  const payload = getDrawPayload(action);
  const sourcePoints = getShuffleSourcePoints(action);
  if (!payload || !('points' in payload) || payload.outlineOnly || !sourcePoints) return null;
  return { sourcePoints, destinationPoints: payload.points };
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
    powerUpsEnabled: view.lobby.power_ups_enabled,
    powerUpCount: view.lobby.power_up_count,
    startingLineLengthPercent: view.lobby.starting_line_length_percent,
    lineLengthIncrementPercent: view.lobby.line_length_increment_percent,
  };
}

function getSettingOptionKey(value: string | number | null) {
  return value === null ? 'none' : String(value);
}

function haveSameModifiers(first: CarvingRevelationModifier[], second: CarvingRevelationModifier[]) {
  if (first.length !== second.length) return false;
  const firstSet = new Set(first);
  return second.every((modifier) => firstSet.has(modifier));
}

function getPowerUpClassName(powerUp: CarvingRevelationPowerUpState, phase: CarvingRevelationLobbyView['lobby']['phase']) {
  if (phase !== 'guess') {
    return 'border-amber-100 bg-slate-950/80 text-amber-200';
  }
  if (powerUp.conflicted) {
    return 'border-red-400 bg-red-500/80 text-white';
  }
  if (powerUp.claimedByPlayerId) {
    return 'border-white bg-emerald-300 text-slate-950';
  }
  return 'border-amber-100 bg-slate-950/80 text-amber-200';
}

function getPowerUpLabel(powerUp: CarvingRevelationPowerUpState) {
  return getCarvingRevelationPowerUpDefinition(powerUp.kind)?.name ?? 'Power Up';
}

function getActionPowerUpId(action: CarvingRevelationAction) {
  const value = action.payload.powerUpId;
  return typeof value === 'string' ? value : null;
}

function CarvingRevelationPowerUpMenu({
  menuRef,
  open,
  phase,
  busy,
  usablePowerUps,
  pendingPowerUpIdsByKind,
  onToggle,
  onActivate,
  onCancel,
}: {
  menuRef: RefObject<HTMLDivElement>;
  open: boolean;
  phase: 'carve' | 'guess';
  busy: boolean;
  usablePowerUps: CarvingRevelationPowerUpState[];
  pendingPowerUpIdsByKind: ReadonlyMap<string, string>;
  onToggle: () => void;
  onActivate: (powerUpId: string) => void;
  onCancel: (powerUpId: string) => void;
}) {
  const possessedPowerUpIds = new Set(usablePowerUps.map((powerUp) => powerUp.kind));
  const guessingSection = {
    title: 'Guessing phase power ups',
    definitions: CARVING_REVELATION_POWER_UP_DEFINITIONS.filter((definition) => (
      definition.activationPhase === 'guess' || definition.activationPhase === 'any'
    )),
  };
  const carvingSection = {
    title: 'Carving phase power ups',
    definitions: CARVING_REVELATION_POWER_UP_DEFINITIONS.filter((definition) => (
      definition.activationPhase === 'carve' || definition.activationPhase === 'any'
    )),
  };
  const sections = phase === 'carve'
    ? [carvingSection, guessingSection]
    : [guessingSection, carvingSection];
  const trackedPowerUpCount = usablePowerUps.length + pendingPowerUpIdsByKind.size;

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        disabled={busy}
        className={`inline-flex min-h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-black transition ${open
          ? 'border-amber-200 bg-amber-300 text-slate-950  '
          : 'border-amber-300/50 bg-gradient-to-r from-amber-300/20 to-violet-400/20 text-amber-100   hover:border-amber-200 hover:bg-amber-300/25'} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Sparkles size={17} />
        <span>Power Ups</span>
        <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${open ? 'bg-slate-950/15' : 'bg-amber-300 text-slate-950'}`}>
          {trackedPowerUpCount}
        </span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Power ups"
          className="absolute bottom-full right-0 z-50 mb-3 max-h-[min(70vh,34rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-amber-200/30 bg-slate-950/95 p-3   backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 px-1 pb-3">
            <div>
              <p className="text-sm font-black text-white">Power ups</p>
              <p className="mt-1 text-xs text-slate-400">Possessed power ups are highlighted.</p>
            </div>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-amber-200">
              {trackedPowerUpCount} possessed
            </span>
          </div>

          {sections.map((section) => (
            <section key={section.title} className="mt-4 first:mt-0">
              <p className="px-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-500">{section.title}</p>
              <div className="mt-2 grid gap-2">
                {section.definitions.map((definition) => {
                  const pendingPowerUpId = pendingPowerUpIdsByKind.get(definition.kind) ?? null;
                  const pending = Boolean(pendingPowerUpId);
                  const possessed = possessedPowerUpIds.has(definition.kind) || pending;
                  const availableThisPhase = canActivateCarvingRevelationPowerUp(definition.kind, phase);
                  const powerUp = usablePowerUps.find((candidate) => candidate.kind === definition.kind);
                  const disabled = busy || (!pending && (!possessed || !availableThisPhase));
                  return (
                    <button
                      key={definition.kind}
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      onClick={() => {
                        if (pendingPowerUpId && !busy) {
                          onCancel(pendingPowerUpId);
                        } else if (powerUp && !disabled) {
                          onActivate(powerUp.id);
                        }
                      }}
                      className={`group flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${pending
                        ? 'border-violet-300/50 bg-violet-300/10'
                        : possessed
                          ? 'border-amber-300/45 bg-amber-300/10 hover:border-amber-200 hover:bg-amber-300/15'
                        : 'border-white/10 bg-slate-900/60'} ${disabled && possessed ? 'cursor-not-allowed opacity-55' : ''} ${!possessed ? 'cursor-not-allowed opacity-55' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className={`block text-sm font-black ${possessed ? 'text-amber-100' : 'text-slate-300'}`}>
                          {definition.name}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">{definition.description}</span>
                        {pending ? <span className="mt-2 block text-[0.65rem] font-black uppercase tracking-[0.12em] text-violet-200">Queued - applies at phase end</span> : null}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.6rem] font-black uppercase tracking-[0.12em] ${pending
                        ? 'bg-violet-300/20 text-violet-100'
                        : possessed
                        ? availableThisPhase
                          ? 'bg-emerald-300/20 text-emerald-200'
                          : 'bg-slate-700/70 text-slate-400'
                        : 'bg-slate-800 text-slate-500'}`}>
                        {pending ? 'Cancel' : possessed ? (availableThisPhase ? 'Use' : 'Owned') : 'Find'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingDropdown<T extends string | number | null>({
  label,
  value,
  options,
  disabled,
  onSelect,
}: {
  label: string;
  value: T;
  options: Array<SettingOption<T>>;
  disabled?: boolean;
  onSelect: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => getSettingOptionKey(option.value) === getSettingOptionKey(value)) ?? options[0];

  return (
    <label className="relative grid gap-2">
      <span className="text-sm font-bold text-white">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          playUiSound('autocomplete-select');
          setOpen((current) => !current);
        }}
        className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 px-3 text-left text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-65"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-500" />
      </button>
      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 grid overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-1  ">
          {options.map((option) => (
            <button
              key={getSettingOptionKey(option.value)}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('autocomplete-select');
                setOpen(false);
                onSelect(option.value);
              }}
              className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                getSettingOptionKey(option.value) === getSettingOptionKey(value)
                  ? 'bg-amber-300/15 text-amber-100'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

type ShuffleImageSwap = NonNullable<ReturnType<typeof getShuffleImageSwap>>;

function getPolygonCenter(points: RevealPoint[]) {
  return points.reduce((center, point) => ({
    x: center.x + point.x / points.length,
    y: center.y + point.y / points.length,
  }), { x: 0, y: 0 });
}

function clipCanvasPolygon(context: CanvasRenderingContext2D, points: RevealPoint[], width: number, height: number) {
  if (points.length < 3) return;
  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);
  points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
  context.closePath();
  context.clip();
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  modifiers: { greyscale: boolean; blurred: boolean; cropped: boolean },
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;
  const imageX = (width - imageWidth) / 2;
  const imageY = (height - imageHeight) / 2;
  context.save();
  context.filter = [
    modifiers.greyscale ? 'grayscale(1)' : '',
    modifiers.blurred ? 'blur(4px)' : '',
  ].filter(Boolean).join(' ') || 'none';
  if (modifiers.cropped) {
    context.translate(width / 2, height * 0.42);
    context.scale(1.65, 1.65);
    context.translate(-width / 2, -height * 0.42);
  }
  context.drawImage(image, imageX, imageY, imageWidth, imageHeight);
  context.restore();
}

function useShuffleImageRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  imageUrl: string | null,
  swaps: ShuffleImageSwap[],
  modifiers: { greyscale: boolean; blurred: boolean; cropped: boolean },
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || swaps.length === 0) {
      if (canvas) canvas.style.visibility = 'hidden';
      return undefined;
    }

    let disposed = false;
    const image = new window.Image();
    image.crossOrigin = 'anonymous';

    const render = () => {
      if (disposed || !canvas.parentElement || !image.naturalWidth || !image.naturalHeight) return;
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
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = Math.floor(width * pixelRatio);
      originalCanvas.height = Math.floor(height * pixelRatio);
      const originalContext = originalCanvas.getContext('2d');
      if (!originalContext) return;
      originalContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawCoverImage(originalContext, image, width, height, modifiers);

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(originalCanvas, 0, 0, width, height);
      swaps.forEach(({ sourcePoints, destinationPoints }) => {
        const sourceCenter = getPolygonCenter(sourcePoints);
        const destinationCenter = getPolygonCenter(destinationPoints);
        const offsetX = (destinationCenter.x - sourceCenter.x) * width;
        const offsetY = (destinationCenter.y - sourceCenter.y) * height;

        context.save();
        clipCanvasPolygon(context, destinationPoints, width, height);
        context.translate(offsetX, offsetY);
        context.drawImage(originalCanvas, 0, 0, width, height);
        context.restore();

        context.save();
        clipCanvasPolygon(context, sourcePoints, width, height);
        context.translate(-offsetX, -offsetY);
        context.drawImage(originalCanvas, 0, 0, width, height);
        context.restore();
      });
      canvas.style.visibility = 'visible';
    };

    image.onload = render;
    image.src = imageUrl;
    window.addEventListener('resize', render);
    return () => {
      disposed = true;
      window.removeEventListener('resize', render);
    };
  }, [canvasRef, imageUrl, modifiers, swaps]);
}

function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  actions: CarvingRevelationAction[],
  draftPath: RevealPoint[],
  currentRound: number,
  phase: 'carve' | 'guess',
  playerColorById: Record<string, string>,
  draftColor: string,
  insightSquares: CarvingRevelationLobbyView['insightSquares'],
  viewerPlayerId: string | null,
  showCurrentCarvesToViewer: boolean,
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
        const visible = action.round_number < currentRound || phase !== 'carve' || action.player_id === viewerPlayerId || (showCurrentCarvesToViewer && action.round_number === currentRound);
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
        if ('points' in payload && !payload.outlineOnly) {
          drawPolygon(payload.points, 'fill');
        } else {
          if (!('points' in payload)) drawStroke(payload);
        }
        context.restore();
      });

      if (phase === 'guess') {
        insightSquares.forEach((square) => {
          context.fillStyle = 'rgb(2, 6, 23)';
          context.fillRect(square.x * width, square.y * height, square.size * width, square.size * height);
        });
      }

      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = 'rgba(250, 204, 21, 0.42)';
      context.lineWidth = 2;
      context.strokeRect(1, 1, width - 2, height - 2);

      actions.forEach((action) => {
        const payload = getDrawPayload(action);
        if (!payload || !('points' in payload)) return;
        const currentCarveOutline = phase === 'carve' && action.round_number === currentRound && payload.outlineOnly;
        const visible = action.round_number < currentRound || phase !== 'carve' || action.player_id === viewerPlayerId || currentCarveOutline;
        if (!visible) return;
        const outlineRound = currentCarveOutline ? currentRound : phase === 'guess' ? currentRound : currentRound - 1;
        if (action.round_number !== outlineRound) return;
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
  }, [actions, canvasRef, currentRound, draftColor, draftPath, insightSquares, phase, playerColorById, showCurrentCarvesToViewer, viewerPlayerId]);
}

export function CarvingRevelation() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const guessInputAreaRef = useRef<HTMLDivElement>(null);
  const powerUpMenuRef = useRef<HTMLDivElement>(null);
  const latestSessionRef = useRef<{ code: string; clientId: string; status: CarvingRevelationLobbyView['lobby']['status'] } | null>(null);
  const isLeavingLobbyRef = useRef(false);
  const autoSubmittedCarveKeyRef = useRef<string | null>(null);
  const countdownSoundSecondRef = useRef<number | null>(null);
  const startCountdownSoundSecondRef = useRef<number | null>(null);
  const phaseSoundKeyRef = useRef<string | null>(null);
  const finishSoundLobbyIdRef = useRef<string | null>(null);
  const guessOutcomeSoundIdsRef = useRef<Set<number>>(new Set());
  const guessOutcomeLobbyIdRef = useRef<string | null>(null);
  const carvingAchievementSubmissionRef = useRef<{ lobbyId: string | null; events: Set<string> }>({ lobbyId: null, events: new Set() });
  const powerUpClaimsSnapshotRef = useRef<{ lobbyId: string; roundNumber: number; phase: 'carve' | 'guess'; ids: Set<string> } | null>(null);
  const pendingAcquiredPowerUpIdsRef = useRef<{ lobbyId: string; roundNumber: number; ids: Set<string> } | null>(null);
  const previousRosterSnapshotRef = useRef<{ hostId: string | null; roles: Map<string, string>; playerIds: Set<string> } | null>(null);
  const lobbyRefreshInFlightRef = useRef<Promise<CarvingRevelationLobbyView> | null>(null);
  const lobbyRefreshVersionRef = useRef(0);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
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
  const [startCountdownSeconds, setStartCountdownSeconds] = useState<number | null>(null);
  const [matchElapsedSeconds, setMatchElapsedSeconds] = useState(0);
  const [draftSettings, setDraftSettings] = useState<DraftCarvingSettings | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [powerUpMenuOpen, setPowerUpMenuOpen] = useState(false);
  const [acquiredPowerUpNotice, setAcquiredPowerUpNotice] = useState<{ names: string[] } | null>(null);

  const submitCarvingAchievement = useCallback((
    event: Parameters<typeof submitAchievementEvent>[0],
    lobbyId: string,
    metadata: Record<string, unknown> = {},
  ) => {
    const submissionState = carvingAchievementSubmissionRef.current;
    if (submissionState.lobbyId !== lobbyId) {
      submissionState.lobbyId = lobbyId;
      submissionState.events.clear();
    }
    if (submissionState.events.has(event)) {
      return;
    }

    submissionState.events.add(event);
    void submitAchievementEvent(event, { lobbyCode: lobbyId, ...metadata })
      .then((result) => {
        if (!result) submissionState.events.delete(event);
      })
      .catch(() => {
        submissionState.events.delete(event);
      });
  }, []);

  const clearTransientState = useCallback(() => {
    setMessage('');
    setBusy(false);
    setDraftPath([]);
    setConfirmedCarvePath([]);
    setIsDrawing(false);
    setDraftLocked(false);
    setGuess('');
    setSuggestions([]);
    setCodeCopied(false);
    setCodeRevealed(false);
    setPowerUpMenuOpen(false);
    setAcquiredPowerUpNotice(null);
    powerUpClaimsSnapshotRef.current = null;
    pendingAcquiredPowerUpIdsRef.current = null;
  }, []);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const lobbyId = view?.lobby.id ?? null;
  const serverLobbyDescription = view?.lobby.lobby_description ?? '';
  const lobbyDescriptionDirty = lobbyDescription !== serverLobbyDescription;
  const isActivePlayer = Boolean(view?.requestingPlayer?.result === 'active' && view.requestingPlayer.connected);
  const hasWonCurrentMatch = Boolean(view?.requestingPlayer?.result === 'won');
  const hasForfeitedCurrentMatch = Boolean(view?.requestingPlayer?.result === 'eliminated');
  const shouldShowGuessForm = !hasWonCurrentMatch && !hasForfeitedCurrentMatch;
  const shouldShowWinnerImageBorder = Boolean(view?.lobby.status === 'active' && hasWonCurrentMatch);
  const computedStartCountdownSeconds = startCountdownSeconds ?? (
    view?.lobby.status === 'active' && view.lobby.started_at && new Date(view.lobby.started_at).getTime() > Date.now()
      ? Math.max(1, Math.ceil((new Date(view.lobby.started_at).getTime() - Date.now()) / 1000))
      : null
  );
  const isStartCountdownPending = Boolean(computedStartCountdownSeconds && computedStartCountdownSeconds > 0);
  const skipTurnBlockedByPowerUp = Boolean(view?.requestingPlayer && view.lobby.phase === 'guess' && view.powerUps.some((powerUp) => (
    powerUp.kind === 'skip_turns' &&
    !powerUp.conflicted &&
    powerUp.claimedByPlayerId &&
    powerUp.claimedByPlayerId !== view.requestingPlayer?.id &&
    view.actions.some((action) => (
      action.action_type === 'power_up' &&
      action.player_id === powerUp.claimedByPlayerId &&
      action.payload.powerUpId === powerUp.id &&
      Number(action.payload.targetRoundNumber) === view.lobby.round_number &&
      action.payload.targetPhase === 'carve'
    ))
  )));
  const currentPlayerDrawCount = view?.requestingPlayer
    ? view.actions.filter((action) => (
      action.action_type === 'draw' &&
      action.round_number === view.lobby.round_number &&
      action.player_id === view.requestingPlayer?.id
    )).length
    : 0;
  const hasDoubleLineForCurrentCarve = Boolean(view?.requestingPlayer && view.actions.some((action) => (
    action.action_type === 'power_up' &&
    action.payload.kind === 'double_line' &&
    action.player_id === view.requestingPlayer?.id &&
    Number(action.payload.targetRoundNumber) + 1 === view.lobby.round_number
  )));
  const canCarve = Boolean(view?.lobby.status === 'active' && !isStartCountdownPending && view.lobby.phase === 'carve' && isActivePlayer);
  const canGuess = Boolean(view?.lobby.status === 'active' && !isStartCountdownPending && view.lobby.phase === 'guess' && isActivePlayer && !skipTurnBlockedByPowerUp);
  const shouldShowPowerUpControls = Boolean(view?.lobby.status === 'active' && !isStartCountdownPending && isActivePlayer && (view.lobby.phase === 'carve' || view.lobby.phase === 'guess'));
  const winner = view?.players.find((player) => player.id === view.lobby.winner_player_id) ?? null;
  const winningPlayers = view?.players.filter((player) => player.result === 'won') ?? [];
  const nextRoundVotePlayers = view?.players.filter((player) => view.nextRoundVotes.includes(player.id)) ?? [];
  const hasVotedForNextRound = Boolean(view?.requestingPlayer && view.nextRoundVotes.includes(view.requestingPlayer.id));
  const connectedPlayerCount = view?.players.filter((player) => player.connected).length ?? 0;
  const lineLimitPercent = view ? Math.round((view.lineLengthLimit / view.maxLineLength) * 100) : 0;
  const visibleSettings = draftSettings ?? (view ? createDraftSettings(view) : null);
  const settingsChanged = Boolean(view && visibleSettings && (
    visibleSettings.phaseDurationSeconds !== view.lobby.phase_duration_seconds ||
    visibleSettings.winCondition !== view.lobby.win_condition ||
    visibleSettings.startingLineLengthPercent !== view.lobby.starting_line_length_percent ||
    visibleSettings.lineLengthIncrementPercent !== view.lobby.line_length_increment_percent ||
    visibleSettings.powerUpsEnabled !== view.lobby.power_ups_enabled ||
    visibleSettings.powerUpCount !== view.lobby.power_up_count ||
    !haveSameModifiers(visibleSettings.modifiers, view.lobby.modifiers)
  ));
  const settingsPending = settingsChanged || lobbyDescriptionDirty;
  const selectedModifiers = useMemo(() => new Set(visibleSettings?.modifiers ?? []), [visibleSettings?.modifiers]);
  const activeModifiers = useMemo(() => new Set(view?.lobby.modifiers ?? []), [view?.lobby.modifiers]);
  const phaseTimeSummary = visibleSettings?.phaseDurationSeconds === null ? 'None' : `${visibleSettings?.phaseDurationSeconds ?? 30}s`;
  const winConditionSummary = WIN_CONDITION_OPTIONS.find((option) => option.value === visibleSettings?.winCondition)?.label ?? 'Everyone guess correct';
  const nextRoundVoteThreshold = Math.floor(connectedPlayerCount / 2) + 1;
  const canHostStartNextRound = Boolean(isHost && view?.lobby.status === 'finished' && view.nextRoundVotes.length >= nextRoundVoteThreshold);
  const shouldShowLeaveGame = Boolean(view?.requestingPlayer && (
    view.requestingPlayer.result === 'eliminated' ||
    view.requestingPlayer.disconnected_at === FORFEIT_DISCONNECTED_AT
  ));
  const displayedRoundTimerSeconds = computedStartCountdownSeconds ?? phaseRemainingSeconds;
  const timerIsUrgent = Boolean(view?.lobby.status === 'active' && view.lobby.phase_duration_seconds !== null && displayedRoundTimerSeconds > 0 && displayedRoundTimerSeconds <= 3);
  const imageModifierClassName = [
    'absolute inset-0 bg-cover bg-center transition duration-300',
    activeModifiers.has('greyscale') ? 'grayscale' : '',
    activeModifiers.has('blurred') ? 'blur-sm' : '',
  ].filter(Boolean).join(' ');
  const displayedSkinImageUrl = view
    ? view.lobby.status === 'active' && clientId && view.requestingPlayer?.connected && view.requestingPlayer.result !== 'eliminated'
      ? `${API_BASE}/${view.lobby.code}/skin-image?clientId=${encodeURIComponent(clientId)}`
      : view.skin?.imageUrl ?? null
    : null;
  const imageModifierStyle = displayedSkinImageUrl
    ? {
      backgroundImage: `url("${displayedSkinImageUrl}")`,
      transform: activeModifiers.has('cropped') ? 'scale(1.65)' : undefined,
      transformOrigin: '50% 42%',
      transition: 'filter 240ms ease, transform 240ms ease',
    }
    : undefined;
  const guessActions = useMemo(
    () => view?.actions.filter((action) => action.action_type === 'guess').reverse() ?? [],
    [view?.actions],
  );
  const visiblePowerUps = useMemo(() => (
    view?.lobby.status === 'active' && view.lobby.power_ups_enabled ? view.powerUps : []
  ), [view?.lobby.power_ups_enabled, view?.lobby.status, view?.powerUps]);
  const previewClaimedPowerUpIds = useMemo(() => {
    if (!canCarve) return new Set<string>();
    const previewPoints = draftPath.length >= 3 ? draftPath : confirmedCarvePath.length >= 3 ? confirmedCarvePath : [];
    return new Set(visiblePowerUps
      .filter((powerUp) => !powerUp.claimedByPlayerId && !powerUp.conflicted && shapeClaimsPowerUp(previewPoints, powerUp))
      .map((powerUp) => powerUp.id));
  }, [canCarve, confirmedCarvePath, draftPath, visiblePowerUps]);
  const usedPowerUpIds = useMemo(() => new Set(
    view?.actions
      .filter((action) => action.action_type === 'power_up')
      .map(getActionPowerUpId)
      .filter((powerUpId): powerUpId is string => Boolean(powerUpId)) ?? [],
  ), [view?.actions]);
  const usablePowerUps = useMemo(() => (
    view?.claimedPowerUps.filter((powerUp) => !usedPowerUpIds.has(powerUp.id)) ?? []
  ), [usedPowerUpIds, view?.claimedPowerUps]);
  const currentPhase = view?.lobby.phase;
  const activatablePowerUps = useMemo(() => (
    currentPhase
      ? usablePowerUps.filter((powerUp) => canActivateCarvingRevelationPowerUp(powerUp.kind, currentPhase))
      : []
  ), [currentPhase, usablePowerUps]);

  const pendingPowerUpIdsByKind = useMemo(() => {
    const entries = view?.actions
      .filter((action) => (
        action.action_type === 'power_up' &&
        action.player_id === view.requestingPlayer?.id &&
        Number(action.payload.targetRoundNumber) === view.lobby.round_number &&
        action.payload.targetPhase === currentPhase
      ))
      .map((action) => {
        const kind = action.payload.kind;
        const powerUpId = action.payload.powerUpId;
        return typeof kind === 'string' && typeof powerUpId === 'string' ? [kind, powerUpId] as [string, string] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)) ?? [];
    return new Map<string, string>(entries);
  }, [currentPhase, view?.actions, view?.lobby.round_number, view?.requestingPlayer?.id]);

  useEffect(() => {
    const activeView = view?.lobby.status === 'active' && view.requestingPlayer ? view : null;
    if (!activeView) {
      powerUpClaimsSnapshotRef.current = null;
      pendingAcquiredPowerUpIdsRef.current = null;
      return;
    }

    const claimedIds = new Set(activeView.powerUps
      .filter((powerUp) => powerUp.claimedByPlayerId === activeView.requestingPlayer?.id && !powerUp.conflicted)
      .map((powerUp) => powerUp.id));
    const previousSnapshot = powerUpClaimsSnapshotRef.current;
    const sameRound = previousSnapshot?.lobbyId === activeView.lobby.id && previousSnapshot.roundNumber === activeView.lobby.round_number;
    const newlyAcquiredIds = sameRound && previousSnapshot
      ? [...claimedIds].filter((powerUpId) => !previousSnapshot.ids.has(powerUpId))
      : [];
    if (newlyAcquiredIds.length > 0) {
      const pendingNotice = pendingAcquiredPowerUpIdsRef.current;
      const pendingIds = pendingNotice?.lobbyId === activeView.lobby.id && pendingNotice.roundNumber === activeView.lobby.round_number
        ? pendingNotice.ids
        : new Set<string>();
      newlyAcquiredIds.forEach((powerUpId) => pendingIds.add(powerUpId));
      pendingAcquiredPowerUpIdsRef.current = {
        lobbyId: activeView.lobby.id,
        roundNumber: activeView.lobby.round_number,
        ids: pendingIds,
      };
    }

    const phaseEnded = previousSnapshot?.lobbyId === activeView.lobby.id
      && previousSnapshot.roundNumber === activeView.lobby.round_number
      && previousSnapshot.phase === 'carve'
      && activeView.lobby.phase === 'guess';
    powerUpClaimsSnapshotRef.current = {
      lobbyId: activeView.lobby.id,
      roundNumber: activeView.lobby.round_number,
      phase: activeView.lobby.phase,
      ids: claimedIds,
    };
    if (!phaseEnded) return;

    const pendingNotice = pendingAcquiredPowerUpIdsRef.current;
    const acquiredNames = pendingNotice?.lobbyId === activeView.lobby.id && pendingNotice.roundNumber === activeView.lobby.round_number
      ? [...pendingNotice.ids]
        .filter((powerUpId) => claimedIds.has(powerUpId))
        .map((powerUpId) => activeView.powerUps.find((powerUp) => powerUp.id === powerUpId))
        .filter((powerUp): powerUp is CarvingRevelationPowerUpState => Boolean(powerUp))
        .map(getPowerUpLabel)
      : [];
    pendingAcquiredPowerUpIdsRef.current = null;
    if (acquiredNames.length === 0) return;

    const uniqueNames = [...new Set(acquiredNames)];
    setAcquiredPowerUpNotice({ names: uniqueNames });
  }, [view]);

  useEffect(() => {
    if (!acquiredPowerUpNotice) return;
    const timeoutId = window.setTimeout(() => setAcquiredPowerUpNotice(null), 3800);
    return () => window.clearTimeout(timeoutId);
  }, [acquiredPowerUpNotice]);

  useEffect(() => {
    setPowerUpMenuOpen(false);
  }, [currentPhase, lobbyId]);

  useEffect(() => {
    if (!powerUpMenuOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!powerUpMenuRef.current?.contains(event.target as Node)) {
        setPowerUpMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPowerUpMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [powerUpMenuOpen]);
  const guessActionsByRound = useMemo(() => {
    const groups = new Map<number, CarvingRevelationAction[]>();
    guessActions.forEach((action) => {
      const roundActions = groups.get(action.round_number) ?? [];
      roundActions.push(action);
      groups.set(action.round_number, roundActions);
    });
    return [...groups.entries()].map(([roundNumber, actions]) => ({ roundNumber, actions }));
  }, [guessActions]);
  const feedRounds = useMemo(() => {
    const roundNumbers = new Set<number>();
    guessActionsByRound.forEach((group) => roundNumbers.add(group.roundNumber));
    view?.powerUpMessages.forEach((powerUpMessage) => roundNumbers.add(powerUpMessage.roundNumber));
    return [...roundNumbers]
      .sort((first, second) => second - first)
      .map((roundNumber) => ({
        roundNumber,
        guesses: guessActionsByRound.find((group) => group.roundNumber === roundNumber)?.actions ?? [],
        powerUpMessages: view?.powerUpMessages.filter((powerUpMessage) => powerUpMessage.roundNumber === roundNumber) ?? [],
      }));
  }, [guessActionsByRound, view?.powerUpMessages]);
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
  const playerColorById = useMemo(() => Object.fromEntries(
    view?.players.map((player) => [player.id, player.carve_color]) ?? [],
  ), [view?.players]);
  const normalizedSkinAnswers = useMemo(
    () => skinAnswers.map((answer) => ({ answer, normalized: normalizeAnswer(answer) })),
    [skinAnswers],
  );

  const getGuessSuggestions = useCallback((value: string) => {
    const query = normalizeAnswer(value);
    if (!canGuess || query.length < 2) {
      return [];
    }

    return normalizedSkinAnswers
      .filter((entry) => entry.normalized.includes(query))
      .map((entry) => entry.answer)
      .slice(0, 12);
  }, [canGuess, normalizedSkinAnswers]);

  useEffect(() => {
    setSuggestions(getGuessSuggestions(guess));
  }, [getGuessSuggestions, guess]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!guessInputAreaRef.current?.contains(target)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const previewPath = draftPath.length > 0 ? draftPath : confirmedCarvePath;
  const shuffleImageSwaps = useMemo(() => (
    view?.actions
      .map(getShuffleImageSwap)
      .filter((swap): swap is ShuffleImageSwap => Boolean(swap)) ?? []
  ), [view?.actions]);
  const showCurrentCarvesToViewer = Boolean(view?.requestingPlayer && view.actions.some((action) => (
    action.action_type === 'power_up' &&
    action.payload.kind === 'view_thief' &&
    action.player_id === view.requestingPlayer?.id &&
    Number(action.payload.targetRoundNumber) + 1 === view.lobby.round_number
  )));
  useShuffleImageRenderer(
    imageCanvasRef,
    displayedSkinImageUrl,
    shuffleImageSwaps,
    {
      greyscale: activeModifiers.has('greyscale'),
      blurred: activeModifiers.has('blurred'),
      cropped: activeModifiers.has('cropped'),
    },
  );
  useCanvasRenderer(
    canvasRef,
    view?.actions ?? [],
    previewPath,
    view?.lobby.round_number ?? 1,
    view?.lobby.phase ?? 'carve',
    playerColorById,
    view?.requestingPlayer?.carve_color ?? '#facc15',
    view?.insightSquares ?? [],
    view?.requestingPlayer?.id ?? null,
    showCurrentCarvesToViewer,
  );

  const applyView = useCallback((nextView: CarvingRevelationLobbyView) => {
    if (isLeavingLobbyRef.current) return;
    if (nextView.lobby.status === 'terminated') {
      clearTransientState();
      window.localStorage.removeItem(STORAGE_KEY);
      setRejoinCandidate(null);
      setView(null);
      router.replace('/games');
      return;
    }
    setRejoinCandidate(null);
    setMessage('');
    setView(nextView);
    if (nextView.lobby.status === 'waiting' || nextView.lobby.status === 'active') {
      window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [clearTransientState, router]);

  const applyRoutineAction = useCallback((actionResponse: CarvingRevelationRoutineActionResponse) => {
    setView((current) => {
      if (!current) return current;
      if (actionResponse.kind === 'next_round_vote') {
        if (current.nextRoundVotes.includes(actionResponse.playerId)) return current;
        return { ...current, nextRoundVotes: [...current.nextRoundVotes, actionResponse.playerId] };
      }

      const fallbackAction: CarvingRevelationAction = {
        id: actionResponse.actionId,
        lobby_id: current.lobby.id,
        player_id: actionResponse.playerId,
        action_type: actionResponse.actionType,
        turn_index: 0,
        round_number: actionResponse.roundNumber,
        payload: { submitted: true },
        created_at: new Date().toISOString(),
      };
      const nextAction = actionResponse.action ?? fallbackAction;
      const existingAction = current.actions.find((action) => action.id === nextAction.id);
      if (existingAction && !actionResponse.action) return current;

      const withoutReplacedDraw = actionResponse.actionType === 'draw' && actionResponse.replacesPreviousDraw
        ? current.actions.filter((action) => !(
          action.action_type === 'draw' &&
          action.player_id === actionResponse.playerId &&
          action.round_number === actionResponse.roundNumber
        ))
        : current.actions.filter((action) => action.id !== nextAction.id);
      return { ...current, actions: [...withoutReplacedDraw, nextAction] };
    });
  }, []);

  const applyActionResponse = useCallback((response: CarvingRevelationLobbyView | CarvingRevelationRoutineActionResponse) => {
    if (isCarvingRoutineActionResponse(response)) {
      applyRoutineAction(response);
      return;
    }
    applyView(response);
  }, [applyRoutineAction, applyView]);

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
      setPublicLobbies(await loadCarvingPublicLobbies());
    } catch {
      setPublicLobbies([]);
    }
  }, []);

  const refreshLobby = useCallback(async (code: string, activeClientId: string) => {
    lobbyRefreshVersionRef.current += 1;
    if (lobbyRefreshInFlightRef.current) return lobbyRefreshInFlightRef.current;

    const request = (async () => {
      let handledVersion = 0;
      let latestView: CarvingRevelationLobbyView | null = null;
      while (handledVersion !== lobbyRefreshVersionRef.current && !isLeavingLobbyRef.current) {
        handledVersion = lobbyRefreshVersionRef.current;
        const response = await fetch(`${API_BASE}/${code}?clientId=${encodeURIComponent(activeClientId)}`);
        latestView = await readLobbyResponse<CarvingRevelationLobbyView>(response);
        applyView(latestView);
      }
      if (!latestView) throw new Error('Lobby refresh was cancelled.');
      return latestView;
    })();
    lobbyRefreshInFlightRef.current = request;
    const clear = () => {
      if (lobbyRefreshInFlightRef.current === request) lobbyRefreshInFlightRef.current = null;
    };
    void request.then(clear, clear);
    return request;
  }, [applyView]);

  const leaveCurrentLobby = useCallback(async (forfeit = false) => {
    const session = latestSessionRef.current;
    if (!session) return;
    clearTransientState();
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
  }, [clearTransientState, loadPublicLobbies]);

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
        const eligibility = await response.json() as {
          eligible: boolean;
          lobbyCode?: string;
          disconnectedAt?: string | null;
        };
        if (cancelled) return;
        if (eligibility.eligible && eligibility.lobbyCode && eligibility.disconnectedAt) {
          setRejoinCandidate({
            code: eligibility.lobbyCode,
            expiresAt: new Date(getReconnectDeadline(eligibility.disconnectedAt)).toISOString(),
          });
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
    loadCarvingSkinAnswers()
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
    view?.lobby.power_up_count,
    view?.lobby.power_ups_enabled,
    view?.lobby.starting_line_length_percent,
    view?.lobby.win_condition,
  ]);

  useEffect(() => {
    if (settingsDirty && !settingsChanged) {
      setSettingsDirty(false);
    }
  }, [settingsChanged, settingsDirty]);

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

  const heartbeatLobbyCode = view && view.lobby.status !== 'terminated' ? view.lobby.code : null;
  const reconnectDeadlines = useMemo(() => view?.lobby.status === 'active'
    ? view.players
      .filter((player) => player.result === 'active' && !player.connected && player.disconnected_at)
      .map((player) => getReconnectDeadline(player.disconnected_at as string))
    : [], [view?.lobby.status, view?.players]);

  const sendHeartbeat = useCallback(async () => {
    if (!heartbeatLobbyCode || !clientId) return;

    try {
      const response = await fetch(`${API_BASE}/${heartbeatLobbyCode}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!response.ok) {
        await readLobbyResponse(response);
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes('cannot rejoin') || error.message.includes('Player not found'))) {
        clearTransientState();
        window.localStorage.removeItem(STORAGE_KEY);
        setView(null);
        router.replace('/games');
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Unable to update lobby presence.');
    }
  }, [clearTransientState, clientId, heartbeatLobbyCode, router]);

  useMultiplayerHeartbeat({
    enabled: Boolean(heartbeatLobbyCode && clientId),
    onHeartbeat: sendHeartbeat,
    onReconcile: view?.lobby.status === 'active' && clientId
      ? () => { void refreshLobby(view.lobby.code, clientId); }
      : undefined,
  });

  useEffect(() => {
    if (!heartbeatLobbyCode || !clientId || reconnectDeadlines.length === 0) return undefined;
    const delay = Math.max(0, Math.min(...reconnectDeadlines) - Date.now() + 150);
    const timeout = window.setTimeout(() => void refreshLobby(heartbeatLobbyCode, clientId).catch(() => undefined), delay);
    return () => window.clearTimeout(timeout);
  }, [clientId, heartbeatLobbyCode, reconnectDeadlines, refreshLobby]);

  useEffect(() => {
    if (!view?.lobby.phase_deadline_at || view.lobby.status !== 'active') {
      setPhaseRemainingSeconds(0);
      countdownSoundSecondRef.current = null;
      return undefined;
    }
    let refreshed = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(view.lobby.phase_deadline_at as string).getTime() - Date.now()) / 1000));
      setPhaseRemainingSeconds(remaining);
      if (remaining > 0 && remaining <= 3 && countdownSoundSecondRef.current !== remaining) {
        countdownSoundSecondRef.current = remaining;
        playUiSound('timer-countdown');
      }
      if (remaining === 0 && !refreshed && clientId) {
        refreshed = true;
        window.setTimeout(() => void refreshLobby(view.lobby.code, clientId).catch(() => undefined), 200);
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [clientId, refreshLobby, view?.lobby.code, view?.lobby.phase_deadline_at, view?.lobby.status]);

  useEffect(() => {
    if (!view?.lobby.started_at || view.lobby.status !== 'active') {
      setStartCountdownSeconds(null);
      startCountdownSoundSecondRef.current = null;
      return undefined;
    }

    const startedAtMs = new Date(view.lobby.started_at).getTime();
    const update = () => {
      const remaining = Math.max(0, Math.ceil((startedAtMs - Date.now()) / 1000));
      setStartCountdownSeconds(remaining > 0 ? remaining : null);
      if (remaining > 0 && startCountdownSoundSecondRef.current !== remaining) {
        startCountdownSoundSecondRef.current = remaining;
        playUiSound('timer-countdown');
      }
    };

    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [view?.lobby.started_at, view?.lobby.status]);

  useEffect(() => {
    if (!view?.lobby.started_at || (view.lobby.status !== 'active' && view.lobby.status !== 'finished')) {
      setMatchElapsedSeconds(0);
      return undefined;
    }
    const startedAtMs = new Date(view.lobby.started_at).getTime();
    const finishedAtMs = view.lobby.finished_at ? new Date(view.lobby.finished_at).getTime() : null;
    const update = () => {
      const endMs = Math.max(startedAtMs, finishedAtMs ?? Date.now());
      setMatchElapsedSeconds(Math.max(0, Math.floor((endMs - startedAtMs) / 1000)));
    };
    update();
    if (finishedAtMs) return undefined;
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [view?.lobby.finished_at, view?.lobby.started_at, view?.lobby.status]);

  useEffect(() => {
    const phaseKey = view?.lobby.status === 'active'
      ? `${view.lobby.id}:${view.lobby.round_number}:${view.lobby.phase}`
      : null;
    const previousPhaseKey = phaseSoundKeyRef.current;
    phaseSoundKeyRef.current = phaseKey;
    countdownSoundSecondRef.current = null;

    if (phaseKey && previousPhaseKey && phaseKey !== previousPhaseKey) {
      playUiSound('skindle-answer-reveal');
    }
  }, [view?.lobby.id, view?.lobby.phase, view?.lobby.round_number, view?.lobby.status]);

  useEffect(() => {
    const currentGuessIds = new Set(
      (view?.actions ?? [])
        .filter((action) => action.action_type === 'guess' && typeof action.payload.correct === 'boolean')
        .map((action) => action.id),
    );
    const previousGuessIds = guessOutcomeSoundIdsRef.current;
    const lobbyChanged = guessOutcomeLobbyIdRef.current !== (view?.lobby.id ?? null);
    const newResolvedGuesses = (view?.actions ?? []).filter((action) => (
      action.action_type === 'guess' &&
      typeof action.payload.correct === 'boolean' &&
      !previousGuessIds.has(action.id)
    ));

    if (!lobbyChanged) {
      newResolvedGuesses.forEach((action) => {
        playUiSound(action.payload.correct ? 'skindle-guess-correct' : 'skindle-guess-incorrect');
      });
    }

    guessOutcomeLobbyIdRef.current = view?.lobby.id ?? null;
    guessOutcomeSoundIdsRef.current = currentGuessIds;
  }, [view?.actions, view?.lobby.id]);

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

  useEffect(() => {
    if (!view || view.lobby.status !== 'finished') {
      finishSoundLobbyIdRef.current = null;
      return;
    }

    if (finishSoundLobbyIdRef.current === view.lobby.id) {
      return;
    }

    finishSoundLobbyIdRef.current = view.lobby.id;
    playUiSound(view.requestingPlayer?.result === 'won' ? 'puzzle-complete' : 'timer-expired');
    if (view.requestingPlayer) {
      if (view.requestingPlayer.result === 'won') {
        recordAppWin(`carving-revelation:${view.lobby.id}:${view.requestingPlayer.id}`);
      }
      void submitAchievementEvents([
        {
          event: 'multiplayer_result',
          metadata: {
            gameId: 'carving-revelation',
            result: view.requestingPlayer.result === 'won' ? 'win' : 'loss',
          },
        },
        { event: 'developer_moment', metadata: { gameId: 'carving-revelation', lobbyCode: view.lobby.code } },
      ]);
    }
  }, [view]);

  useEffect(() => {
    if (!view?.lobby.id || !view.lobby.code || !clientId) return undefined;
    const lobbyId = view.lobby.id;
    const lobbyCode = view.lobby.code;
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`carving-revelation-lobby:${lobbyId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'carving_revelation_lobby_events',
        filter: `lobby_id=eq.${lobbyId}`,
      }, (payload) => {
        const event = payload.new as { event_type?: unknown; payload?: unknown };
        if (
          (event.event_type === 'carve_submitted' || event.event_type === 'guess_submitted' || event.event_type === 'next_round_vote') &&
          isCarvingRoutineActionResponse(event.payload)
        ) {
          applyRoutineAction(event.payload);
          return;
        }
        if (realtimeRefreshTimeoutRef.current) window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
          realtimeRefreshTimeoutRef.current = null;
          void refreshLobby(lobbyCode, clientId).catch(() => undefined);
        }, 100);
      });
    subscribeToRealtimeChannel(channel, () => { void refreshLobby(lobbyCode, clientId); });

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [applyRoutineAction, clientId, refreshLobby, view?.lobby.code, view?.lobby.id]);

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
    powerUpsEnabled?: boolean;
    powerUpCount?: number;
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
          powerUpsEnabled: settings.powerUpsEnabled ?? view.lobby.power_ups_enabled,
          powerUpCount: settings.powerUpCount ?? view.lobby.power_up_count,
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
      powerUpsEnabled: draftSettings.powerUpsEnabled,
      powerUpCount: draftSettings.powerUpCount,
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
    playUiSound('random-select');
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
    playUiSound('random-select');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/next-round-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyActionResponse(await readLobbyResponse<CarvingRevelationLobbyView | CarvingRevelationRoutineActionResponse>(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to vote for the next round.');
    } finally {
      setBusy(false);
    }
  };

  const leaveGame = async () => {
    if (!view) return;
    if (!window.confirm('Leave this game permanently? You will not be able to reconnect to this match.')) return;
    playUiSound('timer-expired');
    await leaveCurrentLobby(true);
    router.push('/games');
  };

  const returnToLobby = async () => {
    if (!clientId || !view || !isHost) return;
    playUiSound('random-select');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to return to the lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleBack = async () => {
    if (!view) {
      router.push('/games');
      return;
    }
    if (view.lobby.status === 'active' || view.lobby.status === 'finished') {
      await leaveCurrentLobby(true);
      return;
    }
    router.push('/games');
  };

  const giveUp = async () => {
    if (!clientId || !view) return;
    if (!window.confirm('Give up this match? You will stay connected but cannot keep playing this skin line.')) return;
    playUiSound('timer-expired');
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
    const guessTurn = view.actions.filter((action) => action.action_type === 'guess' && action.player_id === view.requestingPlayer?.id).length + 1;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, guess: guessValue }),
      });
      const actionResponse = await readLobbyResponse<CarvingRevelationLobbyView | CarvingRevelationRoutineActionResponse>(response);
      let submittedAction: CarvingRevelationAction | undefined;
      if (isCarvingRoutineActionResponse(actionResponse)) {
        if (actionResponse.kind === 'submission_status') {
          submittedAction = actionResponse.action;
        }
      } else {
        submittedAction = actionResponse.actions.find((action) => action.action_type === 'guess' && action.player_id === view.requestingPlayer?.id && action.round_number === view.lobby.round_number);
      }
      const guessWasCorrect = submittedAction?.payload.correct === true;
      applyActionResponse(actionResponse);
      if (guessWasCorrect) {
        submitCarvingAchievement('carving_revelation_correct_guess', view.lobby.id, { lobbyCode: view.lobby.code });
        if (guessTurn <= 2) {
          submitCarvingAchievement('carving_revelation_early_correct_guess', view.lobby.id, {
            lobbyCode: view.lobby.code,
            guessTurn,
          });
        }
      }
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
    playUiSound('autocomplete-select');
    await submitGuessValue(guess);
  };

  const handleSuggestionClick = (suggestion: string) => {
    playUiSound('autocomplete-select');
    setGuess(suggestion);
    setSuggestions([]);
    void submitGuessValue(suggestion);
  };

  const submitShape = useCallback(async (points: RevealPoint[]) => {
    if (!clientId || !view || !canCarve) return;
    playUiSound('tile-lock-correct');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, points }),
      });
      const actionResponse = await readLobbyResponse<CarvingRevelationLobbyView | CarvingRevelationRoutineActionResponse>(response);
      const submittedAction = isCarvingRoutineActionResponse(actionResponse)
        ? actionResponse.kind === 'submission_status' ? actionResponse.action : undefined
        : actionResponse.actions.find((action) => (
          action.action_type === 'draw' &&
          action.player_id === view.requestingPlayer?.id &&
          action.round_number === view.lobby.round_number
        ));
      const drawPayload = submittedAction?.payload;
      const claimedPowerUpIds = Array.isArray(drawPayload?.claimedPowerUpIds)
        ? (drawPayload.claimedPowerUpIds as unknown[]).filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const reachedMaximum = typeof drawPayload?.length === 'number'
        && typeof drawPayload.lineLengthLimit === 'number'
        && drawPayload.length >= drawPayload.lineLengthLimit - 0.01;
      if (reachedMaximum) {
        submitCarvingAchievement('carving_revelation_max_line', view.lobby.id, { lobbyCode: view.lobby.code });
      }
      if (claimedPowerUpIds.length > 0) {
        submitCarvingAchievement('carving_revelation_power_up_claimed', view.lobby.id, { lobbyCode: view.lobby.code });
      }
      const conflictedPowerUp = !isCarvingRoutineActionResponse(actionResponse)
        && claimedPowerUpIds.some((powerUpId) => actionResponse.powerUps.some((powerUp) => powerUp.id === powerUpId && powerUp.conflicted));
      if (conflictedPowerUp) {
        submitCarvingAchievement('carving_revelation_power_up_conflict', view.lobby.id, { lobbyCode: view.lobby.code });
      }
      applyActionResponse(actionResponse);
      setConfirmedCarvePath(points);
      setDraftPath([]);
      setIsDrawing(false);
      setDraftLocked(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reveal that area.');
    } finally {
      setBusy(false);
    }
  }, [applyActionResponse, canCarve, clientId, submitCarvingAchievement, view]);

  const activatePowerUp = async (powerUpId: string) => {
    if (!clientId || !view || !activatablePowerUps.some((powerUp) => powerUp.id === powerUpId)) return;
    playUiSound('autocomplete-select');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/power-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, powerUpId }),
      });
      applyView(await readLobbyResponse(response));
      submitCarvingAchievement('carving_revelation_power_up_used', view.lobby.id, { lobbyCode: view.lobby.code });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to use power up.');
    } finally {
      setBusy(false);
    }
    };

  const cancelPowerUp = async (powerUpId: string) => {
    if (!clientId || !view || ![...pendingPowerUpIdsByKind.values()].includes(powerUpId)) return;
    playUiSound('autocomplete-select');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/power-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, powerUpId, cancel: true }),
      });
      applyView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to cancel power up.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!clientId || !view || !canCarve || busy || !view.lobby.phase_deadline_at) return;
    const msRemaining = new Date(view.lobby.phase_deadline_at).getTime() - Date.now();
    if (msRemaining > 1000) return;
    if (hasDoubleLineForCurrentCarve && currentPlayerDrawCount >= 1) return;
    const points = draftPath.length >= 3 ? draftPath : confirmedCarvePath.length >= 3 ? confirmedCarvePath : [];
    if (points.length < 3) return;
    const key = `${view.lobby.id}:${view.lobby.round_number}:${view.requestingPlayer?.id ?? 'unknown'}`;
    if (autoSubmittedCarveKeyRef.current === key) return;
    autoSubmittedCarveKeyRef.current = key;
    void submitShape(points);
  }, [busy, canCarve, clientId, confirmedCarvePath, currentPlayerDrawCount, draftPath, hasDoubleLineForCurrentCarve, phaseRemainingSeconds, submitShape, view]);

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
        'A secret skin line is selected when the host starts the game.',
        'Players carve one reveal area each, then everyone guesses the skin line before the phase ends.',
        'The reveal line limit grows each round until someone finds the answer.',
      ]}
      onBack={handleBack}
      backLabel={view?.lobby.status === 'active' || view?.lobby.status === 'finished' ? 'Back to lobby' : 'Back to games'}
      actions={(
        <>
          {view?.lobby.status === 'finished' ? (
            <>
              {canHostStartNextRound ? (
                <button
                  type="button"
                  onClick={startNextRound}
                  disabled={busy || connectedPlayerCount < 2}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={16} /> Start Next Round
                </button>
              ) : (
                <button
                  type="button"
                  onClick={voteNextRound}
                  disabled={busy || hasVotedForNextRound}
                  title={nextRoundVotePlayers.length > 0 ? nextRoundVotePlayers.map((player) => player.display_name).join(', ') : 'No votes yet'}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={16} /> {hasVotedForNextRound ? 'Voted' : 'Vote Next'} {view.nextRoundVotes.length}/{connectedPlayerCount}
                </button>
              )}
              {isHost ? (
                <button
                  type="button"
                  onClick={returnToLobby}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Return to Lobby
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
            {shouldShowLeaveGame ? (
              <button
                type="button"
                onClick={leaveGame}
                disabled={busy}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-black text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                  <LogOut size={16} /> Leave Game
                </button>
            ) : null}
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
                  clearTransientState();
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
                headerAction={settingsPending ? (
                  <button type="button" disabled={!isHost || busy} onClick={() => void applySettings()} className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                    Apply Settings
                  </button>
                ) : null}
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
                          <SettingDropdown
                            label="Phase Time"
                            value={visibleSettings?.phaseDurationSeconds ?? null}
                            options={PHASE_TIME_OPTIONS}
                            disabled={!isHost || busy}
                            onSelect={(value) => updateDraftSettings((current) => ({ ...current, phaseDurationSeconds: value }))}
                          />
                          <SettingDropdown
                            label="Win Condition"
                            value={visibleSettings?.winCondition ?? 'everyone_correct'}
                            options={WIN_CONDITION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                            disabled={!isHost || busy}
                            onSelect={(value) => updateDraftSettings((current) => ({ ...current, winCondition: value }))}
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <SettingDropdown
                            label="Starting Line Length"
                            value={visibleSettings?.startingLineLengthPercent ?? 8}
                            options={STARTING_LINE_LENGTH_OPTIONS.map((option) => ({ value: option, label: `${option}%` }))}
                            disabled={!isHost || busy}
                            onSelect={(value) => updateDraftSettings((current) => ({ ...current, startingLineLengthPercent: value }))}
                          />
                          <SettingDropdown
                            label="Round Increment"
                            value={visibleSettings?.lineLengthIncrementPercent ?? 2}
                            options={LINE_LENGTH_INCREMENT_OPTIONS.map((option) => ({ value: option, label: `${option}%` }))}
                            disabled={!isHost || busy}
                            onSelect={(value) => updateDraftSettings((current) => ({ ...current, lineLengthIncrementPercent: value }))}
                          />
                        </div>
                      </div>
                    </GameSettingsSection>
                  <GameSettingsSection title="Modifiers" summary={`${visibleSettings?.modifiers.length ?? view.lobby.modifiers.length} active`}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <MultiplayerModifierToggle
                        name="Power Ups"
                        description="Question mark bonuses spawn on the canvas."
                        checked={visibleSettings?.powerUpsEnabled ?? true}
                        disabled={!isHost || busy}
                        onToggle={() => updateDraftSettings((current) => ({ ...current, powerUpsEnabled: !current.powerUpsEnabled }))}
                      />
                      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                        <SettingDropdown
                          label="Power Up Count"
                           value={Math.min(MAX_CARVING_REVELATION_POWER_UP_COUNT, visibleSettings?.powerUpCount ?? 3)}
                          options={POWER_UP_COUNT_OPTIONS.map((option) => ({ value: option, label: String(option) }))}
                          disabled={!isHost || busy || !(visibleSettings?.powerUpsEnabled ?? true)}
                          onSelect={(value) => updateDraftSettings((current) => ({ ...current, powerUpCount: value }))}
                        />
                      </div>
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
    <main className="min-h-[100dvh] bg-slate-950 px-4 py-4 text-white sm:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">{header}</div>
        <div className="grid gap-6">
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(180px,240px)_minmax(280px,420px)] lg:items-stretch lg:justify-between">
              {view.lobby.status === 'active' ? (
                <div className={`flex min-h-24 flex-col justify-center rounded-2xl border px-6 py-4  ${
                  timerIsUrgent
                    ? 'animate-pulse border-red-400/70 bg-red-500/10 '
                    : 'border-amber-300/50 bg-amber-300/10 '
                }`}>
                  <p className={`text-xs font-black uppercase tracking-[0.24em] ${timerIsUrgent ? 'text-red-200' : 'text-amber-300'}`}>Round {view.lobby.round_number}</p>
                  <p className={`text-xs font-black uppercase tracking-[0.26em] ${timerIsUrgent ? 'text-red-100' : 'text-amber-200'}`}>
                    {computedStartCountdownSeconds
                      ? 'Starting'
                      : view.lobby.phase === 'carve' ? 'Carving Phase' : 'Guessing Phase'}
                  </p>
                  <p className={`mt-1 font-mono text-5xl font-black leading-none ${timerIsUrgent ? 'text-red-100' : 'text-white'}`}>
                    {view.lobby.phase_duration_seconds === null && !computedStartCountdownSeconds ? '--' : `0:${displayedRoundTimerSeconds.toString().padStart(2, '0')}`}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-24 flex-col justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-6 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Round {view.lobby.round_number}</p>
                  <h2 className="mt-1 text-xl font-black">
                    {winningPlayers.length > 1
                      ? `${winningPlayers.map((player) => player.display_name).join(', ')} found the skin line`
                      : winner ? `${winner.display_name} found the skin line` : 'Game complete'}
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
                {displayedSkinImageUrl ? <div className={imageModifierClassName} style={imageModifierStyle} /> : null}
                <canvas ref={imageCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] block h-full w-full" />
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 z-10 block h-full w-full touch-none select-none ${canCarve ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerCancel={() => {
                    setIsDrawing(false);
                  }}
                />
                {visiblePowerUps.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0 z-20">
                    {visiblePowerUps.map((powerUp) => {
                      const player = view.players.find((candidate) => candidate.id === powerUp.claimedByPlayerId);
                      const highlightStyle = view.lobby.phase === 'guess' && powerUp.claimedByPlayerId && !powerUp.conflicted && player?.carve_color
                        ? { borderColor: player.carve_color }
                        : view.lobby.phase === 'carve' && previewClaimedPowerUpIds.has(powerUp.id)
                          ? { borderColor: '#34d399' }
                        : undefined;
                      return (
                        <div
                          key={powerUp.id}
                          className={`absolute flex aspect-square items-center justify-center rounded-full border text-2xl font-black leading-none ring-1 ring-slate-950/75 ${getPowerUpClassName(powerUp, view.lobby.phase)}`}
                          style={{
                            left: `${powerUp.x * 100}%`,
                            top: `${powerUp.y * 100}%`,
                            width: `${powerUp.radius * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            ...highlightStyle,
                          }}
                          title={powerUp.conflicted ? 'Contested power up' : powerUp.claimedByPlayerId ? `Claimed ${getPowerUpLabel(powerUp)}` : getPowerUpLabel(powerUp)}
                        >
                          ?
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {acquiredPowerUpNotice ? (
                  <div
                    aria-live="polite"
                    className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950   animate-pulse"
                  >
                    <Sparkles size={16} />
                    <span>Acquired: {acquiredPowerUpNotice.names.join(' + ')}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {view.revealedChampionName ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-violet-100">
                <Sparkles size={18} className="shrink-0 text-violet-200" />
                <p className="text-sm font-semibold">Name Reveal: <span className="font-black">{view.revealedChampionName}</span></p>
              </div>
            ) : null}

            {canCarve ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <p className="text-sm font-semibold text-slate-300">
                  {draftPath.length >= 3
                    ? hasDoubleLineForCurrentCarve && currentPlayerDrawCount >= 1 ? 'Submit your second carve.' : 'Submit your carve.'
                    : hasDoubleLineForCurrentCarve && currentPlayerDrawCount >= 1 ? 'Carve your second area.' : 'Carve an area on the canvas.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={draftPath.length === 0 || busy}
                    onClick={() => {
                      playUiSound('random-select');
                      setDraftPath([]);
                      setConfirmedCarvePath([]);
                      setIsDrawing(false);
                      setDraftLocked(false);
                    }}
                    className="self-end rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    disabled={draftPath.length < 3 || busy}
                    onClick={() => draftPath.length >= 3 ? void submitShape(draftPath) : undefined}
                    className="self-end rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasDoubleLineForCurrentCarve && currentPlayerDrawCount >= 1 ? 'Confirm Second Carve' : 'Confirm Carve'}
                  </button>
                </div>
              </div>
            ) : null}

            {view.lobby.status === 'finished' && view.skin?.answer ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">The skin line was</p>
                <p className="mt-1 text-2xl font-black">{view.skin.answer}</p>
                <p className="mt-3 text-sm font-semibold text-emerald-50/80">
                  Next round votes: {nextRoundVotePlayers.length > 0
                    ? nextRoundVotePlayers.map((player) => player.display_name).join(', ')
                    : 'None yet'}
                </p>
              </div>
            ) : null}

            {shouldShowGuessForm ? (
              <form id="carving-revelation-guess-form" onSubmit={submitGuess} className="relative mt-4 flex flex-col gap-3 sm:flex-row">
                <div ref={guessInputAreaRef} className="relative min-w-0 flex-1">
                  <input
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    onFocus={() => setSuggestions(getGuessSuggestions(guess))}
                    disabled={!canGuess || busy}
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="carving-revelation-guess-suggestions"
                    spellCheck={false}
                    inputMode="search"
                    enterKeyHint="done"
                    aria-label="Carving guess"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300 disabled:opacity-60"
                    placeholder={canGuess ? 'Type the skin line' : skipTurnBlockedByPowerUp ? 'Turn skipped by power up' : view.lobby.phase === 'carve' ? 'Carving phase in progress' : 'Waiting'}
                  />
                  {suggestions.length > 0 && canGuess ? (
                    <div id="carving-revelation-guess-suggestions" role="listbox" className="absolute left-0 top-full z-50 mt-2 grid max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => playUiSound('autocomplete-hover')}
                          onFocus={() => playUiSound('autocomplete-hover')}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="min-h-11 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="submit" disabled={!canGuess || !guess.trim() || busy} className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-violet-400 px-5 py-3 font-black text-white transition hover:bg-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-60 sm:w-auto">
                  <PencilLine size={18} /> Guess
                </button>
                {shouldShowPowerUpControls ? (
                  <CarvingRevelationPowerUpMenu
                    menuRef={powerUpMenuRef}
                    open={powerUpMenuOpen}
                    phase={view.lobby.phase}
                    busy={busy}
                    usablePowerUps={usablePowerUps}
                    pendingPowerUpIdsByKind={pendingPowerUpIdsByKind}
                    onToggle={() => setPowerUpMenuOpen((isOpen) => !isOpen)}
                    onActivate={(powerUpId) => {
                      setPowerUpMenuOpen(false);
                      void activatePowerUp(powerUpId);
                    }}
                    onCancel={(powerUpId) => {
                      setPowerUpMenuOpen(false);
                      void cancelPowerUp(powerUpId);
                    }}
                  />
                ) : null}
              </form>
            ) : null}
            {skipTurnBlockedByPowerUp ? (
              <p className="mt-2 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
                Your guessing turn was skipped by a power up.
              </p>
            ) : null}
          </section>

          <div className="grid gap-5 lg:grid-cols-[3fr_1fr]">
            <MultiplayerLobbyRoster
              players={rosterPlayers}
              canManage={false}
              showHeader={false}
              compactColumns
            />

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-3 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Recent Guesses</p>
              </div>
              <div className={`${feedRounds.length >= 8 ? `max-h-[32rem] overflow-y-auto pr-2 ${THEMED_SCROLLBAR_CLASS}` : ''} space-y-4`}>
                {feedRounds.length > 0 ? feedRounds.map((group) => (
                  <div key={group.roundNumber}>
                    <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <span className="h-px bg-white/10" />
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-500">Round {group.roundNumber}</p>
                      <span className="h-px bg-white/10" />
                    </div>
                    <div className="space-y-3">
                      {group.powerUpMessages.map((powerUpMessage) => {
                        const players = powerUpMessage.playerIds
                          .map((playerId) => view.players.find((candidate) => candidate.id === playerId))
                          .filter((player): player is NonNullable<typeof player> => Boolean(player));
                        return (
                          <div key={powerUpMessage.id} className="rounded-2xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-300">
                            {powerUpMessage.type === 'used' ? (
                              <p>
                                <span className="font-bold" style={players[0]?.carve_color ? { color: players[0].carve_color } : undefined}>
                                  {players[0]?.display_name ?? 'Player'}
                                </span>
                                {` used ${powerUpMessage.powerUpName ?? 'a power up'}`}
                              </p>
                            ) : powerUpMessage.type === 'claimed' ? (
                              <p>
                                <span className="font-bold" style={players[0]?.carve_color ? { color: players[0].carve_color } : undefined}>
                                  {players[0]?.display_name ?? 'Player'}
                                </span>
                                {' claimed a power up'}
                              </p>
                            ) : (
                              <p>
                                {players.map((player, index) => (
                                  <span key={player.id}>
                                    {index > 0 ? ', ' : ''}
                                    <span className="font-bold" style={{ color: player.carve_color }}>{player.display_name}</span>
                                  </span>
                                ))}
                                {' attempted to grab the same power up'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                      {group.guesses.map((action) => {
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
