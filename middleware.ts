import { NextRequest, NextResponse } from 'next/server';
import { getApiRouteRateLimitPolicy, getDualRateLimit, MAX_API_BODY_BYTES } from '@/lib/abuse-controls';
import { enforceApiRateLimit, getRateLimitSubject } from '@/lib/rate-limit';

const apiReadRateLimit = getDualRateLimit('apiRead');
const apiWriteRateLimit = getDualRateLimit('apiWrite');

export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(request: NextRequest) {
  const isHealthPath = request.nextUrl.pathname === '/api/health';
  if (isHealthPath && (request.method === 'GET' || request.method === 'HEAD')) {
    // Liveness must remain available while Redis or Supabase is degraded. It
    // performs no dependency work and returns only the process status.
    return NextResponse.next();
  }

  // Browsers and API clients may use OPTIONS for CORS negotiation. It does
  // not execute an application route and should not consume a request slot.
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const contentLength = request.headers.get('content-length');
  const declaredBodyBytes = contentLength ? Number(contentLength) : 0;
  if (Number.isFinite(declaredBodyBytes) && declaredBodyBytes > MAX_API_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  const limits = isRead ? apiReadRateLimit : apiWriteRateLimit;
  const subject = await getRateLimitSubject(request);
  const rateLimitResponse = await enforceApiRateLimit(request, {
    scope: `api:global:${isRead ? 'read' : 'write'}`,
    ip: limits.ip,
    subject: subject ? { id: subject, ...limits.subject } : undefined,
    errorMessage: 'Too many API requests. Please try again shortly.',
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const routePolicy = getApiRouteRateLimitPolicy(request.nextUrl.pathname, request.method);
  if (routePolicy) {
    const routeRateLimitResponse = await enforceApiRateLimit(request, {
      scope: routePolicy.scope,
      ip: routePolicy.ip,
      subject: subject && routePolicy.subject ? { id: subject, ...routePolicy.subject } : undefined,
      errorMessage: routePolicy.errorMessage,
    });
    if (routeRateLimitResponse) {
      return routeRateLimitResponse;
    }
  }

  return NextResponse.next();
}
