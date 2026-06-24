import { NextResponse } from 'next/server';
import { createContactSubmission, isContactSubmissionCategory } from '@/lib/contact';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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
const CONTACT_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<ContactSubmissionBody>(request);
    const category = requireString(body.category, 'category');

    if (!isContactSubmissionCategory(category)) {
      throw new Error('Invalid contact category.');
    }
    const message = requireString(body.message, 'message');
    if (category === 'player_report' && (typeof body.reportedUsername !== 'string' || body.reportedUsername.trim().length < 3)) {
      throw new Error('Enter the player username you are reporting.');
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
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
        ? body.reportedUsername.trim().toLowerCase().slice(0, 100)
        : '';
      reportedUsername = cleanReportedUsername;
      const { data: reportedProfile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', cleanReportedUsername)
        .maybeSingle<{ id: string; username: string }>();

      if (reportedProfile) {
        reportedUserId = reportedProfile.id;
        reportedUsername = reportedProfile.username;
      }
    }

    const rateLimitKey = userUid !== 'Guest'
      ? `contact:user:${userUid}`
      : `contact:${typeof body.clientId === 'string' && body.clientId.trim() ? `client:${body.clientId.trim()}` : `ip:${getClientIp(request)}`}`;
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

    const rateLimit = checkRateLimit({
      key: rateLimitKey,
      limit: 1,
      windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Please wait ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minutes before submitting another contact request.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const submission = await createContactSubmission({
      category,
      message,
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
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
}
