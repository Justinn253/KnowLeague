import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  type AchievementEventName,
  type AchievementEventResult,
  type AchievementListItem,
  maskAchievement,
} from '@/lib/achievements';
import { DEFAULT_CHAT_BORDER, DEFAULT_CHAT_COLOR } from '@/lib/chat-colors';
import { getDailySkindleTarget } from '@/lib/skindle-daily';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

type AchievementRow = {
  user_id: string;
  achievement_id: string;
  progress_current: number;
  progress_target: number;
  completed_at: string | null;
  updated_at: string | null;
};

type CompletedAchievementRow = {
  user_id: string;
  achievement_id: string;
  completed_at: string;
};

type MatchPlayer = {
  id: string;
  auth_user_id: string | null;
  role?: string;
  result?: string;
};

type MatchContext = {
  gameId: string;
  lobbyId: string;
  status: string;
  player: MatchPlayer;
  players: MatchPlayer[];
  winnerPlayerId: string | null;
};

type JsonRecord = Record<string, unknown>;

function isMissingAchievementsTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (
    maybeError.code === '42P01' ||
    maybeError.code === 'PGRST205' ||
    text.includes("could not find the table 'public.user_achievements'") ||
    text.includes('relation "public.user_achievements" does not exist')
  );
}

function getDailySkindleTargetId() {
  return getDailySkindleTarget()?.id ?? null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Achievement metadata '${key}' is required.`);
  }
  return value.trim();
}

function getMatchGameId(metadata: Record<string, unknown> | undefined) {
  const gameId = getMetadataString(metadata, 'gameId');
  const validGameIds = new Set([
    'skincognito',
    'carving-revelation',
    'category-clash',
  ]);
  if (!validGameIds.has(gameId)) {
    throw new Error('Invalid multiplayer game identifier.');
  }
  return gameId;
}

function getLobbyCode(metadata: Record<string, unknown> | undefined) {
  const code = getMetadataString(metadata, 'lobbyCode').toUpperCase();
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
    throw new Error('Invalid multiplayer lobby code.');
  }
  return code;
}

async function getCompletedRows() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('user_achievements')
    .select('user_id, achievement_id, completed_at')
    .not('completed_at', 'is', null)
    .returns<CompletedAchievementRow[]>();

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
  return data ?? [];
}

export async function getUserAchievements(
  userId: string,
  options: { includeGlobalStats?: boolean } = {},
): Promise<AchievementListItem[]> {
  const supabase = getSupabaseServiceClient();
  const includeGlobalStats = options.includeGlobalStats ?? true;
  const rowsPromise = supabase
    .from('user_achievements')
    .select('user_id, achievement_id, progress_current, progress_target, completed_at, updated_at')
    .eq('user_id', userId)
    .returns<AchievementRow[]>();
  const [
    { data: rows, error },
    completedRows,
    profileCountResult,
  ] = await Promise.all([
    rowsPromise,
    includeGlobalStats ? getCompletedRows() : Promise.resolve<CompletedAchievementRow[]>([]),
    includeGlobalStats
      ? supabase.from('profiles').select('id', { count: 'exact', head: true })
      : Promise.resolve({ data: null, error: null, count: null }),
  ]);

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
  if (profileCountResult.error) throw profileCountResult.error;
  const totalProfiles = Math.max(profileCountResult.count ?? 1, 1);

  const rowsById = new Map((rows ?? []).map((row) => [row.achievement_id, row]));
  const completedByAchievement = new Map<string, CompletedAchievementRow[]>();
  completedRows.forEach((row) => {
    const current = completedByAchievement.get(row.achievement_id) ?? [];
    current.push(row);
    completedByAchievement.set(row.achievement_id, current);
  });

  completedByAchievement.forEach((achievementRows) => {
    achievementRows.sort((left, right) => new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime());
  });

  return ACHIEVEMENTS.map((achievement) => {
    const row = rowsById.get(achievement.id);
    const completedAt = row?.completed_at ?? null;
    const globalRows = completedByAchievement.get(achievement.id) ?? [];
    const completionIndex = completedAt
      ? globalRows.findIndex((candidate) => candidate.user_id === userId)
      : -1;
    const completionRank = completionIndex >= 0 ? completionIndex + 1 : null;
    const topPercent = completionRank
      ? Math.max(0.1, Math.min(100, Math.round((completionRank / totalProfiles) * 1000) / 10))
      : null;
    const masked = maskAchievement(achievement, completedAt);

    return {
      ...achievement,
      progressCurrent: row?.progress_current ?? 0,
      progressTarget: row?.progress_target ?? achievement.target,
      completedAt,
      updatedAt: row?.updated_at ?? null,
      globalCompletedCount: globalRows.length,
      completionRank,
      topPercent,
      ...masked,
    };
  });
}

async function upsertProgress(userId: string, achievementId: string, progressCurrent: number) {
  const achievement = ACHIEVEMENT_BY_ID.get(achievementId);
  if (!achievement) {
    throw new Error('Unknown achievement.');
  }

  const now = new Date().toISOString();
  const completed = progressCurrent >= achievement.target;
  const supabase = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from('user_achievements')
    .select('user_id, achievement_id, progress_current, progress_target, completed_at, updated_at')
    .eq('user_id', userId)
    .eq('achievement_id', achievementId)
    .maybeSingle<AchievementRow>();

  if (isMissingAchievementsTableError(existingError)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (existingError) throw existingError;

  const nextProgress = Math.max(existing?.progress_current ?? 0, Math.min(progressCurrent, achievement.target));
  const { error } = await supabase
    .from('user_achievements')
    .upsert({
      user_id: userId,
      achievement_id: achievementId,
      progress_current: nextProgress,
      progress_target: achievement.target,
      completed_at: existing?.completed_at ?? (completed ? now : null),
      updated_at: now,
    }, { onConflict: 'user_id,achievement_id' });

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
}

async function getMatchContext(userId: string, gameId: string, lobbyCode: string): Promise<MatchContext> {
  const supabase = getSupabaseServiceClient();

  const tableByGame: Record<string, string> = {
    skincognito: 'skincognito_lobbies',
    'carving-revelation': 'carving_revelation_lobbies',
    'category-clash': 'category_clash_lobbies',
  };
  const playerTableByGame: Record<string, string> = {
    skincognito: 'skincognito_players',
    'carving-revelation': 'carving_revelation_players',
    'category-clash': 'category_clash_players',
  };
  const table = tableByGame[gameId];
  const playerTable = playerTableByGame[gameId];
  const { data: lobby, error: lobbyError } = await supabase
    .from(table)
    .select('id, status, winner_player_id')
    .eq('code', lobbyCode)
    .maybeSingle<{ id: string; status: string; winner_player_id: string | null }>();
  if (lobbyError) throw lobbyError;
  if (!lobby) throw new Error('Multiplayer match could not be verified.');

  const { data: players, error: playersError } = await supabase
    .from(playerTable)
    .select('id, auth_user_id, role, result')
    .eq('lobby_id', lobby.id)
    .returns<MatchPlayer[]>();
  if (playersError) throw playersError;
  const player = (players ?? []).find((candidate) => candidate.auth_user_id === userId);
  if (!player) throw new Error('You were not a player in this match.');
  return { gameId, lobbyId: lobby.id, status: lobby.status, player, players: players ?? [], winnerPlayerId: lobby.winner_player_id };
}

async function getSkincognitoActions(lobbyId: string, playerId?: string) {
  let query = getSupabaseServiceClient()
    .from('skincognito_actions')
    .select('id, player_id, action_type, category_id, is_correct, created_at')
    .eq('lobby_id', lobbyId);
  if (playerId) query = query.eq('player_id', playerId);
  const { data, error } = await query.order('created_at', { ascending: true }).returns<Array<{
    id: string;
    player_id: string;
    action_type: string;
    category_id: string | null;
    is_correct: boolean;
    created_at: string;
  }>>();
  if (error) throw error;
  return data ?? [];
}

async function getCarvingContext(userId: string, metadata: Record<string, unknown> | undefined) {
  const context = await getMatchContext(userId, 'carving-revelation', getLobbyCode(metadata));
  const { data, error } = await getSupabaseServiceClient()
    .from('carving_revelation_actions')
    .select('id, player_id, action_type, round_number, payload, created_at')
    .eq('lobby_id', context.lobbyId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .returns<Array<{
      id: number;
      player_id: string | null;
      action_type: string;
      round_number: number;
      payload: unknown;
      created_at: string;
    }>>();
  if (error) throw error;
  return { context, actions: data ?? [] };
}

async function assertEventIsValid(userId: string, event: AchievementEventName, metadata?: Record<string, unknown>) {
  if (event === 'first_login') return 'first_login';

  if (event === 'discord_linked') {
    const { data, error } = await getSupabaseServiceClient()
      .from('profile_private_details')
      .select('discord_username')
      .eq('user_id', userId)
      .maybeSingle<{ discord_username: string | null }>();
    if (error) throw error;
    if (!data?.discord_username) {
      throw new Error('Discord must be linked before this achievement can be completed.');
    }
    return 'discord_linked';
  }

  if (event === 'daily_skindle_completed') {
    const solvedSkinId = typeof metadata?.skinId === 'string' ? metadata.skinId : '';
    const targetId = getDailySkindleTargetId();
    if (!targetId || solvedSkinId !== targetId) {
      throw new Error('Daily Skindle completion could not be verified.');
    }
    return 'daily_skindle_complete';
  }

  if (event === 'developer_moment') {
    const gameId = getMatchGameId(metadata);
    const context = await getMatchContext(userId, gameId, getLobbyCode(metadata));
    if (context.status !== 'finished') {
      throw new Error('The multiplayer match is not finished.');
    }

    const profileIds = context.players
      .map((player) => player.auth_user_id)
      .filter((id): id is string => Boolean(id));
    const { data: profiles, error } = await getSupabaseServiceClient()
      .from('profiles')
      .select('id, username')
      .in('id', profileIds)
      .returns<Array<{ id: string; username: string }>>();
    if (error) throw error;
    if (!(profiles ?? []).some((profile) => profile.username.trim().toLowerCase() === 'justin')) {
      throw new Error('The developer was not verified as a participant in this match.');
    }
    return 'developer_moment';
  }

  if (event === 'skincognito_skin_guessed' || event === 'skincognito_clean_sweep' || event === 'skincognito_random_skin') {
    const context = await getMatchContext(userId, 'skincognito', getLobbyCode(metadata));
    if (context.player.role === 'spectator') throw new Error('Spectators cannot earn Skincognito achievements.');
    if (event === 'skincognito_random_skin') {
      const { data: events, error } = await getSupabaseServiceClient()
        .from('skincognito_lobby_events')
        .select('payload')
        .eq('lobby_id', context.lobbyId)
        .eq('event_type', 'game_started')
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<Array<{ payload: unknown }>>();
      if (error) throw error;
      const payload = events?.[0]?.payload;
      const randomPlayerIds = isRecord(payload) && Array.isArray(payload.randomPlayerIds)
        ? payload.randomPlayerIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (!randomPlayerIds.includes(context.player.id)) {
        throw new Error('A random Skincognito skin was not verified.');
      }
      return 'skincognito_d';
    }

    const actions = await getSkincognitoActions(context.lobbyId, context.player.id);
    const correctSkinGuess = actions.some((action) => action.action_type === 'skin_guess' && action.is_correct);
    if (!correctSkinGuess) throw new Error('A correct Skincognito skin guess was not verified.');
    if (event === 'skincognito_skin_guessed') return 'deduced';

    const requiredCategories = ['champion', 'skinLine', 'releaseYear', 'rarity', 'gender', 'role', 'race'];
    if (!requiredCategories.every((categoryId) => actions.some((action) => action.action_type === 'category_guess' && action.category_id === categoryId && action.is_correct))) {
      throw new Error('Every Skincognito category must be guessed correctly first.');
    }
    return 'clean_sweep';
  }

  if (event.startsWith('carving_revelation_')) {
    const { context, actions } = await getCarvingContext(userId, metadata);
    const playerActions = actions.filter((action) => action.player_id === context.player.id);
    if (event === 'carving_revelation_correct_guess' || event === 'carving_revelation_max_line' || event === 'carving_revelation_power_up_claimed' || event === 'carving_revelation_power_up_conflict') {
      if (event === 'carving_revelation_correct_guess') {
        const correctGuesses = actions.filter((action) => action.action_type === 'guess' && isRecord(action.payload) && action.payload.correct === true);
        if (!correctGuesses.some((action) => action.player_id === context.player.id)) throw new Error('A correct Carving Revelation guess was not verified.');
        const firstCorrect = correctGuesses[0];
        if (!firstCorrect || firstCorrect.player_id !== context.player.id) throw new Error('This player was not first to guess correctly.');
        return 'carver';
      }
      if (event === 'carving_revelation_max_line') {
        const reachedMaximum = playerActions.some((action) => {
          if (action.action_type !== 'draw' || !isRecord(action.payload)) return false;
          const length = action.payload.length;
          const limit = action.payload.lineLengthLimit;
          return typeof length === 'number' && Number.isFinite(length) && typeof limit === 'number' && Number.isFinite(limit) && length >= limit - 0.01;
        });
        if (!reachedMaximum) throw new Error('The maximum Carving Revelation line length was not verified.');
        return 'what_is_this';
      }
      const drawActions = playerActions.filter((action) => action.action_type === 'draw');
      if (event === 'carving_revelation_power_up_claimed') {
        if (!drawActions.some((action) => isRecord(action.payload) && Array.isArray(action.payload.claimedPowerUpIds) && action.payload.claimedPowerUpIds.some((id) => typeof id === 'string'))) {
          throw new Error('A carved power-up was not verified.');
        }
        return 'powered_up';
      }
      const claimedByRoundAndPowerUp = new Map<string, Set<string>>();
      actions.filter((action) => action.action_type === 'draw' && isRecord(action.payload)).forEach((action) => {
        const payload = isRecord(action.payload) ? action.payload : null;
        const ids: unknown[] = payload && Array.isArray(payload.claimedPowerUpIds) ? payload.claimedPowerUpIds : [];
        ids.filter((id): id is string => typeof id === 'string').forEach((powerUpId) => {
          const key = `${action.round_number}:${powerUpId}`;
          const players = claimedByRoundAndPowerUp.get(key) ?? new Set<string>();
          if (action.player_id) players.add(action.player_id);
          claimedByRoundAndPowerUp.set(key, players);
        });
      });
      if (![...claimedByRoundAndPowerUp.values()].some((players) => players.has(context.player.id) && players.size > 1)) {
        throw new Error('A contested Carving Revelation power-up was not verified.');
      }
      return 'really_dude';
    }
    if (event === 'carving_revelation_power_up_used') {
      if (!playerActions.some((action) => action.action_type === 'power_up')) throw new Error('A used Carving Revelation power-up was not verified.');
      return 'activate';
    }
  }

  if (event === 'category_clash_last_standing' || event === 'category_clash_shared_answer') {
    const context = await getMatchContext(userId, 'category-clash', getLobbyCode(metadata));
    if (context.status !== 'finished') throw new Error('The Category Clash match is not finished.');
    if (event === 'category_clash_last_standing') {
      if (context.player.result !== 'won' && context.winnerPlayerId !== context.player.id) throw new Error('Last standing was not verified.');
      return 'unending_knowledge';
    }
    const { data: submissions, error } = await getSupabaseServiceClient()
      .from('category_clash_submissions')
      .select('player_id, round_number, turn_sequence, category_id, answer_id, correct')
      .eq('lobby_id', context.lobbyId)
      .returns<Array<{ player_id: string | null; round_number: number; turn_sequence: number; category_id: string; answer_id: string | null; correct: boolean | null }>>();
    if (error) throw error;
    if (context.players.length < 2) throw new Error('Shared Brain Cell requires multiple players.');
    const playerIds = new Set(context.players.map((player) => player.id));
    const groups = new Map<string, typeof submissions>();
    (submissions ?? []).forEach((submission) => {
      const key = `${submission.round_number}:${submission.turn_sequence}:${submission.category_id}`;
      const group = groups.get(key) ?? [];
      group.push(submission);
      groups.set(key, group);
    });
    const sharedAnswer = [...groups.values()].some((group) => {
      const valid = group.filter((submission) => submission.player_id && submission.correct === true && submission.answer_id);
      return new Set(valid.map((submission) => submission.player_id)).size === playerIds.size
        && valid.length === playerIds.size
        && valid.every((submission) => submission.answer_id === valid[0]?.answer_id);
    });
    if (!sharedAnswer) throw new Error('A shared Category Clash answer was not verified.');
    return 'shared_brain_cell';
  }

  if (event === 'profile_customized' || event === 'profile_completed') {
    const { data, error } = await getSupabaseServiceClient()
      .from('profiles')
      .select('selected_title_reward_id, displayed_badge_reward_ids, avatar_url, about_me, chat_color, chat_border')
      .eq('id', userId)
      .maybeSingle<{
        selected_title_reward_id: string | null;
        displayed_badge_reward_ids: unknown;
        avatar_url: string | null;
        about_me: string | null;
        chat_color: string | null;
        chat_border: string | null;
      }>();
    if (error) throw error;
    if (!data) throw new Error('Profile customization could not be verified.');
    const { data: earnedRows, error: earnedRowsError } = await getSupabaseServiceClient()
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .returns<Array<{ achievement_id: string }>>();
    if (earnedRowsError) throw earnedRowsError;
    const earnedRewardIds = new Set(
      (earnedRows ?? [])
        .map((row) => ACHIEVEMENT_BY_ID.get(row.achievement_id))
        .filter(Boolean)
        .flatMap((achievement) => achievement?.rewards ?? [])
        .map((reward) => reward.id),
    );
    const badges = Array.isArray(data.displayed_badge_reward_ids)
      ? data.displayed_badge_reward_ids.filter((badge): badge is string => typeof badge === 'string' && badge.trim().length > 0)
      : [];
    const hasTitle = Boolean(data.selected_title_reward_id?.trim() && earnedRewardIds.has(data.selected_title_reward_id));
    const hasBadge = badges.some((badge) => earnedRewardIds.has(badge));
    const hasAvatar = Boolean(data.avatar_url?.trim());
    const hasAbout = Boolean(data.about_me?.trim());
    const hasChatCosmetics = data.chat_color !== DEFAULT_CHAT_COLOR || data.chat_border !== DEFAULT_CHAT_BORDER;
    const complete = hasTitle && hasBadge && hasAvatar && hasAbout && hasChatCosmetics;
    if (event === 'profile_customized' && !(hasTitle || hasBadge || hasAvatar || hasAbout || hasChatCosmetics)) {
      throw new Error('Profile customization was not verified.');
    }
    if (event === 'profile_completed' && !complete) {
      throw new Error('The profile is not fully customized.');
    }
    return event === 'profile_customized' ? 'customized' : 'individualized';
  }

  if (event === 'friend_added') {
    const { data: requests, error: requestError } = await getSupabaseServiceClient()
      .from('friend_requests')
      .select('id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
      .limit(1);
    if (requestError) throw requestError;
    if ((requests ?? []).length > 0) return 'friendly';
    const { data: friendships, error: friendshipError } = await getSupabaseServiceClient()
      .from('friendships')
      .select('id')
      .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
      .limit(1);
    if (friendshipError) throw friendshipError;
    if ((friendships ?? []).length > 0) return 'friendly';
    throw new Error('A friend connection was not verified.');
  }

  throw new Error('Unknown achievement event.');
}

export async function recordAchievementEvent(
  userId: string,
  event: AchievementEventName,
  metadata?: Record<string, unknown>,
): Promise<AchievementEventResult> {
  const before = await getUserAchievements(userId);
  const achievementId = await assertEventIsValid(userId, event, metadata);
  await upsertProgress(userId, achievementId, 1);
  const after = await getUserAchievements(userId);
  const beforeById = new Map(before.map((achievement) => [achievement.id, achievement]));
  const changed = after.filter((achievement) => {
    const previous = beforeById.get(achievement.id);
    return previous?.progressCurrent !== achievement.progressCurrent || previous?.completedAt !== achievement.completedAt;
  });
  const completed = changed.filter((achievement) => achievement.completedAt && !beforeById.get(achievement.id)?.completedAt);
  return { achievements: after, changed, completed };
}

export async function resetUserAchievements(userId: string) {
  const { error } = await getSupabaseServiceClient()
    .from('user_achievements')
    .delete()
    .eq('user_id', userId);

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
}

export async function grantUserAchievement(userId: string, achievementId: string) {
  const achievement = ACHIEVEMENT_BY_ID.get(achievementId);
  if (!achievement) {
    throw new Error('Unknown achievement.');
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('user_achievements')
    .upsert({
      user_id: userId,
      achievement_id: achievement.id,
      progress_current: achievement.target,
      progress_target: achievement.target,
      completed_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,achievement_id' });

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
}

export async function revokeUserAchievement(userId: string, achievementId: string) {
  if (!ACHIEVEMENT_BY_ID.has(achievementId)) {
    throw new Error('Unknown achievement.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('user_achievements')
    .delete()
    .eq('user_id', userId)
    .eq('achievement_id', achievementId);

  if (isMissingAchievementsTableError(error)) {
    throw new Error('Achievements require the latest database migration.');
  }
  if (error) throw error;
}
