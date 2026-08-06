export function getPublicProfileHref(username: string) {
  return `/users/${encodeURIComponent(username.trim())}`;
}

const profileProtectedGameRoutes = [
  '/skindle',
  '/splash-scramble',
  '/ability-blitz',
  '/multiplayer/ability-blitz',
  '/skin-champion',
  '/multiplayer/skin-champion',
  '/skincognito',
  '/carving-revelation',
  '/category-clash',
  '/mastery-master',
  '/speed-blitz',
] as const;

export function shouldOpenProfileInNewTab() {
  if (typeof window === 'undefined') {
    return false;
  }

  return profileProtectedGameRoutes.some((route) => window.location.pathname === route || window.location.pathname.startsWith(`${route}/`));
}

export function navigateToPublicProfile(username: string, navigate: (href: string) => void) {
  const href = getPublicProfileHref(username);
  if (shouldOpenProfileInNewTab()) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  navigate(href);
}
