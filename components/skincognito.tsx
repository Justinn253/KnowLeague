'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Play, Search, UserCheck, UserX, Users } from 'lucide-react';
import Image from 'next/image';
import { getOrCreateClientId, loadPlayerDisplayName, savePlayerDisplayName } from '@/lib/game-storage';
import { normalizeAnswer } from '@/lib/quiz';
import type { SkincognitoLobbyView } from '@/lib/skincognito';

type SkinAnswer = {
  id: string;
  label: string;
  imageUrl: string;
};

type SkincognitoAnswers = {
  skin: SkinAnswer[];
};

const LOBBY_STORAGE_KEY = 'knowleague:v1:skincognito:lobby-code';

function getLobbyStatusLabel(view: SkincognitoLobbyView | null) {
  if (!view) {
    return 'Create or join a lobby';
  }

  if (view.lobby.status === 'waiting') {
    return `Lobby ${view.lobby.code}`;
  }

  if (view.lobby.status === 'active') {
    return 'Game in progress';
  }

  if (view.lobby.status === 'finished') {
    return 'Game finished';
  }

  return 'Lobby closed';
}

export function Skincognito() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('Player');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyView, setLobbyView] = useState<SkincognitoLobbyView | null>(null);
  const [skinAnswers, setSkinAnswers] = useState<SkinAnswer[]>([]);
  const [skinQuery, setSkinQuery] = useState('');
  const [selectedSkin, setSelectedSkin] = useState<SkinAnswer | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const skinSearchRef = useRef<HTMLDivElement>(null);
  const nameDraftDirtyRef = useRef(false);
  const skinQueryDirtyRef = useRef(false);
  const hasRequestingPlayerRef = useRef(false);

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
  const suggestions = useMemo(() => {
    const query = normalizeAnswer(skinQuery);
    if (query.length < 2 || selectedSkin?.label === skinQuery) {
      return [];
    }

    return skinAnswers
      .filter((skin) => normalizeAnswer(skin.label).includes(query))
      .slice(0, 12);
  }, [selectedSkin?.label, skinAnswers, skinQuery]);

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

  useEffect(() => {
    const nextClientId = getOrCreateClientId();
    setClientId(nextClientId);
    const fallbackName = nextClientId ? `Player ${nextClientId.slice(-4).toUpperCase()}` : 'Player';
    const storedName = loadPlayerDisplayName(fallbackName);
    setDisplayName(storedName);

    fetch('/api/skincognito/answers')
      .then((response) => response.json())
      .then((data: SkincognitoAnswers) => setSkinAnswers(data.skin ?? []))
      .catch((error) => {
        console.error('Failed to load Skincognito skin answers', error);
        setMessage('Unable to load skin search data.');
      });

    const urlCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '';
    const savedCode = window.localStorage.getItem(LOBBY_STORAGE_KEY) ?? '';
    const reconnectCode = urlCode || savedCode;
    if (nextClientId && reconnectCode) {
      setJoinCode(reconnectCode);
      fetch(`/api/skincognito/lobbies/${reconnectCode}?clientId=${nextClientId}`)
        .then((response) => response.json())
        .then((data) => {
          if (!data.error && data.requestingPlayer) {
            updateLobbyView(data);
            return;
          }

          if (!data.error && urlCode) {
            fetch('/api/skincognito/lobbies/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: urlCode,
                clientId: nextClientId,
                displayName: storedName,
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
    if (!lobbyView?.lobby.code || !clientId || lobbyView.lobby.status === 'terminated') {
      return;
    }

    const code = lobbyView.lobby.code;
    const interval = window.setInterval(() => {
      fetch(`/api/skincognito/lobbies/${code}?clientId=${clientId}`)
        .then((response) => response.json())
        .then((data) => {
          if (!data.error && data.requestingPlayer) {
            updateLobbyView(data);
          } else if (!data.error) {
            window.localStorage.removeItem(LOBBY_STORAGE_KEY);
            setLobbyView(null);
            setMessage('You are no longer in this lobby.');
          }
        })
        .catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [clientId, lobbyView?.lobby.code, lobbyView?.lobby.status, updateLobbyView]);

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
    const interval = window.setInterval(sendHeartbeat, 5000);
    return () => window.clearInterval(interval);
  }, [clientId, lobbyView?.lobby.code]);

  const createLobby = () => {
    if (!clientId) {
      return;
    }

    void requestLobby('/api/skincognito/lobbies', {
      clientId,
      displayName,
      selectedSkinId: selectedSkin?.id ?? null,
    });
  };

  const joinLobby = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId) {
      return;
    }

    void requestLobby('/api/skincognito/lobbies/join', {
      code: joinCode.trim().toUpperCase(),
      clientId,
      displayName,
      selectedSkinId: selectedSkin?.id ?? null,
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
    if (clientId && lobbyView) {
      await requestLobby(`/api/skincognito/lobbies/${lobbyView.lobby.code}/leave`, { clientId });
    }

    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
    window.location.href = '/';
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10 lg:px-12">
        <header className="relative z-30 flex flex-col gap-5 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
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
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Game mode</p>
              <h1 className="text-xl font-semibold text-white">Skincognito</h1>
              <p className="mt-1 text-xs text-slate-400">{getLobbyStatusLabel(lobbyView)}</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
            <Users size={16} className="text-amber-300" />
            Lobby
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
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
          ) : (
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
          )}

          {message ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-300">
              {message}
            </p>
          ) : null}

          {lobbyView ? (
            <div className="mt-8 border-t border-white/10 pt-8">
              <form onSubmit={updateDisplayName} className="mb-5 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-2">
                  <label htmlFor="display-name" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      nameDraftDirtyRef.current = true;
                    }}
                    maxLength={24}
                    className="min-h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                  />
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
                <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lobby</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">
                        {activePlayers.length}/2 Players - {spectatorCount}/8 Spectators
                      </h3>
                    </div>
                    <Users size={20} className="text-amber-300" />
                  </div>

                  <div className="mt-5 grid gap-2">
                    {lobbyView.players.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {player.display_name}
                            {player.is_requesting_player ? ' (you)' : ''}
                          </p>
                          <p className="mt-1 text-xs capitalize text-slate-500">
                            {player.role}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isHost && player.role === 'spectator' && lobbyView.lobby.status === 'waiting' ? (
                            <span className="group relative inline-flex">
                              <button
                                type="button"
                                onClick={() => promoteSpectator(player.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 transition hover:bg-emerald-500/20"
                                aria-label={`Make ${player.display_name} a player`}
                              >
                                <UserCheck size={14} />
                              </button>
                              <span className="pointer-events-none absolute right-0 top-10 z-50 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
                                Make player
                              </span>
                            </span>
                          ) : null}
                          {isHost && !player.is_requesting_player && lobbyView.lobby.status === 'waiting' ? (
                            <span className="group relative inline-flex">
                              <button
                                type="button"
                                onClick={() => kickPlayer(player.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                                aria-label={`Kick ${player.display_name}`}
                              >
                                <UserX size={14} />
                              </button>
                              <span className="pointer-events-none absolute right-0 top-10 z-50 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
                                Kick
                              </span>
                            </span>
                          ) : null}
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
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your skin</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {requestingPlayer?.role === 'spectator' ? 'Spectating' : 'Choose your hidden answer'}
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
                  {lobbyView.lobby.status === 'active' ? 'Game Started' : 'Start Game'}
                </button>
              </div>

              {!canStart && lobbyView.lobby.status === 'waiting' ? (
                <p className="mt-3 text-center text-xs text-slate-500">
                  The host can start once two active players have selected skins.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
