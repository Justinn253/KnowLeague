export function getAuthSessionId(accessToken: string) {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { session_id?: unknown };
    return typeof decoded.session_id === 'string' ? decoded.session_id : null;
  } catch {
    return null;
  }
}
