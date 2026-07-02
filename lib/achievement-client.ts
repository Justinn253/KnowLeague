import type { AchievementEventName, AchievementEventResult } from '@/lib/achievements';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

const inFlightEvents = new Map<string, Promise<AchievementEventResult | null>>();

export async function submitAchievementEvent(
  event: AchievementEventName,
  metadata?: Record<string, unknown>,
) {
  const eventKey = `${event}:${JSON.stringify(metadata ?? {})}`;
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
      body: JSON.stringify({ event, metadata }),
    });
    const result = await response.json() as AchievementEventResult | { error?: string };
    if (!response.ok) {
      return null;
    }

    const achievementResult = result as AchievementEventResult;
    if (achievementResult.completed?.length) {
      window.dispatchEvent(new CustomEvent('knowleague:achievement-completed', {
        detail: { achievements: achievementResult.completed },
      }));
    }

    return achievementResult;
  };

  const promise = submit().finally(() => {
    inFlightEvents.delete(eventKey);
  });
  inFlightEvents.set(eventKey, promise);
  return promise;
}
