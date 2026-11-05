'use client';

import Link from 'next/link';
import { Archive, Boxes, ChevronDown, Eye, EyeOff, LoaderCircle, Minus, Package, PackageOpen, Plus, RefreshCw, ShoppingCart, Shuffle, Sparkles, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getRiftboundCardRarityTextClass, getRiftboundRarityTextClass, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';

type SetCode = 'OGN' | 'SFD' | 'UNL' | 'VEN' | 'RAD';
type Kind = 'pack' | 'box';
type Treatment = 'standard' | 'alt_art' | 'special_alt' | 'overnumbered' | 'signature' | 'ultimate';
type CartLine = { product: Kind; quantity: number; setCode: SetCode; total: number };
type MockCard = { card_id: string; display_name: string; finish: 'normal' | 'foil'; image_url: string | null; market_price_usd: number | null; rarity: string; slot: string; treatment: Treatment };
type Opening = { cards: MockCard[]; id: string; opening_kind: Kind; opening_source: 'discord' | 'website'; opened_at: string; packs_opened: number; set_code: SetCode };
type Price = { box_cost_knowbucks: number; pack_cost_knowbucks: number; set_code: SetCode };
type Workspace = { activeOpening: Opening | null; history: Opening[]; knowBucks: number | null; packsOpenedBySet: Record<SetCode, number>; prices: Price[]; sealedProducts: Array<{ box_quantity: number; pack_quantity: number; set_code: SetCode }> };
type ApiResponse = Partial<Workspace> & {
  error?: string;
  opening?: Opening;
  purchase?: { balance_after: number; sealed_products: Array<{ box_quantity: number; pack_quantity: number; set_code: SetCode }> };
  sealedProduct?: { box_quantity: number; pack_quantity: number; set_code: SetCode };
};

const SETS: ReadonlyArray<{ code: SetCode; name: string }> = [
  { code: 'OGN', name: 'Origins' }, { code: 'SFD', name: 'Spiritforged' }, { code: 'UNL', name: 'Unleashed' }, { code: 'VEN', name: 'Vendetta' }, { code: 'RAD', name: 'Radiance' },
];
const RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Showcase: 4 };
const TREATMENT_LABELS: Record<Treatment, string> = { standard: 'Standard', alt_art: 'Alt Art', special_alt: 'Special Alt', overnumbered: 'Overnumbered', signature: 'Signature', ultimate: 'Ultimate Rare' };

function emptyWorkspace(): Workspace {
  return { activeOpening: null, history: [], knowBucks: null, packsOpenedBySet: { OGN: 0, SFD: 0, UNL: 0, VEN: 0, RAD: 0 }, prices: [], sealedProducts: [] };
}

function formatCurrency(value: number | null) {
  return value === null ? '--' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function isFoilPlus(card: MockCard) {
  return card.finish === 'foil' || ['Rare', 'Epic', 'Showcase'].includes(card.rarity) || card.treatment !== 'standard';
}

function displayRank(card: MockCard) {
  if (card.treatment === 'ultimate') return 8;
  if (card.treatment === 'signature') return 7;
  if (card.treatment === 'overnumbered') return 6;
  if (card.treatment === 'alt_art' || card.treatment === 'special_alt') return 5;
  return RARITY_RANK[card.rarity] ?? 0;
}

function compareCards(left: MockCard, right: MockCard) {
  return displayRank(left) - displayRank(right)
    || (RARITY_RANK[left.rarity] ?? 0) - (RARITY_RANK[right.rarity] ?? 0)
    || left.display_name.localeCompare(right.display_name);
}

function borderClass(rarity: string) {
  if (rarity === 'Uncommon') return 'border-blue-300/45';
  if (rarity === 'Rare') return 'border-violet-300/55';
  if (rarity === 'Epic') return 'border-orange-400/75';
  if (rarity === 'Showcase') return 'border-yellow-200/70';
  if (rarity === 'Overnumbered') return 'border-red-500/70';
  if (rarity === 'Signature') return 'border-fuchsia-300/70';
  return 'border-slate-300/30';
}

function openingWorth(opening: Opening, cardsById: ReadonlyMap<string, RiftboundCard>) {
  return opening.cards.reduce((total, card) => total + (cardsById.get(card.card_id)?.marketPrices[card.finish] ?? card.market_price_usd ?? 0), 0);
}

function MockPullCard({ card, cardData, revealed, onOpen, onReveal }: { card: MockCard; cardData: RiftboundCard | null; revealed: boolean; onOpen?: () => void; onReveal?: () => void }) {
  const interactive = revealed ? Boolean(onOpen) : Boolean(onReveal);
  const rarityClass = cardData ? getRiftboundCardRarityTextClass(cardData) : getRiftboundRarityTextClass(card.rarity);
  const value = cardData?.marketPrices[card.finish] ?? card.market_price_usd;
  return (
    <article className={`riftbound-card-item overflow-hidden rounded-2xl border-[3px] bg-slate-950/80 ${revealed && card.treatment === 'signature' ? 'gradient-border' : revealed ? borderClass(cardData?.rarity ?? card.rarity) : 'border-white/10'}`}>
      <button type="button" disabled={!interactive} onClick={() => revealed ? onOpen?.() : onReveal?.()} className={`group relative block aspect-[744/1039] w-full overflow-hidden bg-slate-900 text-left disabled:cursor-default ${revealed && onReveal ? 'animate-riftbound-mock-unveil' : ''}`}>
        {revealed && cardData ? <RiftboundCardImage card={cardData} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 24vw, 180px" /> : null}
        {revealed && !cardData && card.image_url ? <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${card.image_url})` }} /> : null}
        {!revealed ? <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.45),transparent_52%),linear-gradient(145deg,_#111827,_#020617)] p-4 text-center transition group-hover:bg-[radial-gradient(circle_at_top,_rgba(196,181,253,0.5),transparent_58%),linear-gradient(145deg,_#1e293b,_#020617)]"><span><PackageOpen className="mx-auto text-violet-200" size={34} /><span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-violet-100">Click to reveal</span></span></span> : null}
      </button>
      <div className="grid justify-items-center gap-1 p-3 text-center">
        <p className={`w-full truncate text-sm font-black ${revealed ? rarityClass : 'text-slate-500'}`}>{revealed ? card.display_name : 'Hidden pull'}</p>
        {revealed ? <><p className="text-xs font-semibold text-emerald-300">{formatCurrency(value)}</p><div className="mt-1 flex flex-wrap justify-center gap-1 text-[0.65rem] font-black uppercase tracking-[0.08em]"><span className="rounded bg-slate-800 px-1.5 py-1 text-slate-200">{card.finish}</span>{card.treatment !== 'standard' ? <span className="rounded bg-violet-300/15 px-1.5 py-1 text-violet-200">{TREATMENT_LABELS[card.treatment]}</span> : null}</div></> : null}
      </div>
    </article>
  );
}

export function RiftboundMockOpening() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [tab, setTab] = useState<'opening' | 'shop' | 'history'>('opening');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirmingCart, setConfirmingCart] = useState(false);
  const [needsOpeningRefresh, setNeedsOpeningRefresh] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [foilPlusOnly, setFoilPlusOnly] = useState(false);
  const [historySet, setHistorySet] = useState<SetCode | 'all'>('all');
  const [historySort, setHistorySort] = useState<'recent' | 'worth'>('recent');
  const [lastCompleted, setLastCompleted] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const cardsById = useMemo(() => new Map(RIFTBOUND_CARDS.map((card) => [card.id, card])), []);

  const load = useCallback(async (activeSession: Session | null, showLoading = true) => {
    if (!activeSession) { setWorkspace(emptyWorkspace()); setLoading(false); return; }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/riftbound/mock-opening', { headers: { Authorization: `Bearer ${activeSession.access_token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) throw new Error(payload.error || 'Unable to load Mock Opening.');
      setWorkspace({ ...emptyWorkspace(), ...payload } as Workspace);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Unable to load Mock Opening.'); } finally { if (showLoading) setLoading(false); }
  }, []);

  useEffect(() => subscribeToAuthSession((nextSession) => { setSession(nextSession); void load(nextSession); }), [load]);
  useEffect(() => {
    const opening = workspace.activeOpening;
    if (!opening) { setOrder([]); setRevealed(new Set()); return; }
    setOrder(opening.cards.map((_, index) => index).sort((left, right) => compareCards(opening.cards[left]!, opening.cards[right]!)));
    try {
      const saved = JSON.parse(window.localStorage.getItem(`knowleague:riftbound-mock-revealed:${opening.id}`) ?? '[]') as unknown;
      setRevealed(new Set(Array.isArray(saved) ? saved.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < opening.cards.length) : []));
    } catch { setRevealed(new Set()); }
  }, [workspace.activeOpening]);

  const persistReveals = useCallback((openingId: string, next: Set<number>) => window.localStorage.setItem(`knowleague:riftbound-mock-revealed:${openingId}`, JSON.stringify([...next])), []);
  const revealCard = useCallback((index: number) => {
    const opening = workspace.activeOpening;
    if (!opening || revealed.has(index)) return;
    const next = new Set(revealed).add(index); setRevealed(next); persistReveals(opening.id, next);
  }, [persistReveals, revealed, workspace.activeOpening]);
  const revealAll = useCallback(() => {
    const opening = workspace.activeOpening;
    if (!opening) return;
    const next = new Set(opening.cards.map((_, index) => index)); setRevealed(next); persistReveals(opening.id, next);
  }, [persistReveals, workspace.activeOpening]);
  const randomizeHidden = useCallback(() => setOrder((current) => {
    const positions = current.map((cardIndex, position) => revealed.has(cardIndex) ? -1 : position).filter((position) => position >= 0);
    const shuffled = positions.map((position) => current[position]!);
    for (let index = shuffled.length - 1; index > 0; index -= 1) { const swap = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!]; }
    const next = [...current]; positions.forEach((position, index) => { next[position] = shuffled[index]!; }); return next;
  }), [revealed]);

  const request = useCallback(async (body: Record<string, unknown>) => {
    if (!session || pending) return null;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/riftbound/mock-opening', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) throw new Error(payload.error || 'Unable to complete this mock-opening action.');
      return payload;
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Unable to complete this mock-opening action.'); return null; } finally { setPending(false); }
  }, [pending, session]);

  const openProduct = useCallback(async (setCode: SetCode, product: Kind) => {
    const payload = await request({ action: 'open', setCode, product });
    if (!payload?.opening || !payload.sealedProduct) return;
    setWorkspace((current) => ({
      ...current,
      activeOpening: payload.opening!,
      sealedProducts: payload.sealedProduct!.pack_quantity === 0 && payload.sealedProduct!.box_quantity === 0
        ? current.sealedProducts.filter((entry) => entry.set_code !== setCode)
        : [...current.sealedProducts.filter((entry) => entry.set_code !== setCode), payload.sealedProduct!],
    }));
    setLastCompleted(false);
    setTab('opening');
  }, [request]);
  const addToCart = useCallback((setCode: SetCode, product: Kind) => {
    const key = `${setCode}:${product}`;
    setCart((current) => ({ ...current, [key]: Math.min(120, (current[key] ?? 0) + 1) }));
  }, []);
  const removeFromCart = useCallback((setCode: SetCode, product: Kind) => {
    const key = `${setCode}:${product}`;
    setCart((current) => {
      const quantity = current[key] ?? 0;
      if (quantity <= 1) {
        const { [key]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [key]: quantity - 1 };
    });
  }, []);
  const cartLines = useMemo<CartLine[]>(() => SETS.flatMap((set) => {
    const price = workspace.prices.find((entry) => entry.set_code === set.code);
    return (['pack', 'box'] as const).flatMap((product) => {
      const quantity = cart[`${set.code}:${product}`] ?? 0;
      const unitCost = product === 'pack' ? price?.pack_cost_knowbucks : price?.box_cost_knowbucks;
      return quantity > 0 && unitCost !== undefined ? [{ product, quantity, setCode: set.code, total: unitCost * quantity }] : [];
    });
  }), [cart, workspace.prices]);
  const cartItemCount = useMemo(() => Object.values(cart).reduce((total, quantity) => total + quantity, 0), [cart]);
  const cartTotal = useMemo(() => cartLines.reduce((total, line) => total + line.total, 0), [cartLines]);
  const cartHasUnavailablePrice = cartItemCount !== cartLines.reduce((total, line) => total + line.quantity, 0);
  const cartShortfall = workspace.knowBucks === null ? null : Math.max(0, cartTotal - workspace.knowBucks);
  const confirmCart = useCallback(async () => {
    if (cartLines.length === 0 || cartHasUnavailablePrice) return;
    setConfirmingCart(true);
    try {
      const payload = await request({ action: 'purchase-cart', cart: cartLines.map((line) => ({ product: line.product, quantity: line.quantity, setCode: line.setCode })) });
      if (!payload?.purchase) return;
      setWorkspace((current) => {
        const updatedProducts = new Map(payload.purchase!.sealed_products.map((product) => [product.set_code, product]));
        const retainedProducts = current.sealedProducts.map((product) => updatedProducts.get(product.set_code) ?? product);
        const additions = payload.purchase!.sealed_products.filter((product) => !current.sealedProducts.some((currentProduct) => currentProduct.set_code === product.set_code));
        return { ...current, knowBucks: payload.purchase!.balance_after, sealedProducts: [...retainedProducts, ...additions] };
      });
      setCart({});
      setNeedsOpeningRefresh(true);
    } finally {
      setConfirmingCart(false);
    }
  }, [cartHasUnavailablePrice, cartLines, request]);
  const navigateToTab = useCallback((nextTab: 'opening' | 'shop' | 'history') => {
    setTab(nextTab);
    if (nextTab === 'opening' && needsOpeningRefresh && session) {
      setNeedsOpeningRefresh(false);
      void load(session, false);
    }
  }, [load, needsOpeningRefresh, session]);
  const finish = useCallback(async (opening: Opening) => {
    const payload = await request({ action: 'complete', openingId: opening.id });
    if (!payload) return;
    window.localStorage.removeItem(`knowleague:riftbound-mock-revealed:${opening.id}`);
    setWorkspace((current) => ({
      ...current,
      activeOpening: current.activeOpening?.id === opening.id ? null : current.activeOpening,
      history: current.history.some((entry) => entry.id === opening.id) ? current.history : [opening, ...current.history],
    }));
    setLastCompleted(true);
  }, [request]);

  const opening = workspace.activeOpening;
  const openingCards = opening ? order.map((index) => ({ card: opening.cards[index]!, index })).filter(({ card }) => !foilPlusOnly || isFoilPlus(card)) : [];
  const history = useMemo(() => workspace.history.filter((openingEntry) => historySet === 'all' || openingEntry.set_code === historySet).sort((left, right) => historySort === 'worth' ? openingWorth(right, cardsById) - openingWorth(left, cardsById) || Date.parse(right.opened_at) - Date.parse(left.opened_at) : Date.parse(right.opened_at) - Date.parse(left.opened_at)), [cardsById, historySet, historySort, workspace.history]);

  if (!session) return <main className="min-h-screen bg-[#030712] px-4 py-10 text-slate-100"><section className="mx-auto grid max-w-3xl justify-items-center gap-4 rounded-3xl border border-violet-300/20 bg-slate-950/80 px-6 py-16 text-center"><PackageOpen size={38} className="text-violet-200" /><div><h1 className="text-3xl font-black text-white">Mock Opening</h1><p className="mt-2 text-sm text-slate-400">Sign in to buy mock products, reveal pulls, and revisit opening history.</p></div><Link href="/login" className="rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-black text-slate-950">Sign in</Link></section></main>;

  return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10"><section className="mx-auto grid w-full max-w-[1600px] gap-6">
    <header className="rounded-3xl border border-violet-300/20 bg-slate-950/80 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">Riftbound mock collection</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Mock Opening</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Spend KnowBucks on mock products and keep the cards in a separate for-fun collection.</p></div><Link href="/riftbound/inventory?tab=mock" className="inline-flex items-center gap-2 rounded-xl border border-violet-200/30 bg-violet-300/10 px-4 py-2.5 text-sm font-black text-violet-100"><Archive size={16} /> Mock Inventory</Link></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-2"><div className="flex rounded-xl border border-white/10 bg-slate-950/60 p-1" role="tablist">{(['opening', 'shop', 'history'] as const).map((candidate) => <button key={candidate} type="button" role="tab" aria-selected={tab === candidate} onClick={() => navigateToTab(candidate)} className={`rounded-lg px-4 py-2 text-xs font-black ${tab === candidate ? 'bg-violet-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{candidate === 'opening' ? 'Opening' : candidate === 'shop' ? 'Shop' : 'History'}</button>)}</div><span className="inline-flex items-center gap-2 px-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400"><WalletCards size={15} className="text-violet-200" />{workspace.knowBucks === null ? 'KnowBucks available after Discord link or website rewards' : `${workspace.knowBucks.toLocaleString()} KnowBucks`}</span></div></header>
    {error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/25 bg-red-950/25 px-4 py-3 text-sm text-red-100"><span>{error}</span><button type="button" onClick={() => void load(session)} className="inline-flex items-center gap-2 rounded-lg border border-red-200/30 px-3 py-2 text-xs font-black"><RefreshCw size={14} /> Retry</button></div> : null}
    {loading ? <section className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={19} /> Loading Mock Opening...</section> : null}
    {!loading && tab === 'opening' ? <section className="grid gap-6"><div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Unopened products</p><h2 className="mt-1 text-xl font-black text-white">Choose one product to open</h2></div><span className="text-xs text-slate-500">Openings are one item at a time</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{SETS.map((set) => { const sealed = workspace.sealedProducts.find((product) => product.set_code === set.code); const packs = sealed?.pack_quantity ?? 0; const boxes = sealed?.box_quantity ?? 0; return <article key={set.code} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><p className="text-sm font-black text-white">{set.name}</p><p className="mt-1 text-xs text-slate-500">{packs.toLocaleString()} packs and {boxes.toLocaleString()} boxes</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(opening) || pending || (packs === 0 && boxes === 0)} onClick={() => void openProduct(set.code, 'pack')} className="rounded-xl border border-violet-200/30 bg-violet-300/10 px-2 py-2 text-xs font-black text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"><Package size={14} className="mr-1 inline" /> Pack</button><button type="button" disabled={Boolean(opening) || pending || boxes === 0} onClick={() => void openProduct(set.code, 'box')} className="rounded-xl border border-violet-200/30 bg-violet-300/10 px-2 py-2 text-xs font-black text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"><Boxes size={14} className="mr-1 inline" /> Box</button></div></article>; })}</div></div>{opening ? <section className="rounded-3xl border border-violet-300/20 bg-violet-300/5 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">{SETS.find((set) => set.code === opening.set_code)?.name} {opening.opening_kind === 'box' ? 'booster box' : 'pack'}</p><h2 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-black text-white">Reveal your pulls <span className="text-base text-violet-200">{revealed.size}/{opening.cards.length}</span></h2></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setFoilPlusOnly((current) => !current)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] ${foilPlusOnly ? 'border-violet-200/50 bg-violet-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300'}`}>{foilPlusOnly ? <Eye size={14} /> : <EyeOff size={14} />} Foil+ only</button><button type="button" onClick={randomizeHidden} disabled={revealed.size === opening.cards.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 disabled:opacity-40"><Shuffle size={14} /> Randomize hidden</button><button type="button" onClick={revealAll} disabled={pending || revealed.size === opening.cards.length} className="inline-flex items-center gap-2 rounded-xl border border-violet-200/40 bg-violet-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-40"><Sparkles size={14} /> Reveal all</button><button type="button" onClick={() => void finish(opening)} disabled={pending} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/40 bg-emerald-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-40"><PackageOpen size={14} /> Finish {opening.opening_kind === 'box' ? 'Box' : 'Pack'}</button></div></div><div className="riftbound-card-grid mt-5">{openingCards.map(({ card, index }) => { const cardData = cardsById.get(card.card_id) ?? null; return <MockPullCard key={`${opening.id}:${index}`} card={card} cardData={cardData} revealed={revealed.has(index)} onReveal={() => revealCard(index)} onOpen={cardData ? () => setSelectedCard(cardData) : undefined} />; })}</div></section> : <section className="grid justify-items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/70 px-6 py-14 text-center"><PackageOpen size={34} className="text-violet-200" /><div><h2 className="text-xl font-black text-white">No opening in progress</h2><p className="mt-2 text-sm text-slate-400">Choose an unopened mock pack or box above.</p>{lastCompleted ? <button type="button" onClick={() => setTab('history')} className="mt-4 rounded-xl border border-violet-200/30 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-violet-100">View last opening in History</button> : null}</div></section>}</section> : null}
    {!loading && tab === 'shop' ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Weekly mock shop</p><h2 className="mt-1 text-2xl font-black text-white">Buy mock packs and boxes</h2><p className="mt-2 text-sm text-slate-400">Add products to the cart and then confirm once ready. Box prices use the weekly TCGplayer Booster Display market price.</p></div><button type="button" disabled={pending || confirmingCart || cartItemCount === 0 || cartHasUnavailablePrice || workspace.knowBucks === null || (cartShortfall ?? 0) > 0} onClick={() => void confirmCart()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-violet-200/40 bg-violet-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950/15">{confirmingCart ? <LoaderCircle className="animate-spin" size={16} /> : <ShoppingCart size={16} />}</span><span>{confirmingCart ? 'Confirming…' : 'Confirm'}</span><span className="rounded-md bg-slate-950/15 px-2 py-1 text-xs">{cartTotal.toLocaleString()} KB</span></button></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">{SETS.map((set) => { const price = workspace.prices.find((entry) => entry.set_code === set.code); const sealed = workspace.sealedProducts.find((entry) => entry.set_code === set.code); const packQuantity = cart[`${set.code}:pack`] ?? 0; const boxQuantity = cart[`${set.code}:box`] ?? 0; return <article key={set.code} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"><p className="text-lg font-black text-white">{set.name}</p><p className="mt-1 text-xs text-slate-500">Owned: {sealed?.pack_quantity ?? 0} packs and {sealed?.box_quantity ?? 0} boxes</p><p className="mt-1 text-xs text-slate-500">Opened: {workspace.packsOpenedBySet[set.code] ?? 0} packs</p>{price ? <><div className="mt-4 grid gap-2 text-xs"><p className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-300">Pack <strong className="float-right text-white">{price.pack_cost_knowbucks.toLocaleString()} KB</strong></p><p className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-300">Box <strong className="float-right text-white">{price.box_cost_knowbucks.toLocaleString()} KB</strong></p></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={pending || confirmingCart || workspace.knowBucks === null || packQuantity >= 120} onClick={() => addToCart(set.code, 'pack')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200/30 bg-violet-300/10 px-2 py-2 text-xs font-black text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={14} /> Pack{packQuantity > 0 ? ` ×${packQuantity}` : ''}</button><button type="button" disabled={pending || confirmingCart || workspace.knowBucks === null || boxQuantity >= 120} onClick={() => addToCart(set.code, 'box')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200/30 bg-violet-300/10 px-2 py-2 text-xs font-black text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={14} /> Box{boxQuantity > 0 ? ` ×${boxQuantity}` : ''}</button></div>{packQuantity > 0 || boxQuantity > 0 ? <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-violet-200/20 bg-violet-300/5 px-2 py-1.5 text-xs text-violet-100"><span>Cart: {packQuantity > 0 ? `${packQuantity} pack${packQuantity === 1 ? '' : 's'}` : ''}{packQuantity > 0 && boxQuantity > 0 ? ' · ' : ''}{boxQuantity > 0 ? `${boxQuantity} box${boxQuantity === 1 ? '' : 'es'}` : ''}</span><span className="flex gap-1">{packQuantity > 0 ? <button type="button" aria-label={`Remove one ${set.name} pack from cart`} title="Remove pack" disabled={pending || confirmingCart} onClick={() => removeFromCart(set.code, 'pack')} className="grid h-6 w-6 place-items-center rounded border border-violet-200/30 text-violet-100 disabled:opacity-40"><Minus size={13} /></button> : null}{boxQuantity > 0 ? <button type="button" aria-label={`Remove one ${set.name} box from cart`} title="Remove box" disabled={pending || confirmingCart} onClick={() => removeFromCart(set.code, 'box')} className="grid h-6 w-6 place-items-center rounded border border-violet-200/30 text-violet-100 disabled:opacity-40"><Minus size={13} /></button> : null}</span></div> : null}</> : <p className="mt-4 text-xs text-slate-500">No current weekly price is available.</p>}</article>; })}</div>{cartHasUnavailablePrice ? <p className="mt-4 rounded-xl border border-amber-200/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">A cart item no longer has a current weekly price. Remove it before confirming.</p> : null}{cartShortfall && cartShortfall > 0 ? <p className="mt-4 rounded-xl border border-red-300/25 bg-red-950/25 px-4 py-3 text-sm text-red-100">Your cart needs {cartShortfall.toLocaleString()} more KnowBucks before it can be confirmed.</p> : null}{workspace.knowBucks === null ? <p className="mt-4 rounded-xl border border-amber-200/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">Current KnowBucks are earned in Discord. Link Discord to spend that balance here; future website-earned KnowBucks will also work here.</p> : null}</section> : null}
    {!loading && tab === 'history' ? <section className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Opening history</p><h2 className="mt-1 text-2xl font-black text-white">Last 96 packs</h2><p className="mt-2 text-sm text-slate-400">Grouped by opening time and product. History displays foil and Rare+ pulls.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setHistorySort((current) => current === 'recent' ? 'worth' : 'recent')} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300">Sort: {historySort === 'recent' ? 'Recent' : 'Total worth'}</button>{(['all', ...SETS.map((set) => set.code)] as Array<SetCode | 'all'>).map((code) => <button key={code} type="button" onClick={() => setHistorySet(code)} className={`rounded-xl border px-3 py-2 text-xs font-black ${historySet === code ? 'border-violet-200/50 bg-violet-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-400'}`}>{code === 'all' ? 'All sets' : code}</button>)}</div></div>{history.length === 0 ? <div className="grid justify-items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/70 px-6 py-16 text-center"><Archive size={34} className="text-violet-200" /><div><h3 className="text-xl font-black text-white">No completed openings yet</h3><p className="mt-2 text-sm text-slate-400">Reveal every card from a website opening, or open products in Discord, to build history.</p></div></div> : history.map((entry) => { const highlights = [...entry.cards.filter(isFoilPlus)].sort(compareCards); const worth = openingWorth(entry, cardsById); const expanded = expandedHistory.has(entry.id); return <article key={entry.id} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80"><button type="button" aria-expanded={expanded} onClick={() => setExpandedHistory((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left transition hover:bg-slate-900/50"><span><span className="block text-xs font-black uppercase tracking-[0.16em] text-violet-200">{SETS.find((set) => set.code === entry.set_code)?.name} / {entry.opening_kind === 'box' ? 'Box' : 'Pack'} / {entry.opening_source === 'discord' ? 'Discord' : 'Website'}</span><span className="mt-1 block text-lg font-black text-white">{entry.packs_opened} pack{entry.packs_opened === 1 ? '' : 's'} opened</span><span className="mt-1 block text-xs text-slate-500">{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.opened_at))}</span></span><span className="inline-flex items-center gap-3"><span className="text-sm font-black text-emerald-300">{formatCurrency(worth)}</span><ChevronDown size={18} className={`text-violet-200 transition-transform ${expanded ? 'rotate-180' : ''}`} /></span></button>{expanded ? <div className="border-t border-white/10 p-5"><div className="riftbound-card-grid">{highlights.map((card, index) => { const cardData = cardsById.get(card.card_id) ?? null; return <MockPullCard key={`${entry.id}:${index}:${card.card_id}`} card={card} cardData={cardData} revealed onOpen={cardData ? () => setSelectedCard(cardData) : undefined} />; })}</div></div> : null}</article>; })}</section> : null}
  </section>{selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={selectedCard.marketPrices.updatedAt} pending={false} showInventoryControls={false} onAdjust={() => undefined} onClose={() => setSelectedCard(null)} /> : null}</main>;
}
