import type { User } from '@supabase/supabase-js';
import { sanitizeChatMessage } from '@/lib/chat-filter';
import { sendFriendMessage } from '@/lib/friends';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const appRoles = ['guest', 'user', 'moderator', 'admin'] as const;
export type AppRole = typeof appRoles[number];
export type StoredAppRole = 'user' | 'moderator';

export type ModerationUserResult = {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  createdAt: string | null;
  isBanned: boolean;
  online: boolean;
  email: string | null;
};

export type ModerationContactSubmission = {
  id: string;
  category: string;
  message: string;
  status: string;
  username: string;
  userUid: string;
  email: string;
  reportedUsername: string | null;
  severity: number;
  premium: boolean | null;
  createdAt: string;
};

export type ModerationTeamMember = {
  id: string;
  username: string;
  displayName: string;
  role: Extract<AppRole, 'moderator' | 'admin'>;
  createdAt: string | null;
};

const MAX_MODERATION_SEARCH_RESULTS = 12;
const MAX_CONTACT_SUBMISSIONS = 25;
const ONLINE_WINDOW_MS = 20 * 1000;
export type ModerationTicketStatus = 'open' | 'closed' | 'archived';
export type ProfileAdminAction = 'ban' | 'unban' | 'unlink_discord' | 'unlink_riot' | 'reset_stats' | 'grant_achievement' | 'revoke_achievement' | 'reset_achievements';

function parseAllowlist(value?: string) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getAdminUserIds() {
  return parseAllowlist(process.env.KNOWLEAGUE_ADMIN_USER_IDS);
}

function getAdminEmails() {
  return parseAllowlist(process.env.KNOWLEAGUE_ADMIN_EMAILS);
}

export function isAdminUserId(userId: string | null | undefined) {
  return Boolean(userId && getAdminUserIds().has(userId.toLowerCase()));
}

function getAdminUserIdList() {
  return [...getAdminUserIds()];
}

export function isAdminAuthUser(user: Pick<User, 'id' | 'email'> | null | undefined) {
  if (!user) return false;
  const email = user.email?.toLowerCase() ?? '';
  return isAdminUserId(user.id) || Boolean(email && getAdminEmails().has(email));
}

export function canAccessModeration(role: AppRole) {
  return role === 'moderator' || role === 'admin';
}

export function canManageModerators(role: AppRole) {
  return role === 'admin';
}

export async function getAuthenticatedAppRole(user: Pick<User, 'id' | 'email'>): Promise<AppRole> {
  if (isAdminAuthUser(user)) {
    return 'admin';
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('app_role')
    .eq('id', user.id)
    .maybeSingle<{ app_role: StoredAppRole | null }>();

  if (error) {
    throw error;
  }

  return data?.app_role === 'moderator' ? 'moderator' : 'user';
}

export async function requireModerationAccess(user: Pick<User, 'id' | 'email'>) {
  const role = await getAuthenticatedAppRole(user);
  if (!canAccessModeration(role)) {
    throw new Error('Moderator access is required.');
  }

  return role;
}

export async function requireAdminAccess(user: Pick<User, 'id' | 'email'>) {
  const role = await getAuthenticatedAppRole(user);
  if (!canManageModerators(role)) {
    throw new Error('Admin access is required.');
  }

  return role;
}

function isOnline(lastSeenAt?: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);
}

export async function searchModerationUsers(query: string, excludeUserId?: string) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) {
    return [];
  }

  const escapedQuery = cleanQuery.replace(/[%_]/g, '\\$&');
  let queryBuilder = getSupabaseServiceClient()
    .from('profiles')
    .select('id, username, display_name, app_role, created_at, is_banned, last_seen_at')
    .or(`username.ilike.%${escapedQuery}%,display_name.ilike.%${escapedQuery}%`)
    .order('username', { ascending: true });

  if (excludeUserId) {
    queryBuilder = queryBuilder.neq('id', excludeUserId);
  }

  const { data, error } = await queryBuilder
    .limit(MAX_MODERATION_SEARCH_RESULTS)
    .returns<Array<{
      id: string;
      username: string;
      display_name: string;
      app_role: StoredAppRole | null;
      created_at: string | null;
      is_banned: boolean | null;
      last_seen_at: string | null;
    }>>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((profile): ModerationUserResult => ({
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    role: isAdminUserId(profile.id) ? 'admin' : profile.app_role === 'moderator' ? 'moderator' : 'user',
    createdAt: profile.created_at,
    isBanned: Boolean(profile.is_banned),
    online: isOnline(profile.last_seen_at),
    email: null,
  }));
}

export async function setStoredModeratorRole(targetUserId: string, role: StoredAppRole) {
  if (isAdminUserId(targetUserId)) {
    throw new Error('Admin roles are managed in app configuration.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('profiles')
    .update({ app_role: role, updated_at: new Date().toISOString() })
    .eq('id', targetUserId);

  if (error) {
    throw error;
  }
}

export async function recordProfileAdminAction(
  staffUserId: string,
  targetUserId: string,
  action: ProfileAdminAction,
  reason = '',
  metadata: Record<string, unknown> = {},
) {
  const { error } = await getSupabaseServiceClient()
    .from('profile_admin_actions')
    .insert({
      staff_user_id: staffUserId,
      target_user_id: targetUserId,
      action,
      reason: reason.trim().slice(0, 500),
      metadata,
    });

  if (error) throw error;
}

export async function setUserBanState(targetUserId: string, banned: boolean, staffUserId?: string, reason = 'Moderation action') {
  if (isAdminUserId(targetUserId)) {
    throw new Error('Admin accounts cannot be banned from moderation tools.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('profiles')
    .update({ is_banned: banned, updated_at: new Date().toISOString() })
    .eq('id', targetUserId);

  if (error) throw error;
  if (staffUserId) {
    await recordProfileAdminAction(staffUserId, targetUserId, banned ? 'ban' : 'unban', reason);
  }
}

export async function forceUserLogout(targetUserId: string) {
  if (isAdminUserId(targetUserId)) {
    throw new Error('Admin accounts cannot be logged out from moderation tools.');
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('auth_session_controls')
    .upsert({ user_id: targetUserId, sessions_revoked_at: now, updated_at: now }, { onConflict: 'user_id' });

  if (error) throw error;
}

export async function sendModerationDirectMessage(moderatorUserId: string, targetUserId: string, rawMessage: string) {
  if (moderatorUserId === targetUserId) {
    throw new Error('Choose another user to message.');
  }

  const message = sanitizeChatMessage(rawMessage.trim().slice(0, 1000));
  if (!message) {
    throw new Error('Message is required.');
  }

  await sendFriendMessage(moderatorUserId, targetUserId, message, {
    adminMessage: true,
    createThread: true,
  });
}

export async function listModerationContactSubmissions() {
  const { data, error } = await getSupabaseServiceClient()
    .from('contact_submissions')
    .select('id, category, message, status, username, user_uid, email, reported_username, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_CONTACT_SUBMISSIONS)
    .returns<Array<{
      id: string;
      category: string;
      message: string;
      status: string;
      username: string;
      user_uid: string;
      email: string;
      reported_username: string | null;
      severity: number | null;
      created_at: string;
    }>>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((submission): ModerationContactSubmission => ({
    id: submission.id,
    category: submission.category,
    message: submission.message,
    status: submission.status,
    username: submission.username,
    userUid: submission.user_uid,
    email: submission.email,
    reportedUsername: submission.reported_username,
    severity: submission.severity ?? 1,
    premium: null,
    createdAt: submission.created_at,
  }));
}

export async function updateContactSubmissionModeration(input: {
  submissionId: string;
  status?: ModerationTicketStatus;
  severity?: number;
}) {
  const updates: { status?: ModerationTicketStatus; severity?: number } = {};
  if (input.status) {
    if (!['open', 'closed', 'archived'].includes(input.status)) {
      throw new Error('Invalid ticket status.');
    }
    updates.status = input.status;
  }
  if (typeof input.severity === 'number') {
    if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 5) {
      throw new Error('Severity must be between 1 and 5.');
    }
    updates.severity = input.severity;
  }
  if (Object.keys(updates).length === 0) {
    throw new Error('No ticket changes were provided.');
  }

  const { error } = await getSupabaseServiceClient()
    .from('contact_submissions')
    .update(updates)
    .eq('id', input.submissionId);

  if (error) throw error;
}

export async function listModerationTeamMembers() {
  const adminUserIds = getAdminUserIdList();
  const supabase = getSupabaseServiceClient();
  const teamById = new Map<string, ModerationTeamMember>();

  if (adminUserIds.length > 0) {
    const { data: admins, error: adminError } = await supabase
      .from('profiles')
      .select('id, username, display_name, created_at')
      .in('id', adminUserIds)
      .returns<Array<{
        id: string;
        username: string;
        display_name: string;
        created_at: string | null;
      }>>();

    if (adminError) {
      throw adminError;
    }

    (admins ?? []).forEach((profile) => {
      teamById.set(profile.id, {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        role: 'admin',
        createdAt: profile.created_at,
      });
    });
  }

  const { data: moderators, error: moderatorError } = await supabase
    .from('profiles')
    .select('id, username, display_name, app_role, created_at')
    .eq('app_role', 'moderator')
    .order('username', { ascending: true })
    .returns<Array<{
      id: string;
      username: string;
      display_name: string;
      app_role: StoredAppRole | null;
      created_at: string | null;
    }>>();

  if (moderatorError) {
    throw moderatorError;
  }

  (moderators ?? []).forEach((profile) => {
    if (teamById.has(profile.id)) return;
    teamById.set(profile.id, {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      role: 'moderator',
      createdAt: profile.created_at,
    });
  });

  return [...teamById.values()].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === 'admin' ? -1 : 1;
    }
    return left.username.localeCompare(right.username);
  });
}
