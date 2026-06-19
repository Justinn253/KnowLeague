import { NextResponse } from 'next/server';
import { createContactSubmission, isContactSubmissionCategory } from '@/lib/contact';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

type ContactSubmissionBody = {
  category: string;
  message: string;
  clientId?: string | null;
  pagePath?: string | null;
  viewport?: string | null;
  timezone?: string | null;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<ContactSubmissionBody>(request);
    const category = requireString(body.category, 'category');

    if (!isContactSubmissionCategory(category)) {
      throw new Error('Invalid contact category.');
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    let username = 'Guest';
    let userUid = 'Guest';
    let email = 'Guest';

    if (token) {
      const supabase = getSupabaseServiceClient();
      const { data } = await supabase.auth.getUser(token);
      if (data.user) {
        userUid = data.user.id;
        email = data.user.email ?? 'Guest';
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', data.user.id)
          .maybeSingle<{ username: string; display_name: string | null }>();
        username = profile?.display_name || profile?.username || 'Guest';
      }
    }

    const submission = await createContactSubmission({
      category,
      message: requireString(body.message, 'message'),
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
      pagePath: typeof body.pagePath === 'string' ? body.pagePath : null,
      userAgent: request.headers.get('user-agent'),
      viewport: typeof body.viewport === 'string' ? body.viewport : null,
      timezone: typeof body.timezone === 'string' ? body.timezone : null,
      username,
      userUid,
      email,
    });

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
