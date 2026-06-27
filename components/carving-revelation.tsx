'use client';

import { FormEvent, PointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Eye, PencilLine, Play, RefreshCw, Swords, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MultiplayerLobbyRoster } from '@/components/multiplayer-lobby-roster';
import { MultiplayerDisconnectStatus } from '@/components/multiplayer-reconnect';
import { useMultiplayerAuthTransition } from '@/components/use-multiplayer-auth-transition';
import { getOrCreateClientId } from '@/lib/game-storage';
import { disconnectMultiplayerSession } from '@/lib/multiplayer-client-session';
import { MULTIPLAYER_HEARTBEAT_INTERVAL_MS } from '@/lib/multiplayer-lifecycle';
import type { CarvingRevelationAction, CarvingRevelationLobbyView } from '@/lib/carving-revelation';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const STORAGE_KEY = 'knowleague:v1:carving-revelation:lobby-code';
const API_BASE = '/api/carving-revelation/lobbies';

type Stroke = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

async function readLobbyResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Carving Revelation request failed.');
  }
  return data as CarvingRevelationLobbyView;
}

function getDrawPayload(action: CarvingRevelationAction): Stroke | null {
  if (action.action_type !== 'draw') return null;
  const { x1, y1, x2, y2 } = action.payload;
  if (typeof x1 === 'number' && typeof y1 === 'number' && typeof x2 === 'number' && typeof y2 === 'number') {
    return { x1, y1, x2, y2 };
  }
  return null;
}

function constrainStroke(start: Stroke, lineLengthLimit: number): Stroke {
  const dx = start.x2 - start.x1;
  const dy = start.y2 - start.y1;
  const length = Math.hypot(dx, dy);
  if (length <= lineLengthLimit) {
    return start;
  }
  const scale = lineLengthLimit / length;
  return {
    ...start,
    x2: Math.max(0, Math.min(1, start.x1 + dx * scale)),
    y2: Math.max(0, Math.min(1, start.y1 + dy * scale)),
  };
}

function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  imageUrl: string | undefined,
  actions: CarvingRevelationAction[],
  draftStroke: Stroke | null,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return undefined;

    let disposed = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = imageUrl;

    const render = () => {
      if (disposed || !canvas.parentElement) return;
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
      context.drawImage(image, 0, 0, width, height);
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

      actions.forEach((action) => {
        const stroke = getDrawPayload(action);
        if (stroke) drawStroke(stroke);
      });
      if (draftStroke) {
        drawStroke(draftStroke);
      }
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = 'rgba(250, 204, 21, 0.42)';
      context.lineWidth = 2;
      context.strokeRect(1, 1, width - 2, height - 2);
    };

    image.onload = render;
    if (image.complete) render();
    window.addEventListener('resize', render);
    return () => {
      disposed = true;
      window.removeEventListener('resize', render);
    };
  }, [actions, canvasRef, draftStroke, imageUrl]);
}

export function CarvingRevelation() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestSessionRef = useRef<{ code: string; clientId: string; status: CarvingRevelationLobbyView['lobby']['status'] } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [view, setView] = useState<CarvingRevelationLobbyView | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [guess, setGuess] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);

  const isHost = Boolean(view?.requestingPlayer && view.lobby.host_player_id === view.requestingPlayer.id);
  const isMyTurn = Boolean(view?.requestingPlayer && view.currentTurnPlayerId === view.requestingPlayer.id);
  const currentTurnPlayer = view?.players.find((player) => player.id === view.currentTurnPlayerId) ?? null;
  const winner = view?.players.find((player) => player.id === view.lobby.winner_player_id) ?? null;
  const guessActions = useMemo(
    () => view?.actions.filter((action) => action.action_type === 'guess').slice(-8).reverse() ?? [],
    [view?.actions],
  );

  useCanvasRenderer(canvasRef, view?.skin?.imageUrl, view?.actions ?? [], draftStroke);

  const refreshLobby = useCallback(async (code: string, activeClientId: string) => {
    const response = await fetch(`${API_BASE}/${code}?clientId=${encodeURIComponent(activeClientId)}`);
    const nextView = await readLobbyResponse(response);
    setView(nextView);
    window.localStorage.setItem(STORAGE_KEY, nextView.lobby.code);
    return nextView;
  }, []);

  const leaveCurrentLobby = useCallback(async (forfeit = false) => {
    const session = latestSessionRef.current;
    if (!session) return;
    window.localStorage.removeItem(STORAGE_KEY);
    await fetch(`${API_BASE}/${session.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: session.clientId, forfeit }),
      keepalive: true,
    }).catch(() => undefined);
    setView(null);
  }, []);

  useMultiplayerAuthTransition(() => leaveCurrentLobby(true));

  useEffect(() => {
    const nextClientId = getOrCreateClientId();
    if (!nextClientId) {
      setMessage('Browser storage is required for multiplayer lobbies.');
      return;
    }
    setClientId(nextClientId);
    const storedCode = window.localStorage.getItem(STORAGE_KEY);
    if (!storedCode) return;
    void refreshLobby(storedCode, nextClientId).catch(() => {
      window.localStorage.removeItem(STORAGE_KEY);
    });
  }, [refreshLobby]);

  useEffect(() => {
    if (!view || !clientId) {
      latestSessionRef.current = null;
      return;
    }
    latestSessionRef.current = { code: view.lobby.code, clientId, status: view.lobby.status };
  }, [clientId, view]);

  useEffect(() => {
    const session = latestSessionRef.current;
    return () => {
      if (!session) return;
      disconnectMultiplayerSession({
        code: session.code,
        clientId: session.clientId,
        status: session.status,
        storageKey: STORAGE_KEY,
        baseUrl: API_BASE,
      });
    };
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
        setView(await readLobbyResponse(response));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to update lobby presence.');
      }
    };
    const interval = window.setInterval(() => void heartbeat(), MULTIPLAYER_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [clientId, view]);

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
    setMessage('');
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      setView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobby = async (event: FormEvent) => {
    event.preventDefault();
    if (!clientId) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode, clientId }),
      });
      setView(await readLobbyResponse(response));
      setJoinCode('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join lobby.');
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!clientId || !view) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      setView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!clientId || !view || !isMyTurn) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, guess }),
      });
      setView(await readLobbyResponse(response));
      setGuess('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit guess.');
    } finally {
      setBusy(false);
    }
  };

  const submitStroke = async (stroke: Stroke) => {
    if (!clientId || !view || !isMyTurn) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/${view.lobby.code}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...stroke }),
      });
      setView(await readLobbyResponse(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reveal that area.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!view) return;
    await navigator.clipboard.writeText(view.lobby.code).catch(() => undefined);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1200);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isMyTurn || busy || view?.lobby.status !== 'active') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    setDraftStart(point);
    setDraftStroke({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draftStart || !view) return;
    const point = getCanvasPoint(event);
    setDraftStroke(constrainStroke({
      x1: draftStart.x,
      y1: draftStart.y,
      x2: point.x,
      y2: point.y,
    }, view.lineLengthLimit));
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draftStroke) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const stroke = draftStroke;
    setDraftStart(null);
    setDraftStroke(null);
    void submitStroke(stroke);
  };

  const rosterPlayers = view?.players.map((player) => ({
    id: player.id,
    authUserId: player.auth_user_id,
    displayName: player.display_name,
    avatarUrl: player.avatar_url,
    role: player.role,
    isCurrentUser: player.is_requesting_player,
    isHost: player.id === view.lobby.host_player_id,
    status: !player.connected && player.disconnected_at
      ? <MultiplayerDisconnectStatus playerName={player.display_name} disconnectedAt={player.disconnected_at} />
      : player.result === 'won'
        ? <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Winner</span>
        : player.result === 'eliminated'
          ? <span className="text-xs font-black uppercase tracking-[0.12em] text-red-300">Out</span>
          : player.id === view.currentTurnPlayerId
            ? <span className="text-xs font-black uppercase tracking-[0.12em] text-amber-200">Turn</span>
            : null,
  })) ?? [];

  if (!view) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex items-center gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            <button type="button" onClick={() => router.push('/')} className="rounded-2xl border border-white/10 bg-slate-950 p-3 text-slate-200 transition hover:text-white" aria-label="Back to home">
              <ArrowLeft size={22} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
              <h1 className="text-3xl font-black">Carving Revelation</h1>
            </div>
          </header>

          <section className="grid gap-5 md:grid-cols-[1fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
              <div className="mb-6 inline-flex rounded-2xl border border-amber-300/30 bg-amber-300 p-4 text-slate-950">
                <Eye size={28} />
              </div>
              <h2 className="text-2xl font-black">Reveal the shared skin one turn at a time.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                A secret skin starts fully hidden. Players take turns carving one reveal line into the shared canvas or guessing the answer.
                The reveal limit grows each round, and every accepted action is synchronized for the whole lobby.
              </p>
              <button type="button" onClick={createLobby} disabled={busy || !clientId} className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-6 py-3 font-black text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
                <Users size={18} /> Create Lobby
              </button>
            </div>
            <form onSubmit={joinLobby} className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Join Lobby</p>
              <label className="mt-5 block text-sm font-semibold text-slate-300" htmlFor="join-code">Lobby code</label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-lg font-black tracking-[0.2em] text-white outline-none focus:border-amber-300/60"
                maxLength={8}
                placeholder="ABC123"
              />
              <button type="submit" disabled={busy || !clientId || !joinCode.trim()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-5 py-3 font-black text-amber-100 transition hover:bg-amber-300/20 disabled:opacity-60">
                <Play size={18} /> Join Game
              </button>
            </form>
          </section>
          {message ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{message}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => router.push('/')} className="rounded-2xl border border-white/10 bg-slate-950 p-3 text-slate-200 transition hover:text-white" aria-label="Back to home">
              <ArrowLeft size={22} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
              <h1 className="text-2xl font-black">Carving Revelation</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copyCode} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm font-black tracking-[0.16em] text-amber-200">
              <Copy size={16} /> {codeCopied ? 'COPIED' : view.lobby.code}
            </button>
            <button type="button" onClick={() => void leaveCurrentLobby(view.lobby.status === 'active')} className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-400/20">
              Leave
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
            {view.lobby.status === 'waiting' ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-5 text-amber-200">
                  <Swords size={36} />
                </div>
                <h2 className="text-3xl font-black">Waiting for players</h2>
                <p className="mt-3 max-w-xl text-slate-300">Share the lobby code, then the host can start once at least two players are present.</p>
                {isHost ? (
                  <button type="button" onClick={startGame} disabled={busy || view.players.filter((player) => player.connected).length < 2} className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-7 py-3 font-black text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
                    <Play size={18} /> Start Game
                  </button>
                ) : (
                  <p className="mt-8 rounded-2xl border border-white/10 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-300">Waiting for the host to start.</p>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Round {view.lobby.round_number}</p>
                    <h2 className="mt-1 text-xl font-black">
                      {view.lobby.status === 'finished'
                        ? winner ? `${winner.display_name} found the skin` : 'Game complete'
                        : isMyTurn ? 'Your turn to carve or guess' : `${currentTurnPlayer?.display_name ?? 'Next player'} is choosing`}
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
                    Line limit {(view.lineLengthLimit * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
                  <canvas
                    ref={canvasRef}
                    className={`block w-full touch-none ${isMyTurn && view.lobby.status === 'active' ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => {
                      setDraftStart(null);
                      setDraftStroke(null);
                    }}
                  />
                </div>

                {view.lobby.status === 'finished' && view.skin?.answer ? (
                  <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">The skin was</p>
                    <p className="mt-1 text-2xl font-black">{view.skin.answer}</p>
                  </div>
                ) : null}

                <form onSubmit={submitGuess} className="mt-4 flex gap-3">
                  <input
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    disabled={!isMyTurn || view.lobby.status !== 'active' || busy}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-300/60 disabled:opacity-60"
                    placeholder={isMyTurn ? 'Guess the skin' : 'Waiting for your turn'}
                  />
                  <button type="submit" disabled={!isMyTurn || !guess.trim() || busy || view.lobby.status !== 'active'} className="inline-flex items-center gap-2 rounded-2xl bg-violet-400 px-5 py-3 font-black text-white transition hover:bg-violet-300 disabled:opacity-60">
                    <PencilLine size={18} /> Guess
                  </button>
                </form>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <MultiplayerLobbyRoster
              players={rosterPlayers}
              countLabel={`${view.players.filter((player) => player.connected).length}/${view.lobby.max_players}`}
              canManage={false}
            />

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Recent Guesses</p>
                <button type="button" onClick={() => void refreshLobby(view.lobby.code, clientId ?? '')} className="rounded-xl border border-white/10 bg-slate-950 p-2 text-slate-300 transition hover:text-white" aria-label="Refresh lobby">
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="space-y-3">
                {guessActions.length > 0 ? guessActions.map((action) => {
                  const player = view.players.find((candidate) => candidate.id === action.player_id);
                  return (
                    <div key={action.id} className={`rounded-2xl border p-3 ${action.payload.correct ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-white/10 bg-slate-950'}`}>
                      <p className="text-sm font-bold text-white">{player?.display_name ?? 'Player'}</p>
                      <p className="mt-1 text-sm text-slate-300">{String(action.payload.guess ?? '')}</p>
                    </div>
                  );
                }) : (
                  <p className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-400">No guesses yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>

        {message ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{message}</p> : null}
      </div>
    </main>
  );
}
