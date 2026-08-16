import { getRiftboundCardById } from '@/lib/riftbound';
import { RIFTBOUND_BINDER_PAGE_COUNT, RIFTBOUND_BINDER_SLOT_COUNT, type RiftboundBinder, type RiftboundBinderFinish, type RiftboundBinderPage } from '@/lib/riftbound-binders';

export const RIFTBOUND_BINDER_EXPORT_TYPE = 'knowleague-riftbound-binder';
export const RIFTBOUND_BINDER_EXPORT_VERSION = 1;

export type RiftboundBinderExport = {
  type: typeof RIFTBOUND_BINDER_EXPORT_TYPE;
  version: typeof RIFTBOUND_BINDER_EXPORT_VERSION;
  binder: {
    name: string;
    description: string;
    pages: Array<{
      pageNumber: number;
      name: string;
      slots: Array<{ slotIndex: number; cardId: string; finish: RiftboundBinderFinish }>;
    }>;
  };
};

function readText(value: unknown, field: string, maxLength: number, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  return text;
}

export function createRiftboundBinderExport(binder: RiftboundBinder): RiftboundBinderExport {
  return {
    type: RIFTBOUND_BINDER_EXPORT_TYPE,
    version: RIFTBOUND_BINDER_EXPORT_VERSION,
    binder: {
      name: binder.name,
      description: binder.description,
      pages: binder.pages.map((page) => ({
        pageNumber: page.page_number,
        name: page.name,
        slots: page.slots.map((slot) => ({ slotIndex: slot.slot_index, cardId: slot.card_id, finish: slot.finish })),
      })),
    },
  };
}

export function parseRiftboundBinderExport(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('This file is not a Riftbound binder export.');
  const candidate = value as Partial<RiftboundBinderExport>;
  if (candidate.type !== RIFTBOUND_BINDER_EXPORT_TYPE || candidate.version !== RIFTBOUND_BINDER_EXPORT_VERSION || !candidate.binder || typeof candidate.binder !== 'object') {
    throw new Error('This file is not a supported Riftbound binder export.');
  }

  const binder = candidate.binder as Partial<RiftboundBinderExport['binder']>;
  const name = readText(binder.name, 'Binder name', 80, 'Imported Binder');
  const description = readText(binder.description, 'Binder description', 500);
  if (!Array.isArray(binder.pages) || binder.pages.length !== RIFTBOUND_BINDER_PAGE_COUNT) {
    throw new Error(`A binder export must include all ${RIFTBOUND_BINDER_PAGE_COUNT} pages.`);
  }

  const pageNumbers = new Set<number>();
  const pages = binder.pages.map((rawPage) => {
    if (!rawPage || typeof rawPage !== 'object') throw new Error('The binder export contains an invalid page.');
    const page = rawPage as Partial<RiftboundBinderExport['binder']['pages'][number]>;
    const pageNumber = page.pageNumber;
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > RIFTBOUND_BINDER_PAGE_COUNT || pageNumbers.has(pageNumber)) {
      throw new Error('The binder export contains an invalid page number.');
    }
    pageNumbers.add(pageNumber);
    const pageName = readText(page.name, 'Page name', 80, `Page ${pageNumber}`) || `Page ${pageNumber}`;
    if (!Array.isArray(page.slots) || page.slots.length > RIFTBOUND_BINDER_SLOT_COUNT) throw new Error('A binder page cannot contain more than nine cards.');
    const slotIndexes = new Set<number>();
    const slots = page.slots.map((rawSlot) => {
      if (!rawSlot || typeof rawSlot !== 'object') throw new Error('The binder export contains an invalid slot.');
      const slot = rawSlot as Partial<RiftboundBinderExport['binder']['pages'][number]['slots'][number]>;
      const slotIndex = slot.slotIndex;
      if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= RIFTBOUND_BINDER_SLOT_COUNT || slotIndexes.has(slotIndex)) throw new Error('The binder export contains an invalid slot number.');
      slotIndexes.add(slotIndex);
      if (typeof slot.cardId !== 'string' || !getRiftboundCardById(slot.cardId)) throw new Error('The binder export contains an unknown card.');
      if (slot.finish !== 'normal' && slot.finish !== 'foil') throw new Error('The binder export contains an invalid finish.');
      const card = getRiftboundCardById(slot.cardId);
      if (!card?.finishOptions.includes(slot.finish)) throw new Error('The binder export contains an unavailable finish.');
      return { slotIndex, cardId: slot.cardId, finish: slot.finish };
    });
    return { pageNumber, name: pageName, slots };
  }).sort((left, right) => left.pageNumber - right.pageNumber);

  return { name, description, pages };
}

export function binderPagesFromExport(binder: ReturnType<typeof parseRiftboundBinderExport>, pages: RiftboundBinderPage[]) {
  const importedPages = new Map(binder.pages.map((page) => [page.pageNumber, page]));
  return pages.map((page) => {
    const imported = importedPages.get(page.page_number);
    return imported ? { ...page, name: imported.name } : page;
  });
}
