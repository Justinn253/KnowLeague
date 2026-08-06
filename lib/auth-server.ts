import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!token) {
    throw new Error('Authentication is required.');
  }

  const { data, error } = await getSupabaseServiceClient().auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Authentication is required.');
  }

  return data.user;
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

  const { data, error } = await getSupabaseServiceClient().auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Authentication is required.');
  }
  return data.user;
}
