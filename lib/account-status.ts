import { getSupabaseServiceClient } from '@/lib/supabaseClient';

function isMissingBanColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();
  return (maybeError.code === '42703' || maybeError.code === 'PGRST204') && text.includes('is_banned');
}

export async function getBannedUserIds(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set<string>();

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .select('id, is_banned')
    .in('id', ids)
    .returns<Array<{ id: string; is_banned: boolean | null }>>();
  if (isMissingBanColumnError(error)) return new Set<string>();
  if (error) throw error;
  return new Set((data ?? []).filter((profile) => profile.is_banned).map((profile) => profile.id));
}

export async function assertAccountNotBanned(userId: string) {
  const banned = await getBannedUserIds([userId]);
  if (banned.has(userId)) {
    throw new Error('This account is banned from using this feature.');
  }
}

export async function assertUsersCanInteract(firstUserId: string, secondUserId?: string) {
  const banned = await getBannedUserIds([firstUserId, ...(secondUserId ? [secondUserId] : [])]);
  if (banned.size > 0) {
    throw new Error('Banned accounts cannot use friend requests or messages.');
  }
}
