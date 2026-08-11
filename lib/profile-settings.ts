import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type ProfileSettingsUpdate = {
  profileStatus?: string;
  friendsListPublic?: boolean;
};

export type ProfileSettings = {
  profile_status: string;
  friends_list_public: boolean;
};

export async function updateProfileSettings(userId: string, updates: ProfileSettingsUpdate) {
  const databaseUpdate: Record<string, string | boolean> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.profileStatus !== undefined) {
    databaseUpdate.profile_status = updates.profileStatus.trim().slice(0, 50);
  }
  if (updates.friendsListPublic !== undefined) {
    databaseUpdate.friends_list_public = updates.friendsListPublic;
  }

  if (Object.keys(databaseUpdate).length === 1) {
    throw new Error('At least one profile setting is required.');
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('profiles')
    .update(databaseUpdate)
    .eq('id', userId)
    .select('profile_status, friends_list_public')
    .single<ProfileSettings>();

  if (error) {
    throw error;
  }

  return data;
}
