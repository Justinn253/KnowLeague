import {
  createDraftState, draftTotalPicks, normalizeDraftSettings,
  type DraftState,
} from '@/lib/randodraft';
import { parseDraftHistoryInput, type DraftHistoryEntry, type DraftHistoryInput } from '@/lib/randodraft-history';

export const RANDODRAFT_GUEST_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type SharePayload = { v: 1; draft: DraftHistoryInput; completedAt: string; guest: boolean };

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeRandodraftShare(draft: DraftHistoryInput, guest = false, completedAt = new Date().toISOString()): string {
  return encodeBase64Url(JSON.stringify({ v: 1, draft, completedAt, guest } satisfies SharePayload));
}

export function decodeRandodraftShare(value: string): DraftHistoryEntry | null {
  try {
    const payload = JSON.parse(decodeBase64Url(value)) as Partial<SharePayload>;
    if (payload.v !== 1 || typeof payload.completedAt !== 'string' || !Number.isFinite(Date.parse(payload.completedAt))
      || typeof payload.guest !== 'boolean') return null;
    if (payload.guest && Date.now() - Date.parse(payload.completedAt) > RANDODRAFT_GUEST_RETENTION_MS) return null;
    const draft = parseDraftHistoryInput(payload.draft);
    if (!draft) return null;
    return { ...draft, completedAt: payload.completedAt };
  } catch {
    return null;
  }
}

export function draftStateFromHistoryEntry(entry: DraftHistoryEntry): DraftState {
  const settings = normalizeDraftSettings(entry.settings);
  const state = createDraftState(settings);
  return {
    ...state,
    phase: 'finished',
    settings,
    picks: entry.picks,
    current: { champion: null, lane: null, type: settings.randomBuildType === 'all' ? 'Random' : null, manualCategories: [], build: null },
    pickNames: Array.from({ length: draftTotalPicks(settings) }, (_, index) => entry.picks[index]?.name ?? `Pick ${index + 1}`),
  };
}

export function createRandodraftShareUrl(entry: DraftHistoryEntry, guest = false): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/randodraft?share=' + encodeRandodraftShare(entry, guest, entry.completedAt);
}
