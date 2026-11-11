import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { formatMemberLifecycleTemplate } from '../discord-bot/src/member-lifecycle';

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
    ]));
  });
});
