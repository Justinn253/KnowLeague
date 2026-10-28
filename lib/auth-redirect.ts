export const AUTH_RETURN_TO_STORAGE_KEY = 'knowleague:v1:auth:return-to';

const ACTIVE_GAME_PATH_PREFIXES = [
  '/ability-blitz',
  '/carving-revelation',
  '/category-clash',
  '/mastery-master',
  '/games/mining',
  '/multiplayer',
  '/skin-champion',
  '/skincognito',
  '/skindle',
  '/splash-scramble',
  '/randodraft',
] as const;

function isExcludedAuthPath(pathname: string) {
  return pathname === '/login'
    || pathname.startsWith('/login/')
    || pathname === '/reset-password'
    || pathname.startsWith('/reset-password/')
    || pathname.startsWith('/api/');
}

export function isActiveGamePath(pathname: string) {
  return ACTIVE_GAME_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAuthReturnPath(pathname: string) {
  return Boolean(pathname.startsWith('/') && !pathname.startsWith('//') && !isExcludedAuthPath(pathname) && !isActiveGamePath(pathname));
}

export function rememberAuthReturnPath(pathname: string, search = '', hash = '') {
  if (typeof window === 'undefined' || !isAuthReturnPath(pathname)) {
    return;
  }

  try {
    window.sessionStorage.setItem(AUTH_RETURN_TO_STORAGE_KEY, `${pathname}${search}${hash}`);
  } catch {
    // Session storage is a convenience only; the login flow still falls back to the home page.
  }
}

export function peekAuthReturnPath() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedPath = window.sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY);
    if (!storedPath) {
      return null;
    }

    const parsedPath = new URL(storedPath, window.location.origin);
    if (parsedPath.origin !== window.location.origin || !isAuthReturnPath(parsedPath.pathname)) {
      return null;
    }

    return `${parsedPath.pathname}${parsedPath.search}${parsedPath.hash}`;
  } catch {
    return null;
  }
}

export function consumeAuthReturnPath(fallback = '/') {
  const returnPath = peekAuthReturnPath();
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY);
    } catch {
      // Ignore storage failures and use the validated path or fallback.
    }
  }

  return returnPath ?? fallback;
}
