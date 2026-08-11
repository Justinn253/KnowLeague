import { ACHIEVEMENT_BY_ID, maskAchievement, type AchievementEventName, type AchievementEventResult, type AchievementEventSubmission, type AchievementListItem, type CumulativeAchievementId } from '@/lib/achievements';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const inFlightEvents = new Map<string, Promise<AchievementEventResult | null>>();
const inFlightEventBatches = new Map<string, Promise<AchievementEventResult | null>>();
const inFlightCumulativeProgress = new Map<string, Promise<AchievementEventResult | null>>();
const CUMULATIVE_PROGRESS_STORAGE_KEY = 'knowleague:v1:achievement:cumulative-progress';

export type CumulativeAchievementUpdate = {
  achievementId: CumulativeAchievementId;
  progress: number;
  sessionId?: string;
};

export type AchievementRealtimeRow = {
  achievement_id?: unknown;
  progress_current?: unknown;
  progress_target?: unknown;
  completed_at?: unknown;
  updated_at?: unknown;
};

export function toAchievementNotification(row: AchievementRealtimeRow): AchievementListItem | null {
  const achievementId = typeof row.achievement_id === 'string' ? row.achievement_id : '';
  const completedAt = typeof row.completed_at === 'string' ? row.completed_at : null;
  const achievement = ACHIEVEMENT_BY_ID.get(achievementId);
  if (!achievement || !completedAt) {
    return null;
  }

  return {
    ...achievement,
    progressCurrent: typeof row.progress_current === 'number' ? row.progress_current : achievement.target,
    progressTarget: typeof row.progress_target === 'number' ? row.progress_target : achievement.target,
    completedAt,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : completedAt,
    globalCompletedCount: 0,
    completionRank: null,
    completionPercent: null,
    ...maskAchievement(achievement, completedAt),
  };
}

type SubmitAchievementEventOptions = {
  includeAchievements?: boolean;
};

type PendingCumulativeProgressValue = {
  progress: number;
  sessionId?: string;
};

type PendingCumulativeProgress = Record<string, Record<string, PendingCumulativeProgressValue>>;

const SESSION_SCOPED_ACHIEVEMENT_TARGETS: Record<string, number> = {
  dedication: 3600,
  anyone_there: 10800,
  discord_sleep_caller: 28800,
};

function loadPendingCumulativeProgress(): PendingCumulativeProgress {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CUMULATIVE_PROGRESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(Object.entries(parsed).flatMap(([userId, rawUpdates]) => {
      if (!rawUpdates || typeof rawUpdates !== 'object' || Array.isArray(rawUpdates)) {
        return [];
      }
      const updates = Object.fromEntries(Object.entries(rawUpdates).flatMap(([achievementId, rawProgress]) => {
        if (typeof rawProgress === 'number' && Number.isFinite(rawProgress) && rawProgress >= 0) {
          return [[achievementId, { progress: rawProgress }]];
        }
        if (!rawProgress || typeof rawProgress !== 'object' || Array.isArray(rawProgress)) {
          return [];
        }
        const progress = (rawProgress as { progress?: unknown }).progress;
        const sessionId = (rawProgress as { sessionId?: unknown }).sessionId;
        if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0) {
          return [];
        }
        if (sessionId !== undefined && typeof sessionId !== 'string') {
          return [];
        }
        return [[achievementId, {
          progress,
          ...(typeof sessionId === 'string' ? { sessionId } : {}),
        }]];
      }));
      return Object.keys(updates).length > 0 ? [[userId, updates]] : [];
    }));
  } catch {
    return {};
  }
}

function savePendingCumulativeProgress(progress: PendingCumulativeProgress) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (Object.keys(progress).length === 0) {
      window.localStorage.removeItem(CUMULATIVE_PROGRESS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(CUMULATIVE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Achievement progress remains available in the local game/stat stores when storage is unavailable.
  }
}

function enqueueCumulativeProgress(userId: string, updates: readonly CumulativeAchievementUpdate[]) {
  const pending = loadPendingCumulativeProgress();
  const userProgress = { ...(pending[userId] ?? {}) };
  updates.forEach((update) => {
    if (!Number.isFinite(update.progress) || update.progress < 0) {
      return;
    }
    const current = userProgress[update.achievementId];
    if (!current || update.progress > current.progress) {
      userProgress[update.achievementId] = {
        progress: update.progress,
        ...(update.sessionId ? { sessionId: update.sessionId } : {}),
      };
    }
  });
  pending[userId] = userProgress;
  savePendingCumulativeProgress(pending);
}

function removeSubmittedCumulativeProgress(userId: string, submitted: Record<string, number>) {
  const pending = loadPendingCumulativeProgress();
  const userProgress = pending[userId];
  if (!userProgress) {
    return;
  }

  Object.entries(submitted).forEach(([achievementId, progress]) => {
    if ((userProgress[achievementId]?.progress ?? 0) <= progress) {
      delete userProgress[achievementId];
    }
  });
  if (Object.keys(userProgress).length === 0) {
    delete pending[userId];
  }
  savePendingCumulativeProgress(pending);
}

export function discardStaleSessionAchievementProgress(userId: string, sessionId: string) {
  const pending = loadPendingCumulativeProgress();
  const userProgress = pending[userId];
  if (!userProgress) {
    return;
  }

  Object.entries(SESSION_SCOPED_ACHIEVEMENT_TARGETS).forEach(([achievementId, target]) => {
    const value = userProgress[achievementId];
    if (!value || (value.sessionId === sessionId) || (value.progress >= target && value.sessionId)) {
      return;
    }
    delete userProgress[achievementId];
  });

  if (Object.keys(userProgress).length === 0) {
    delete pending[userId];
  }
  savePendingCumulativeProgress(pending);
}

function dispatchCompletedAchievements(result: AchievementEventResult) {
  if (result.completed?.length) {
    window.dispatchEvent(new CustomEvent('knowleague:achievement-completed', {
      detail: { achievements: result.completed },
    }));
  }
}

export async function submitAchievementEvent(
  event: AchievementEventName,
  metadata?: Record<string, unknown>,
  options: SubmitAchievementEventOptions = {},
) {
  const eventKey = `${event}:${JSON.stringify(metadata ?? {})}:${options.includeAchievements ? 'full' : 'compact'}`;
  const inFlight = inFlightEvents.get(eventKey);
  if (inFlight) {
    return inFlight;
  }

  const submit = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return null;
    }

    const response = await fetch('/api/achievements', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event, metadata, includeAchievements: options.includeAchievements === true }),
    });
    const result = await response.json() as AchievementEventResult | { error?: string };
    if (!response.ok) {
      return null;
    }

    const achievementResult = result as AchievementEventResult;
    dispatchCompletedAchievements(achievementResult);

    return achievementResult;
  };

  const promise = submit().finally(() => {
    inFlightEvents.delete(eventKey);
  });
  inFlightEvents.set(eventKey, promise);
  return promise;
}

export async function submitAchievementEvents(
  submissions: readonly AchievementEventSubmission[],
  options: SubmitAchievementEventOptions = {},
) {
  if (submissions.length === 0) {
    return null;
  }

  const eventKey = `${JSON.stringify(submissions)}:${options.includeAchievements ? 'full' : 'compact'}`;
  const inFlight = inFlightEventBatches.get(eventKey);
  if (inFlight) {
    return inFlight;
  }

  const submit = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return null;
    }

    const response = await fetch('/api/achievements', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: submissions, includeAchievements: options.includeAchievements === true }),
    });
    const result = await response.json() as AchievementEventResult | { error?: string };
    if (!response.ok) {
      return null;
    }

    const achievementResult = result as AchievementEventResult;
    dispatchCompletedAchievements(achievementResult);
    return achievementResult;
  };

  const promise = submit().finally(() => {
    inFlightEventBatches.delete(eventKey);
  });
  inFlightEventBatches.set(eventKey, promise);
  return promise;
}

export async function flushAchievementProgressQueue() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const session = data.session;
  if (!session) {
    return null;
  }

  const userId = session.user.id;
  const pending = loadPendingCumulativeProgress()[userId] ?? {};
  const updates = Object.entries(pending).map(([achievementId, value]) => ({
    achievementId,
    progress: value.progress,
    ...(value.sessionId ? { sessionId: value.sessionId } : {}),
  }));
  if (updates.length === 0) {
    return null;
  }

  const existingRequest = inFlightCumulativeProgress.get(userId);
  if (existingRequest) {
    return existingRequest;
  }

  const submit = async () => {
    try {
      const response = await fetch('/api/achievements', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event: 'cumulative_progress', metadata: { updates } }),
      });
      if (!response.ok) {
        return null;
      }
      const result = await response.json() as AchievementEventResult;
      removeSubmittedCumulativeProgress(
        userId,
        Object.fromEntries(Object.entries(pending).map(([achievementId, value]) => [achievementId, value.progress])),
      );
      dispatchCompletedAchievements(result);
      return result;
    } catch {
      return null;
    }
  };

  const promise = submit().finally(() => {
    inFlightCumulativeProgress.delete(userId);
  });
  inFlightCumulativeProgress.set(userId, promise);
  return promise;
}

export async function submitAchievementProgress(updates: readonly CumulativeAchievementUpdate[]) {
  if (updates.length === 0) {
    return null;
  }

  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (!data.session) {
    return null;
  }

  enqueueCumulativeProgress(data.session.user.id, updates);
  return flushAchievementProgressQueue();
}
