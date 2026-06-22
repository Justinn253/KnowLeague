export type MultiplayerLifecycleMember = {
  id: string;
  connected: boolean;
};

export const MULTIPLAYER_HEARTBEAT_INTERVAL_MS = 15_000;
export const MULTIPLAYER_STALE_AFTER_MS = 45_000;
export const MULTIPLAYER_RECONNECT_GRACE_MS = 60_000;

export function getMultiplayerGuestDisplayName(clientId: string) {
  return `Player ${clientId.slice(-4).toUpperCase()}`;
}

export function getReconnectDeadline(disconnectedAt: string) {
  return new Date(disconnectedAt).getTime() + MULTIPLAYER_RECONNECT_GRACE_MS;
}

export function canReconnect(disconnectedAt: string | null, now = Date.now()) {
  return Boolean(disconnectedAt && now < getReconnectDeadline(disconnectedAt));
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
