export function getProfileTabFromUrl<T extends string>(tabs: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const requestedTab = new URLSearchParams(window.location.search).get('tab');
  return requestedTab && tabs.includes(requestedTab as T) ? requestedTab as T : fallback;
}

export function pushProfileTabToUrl(tab: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get('tab') === tab) {
    return;
  }

  url.searchParams.set('tab', tab);
  window.history.pushState(
    { ...window.history.state, profileTab: tab },
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}
