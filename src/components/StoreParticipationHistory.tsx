'use client';

export function StoreParticipationHistory({ store, events, stores, sales, inventory }: { store: any; events: any[]; stores: any[]; sales: any[]; inventory: any[] }) {
  const eventNameById = Object.fromEntries(events.map((item) => [item.id, item.event_name]));
  const relatedStores = stores.filter((item) => {
    const sameEmail = item.responsible_email && store.responsible_email && item.responsible_email === store.responsible_email;
    const sameName = item.store_name && store.store_name && item.store_name.toLowerCase() === store.store_name.toLowerCase();
    return sameEmail || sameName;
  });

  if (relatedStores.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Histórico de participação</p>
      <div className="mt-2 space-y-2">
        {relatedStores.map((item) => {
          const sold = sales.filter((sale) => sale.store_id === item.id && sale.event_id === item.event_id).length;
          const stock = inventory.filter((vehicle) => vehicle.store_id === item.id && vehicle.event_id === item.event_id).length;
          return <p key={item.id} className="text-sm text-zinc-600">{eventNameById[item.event_id] || 'Evento'}: {sold} vendido(s), {stock} no estoque</p>;
        })}
      </div>
    </div>
  );
}
