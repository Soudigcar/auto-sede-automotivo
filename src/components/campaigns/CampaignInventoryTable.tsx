'use client';

import { Star } from 'lucide-react';

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Props = {
  assignments: any[];
  search: string;
  setSearch: (value: string) => void;
  onUpdate: (assignmentId: string, patch: Record<string, unknown>) => void;
};

export function CampaignInventoryTable({ assignments, search, setSearch, onUpdate }: Props) {
  const term = search.toLowerCase().trim();
  const filtered = assignments.filter((item) => !term || [
    item.vehicle?.brand,
    item.vehicle?.model,
    item.vehicle?.version,
    item.store?.store_name
  ].some((value) => String(value || '').toLowerCase().includes(term)));

  return (
    <section className="mt-6 rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Estoque do evento</p>
          <h2 className="mt-1 text-2xl font-black">Revisar veículos sincronizados</h2>
          <p className="mt-1 text-sm text-zinc-500">O vínculo é automático. Aqui você pode ocultar, destacar ou definir um preço promocional somente para este evento.</p>
        </div>
        <input className="premium-input max-w-md" placeholder="Buscar veículo ou loja" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="p-3">Veículo</th><th className="p-3">Loja</th><th className="p-3">Preço</th><th className="p-3">Exibir</th><th className="p-3">Destaque</th><th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((assignment) => (
              <tr key={assignment.id} className="border-b border-zinc-100">
                <td className="p-3"><strong>{assignment.vehicle?.brand} {assignment.vehicle?.model}</strong><p className="text-xs text-zinc-500">{assignment.vehicle?.version} {assignment.vehicle?.year}</p></td>
                <td className="p-3 font-semibold">{assignment.store?.store_name}</td>
                <td className="p-3"><input className="premium-input w-40" type="number" min="0" placeholder={money(assignment.vehicle?.price)} defaultValue={assignment.promotional_price || ''} onBlur={(event) => onUpdate(assignment.id, { promotional_price: event.target.value })} /></td>
                <td className="p-3"><input type="checkbox" checked={assignment.show_on_landing === true} onChange={(event) => onUpdate(assignment.id, { show_on_landing: event.target.checked })} /></td>
                <td className="p-3"><button type="button" onClick={() => onUpdate(assignment.id, { is_featured: !assignment.is_featured })} className={`flex h-10 w-10 items-center justify-center rounded-xl ${assignment.is_featured ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-400'}`}><Star size={17} fill={assignment.is_featured ? 'currentColor' : 'none'} /></button></td>
                <td className="p-3"><button type="button" onClick={() => onUpdate(assignment.id, { status: assignment.status === 'active' ? 'inactive' : 'active' })} className={`rounded-full px-3 py-2 text-xs font-black ${assignment.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{assignment.status === 'active' ? 'Ativo' : 'Inativo'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-10 text-center text-sm font-bold text-zinc-500">Nenhum veículo encontrado. Vincule lojas ao evento e clique em sincronizar.</div> : null}
      </div>
    </section>
  );
}
