import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { applyAdminAchievementAction, parseAdminStatsTarget, resetAdminProfileStats, unlinkAdminProfileAccount } from '@/lib/admin-profile';
import { requireAdminAccess, setUserBanState } from '@/lib/moderation';

type AdminProfileActionBody = {
  action: 'unlink_discord' | 'unlink_riot' | 'reset_stats' | 'grant_achievement' | 'revoke_achievement' | 'reset_achievements' | 'ban' | 'unban';
  reason?: string;
  statsTarget?: string;
  achievementId?: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  try {
    const staffUser = await getAuthenticatedUser(request);
    await requireAdminAccess(staffUser);
    const body = await readJsonBody<AdminProfileActionBody>(request);
    const targetUserId = requireString(params.userId, 'userId');

    switch (body.action) {
      case 'unlink_discord':
        await unlinkAdminProfileAccount(staffUser.id, targetUserId, 'discord');
        break;
      case 'unlink_riot':
        await unlinkAdminProfileAccount(staffUser.id, targetUserId, 'riot');
        break;
      case 'reset_stats':
        await resetAdminProfileStats(staffUser.id, targetUserId, parseAdminStatsTarget(body.statsTarget));
        break;
      case 'grant_achievement':
        await applyAdminAchievementAction(staffUser.id, targetUserId, 'grant', requireString(body.achievementId, 'achievementId'));
        break;
      case 'revoke_achievement':
        await applyAdminAchievementAction(staffUser.id, targetUserId, 'revoke', requireString(body.achievementId, 'achievementId'));
        break;
      case 'reset_achievements':
        await applyAdminAchievementAction(staffUser.id, targetUserId, 'reset');
        break;
      case 'ban': {
        const reason = body.reason?.trim().slice(0, 500) ?? '';
        if (!reason) throw new Error('A reason is required before banning a user.');
        await setUserBanState(targetUserId, true, staffUser.id, reason);
        break;
      }
      case 'unban':
        await setUserBanState(targetUserId, false, staffUser.id, body.reason?.trim() || 'Administrative unban');
        break;
      default:
        throw new Error('Invalid profile administration action.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
