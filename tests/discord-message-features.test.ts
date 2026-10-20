import { describe, expect, it } from 'vitest';
import { extractCustomEmojiReferences } from '../discord-bot/src/emoji-import';
import { isDisboardBumpSuccessText } from '../discord-bot/src/disboard';
import { isMessageLotteryWinner, messageLotteryRewardForRoll } from '../discord-bot/src/message-rewards';
import { formatSnipedMessage, getSnipeImageAttachments } from '../discord-bot/src/snipe';

describe('Discord message-linked KnowBucks rewards', () => {
  it('uses the requested one-percent trigger and weighted reward tiers', () => {
    expect(isMessageLotteryWinner(0)).toBe(true);
    expect(isMessageLotteryWinner(1)).toBe(false);

    expect(messageLotteryRewardForRoll(0).amount).toBe(1_000);
    expect(messageLotteryRewardForRoll(74).amount).toBe(1_000);
    expect(messageLotteryRewardForRoll(75).amount).toBe(2_500);
    expect(messageLotteryRewardForRoll(89).amount).toBe(2_500);
    expect(messageLotteryRewardForRoll(90).amount).toBe(5_000);
    expect(messageLotteryRewardForRoll(94).amount).toBe(5_000);
    expect(messageLotteryRewardForRoll(95).amount).toBe(10_000);
    expect(messageLotteryRewardForRoll(98).amount).toBe(10_000);
    expect(messageLotteryRewardForRoll(99).amount).toBe(25_000);
  });
});

describe('Discord external emoji import parsing', () => {
  it('finds unique static and animated custom emoji while ignoring unicode emoji', () => {
    expect(extractCustomEmojiReferences('âœ¨ <:static_name:123456789012345678> <a:animated_name:234567890123456789> <:static_name:123456789012345678>')).toEqual([
      { animated: false, id: '123456789012345678', name: 'static_name' },
      { animated: true, id: '234567890123456789', name: 'animated_name' },
    ]);
  });
});

describe('DISBOARD confirmation detection', () => {
  it('requires the explicit successful confirmation rather than a generic bump mention', () => {
    expect(isDisboardBumpSuccessText('Bump done! Check it out on DISBOARD.')).toBe(true);
    expect(isDisboardBumpSuccessText('Please wait before your next bump.')).toBe(false);
  });
});

describe('Snipe attachment presentation', () => {
  it('previews image attachments and retains non-image attachments as named links', () => {
    const sniped = {
      attachments: [
        { isImage: true, name: 'deleted-image.png', url: 'https://cdn.discordapp.com/attachments/image.png' },
        { isImage: false, name: 'notes.pdf', url: 'https://cdn.discordapp.com/attachments/notes.pdf' },
      ],
      authorDisplayName: 'Member',
      content: 'Deleted content',
      deletedAt: 1,
      sentAt: 1,
    };

    expect(getSnipeImageAttachments(sniped)).toEqual([sniped.attachments[0]]);
    expect(formatSnipedMessage(sniped)).not.toContain('deleted-image.png');
    expect(formatSnipedMessage(sniped)).toContain('[notes.pdf](https://cdn.discordapp.com/attachments/notes.pdf)');
  });
});
