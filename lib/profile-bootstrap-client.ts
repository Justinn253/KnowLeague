'use client';

import type { Session } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/moderation';
import type { DetailedGameStats, PlayerGameStatsByGame } from '@/lib/game-storage';
import { getSessionScopedRequest } from '@/lib/auth-session-client';
import type { UiSoundSettings } from '@/lib/ui-sounds';

export type ProfileBootstrapResponse = {
  role: AppRole;
  soundSettings: UiSoundSettings | null;
  playerGameStats: PlayerGameStatsByGame;
  playerGameStatsResetAt: Record<string, string>;
  detailedGameStats: DetailedGameStats;
  detailedGameStatsResetAt: Record<string, string>;
};

export function getProfileBootstrap(session: Session, options: { force?: boolean } = {}) {
  return getSessionScopedRequest('profile-bootstrap', session, async () => {
    const response = await fetch('/api/profile/bootstrap', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await response.json() as ProfileBootstrapResponse | { error?: string };
    if (!response.ok) {
      throw new Error('error' in data && data.error ? data.error : 'Unable to load profile settings.');
    }
    return data as ProfileBootstrapResponse;
  }, options);
}
