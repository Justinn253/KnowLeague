import { NextRequest, NextResponse } from 'next/server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit, getRateLimitSubject } from '@/lib/rate-limit';

const apiReadRateLimit = getDualRateLimit('apiRead');
const apiWriteRateLimit = getDualRateLimit('apiWrite');

export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(request: NextRequest) {
  // Browsers and API clients may use OPTIONS for CORS negotiation. It does
  // not execute an application route and should not consume a request slot.
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const limits = isRead ? apiReadRateLimit : apiWriteRateLimit;
  const subject = await getRateLimitSubject(request);
  const rateLimitResponse = await enforceApiRateLimit(request, {
    scope: `api:global:${isRead ? 'read' : 'write'}`,
    ip: limits.ip,
    subject: subject ? { id: subject, ...limits.subject } : undefined,
    errorMessage: 'Too many API requests. Please try again shortly.',
  });

  return rateLimitResponse ?? NextResponse.next();
}
