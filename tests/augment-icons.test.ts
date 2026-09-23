// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogs/augment-icons.json';
import silverGroups from '../data/catalogs/augment-silver-icon-groups.json';
import goldGroups from '../data/catalogs/augment-gold-icon-groups.json';
import prismaticGroups from '../data/catalogs/augment-prismatic-icon-groups.json';
import officialCatalogue from '../data/catalogs/official-augments.json';
import {
  AUGMENT_ICONS,
  emptyAugment,
  parseAugmentDraft,
  resolveAugmentIconId,
  type AugmentRarity,
} from '../lib/augment-builder';

describe('unique augment artwork', () => {
  it('ships exactly one PNG per distinct decoded image', () => {
    const hashes = new Set<string>();
    for (const icon of AUGMENT_ICONS) {
      const png = PNG.sync.read(readFileSync(`public/augments/icons/${icon.id}.png`));
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) png.data.fill(0, i, i + 3);
      }
      const hash = createHash('sha256').update(`${png.width}x${png.height}:`).update(png.data).digest('hex');
      expect(hashes.has(hash), `Duplicate pixels for ${icon.id}`).toBe(false);
      hashes.add(hash);
    }
    const files = readdirSync('public/augments/icons').filter((name) => name.endsWith('.png'));
    expect(files.sort()).toEqual(AUGMENT_ICONS.map((icon) => `${icon.id}.png`).sort());
  }, 15000);

  it('preserves all removed IDs for saved drafts and resolves directly to existing artwork', () => {
    const draft = emptyAugment('8d73d0ad-3880-4e58-9d5a-20c9674b5bbc');
    for (const [alias, target] of Object.entries(catalogue.aliases)) {
      const rarity = AUGMENT_ICONS.find((entry) => entry.id === target)?.rarity;
      if (rarity)
        expect(parseAugmentDraft({ ...draft, rarity: rarity as AugmentRarity, icon: alias })?.icon).toBe(alias);
      expect(resolveAugmentIconId(alias)).toBe(target);
      expect(resolveAugmentIconId(target)).toBe(target);
      const icon = AUGMENT_ICONS.find((entry) => entry.id === target);
      expect(icon).toBeDefined();
      expect(icon?.searchTerms).toContain(alias);
    }
  });
});


describe('reviewed silver icon labels and artwork families', () => {
  it('covers each silver image exactly once and keeps each central artwork family contiguous', () => {
    const silver = AUGMENT_ICONS.filter((icon) => icon.rarity === 'silver').sort((a, b) => a.visualOrder - b.visualOrder);
    const reviewed = silverGroups.flatMap((group) => group.icons);
    expect(new Set(reviewed.map((icon) => icon.id)).size).toBe(reviewed.length);
    expect(silver.map((icon) => icon.id)).toEqual(reviewed.map((icon) => icon.id));
    expect(silver.map((icon) => icon.name)).toEqual(reviewed.map((icon) => icon.name));
    expect(silver.every((icon) => !/Cherry_|_name| large$/i.test(icon.name))).toBe(true);
    expect(silver.some((icon) => icon.id === 'augment404_large')).toBe(false);
  });

  it('keeps old joined labels searchable after display names are corrected', () => {
    const icon = AUGMENT_ICONS.find((entry) => entry.id === 'kiwi_dontchangethechannel_large');
    expect(icon?.name).toBe("Don't Change the Channel");
    expect(icon?.searchTerms).toContain('dontchangethechannel');
    expect(icon?.searchTerms).toContain("Don't Change the Channel");
  });

  it('groups matching glyphs across different names and separates different artwork with the same name', () => {
    const family = (id: string) => silverGroups.find((group) => group.icons.some((icon) => icon.id === id))?.family;
    expect(family('adapt_large')).toBe(family('juicepress_large'));
    expect(family('kiwi_puristcaster_large')).toBe(family('witchfulthinking_large.2v2_mode_fighters'));
    expect(family('witchfulthinking_large.arena_augments_v2')).not.toBe(family('witchfulthinking_large.2v2_mode_fighters'));
    expect(family('buffbuddies_large')).toBe(family('kiwi_snowday_large'));
  });
});


describe('reviewed gold icon labels and artwork families', () => {
  it('covers every gold image exactly once in contiguous central-artwork groups', () => {
    const gold = AUGMENT_ICONS.filter((icon) => icon.rarity === 'gold').sort((a, b) => a.visualOrder - b.visualOrder);
    const reviewed = goldGroups.flatMap((group) => group.icons);
    expect(new Set(reviewed.map((icon) => icon.id)).size).toBe(reviewed.length);
    expect(gold.map((icon) => ({ id: icon.id, name: icon.name }))).toEqual(reviewed);
    expect(gold.every((icon) => !/Cherry_|_name| large$|^Name /i.test(icon.name))).toBe(true);
  });

  it('retains old search labels while grouping by glyph instead of shared names', () => {
    const icon = AUGMENT_ICONS.find((entry) => entry.id === 'slowandsteady_large');
    expect(icon?.name).toBe('Slow and Steady');
    expect(icon?.searchTerms).toContain('slowandsteady large');
    expect(icon?.searchTerms).toContain('Slow and Steady');
    const family = (id: string) => goldGroups.find((group) => group.icons.some((entry) => entry.id === id))?.family;
    expect(family('slowandsteady_large')).toBe(family('kiwi_upgradesheen_large'));
    expect(family('vanish_large')).toBe(family('tricksterdemon_large'));
    expect(family('vanish_large')).not.toBe(family('vanish_large.arena_augments_v2'));
  });
});


describe('reviewed prismatic icon labels and artwork families', () => {
  it('covers every prismatic image exactly once in contiguous central-artwork groups', () => {
    const icons = AUGMENT_ICONS.filter((icon) => icon.rarity === 'prismatic').sort((a, b) => a.visualOrder - b.visualOrder);
    const reviewed = prismaticGroups.flatMap((group) => group.icons);
    expect(new Set(reviewed.map((icon) => icon.id)).size).toBe(reviewed.length);
    expect(icons.map((icon) => ({ id: icon.id, name: icon.name }))).toEqual(reviewed);
    expect(icons.every((icon) => !/Cherry_|_name| large$/i.test(icon.name))).toBe(true);
  });

  it('preserves old search labels and groups shared glyphs independently of names', () => {
    const icon = AUGMENT_ICONS.find((entry) => entry.id === 'bulletheaven_large');
    expect(icon?.name).toBe('Bullet Heaven');
    expect(icon?.searchTerms).toContain('bulletheaven large');
    expect(icon?.searchTerms).toContain('Bullet Heaven');
    const family = (id: string) => prismaticGroups.find((group) => group.icons.some((entry) => entry.id === id))?.family;
    expect(family('bulletheaven_large')).toBe(family('clowncollege_large'));
    expect(family('kiwi_goldensnowball_large')).toBe(family('pandoras_box_large'));
    expect(family('wisdomofages_large.arena_augments_v2')).not.toBe(family('wisdomofages_large.2v2_mode_fighters'));
  });
});


describe('official augment archive', () => {
  it('contains current records and excludes historical augments', () => {
    const records = officialCatalogue.augments;
    expect(records.length).toBeGreaterThan(200);
    expect(records.every((record) => record.current)).toBe(true);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    expect(records.every((record) => ['silver', 'gold', 'prismatic'].includes(record.rarity))).toBe(true);
    expect(records.every((record) => record.name.trim() && record.description.trim() && record.shortDescription.trim())).toBe(true);
  });
});


