export const OPEN_CONTACT_REPORT_EVENT = 'knowleague:open-contact-report';

export function requestOpenUserReport(username: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_CONTACT_REPORT_EVENT, {
    detail: { username },
  }));
}
