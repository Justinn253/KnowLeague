import type { DiscordRandodraftDraft } from './randodraft.js';

type RandodraftSharePayload = {
  completedAt: string;
  draft: DiscordRandodraftDraft;
  guest: true;
  v: 1;
};

/** Matches the website's temporary guest-share format without persisting a Discord draft. */
export function encodeDiscordRandodraftShare(draft: DiscordRandodraftDraft, completedAt = new Date().toISOString()) {
  const payload: RandodraftSharePayload = { completedAt, draft, guest: true, v: 1 };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
