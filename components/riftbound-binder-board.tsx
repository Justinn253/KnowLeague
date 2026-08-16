'use client';

import { ChevronLeft, ChevronRight, GripVertical, Plus, Save, Share2, Trash2, X } from 'lucide-react';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundBinderToolsModal } from '@/components/riftbound-binder-tools-modal';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { parseRiftboundBinderExport } from '@/lib/riftbound-binder-json';
import { getRiftboundCardRarityTextClass, type RiftboundCard } from '@/lib/riftbound';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import {
  RIFTBOUND_BINDER_PAGE_COUNT,
  RIFTBOUND_BINDER_SLOT_COUNT,
  type RiftboundBinder,
  type RiftboundBinderFinish,
  type RiftboundBinderPage,
  type RiftboundBinderSlot,
} from '@/lib/riftbound-binders';

type BinderBoardProps = {
  binders: RiftboundBinder[];
  cards: RiftboundCard[];
  session: Session;
  onBindersChange: (binders: RiftboundBinder[]) => void;
};

type BinderMutationResponse = {
  binders?: RiftboundBinder[];
  binder?: { id?: string };
  error?: string;
};

type SortMode = 'name-asc' | 'number-asc';
type NavigationMode = 'scroll' | 'paginate';
type SlotPosition = { pageNumber: number; slotIndex: number };
type DragPayload = { cardId?: unknown; finish?: unknown; source?: { pageNumber?: unknown; slotIndex?: unknown } };

const sortOptions: AppSelectOption<SortMode>[] = [
  { value: 'name-asc', label: 'Name · A to Z' },
  { value: 'number-asc', label: 'Number · Ascending' },
];

const navigationOptions: AppSelectOption<NavigationMode>[] = [
  { value: 'scroll', label: 'Horizontal Scroll' },
  { value: 'paginate', label: 'Paginated Pages' },
];

function updateBinderCollection(binders: RiftboundBinder[], binderId: string, update: (binder: RiftboundBinder) => RiftboundBinder) {
  return binders.map((binder) => binder.id === binderId ? update(binder) : binder);
}

function updateBinderPage(binder: RiftboundBinder, pageNumber: number, update: (page: RiftboundBinderPage) => RiftboundBinderPage) {
  return {
    ...binder,
    pages: binder.pages.map((page) => page.page_number === pageNumber ? update(page) : page),
    updated_at: new Date().toISOString(),
  };
}

function getPageSlots(page: RiftboundBinderPage) {
  return new Map(page.slots.map((slot) => [slot.slot_index, slot]));
}

function getFirstEmptySlot(page: RiftboundBinderPage) {
  const occupied = getPageSlots(page);
  return Array.from({ length: RIFTBOUND_BINDER_SLOT_COUNT }, (_, index) => index).find((index) => !occupied.has(index));
}

export function RiftboundBinderBoard({ binders, cards, session, onBindersChange }: BinderBoardProps) {
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(binders[0]?.id ?? null);
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('scroll');
  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [placementCardId, setPlacementCardId] = useState<string | null>(null);
  const [draggingCatalogueCardId, setDraggingCatalogueCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(false);
  const [error, setError] = useState('');
  const savedBinderRef = useRef<RiftboundBinder | null>(null);
  const binderViewportRef = useRef<HTMLDivElement | null>(null);
  const binderSectionRef = useRef<HTMLElement | null>(null);
  const dragScrollRef = useRef<{ clientX: number; frame: number | null } | null>(null);
  const binderPointerDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; active: boolean } | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [hoveredSlot, setHoveredSlotState] = useState<SlotPosition | null>(null);
  const hoveredSlotRef = useRef<SlotPosition | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const selectedBinder = binders.find((binder) => binder.id === selectedBinderId) ?? binders[0] ?? null;
  const deferredQuery = useDeferredValue(query);

  const updateHoveredSlot = (next: SlotPosition | null) => {
    const current = hoveredSlotRef.current;
    if (current?.pageNumber === next?.pageNumber && current?.slotIndex === next?.slotIndex) return;
    hoveredSlotRef.current = next;
    setHoveredSlotState(next);
  };

  useEffect(() => {
    if (!pendingChanges && selectedBinder) savedBinderRef.current = selectedBinder;
  }, [pendingChanges, selectedBinder]);

  useEffect(() => {
    if (!selectedBinderId || !binders.some((binder) => binder.id === selectedBinderId)) {
      setSelectedBinderId(binders[0]?.id ?? null);
      setActivePageNumber(1);
    }
  }, [binders, selectedBinderId]);

  useEffect(() => {
    const viewport = binderViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;
    const updateWidth = () => setPageWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [selectedBinder?.id, navigationMode]);

  useEffect(() => {
    if (!placementCardId) return undefined;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-binder-placement-menu]')) {
        setPlacementCardId(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [placementCardId]);

  useEffect(() => {
    const updateDragPosition = (event: globalThis.DragEvent) => {
      const dragScroll = dragScrollRef.current;
      if (dragScroll) dragScroll.clientX = event.clientX;
    };
    window.addEventListener('dragover', updateDragPosition);
    return () => window.removeEventListener('dragover', updateDragPosition);
  }, []);

  const setOptions = useMemo<AppSelectOption<string>[]>(() => [
    { value: 'all', label: 'All Sets' },
    ...Array.from(new Map(cards.map((card) => [card.setCode, card.setName])).entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, label]) => ({ value, label: `${value} · ${label}` })),
  ], [cards]);
  const rarityOptions = useMemo<AppSelectOption<string>[]>(() => [
    { value: 'all', label: 'All Rarities' },
    ...Array.from(new Set(cards.map((card) => card.rarity))).map((value) => ({ value, label: value })),
  ], [cards]);
  const typeOptions = useMemo<AppSelectOption<string>[]>(() => [
    { value: 'all', label: 'All Card Types' },
    ...Array.from(new Set(cards.map((card) => card.cardType))).sort().map((value) => ({ value, label: value })),
  ], [cards]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return cards
      .filter((card) => {
        if (setFilter !== 'all' && card.setCode !== setFilter) return false;
        if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false;
        if (typeFilter !== 'all' && card.cardType !== typeFilter) return false;
        if (!normalizedQuery) return true;
        return [card.displayName, card.name, card.fullName, card.setCode, card.setName, card.numberLabel, card.rarity, card.cardType, ...card.tags, ...card.domains]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sortMode === 'name-asc') return left.displayName.localeCompare(right.displayName);
        if (sortMode === 'number-asc') return left.setCode.localeCompare(right.setCode) || left.collectorNumber.localeCompare(right.collectorNumber, undefined, { numeric: true });
        return left.setCode.localeCompare(right.setCode) || left.collectorNumber.localeCompare(right.collectorNumber, undefined, { numeric: true });
      });
  }, [cards, deferredQuery, rarityFilter, setFilter, sortMode, typeFilter]);

  const requestMutation = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/riftbound/binders', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as BinderMutationResponse;
    if (!response.ok) throw new Error(data.error || 'Unable to update this binder.');
    if (data.binders) onBindersChange(data.binders);
    return data;
  };

  const saveBinderDetails = async (nextName: string, nextDescription: string) => {
    if (!selectedBinder || !nextName.trim() || pendingChanges) return;
    setSaving(true);
    setError('');
    try {
      await requestMutation({ action: 'binder', binderId: selectedBinder.id, name: nextName.trim(), description: nextDescription.trim() });
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to save this binder.');
    } finally {
      setSaving(false);
    }
  };

  const deleteBinder = async () => {
    if (!selectedBinder || !window.confirm(`Reset ${selectedBinder.name} to its default empty binder?`)) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/riftbound/binders', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ binderId: selectedBinder.id }),
      });
      const data = await response.json() as BinderMutationResponse & { resetBinderId?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to delete this binder.');
      if (data.binders) onBindersChange(data.binders);
      setPendingChanges(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to delete this binder.');
    } finally {
      setSaving(false);
    }
  };

  const savePageName = (page: RiftboundBinderPage, nextName: string) => {
    if (!selectedBinder || !nextName.trim() || nextName.trim() === page.name) return;
    onBindersChange(updateBinderCollection(binders, selectedBinder.id, (binder) => updateBinderPage(binder, page.page_number, (current) => ({ ...current, name: nextName.trim() }))));
    setPendingChanges(true);
  };

  const saveSlot = (pageNumber: number, slotIndex: number, cardId: string | null, finish: RiftboundBinderFinish = 'normal') => {
    if (!selectedBinder) return;
    const nextBinders = updateBinderCollection(binders, selectedBinder.id, (binder) => updateBinderPage(binder, pageNumber, (page) => ({
      ...page,
      slots: cardId === null
        ? page.slots.filter((slot) => slot.slot_index !== slotIndex)
        : [...page.slots.filter((slot) => slot.slot_index !== slotIndex), { slot_index: slotIndex, card_id: cardId, finish }].sort((left, right) => left.slot_index - right.slot_index),
    })));
    onBindersChange(nextBinders);
    setPendingChanges(true);
  };

  const saveSlotMove = (source: SlotPosition, target: SlotPosition) => {
    if (!selectedBinder || (source.pageNumber === target.pageNumber && source.slotIndex === target.slotIndex)) return;
    const binder = selectedBinder;
    const sourcePage = binder.pages.find((page) => page.page_number === source.pageNumber);
    const targetPage = binder.pages.find((page) => page.page_number === target.pageNumber);
    const sourceSlot = sourcePage?.slots.find((slot) => slot.slot_index === source.slotIndex);
    const targetSlot = targetPage?.slots.find((slot) => slot.slot_index === target.slotIndex) ?? null;
    if (!sourcePage || !targetPage || !sourceSlot) return;
    const sourceSlotValue = sourceSlot;

    const replaceSlot = (page: RiftboundBinderPage, slotIndex: number, slot: RiftboundBinderSlot | null) => ({
      ...page,
      slots: [...page.slots.filter((current) => current.slot_index !== slotIndex), ...(slot ? [{ ...slot, slot_index: slotIndex }] : [])].sort((left, right) => left.slot_index - right.slot_index),
    });
    const nextBinders = updateBinderCollection(binders, binder.id, (currentBinder) => ({
      ...currentBinder,
      updated_at: new Date().toISOString(),
      pages: currentBinder.pages.map((page) => {
        if (page.page_number === source.pageNumber && page.page_number === target.pageNumber) {
          return replaceSlot(replaceSlot(page, source.slotIndex, targetSlot), target.slotIndex, sourceSlotValue);
        }
        if (page.page_number === source.pageNumber) return replaceSlot(page, source.slotIndex, targetSlot);
        if (page.page_number === target.pageNumber) return replaceSlot(page, target.slotIndex, sourceSlotValue);
        return page;
      }),
    }));
    onBindersChange(nextBinders);
    setPendingChanges(true);
  };

  const saveBinderChanges = async () => {
    if (!selectedBinder || !pendingChanges) return;
    setSaving(true);
    setError('');
    try {
      await requestMutation({
        action: 'save',
        binderId: selectedBinder.id,
        pages: selectedBinder.pages.map((page) => ({
          pageNumber: page.page_number,
          pageName: page.name,
          slots: page.slots.map((slot) => ({ slotIndex: slot.slot_index, cardId: slot.card_id, finish: slot.finish })),
        })),
      });
      setPendingChanges(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to save this binder.');
    } finally {
      setSaving(false);
    }
  };

  const stopBinderEdgeScroll = () => {
    const dragScroll = dragScrollRef.current;
    if (dragScroll?.frame !== null && dragScroll?.frame !== undefined) window.cancelAnimationFrame(dragScroll.frame);
    dragScrollRef.current = null;
  };

  const runBinderEdgeScroll = () => {
    const dragScroll = dragScrollRef.current;
    const viewport = binderViewportRef.current;
    if (!dragScroll || !viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const edge = bounds.width * 0.2;
    const maxSpeed = 20;
    let distance = 0;
    if (dragScroll.clientX >= bounds.left && dragScroll.clientX <= bounds.right) {
      if (dragScroll.clientX < bounds.left + edge) distance = -maxSpeed * ((bounds.left + edge - dragScroll.clientX) / edge);
      else if (dragScroll.clientX > bounds.right - edge) distance = maxSpeed * ((dragScroll.clientX - (bounds.right - edge)) / edge);
    }
    if (distance !== 0) {
      viewport.scrollLeft += distance;
      dragScroll.frame = window.requestAnimationFrame(runBinderEdgeScroll);
    } else {
      dragScroll.frame = null;
    }
  };

  const handleBinderDragOver = (event: DragEvent<HTMLDivElement>, pageNumber?: number, slotIndex?: number) => {
    event.preventDefault();
    if (typeof pageNumber === 'number' && typeof slotIndex === 'number') updateHoveredSlot({ pageNumber, slotIndex });
    const current = dragScrollRef.current ?? { clientX: event.clientX, frame: null };
    current.clientX = event.clientX;
    dragScrollRef.current = current;
    if (current.frame === null) current.frame = window.requestAnimationFrame(runBinderEdgeScroll);
  };

  const handleBinderSlotDragLeave = () => {
    updateHoveredSlot(null);
  };

  const handleCardDragStart = (event: DragEvent<HTMLElement>, cardId: string, finish: RiftboundBinderFinish = 'normal', source?: SlotPosition) => {
    if (!source) setDraggingCatalogueCardId(cardId);
    dragScrollRef.current = { clientX: event.clientX, frame: null };
    event.dataTransfer.effectAllowed = source ? 'move' : 'copy';
    event.dataTransfer.setData('application/x-riftbound-binder-card', JSON.stringify({ cardId, finish, source }));
    if (!source) binderSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  const handleCardDragEnd = () => {
    stopBinderEdgeScroll();
    updateHoveredSlot(null);
    setDraggingCatalogueCardId(null);
  };

  const handleBinderPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (navigationMode !== 'scroll' || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-binder-card], button, input, textarea, select, a, [contenteditable="true"], [data-binder-placement-menu]')) return;
    binderPointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      active: false,
    };
  };

  const handleBinderPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointerDrag = binderPointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const distance = event.clientX - pointerDrag.startX;
    if (!pointerDrag.active) {
      if (Math.abs(distance) < 5) return;
      pointerDrag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = pointerDrag.startScrollLeft - distance;
  };

  const handleBinderPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pointerDrag = binderPointerDragRef.current;
    if (pointerDrag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      binderPointerDragRef.current = null;
    }
  };

  const cancelBinderChanges = () => {
    if (!selectedBinder || !pendingChanges || savedBinderRef.current?.id !== selectedBinder.id) return;
    onBindersChange(binders.map((binder) => binder.id === selectedBinder.id ? savedBinderRef.current as RiftboundBinder : binder));
    setPendingChanges(false);
    setError('');
  };

  const placeCard = (pageNumber: number, slotIndex: number, cardId: string, finish: RiftboundBinderFinish) => {
    saveSlot(pageNumber, slotIndex, cardId, finish);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, pageNumber: number, slotIndex: number) => {
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/x-riftbound-binder-card')) as DragPayload;
      if (typeof payload.cardId !== 'string') return;
      const sourcePageNumber = payload.source?.pageNumber;
      const sourceSlotIndex = payload.source?.slotIndex;
      if (typeof sourcePageNumber === 'number' && typeof sourceSlotIndex === 'number') {
        void saveSlotMove({ pageNumber: sourcePageNumber, slotIndex: sourceSlotIndex }, { pageNumber, slotIndex });
      } else {
        placeCard(pageNumber, slotIndex, payload.cardId, payload.finish === 'foil' ? 'foil' : 'normal');
      }
    } catch {
      // Ignore drops that did not originate from the binder catalogue.
    }
    stopBinderEdgeScroll();
    updateHoveredSlot(null);
    setDraggingCatalogueCardId(null);
  };

  const importBinder = async (file: File) => {
    if (!selectedBinder) return;
    const imported = parseRiftboundBinderExport(JSON.parse(await file.text()));
    const emptySlots = selectedBinder.pages.flatMap((page) => Array.from({ length: RIFTBOUND_BINDER_SLOT_COUNT }, (_, slotIndex) => page.slots.some((slot) => slot.slot_index === slotIndex) ? null : { pageNumber: page.page_number, slotIndex })).filter((slot): slot is SlotPosition => slot !== null);
    const importedSlots = imported.pages.flatMap((page) => page.slots.map((slot) => ({ ...slot, pageNumber: page.pageNumber })));
    if (emptySlots.length === 0) throw new Error('You have no binder slots left.');
    if (importedSlots.length > emptySlots.length) throw new Error(`This binder needs ${importedSlots.length} empty slots, but only ${emptySlots.length} are available.`);
    const nextPages = selectedBinder.pages.map((page) => ({ ...page, name: imported.pages.find((candidate) => candidate.pageNumber === page.page_number)?.name ?? page.name, slots: [...page.slots] }));
    importedSlots.forEach((slot, index) => {
      const target = emptySlots[index];
      const page = nextPages.find((candidate) => candidate.page_number === target.pageNumber);
      if (page) page.slots = [...page.slots, { slot_index: target.slotIndex, card_id: slot.cardId, finish: slot.finish }].sort((left, right) => left.slot_index - right.slot_index);
    });
    onBindersChange(updateBinderCollection(binders, selectedBinder.id, (binder) => ({ ...binder, name: imported.name, description: imported.description, pages: nextPages, updated_at: new Date().toISOString() })));
    setPendingChanges(true);
    setToolsOpen(false);
  };

  if (!selectedBinder) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 sm:p-8">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound binders</p><h2 className="mt-2 text-2xl font-black text-white">Your binders</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Your binder slots are still being prepared. Refresh this page to continue.</p></div>
        {error ? <p className="mt-4 text-sm font-semibold text-red-200">{error}</p> : null}
        <p className="mt-8 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">You do not have a binder yet.</p>
      </section>
    );
  }

  const pages = selectedBinder.pages.length > 0 ? selectedBinder.pages : Array.from({ length: RIFTBOUND_BINDER_PAGE_COUNT }, (_, index) => ({ id: `${selectedBinder.id}-${index + 1}`, page_number: index + 1, name: `Page ${index + 1}`, slots: [] }));
  const paginatedPageCount = pageWidth >= 900 ? 2 : 1;
  const maxPaginatedStart = Math.max(1, pages.length - paginatedPageCount + 1);
  const paginatedPages = pages.slice(activePageNumber - 1, activePageNumber - 1 + paginatedPageCount);
  const placeCatalogueCard = (card: RiftboundCard, pageNumber?: number) => {
    const orderedPages = pageNumber === undefined
      ? [...pages].sort((left, right) => (left.page_number === activePageNumber ? -1 : right.page_number === activePageNumber ? 1 : left.page_number - right.page_number))
      : pages.filter((page) => page.page_number === pageNumber);
    const target = orderedPages
      .map((page) => ({ page, slotIndex: getFirstEmptySlot(page) }))
      .find(({ slotIndex }) => slotIndex !== undefined);
    const slotIndex = target?.slotIndex;
    const targetPageNumber = target?.page.page_number;
    if (slotIndex === undefined || targetPageNumber === undefined) {
      setError('Every binder slot is full.');
      return;
    }
    setPlacementCardId(null);
    placeCard(targetPageNumber, slotIndex, card.id, card.defaultFinish === 'foil' ? 'foil' : 'normal');
  };

  return (
    <div className="riftbound-binder-board grid min-w-0 w-full select-none gap-5">
      <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound binders</p><h2 className="mt-2 text-2xl font-black text-white">Your binders</h2></div>
          <button type="button" onClick={() => setToolsOpen(true)} disabled={pendingChanges || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"><Share2 size={16} /> Export / Import</button>
        </div>
        <div className={`mt-5 flex gap-2 overflow-x-auto pb-1 ${THEMED_SCROLLBAR_CLASS}`}>
          {binders.map((binder) => <button key={binder.id} type="button" onClick={() => { if (pendingChanges) { setError('Save this binder before switching binders.'); return; } setSelectedBinderId(binder.id); setActivePageNumber(1); }} className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-black transition ${binder.id === selectedBinder.id ? 'border-amber-200/60 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/25 hover:text-white'}`}>{binder.name}</button>)}
        </div>
        {error ? <p className="mt-4 text-sm font-semibold text-red-200">{error}</p> : null}
        <BinderDetailsFields binder={selectedBinder} saving={saving} pendingChanges={pendingChanges} onSave={saveBinderDetails} onDelete={deleteBinder} />
      </section>

      <section ref={binderSectionRef} className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{selectedBinder.name}</p><p className="mt-1 text-sm text-slate-400">Drop a card into any slot. Duplicate cards can occupy multiple slots.</p></div><div className="flex flex-wrap items-center justify-end gap-2">{pendingChanges ? <><button type="button" onClick={() => void saveBinderChanges()} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"><Save size={15} /> {saving ? 'Saving...' : 'Save Binder'}</button><button type="button" onClick={cancelBinderChanges} disabled={saving} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60">Cancel</button></> : null}<AppSelectMenu label="Page layout" value={navigationMode} options={navigationOptions} onChange={setNavigationMode} hideLabel className="w-52" /></div></div>
        {navigationMode === 'paginate' ? (
          <div className="mt-5 flex items-center justify-center gap-3"><button type="button" onClick={() => setActivePageNumber((page) => Math.max(1, page - paginatedPageCount))} disabled={activePageNumber === 1} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-amber-200/50 hover:text-white disabled:opacity-30" aria-label="Previous binder pages"><ChevronLeft size={18} /></button><span className="text-sm font-black text-white">Pages {activePageNumber}–{Math.min(activePageNumber + paginatedPageCount - 1, pages.length)} of {pages.length}</span><button type="button" onClick={() => setActivePageNumber((page) => Math.min(maxPaginatedStart, page + paginatedPageCount))} disabled={activePageNumber >= maxPaginatedStart} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-amber-200/50 hover:text-white disabled:opacity-30" aria-label="Next binder pages"><ChevronRight size={18} /></button></div>
        ) : null}
        <div ref={binderViewportRef} onDragOver={handleBinderDragOver} onPointerDown={handleBinderPointerDown} onPointerMove={handleBinderPointerMove} onPointerUp={handleBinderPointerEnd} onPointerCancel={handleBinderPointerEnd} onLostPointerCapture={handleBinderPointerEnd} className={`mt-5 min-w-0 max-w-full ${navigationMode === 'scroll' ? `flex cursor-grab gap-4 overflow-x-auto pb-4 touch-pan-x active:cursor-grabbing ${THEMED_SCROLLBAR_CLASS}` : 'grid min-w-0 gap-4 md:grid-cols-2'}`} aria-label={navigationMode === 'scroll' ? 'Scrollable binder pages' : 'Paginated binder pages'}>
          {(navigationMode === 'paginate' ? paginatedPages : pages).map((page) => {
            const slots = getPageSlots(page);
            return <BinderPagePanel key={page.id} page={page} slots={slots} cards={cards} active={page.page_number === activePageNumber} paginate={navigationMode === 'paginate'} hoveredSlot={hoveredSlot} onSlotDragOver={handleBinderDragOver} onSlotDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) handleBinderSlotDragLeave(); }} onActivate={() => setActivePageNumber(page.page_number)} onRename={(nextName) => savePageName(page, nextName)} onDrop={handleDrop} onClear={(slotIndex) => saveSlot(page.page_number, slotIndex, null)} onSlotDragStart={(event, slot, pageNumber) => handleCardDragStart(event, slot.card_id, slot.finish, { pageNumber, slotIndex: slot.slot_index })} onDragEnd={handleCardDragEnd} />;
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/70 p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <label className="relative block"><span className="sr-only">Search binder catalogue</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, number, text, set, type..." className="h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-amber-300" /></label>
          <AppSelectMenu label="Sort" value={sortMode} options={sortOptions} onChange={setSortMode} hideLabel />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3"><AppSelectMenu label="Set" value={setFilter} options={setOptions} onChange={setSetFilter} hideLabel /><AppSelectMenu label="Rarity" value={rarityFilter} options={rarityOptions} onChange={setRarityFilter} hideLabel /><AppSelectMenu label="Card Type" value={typeFilter} options={typeOptions} onChange={setTypeFilter} hideLabel /></div>
      </section>

      <section className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Card catalogue</p><p className="mt-1 text-sm text-slate-400">{filteredCards.length} cards · click to use the first available slot, or right-click to choose a page.</p></div></div>
        {filteredCards.length > 0 ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{filteredCards.map((card) => <BinderCatalogueCard key={card.id} card={card} pages={pages} placementOpen={placementCardId === card.id} dragging={draggingCatalogueCardId === card.id} onPlaceFirst={() => placeCatalogueCard(card)} onOpenPlacement={(event) => { event.preventDefault(); setPlacementCardId((current) => current === card.id ? null : card.id); }} onClosePlacement={() => setPlacementCardId(null)} onPlace={(pageNumber) => placeCatalogueCard(card, pageNumber)} onDragStart={handleCardDragStart} onDragEnd={handleCardDragEnd} />)}</div> : <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">No cards match these filters.</p>}
      </section>
      {toolsOpen ? <RiftboundBinderToolsModal binder={selectedBinder} session={session} onClose={() => setToolsOpen(false)} onImport={importBinder} /> : null}
    </div>
  );
}

export function RiftboundBinderViewer({ binder, cards, printMode = false }: { binder: RiftboundBinder; cards: RiftboundCard[]; printMode?: boolean }) {
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('scroll');
  const [activePageNumber, setActivePageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const binderPointerDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; active: boolean } | null>(null);
  const pages = binder.pages;
  const paginatedPageCount = pageWidth >= 900 ? 2 : 1;
  const maxPaginatedStart = Math.max(1, pages.length - paginatedPageCount + 1);
  const paginatedPages = pages.slice(activePageNumber - 1, activePageNumber - 1 + paginatedPageCount);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;
    const updateWidth = () => setPageWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [navigationMode]);

  const handleBinderPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (navigationMode !== 'scroll' || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-binder-card], button, input, textarea, select, a, [contenteditable="true"]')) return;
    binderPointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      active: false,
    };
  };

  const handleBinderPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointerDrag = binderPointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const distance = event.clientX - pointerDrag.startX;
    if (!pointerDrag.active) {
      if (Math.abs(distance) < 5) return;
      pointerDrag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = pointerDrag.startScrollLeft - distance;
  };

  const handleBinderPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pointerDrag = binderPointerDragRef.current;
    if (pointerDrag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      binderPointerDragRef.current = null;
    }
  };

  return <section className="min-w-0 select-none rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-6" aria-label={`Shared binder ${binder.name}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound binder</p><h2 className="mt-2 text-2xl font-black text-white">{binder.name}</h2>{binder.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{binder.description}</p> : null}</div><AppSelectMenu label="Page layout" value={navigationMode} options={navigationOptions} onChange={setNavigationMode} hideLabel className="w-52" /></div>
    {navigationMode === 'paginate' ? <div className="mt-5 flex items-center justify-center gap-3"><button type="button" onClick={() => setActivePageNumber((page) => Math.max(1, page - paginatedPageCount))} disabled={activePageNumber === 1} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-amber-200/50 hover:text-white disabled:opacity-30" aria-label="Previous binder pages"><ChevronLeft size={18} /></button><span className="text-sm font-black text-white">Pages {activePageNumber}–{Math.min(activePageNumber + paginatedPageCount - 1, pages.length)} of {pages.length}</span><button type="button" onClick={() => setActivePageNumber((page) => Math.min(maxPaginatedStart, page + paginatedPageCount))} disabled={activePageNumber >= maxPaginatedStart} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-amber-200/50 hover:text-white disabled:opacity-30" aria-label="Next binder pages"><ChevronRight size={18} /></button></div> : null}
    <div ref={viewportRef} onPointerDown={handleBinderPointerDown} onPointerMove={handleBinderPointerMove} onPointerUp={handleBinderPointerEnd} onPointerCancel={handleBinderPointerEnd} onLostPointerCapture={handleBinderPointerEnd} className={`riftbound-binder-print-viewport mt-5 min-w-0 max-w-full ${printMode ? 'grid gap-4' : navigationMode === 'scroll' ? `flex cursor-grab gap-4 overflow-x-auto pb-4 touch-pan-x active:cursor-grabbing ${THEMED_SCROLLBAR_CLASS}` : 'grid min-w-0 gap-4 md:grid-cols-2'}`} aria-label={navigationMode === 'scroll' ? 'Scrollable shared binder pages' : 'Paginated shared binder pages'}>{(printMode ? pages : navigationMode === 'paginate' ? paginatedPages : pages).map((page) => <div key={page.id} className={`riftbound-binder-print-page ${printMode || navigationMode === 'paginate' ? 'min-w-0' : 'w-[min(88vw,44rem)] shrink-0'}`}><BinderPagePanel page={page} slots={getPageSlots(page)} cards={cards} active={page.page_number === activePageNumber} paginate={printMode || navigationMode === 'paginate'} readOnly onActivate={() => setActivePageNumber(page.page_number)} onRename={() => undefined} onDrop={() => undefined} onClear={() => undefined} onSlotDragStart={() => undefined} onDragEnd={() => undefined} /></div>)}</div>
  </section>;
}

type BinderPagePanelProps = {
  page: RiftboundBinderPage;
  slots: Map<number, RiftboundBinderSlot>;
  cards: RiftboundCard[];
  active: boolean;
  paginate: boolean;
  readOnly?: boolean;
  onActivate: () => void;
  onRename: (name: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, pageNumber: number, slotIndex: number) => void;
  onClear: (slotIndex: number) => void;
  onSlotDragStart: (event: DragEvent<HTMLElement>, slot: RiftboundBinderSlot, pageNumber: number) => void;
  onDragEnd: () => void;
  hoveredSlot?: SlotPosition | null;
  onSlotDragOver?: (event: DragEvent<HTMLDivElement>, pageNumber: number, slotIndex: number) => void;
  onSlotDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
};

function binderPagePanelPropsEqual(previous: BinderPagePanelProps, next: BinderPagePanelProps) {
  const previousHoveredSlot = previous.hoveredSlot?.pageNumber === previous.page.page_number ? previous.hoveredSlot.slotIndex : null;
  const nextHoveredSlot = next.hoveredSlot?.pageNumber === next.page.page_number ? next.hoveredSlot.slotIndex : null;
  return previous.page === next.page
    && previous.cards === next.cards
    && previous.active === next.active
    && previous.paginate === next.paginate
    && previous.readOnly === next.readOnly
    && previousHoveredSlot === nextHoveredSlot;
}

function BinderPagePanelContent({ page, slots, cards, active, paginate, readOnly = false, onActivate, onRename, onDrop, onClear, onSlotDragStart, onDragEnd, hoveredSlot, onSlotDragOver, onSlotDragLeave }: BinderPagePanelProps) {
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  return <article className={`${paginate ? 'w-full min-w-0' : 'w-[min(88vw,44rem)] shrink-0'} rounded-2xl border p-3 sm:p-5 ${active ? 'border-amber-200/70 bg-slate-900/70' : 'border-white/10 bg-slate-900/40'}`}><div className="mb-4 flex items-center gap-2">{readOnly ? <span className="min-w-0 flex-1 text-base font-black text-white">{page.name}</span> : <><button type="button" onClick={onActivate} className="rounded-lg p-1 text-slate-500 transition hover:text-amber-200" aria-label={`Select page ${page.page_number}`}><GripVertical size={15} /></button><input key={`${page.id}-${page.name}`} defaultValue={page.name} onBlur={(event) => onRename(event.target.value)} maxLength={80} aria-label={`Page ${page.page_number} name`} className="min-w-0 flex-1 select-text bg-transparent text-base font-black text-white outline-none focus:border-b focus:border-amber-200" /></>}<span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{String(page.page_number).padStart(2, '0')}</span></div><div className="grid grid-cols-3 gap-2 sm:gap-4">{Array.from({ length: RIFTBOUND_BINDER_SLOT_COUNT }, (_, slotIndex) => { const slot = slots.get(slotIndex); const card = slot ? cardsById.get(slot.card_id) : null; const isHovered = !readOnly && hoveredSlot?.pageNumber === page.page_number && hoveredSlot.slotIndex === slotIndex; return <div key={slotIndex} onDragOver={readOnly ? undefined : (event) => { event.preventDefault(); onSlotDragOver?.(event, page.page_number, slotIndex); }} onDragLeave={readOnly ? undefined : onSlotDragLeave} onDrop={readOnly ? undefined : (event) => onDrop(event, page.page_number, slotIndex)} className={`group relative flex aspect-[744/1039] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-slate-950/70 transition ${isHovered ? 'border-amber-200 bg-amber-300/20 ring-2 ring-amber-200/70' : 'border-white/15 hover:border-amber-200/70'}`}>{card ? <div data-binder-card draggable={!readOnly} onDragStart={readOnly ? undefined : (event) => onSlotDragStart(event, slot!, page.page_number)} onDragEnd={readOnly ? undefined : onDragEnd} className={`relative h-full w-full ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}><RiftboundCardImage card={card} sizes="(max-width: 640px) 27vw, 12rem" className="h-full w-full object-cover" loading="eager" preferHighResolution /><span className="absolute inset-x-1 bottom-1 hidden truncate rounded bg-slate-950/85 px-1 py-0.5 text-center text-[0.55rem] font-black text-white sm:block">{card.displayName}</span>{!readOnly ? <button type="button" onClick={(event) => { event.stopPropagation(); onClear(slotIndex); }} className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-slate-300 opacity-0 transition hover:text-white group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${card.displayName} from slot ${slotIndex + 1}`}><X size={16} /></button> : null}</div> : <span className="text-[0.6rem] font-black uppercase tracking-[0.1em] text-slate-600 sm:text-xs">Empty</span>}</div>; })}</div></article>;
}

export const BinderPagePanel = memo(BinderPagePanelContent, binderPagePanelPropsEqual);

type BinderCatalogueCardProps = {
  card: RiftboundCard;
  pages: RiftboundBinderPage[];
  placementOpen: boolean;
  dragging: boolean;
  onOpenPlacement: (event: MouseEvent<Element>) => void;
  onClosePlacement: () => void;
  onPlaceFirst: () => void;
  onPlace: (pageNumber: number) => void;
  onDragStart: (event: DragEvent<HTMLElement>, cardId: string, finish: RiftboundBinderFinish) => void;
  onDragEnd: () => void;
};

function binderCatalogueCardPropsEqual(previous: BinderCatalogueCardProps, next: BinderCatalogueCardProps) {
  return previous.card === next.card
    && previous.pages === next.pages
    && previous.placementOpen === next.placementOpen
    && previous.dragging === next.dragging;
}

/* Legacy catalogue-card implementation retained temporarily for the local patch context.
function BinderCatalogueCardContent({ card, pages, placementOpen, dragging, onOpenPlacement, onClosePlacement, onPlaceFirst, onPlace, onDragStart, onDragEnd }: BinderCatalogueCardProps) {
  return <article className="relative min-w-0" data-binder-catalogue-card><button type="button" draggable onDragStart={(event) => onDragStart(event, card.id, card.defaultFinish === 'foil' ? 'foil' : 'normal')} onDragEnd={onDragEnd} onClick={onPlaceFirst} onContextMenu={onOpenPlacement} className={`group w-full cursor-grab rounded-2xl border p-2 text-center transition hover:-translate-y-1 hover:border-amber-200/80 hover:bg-slate-800 hover:shadow-[0_12px_30px_rgba(251,191,36,0.14)] active:cursor-grabbing ${dragging ? 'border-amber-200 bg-amber-300/10 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]' : 'border-white/10 bg-slate-900/70'}`}><span className="relative block aspect-[744/1039] overflow-hidden rounded-xl bg-slate-950"><RiftboundCardImage card={card} sizes="(max-width: 640px) 44vw, (max-width: 1024px) 28vw, 16vw" className="object-cover transition duration-300 group-hover:scale-105" loading="lazy" /></span><span className={`mt-2 block truncate text-center text-sm font-black ${getRiftboundCardRarityTextClass(card)}`}>{card.displayName}</span><span className="mt-1 block truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}</span></button><button type="button" onClick={onPlaceFirst} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-xl border border-amber-200/40 bg-amber-300/10 px-2 text-[0.65rem] font-black uppercase tracking-[0.08em] text-amber-200 transition hover:border-amber-200/70 hover:bg-amber-300/20"><Plus size={12} /> Add to binder</button>{placementOpen ? <div data-binder-placement-menu role="menu" aria-label={`Choose a page for ${card.displayName}`} onClick={(event) => event.stopPropagation()} className="absolute left-1/2 top-1/2 z-30 grid w-40 -translate-x-1/2 -translate-y-1/2 grid-cols-4 gap-1 rounded-xl border border-amber-200/40 bg-slate-950 p-2"><div className="col-span-4 flex items-center justify-between gap-2 border-b border-white/10 px-1 pb-2 text-xs font-black uppercase tracking-[0.08em] text-amber-200"><span>Add to binder #</span><span className="text-[0.6rem] text-slate-500">Choose a page</span></div>{pages.map((page) => { const available = getFirstEmptySlot(page) !== undefined; return <button key={page.id} type="button" role="menuitem" disabled={!available} title={page.name} aria-label={`Add ${card.displayName} to ${page.name}`} onClick={() => onPlace(page.page_number)} className="aspect-square rounded-lg border border-white/10 bg-slate-900 text-xs font-black text-slate-200 transition hover:border-amber-200/60 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">{page.page_number}</button>; })}<button type="button" onClick={onClosePlacement} className="col-span-4 mt-1 inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-xs font-black uppercase tracking-[0.08em] text-slate-300 transition hover:border-white/25 hover:text-white sm:hidden">Close</button></div> : null}</article>;
}

*/
function BinderCatalogueCardContent({ card, pages, placementOpen, dragging, onOpenPlacement, onClosePlacement, onPlaceFirst, onPlace, onDragStart, onDragEnd }: BinderCatalogueCardProps) {
  return (
    <article className={`group relative min-w-0 rounded-2xl border p-2 text-center transition hover:-translate-y-1 hover:border-amber-200/80 hover:bg-slate-800 hover:shadow-[0_12px_30px_rgba(251,191,36,0.14)] ${dragging ? 'border-amber-200 bg-amber-300/10 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]' : 'border-white/10 bg-slate-900/70'}`} data-binder-catalogue-card>
      <div
        role="button"
        tabIndex={0}
        draggable
        aria-label={`Add ${card.displayName} to the binder`}
        onDragStart={(event) => onDragStart(event, card.id, card.defaultFinish === 'foil' ? 'foil' : 'normal')}
        onDragEnd={onDragEnd}
        onClick={onPlaceFirst}
        onContextMenu={onOpenPlacement}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPlaceFirst();
          }
        }}
        className="w-full cursor-grab rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 active:cursor-grabbing"
      >
        <span className="relative block aspect-[744/1039] overflow-hidden rounded-xl bg-slate-950"><RiftboundCardImage card={card} sizes="(max-width: 640px) 44vw, (max-width: 1024px) 28vw, 16vw" className="object-cover transition duration-300 group-hover:scale-105" loading="lazy" /></span>
        <span className={`mt-2 block truncate text-center text-sm font-black ${getRiftboundCardRarityTextClass(card)}`}>{card.displayName}</span>
        <span className="mt-1 block truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
      </div>
      <button type="button" onClick={onPlaceFirst} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-xl border border-amber-200/40 bg-amber-300/10 px-2 text-[0.65rem] font-black uppercase tracking-[0.08em] text-amber-200 transition hover:border-amber-200/70 hover:bg-amber-300/20"><Plus size={12} /> Add to binder</button>
      {placementOpen ? <div data-binder-placement-menu role="menu" aria-label={`Add ${card.displayName} to a binder page`} onClick={(event) => event.stopPropagation()} className="absolute left-1/2 top-1/2 z-30 grid w-40 -translate-x-1/2 -translate-y-1/2 grid-cols-4 gap-1 rounded-xl border border-amber-200/40 bg-slate-950 p-2"><div className="col-span-4 border-b border-white/10 px-1 pb-2 text-xs font-black uppercase tracking-[0.08em] text-amber-200">Add to binder #</div>{pages.map((page) => { const available = getFirstEmptySlot(page) !== undefined; return <button key={page.id} type="button" role="menuitem" disabled={!available} title={page.name} aria-label={`Add ${card.displayName} to ${page.name}`} onClick={() => onPlace(page.page_number)} className="aspect-square rounded-lg border border-white/10 bg-slate-900 text-xs font-black text-slate-200 transition hover:border-amber-200/60 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">{page.page_number}</button>; })}<button type="button" onClick={onClosePlacement} className="col-span-4 mt-1 inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-xs font-black uppercase tracking-[0.08em] text-slate-300 transition hover:border-white/25 hover:text-white sm:hidden">Close</button></div> : null}
    </article>
  );
}

const BinderCatalogueCard = memo(BinderCatalogueCardContent, binderCatalogueCardPropsEqual);

function BinderDetailsFields({ binder, saving, pendingChanges, onSave, onDelete }: { binder: RiftboundBinder; saving: boolean; pendingChanges: boolean; onSave: (name: string, description: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [name, setName] = useState(binder.name);
  const [description, setDescription] = useState(binder.description);

  useEffect(() => {
    setName(binder.name);
    setDescription(binder.description);
  }, [binder.description, binder.id, binder.name]);

  return <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Binder name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="h-11 select-text rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300" /></label><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="h-11 select-text rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300" /></label><div className="flex items-end gap-2"><button type="button" onClick={() => void onSave(name, description)} disabled={saving || pendingChanges || !name.trim()} title={pendingChanges ? 'Save binder page changes before saving its details.' : undefined} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"><Save size={15} /> Save</button><button type="button" onClick={() => void onDelete()} disabled={saving || pendingChanges} className="inline-flex h-11 items-center justify-center rounded-xl border border-red-300/30 bg-red-950/30 px-3 text-red-200 transition hover:border-red-200/60 disabled:cursor-wait disabled:opacity-60" aria-label={`Reset ${binder.name}`} title={pendingChanges ? 'Save the current binder before resetting it.' : `Reset ${binder.name}`}><Trash2 size={16} /></button></div></div>;
}
