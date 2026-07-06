'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export function PreSalesPipelineContent() {
  const supabase = createClient();
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadLeads() {
    const { data, error } = await supabase.from('leads').select('*').eq('status', 'pre_sales_queue').order('created_at', { ascending: false });
    if (error) {
      setMessage('Erro ao carregar pre-vendas.');
      return;
    }
    setLeads(data || []);
  }

  useEffect(() => { loadLeads(); }, []);

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Pre-vendas</p>
        <h1 className="mt-2 text-4xl font-black">Pipeline de pesquisas finalizadas</h1>
        <p className="mt-3 text-sm text-zinc-400">Aqui aparecem os leads finalizados pelo prospector sem envio imediato para uma loja.</p>
        {message ? <div className="card mt-5 p-4 text-sm text-zinc-200">{message}</div> : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="card p-5"><p className="text-sm text-zinc-400">Leads recebidos</p><strong className="mt-2 block text-3xl">{leads.length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Com contato</p><strong className="mt-2 block text-3xl">{leads.filter((lead) => Boolean(lead.customer_phone)).length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Origem</p><strong className="mt-2 block text-xl">Pesquisa de Rua</strong></div>
        </div>

        <div className="mt-8 grid gap-4">
          {leads.map((lead) => (
            <div key={lead.id} className="card p-5">
              <h2 className="text-xl font-bold">{lead.customer_name}</h2>
              <p className="text-sm text-zinc-400">Contato: {lead.customer_phone || 'Nao informado'}</p>
              <p className="text-sm text-zinc-400">Carro desejado: {lead.interested_vehicle || 'Nao informado'}</p>
              {lead.notes ? <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">{lead.notes}</pre> : null}
            </div>
          ))}
          {leads.length === 0 ? <div className="card p-6 text-zinc-400">Nenhum lead aguardando pre-vendas.</div> : null}
        </div>
      </section>
    </main>
  );
}
