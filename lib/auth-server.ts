import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { getAuthTokenIssuedAt } from '@/lib/auth-session';
import { ApiError } from '@/lib/api-utils';

async function getUserFromToken(token: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, 'Authentication is required.');
  }

  const { data: sessionControl, error: sessionControlError } = await supabase
    .from('auth_session_controls')
    .select('sessions_revoked_at')
    .eq('user_id', data.user.id)
    .maybeSingle<{ sessions_revoked_at: string | null }>();
  if (sessionControlError) {
    if (sessionControlError.code === '42P01' || sessionControlError.code === 'PGRST205') {
      return data.user;
    }
    throw new ApiError(401, 'Authentication is required.');
  }

  const revokedAt = sessionControl?.sessions_revoked_at
    ? Date.parse(sessionControl.sessions_revoked_at) / 1000
    : null;
  const issuedAt = getAuthTokenIssuedAt(token);
  if (revokedAt !== null && (!Number.isFinite(revokedAt) || issuedAt === null || issuedAt < revokedAt)) {
    throw new ApiError(401, 'Authentication is required.');
  }

  return data.user;
}

export async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!token) {
    throw new ApiError(401, 'Authentication is required.');
  }

  return getUserFromToken(token);
}

export async function getAuthenticatedUserId(request: Request) {
  const user = await getAuthenticatedUser(request);
  return user.id;
}

export async function getOptionalAuthenticatedUserId(request: Request) {
  const user = await getOptionalAuthenticatedUser(request);
  return user?.id ?? null;
}

export async function getOptionalAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token) return null;

  return getUserFromToken(token);
}
