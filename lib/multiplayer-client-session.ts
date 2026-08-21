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
  const endpoint = 'leave';
  const forfeit = session.status !== 'waiting';
  window.localStorage.removeItem(session.storageKey);
  const body = JSON.stringify({
    clientId: session.clientId,
    forfeit,
  });
  const url = `${session.baseUrl}/${session.code}/${endpoint}`;

  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
      return;
    }
  } catch {
    // Fall through to keepalive fetch when Beacon is unavailable or rejects the payload.
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
  const disconnectOnPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) {
      disconnectOnce();
    }
  };

  window.addEventListener('pagehide', disconnectOnPageHide);
  window.addEventListener('beforeunload', disconnectOnce);

  return () => {
    window.removeEventListener('pagehide', disconnectOnPageHide);
    window.removeEventListener('beforeunload', disconnectOnce);
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

export async function reconcileStoredMultiplayerSessionsAwayFromGame(pathname: string) {
  if (typeof window === 'undefined') return;

  const clientId = getOrCreateClientId();
  if (!clientId) return;

  await Promise.all(getStoredMultiplayerSessions().map(async (session) => {
    if (isOnSessionRoute(pathname, session.route)) return;

    const code = window.localStorage.getItem(session.storageKey);
    if (!code) return;

    try {
      const response = await fetch(`${session.baseUrl}/${code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, forfeit: true }),
        keepalive: true,
      });
      if (response.ok || response.status === 404) {
        window.localStorage.removeItem(session.storageKey);
      }
    } catch {
      // Keep the pointer so a later route transition can retry the authoritative leave.
    }
  }));
}
