import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS, readJsonBody, requireString } from '@/lib/api-utils';
import { listModerationContactSubmissions, requireModerationAccess, updateContactSubmissionModeration, type ModerationTicketStatus } from '@/lib/moderation';

type ContactModerationBody = {
  submissionId: string;
  status?: ModerationTicketStatus;
  severity?: number;
  assignedStaffUserId?: string | null;
  internalNotes?: string;
};

function getBoundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid pagination value.');
  }
  return parsed;
}

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/moderation/contacts', async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get('status');
    if (status && !['all', 'open', 'closed', 'archived'].includes(status)) {
      throw new Error('Invalid ticket status filter.');
    }
    const severityValue = searchParams.get('severity');
    const severity = severityValue && severityValue !== 'all' ? Number(severityValue) : undefined;
    if (severity !== undefined && (!Number.isInteger(severity) || severity < 1 || severity > 5)) {
      throw new Error('Invalid ticket severity filter.');
    }
    return NextResponse.json(
      await listModerationContactSubmissions({
        viewerId: user.id,
        query: searchParams.get('q') ?? undefined,
        category: searchParams.get('category') ?? undefined,
        status: status && status !== 'all' ? status as ModerationTicketStatus : undefined,
        severity,
        assigned: searchParams.get('assigned') ?? undefined,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        sort: searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest',
        offset: getBoundedInteger(searchParams.get('offset'), 0, 0, 5_000),
        limit: getBoundedInteger(searchParams.get('limit'), 25, 1, 25),
      }),
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PATCH = withApiMetrics('/api/moderation/contacts', async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const body = await readJsonBody<ContactModerationBody>(request);
    const submissionId = requireString(body.submissionId, 'submissionId');
    await updateContactSubmissionModeration({
      staffUserId: user.id,
      submissionId,
      status: body.status,
      severity: body.severity,
      assignedStaffUserId: body.assignedStaffUserId,
      internalNotes: body.internalNotes,
    });
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
