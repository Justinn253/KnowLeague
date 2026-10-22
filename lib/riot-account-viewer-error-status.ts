export function getRiotAccountViewerErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('not configured')) return 503;
  if (message.includes('not found') || message.includes('stored riot id mapping')) return 404;
  if (message.includes('rate limit')) return 429;
  if (message.includes('rejected')) return 403;
  if (message.includes('fetch failed') || message.includes('unable to load riot account data')) return 503;
  if (message.includes('riot api request failed') || message.includes('data dragon request failed')) return 502;
  return 400;
}
