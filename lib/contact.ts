import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export type ContactSubmissionCategory = 'feedback' | 'bug_report' | 'suggestion';

type CreateContactSubmissionInput = {
  category: ContactSubmissionCategory;
  message: string;
  clientId?: string | null;
  pagePath?: string | null;
  userAgent?: string | null;
};

const contactCategories = new Set<ContactSubmissionCategory>(['feedback', 'bug_report', 'suggestion']);
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

  const { data, error } = await getSupabaseServiceClient()
    .from('contact_submissions')
    .insert({
      category: input.category,
      message,
      client_id: input.clientId?.trim() || null,
      page_path: input.pagePath?.trim().slice(0, 500) || null,
      user_agent: input.userAgent?.trim().slice(0, 500) || null,
    })
    .select('id, created_at')
    .single<{ id: string; created_at: string }>();

  if (error) {
    throw error;
  }

  return data;
}
