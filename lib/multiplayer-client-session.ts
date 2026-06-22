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

type StoredMultiplayerSession = {
  storageKey: string;
  baseUrl: string;
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

export async function forfeitStoredMultiplayerSessions() {
  if (typeof window === 'undefined') return;

  const clientId = getOrCreateClientId();
  if (!clientId) return;

  const sessions: StoredMultiplayerSession[] = [
    { storageKey: SKINCOGNITO_LOBBY_STORAGE_KEY, baseUrl: '/api/skincognito/lobbies' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('ability_blitz'), baseUrl: '/api/multiplayer/lobbies' },
    { storageKey: getMultiplayerQuizLobbyStorageKey('skin_champion'), baseUrl: '/api/multiplayer/lobbies' },
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
