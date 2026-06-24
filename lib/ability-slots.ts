import type { QuizItem } from '@/lib/quiz';

export const ABILITY_SLOTS = [
  { id: 'p', label: 'P', name: 'Passive' },
  { id: 'q', label: 'Q', name: 'Ability 1' },
  { id: 'w', label: 'W', name: 'Ability 2' },
  { id: 'e', label: 'E', name: 'Ability 3' },
  { id: 'r', label: 'R', name: 'Ultimate' },
] as const;

export type AbilitySlotId = (typeof ABILITY_SLOTS)[number]['id'];
export type AbilitySlotState = Record<AbilitySlotId, boolean>;

export const ALL_ABILITY_SLOT_IDS = ABILITY_SLOTS.map((slot) => slot.id);

export function formatAbilitySlotSelection(selectedSlots: readonly AbilitySlotId[]) {
  const orderedSlots = ALL_ABILITY_SLOT_IDS.filter((slot) => selectedSlots.includes(slot));
  if (orderedSlots.length === ALL_ABILITY_SLOT_IDS.length) return 'All Abilities';
  const labels = orderedSlots.map((slot) => slot.toUpperCase()).join(', ');
  return orderedSlots.length === 1 ? `[${labels}]` : `Abilities: [${labels}]`;
}

export function getAbilitySlotId(item: QuizItem): AbilitySlotId {
  if (item.type === 'passive') return 'p';
  if (item.type === 'ultimate') return 'r';
  const match = item.id.match(/-spell-(\d+)$/);
  return ['q', 'w', 'e', 'r'][match ? Number(match[1]) : 0] as AbilitySlotId;
}

export function filterItemsByAbilitySlots(items: readonly QuizItem[], selectedSlots: readonly AbilitySlotId[] | AbilitySlotState) {
  const selected = new Set(Array.isArray(selectedSlots)
    ? selectedSlots as readonly AbilitySlotId[]
    : ALL_ABILITY_SLOT_IDS.filter((slot) => (selectedSlots as AbilitySlotState)[slot]));
  return items.filter((item) => selected.has(getAbilitySlotId(item)));
}
