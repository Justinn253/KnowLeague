import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import {
  buildDiscordLeaveFailurePanel,
  formatMemberLifecycleTemplate,
  parseInviteTrackerInvitedMembersCsv,
  parseInviteTrackerLeaderboardCsv,
} from '../discord-bot/src/member-lifecycle';

describe('Discord member lifecycle', () => {
  it('renders only the documented join-message placeholders', () => {
    expect(formatMemberLifecycleTemplate(
      '**{user}** joined through {inviter} ({inviteCount}). {unknown}',
      { inviteCount: 7, inviter: 'Inviter', user: '<@123>' },
    )).toBe('**<@123>** joined through Inviter (7). {unknown}');
  });

  it('registers the temporary leave-information backfill as an administrator command', () => {
    const command = serializedCommandDefinitions().find((entry) => entry.name === 'temp');
    expect(command?.default_member_permissions).toBeDefined();
    expect(command?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'update-leave-info', type: 1 }),
      expect.objectContaining({ name: 'disboard-reminder-status', type: 1 }),
      expect.objectContaining({ name: 'invite-tracker-status', type: 1 }),
      expect.objectContaining({ name: 'import-invite-leaderboard', type: 1 }),
      expect.objectContaining({ name: 'import-invited-members', type: 1 }),
    ]));
  });

  it('registers a member-facing invite leaderboard with an optional user', () => {
    const command = serializedCommandDefinitions().find((entry) => entry.name === 'invite');
    expect(command?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'leaderboard',
        options: [expect.objectContaining({ name: 'user', required: false, type: 6 })],
        type: 1,
      }),
    ]));
  });

  it('parses Invite Tracker exports while ignoring fake invited members', () => {
    expect(parseInviteTrackerLeaderboardCsv([
      'user_id,invites,regular_invites,left_invites,fake_invites,bonus_invites',
      '12345678901234567,117,120,3,0,0',
    ].join('\n'))).toEqual([
      { inviteCount: 117, userId: '12345678901234567', username: null },
    ]);
    expect(parseInviteTrackerInvitedMembersCsv([
      'user_id,joined_at,fake,account_created_at',
      '12345678901234567,2026-11-01T12:00:00.000Z,false,2020-01-01T00:00:00.000Z',
      '12345678901234568,2026-11-02T12:00:00.000Z,true,2020-01-01T00:00:00.000Z',
    ].join('\n'))).toEqual([
      { joinedAt: new Date('2026-11-01T12:00:00.000Z'), userId: '12345678901234567' },
    ]);
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
});
