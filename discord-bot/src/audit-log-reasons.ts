import { AuditLogEvent, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry } from 'discord.js';

export type DiscordAuditReason = {
  detail: string;
  label: string;
};

const AUDIT_LOG_MATCH_WINDOW_MS = 15_000;
const AUDIT_LOG_PROPAGATION_DELAY_MS = 900;
const RECENT_BAN_RETENTION_MS = 20_000;
const recentBansByGuildId = new Map<string, Map<string, number>>();

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function pruneRecentBans(guildId: string, now = Date.now()) {
  const bans = recentBansByGuildId.get(guildId);
  if (!bans) return;
  for (const [userId, observedAt] of bans) {
    if (now - observedAt > RECENT_BAN_RETENTION_MS) bans.delete(userId);
  }
  if (!bans.size) recentBansByGuildId.delete(guildId);
}

export function rememberDiscordMemberBan(guildId: string, userId: string) {
  const bans = recentBansByGuildId.get(guildId) ?? new Map<string, number>();
  bans.set(userId, Date.now());
  recentBansByGuildId.set(guildId, bans);
  pruneRecentBans(guildId);
}

function wasRecentlyBanned(guildId: string, userId: string) {
  pruneRecentBans(guildId);
  return recentBansByGuildId.get(guildId)?.has(userId) ?? false;
}

export function getRecentlyBannedDiscordUserIds(guildId: string, userIds: readonly string[]) {
  pruneRecentBans(guildId);
  const bans = recentBansByGuildId.get(guildId);
  return new Set(userIds.filter((userId) => bans?.has(userId)));
}

async function canViewAuditLog(guild: Guild) {
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  return Boolean(botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog));
}

function auditEntryMatches(
  entry: GuildAuditLogsEntry,
  targetUserId: string | null,
  channelId: string | null,
) {
  if (Math.abs(Date.now() - entry.createdTimestamp) > AUDIT_LOG_MATCH_WINDOW_MS) return false;
  if (targetUserId && entry.targetId !== targetUserId) return false;
  if (!channelId) return true;

  const extra = entry.extra as { channel?: { id?: string } } | null;
  return extra?.channel?.id === channelId || entry.targetId === channelId;
}

type AuditLookup = {
  available: boolean;
  entry: GuildAuditLogsEntry | null;
};

async function findRecentAuditEntry(
  guild: Guild,
  event: AuditLogEvent,
  targetUserId: string | null,
  channelId: string | null = null,
): Promise<AuditLookup> {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 10, type: event });
    return {
      available: true,
      entry: logs.entries.find((entry) => auditEntryMatches(entry, targetUserId, channelId)) ?? null,
    };
  } catch (error) {
    console.warn(`Unable to read Discord audit logs in guild ${guild.id}.`, error);
    return { available: false, entry: null };
  }
}

function moderatorDetail(entry: GuildAuditLogsEntry | null) {
  const moderator = entry?.executor
    ? `<@${entry.executor.id}> (${entry.executor.username})`
    : 'an unknown moderator';
  const auditReason = entry?.reason?.trim() ? ` Audit reason: ${entry.reason.trim()}` : '';
  return `Action by ${moderator}.${auditReason}`;
}

export async function resolveDiscordMemberLeaveReason(guild: Guild, userId: string): Promise<DiscordAuditReason> {
  const auditLogAvailable = await canViewAuditLog(guild);
  await delay(AUDIT_LOG_PROPAGATION_DELAY_MS);

  if (auditLogAvailable) {
    const banLookup = await findRecentAuditEntry(guild, AuditLogEvent.MemberBanAdd, userId);
    if (!banLookup.available) return { label: 'Unknown', detail: 'Discord audit logs could not be read to verify this departure.' };
    if (banLookup.entry) return { label: 'Banned', detail: moderatorDetail(banLookup.entry) };

    const kickLookup = await findRecentAuditEntry(guild, AuditLogEvent.MemberKick, userId);
    if (!kickLookup.available) return { label: 'Unknown', detail: 'Discord audit logs could not be read to verify this departure.' };
    if (kickLookup.entry) return { label: 'Kicked', detail: moderatorDetail(kickLookup.entry) };
  }

  if (wasRecentlyBanned(guild.id, userId)) {
    return {
      label: 'Banned',
      detail: auditLogAvailable
        ? 'A Discord ban event was observed, but its audit entry was not available yet.'
        : 'A Discord ban event was observed.',
    };
  }

  if (auditLogAvailable) {
    return { label: 'Self-leave', detail: 'No matching kick or ban audit record was found.' };
  }
  return {
    label: 'Unknown',
    detail: 'Grant the bot View Audit Log to distinguish a self-leave from a kick.',
  };
}

export async function resolveDiscordMessageDeletionReason(
  guild: Guild,
  authorId: string,
  channelId: string,
): Promise<DiscordAuditReason> {
  const auditLogAvailable = await canViewAuditLog(guild);
  await delay(AUDIT_LOG_PROPAGATION_DELAY_MS);

  if (auditLogAvailable) {
    const banLookup = await findRecentAuditEntry(guild, AuditLogEvent.MemberBanAdd, authorId);
    if (!banLookup.available) return { label: 'Unknown', detail: 'Discord audit logs could not be read to verify this deletion.' };
    if (banLookup.entry) return { label: 'Deleted as part of a ban', detail: moderatorDetail(banLookup.entry) };
  }
  if (wasRecentlyBanned(guild.id, authorId)) {
    return { label: 'Deleted as part of a ban', detail: 'A Discord ban event was observed.' };
  }

  if (auditLogAvailable) {
    const deletionLookup = await findRecentAuditEntry(guild, AuditLogEvent.MessageDelete, authorId, channelId);
    if (!deletionLookup.available) return { label: 'Unknown', detail: 'Discord audit logs could not be read to verify this deletion.' };
    if (deletionLookup.entry) return { label: 'Deleted by a moderator', detail: moderatorDetail(deletionLookup.entry) };
    return { label: 'Self-deleted', detail: 'No matching moderator-deletion audit record was found.' };
  }
  return {
    label: 'Unknown',
    detail: 'Grant the bot View Audit Log to distinguish a self-delete from a moderator deletion.',
  };
}

export async function resolveDiscordBulkMessageDeletionReason(guild: Guild, channelId: string): Promise<DiscordAuditReason> {
  const auditLogAvailable = await canViewAuditLog(guild);
  if (auditLogAvailable) {
    await delay(AUDIT_LOG_PROPAGATION_DELAY_MS);
    const deletionLookup = await findRecentAuditEntry(guild, AuditLogEvent.MessageBulkDelete, null, channelId);
    if (!deletionLookup.available) return { label: 'Unknown', detail: 'Discord audit logs could not be read to verify this bulk deletion.' };
    if (deletionLookup.entry) return { label: 'Bulk-deleted by a moderator', detail: moderatorDetail(deletionLookup.entry) };
    return { label: 'Bulk-deleted', detail: 'No matching bulk-deletion audit record was found.' };
  }
  return {
    label: 'Bulk-deleted',
    detail: 'Grant the bot View Audit Log to identify the moderator responsible for a bulk deletion.',
  };
}
