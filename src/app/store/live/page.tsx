'use client';

import { useEffect, useState } from 'react';
import { leadStatusLabels } from '@/lib/constants';
import { getActiveEvent, getActiveStores, getStoreLeads, updateLeadStatus } from '@/lib/database';

const nextActions = [
  { status: 'in_service', label: 'Iniciar atendimento' },
  { status: 'scheduled', label: 'Agendar cliente' },
  { status: 'showed_up', label: 'Confirmar comparecimento' },
  { status: 'no_show', label: 'Não compareceu' },
  { status: 'sale_confirmed', label: 'Confirmar venda' },
  { status: 'lost', label: 'Registrar perda' }
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
        const storeLeads = await getStoreLeads(activeStores[0].id);
        setLeads(storeLeads);
      }
    } catch {
      setMessage('Não foi possível carregar lojas. Verifique o Supabase.');
    }
  }

  async function loadLeads(storeId: string) {
    setSelectedStoreId(storeId);
    const storeLeads = await getStoreLeads(storeId);
    setLeads(storeLeads);
  }

  async function changeStatus(leadId: string, status: string) {
    setMessage('Atualizando lead...');
    try {
      await updateLeadStatus(leadId, status);
      await loadLeads(selectedStoreId);
      setMessage('Lead atualizado com sucesso.');
    } catch {
      setMessage('Erro ao atualizar lead.');
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Loja Participante</p>
        <h1 className="mt-2 text-4xl font-black">Pipeline conectado</h1>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <select className="rounded-xl px-4 py-3" value={selectedStoreId} onChange={(event) => loadLeads(event.target.value)}>
            <option value="">Selecione a loja</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => selectedStoreId && loadLeads(selectedStoreId)}>Atualizar leads</button>
        </div>

        {message ? <div className="card mt-5 p-4 text-sm text-zinc-200">{message}</div> : null}

        <div className="mt-8 grid gap-4">
          {leads.map((lead) => (
            <div key={lead.id} className="card p-5">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-bold">{lead.customer_name}</h2>
                  <p className="text-sm text-zinc-400">{lead.customer_phone || 'Sem telefone'} • {lead.interested_vehicle || 'Interesse não informado'}</p>
                  <p className="mt-1 text-xs text-zinc-500">Origem: {lead.origin} • Banco: {lead.customer_bank || 'Não informado'}</p>
                </div>
                <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-bold text-brand-red">{leadStatusLabels[lead.status] || lead.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {nextActions.map((action) => (
                  <button key={action.status} className={action.status === 'sale_confirmed' ? 'btn-primary' : 'btn-secondary'} onClick={() => changeStatus(lead.id, action.status)}>{action.label}</button>
                ))}
              </div>
            </div>
          ))}
          {leads.length === 0 ? <div className="card p-6 text-zinc-400">Nenhum lead recebido para esta loja.</div> : null}
        </div>
      </section>
    </main>
  );
}
