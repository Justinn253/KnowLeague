'use client';

import { CalendarDays, Check, ChevronDown, CircleDollarSign, Minus, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getRiftboundCardRarityTextClass, type RiftboundCard } from '@/lib/riftbound';
import {
  formatRiftboundCents,
  formatRiftboundSaleDate,
  getRiftboundSaleLabel,
  parseRiftboundCurrencyCents,
  type RiftboundInventoryMetadata,
  type RiftboundSale,
  type RiftboundSaleFinish,
} from '@/lib/riftbound-sales';

export type RiftboundSaleEditorDraft = {
  cardId: string;
  finish: RiftboundSaleFinish;
  quantity: number;
  salePriceCents: number;
  acquisitionDate: string | null;
  acquisitionCostCents: number | null;
};

export type RiftboundPendingSaleItem = RiftboundSaleEditorDraft & {
  card: RiftboundCard;
};

type SaleEditorProps = {
  card: RiftboundCard;
  initialFinish: RiftboundSaleFinish;
  quantitiesByFinish: Partial<Record<RiftboundSaleFinish, number>>;
  pendingQuantitiesByFinish: Partial<Record<RiftboundSaleFinish, number>>;
  metadataByFinish: Partial<Record<RiftboundSaleFinish, RiftboundInventoryMetadata>>;
  marketPricesByFinish: Partial<Record<RiftboundSaleFinish, number | null>>;
  pending: boolean;
  hasUnsavedInventoryChanges: boolean;
  onClose: () => void;
  onSaveMetadata: (finish: RiftboundSaleFinish, acquisitionDate: string | null, acquisitionCostCents: number | null, salePriceCents: number | null) => Promise<void>;
  onSell: (draft: RiftboundSaleEditorDraft) => Promise<void>;
};

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function centsInput(value: number | null | undefined) {
  return value === null || value === undefined ? '' : (value / 100).toFixed(2);
}

function defaultSalePriceInput(metadata: RiftboundInventoryMetadata | undefined, marketPrice: number | null | undefined) {
  if (metadata?.sale_price_cents !== null && metadata?.sale_price_cents !== undefined) {
    return centsInput(metadata.sale_price_cents);
  }
  return marketPrice === null || marketPrice === undefined ? '0.00' : marketPrice.toFixed(2);
}

function fieldClassName() {
  return 'h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20';
}

function formatAdjustment(value: number) {
  return value < 0 ? `-${formatRiftboundCents(Math.abs(value))}` : `+${formatRiftboundCents(value)}`;
}

export function RiftboundInventorySaleEditor({ card, initialFinish, quantitiesByFinish, pendingQuantitiesByFinish, metadataByFinish, marketPricesByFinish, pending, hasUnsavedInventoryChanges, onClose, onSaveMetadata, onSell }: SaleEditorProps) {
  const [finish, setFinish] = useState<RiftboundSaleFinish>(initialFinish);
  const [quantity, setQuantity] = useState(() => Math.max(0, (quantitiesByFinish[initialFinish] ?? 0) - (pendingQuantitiesByFinish[initialFinish] ?? 0)) > 0 ? 1 : 0);
  const initialSalePrice = defaultSalePriceInput(metadataByFinish[initialFinish], marketPricesByFinish[initialFinish]);
  const initialAcquisitionDate = metadataByFinish[initialFinish]?.acquisition_date ?? '';
  const initialAcquisitionCost = centsInput(metadataByFinish[initialFinish]?.acquisition_cost_cents);
  const [salePrice, setSalePrice] = useState(initialSalePrice);
  const [acquisitionDate, setAcquisitionDate] = useState(initialAcquisitionDate);
  const [acquisitionCost, setAcquisitionCost] = useState(initialAcquisitionCost);
  const [savedSalePrice, setSavedSalePrice] = useState(initialSalePrice);
  const [savedAcquisitionDate, setSavedAcquisitionDate] = useState(initialAcquisitionDate);
  const [savedAcquisitionCost, setSavedAcquisitionCost] = useState(initialAcquisitionCost);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ownedQuantity = quantitiesByFinish[finish] ?? 0;
  const pendingQuantity = pendingQuantitiesByFinish[finish] ?? 0;
  const availableQuantity = Math.max(0, ownedQuantity - pendingQuantity);
  const finishOptions = card.finishOptions.filter((candidate): candidate is RiftboundSaleFinish => candidate === 'normal' || candidate === 'foil');

  const selectFinish = (nextFinish: RiftboundSaleFinish) => {
    setFinish(nextFinish);
    const nextAvailableQuantity = Math.max(0, (quantitiesByFinish[nextFinish] ?? 0) - (pendingQuantitiesByFinish[nextFinish] ?? 0));
    setQuantity(nextAvailableQuantity > 0 ? 1 : 0);
    const nextSalePrice = defaultSalePriceInput(metadataByFinish[nextFinish], marketPricesByFinish[nextFinish]);
    const nextAcquisitionDate = metadataByFinish[nextFinish]?.acquisition_date ?? '';
    const nextAcquisitionCost = centsInput(metadataByFinish[nextFinish]?.acquisition_cost_cents);
    setSalePrice(nextSalePrice);
    setSavedSalePrice(nextSalePrice);
    setAcquisitionDate(nextAcquisitionDate);
    setSavedAcquisitionDate(nextAcquisitionDate);
    setAcquisitionCost(nextAcquisitionCost);
    setSavedAcquisitionCost(nextAcquisitionCost);
    setError('');
  };

  const hasMetadataChanges = salePrice !== savedSalePrice
    || acquisitionDate !== savedAcquisitionDate
    || acquisitionCost !== savedAcquisitionCost;

  const readDraft = () => {
    const parsedSalePrice = parseRiftboundCurrencyCents(salePrice);
    if (parsedSalePrice === null) {
      setError('Sale price must be a valid amount from $0.00 to $1,000,000.00.');
      return null;
    }
    const parsedAcquisitionCost = acquisitionCost.trim() ? parseRiftboundCurrencyCents(acquisitionCost) : null;
    if (acquisitionCost.trim() && parsedAcquisitionCost === null) {
      setError('Acquisition cost must be a valid amount from $0.00 to $1,000,000.00.');
      return null;
    }
    return {
      cardId: card.id,
      finish,
      quantity: Math.max(0, Math.min(quantity, availableQuantity)),
      salePriceCents: parsedSalePrice,
      acquisitionDate: acquisitionDate || null,
      acquisitionCostCents: parsedAcquisitionCost,
    } satisfies RiftboundSaleEditorDraft;
  };

  const saveMetadata = async () => {
    if (!hasMetadataChanges) return false;
    const draft = readDraft();
    if (!draft) return false;
    setSaving(true);
    setError('');
    try {
      await onSaveMetadata(finish, draft.acquisitionDate, draft.acquisitionCostCents, draft.salePriceCents);
      setSavedSalePrice(centsInput(draft.salePriceCents));
      setSavedAcquisitionDate(draft.acquisitionDate ?? '');
      setSavedAcquisitionCost(centsInput(draft.acquisitionCostCents));
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save acquisition details.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sell = async () => {
    const draft = readDraft();
    if (!draft) return;
    if (draft.quantity < 1 || availableQuantity < 1) {
      setError('There are no available copies of this finish to sell.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSell(draft);
    } catch (sellError) {
      setError(sellError instanceof Error ? sellError.message : 'Unable to add this card to the pending sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Edit sale details for ${card.displayName}`} className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-7" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close sale details" onClick={onClose} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={17} /></button>
        <div className="pr-12">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Inventory transaction</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{card.displayName}</h2>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{card.setCode} · {card.numberLabel}</p>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start">
          <div className="relative mx-auto aspect-[744/1039] w-28 overflow-hidden rounded-2xl bg-slate-900 sm:mx-0"><RiftboundCardImage card={card} sizes="112px" className="object-cover" preferHighResolution loading="eager" /></div>
          <div className="grid content-start gap-4">
            {finishOptions.length > 1 ? <div className="grid gap-2"><p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Finish</p><div className="grid grid-cols-2 gap-2">{finishOptions.map((option) => <button key={option} type="button" onClick={() => selectFinish(option)} className={`rounded-xl border px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${finish === option ? 'border-amber-200/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}>{option} · {quantitiesByFinish[option] ?? 0} owned</button>)}</div></div> : null}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3"><div><span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">Copies to sell</span><span className="mt-1 block text-[0.65rem] font-semibold text-slate-600">{availableQuantity > 0 ? `${availableQuantity} remaining` : 'All available copies are pending'}</span></div><div className="flex items-center gap-1"><button type="button" aria-label="Decrease sale quantity" onClick={() => setQuantity((current) => Math.max(0, current - 1))} disabled={quantity <= 0} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"><Minus size={15} /></button><span className="min-w-8 text-center text-lg font-black text-amber-200" aria-live="polite">{quantity}</span><button type="button" aria-label="Increase sale quantity" onClick={() => setQuantity((current) => Math.min(availableQuantity, current + 1))} disabled={quantity >= availableQuantity} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"><Plus size={15} /></button></div></div>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <section className="grid gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-emerald-300">Sale price per copy</p>
            <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-500">$</span><input value={salePrice} onChange={(event) => setSalePrice(event.target.value)} inputMode="decimal" aria-label="Sale price per copy" className={`${fieldClassName()} pl-7 pr-36`} /><button type="button" onClick={() => { const marketPrice = marketPricesByFinish[finish]; if (marketPrice === null || marketPrice === undefined) { setError('There is no market price available for this finish today.'); return; } setSalePrice(marketPrice.toFixed(2)); setError(''); }} className="absolute inset-y-1 right-1 rounded-lg border border-emerald-300/30 px-2.5 text-[0.6rem] font-black uppercase tracking-[0.08em] text-emerald-200 transition hover:border-emerald-200/70 hover:bg-emerald-300/10">Set Market Price</button></div>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-400">Acquisition date</span><input type="date" value={acquisitionDate} onChange={(event) => setAcquisitionDate(event.target.value)} className={fieldClassName()} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-400">Acquisition cost</span><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-500">$</span><input value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} inputMode="decimal" placeholder="Optional" aria-label="Acquisition cost" className={`${fieldClassName()} pl-7`} /></div></label>
          </div>
        </div>

        {hasUnsavedInventoryChanges ? <p className="mt-4 rounded-xl border border-amber-200/20 bg-amber-300/5 px-3 py-2 text-xs font-semibold leading-5 text-amber-100">Update your inventory quantity changes before finalizing a sale. This prevents selling copies that have not reached the server yet.</p> : null}
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-200">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4"><button type="button" onClick={() => void saveMetadata()} disabled={pending || saving || !hasMetadataChanges} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : 'Update'}</button><button type="button" onClick={() => void sell()} disabled={pending || saving || availableQuantity < 1 || hasUnsavedInventoryChanges} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"><CircleDollarSign size={16} /> Sell</button></div>
      </div>
    </div>
  );
}

type SaleReviewProps = {
  items: RiftboundPendingSaleItem[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (soldAt: string, adjustmentCents: number) => Promise<void>;
  onCancelSale: () => void;
  onRemoveItem: (cardId: string, finish: RiftboundSaleFinish) => void;
};

export function RiftboundSaleReviewModalLegacy({ items, pending, onClose, onConfirm, onCancelSale }: SaleReviewProps) {
  const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
  const [soldAt, setSoldAt] = useState(localToday);
  const [adjustment, setAdjustment] = useState('0.00');
  const [error, setError] = useState('');
  const subtotal = items.reduce((total, item) => total + item.quantity * item.salePriceCents, 0);
  const adjustmentText = adjustment.trim();
  const parsedAdjustment = adjustmentText ? parseRiftboundCurrencyCents(adjustmentText.replace(/^[+-]/, ''), 0) : 0;
  const signedAdjustment = parsedAdjustment === null ? null : adjustmentText.startsWith('-') ? -parsedAdjustment : parsedAdjustment;
  const displayedAdjustment = signedAdjustment ?? 0;
  const total = signedAdjustment === null ? -1 : subtotal + signedAdjustment;

  const confirm = async () => {
    if (parsedAdjustment === null || signedAdjustment === null || total < 0) {
      setError('Discount or upcharge must leave the sale total at zero or above.');
      return;
    }
    if (!soldAt) {
      setError('Choose a sold date before confirming.');
      return;
    }
    setError('');
    try {
      await onConfirm(soldAt, signedAdjustment);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Unable to finalize this sale.');
    }
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Review Sale" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-emerald-300/20 bg-slate-950 p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-7" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close Review Sale" onClick={onClose} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={17} /></button>
        <div className="pr-12"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Review Sale</p><h2 className="mt-2 text-2xl font-black text-white">Finalize Sale of {items.reduce((total, item) => total + item.quantity, 0)} items</h2><p className="mt-2 text-sm leading-6 text-slate-400">Review the receipt below before finalizing the sale</p></div>
        <div className="mt-5 grid gap-2">{items.map((item) => <div key={`${item.cardId}:${item.finish}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-3"><div className="min-w-0"><p className={`truncate text-sm font-black ${getRiftboundCardRarityTextClass(item.card)}`}>{item.card.displayName}</p><p className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-slate-500">{item.card.setCode} · {item.card.numberLabel} · {item.finish} · {item.quantity} {item.quantity === 1 ? 'copy' : 'copies'}</p></div><p className="text-sm font-black text-white">{formatRiftboundCents(item.quantity * item.salePriceCents)}</p></div>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sold date</span><input type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} className={fieldClassName()} /></label><label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Discount / Upcharge</span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">$</span><input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} inputMode="decimal" aria-label="Discount or upcharge" className={`${fieldClassName()} pl-7`} /></div></label></div>
        <div className="mt-5 grid gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4"><div className="flex items-center justify-between text-sm"><span className="text-slate-400">Card subtotal</span><span className="font-bold text-white">{formatRiftboundCents(subtotal)}</span></div><div className="flex items-center justify-between text-sm"><span className="text-slate-400">Discount / Upcharge</span><span className={`font-bold ${displayedAdjustment < 0 ? 'text-amber-200' : 'text-emerald-200'}`}>{formatAdjustment(displayedAdjustment)}</span></div><div className="mt-2 flex items-center justify-between border-t border-emerald-300/20 pt-3"><span className="text-sm font-black uppercase tracking-[0.12em] text-emerald-200">Total</span><span className="text-2xl font-black text-white">{formatRiftboundCents(total)}</span></div></div>
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-200">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">{cancelChoiceOpen ? <><button type="button" onClick={onCancelSale} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300/30 bg-red-950/30 px-4 py-2.5 text-sm font-black text-red-200 transition hover:border-red-200/60 disabled:opacity-60">Cancel Sale</button><button type="button" onClick={onClose} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-60">Continue Editing</button></> : <><button type="button" onClick={() => setCancelChoiceOpen(true)} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-60">Cancel</button><button type="button" onClick={() => void confirm()} disabled={pending || items.length === 0 || total < 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{pending ? 'Confirming...' : <><Check size={16} /> Confirm Sale</>}</button></>}</div>
      </div>
    </div>
  );
}

export function RiftboundSaleReviewModal({ items, pending, onClose, onConfirm, onCancelSale, onRemoveItem }: SaleReviewProps) {
  const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
  const [soldAt, setSoldAt] = useState(localToday);
  const [adjustment, setAdjustment] = useState('0.00');
  const [error, setError] = useState('');
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.quantity * item.salePriceCents, 0);
  const adjustmentText = adjustment.trim();
  const parsedAdjustment = adjustmentText ? parseRiftboundCurrencyCents(adjustmentText.replace(/^[+-]/, ''), 0) : 0;
  const signedAdjustment = parsedAdjustment === null ? null : adjustmentText.startsWith('-') ? -parsedAdjustment : parsedAdjustment;
  const displayedAdjustment = signedAdjustment ?? 0;
  const total = signedAdjustment === null ? -1 : subtotal + signedAdjustment;

  const confirm = async () => {
    if (parsedAdjustment === null || signedAdjustment === null || total < 0) {
      setError('Discount or upcharge must leave the sale total at zero or above.');
      return;
    }
    if (!soldAt) {
      setError('Choose a sold date before confirming.');
      return;
    }
    setError('');
    try {
      await onConfirm(soldAt, signedAdjustment);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Unable to finalize this sale.');
    }
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Review Sale" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-emerald-300/20 bg-slate-950 p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-7" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close Review Sale" onClick={onClose} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={17} /></button>
        <div className="pr-12">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Review Sale</p>
          <h2 className="mt-2 text-2xl font-black text-white">Finalize Sale of {totalItems} items</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Review the receipt below before finalizing the sale</p>
        </div>

        <div className="mt-5 max-h-72 overflow-y-auto pr-1">
          <div className="grid gap-2">
            {items.map((item) => (
              <div key={`${item.cardId}:${item.finish}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-3">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-black ${getRiftboundCardRarityTextClass(item.card)}`}>{item.card.displayName} <span className="text-white">x{item.quantity}</span></p>
                  <p className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-slate-500">{item.card.setCode} · {item.card.numberLabel} · <span className={item.finish === 'foil' ? 'text-amber-200' : 'text-slate-500'}>{item.finish === 'foil' ? 'Foil' : 'Normal'}</span></p>
                </div>
                <button type="button" aria-label={`Remove ${item.card.displayName} from pending sale`} onClick={() => onRemoveItem(item.cardId, item.finish)} disabled={pending} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} /></button>
                <p className="text-sm font-black text-white">{formatRiftboundCents(item.quantity * item.salePriceCents)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sold date</span><input type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} className={fieldClassName()} /></label>
          <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Discount / Upcharge</span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">$</span><input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} inputMode="decimal" aria-label="Discount or upcharge" className={`${fieldClassName()} pl-7`} /></div></label>
        </div>

        <div className="mt-5 grid gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
          <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Card subtotal</span><span className="font-bold text-white">{formatRiftboundCents(subtotal)}</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Discount / Upcharge</span><span className={`font-bold ${displayedAdjustment < 0 ? 'text-amber-200' : 'text-emerald-200'}`}>{formatAdjustment(displayedAdjustment)}</span></div>
          <div className="mt-2 flex items-center justify-between border-t border-emerald-300/20 pt-3"><span className="text-sm font-black uppercase tracking-[0.12em] text-emerald-200">Total</span><span className="text-2xl font-black text-white">{formatRiftboundCents(total)}</span></div>
        </div>

        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-200">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
          {cancelChoiceOpen ? <><button type="button" onClick={onCancelSale} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300/30 bg-red-950/30 px-4 py-2.5 text-sm font-black text-red-200 transition hover:border-red-200/60 disabled:opacity-60">Cancel Sale</button><button type="button" onClick={onClose} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-60">Continue Editing</button></> : <><button type="button" onClick={() => setCancelChoiceOpen(true)} disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-60">Cancel</button><button type="button" onClick={() => void confirm()} disabled={pending || items.length === 0 || total < 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{pending ? 'Confirming...' : <><Check size={16} /> Confirm Sale</>}</button></>}
        </div>
      </div>
    </div>
  );
}

export function RiftboundSaleReceipt({ sale, cards, onClose }: { sale: RiftboundSale; cards: RiftboundCard[]; onClose: () => void }) {
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('riftbound-printing-sale');
    return () => document.body.classList.remove('riftbound-printing-sale');
  }, [printing]);
  const printReceipt = async () => {
    setPrinting(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    window.print();
    setPrinting(false);
  };
  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm print:static print:block print:bg-white print:p-0" onPointerDown={onClose}><section className="riftbound-sale-receipt relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-8" onPointerDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300 print:text-emerald-700">Sale finalized</p><h2 className="mt-2 text-2xl font-black text-white print:text-black">Riftbound Sale Receipt</h2><p className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500 print:text-slate-600">{getRiftboundSaleLabel(sale.id)}</p></div><div className="flex gap-2 print:hidden"><button type="button" onClick={() => void printReceipt()} aria-label="Print sale receipt" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-200 transition hover:bg-emerald-300/20"><Printer size={17} /></button><button type="button" onClick={onClose} aria-label="Close sale receipt" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={17} /></button></div></div><div className="mt-5 grid grid-cols-2 gap-3 border-y border-white/10 py-4 text-sm print:border-slate-300"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-slate-500">Sold date</p><p className="mt-1 font-bold text-white print:text-black">{formatRiftboundSaleDate(sale.sold_at)}</p></div><div><p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-slate-500">Sale ID</p><p className="mt-1 font-bold text-white print:text-black">{getRiftboundSaleLabel(sale.id)}</p></div></div><div className="mt-5 grid gap-2">{sale.items.map((item) => { const card = cardsById.get(item.card_id); const acquisitionTotal = item.acquisition_cost_cents === null ? null : item.quantity * item.acquisition_cost_cents; const margin = acquisitionTotal === null ? null : item.quantity * item.sale_price_cents - acquisitionTotal; return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/10 pb-2 text-sm print:border-slate-200"><div><p className="font-black text-white print:text-black">{card?.displayName ?? item.card_id}</p><p className="mt-1 text-xs text-slate-500 print:text-slate-600">{card ? `${card.setCode} · ${card.numberLabel}` : item.finish} · {item.quantity} × {formatRiftboundCents(item.sale_price_cents)}</p><p className="mt-1 text-[0.65rem] text-slate-500 print:text-slate-600">Acquired {item.acquisition_date ? formatRiftboundSaleDate(item.acquisition_date) : 'date not recorded'} · Cost {formatRiftboundCents(item.acquisition_cost_cents)}{margin === null ? '' : ` · Margin ${formatRiftboundCents(margin)}`}</p></div><p className="font-bold text-white print:text-black">{formatRiftboundCents(item.quantity * item.sale_price_cents)}</p></div>; })}</div><div className="mt-5 grid gap-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-bold text-white print:text-black">{formatRiftboundCents(sale.subtotal_cents)}</span></div><div className="flex justify-between"><span className="text-slate-500">Discount / Upcharge</span><span className="font-bold text-white print:text-black">{formatAdjustment(sale.adjustment_cents)}</span></div><div className="mt-2 flex justify-between border-t border-emerald-300/20 pt-3 text-base print:border-slate-300"><span className="font-black uppercase tracking-[0.12em] text-emerald-200 print:text-emerald-700">Total</span><span className="text-2xl font-black text-white print:text-black">{formatRiftboundCents(sale.total_cents)}</span></div></div><p className="mt-6 text-center text-[0.65rem] font-semibold text-slate-500 print:text-slate-600">Generated by KnowLeague · {formatRiftboundSaleDate(sale.created_at, true)}</p></section></div>;
}

type SalesHistoryProps = {
  sales: RiftboundSale[];
  cards: RiftboundCard[];
  loading: boolean;
  error: string;
};

type SaleGroupMode = 'day' | 'week' | 'month' | 'year';

const saleGroupOptions: AppSelectOption<SaleGroupMode>[] = [
  { value: 'day', label: 'Group by day' },
  { value: 'week', label: 'Group by week' },
  { value: 'month', label: 'Group by month' },
  { value: 'year', label: 'Group by year' },
];

function saleGroupKey(value: string, mode: SaleGroupMode) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  if (mode === 'day') return value;
  if (mode === 'month') return `${value.slice(0, 7)}-01`;
  if (mode === 'year') return `${value.slice(0, 4)}-01-01`;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function RiftboundSalesHistory({ sales, cards, loading, error }: SalesHistoryProps) {
  const [query, setQuery] = useState('');
  const [groupMode, setGroupMode] = useState<SaleGroupMode>('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const filteredSales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (fromDate && sale.sold_at < fromDate) return false;
      if (toDate && sale.sold_at > toDate) return false;
      if (!normalizedQuery) return true;
      const searchable = [getRiftboundSaleLabel(sale.id), sale.id, ...sale.items.flatMap((item) => { const card = cardsById.get(item.card_id); return [card?.displayName ?? item.card_id, card?.setCode ?? '', card?.numberLabel ?? '']; })].join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [cardsById, fromDate, query, sales, toDate]);
  const groups = useMemo(() => {
    const grouped = new Map<string, RiftboundSale[]>();
    filteredSales.forEach((sale) => { const key = saleGroupKey(sale.sold_at, groupMode); const current = grouped.get(key) ?? []; current.push(sale); grouped.set(key, current); });
    return Array.from(grouped.entries());
  }, [filteredSales, groupMode]);
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total_cents, 0);

  return <section className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6" aria-label="Riftbound sales history"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Sales ledger</p><h2 className="mt-2 text-2xl font-black text-white">Sales history</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every confirmed sale is preserved as a receipt, including the acquisition snapshot used to calculate your margin.</p></div><div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-3 text-right"><p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-emerald-300">Filtered revenue</p><p className="mt-1 text-xl font-black text-white">{formatRiftboundCents(totalRevenue)}</p></div></div><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_10rem]"><label className="relative block"><span className="sr-only">Search sales</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search card, number, or sale ID..." className={`${fieldClassName()} pl-10`} /></label><AppSelectMenu label="Group" value={groupMode} options={saleGroupOptions} onChange={setGroupMode} hideLabel /><label className="relative block"><span className="sr-only">Sales from date</span><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Sales from date" className={`${fieldClassName()} pl-9`} /></label><label className="relative block"><span className="sr-only">Sales through date</span><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Sales through date" className={`${fieldClassName()} pl-9`} /></label></div>{error ? <p role="alert" className="text-sm font-semibold text-red-200">{error}</p> : null}{loading ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-10 text-center text-sm font-semibold text-slate-400">Loading sales history...</p> : groups.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-10 text-center text-sm font-semibold text-slate-500">{sales.length === 0 ? 'No completed sales yet.' : 'No sales match these filters.'}</p> : <div className="grid gap-6">{groups.map(([group, groupSales]) => <section key={group} className="grid gap-3"><div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2"><h3 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{formatRiftboundSaleDate(group, false)}</h3><span className="text-xs font-bold text-slate-500">{groupSales.length} {groupSales.length === 1 ? 'sale' : 'sales'}</span></div>{groupSales.map((sale) => <article key={sale.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><button type="button" onClick={() => setExpandedSaleId((current) => current === sale.id ? null : sale.id)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block text-sm font-black text-white">{getRiftboundSaleLabel(sale.id)}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{formatRiftboundSaleDate(sale.sold_at)} · {sale.items.reduce((sum, item) => sum + item.quantity, 0)} cards</span></span><span className="flex items-center gap-3"><span className="text-sm font-black text-emerald-200">{formatRiftboundCents(sale.total_cents)}</span><ChevronDown size={16} className={`text-slate-500 transition ${expandedSaleId === sale.id ? 'rotate-180' : ''}`} /></span></button>{expandedSaleId === sale.id ? <div className="mt-4 grid gap-2 border-t border-white/10 pt-3">{sale.items.map((item) => { const card = cardsById.get(item.card_id); return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm"><div><p className="font-bold text-slate-200">{card?.displayName ?? item.card_id}</p><p className="text-xs text-slate-500">{card ? `${card.setCode} · ${card.numberLabel}` : item.finish} · {item.quantity} × {formatRiftboundCents(item.sale_price_cents)}</p></div><p className="font-bold text-slate-200">{formatRiftboundCents(item.quantity * item.sale_price_cents)}</p></div>; })}<div className="mt-2 grid gap-1 border-t border-white/10 pt-3 text-xs"><div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatRiftboundCents(sale.subtotal_cents)}</span></div><div className="flex justify-between text-slate-500"><span>Discount / Upcharge</span><span>{formatAdjustment(sale.adjustment_cents)}</span></div><div className="flex justify-between pt-1 text-sm font-black text-white"><span>Total</span><span>{formatRiftboundCents(sale.total_cents)}</span></div><p className="pt-2 text-[0.65rem] font-semibold text-slate-600">Receipt created {formatRiftboundSaleDate(sale.created_at, true)}</p></div></div> : null}</article>)}</section>)}</div>}</section>;
}
