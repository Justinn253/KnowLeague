type CachedOwnerProfileResponse<TResponse> = {
  userId: string;
  routeKey: string;
  response: TResponse;
};

let cachedOwnerProfileResponse: CachedOwnerProfileResponse<unknown> | null = null;

export function getCachedOwnerProfileResponse<TResponse>(userId: string, routeKey: string) {
  if (
    !cachedOwnerProfileResponse
    || cachedOwnerProfileResponse.userId !== userId
    || cachedOwnerProfileResponse.routeKey !== routeKey
  ) {
    return null;
  }

  return cachedOwnerProfileResponse.response as TResponse;
}

export function setCachedOwnerProfileResponse<TResponse>(userId: string, routeKey: string, response: TResponse) {
  cachedOwnerProfileResponse = { userId, routeKey, response };
}

export function invalidateCachedOwnerProfileResponse(userId: string) {
  if (cachedOwnerProfileResponse?.userId === userId) {
    cachedOwnerProfileResponse = null;
  }
}
