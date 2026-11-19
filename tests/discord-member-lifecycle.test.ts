import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import {
  buildDiscordJoinPanel,
  buildDiscordLeavePanel,
  buildDiscordLeaveFailurePanel,
  formatMemberLifecycleTemplate,
  isSafeSingleUseUnavailableInviteMatch,
} from '../discord-bot/src/member-lifecycle';

describe('Discord member lifecycle', () => {
  it('renders only the documented join-message placeholders', () => {
    expect(formatMemberLifecycleTemplate(
      '**{user}** joined through {inviter} ({inviteCount}). {unknown}',
      { inviteCount: 7, inviter: 'Inviter', user: '<@123>' },
    )).toBe('**<@123>** joined through Inviter (7). {unknown}');
  });

  it('renders a headerless join panel with the configured message and join source as subtext', () => {
    const panel = buildDiscordJoinPanel('Welcome <@123>!', {
      kind: 'invite',
      inviteCode: 'abc123',
      inviterId: '12345678901234567',
      inviterUsername: 'Inviter',
    }, 7).toJSON();
    expect(panel.title).toBeUndefined();
    expect(panel.author).toBeUndefined();
    expect(panel.description).toBe('Welcome <@123>!');
    expect(panel.footer?.text).toBe('Joined via invite from Inviter · They now have 7 invites');
  });

  it('keeps invite-tracker panels from repeating source text already in their message body', () => {
    const panel = buildDiscordJoinPanel('**<@123>** has been invited by Inviter! They now have 7 invites.', {
      kind: 'invite',
      inviteCode: 'abc123',
      inviterId: '12345678901234567',
      inviterUsername: 'Inviter',
    }, 7, 'invite-total').toJSON();
    expect(panel.footer?.text).toBe('They now have 7 invites');
  });

  it('marks an immediate join panel as pending while invite attribution is resolving', () => {
    const panel = buildDiscordJoinPanel('Welcome <@123>!', { kind: 'pending' }).toJSON();
    expect(panel.footer?.text).toBe('Join source: verifying');
  });

  it('registers a member-facing invite leaderboard with an optional user', () => {
    const command = serializedCommandDefinitions().find((entry) => entry.name === 'invite');
    expect(command?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'leaderboard',
        options: [expect.objectContaining({ name: 'user', required: false, type: 6 })],
        type: 1,
      }),
      expect.objectContaining({
        name: 'set-invite-count',
        options: expect.arrayContaining([
          expect.objectContaining({ name: 'user', required: true, type: 6 }),
          expect.objectContaining({ name: 'count', required: true, type: 4, min_value: 0, max_value: 1_000_000 }),
        ]),
        type: 1,
      }),
    ]));
  });

  it('only treats one unavailable single-use invite in the join window as a fallback source', () => {
    const joinedAt = Date.parse('2026-11-12T12:00:00.000Z');
    const safeCandidate = {
      createdAt: joinedAt - 60_000,
      expiresAt: joinedAt + 60_000,
      maxUses: 1,
    };
    expect(isSafeSingleUseUnavailableInviteMatch(safeCandidate, joinedAt, joinedAt + 4_000)).toBe(true);
    expect(isSafeSingleUseUnavailableInviteMatch({ ...safeCandidate, maxUses: 2 }, joinedAt, joinedAt + 4_000)).toBe(false);
    expect(isSafeSingleUseUnavailableInviteMatch({ ...safeCandidate, expiresAt: joinedAt - 6_000 }, joinedAt, joinedAt + 4_000)).toBe(false);
    expect(isSafeSingleUseUnavailableInviteMatch(safeCandidate, joinedAt, joinedAt + 21_000)).toBe(false);
  });

  it('builds a generic leave-panel fallback without exposing internal errors', () => {
    const panel = buildDiscordLeaveFailurePanel({
      id: '12345678901234567',
      user: { username: 'DepartedMember' },
    } as never).toJSON();
    expect(panel.title).toBe('Member left - details unavailable');
    expect(panel.description).toContain('<@12345678901234567>');
    expect(panel.description).not.toContain('Supabase');
  });

  it('shows a verified leave reason without exposing the last observed message', () => {
    const panel = buildDiscordLeavePanel({
      id: '12345678901234567',
      user: { username: 'DepartedMember' },
    } as never, {
      chat_xp_level: 8,
      invite_code: 'welcome',
      inviter_discord_user_id: '12345678901234568',
      inviter_username: 'Inviter',
      joined_at: '2026-11-01T00:00:00.000Z',
      join_source: 'invite',
      role_snapshot: [],
    } as never, {
      label: 'Kicked',
      detail: 'Action by <@12345678901234569> (Moderator).',
    }).toJSON();
    expect(panel.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Kicked' }),
    ]));
    expect(panel.fields).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Last observed message' }),
    ]));
  });
});
