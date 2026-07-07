'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Car, CheckCircle2, Clock3, LayoutDashboard, Menu, Search, Store, XCircle } from 'lucide-react';
import { leadStatusLabels } from '@/lib/constants';
import { getActiveEvent, getActiveStores, getStoreLeads, updateLeadStatus } from '@/lib/database';

const columns = [
  { key: 'new_lead', title: 'Novo Lead Recebido', action: { status: 'in_service', label: 'Iniciar atendimento' } },
  { key: 'in_service', title: 'Em Atendimento', action: { status: 'scheduled', label: 'Agendar' } },
  { key: 'scheduled', title: 'Agendado', action: { status: 'showed_up', label: 'Confirmar chegada' } },
  { key: 'showed_up', title: 'Compareceu', action: { status: 'sale_confirmed', label: 'Confirmar venda' } },
  { key: 'no_show', title: 'Nao Compareceu', action: { status: 'lost', label: 'Registrar perda' } }
];

export default function StoreLivePage() {
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadStores() {
    try {
      const activeEvent = await getActiveEvent();
      const activeStores = await getActiveStores(activeEvent.id);
      setStores(activeStores);
      if (activeStores.length > 0 && !selectedStoreId) {
        setSelectedStoreId(activeStores[0].id);
        setLeads(await getStoreLeads(activeStores[0].id));
      }
    } catch {
      setMessage('Nao foi possivel carregar lojas. Verifique o Supabase.');
    }
  }

  async function loadLeads(storeId: string) {
    setSelectedStoreId(storeId);
    setLeads(await getStoreLeads(storeId));
    const storeName = stores.find((store) => store.id === storeId)?.store_name || 'loja selecionada';
    setMessage(`Pipeline atualizada para ${storeName}.`);
  }

  async function changeStatus(leadId: string, status: string) {
    setMessage('Atualizando lead...');
    try {
      await updateLeadStatus(leadId, status);
      if (selectedStoreId) await loadLeads(selectedStoreId);
      setMessage('Lead atualizado com sucesso.');
    } catch {
      setMessage('Erro ao atualizar lead.');
    }
  }

  useEffect(() => { loadStores(); }, []);

  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const activeLeads = leads.filter((lead) => !['sale_confirmed', 'lost'].includes(lead.status));

  const grouped = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      leads: activeLeads.filter((lead) => lead.status === column.key)
    }));
  }, [activeLeads]);

  const soldCount = leads.filter((lead) => lead.status === 'sale_confirmed').length;
  const lostCount = leads.filter((lead) => lead.status === 'lost').length;

  return (
    <main className="min-h-screen bg-[#F4F6FA] text-[#101828]">
      <div className="flex min-h-screen">
        <aside className="hidden w-20 shrink-0 bg-[#071020] px-4 py-6 text-white lg:flex lg:flex-col lg:items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
          <nav className="mt-10 flex flex-1 flex-col gap-4">
            <Link href="/routes" className="rounded-2xl bg-red-600 p-3 text-white"><LayoutDashboard size={20} /></Link>
            <Link href="/store/live" className="rounded-2xl p-3 text-zinc-400 hover:bg-white/10 hover:text-white"><Store size={20} /></Link>
            <button className="rounded-2xl p-3 text-zinc-400 hover:bg-white/10 hover:text-white"><Search size={20} /></button>
          </nav>
        </aside>

        <section className="min-w-0 flex-1 p-4 md:p-6">
          <header className="flex flex-col gap-4 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Auto Controle Automotivo</p>
              <h1 className="mt-2 text-3xl font-black">Store Pipeline Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-500">Leads recebidos pelo direcionamento do prospector.</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-500"><Bell size={18} /></button>
              <button className="rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-500"><Menu size={18} /></button>
            </div>
          </header>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <label className="flex-1 text-sm font-bold text-zinc-500">Loja
                  <select className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base font-black text-zinc-900" value={selectedStoreId} onChange={(event) => loadLeads(event.target.value)}>
                    <option value="">Selecione a loja</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                  </select>
                </label>
                <button className="rounded-2xl bg-red-600 px-5 py-3 font-black text-white shadow-lg shadow-red-600/20" onClick={() => selectedStoreId && loadLeads(selectedStoreId)}>Atualizar pipeline</button>
              </div>
              {message ? <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Leads" value={leads.length} />
              <Kpi label="Vendas" value={soldCount} />
              <Kpi label="Perdas" value={lostCount} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_340px]">
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[1100px] grid-cols-5 gap-4">
                {grouped.map((column) => (
                  <div key={column.key} className="rounded-[26px] border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-black">{column.title}</h2>
                        <p className="text-xs text-zinc-400">{column.leads.length} cards</p>
                      </div>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-500">{column.leads.length}</span>
                    </div>

                    <div className="space-y-3">
                      {column.leads.map((lead) => (
                        <div key={lead.id} className="rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-3 shadow-sm">
                          <h3 className="text-sm font-black">{lead.customer_name}</h3>
                          <p className="mt-1 text-xs text-zinc-500">{lead.interested_vehicle || 'Interesse nao informado'}</p>
                          <p className="mt-1 text-[11px] text-zinc-400">{lead.customer_phone || 'Sem telefone'}</p>
                          <button className="mt-3 w-full rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-black uppercase text-white" onClick={() => changeStatus(lead.id, column.action.status)}>{column.action.label}</button>
                        </div>
                      ))}
                      {column.leads.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-xs text-zinc-400">Sem leads nesta etapa</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black">Resumo da loja</h2>
                <p className="mt-1 text-sm text-zinc-500">{selectedStore?.store_name || 'Selecione uma loja'}</p>
                <div className="mt-5 grid gap-3">
                  <Status label="Novos" value={leads.filter((lead) => lead.status === 'new_lead').length} icon={<Clock3 size={18} />} />
                  <Status label="Confirmados" value={soldCount} icon={<CheckCircle2 size={18} />} />
                  <Status label="Perdidos" value={lostCount} icon={<XCircle size={18} />} />
                </div>
              </div>

              <div className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black">Estoque</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <StockRow label="Disponivel" value="45" color="text-emerald-600" />
                  <StockRow label="Reservado" value="12" color="text-amber-600" />
                  <StockRow label="Vendido" value="10" color="text-red-600" />
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-2 block text-3xl font-black">{value}</strong></div>;
}

function Status({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between rounded-2xl bg-zinc-50 p-4"><div className="flex items-center gap-3 text-zinc-500">{icon}<span className="font-bold">{label}</span></div><strong>{value}</strong></div>;
}

function StockRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center justify-between rounded-2xl border border-zinc-100 p-3"><div className="flex items-center gap-3"><div className="h-8 w-12 rounded-lg bg-zinc-200" /><span className="font-bold">{label}</span></div><strong className={color}>{value}</strong></div>;
}
