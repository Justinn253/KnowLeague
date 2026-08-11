import {
  createEmptyPlayerStats,
  createEmptyDetailedStats,
  normalizeDetailedGameStats,
  normalizePlayerGameStatsByGame,
  STREAK_GAME_IDS,
  type PlayerGameStatsByGame,
  type DetailedGameStats,
  type StreakGameId,
} from '@/lib/game-storage';
import { grantUserAchievement, resetUserAchievements, revokeUserAchievement } from '@/lib/achievements-server';
import { recordProfileAdminAction } from '@/lib/moderation';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type AdminStatsTarget = StreakGameId | 'skincognito' | 'all';
export const ADMIN_STATS_TARGETS: Array<{ value: AdminStatsTarget; label: string }> = [
  { value: 'ability-blitz', label: 'Ability Blitz' },
  { value: 'skin-champion', label: 'Skin Champion' },
  { value: 'skindle', label: 'Skindle' },
  { value: 'splash-scramble', label: 'Splash Scramble' },
  { value: 'skincognito', label: 'Skincognito' },
  { value: 'all', label: 'All synced game stats' },
];

function isAdminStatsTarget(value: string): value is AdminStatsTarget {
  return value === 'all' || value === 'skincognito' || STREAK_GAME_IDS.includes(value as StreakGameId);
}

export function parseAdminStatsTarget(value: unknown) {
  if (typeof value !== 'string' || !isAdminStatsTarget(value)) {
    throw new Error('Choose a valid game stats section.');
  }
  return value;
}

type PrivateDetailsStatsRow = {
  player_game_stats: PlayerGameStatsByGame | null;
  player_game_stats_reset_at: Record<string, string> | null;
  detailed_game_stats: DetailedGameStats | null;
  detailed_game_stats_reset_at: Record<string, string> | null;
};

export async function unlinkAdminProfileAccount(
  staffUserId: string,
  targetUserId: string,
  provider: 'discord' | 'riot',
) {
  const supabase = getSupabaseServiceClient();
  const updates = provider === 'discord'
    ? { discord_username: null, discord_avatar_url: null, discord_banner_url: null }
    : { riot_account_name: null };
  const { error } = await supabase
    .from('profile_private_details')
    .upsert({ user_id: targetUserId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;

  await recordProfileAdminAction(staffUserId, targetUserId, provider === 'discord' ? 'unlink_discord' : 'unlink_riot');
}

export async function resetAdminProfileStats(
  staffUserId: string,
  targetUserId: string,
  target: AdminStatsTarget,
) {
  const supabase = getSupabaseServiceClient();
  const { data: existing, error: loadError } = await supabase
    .from('profile_private_details')
    .select('player_game_stats, player_game_stats_reset_at, detailed_game_stats, detailed_game_stats_reset_at')
    .eq('user_id', targetUserId)
    .maybeSingle<PrivateDetailsStatsRow>();
  if (loadError) throw loadError;

  const stats = normalizePlayerGameStatsByGame(existing?.player_game_stats);
  const resetAt = { ...(existing?.player_game_stats_reset_at ?? {}) };
  const detailedStats = normalizeDetailedGameStats(existing?.detailed_game_stats);
  const detailedResetAt = { ...(existing?.detailed_game_stats_reset_at ?? {}) };
  const targets = target === 'all' ? STREAK_GAME_IDS : target === 'skincognito' ? [] : [target];
  const now = new Date().toISOString();
  targets.forEach((gameId) => {
    stats[gameId] = createEmptyPlayerStats(gameId);
    resetAt[gameId] = now;
  });
  if (target === 'all' || target === 'ability-blitz') {
    detailedStats.abilityBlitz = createEmptyDetailedStats().abilityBlitz;
    detailedResetAt['ability-blitz'] = now;
  }
  if (target === 'all' || target === 'skin-champion') {
    detailedStats.skinChampion = createEmptyDetailedStats().skinChampion;
    detailedResetAt['skin-champion'] = now;
  }
  if (target === 'all' || target === 'skincognito') {
    detailedStats.skincognito = createEmptyDetailedStats().skincognito;
    detailedResetAt.skincognito = now;
  }
  if (target === 'all') {
    detailedStats.totalWins = 0;
    detailedStats.recordedWinIds = [];
    detailedResetAt.all = now;
  }

  const { error } = await supabase
    .from('profile_private_details')
    .upsert({
      user_id: targetUserId,
      player_game_stats: stats,
      player_game_stats_reset_at: resetAt,
      detailed_game_stats: detailedStats,
      detailed_game_stats_reset_at: detailedResetAt,
      updated_at: now,
    }, { onConflict: 'user_id' });
  if (error) throw error;

  await recordProfileAdminAction(staffUserId, targetUserId, 'reset_stats', '', { target });
}

export async function applyAdminAchievementAction(
  staffUserId: string,
  targetUserId: string,
  action: 'grant' | 'revoke' | 'reset',
  achievementId?: string,
) {
  if (action === 'grant') {
    if (!achievementId) throw new Error('Choose an achievement to grant.');
    await grantUserAchievement(targetUserId, achievementId);
    await recordProfileAdminAction(staffUserId, targetUserId, 'grant_achievement', '', { achievementId });
    return;
  }

  if (action === 'revoke') {
    if (!achievementId) throw new Error('Choose an achievement to revoke.');
    await revokeUserAchievement(targetUserId, achievementId);
    await recordProfileAdminAction(staffUserId, targetUserId, 'revoke_achievement', '', { achievementId });
    return;
  }

  await resetUserAchievements(targetUserId);
  await recordProfileAdminAction(staffUserId, targetUserId, 'reset_achievements');
}
