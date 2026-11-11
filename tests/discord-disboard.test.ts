import { describe, expect, it } from 'vitest';
import type { Message } from 'discord.js';
import type { DiscordBotConfig } from '../discord-bot/src/config';
import { isDisboardBumpSuccessText, isSuccessfulDisboardBump } from '../discord-bot/src/disboard';

const GUILD_ID = '123456789012345678';
const BUMP_CHANNEL_ID = '223456789012345678';
const config = { guildId: GUILD_ID } as DiscordBotConfig;

function disboardMessage(content: string, channelId = BUMP_CHANNEL_ID) {
  return {
    author: { id: '302050872383242240' },
    channelId,
    content,
    embeds: [],
    guildId: GUILD_ID,
    inGuild: () => true,
  } as unknown as Message;
}

describe('DISBOARD bump confirmations', () => {
  it('recognizes only successful confirmations in the configured server channel', () => {
    expect(isSuccessfulDisboardBump(config, disboardMessage('Bump done!'), BUMP_CHANNEL_ID)).toBe(true);
    expect(isSuccessfulDisboardBump(config, {
      ...disboardMessage(''),
      embeds: [{ description: 'Check it out on DISBOARD.', title: 'Bump done!' }],
    } as unknown as Message, BUMP_CHANNEL_ID)).toBe(true);
    expect(isSuccessfulDisboardBump(config, disboardMessage('You can bump again in 2 hours.'), BUMP_CHANNEL_ID)).toBe(false);
    expect(isSuccessfulDisboardBump(config, disboardMessage('Bump done!', '323456789012345678'), BUMP_CHANNEL_ID)).toBe(false);
    expect(isSuccessfulDisboardBump(config, disboardMessage('✅ <@123> bumped this server.'), BUMP_CHANNEL_ID)).toBe(true);
  });

  it('matches DISBOARD confirmation text without making cooldown messages eligible', () => {
    expect(isDisboardBumpSuccessText('BUMP DONE')).toBe(true);
    expect(isDisboardBumpSuccessText('A bump is available soon.')).toBe(false);
  });

  it('requires a successful bump phrase even when the sender metadata is unavailable', () => {
    expect(isSuccessfulDisboardBump(config, {
      ...disboardMessage('A normal bump is available.'),
      author: { id: '999999999999999999' },
    } as unknown as Message, BUMP_CHANNEL_ID)).toBe(false);
    expect(isSuccessfulDisboardBump(config, {
      ...disboardMessage('Bumped early with DISBOARD Pro.'),
      author: { id: '999999999999999999' },
    } as unknown as Message, BUMP_CHANNEL_ID)).toBe(true);
  });
});
