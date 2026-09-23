import officialCatalogue from '@/data/catalogs/official-augments.json';
import { AUGMENT_ICONS, AUGMENT_RARITIES, type AugmentDraft, type AugmentRarity } from '@/lib/augment-builder';

export type OfficialAugment = (typeof officialCatalogue.augments)[number];
export type OfficialAugmentRatings = {
  upvotes: number;
  downvotes: number;
  averageTier: number | null;
  tierVotes: number;
  viewerReaction: -1 | 1 | null;
  viewerTier: number | null;
};

const fallbackIcons = new Map(
  AUGMENT_RARITIES.map((rarity) => [rarity, AUGMENT_ICONS.find((icon) => icon.rarity === rarity)?.id ?? '']),
);

export function officialAugmentToDraft(record: OfficialAugment): AugmentDraft {
  const rarity = record.rarity as AugmentRarity;
  return {
    id: record.id,
    rarity,
    icon: record.icon || fallbackIcons.get(rarity) || '',
    name: record.name,
    description: record.shortDescription || record.description,
    questRequirements: '',
    questEnabled: false,
    restrictions: '',
    restrictionsEnabled: false,
    notes: '',
    longDescription: '',
  };
}
