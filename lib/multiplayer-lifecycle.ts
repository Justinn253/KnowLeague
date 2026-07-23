export type MultiplayerLifecycleMember = {
  id: string;
  connected: boolean;
};

export type MultiplayerAccountMember = {
  client_id: string;
  auth_user_id: string | null;
};

// Keep the client cadence comfortably below the stale threshold so a delayed
// browser timer does not incorrectly disconnect an active player.
export const MULTIPLAYER_HEARTBEAT_INTERVAL_MS = 25_000;
export const MULTIPLAYER_STALE_AFTER_MS = 90_000;
export const MULTIPLAYER_PRESENCE_WRITE_INTERVAL_MS = 45_000;
export const MULTIPLAYER_RECONNECT_GRACE_MS = 60_000;

export function getMultiplayerGuestDisplayName(clientId: string) {
  return `Player ${clientId.slice(-4).toUpperCase()}`;
}

export function assertMultiplayerAccountAvailable(
  members: MultiplayerAccountMember[],
  authUserId: string | null | undefined,
  clientId: string,
) {
  if (authUserId && members.some((member) => member.auth_user_id === authUserId && member.client_id !== clientId)) {
    throw new Error('This account is already present in the lobby.');
  }
}

export function getReconnectDeadline(disconnectedAt: string) {
  return new Date(disconnectedAt).getTime() + MULTIPLAYER_RECONNECT_GRACE_MS;
}

export function canReconnect(disconnectedAt: string | null, now = Date.now()) {
  return Boolean(disconnectedAt && now < getReconnectDeadline(disconnectedAt));
}

export function shouldUpdateMultiplayerPresence(
  lastSeenAt: string,
  currentConnected: boolean,
  nextConnected: boolean,
  now = Date.now(),
) {
  if (currentConnected !== nextConnected) return true;

  const lastSeenAtMs = new Date(lastSeenAt).getTime();
  return !Number.isFinite(lastSeenAtMs) || now - lastSeenAtMs >= MULTIPLAYER_PRESENCE_WRITE_INTERVAL_MS;
}

export type MultiplayerLifecycleResolution = {
  connectedMemberIds: string[];
  shouldTerminate: boolean;
  hostPlayerId: string | null;
  hostChanged: boolean;
};

/** Members must be supplied in stable lobby join order. */
export function resolveMultiplayerLifecycle(
  members: MultiplayerLifecycleMember[],
  currentHostPlayerId: string | null,
): MultiplayerLifecycleResolution {
  const connectedMembers = members.filter((member) => member.connected);
  const currentHostIsConnected = connectedMembers.some((member) => member.id === currentHostPlayerId);
  const hostPlayerId = currentHostIsConnected ? currentHostPlayerId : connectedMembers[0]?.id ?? null;

  return {
    connectedMemberIds: connectedMembers.map((member) => member.id),
    shouldTerminate: connectedMembers.length === 0,
    hostPlayerId,
    hostChanged: hostPlayerId !== currentHostPlayerId,
  };
}
