import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export async function getAuthenticatedUserId(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!token) {
    throw new Error('Authentication is required.');
  }

  const { data, error } = await getSupabaseServiceClient().auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Authentication is required.');
  }

  return data.user.id;
}
