import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getRouteErrorResponse, requireString } from '@/lib/api-utils';

describe('API error responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the correct status for authentication failures', async () => {
    const response = getRouteErrorResponse(new ApiError(401, 'Authentication is required.'));
    const body = await response.json() as { error: string; requestId: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication is required.');
    expect(body.requestId).toEqual(expect.any(String));
    expect(response.headers.get('x-request-id')).toBe(body.requestId);
  });

  it('keeps not-found and validation messages useful', async () => {
    const notFoundResponse = getRouteErrorResponse(new Error('Profile not found.'));
    let validationError: unknown;
    try {
      requireString('', 'username');
    } catch (error) {
      validationError = error;
    }
    const validationResponse = getRouteErrorResponse(validationError);

    expect(notFoundResponse.status).toBe(404);
    expect((await notFoundResponse.json()).error).toBe('Profile not found.');
    expect(validationResponse.status).toBe(400);
    expect((await validationResponse.json()).error).toBe('username is required.');
  });

  it('does not expose database or internal exception details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = getRouteErrorResponse({
      code: '42P01',
      message: 'relation private_table does not exist',
      details: 'sensitive database details',
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('Unexpected API error.');
    expect(body.error).not.toContain('private_table');
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
