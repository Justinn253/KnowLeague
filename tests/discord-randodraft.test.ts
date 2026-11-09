import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { createDiscordRandodraft } from '../discord-bot/src/randodraft';
import { encodeDiscordRandodraftShare } from '../discord-bot/src/randodraft-share';
import { parseDraftHistoryInput } from '@/lib/randodraft-history';
import { decodeRandodraftShare } from '@/lib/randodraft-share';

const players = Array.from({ length: 10 }, (_, index) => ({
  displayName: `Player ${index + 1}`,
  userId: `discord-user-${index + 1}`,
}));

type SerializedCommandOption = {
  name: string;
  options?: SerializedCommandOption[];
  required?: boolean;
  type: number;
};

describe('Discord Randodraft', () => {
  it('registers ten optional player slots that can infer Wild Cards from gaps', () => {
    const league = serializedCommandDefinitions().find((command) => command.name === 'league') as { options?: SerializedCommandOption[] } | undefined;
    const randodraft = league?.options?.find((option) => option.type === 1 && option.name === 'randodraft');
    const playerOptions = randodraft?.options?.filter((option) => option.type === 6) ?? [];

    expect(randodraft).toBeDefined();
    expect(playerOptions).toHaveLength(10);
    expect(playerOptions.every((option) => !option.required)).toBe(true);
  });

  it('registers the voice-channel draft command with ten optional exclusions', () => {
    const league = serializedCommandDefinitions().find((command) => command.name === 'league') as { options?: SerializedCommandOption[] } | undefined;
    const randodraftVoice = league?.options?.find((option) => option.type === 1 && option.name === 'randodraft-vc');
    const exclusionOptions = randodraftVoice?.options?.filter((option) => option.type === 6) ?? [];

    expect(randodraftVoice).toBeDefined();
    expect(exclusionOptions).toHaveLength(10);
    expect(exclusionOptions.every((option) => !option.required)).toBe(true);
  });

  it('creates a website-valid two-team Summoner’s Rift draft with Random builds', () => {
    const draft = createDiscordRandodraft({
      gameMode: 'summoners-rift',
      players,
      teamCount: 2,
      random: () => 0.23,
    });

    expect(draft.settings).toMatchObject({ playersPerTeam: 5, randomBuildType: 'all', secondTeam: true });
    expect(draft.picks).toHaveLength(10);
    expect(new Set(draft.picks.map((pick) => pick.champion)).size).toBe(10);
    expect(new Set(draft.picks.slice(0, 5).map((pick) => pick.lane)).size).toBe(5);
    expect(new Set(draft.picks.slice(5).map((pick) => pick.lane)).size).toBe(5);
    expect(draft.picks.every((pick) => pick.type === 'Random' && pick.build.length === 6)).toBe(true);
    expect(parseDraftHistoryInput(draft)).toMatchObject({ id: draft.id, picks: draft.picks });
    expect(decodeRandodraftShare(encodeDiscordRandodraftShare(draft))).toMatchObject({ id: draft.id, picks: draft.picks });
  });

  it('uses no lanes for ARAM and rejects unsupported team sizes', () => {
    const draft = createDiscordRandodraft({
      gameMode: 'aram',
      players: players.slice(0, 4),
      teamCount: 1,
      random: () => 0.67,
    });

    expect(draft.picks.every((pick) => pick.lane === null)).toBe(true);
    expect(() => createDiscordRandodraft({ gameMode: 'aram', players: players.slice(0, 6), teamCount: 1 })).toThrow('One-team Randodrafts');
  });
});
