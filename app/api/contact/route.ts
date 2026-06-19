import { NextResponse } from 'next/server';
import { createContactSubmission, isContactSubmissionCategory } from '@/lib/contact';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ContactSubmissionBody = {
  category: string;
  message: string;
  clientId?: string | null;
  pagePath?: string | null;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<ContactSubmissionBody>(request);
    const category = requireString(body.category, 'category');

    if (!isContactSubmissionCategory(category)) {
      throw new Error('Invalid contact category.');
    }

    const submission = await createContactSubmission({
      category,
      message: requireString(body.message, 'message'),
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
      pagePath: typeof body.pagePath === 'string' ? body.pagePath : null,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
