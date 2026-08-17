import { NextResponse } from 'next/server';
import { logServerEvent } from '@/lib/server-log';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getRequestId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return '';
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }

  return null;
}

function isDatabaseError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error || 'details' in error || 'hint' in error;
}

function isSafeUserMessage(message: string) {
  return /(?:required\.|not found\.|already exists\.|already friends\.|cannot be |are not |must be |is invalid\.|is too |is unavailable\.|is not |are required\.|cannot include |could not be |please wait)/i.test(message)
    || /^(?:Invalid|Choose|Select|Enter|Only|At least|No |This |You |Too many)/i.test(message);
}

function classifyError(error: unknown) {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message };
  }

  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const normalizedMessage = message.toLowerCase();

  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    const status = Math.min(599, Math.max(400, Math.floor(error.status)));
    return { status, message: status >= 500 ? 'Unexpected API error.' : (isSafeUserMessage(message) ? message : 'The request could not be completed.') };
  }

  if (code === '23505' || normalizedMessage.includes('duplicate key') || normalizedMessage.includes('already exists')) {
    return { status: 409, message: 'This resource already exists.' };
  }

  if (code === '22P02' || code === '22001' || code === '23514' || code === '23503') {
    return { status: 400, message: 'The request contains invalid data.' };
  }

  if (code === 'PGRST116') {
    return { status: 404, message: 'The requested resource was not found.' };
  }

  if (normalizedMessage.includes('supabase is not configured')) {
    return { status: 503, message: 'The service is temporarily unavailable.' };
  }

  if (normalizedMessage.includes('authentication is required') || normalizedMessage.includes('session has expired')) {
    return { status: 401, message: 'Authentication is required.' };
  }

  if (normalizedMessage.includes('access is required') || normalizedMessage.includes('not authorized') || normalizedMessage.includes('permission denied')) {
    return { status: 403, message: isSafeUserMessage(message) ? message : 'You are not authorized to perform this action.' };
  }

  if (normalizedMessage.includes('not found')) {
    return { status: 404, message: isSafeUserMessage(message) ? message : 'The requested resource was not found.' };
  }

  if (normalizedMessage.includes('too many')) {
    return { status: 429, message: isSafeUserMessage(message) ? message : 'Too many requests. Please try again later.' };
  }

  if (isDatabaseError(error)) {
    return { status: 500, message: 'Unexpected API error.' };
  }

  if (error instanceof Error && isSafeUserMessage(message)) {
    return { status: 400, message };
  }

  return { status: 500, message: 'Unexpected API error.' };
}

export function getRouteErrorResponse(error: unknown) {
  const requestId = getRequestId();
  const classified = classifyError(error);
  const errorCode = getErrorCode(error);

  logServerEvent(classified.status >= 500 ? 'error' : 'warn', 'api_request_error', {
    request_id: requestId,
    status: classified.status,
    error_type: error instanceof Error ? error.name : typeof error,
    error_code: errorCode,
  });

  return NextResponse.json(
    { error: classified.message, requestId },
    { status: classified.status, headers: { 'x-request-id': requestId } },
  );
}

export async function readJsonBody<TBody>(request: Request): Promise<Partial<TBody>> {
  try {
    return (await request.json()) as Partial<TBody>;
  } catch {
    return {};
  }
}

export function requireString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  return value;
}
