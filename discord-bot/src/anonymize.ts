import { randomUUID } from 'node:crypto';
import type { DiscordBotConfig } from './config.js';
import { createBotServiceClient } from './supabase.js';

const ANONYMIZE_CONFIGURATION_CACHE_MS = 30_000;
const ANONYMIZE_ID_PATTERN = /^[A-Z0-9]{12}$/;

type AnonymizeSettingsRow = {
  all_channels: boolean;
  report_channel_id: string | null;
};

type AnonymizeChannelRow = {
  channel_id: string;
};

type AnonymizeRoleRow = {
  discord_role_id: string;
};

type AnonymizedMessageRow = {
  anonymize_id: string;
  author_discord_user_id: string;
  created_at: string;
  message_content: string;
};

export type DiscordAnonymizeConfiguration = {
  allChannels: boolean;
  commandChannelIds: ReadonlySet<string>;
  reportChannelId: string | null;
  useRoleIds: ReadonlySet<string>;
  viewRoleIds: ReadonlySet<string>;
};

export type AnonymizedMessage = {
  anonymizeId: string;
  authorDiscordUserId: string;
  createdAt: string;
  messageContent: string;
};

let cachedConfiguration: { expiresAt: number; guildId: string; value: DiscordAnonymizeConfiguration } | null = null;

export function formatAnonymizeId(anonymizeId: string) {
  return `ANON-${anonymizeId}`;
}

export function normalizeAnonymizeId(value: string) {
  const normalized = value.trim().toUpperCase().replace(/^ANON-/, '');
  return ANONYMIZE_ID_PATTERN.test(normalized) ? normalized : null;
}

export function anonymizeMemberHasRole(memberRoleIds: Iterable<string>, allowedRoleIds: ReadonlySet<string>) {
  for (const roleId of memberRoleIds) {
    if (allowedRoleIds.has(roleId)) return true;
  }
  return false;
}

function toAnonymizedMessage(row: AnonymizedMessageRow): AnonymizedMessage {
  return {
    anonymizeId: row.anonymize_id,
    authorDiscordUserId: row.author_discord_user_id,
    createdAt: row.created_at,
    messageContent: row.message_content,
  };
}

export async function getDiscordAnonymizeConfiguration(config: DiscordBotConfig): Promise<DiscordAnonymizeConfiguration> {
  const now = Date.now();
  if (cachedConfiguration && cachedConfiguration.guildId === config.guildId && cachedConfiguration.expiresAt > now) {
    return cachedConfiguration.value;
  }

  const supabase = createBotServiceClient(config);
  const [settingsResult, channelsResult, useRolesResult, viewRolesResult] = await Promise.all([
    supabase.from('discord_anonymize_settings')
      .select('all_channels, report_channel_id')
      .eq('guild_id', config.guildId)
      .maybeSingle<AnonymizeSettingsRow>(),
    supabase.from('discord_anonymize_command_channels')
      .select('channel_id')
      .eq('guild_id', config.guildId)
      .returns<AnonymizeChannelRow[]>(),
    supabase.from('discord_anonymize_use_roles')
      .select('discord_role_id')
      .eq('guild_id', config.guildId)
      .returns<AnonymizeRoleRow[]>(),
    supabase.from('discord_anonymize_view_roles')
      .select('discord_role_id')
      .eq('guild_id', config.guildId)
      .returns<AnonymizeRoleRow[]>(),
  ]);
  if (settingsResult.error) throw new Error(`Unable to load Anonymize settings: ${settingsResult.error.message}`);
  if (channelsResult.error) throw new Error(`Unable to load Anonymize command channels: ${channelsResult.error.message}`);
  if (useRolesResult.error) throw new Error(`Unable to load Anonymize use roles: ${useRolesResult.error.message}`);
  if (viewRolesResult.error) throw new Error(`Unable to load Anonymize view roles: ${viewRolesResult.error.message}`);

  const value: DiscordAnonymizeConfiguration = {
    allChannels: settingsResult.data?.all_channels ?? true,
    commandChannelIds: new Set((channelsResult.data ?? []).map((row) => row.channel_id)),
    reportChannelId: settingsResult.data?.report_channel_id ?? null,
    useRoleIds: new Set((useRolesResult.data ?? []).map((row) => row.discord_role_id)),
    viewRoleIds: new Set((viewRolesResult.data ?? []).map((row) => row.discord_role_id)),
  };
  cachedConfiguration = { expiresAt: now + ANONYMIZE_CONFIGURATION_CACHE_MS, guildId: config.guildId, value };
  return value;
}

export async function createDiscordAnonymizedMessage(
  config: DiscordBotConfig,
  authorDiscordUserId: string,
  messageContent: string,
): Promise<AnonymizedMessage> {
  const supabase = createBotServiceClient(config);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const anonymizeId = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    const { data, error } = await supabase
      .from('discord_anonymized_messages')
      .insert({
        anonymize_id: anonymizeId,
        author_discord_user_id: authorDiscordUserId,
        guild_id: config.guildId,
        message_content: messageContent,
      })
      .select('anonymize_id, author_discord_user_id, created_at, message_content')
      .single<AnonymizedMessageRow>();
    if (!error && data) return toAnonymizedMessage(data);
    if (error?.code !== '23505') throw new Error(`Unable to save anonymous message: ${error?.message ?? 'unknown error'}`);
  }
  throw new Error('Unable to assign a unique anonymize ID. Please try again.');
}

export async function getDiscordAnonymizedMessage(config: DiscordBotConfig, anonymizeId: string): Promise<AnonymizedMessage | null> {
  const { data, error } = await createBotServiceClient(config)
    .from('discord_anonymized_messages')
    .select('anonymize_id, author_discord_user_id, created_at, message_content')
    .eq('guild_id', config.guildId)
    .eq('anonymize_id', anonymizeId)
    .maybeSingle<AnonymizedMessageRow>();
  if (error) throw new Error(`Unable to load anonymous message: ${error.message}`);
  return data ? toAnonymizedMessage(data) : null;
}

export async function deleteDiscordAnonymizedMessage(config: DiscordBotConfig, anonymizeId: string) {
  const { error } = await createBotServiceClient(config)
    .from('discord_anonymized_messages')
    .delete()
    .eq('guild_id', config.guildId)
    .eq('anonymize_id', anonymizeId);
  if (error) throw new Error(`Unable to remove unpublished anonymous message: ${error.message}`);
}
