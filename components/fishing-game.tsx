'use client';

import { Anchor, Bot, Fish, Gauge, Sailboat, ShoppingBag, Sparkles, TimerReset, Waves } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppSelectMenu } from '@/components/app-select-menu';
import { CompanionShell, CompanionTabBar, EmptyState, formatDuration, formatNumber, ProgressBar, useDiscordCompanionDashboard } from '@/components/discord-companion-ui';
import type { FishingDashboard } from '@/lib/fishing';

type FishingTab = 'voyage' | 'ship' | 'market' | 'logbook';

const tabs: Array<{ id: FishingTab; label: string }> = [
  { id: 'voyage', label: 'Voyage board' },
  { id: 'ship', label: 'Ship & crew' },
  { id: 'market', label: 'Harbor market' },
  { id: 'logbook', label: 'Logbook' },
];

function rarityClass(rarity?: string) {
  if (rarity === 'Legendary') return 'border-amber-300/35 bg-amber-300/10 text-amber-100';
  if (rarity === 'Epic') return 'border-violet-300/35 bg-violet-300/10 text-violet-100';
  if (rarity === 'Rare') return 'border-sky-300/35 bg-sky-300/10 text-sky-100';
  if (rarity === 'Uncommon') return 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100';
  return 'border-white/15 bg-white/5 text-slate-200';
}

export function FishingGame() {
  const { act, busyAction, dashboard, error, notice, refresh } = useDiscordCompanionDashboard<FishingDashboard>('/api/fishing');
  const [tab, setTab] = useState<FishingTab>('voyage');
  const [biomeId, setBiomeId] = useState<string>('harbor');
  const [durationTier, setDurationTier] = useState<number>(1);
  const [crewSlot, setCrewSlot] = useState<number>(1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dashboard) return;
    if (!dashboard.biomes.some((biome) => biome.id === biomeId && biome.unlocked)) setBiomeId(dashboard.biomes.find((biome) => biome.unlocked)?.id ?? 'harbor');
    if (!dashboard.durations.some((duration) => duration.tier === durationTier && duration.unlocked)) setDurationTier(dashboard.durations.find((duration) => duration.unlocked)?.tier ?? 1);
    if (crewSlot > dashboard.crewSlots) setCrewSlot(1);
  }, [biomeId, crewSlot, dashboard, durationTier]);

  const activeCrewSlots = useMemo(() => new Set(dashboard?.activeExpeditions.map((expedition) => expedition.crewSlot) ?? []), [dashboard?.activeExpeditions]);
  const selectedBiome = dashboard?.biomes.find((biome) => biome.id === biomeId);
  const selectedDuration = dashboard?.durations.find((duration) => duration.tier === durationTier);
  const hasAvailableCrew = dashboard ? Array.from({ length: dashboard.crewSlots }, (_, index) => index + 1).some((slot) => !activeCrewSlots.has(slot)) : false;

  const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/40 bg-sky-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-45';
  const panel = 'rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5';

  return (
    <CompanionShell
      balance={dashboard?.balance}
      eyebrow="Discord companion · Shared expeditions"
      icon={Fish}
      theme="sky"
      title="Fishing Fleet"
      subtitle="Choose a destination, send an available crew, and manage the exact Fishing progression your Discord bot settles and announces."
      onRefresh={() => void refresh()}
      refreshing={busyAction === 'refresh'}
    >
      <CompanionTabBar tabs={tabs} active={tab} onChange={setTab} theme="sky" />
      {error ? <p role="alert" className="mt-5 rounded-2xl border border-rose-300/30 bg-rose-950/35 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
      {notice ? <p role="status" className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</p> : null}
      {!dashboard && !error ? <div className="mt-5 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-12 text-center text-sm font-semibold text-slate-400">Charting the waters…</div> : null}

      {dashboard && tab === 'voyage' ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className={`${panel} relative overflow-visible`}>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-35 [background:repeating-radial-gradient(ellipse_at_50%_100%,transparent_0_11px,rgba(56,189,248,0.35)_12px_14px)]" />
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">Dispatch console</p><h2 className="mt-1 text-2xl font-black text-white">Plan a voyage</h2></div>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-black text-sky-100"><Waves size={14} />Live fleet</span>
            </div>
            <div className="relative mt-5 grid gap-4 sm:grid-cols-2">
              <AppSelectMenu label="Destination" value={biomeId} onChange={setBiomeId} options={dashboard.biomes.map((biome) => ({ value: biome.id, label: biome.name, description: biome.unlocked ? biome.description : `Requires ${biome.requiredBoatName ?? 'a ship upgrade'}.` }))} />
              <AppSelectMenu label="Voyage length" value={durationTier} onChange={setDurationTier} options={dashboard.durations.map((duration) => ({ value: duration.tier, label: `${formatDuration(duration.durationSeconds * 1_000)} voyage`, description: duration.unlocked ? `Returns ${duration.tier === 1 ? 'a quick catch' : 'a larger haul'} at Fishing level ${duration.requiredFishingLevel}.` : `Unlocks at Fishing level ${duration.requiredFishingLevel}.` }))} />
              <AppSelectMenu label="Crew slot" value={crewSlot} onChange={setCrewSlot} options={Array.from({ length: dashboard.crewSlots }, (_, index) => index + 1).map((slot) => ({ value: slot, label: slot === 1 ? 'Captain' : `Crew ${slot - 1}`, description: activeCrewSlots.has(slot) ? 'Currently at sea.' : slot === 1 ? 'Standard voyage time.' : 'Crew voyages take longer and run in parallel.' }))} />
              <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Selected route</p><p className="mt-2 font-bold text-white">{selectedBiome?.name ?? 'Destination'} · {selectedDuration ? formatDuration(selectedDuration.durationSeconds * 1_000) : 'Duration'}</p><p className="mt-1 text-xs leading-5 text-slate-400">Completion posts to your configured Fishing Discord channel.</p></div>
            </div>
            <button type="button" disabled={busyAction !== null || !selectedBiome?.unlocked || !selectedDuration?.unlocked || activeCrewSlots.has(crewSlot) || !hasAvailableCrew} onClick={() => void act('start', { action: 'start', biomeId, durationTier, crewSlot }, `Crew slot ${crewSlot} is underway. Discord will announce the completed haul.`)} className={`relative mt-5 w-full ${primaryButton}`}>
              <Sailboat size={18} /> {activeCrewSlots.has(crewSlot) ? 'Crew already at sea' : 'Launch expedition'}
            </button>
          </div>
          <div className={panel}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Fishing skill</p><p className="mt-1 text-3xl font-black text-white">Level {dashboard.fishing.level}</p></div><Gauge className="text-sky-300" size={30} /></div>
            <div className="mt-4"><div className="mb-2 flex justify-between gap-3 text-xs font-bold text-slate-400"><span>{formatNumber(dashboard.fishing.xpIntoLevel)} XP into level</span><span>{formatNumber(dashboard.fishing.xpToNextLevel)} XP to next</span></div><ProgressBar theme="sky" label="Fishing experience progress" value={dashboard.fishing.xpToNextLevel ? (dashboard.fishing.xpIntoLevel / dashboard.fishing.xpToNextLevel) * 100 : 100} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><SmallMetric label="Available crews" value={`${dashboard.crewSlots - activeCrewSlots.size}/${dashboard.crewSlots}`} /><SmallMetric label="Relics active" value={String(dashboard.equipment.passiveItems.length)} /></div>
            <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-300/5 p-3 text-xs leading-5 text-sky-100">Your rod and bait are snapshotted when a voyage leaves port, so equipment changes never rewrite a trip already at sea.</div>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Fleet status</p>
            {dashboard.activeExpeditions.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{dashboard.activeExpeditions.map((expedition) => {
              const total = Math.max(1, new Date(expedition.completesAt).getTime() - new Date(expedition.startedAt).getTime());
              const elapsed = Math.max(0, now - new Date(expedition.startedAt).getTime());
              const remaining = Math.max(0, new Date(expedition.completesAt).getTime() - now);
              return <article key={expedition.id} className={`${panel} border-sky-300/20`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-sky-200">{expedition.crewSlot === 1 ? 'Captain' : `Crew ${expedition.crewSlot - 1}`}</p><h3 className="mt-1 text-lg font-black text-white">{expedition.biomeName}</h3></div><TimerReset className="text-sky-300" size={19} /></div><div className="mt-4"><ProgressBar theme="sky" value={(elapsed / total) * 100} label={`${expedition.biomeName} voyage progress`} /><p className="mt-2 text-sm font-bold text-sky-100">{remaining ? `${formatDuration(remaining)} remaining` : 'Awaiting Discord settlement…'}</p></div></article>;
            })}</div> : <EmptyState>No boats are out right now. Pick a destination above to send your first voyage.</EmptyState>}
          </div>
        </section>
      ) : null}

      {dashboard && tab === 'ship' ? <section className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><div className={panel}><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">Equipped for the next trip</p><div className="mt-5 grid gap-3"><EquipmentCard icon={Anchor} label="Rod" name={dashboard.equipment.rodName} /><EquipmentCard icon={Sparkles} label="Bait" name={dashboard.equipment.baitName} /></div><div className="mt-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Permanent relics</p>{dashboard.equipment.passiveItems.length ? <div className="mt-3 grid gap-2">{dashboard.equipment.passiveItems.map((item) => <div key={item.name} className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><p className="font-bold text-white">{item.name}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-400">Relics found at sea will appear here.</p>}</div></div><div className={panel}><div className="flex items-center gap-3"><Bot className="text-sky-300" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Dock equipment</p><h2 className="text-xl font-black text-white">Owned rods & bait</h2></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{dashboard.inventory.filter((item) => item.category === 'rod' || item.category === 'bait').map((item) => {
  const equipped = item.name === dashboard.equipment.rodName || item.name === dashboard.equipment.baitName;
  return <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{item.category}</p><p className="mt-1 font-black text-white">{item.name}</p><button type="button" disabled={equipped || busyAction !== null} onClick={() => void act(`equip-${item.id}`, { action: 'equip', upgradeId: item.id }, `${item.name} is equipped for future voyages.`)} className="mt-4 min-h-9 rounded-lg border border-sky-300/35 bg-sky-300/10 px-3 text-xs font-black text-sky-100 transition hover:bg-sky-300/20 disabled:opacity-45">{equipped ? 'Equipped' : 'Equip'}</button></div>;
})}</div></div></section> : null}

      {dashboard && tab === 'market' ? <section className="mt-5"><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">Harbor market</p><h2 className="mt-1 text-2xl font-black text-white">Build the next voyage</h2></div><ShoppingBag className="text-sky-300" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.shop.map((item) => <article key={item.id} className={`${panel} flex flex-col ${item.owned ? 'border-emerald-300/25' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{item.category}</p><h3 className="mt-1 text-lg font-black text-white">{item.name}</h3></div>{item.owned ? <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide text-emerald-100">Owned</span> : null}</div><p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p><div className="mt-4 space-y-1 text-xs font-semibold text-slate-500"><p>{formatNumber(item.cost)} KnowBucks</p>{item.requiredFishingLevel ? <p>Level {item.requiredFishingLevel} required</p> : null}{item.requiredUpgradeName ? <p>Requires {item.requiredUpgradeName}</p> : null}</div><button type="button" disabled={!item.canBuy || busyAction !== null} onClick={() => void act(`buy-${item.id}`, { action: 'purchase', upgradeId: item.id }, `${item.name} added to your Fishing setup.`)} className="mt-4 min-h-10 rounded-xl border border-sky-300/35 bg-sky-300/10 px-3 text-sm font-black text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-45">{item.owned ? 'Already owned' : item.canBuy ? 'Purchase' : 'Locked or unaffordable'}</button></article>)}</div></section> : null}

      {dashboard && tab === 'logbook' ? <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><div className={panel}><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">Latest settlement</p>{dashboard.mostRecent ? <><div className="mt-3 flex flex-wrap gap-3 text-sm"><span className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 font-black text-sky-100">+{formatNumber(dashboard.mostRecent.knowBucksAwarded)} KnowBucks</span><span className="rounded-xl border border-violet-300/25 bg-violet-300/10 px-3 py-2 font-black text-violet-100">+{formatNumber(dashboard.mostRecent.fishingXpAwarded)} Fishing XP</span></div><div className="mt-5 grid gap-2">{dashboard.mostRecent.catches.map((catchItem, index) => <div key={`${catchItem.name}-${index}`} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${rarityClass(catchItem.rarity)}`}><span className="font-bold">{catchItem.name}</span><span className="text-xs font-black">×{formatNumber(catchItem.quantity)}</span></div>)}</div></> : <EmptyState>Your completed voyage will be recorded here after the Discord bot settles it.</EmptyState>}</div><div className={panel}><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Stored discoveries</p><h2 className="mt-1 text-xl font-black text-white">Inventory</h2><div className="mt-4 grid gap-2">{dashboard.inventory.filter((item) => item.category === 'gear' || item.category === 'collectible').length ? dashboard.inventory.filter((item) => item.category === 'gear' || item.category === 'collectible').map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2"><span className="text-sm font-bold text-slate-200">{item.name}</span><span className="text-xs font-black text-slate-500">×{formatNumber(item.quantity)}</span></div>) : <p className="text-sm leading-6 text-slate-400">Unique relics and event discoveries will land here.</p>}</div></div></section> : null}
    </CompanionShell>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3"><p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>;
}

function EquipmentCard({ icon: Icon, label, name }: { icon: typeof Anchor; label: string; name: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-300/10 text-sky-200"><Icon size={18} /></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 font-black text-white">{name}</p></div></div>;
}
