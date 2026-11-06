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
  updatedAt: string;
  internalNotes: string;
  assignedStaff: Pick<ModerationTeamMember, 'id' | 'username' | 'displayName' | 'role'> | null;
};

export type ModerationContactFilters = {
  query?: string;
  category?: string;
  status?: ModerationTicketStatus;
  severity?: number;
  assigned?: 'all' | 'unassigned' | 'mine' | string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
  offset?: number;
  limit?: number;
  viewerId: string;
};

export type ModerationContactPage = {
  submissions: ModerationContactSubmission[];
  pagination: { offset: number; limit: number; hasMore: boolean };
};

export type StaffAuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: Pick<ModerationTeamMember, 'id' | 'username' | 'displayName'> | null;
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
const MAX_CONTACT_OFFSET = 5_000;
const MAX_AUDIT_LOGS = 50;
const SOCIAL_PRESENCE_STALE_MS = 6 * 60 * 1000;
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

function isFreshPresence(updatedAt?: string | null) {
  return Boolean(updatedAt && Date.now() - new Date(updatedAt).getTime() < SOCIAL_PRESENCE_STALE_MS);
}

function isOnline(status?: string | null, updatedAt?: string | null) {
  return status === 'online' && isFreshPresence(updatedAt);
}

export async function searchModerationUsers(query: string, excludeUserId?: string) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) {
    return [];
  }

  const escapedQuery = cleanQuery.replace(/[%_]/g, '\\$&');
  let queryBuilder = getSupabaseServiceClient()
    .from('profiles')
    .select('id, username, display_name, app_role, created_at, is_banned')
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
    }>>();

  if (error) {
    throw error;
  }

  const userIds = (data ?? []).map((profile) => profile.id);
  const { data: presenceRows, error: presenceError } = userIds.length > 0
    ? await getSupabaseServiceClient()
      .from('social_presence')
      .select('user_id, status, updated_at')
      .in('user_id', userIds)
      .returns<Array<{ user_id: string; status: string; updated_at: string }>>()
    : { data: [], error: null };

  if (presenceError) {
    throw presenceError;
  }

  const presenceByUserId = new Map((presenceRows ?? []).map((presence) => [presence.user_id, presence]));
  return (data ?? []).map((profile): ModerationUserResult => ({
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    role: isAdminUserId(profile.id) ? 'admin' : profile.app_role === 'moderator' ? 'moderator' : 'user',
    createdAt: profile.created_at,
    isBanned: Boolean(profile.is_banned),
    online: isOnline(
      presenceByUserId.get(profile.id)?.status,
      presenceByUserId.get(profile.id)?.updated_at,
    ),
    email: null,
  }));
}

export async function recordStaffAuditEvent(input: {
  actorStaffUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await getSupabaseServiceClient()
    .from('staff_audit_logs')
    .insert({
      actor_staff_user_id: input.actorStaffUserId,
      action: input.action.trim().slice(0, 100),
      target_type: input.targetType.trim().slice(0, 100),
      target_id: input.targetId.trim().slice(0, 200),
      metadata: input.metadata ?? {},
    });

  if (error) throw error;
}

export async function setStoredModeratorRole(staffUserId: string, targetUserId: string, role: StoredAppRole) {
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
  await recordStaffAuditEvent({
    actorStaffUserId: staffUserId,
    action: role === 'moderator' ? 'moderation.role_granted' : 'moderation.role_revoked',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { role },
  });
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
  await recordStaffAuditEvent({
    actorStaffUserId: staffUserId,
    action: `profile.${action}`,
    targetType: 'user',
    targetId: targetUserId,
    metadata: {
      ...metadata,
      ...(reason.trim() ? { reason: reason.trim().slice(0, 500) } : {}),
    },
  });
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

export async function forceUserLogout(staffUserId: string, targetUserId: string) {
  if (isAdminUserId(targetUserId)) {
    throw new Error('Admin accounts cannot be logged out from moderation tools.');
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseServiceClient()
    .from('auth_session_controls')
    .upsert({ user_id: targetUserId, sessions_revoked_at: now, updated_at: now }, { onConflict: 'user_id' });

  if (error) throw error;
  await recordStaffAuditEvent({
    actorStaffUserId: staffUserId,
    action: 'moderation.sessions_revoked',
    targetType: 'user',
    targetId: targetUserId,
  });
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
  await recordStaffAuditEvent({
    actorStaffUserId: moderatorUserId,
    action: 'moderation.direct_message_sent',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { messageLength: message.length },
  });
}

function getSafeContactQuery(value?: string) {
  return value?.trim().slice(0, 100).replace(/[%,_()]/g, (character) => `\\${character}`) ?? '';
}

function normalizeContactDate(value: string | undefined, label: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date.toISOString();
}

export async function listModerationContactSubmissions(filters: ModerationContactFilters): Promise<ModerationContactPage> {
  const limit = Math.min(Math.max(Math.floor(filters.limit ?? MAX_CONTACT_SUBMISSIONS), 1), MAX_CONTACT_SUBMISSIONS);
  const offset = Math.min(Math.max(Math.floor(filters.offset ?? 0), 0), MAX_CONTACT_OFFSET);
  const from = normalizeContactDate(filters.from, 'From date');
  const to = normalizeContactDate(filters.to, 'To date');
  if (from && to && from > to) {
    throw new Error('From date must be before the to date.');
  }

  let query = getSupabaseServiceClient()
    .from('contact_submissions')
    .select('id, category, message, status, username, user_uid, email, reported_username, severity, created_at, updated_at, internal_notes, assigned_staff_user_id')
    .order('created_at', { ascending: filters.sort === 'oldest' })
    .range(offset, offset + limit);

  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.status) query = query.eq('status', filters.status);
  if (typeof filters.severity === 'number') query = query.eq('severity', filters.severity);
  if (filters.assigned === 'unassigned') query = query.is('assigned_staff_user_id', null);
  if (filters.assigned === 'mine') query = query.eq('assigned_staff_user_id', filters.viewerId);
  if (filters.assigned && !['all', 'unassigned', 'mine'].includes(filters.assigned)) query = query.eq('assigned_staff_user_id', filters.assigned);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const cleanQuery = getSafeContactQuery(filters.query);
  if (cleanQuery) {
    query = query.or([
      `category.ilike.%${cleanQuery}%`,
      `message.ilike.%${cleanQuery}%`,
      `username.ilike.%${cleanQuery}%`,
      `email.ilike.%${cleanQuery}%`,
      `reported_username.ilike.%${cleanQuery}%`,
    ].join(','));
  }

  const { data, error } = await query.returns<Array<{
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
    updated_at: string | null;
    internal_notes: string | null;
    assigned_staff_user_id: string | null;
  }>>();

  if (error) throw error;

  const assignedUserIds = [...new Set((data ?? []).map((submission) => submission.assigned_staff_user_id).filter((value): value is string => Boolean(value)))];
  const assignedStaffById = new Map<string, ModerationContactSubmission['assignedStaff']>();
  if (assignedUserIds.length > 0) {
    const { data: staffProfiles, error: staffError } = await getSupabaseServiceClient()
      .from('profiles')
      .select('id, username, display_name, app_role')
      .in('id', assignedUserIds)
      .returns<Array<{ id: string; username: string; display_name: string; app_role: StoredAppRole | null }>>();
    if (staffError) throw staffError;
    (staffProfiles ?? []).forEach((profile) => {
      assignedStaffById.set(profile.id, {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        role: isAdminUserId(profile.id) ? 'admin' : 'moderator',
      });
    });
  }

  const submissions = (data ?? []).slice(0, limit).map((submission): ModerationContactSubmission => ({
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
    updatedAt: submission.updated_at ?? submission.created_at,
    internalNotes: submission.internal_notes ?? '',
    assignedStaff: submission.assigned_staff_user_id ? assignedStaffById.get(submission.assigned_staff_user_id) ?? null : null,
  }));

  return {
    submissions,
    pagination: { offset, limit, hasMore: (data?.length ?? 0) > limit },
  };
}

async function assertStaffAssignee(userId: string) {
  if (isAdminUserId(userId)) return;
  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('app_role')
    .eq('id', userId)
    .maybeSingle<{ app_role: StoredAppRole | null }>();
  if (error) throw error;
  if (data?.app_role !== 'moderator') {
    throw new Error('Tickets can only be assigned to an active staff member.');
  }
}

export async function updateContactSubmissionModeration(input: {
  staffUserId: string;
  submissionId: string;
  status?: ModerationTicketStatus;
  severity?: number;
  assignedStaffUserId?: string | null;
  internalNotes?: string;
}) {
  const updates: { status?: ModerationTicketStatus; severity?: number; assigned_staff_user_id?: string | null; internal_notes?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
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
  if (input.assignedStaffUserId !== undefined) {
    if (input.assignedStaffUserId) await assertStaffAssignee(input.assignedStaffUserId);
    updates.assigned_staff_user_id = input.assignedStaffUserId;
  }
  if (input.internalNotes !== undefined) {
    if (typeof input.internalNotes !== 'string') throw new Error('Internal notes must be text.');
    updates.internal_notes = input.internalNotes.trim().slice(0, 4_000);
  }
  if (Object.keys(updates).length === 1) {
    throw new Error('No ticket changes were provided.');
  }

  const supabase = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from('contact_submissions')
    .select('status, severity, assigned_staff_user_id, internal_notes')
    .eq('id', input.submissionId)
    .maybeSingle<{ status: string; severity: number | null; assigned_staff_user_id: string | null; internal_notes: string | null }>();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Ticket not found.');

  const { error } = await supabase
    .from('contact_submissions')
    .update(updates)
    .eq('id', input.submissionId);

  if (error) throw error;

  const changes: Record<string, unknown> = {};
  if (updates.status !== undefined && updates.status !== existing.status) changes.status = { from: existing.status, to: updates.status };
  if (updates.severity !== undefined && updates.severity !== (existing.severity ?? 1)) changes.severity = { from: existing.severity ?? 1, to: updates.severity };
  if (updates.assigned_staff_user_id !== undefined && updates.assigned_staff_user_id !== existing.assigned_staff_user_id) changes.assignedStaffUserId = { from: existing.assigned_staff_user_id, to: updates.assigned_staff_user_id };
  if (updates.internal_notes !== undefined && updates.internal_notes !== (existing.internal_notes ?? '')) changes.internalNotes = { updated: true, length: updates.internal_notes.length };
  await recordStaffAuditEvent({
    actorStaffUserId: input.staffUserId,
    action: 'contact.ticket_updated',
    targetType: 'contact_submission',
    targetId: input.submissionId,
    metadata: { changes },
  });
}

export async function listStaffAuditLogs(offset = 0, limit = MAX_AUDIT_LOGS) {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), MAX_AUDIT_LOGS);
  const safeOffset = Math.min(Math.max(Math.floor(offset), 0), MAX_CONTACT_OFFSET);
  const { data, error } = await getSupabaseServiceClient()
    .from('staff_audit_logs')
    .select('id, actor_staff_user_id, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit)
    .returns<Array<{ id: string; actor_staff_user_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown> | null; created_at: string }>>();
  if (error) throw error;

  const actorIds = [...new Set((data ?? []).map((entry) => entry.actor_staff_user_id))];
  const actors = new Map<string, StaffAuditLogEntry['actor']>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await getSupabaseServiceClient()
      .from('profiles')
      .select('id, username, display_name')
      .in('id', actorIds)
      .returns<Array<{ id: string; username: string; display_name: string }>>();
    if (profileError) throw profileError;
    (profiles ?? []).forEach((profile) => actors.set(profile.id, { id: profile.id, username: profile.username, displayName: profile.display_name }));
  }

  return {
    entries: (data ?? []).slice(0, safeLimit).map((entry): StaffAuditLogEntry => ({
      id: entry.id,
      action: entry.action,
      targetType: entry.target_type,
      targetId: entry.target_id,
      metadata: entry.metadata ?? {},
      createdAt: entry.created_at,
      actor: actors.get(entry.actor_staff_user_id) ?? null,
    })),
    pagination: { offset: safeOffset, limit: safeLimit, hasMore: (data?.length ?? 0) > safeLimit },
  };
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
