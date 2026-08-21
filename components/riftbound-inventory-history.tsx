import { formatRiftboundCents, formatRiftboundSaleDate } from '@/lib/riftbound-sales';
import type { RiftboundCard } from '@/lib/riftbound';
import type { RiftboundInventoryHistoryGroup } from '@/lib/riftbound-inventory-history';

type RiftboundInventoryHistoryProps = {
  history: RiftboundInventoryHistoryGroup[];
  cards: RiftboundCard[];
  loading: boolean;
  error: string;
};

function getEventLabel(eventType: RiftboundInventoryHistoryGroup['event_type']) {
  return eventType === 'sale' ? 'Review Sale' : 'Update Inventory';
}

export function RiftboundInventoryHistory({ history, cards, loading, error }: RiftboundInventoryHistoryProps) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6" aria-label="Inventory history">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Inventory workspace</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">History</h2>
          <p className="mt-2 text-sm text-slate-400">A grouped record of the inventory updates and sales you have confirmed.</p>
        </div>
        {!loading && !error ? <p className="text-xs font-bold text-slate-500">{history.length} {history.length === 1 ? 'event' : 'events'}</p> : null}
      </div>

      {loading ? <p className="px-2 py-12 text-center text-sm font-semibold text-slate-400">Loading inventory history...</p> : null}
      {error ? <p className="rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-5 text-sm font-semibold text-red-200">{error}</p> : null}
      {!loading && !error && history.length === 0 ? (
        <p className="px-2 py-12 text-center text-sm font-semibold text-slate-500">No inventory history yet. Save an inventory update or finalize a sale to start your history.</p>
      ) : null}

      {!loading && !error && history.length > 0 ? (
        <div className="mt-5 grid gap-5">
          {history.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60" aria-label={`${getEventLabel(group.event_type)} on ${formatRiftboundSaleDate(group.occurred_at, true)}`}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-4 py-3">
                <p className={`text-xs font-black uppercase tracking-[0.16em] ${group.event_type === 'sale' ? 'text-emerald-300' : 'text-amber-300'}`}>{getEventLabel(group.event_type)}</p>
                <time dateTime={group.occurred_at} className="text-xs font-semibold text-slate-500">{formatRiftboundSaleDate(group.occurred_at, true)}</time>
              </header>
              <ul className="divide-y divide-white/10">
                {group.items.map((item) => {
                  const card = cardsById.get(item.card_id);
                  const quantity = Math.abs(item.delta);
                  const action = group.event_type === 'sale' ? 'Sold' : item.delta > 0 ? 'Added' : 'Removed';
                  const cardLabel = card
                    ? `${card.displayName} - ${card.setCode} ${card.numberLabel}`
                    : item.card_id;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                      <p className="min-w-0 text-sm font-bold text-slate-200">
                        <span className={`mr-2 inline-flex rounded-md px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.12em] ${action === 'Sold' ? 'bg-emerald-300/10 text-emerald-200' : action === 'Added' ? 'bg-amber-300/10 text-amber-200' : 'bg-slate-800 text-slate-400'}`}>{action}</span>
                        {cardLabel}{quantity > 1 ? ` x${quantity}` : ''}{item.finish === 'foil' ? <span className="ml-2 text-xs font-black uppercase tracking-[0.12em] text-amber-200">Foil</span> : null}
                        {group.event_type === 'sale' ? <span className="ml-2 text-xs font-semibold text-slate-400">(Sale Price: {formatRiftboundCents(item.sale_price_cents)})</span> : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
