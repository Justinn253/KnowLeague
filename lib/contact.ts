import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type ContactSubmissionCategory = 'feedback' | 'bug_report' | 'suggestion' | 'player_report';

type CreateContactSubmissionInput = {
  category: ContactSubmissionCategory;
  message: string;
  clientId?: string | null;
  pagePath?: string | null;
  userAgent?: string | null;
  viewport?: string | null;
  timezone?: string | null;
  username?: string | null;
  userUid?: string | null;
  email?: string | null;
  reportedUserId?: string | null;
  reportedUsername?: string | null;
};

const contactCategories = new Set<ContactSubmissionCategory>(['feedback', 'bug_report', 'suggestion', 'player_report']);
const MAX_CONTACT_MESSAGE_LENGTH = 2000;

export function isContactSubmissionCategory(value: string): value is ContactSubmissionCategory {
  return contactCategories.has(value as ContactSubmissionCategory);
}

export async function createContactSubmission(input: CreateContactSubmissionInput) {
  const message = input.message.trim();

  if (!isContactSubmissionCategory(input.category)) {
    throw new Error('Invalid contact category.');
  }

  if (!message) {
    throw new Error('Message is required.');
  }

  if (message.length > MAX_CONTACT_MESSAGE_LENGTH) {
    throw new Error(`Message must be ${MAX_CONTACT_MESSAGE_LENGTH} characters or fewer.`);
  }

  if (input.category === 'player_report' && !input.reportedUsername?.trim()) {
    throw new Error('Enter the player username you are reporting.');
  }

  const { data, error } = await getSupabaseServiceClient()
    .from('contact_submissions')
    .insert({
      category: input.category,
      message,
      username: input.username?.trim() || 'Guest',
      user_uid: input.userUid?.trim() || 'Guest',
      email: input.email?.trim() || 'Guest',
      client_id: input.clientId?.trim() || null,
      page_path: input.pagePath?.trim().slice(0, 500) || null,
      user_agent: input.userAgent?.trim().slice(0, 500) || null,
      viewport: input.viewport?.trim().slice(0, 100) || null,
      timezone: input.timezone?.trim().slice(0, 100) || null,
      reported_user_id: input.reportedUserId?.trim() || null,
      reported_username: input.reportedUsername?.trim().slice(0, 100) || null,
    })
    .select('id, created_at')
    .single<{ id: string; created_at: string }>();

  if (error) {
    throw error;
  }

  return data;
}
