import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type MultiplayerQuizGameMode = 'ability_blitz' | 'skin_champion';
export type MultiplayerQuizDifficulty = 'iron' | 'gold' | 'diamond' | 'challenger';

export type MultiplayerQuizLobby = {
  id: string;
  code: string;
  game_mode: MultiplayerQuizGameMode;
  status: 'waiting' | 'terminated';
  host_player_id: string | null;
  difficulty: MultiplayerQuizDifficulty;
  modifiers: string[];
  max_players: number;
  created_at: string;
  updated_at: string;
  terminated_at: string | null;
};

type MultiplayerQuizPlayerRecord = {
  id: string;
  lobby_id: string;
  client_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: 'host' | 'player';
  joined_at: string;
  updated_at: string;
};

export type MultiplayerQuizPublicPlayer = Omit<MultiplayerQuizPlayerRecord, 'client_id'> & {
  is_requesting_player: boolean;
};

export type MultiplayerQuizLobbyView = {
  lobby: MultiplayerQuizLobby;
  requestingPlayer: MultiplayerQuizPublicPlayer | null;
  players: MultiplayerQuizPublicPlayer[];
};

type CreateOrJoinInput = {
  gameMode: MultiplayerQuizGameMode;
  clientId: string;
  displayName: string;
  authUserId?: string | null;
};

const LOBBY_CODE_LENGTH = 6;
const MAX_PLAYERS = 10;
const difficulties = new Set<MultiplayerQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);
const modifierIds: Record<MultiplayerQuizGameMode, Set<string>> = {
  ability_blitz: new Set(['greyscale', 'pixelated', 'rotating', 'disappearing', 'hiddenTimer', 'confirmEntry']),
  skin_champion: new Set(['greyscale', 'blurred', 'cropped', 'hiddenTimer', 'confirmEntry']),
};

function assertSupabaseConfigured() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

export function parseMultiplayerQuizGameMode(value: unknown): MultiplayerQuizGameMode {
  if (value === 'ability_blitz' || value === 'skin_champion') {
    return value;
  }

  throw new Error('Invalid multiplayer game mode.');
}

function sanitizeDisplayName(value: string) {
  return value.trim().slice(0, 16) || 'Player';
}

function generateLobbyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < LOBBY_CODE_LENGTH; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function fetchLobby(code: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle<MultiplayerQuizLobby>();

  if (error) {
    throw error;
  }
  return data;
}

async function fetchPlayers(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })
    .returns<MultiplayerQuizPlayerRecord[]>();

  if (error) {
    throw error;
  }
  return data;
}

async function fetchBannedClientIds(lobbyId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobby_bans')
    .select('client_id')
    .eq('lobby_id', lobbyId)
    .returns<Array<{ client_id: string }>>();
  if (error) {
    throw error;
  }
  return new Set(data.map((ban) => ban.client_id));
}

async function addLobbyEvent(lobbyId: string, eventType: string) {
  const { error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobby_events')
    .insert({ lobby_id: lobbyId, event_type: eventType });
  if (error) {
    throw error;
  }
}

async function getLobbyView(lobby: MultiplayerQuizLobby, clientId?: string | null): Promise<MultiplayerQuizLobbyView> {
  const players = await fetchPlayers(lobby.id);
  const requestingPlayer = players.find((player) => player.client_id === clientId) ?? null;
  const toPublicPlayer = (player: MultiplayerQuizPlayerRecord): MultiplayerQuizPublicPlayer => ({
    id: player.id,
    lobby_id: player.lobby_id,
    auth_user_id: player.auth_user_id,
    display_name: player.display_name,
    role: player.role,
    joined_at: player.joined_at,
    updated_at: player.updated_at,
    is_requesting_player: player.id === requestingPlayer?.id,
  });

  return {
    lobby,
    requestingPlayer: requestingPlayer ? toPublicPlayer(requestingPlayer) : null,
    players: players.map(toPublicPlayer),
  };
}

async function insertPlayer(lobby: MultiplayerQuizLobby, input: CreateOrJoinInput, role: 'host' | 'player') {
  const { data, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .insert({
      lobby_id: lobby.id,
      client_id: input.clientId,
      auth_user_id: input.authUserId ?? null,
      display_name: sanitizeDisplayName(input.displayName),
      role,
    })
    .select('*')
    .single<MultiplayerQuizPlayerRecord>();
  if (error) {
    throw error;
  }
  return data;
}

export async function createMultiplayerQuizLobby(input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: lobby, error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .insert({ code: generateLobbyCode(), game_mode: input.gameMode, max_players: MAX_PLAYERS })
      .select('*')
      .single<MultiplayerQuizLobby>();

    if (error) {
      if (error.code === '23505') {
        continue;
      }
      throw error;
    }

    const host = await insertPlayer(lobby, input, 'host');
    const { data: updatedLobby, error: updateError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ host_player_id: host.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select('*')
      .single<MultiplayerQuizLobby>();
    if (updateError) {
      throw updateError;
    }
    await addLobbyEvent(lobby.id, 'lobby_created');
    return getLobbyView(updatedLobby, input.clientId);
  }

  throw new Error('Unable to generate a unique lobby code.');
}

export async function joinMultiplayerQuizLobby(code: string, input: CreateOrJoinInput) {
  assertSupabaseConfigured();
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'waiting' || lobby.game_mode !== input.gameMode) {
    throw new Error('Lobby not found.');
  }

  const players = await fetchPlayers(lobby.id);
  const bannedClientIds = await fetchBannedClientIds(lobby.id);
  if (bannedClientIds.has(input.clientId)) {
    throw new Error('You cannot rejoin this lobby.');
  }
  const existingPlayer = players.find((player) => player.client_id === input.clientId);
  if (existingPlayer) {
    return getLobbyView(lobby, input.clientId);
  }
  if (players.length >= lobby.max_players) {
    throw new Error('Lobby is full.');
  }

  await insertPlayer(lobby, input, 'player');
  await addLobbyEvent(lobby.id, 'player_joined');
  return getLobbyView(lobby, input.clientId);
}

export async function getMultiplayerQuizLobby(code: string, clientId?: string | null) {
  assertSupabaseConfigured();
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    throw new Error('Lobby not found.');
  }
  return getLobbyView(lobby, clientId);
}

export async function updateMultiplayerQuizDisplayName(code: string, clientId: string, displayName: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const { error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .update({ display_name: sanitizeDisplayName(displayName), updated_at: new Date().toISOString() })
    .eq('lobby_id', lobby.id)
    .eq('client_id', clientId);
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, 'display_name_updated');
  return getLobbyView(lobby, clientId);
}

export async function updateMultiplayerQuizSettings(
  code: string,
  clientId: string,
  difficulty: string,
  modifiers: unknown,
) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const requester = players.find((player) => player.client_id === clientId);
  if (!requester || requester.id !== lobby.host_player_id) {
    throw new Error('Only the host can change lobby settings.');
  }
  if (!difficulties.has(difficulty as MultiplayerQuizDifficulty)) {
    throw new Error('Invalid difficulty.');
  }
  const validModifiers = Array.isArray(modifiers)
    ? [...new Set(modifiers.filter((value): value is string => typeof value === 'string' && modifierIds[lobby.game_mode].has(value)))]
    : [];

  const { data: updatedLobby, error } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({
      difficulty,
      modifiers: validModifiers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (error) {
    throw error;
  }
  await addLobbyEvent(lobby.id, 'settings_updated');
  return getLobbyView(updatedLobby, clientId);
}

export async function leaveMultiplayerQuizLobby(code: string, clientId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status === 'terminated') {
    return { left: true };
  }
  const players = await fetchPlayers(lobby.id);
  const leavingPlayer = players.find((player) => player.client_id === clientId);
  if (!leavingPlayer) {
    return { left: true };
  }
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .delete()
    .eq('id', leavingPlayer.id);
  if (deleteError) {
    throw deleteError;
  }

  const remainingPlayers = players.filter((player) => player.id !== leavingPlayer.id);
  if (remainingPlayers.length === 0) {
    const { error } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lobby.id);
    if (error) {
      throw error;
    }
    return { left: true };
  }

  if (leavingPlayer.id === lobby.host_player_id) {
    const nextHost = remainingPlayers[0];
    const { error: roleError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_players')
      .update({ role: 'host', updated_at: new Date().toISOString() })
      .eq('id', nextHost.id);
    if (roleError) {
      throw roleError;
    }
    const { error: lobbyError } = await getSupabaseServiceClient()
      .from('multiplayer_quiz_lobbies')
      .update({ host_player_id: nextHost.id, updated_at: new Date().toISOString() })
      .eq('id', lobby.id);
    if (lobbyError) {
      throw lobbyError;
    }
  }

  await addLobbyEvent(lobby.id, 'player_left');
  return { left: true };
}

export async function kickMultiplayerQuizPlayer(code: string, clientId: string, targetPlayerId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  const target = players.find((player) => player.id === targetPlayerId);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can kick players.');
  }
  if (!target || target.id === host.id) {
    throw new Error('Invalid kick target.');
  }

  const { error: banError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobby_bans')
    .upsert({ lobby_id: lobby.id, client_id: target.client_id, banned_by_player_id: host.id }, { onConflict: 'lobby_id,client_id' });
  if (banError) {
    throw banError;
  }
  const { error: deleteError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .delete()
    .eq('id', target.id);
  if (deleteError) {
    throw deleteError;
  }
  await addLobbyEvent(lobby.id, 'player_kicked');
  return getLobbyView(lobby, clientId);
}

export async function transferMultiplayerQuizHost(code: string, clientId: string, targetPlayerId: string) {
  const lobby = await fetchLobby(code);
  if (!lobby || lobby.status !== 'waiting') {
    throw new Error('Lobby not found.');
  }
  const players = await fetchPlayers(lobby.id);
  const host = players.find((player) => player.id === lobby.host_player_id);
  const target = players.find((player) => player.id === targetPlayerId);
  if (!host || host.client_id !== clientId) {
    throw new Error('Only the host can transfer host.');
  }
  if (!target || target.id === host.id) {
    throw new Error('Invalid host target.');
  }

  const { error: roleError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_players')
    .upsert([
      { ...host, role: 'player', updated_at: new Date().toISOString() },
      { ...target, role: 'host', updated_at: new Date().toISOString() },
    ]);
  if (roleError) {
    throw roleError;
  }
  const { data: updatedLobby, error: lobbyError } = await getSupabaseServiceClient()
    .from('multiplayer_quiz_lobbies')
    .update({ host_player_id: target.id, updated_at: new Date().toISOString() })
    .eq('id', lobby.id)
    .select('*')
    .single<MultiplayerQuizLobby>();
  if (lobbyError) {
    throw lobbyError;
  }
  await addLobbyEvent(lobby.id, 'host_transferred');
  return getLobbyView(updatedLobby, clientId);
}
