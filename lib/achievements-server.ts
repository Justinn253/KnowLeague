import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, type AchievementEventName, type AchievementEventResult, type AchievementListItem, maskAchievement } from '@/lib/achievements';
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

export async function getUserAchievements(userId: string): Promise<AchievementListItem[]> {
  const supabase = getSupabaseServiceClient();
  const [{ data: rows, error }, completedRows, profileCountResult] = await Promise.all([
    supabase
      .from('user_achievements')
      .select('user_id, achievement_id, progress_current, progress_target, completed_at, updated_at')
      .eq('user_id', userId)
      .returns<AchievementRow[]>(),
    getCompletedRows(),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true }),
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
