import { getMultiplayerGuestDisplayName, MULTIPLAYER_STALE_AFTER_MS } from '@/lib/multiplayer-lifecycle';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const MULTIPLAYER_LOBBY_CODE_LENGTH = 6;
export const MULTIPLAYER_LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MULTIPLAYER_MAX_LOBBY_PLAYERS = 10;

type MultiplayerIdentityInput = {
  clientId: string;
  authUserId?: string | null;
};

type MultiplayerAccountMember = {
  client_id: string;
  auth_user_id: string | null;
};

type MultiplayerPresenceMember = {
  connected: boolean;
  last_seen_at: string;
};

type MultiplayerHostMember = {
  id: string;
  client_id: string;
};

type MultiplayerLobbyEventTable =
  | 'multiplayer_quiz_lobby_events'
  | 'skincognito_lobby_events'
  | 'carving_revelation_lobby_events';

export function assertSupabaseConfigured() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

export function normalizeLobbyCode(code: string) {
  return code.trim().toUpperCase();
}

export function generateMultiplayerLobbyCode(length = MULTIPLAYER_LOBBY_CODE_LENGTH) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += MULTIPLAYER_LOBBY_CODE_ALPHABET[Math.floor(Math.random() * MULTIPLAYER_LOBBY_CODE_ALPHABET.length)];
  }
  return code;
}

export function sanitizeMultiplayerDisplayName(displayName: string) {
  return displayName.trim().slice(0, 16) || 'Player';
}

export async function resolveMultiplayerDisplayName(input: MultiplayerIdentityInput) {
  let displayName = getMultiplayerGuestDisplayName(input.clientId);
  if (input.authUserId) {
    const { data: profile } = await getSupabaseServiceClient()
      .from('profiles')
      .select('username, display_name')
      .eq('id', input.authUserId)
      .maybeSingle<{ username: string; display_name: string }>();
    displayName = profile?.display_name || profile?.username || displayName;
  }
  return sanitizeMultiplayerDisplayName(displayName);
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

export function assertMultiplayerHost<TPlayer extends MultiplayerHostMember>(
  players: TPlayer[],
  hostPlayerId: string | null,
  clientId: string,
  message: string,
) {
  const host = players.find((player) => player.id === hostPlayerId);
  if (!host || host.client_id !== clientId) {
    throw new Error(message);
  }
  return host;
}

export function isMultiplayerPresenceFresh(member: MultiplayerPresenceMember, nowMs = Date.now()) {
  return member.connected && nowMs - new Date(member.last_seen_at).getTime() <= MULTIPLAYER_STALE_AFTER_MS;
}

export function getFreshConnectedMembers<TMember extends MultiplayerPresenceMember>(members: TMember[], nowMs = Date.now()) {
  return members.filter((member) => isMultiplayerPresenceFresh(member, nowMs));
}

export function getStaleConnectedMembers<TMember extends MultiplayerPresenceMember>(members: TMember[], nowMs = Date.now()) {
  return members.filter((member) => (
    member.connected && nowMs - new Date(member.last_seen_at).getTime() > MULTIPLAYER_STALE_AFTER_MS
  ));
}

export async function addMultiplayerLobbyEvent(
  table: MultiplayerLobbyEventTable,
  lobbyId: string,
  eventType: string,
) {
  const { error } = await getSupabaseServiceClient()
    .from(table)
    .insert({ lobby_id: lobbyId, event_type: eventType });
  if (error) {
    throw error;
  }
}

export async function addMultiplayerLobbyEvents(
  table: MultiplayerLobbyEventTable,
  lobbyIds: string[],
  eventType: string,
) {
  const uniqueLobbyIds = [...new Set(lobbyIds)];
  if (uniqueLobbyIds.length === 0) return;

  const { error } = await getSupabaseServiceClient()
    .from(table)
    .insert(uniqueLobbyIds.map((lobbyId) => ({ lobby_id: lobbyId, event_type: eventType })));
  if (error) {
    throw error;
  }
}
