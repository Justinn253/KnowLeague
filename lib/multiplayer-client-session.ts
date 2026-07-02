'use client';

import { getOrCreateClientId } from '@/lib/game-storage';
import type { MultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';

type ActiveMultiplayerSession = {
  code: string;
  clientId: string;
  status: 'waiting' | 'active' | 'finished' | 'terminated';
  storageKey: string;
  baseUrl: string;
};

type DisconnectHandler = () => void;

type StoredMultiplayerSession = {
  storageKey: string;
  baseUrl: string;
  route: string;
};

export const SKINCOGNITO_LOBBY_STORAGE_KEY = 'knowleague:v1:skincognito:lobby-code';

export function getMultiplayerQuizLobbyStorageKey(gameMode: MultiplayerQuizGameMode) {
  return `knowleague:v1:multiplayer:${gameMode}:lobby-code`;
}

export function disconnectMultiplayerSession(session: ActiveMultiplayerSession) {
  const endpoint = session.status === 'waiting' ? 'leave' : 'heartbeat';
  if (endpoint === 'leave') {
    window.localStorage.removeItem(session.storageKey);
  }

  const body = JSON.stringify({
    clientId: session.clientId,
    ...(endpoint === 'heartbeat' ? { connected: false } : {}),
  });
  const url = `${session.baseUrl}/${session.code}/${endpoint}`;

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
}

export function addMultiplayerDisconnectListeners(disconnect: DisconnectHandler) {
  let disconnected = false;
  const disconnectOnce = () => {
    if (disconnected) return;
    disconnected = true;
    disconnect();
  };
  const disconnectWhenHidden = () => {
    if (document.visibilityState === 'hidden') {
      disconnectOnce();
    }
  };

  window.addEventListener('pagehide', disconnectOnce);
  window.addEventListener('beforeunload', disconnectOnce);
  document.addEventListener('visibilitychange', disconnectWhenHidden);

  return () => {
    window.removeEventListener('pagehide', disconnectOnce);
    window.removeEventListener('beforeunload', disconnectOnce);
    document.removeEventListener('visibilitychange', disconnectWhenHidden);
  };
}

export async function forfeitStoredMultiplayerSessions() {
  if (typeof window === 'undefined') return;

  const clientId = getOrCreateClientId();
  if (!clientId) return;

  const sessions: StoredMultiplayerSession[] = [
    { storageKey: SKINCOGNITO_LOBBY_STORAGE_KEY, baseUrl: '/api/skincognito/lobbies', route: '/skincognito' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('ability_blitz'), baseUrl: '/api/multiplayer/lobbies', route: '/multiplayer/ability-blitz' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('skin_champion'), baseUrl: '/api/multiplayer/lobbies', route: '/multiplayer/skin-champion' },
    { storageKey: 'knowleague:v1:carving-revelation:lobby-code', baseUrl: '/api/carving-revelation/lobbies', route: '/carving-revelation' },
    { storageKey: 'knowleague:v1:category-clash:lobby-code', baseUrl: '/api/category-clash/lobbies', route: '/category-clash' },
  ];

  await Promise.all(sessions.map(async (session) => {
    const code = window.localStorage.getItem(session.storageKey);
    if (!code) return;

    window.localStorage.removeItem(session.storageKey);
    await fetch(`${session.baseUrl}/${code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, forfeit: true }),
      keepalive: true,
    }).catch(() => undefined);
  }));
}

function getStoredMultiplayerSessions(): StoredMultiplayerSession[] {
  return [
    { storageKey: SKINCOGNITO_LOBBY_STORAGE_KEY, baseUrl: '/api/skincognito/lobbies', route: '/skincognito' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('ability_blitz'), baseUrl: '/api/multiplayer/lobbies', route: '/multiplayer/ability-blitz' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('skin_champion'), baseUrl: '/api/multiplayer/lobbies', route: '/multiplayer/skin-champion' },
    { storageKey: 'knowleague:v1:carving-revelation:lobby-code', baseUrl: '/api/carving-revelation/lobbies', route: '/carving-revelation' },
    { storageKey: 'knowleague:v1:category-clash:lobby-code', baseUrl: '/api/category-clash/lobbies', route: '/category-clash' },
  ];
}

function isOnSessionRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

async function readOptionalJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function reconcileStoredMultiplayerSessionsAwayFromGame(pathname: string) {
  if (typeof window === 'undefined') return;

  const clientId = getOrCreateClientId();
  if (!clientId) return;

  await Promise.all(getStoredMultiplayerSessions().map(async (session) => {
    if (isOnSessionRoute(pathname, session.route)) return;

    const code = window.localStorage.getItem(session.storageKey);
    if (!code) return;

    try {
      const rejoinResponse = await fetch(`${session.baseUrl}/${code}/rejoin?clientId=${encodeURIComponent(clientId)}`, {
        cache: 'no-store',
      });
      const eligibility = await readOptionalJson(rejoinResponse);
      if (eligibility.eligible === true) {
        return;
      }

      const lobbyResponse = await fetch(`${session.baseUrl}/${code}?clientId=${encodeURIComponent(clientId)}`, {
        cache: 'no-store',
      });
      if (!lobbyResponse.ok) {
        window.localStorage.removeItem(session.storageKey);
        return;
      }

      const view = await readOptionalJson(lobbyResponse);
      const lobby = view.lobby as { status?: string } | undefined;
      const requestingPlayer = view.requestingPlayer as { connected?: boolean } | null | undefined;
      if (lobby?.status === 'active' && requestingPlayer) {
        window.localStorage.removeItem(session.storageKey);
        await fetch(`${session.baseUrl}/${code}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, forfeit: true }),
          keepalive: true,
        }).catch(() => undefined);
        return;
      }

      if (lobby?.status !== 'waiting') {
        window.localStorage.removeItem(session.storageKey);
      }
    } catch {
      // Keep the pointer if the network is unavailable; the game page will ask the server again.
    }
  }));
}
