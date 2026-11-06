import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { createContactSubmission, isContactSubmissionCategory } from '@/lib/contact';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { getDualRateLimit } from '@/lib/abuse-controls';

type ContactSubmissionBody = {
  category: string;
  message: string;
  clientId?: string | null;
  pagePath?: string | null;
  viewport?: string | null;
  timezone?: string | null;
  reportedUsername?: string | null;
};

export const runtime = 'nodejs';
const contactSubmissionRateLimit = getDualRateLimit('contactSubmission');
const CONTACT_RATE_LIMIT_WINDOW_MS = contactSubmissionRateLimit.ip.windowMs;
const MAX_CONTACT_SUBMISSION_BODY_BYTES = 10_000;

export const POST = withApiMetrics('/api/contact', async function POST(request: Request) {
  try {
    const body = await readJsonBody<ContactSubmissionBody>(request, MAX_CONTACT_SUBMISSION_BODY_BYTES);
    const category = requireString(body.category, 'category');

    if (!isContactSubmissionCategory(category)) {
      throw new Error('Invalid contact category.');
    }
    const message = requireString(body.message, 'message');
    if (category === 'player_report' && (typeof body.reportedUsername !== 'string' || body.reportedUsername.trim().length < 3)) {
      throw new Error('Enter the player username you are reporting.');
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'contact-submission',
      ip: contactSubmissionRateLimit.ip,
      subject: token ? { id: token, ...contactSubmissionRateLimit.subject } : undefined,
      errorMessage: 'Please wait 30 minutes before submitting another contact request.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = getSupabaseServiceClient();
    let username = 'Guest';
    let userUid = 'Guest';
    let email = 'Guest';
    let reportedUserId: string | null = null;
    let reportedUsername: string | null = null;

    if (token) {
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

    if (category === 'player_report') {
      const cleanReportedUsername = typeof body.reportedUsername === 'string'
        ? body.reportedUsername.trim().slice(0, 100)
        : '';
      reportedUsername = cleanReportedUsername;
      const { data: reportedProfile } = await supabase
        .rpc('find_profile_by_username_ci', { search_username: cleanReportedUsername })
        .maybeSingle<{ id: string; username: string }>();

      if (reportedProfile) {
        reportedUserId = reportedProfile.id;
        reportedUsername = reportedProfile.username;
      }
    }

    const rateLimitCutoff = new Date(Date.now() - CONTACT_RATE_LIMIT_WINDOW_MS).toISOString();
    const recentSubmissionQuery = supabase
      .from('contact_submissions')
      .select('created_at')
      .gte('created_at', rateLimitCutoff)
      .order('created_at', { ascending: false })
      .limit(1);
    const { data: recentSubmissions, error: recentSubmissionError } = userUid !== 'Guest'
      ? await recentSubmissionQuery.eq('user_uid', userUid).returns<Array<{ created_at: string }>>()
      : typeof body.clientId === 'string' && body.clientId.trim()
        ? await recentSubmissionQuery.eq('client_id', body.clientId.trim()).returns<Array<{ created_at: string }>>()
        : { data: [], error: null };

    if (recentSubmissionError) {
      throw recentSubmissionError;
    }

    if ((recentSubmissions ?? []).length > 0) {
      return NextResponse.json(
        { error: 'Please wait 30 minutes before submitting another contact request.' },
        {
          status: 429,
          headers: { 'Retry-After': String(CONTACT_RATE_LIMIT_WINDOW_MS / 1000) },
        },
      );
    }

    const submission = await createContactSubmission({
      category,
      message,
      clientId: typeof body.clientId === 'string' ? body.clientId.trim().slice(0, 100) : null,
      pagePath: typeof body.pagePath === 'string' ? body.pagePath : null,
      userAgent: request.headers.get('user-agent'),
      viewport: typeof body.viewport === 'string' ? body.viewport : null,
      timezone: typeof body.timezone === 'string' ? body.timezone : null,
      username,
      userUid,
      email,
      reportedUserId,
      reportedUsername,
    });

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
