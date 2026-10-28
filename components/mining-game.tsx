'use client';

import Link from 'next/link';
import { ArrowLeft, Gem, Hammer, Package, RefreshCw, Send, Store } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type MiningResource = {
  depth: number;
  id: string;
  kind: 'ore' | 'gem' | 'fossil';
  name: string;
  processorTier?: number;
  saleValue?: number;
};

type MiningCargo = {
  cargo: Array<{ id: string; kind: MiningResource['kind']; name: string; quantity: number }>;
  discardedStone: number;
  miningXpAwarded: number;
  stoneBroken: number;
  stoneStored: number;
  storageUsed: number;
};

type MiningDashboard = {
  activeExpedition: null | {
    cargo: MiningCargo;
    depth: number;
    miningStartedAt: string;
    phase: 'descending' | 'mining' | 'returning';
    returnsAt: string | null;
    travelDurationMs: number;
  };
  balance: number;
  depths: Array<{ id: number; name: string; requiredToolName: string | null; unlocked: boolean }>;
  equipment: {
    elevatorName: string | null;
    filterName: string | null;
    processorTier: number;
    storageCapacity: number;
    storageName: string | null;
    toolName: string | null;
    toolStonesPerSecond: number;
  };
  inventory: Array<{ resource: MiningResource; quantity: number }>;
  mining: { level: number; totalXp: number };
  settlement: null | { currentLevel: number; expeditionId: number; previousLevel: number; result: MiningCargo; xpAwarded: number };
  shop: Array<{
    canCraft: boolean;
    category: 'tool' | 'storage' | 'processor' | 'elevator' | 'filter';
    description: string;
    id: string;
    name: string;
    owned: boolean;
    recipe: Array<{ resourceId: string; quantity: number }>;
    unlocked: boolean;
  }>;
  skills: { cheapskate: number; haste: number; lucky: number; moneyMouser: number };
};

type MiningTab = 'expedition' | 'shop' | 'inventory';
type ShopCategory = MiningDashboard['shop'][number]['category'];

const MINING_REFRESH_COOLDOWN_MS = 5_000;

const shopCategories: Array<{ id: ShopCategory; label: string }> = [
  { id: 'tool', label: 'Tools' },
  { id: 'storage', label: 'Storage' },
  { id: 'processor', label: 'Processing' },
  { id: 'elevator', label: 'Elevator' },
  { id: 'filter', label: 'Filters' },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function phaseLabel(phase: NonNullable<MiningDashboard['activeExpedition']>['phase']) {
  return phase === 'descending' ? 'Descending' : phase === 'returning' ? 'Returning' : 'Mining';
}

export function MiningGame() {
  const [dashboard, setDashboard] = useState<MiningDashboard | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshAvailableAt, setRefreshAvailableAt] = useState<number | null>(null);
  const [tab, setTab] = useState<MiningTab>('expedition');
  const [shopCategory, setShopCategory] = useState<ShopCategory>('tool');
  const hasLoadedDashboardRef = useRef(false);

  const getAccessToken = useCallback(async () => {
    const { data } = await getOptionalSupabaseClient()?.auth.getSession() ?? { data: { session: null } };
    return data.session?.access_token ?? null;
  }, []);

  const request = useCallback(async (init?: RequestInit) => {
    const token = await getAccessToken();
    if (!token) throw new Error('Sign in and link your Discord account in Profile to use Mining on the website.');
    const response = await fetch('/api/mining', {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
    });
    const body = await response.json() as MiningDashboard & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Unable to load Mining.');
    return body;
  }, [getAccessToken]);

  const loadDashboard = useCallback(async () => {
    setBusyAction('refresh');
    try {
      setDashboard(await request());
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to refresh Mining.');
    } finally {
      setBusyAction(null);
    }
  }, [request]);

  const refresh = useCallback(() => {
    if (refreshAvailableAt && refreshAvailableAt > Date.now()) return;
    setRefreshAvailableAt(Date.now() + MINING_REFRESH_COOLDOWN_MS);
    void loadDashboard();
  }, [loadDashboard, refreshAvailableAt]);

  useEffect(() => {
    // React Strict Mode re-runs mount effects in development. The dashboard is
    // an explicit, on-demand read, so preserve one initial request instead of
    // asking the server for the same projection twice.
    if (hasLoadedDashboardRef.current) return;
    hasLoadedDashboardRef.current = true;
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!refreshAvailableAt) return undefined;
    const timeout = window.setTimeout(() => setRefreshAvailableAt(null), Math.max(0, refreshAvailableAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [refreshAvailableAt]);

  useEffect(() => {
    const expedition = dashboard?.activeExpedition;
    if (expedition?.phase !== 'returning' || !expedition.returnsAt) return undefined;
    const returnsAt = new Date(expedition.returnsAt).getTime();
    if (!Number.isFinite(returnsAt)) return undefined;
    // Settlement stays on demand. This is one arrival-time refresh, not a
    // poll while the minecart travels.
    const timeout = window.setTimeout(() => void loadDashboard(), Math.max(250, returnsAt - Date.now() + 750));
    return () => window.clearTimeout(timeout);
  }, [dashboard?.activeExpedition, loadDashboard]);

  const performAction = useCallback(async (actionKey: string, body: Record<string, unknown>, successMessage = '') => {
    setBusyAction(actionKey);
    try {
      setDashboard(await request({ method: 'POST', body: JSON.stringify(body) }));
      setError('');
      setNotice(successMessage);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete that Mining action.');
    } finally {
      setBusyAction(null);
    }
  }, [request]);

  const inventoryByKind = useMemo(() => ({
    fossils: dashboard?.inventory.filter((item) => item.resource.kind === 'fossil') ?? [],
    gems: dashboard?.inventory.filter((item) => item.resource.kind === 'gem') ?? [],
    ores: dashboard?.inventory.filter((item) => item.resource.kind === 'ore') ?? [],
  }), [dashboard]);
  const resourceNameById = useMemo(() => new Map(dashboard?.inventory.map((item) => [item.resource.id, item.resource.name])), [dashboard]);

  const isBusy = busyAction !== null;
  const refreshOnCooldown = refreshAvailableAt !== null;
  const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200/35 bg-amber-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45';
  const secondaryButtonClass = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-100 transition hover:border-amber-200/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-45';

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/games" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 transition hover:text-amber-100">
            <ArrowLeft size={16} /> Games
          </Link>
          <button type="button" className={secondaryButtonClass} disabled={isBusy || refreshOnCooldown} onClick={refresh}>
            <RefreshCw size={16} className={busyAction === 'refresh' ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <section className="rounded-2xl border border-amber-200/30 bg-slate-900/85 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Discord companion</p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white sm:text-4xl"><Hammer className="text-amber-300" /> Mining</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Your minecart, resources, upgrades, and KnowBucks are shared with the KnowLeague Discord bot.</p>
            </div>
            {dashboard ? (
              <div className="rounded-xl border border-amber-200/20 bg-slate-950/70 px-4 py-3 text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">KnowBucks</p>
                <p className="text-xl font-black text-amber-200">{formatNumber(dashboard.balance)}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
            {([['expedition', 'Expedition'], ['shop', 'Shop'], ['inventory', 'Inventory']] as const).map(([entry, label]) => (
              <button key={entry} type="button" onClick={() => setTab(entry)} className={tab === entry ? buttonClass : secondaryButtonClass}>{label}</button>
            ))}
          </div>
        </section>

        {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-300/35 bg-rose-950/45 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
        {notice ? <p role="status" className="mt-5 rounded-xl border border-emerald-300/35 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</p> : null}
        {!dashboard && !error ? <p className="mt-6 text-center text-sm font-semibold text-slate-400">Loading Mining...</p> : null}

        {dashboard?.settlement ? (
          <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/35 bg-emerald-950/30 p-4 text-sm text-emerald-50">
            <div>
              <p><strong>Return complete.</strong> Earned {formatNumber(dashboard.settlement.xpAwarded)} Mining XP · Level {dashboard.settlement.currentLevel}.</p>
              <p className="mt-1 text-xs leading-5 text-emerald-100/85">{dashboard.settlement.result.cargo.length
                ? dashboard.settlement.result.cargo.map((item) => `${item.name} ×${formatNumber(item.quantity)}`).join(' · ')
                : 'No non-stone cargo collected.'}</p>
            </div>
            <button type="button" className={buttonClass} disabled={isBusy} onClick={() => void performAction(
              'share-result',
              { action: 'share-result', expeditionId: dashboard.settlement!.expeditionId },
              'Mining results queued for the configured Discord result channels.',
            )}>
              <Send size={16} /> Post results to Discord
            </button>
          </section>
        ) : null}

        {dashboard && tab === 'expedition' ? (
          <section className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Minecart</p>
                  <h2 className="mt-1 text-2xl font-black text-white">{dashboard.activeExpedition ? `${phaseLabel(dashboard.activeExpedition.phase)} · Depth ${dashboard.activeExpedition.depth}` : 'Ready at the surface'}</h2>
                </div>
                {dashboard.activeExpedition ? <span className="rounded-full border border-amber-200/25 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-100">{phaseLabel(dashboard.activeExpedition.phase)}</span> : null}
              </div>
              {dashboard.activeExpedition ? (
                <>
                  <p className="mt-3 text-sm text-slate-300">Travel duration per direction: <strong className="text-white">{formatDuration(dashboard.activeExpedition.travelDurationMs)}</strong>. {dashboard.activeExpedition.phase === 'returning' ? 'The results refresh automatically when the minecart reaches the surface.' : 'Refresh when you want the latest on-demand projection.'}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <StatCard label="Storage" value={`${formatNumber(dashboard.activeExpedition.cargo.storageUsed)}/${formatNumber(dashboard.equipment.storageCapacity)}`} />
                    <StatCard label="Stone broken" value={formatNumber(dashboard.activeExpedition.cargo.stoneBroken)} />
                    <StatCard label="Mining XP" value={formatNumber(dashboard.activeExpedition.cargo.miningXpAwarded)} />
                  </div>
                  <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/55 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Projected cargo</p>
                    <p className="mt-2 text-sm text-slate-200">{dashboard.activeExpedition.cargo.stoneStored ? `Stone ×${formatNumber(dashboard.activeExpedition.cargo.stoneStored)} · discarded on return` : ''}</p>
                    {dashboard.activeExpedition.cargo.cargo.length ? dashboard.activeExpedition.cargo.cargo.map((item) => <p key={item.id} className="mt-1 text-sm text-slate-100">{item.name} ×{formatNumber(item.quantity)}</p>) : <p className="mt-2 text-sm text-slate-400">No non-stone cargo projected yet.</p>}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" className={secondaryButtonClass} disabled={isBusy || refreshOnCooldown} onClick={refresh}><RefreshCw size={16} /> {refreshOnCooldown ? 'Refresh shortly' : 'Refresh expedition'}</button>
                    {dashboard.activeExpedition.phase !== 'returning' ? <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-300/40 bg-rose-950/55 px-3 py-2 text-sm font-black text-rose-100 transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-45" disabled={isBusy} onClick={() => void performAction('return', { action: 'return' })}>Recall minecart</button> : null}
                  </div>
                </>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dashboard.depths.map((depth) => (
                    <button key={depth.id} type="button" disabled={isBusy || !depth.unlocked} onClick={() => void performAction(`start-${depth.id}`, { action: 'start', depth: depth.id })} className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-45">
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-200">Depth {depth.id}</p>
                      <p className="mt-1 font-black text-white">{depth.name}</p>
                      <p className="mt-2 text-xs text-slate-400">{depth.unlocked ? 'Start expedition' : `Requires ${depth.requiredToolName ?? 'a better tool'}`}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <aside className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Equipment</p>
              <dl className="mt-4 space-y-3 text-sm">
                <Detail label="Tool" value={`${dashboard.equipment.toolName ?? 'None'} · ${dashboard.equipment.toolStonesPerSecond} stone/s`} />
                <Detail label="Storage" value={`${dashboard.equipment.storageName ?? 'None'} · ${formatNumber(dashboard.equipment.storageCapacity)} items`} />
                <Detail label="Processor" value={dashboard.equipment.processorTier ? `Depth ${dashboard.equipment.processorTier + 1}` : 'None'} />
                <Detail label="Elevator" value={dashboard.equipment.elevatorName ?? 'None'} />
                <Detail label="Filter" value={dashboard.equipment.filterName ?? 'None'} />
              </dl>
              <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">Shared skills: Luck {Math.min(4, dashboard.skills.lucky)}/4 · Cheapskate {dashboard.skills.cheapskate}/4 · Money Mouser {dashboard.skills.moneyMouser}/2 · Haste {dashboard.skills.haste}/4.</p>
            </aside>
          </section>
        ) : null}

        {dashboard && tab === 'shop' ? (
          <section className="mt-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <div className="flex flex-wrap gap-2">
              {shopCategories.map((category) => <button type="button" key={category.id} className={shopCategory === category.id ? buttonClass : secondaryButtonClass} onClick={() => setShopCategory(category.id)}>{category.label}</button>)}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {dashboard.shop.filter((upgrade) => upgrade.category === shopCategory).map((upgrade) => (
                <article key={upgrade.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-white">{upgrade.name}</h2><p className="mt-1 text-sm leading-5 text-slate-300">{upgrade.description}</p></div>{upgrade.owned ? <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-xs font-black text-emerald-200">Owned</span> : null}</div>
                  <p className="mt-3 text-xs font-bold text-slate-400">{upgrade.recipe.length ? upgrade.recipe.map((item) => `${formatNumber(item.quantity)} ${resourceNameById.get(item.resourceId) ?? item.resourceId}`).join(' · ') : 'Starter equipment'}</p>
                  {!upgrade.owned ? <button type="button" disabled={isBusy || !upgrade.canCraft} onClick={() => void performAction(`purchase-${upgrade.id}`, { action: 'purchase', upgradeId: upgrade.id })} className={`${buttonClass} mt-4 w-full`}>{upgrade.unlocked ? 'Craft upgrade' : 'Requires previous upgrade'}</button> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {dashboard && tab === 'inventory' ? (
          <section className="mt-5 grid gap-5 lg:grid-cols-3">
            <InventoryColumn title="Ores" icon={<Package size={17} />} items={inventoryByKind.ores} processorTier={dashboard.equipment.processorTier} isBusy={isBusy} onSell={(resource) => void performAction(`sell-${resource.id}`, { action: 'sell', resource: resource.name, amount: 'all' })} />
            <InventoryColumn title="Gems" icon={<Gem size={17} />} items={inventoryByKind.gems} processorTier={dashboard.equipment.processorTier} isBusy={isBusy} onSell={(resource) => void performAction(`sell-${resource.id}`, { action: 'sell', resource: resource.name, amount: 'all' })} />
            <InventoryColumn title="Fossils" icon={<Store size={17} />} items={inventoryByKind.fossils} processorTier={dashboard.equipment.processorTier} isBusy={isBusy} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="text-right font-bold text-slate-100">{value}</dd></div>;
}

function InventoryColumn({ icon, isBusy, items, onSell, processorTier, title }: {
  icon: ReactNode;
  isBusy: boolean;
  items: Array<{ resource: MiningResource; quantity: number }>;
  onSell?: (resource: MiningResource) => void;
  processorTier: number;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <h2 className="flex items-center gap-2 text-lg font-black text-white">{icon} {title}</h2>
      <div className="mt-4 space-y-3">
        {items.length ? items.map(({ resource, quantity }) => {
          const needsProcessor = resource.kind === 'ore' && (resource.processorTier ?? 0) > processorTier;
          return <div key={resource.id} className="rounded-xl border border-white/10 bg-slate-950/55 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">{resource.name} ×{formatNumber(quantity)}</p><p className="mt-1 text-xs text-slate-400">{needsProcessor ? `Needs Depth ${resource.processorTier} Processor` : resource.saleValue ? `${formatNumber(resource.saleValue)} KnowBucks base value` : 'Collectible only'}</p></div>{onSell && !needsProcessor ? <button type="button" disabled={isBusy} onClick={() => onSell(resource)} className="rounded-lg border border-amber-200/35 px-2 py-1 text-xs font-black text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-45">Sell all</button> : null}</div></div>;
        }) : <p className="text-sm text-slate-400">Nothing collected yet.</p>}
      </div>
    </section>
  );
}
