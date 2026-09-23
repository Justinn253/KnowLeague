import { describe, expect, it } from 'vitest';
import { AUGMENT_ICONS, emptyAugment, parseAugmentDraft, parseAugmentText } from '../lib/augment-builder';

const id = '8d73d0ad-3880-4e58-9d5a-20c9674b5bbc';
describe('augment content validation', () => {
  it('restores unfinished drafts but refuses to publish empty cards', () => {
    expect(parseAugmentDraft(emptyAugment(id))).not.toBeNull();
    expect(parseAugmentDraft(emptyAugment(id), true)).toBeNull();
  });
  it('rejects arbitrary image sources, bad IDs, and excessive content', () => {
    expect(parseAugmentDraft({ ...emptyAugment(id), icon: 'https://example.org/tracker' })).toBeNull();
    expect(parseAugmentDraft({ ...emptyAugment(id), id: '../secret' })).toBeNull();
    expect(parseAugmentDraft({ ...emptyAugment(id), description: 'x'.repeat(651) })).toBeNull();
    expect(parseAugmentDraft(null)).toBeNull();
    expect(parseAugmentDraft({ ...emptyAugment(id), name: 'Line one\nLine two' })).toBeNull();
    expect(
      parseAugmentDraft({ ...emptyAugment(id), name: 'Title', description: 'Line\n'.repeat(13) }, true),
    ).toBeNull();
  });
  it('removes untrusted metadata and validates a completed blank-canvas design', () => {
    const parsed = parseAugmentDraft({ ...emptyAugment(id), creator_id: 'spoofed' });
    expect(parsed).not.toHaveProperty('creator_id');
    expect(parseAugmentDraft({ ...emptyAugment(id), name: 'Title', description: 'An effect' }, true)).not.toBeNull();
    expect(new Set(AUGMENT_ICONS.map((icon) => icon.id)).size).toBe(AUGMENT_ICONS.length);
  });
});
describe('rarity and optional details', () => {
  it('starts with a matching silver icon and clears incompatible restored selections', () => {
    const draft = emptyAugment(id);
    expect(AUGMENT_ICONS.find((icon) => icon.id === draft.icon)?.rarity).toBe('silver');
    expect(parseAugmentDraft({ ...draft, rarity: 'prismatic' })?.icon).toBe('');
    expect(parseAugmentDraft({ ...draft, icon: '' })?.icon).toBe('');
    expect(parseAugmentDraft({ ...draft, rarity: 'prismatic', name: 'Title', description: 'Effect' }, true)).toBeNull();
  });
  it('restores old combined details into Notes without losing draft text', () => {
    const { notes, ...draft } = emptyAugment(id);
    expect(notes).toBe('');
    expect(parseAugmentDraft({ ...draft, details: 'Old requirements and notes' })?.notes).toBe(
      'Old requirements and notes',
    );
  });
  it('retains disabled field drafts and rejects invalid toggle values or oversized notes', () => {
    const draft = { ...emptyAugment(id), questRequirements: 'Win 10 fights', questEnabled: false };
    expect(parseAugmentDraft(draft)?.questRequirements).toBe('Win 10 fights');
    expect(parseAugmentDraft({ ...draft, questEnabled: 'yes' })).toBeNull();
    expect(parseAugmentDraft({ ...draft, notes: 'x'.repeat(1201) })).toBeNull();
  });
});
describe('safe League formatting', () => {
  it('supports stat colors, icons, bold text, and line breaks', () => {
    const runs = parseAugmentText('[bold]Quest:[/bold]\nGain [ap]100 AP[/ap] [icon:health]');
    expect(runs[0]).toMatchObject({ text: 'Quest:', bold: true });
    expect(runs.find((run) => run.text === '100 AP')?.color).toBe('#7c8cff');
    expect(runs.at(-1)?.text).toBe('♥');
  });
  it('keeps HTML and unsupported syntax as inert text', () => {
    const value = '<script>alert(1)</script>[url]evil[/url]';
    expect(parseAugmentText(value)).toEqual([{ text: value, color: '#f0eee6' }]);
  });
});


describe('expanded inline icon support', () => {
  it('parses new game symbols while keeping unsupported tokens inert', () => {
    const keys = ['ranged', 'melee', 'level', 'attackspeed', 'mana', 'crit', 'range', 'tenacity', 'lifesteal', 'mpen'];
    for (const key of keys) expect(parseAugmentText('[icon:' + key + ']')[0]?.icon).toBe(key);
    expect(parseAugmentText('[icon:unknown]')[0]).toEqual({ text: '[icon:unknown]', color: '#f0eee6' });
    expect(parseAugmentDraft({ ...emptyAugment(id), name: 'Empty effect', description: '[health][/health]' }, true)).toBeNull();
  });
});
