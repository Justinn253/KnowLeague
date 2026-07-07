import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { listModerationContactSubmissions, requireModerationAccess, updateContactSubmissionModeration, type ModerationTicketStatus } from '@/lib/moderation';

type ContactModerationBody = {
  submissionId: string;
  status?: ModerationTicketStatus;
  severity?: number;
};

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    return NextResponse.json({ submissions: await listModerationContactSubmissions() });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const body = await readJsonBody<ContactModerationBody>(request);
    const submissionId = requireString(body.submissionId, 'submissionId');
    await updateContactSubmissionModeration({
      submissionId,
      status: body.status,
      severity: body.severity,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
