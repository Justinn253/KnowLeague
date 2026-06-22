import { getSupabaseServiceClient } from '@/lib/supabaseClient';

type ReconnectForfeitExclusions = {
  skincognitoLobbyId?: string;
  multiplayerQuizLobbyId?: string;
};

async function getActiveLobbyIds(table: 'skincognito_lobbies' | 'multiplayer_quiz_lobbies', lobbyIds: string[]) {
  if (lobbyIds.length === 0) return new Set<string>();
  const { data, error } = await getSupabaseServiceClient()
    .from(table)
    .select('id')
    .in('id', lobbyIds)
    .eq('status', 'active')
    .returns<Array<{ id: string }>>();
  if (error) throw error;
  return new Set(data.map((lobby) => lobby.id));
}

/** Starting or joining another lobby permanently forfeits outstanding reconnect windows. */
export async function forfeitOutstandingReconnects(
  clientId: string,
  exclusions: ReconnectForfeitExclusions = {},
) {
  const supabase = getSupabaseServiceClient();
  const [{ data: skincognitoPlayers, error: skincognitoError }, { data: quizPlayers, error: quizError }] = await Promise.all([
    supabase
      .from('skincognito_players')
      .select('id, lobby_id')
      .eq('client_id', clientId)
      .eq('connected', false)
      .not('disconnected_at', 'is', null)
      .returns<Array<{ id: string; lobby_id: string }>>(),
    supabase
      .from('multiplayer_quiz_players')
      .select('id, lobby_id')
      .eq('client_id', clientId)
      .eq('connected', false)
      .eq('result', 'active')
      .not('disconnected_at', 'is', null)
      .returns<Array<{ id: string; lobby_id: string }>>(),
  ]);
  if (skincognitoError) throw skincognitoError;
  if (quizError) throw quizError;

  const activeSkincognitoLobbyIds = await getActiveLobbyIds(
    'skincognito_lobbies',
    [...new Set(skincognitoPlayers.map((player) => player.lobby_id))],
  );
  const activeQuizLobbyIds = await getActiveLobbyIds(
    'multiplayer_quiz_lobbies',
    [...new Set(quizPlayers.map((player) => player.lobby_id))],
  );
  const forfeitedSkincognitoPlayers = skincognitoPlayers.filter((player) => (
    activeSkincognitoLobbyIds.has(player.lobby_id) && player.lobby_id !== exclusions.skincognitoLobbyId
  ));
  const forfeitedQuizPlayers = quizPlayers.filter((player) => (
    activeQuizLobbyIds.has(player.lobby_id) && player.lobby_id !== exclusions.multiplayerQuizLobbyId
  ));
  const now = new Date().toISOString();

  if (forfeitedSkincognitoPlayers.length > 0) {
    const { error } = await supabase
      .from('skincognito_players')
      .update({ disconnected_at: '1970-01-01T00:00:00.000Z' })
      .in('id', forfeitedSkincognitoPlayers.map((player) => player.id));
    if (error) throw error;
    const { error: eventError } = await supabase.from('skincognito_lobby_events').insert(
      [...new Set(forfeitedSkincognitoPlayers.map((player) => player.lobby_id))]
        .map((lobbyId) => ({ lobby_id: lobbyId, event_type: 'reconnect_forfeited' })),
    );
    if (eventError) throw eventError;
  }

  if (forfeitedQuizPlayers.length > 0) {
    const { error } = await supabase
      .from('multiplayer_quiz_players')
      .update({ disconnected_at: '1970-01-01T00:00:00.000Z', updated_at: now })
      .in('id', forfeitedQuizPlayers.map((player) => player.id));
    if (error) throw error;
    const { error: eventError } = await supabase.from('multiplayer_quiz_lobby_events').insert(
      [...new Set(forfeitedQuizPlayers.map((player) => player.lobby_id))]
        .map((lobbyId) => ({ lobby_id: lobbyId, event_type: 'reconnect_forfeited' })),
    );
    if (eventError) throw eventError;
  }
}
