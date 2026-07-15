'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Car, Mail, Phone, Search, UserCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const statuses = ['Novo lead', 'Em atendimento', 'Simulação enviada', 'Documentação solicitada', 'Aprovado', 'Reprovado', 'Venda concluída', 'Perdido'];

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function maskCpf(value?: string) {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return value;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function assignedStoreName(lead: any) {
  return lead.assigned_store_name || lead.metadata?.routing?.assigned_store_name || '';
}

export default function MasterBasePage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [message, setMessage] = useState('Carregando base...');

  async function loadLeads() {
    const { data, error } = await supabase.from('leads_base').select('*').order('created_at', { ascending: false });

    if (error) {
      setMessage('Não foi possível carregar a Base. Confirme se o SQL foi executado no Supabase.');
      return;
    }

    setLeads(data || []);
    setMessage('');
  }

  useEffect(() => {
    loadLeads().catch(() => setMessage('Erro ao carregar a Base.'));
  }, []);

  const sources = useMemo(() => Array.from(new Set(leads.map((lead) => lead.source).filter(Boolean))).sort(), [leads]);

  const assignedStores = useMemo(() => {
    return Array.from(new Set(leads.map((lead) => assignedStoreName(lead)).filter(Boolean))).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();

    return leads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (source !== 'all' && lead.source !== source) return false;
      if (storeFilter !== 'all' && assignedStoreName(lead) !== storeFilter) return false;

      if (!term) return true;

      return [
        lead.name,
        lead.phone,
        lead.cpf,
        lead.email,
        lead.campaign_name,
        lead.vehicle_name,
        lead.source,
        assignedStoreName(lead)
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [leads, query, status, source, storeFilter]);

  const summary = useMemo(() => ({
    total: leads.length,
    novos: leads.filter((lead) => lead.status === 'Novo lead').length,
    atendimento: leads.filter((lead) => lead.status === 'Em atendimento').length,
    aprovados: leads.filter((lead) => lead.status === 'Aprovado').length,
    vendidos: leads.filter((lead) => lead.status === 'Venda concluída').length,
    perdidos: leads.filter((lead) => lead.status === 'Perdido').length
  }), [leads]);

  async function updateLeadStatus(id: string, nextStatus: string) {
    const { error } = await supabase.from('leads_base').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return;
    await loadLeads();
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Base" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header>
            <p className="premium-eyebrow">Central comercial</p>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Base de Leads</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">
              Todos os leads captados entram nesta base e são distribuídos automaticamente entre as lojas ativas.
            </p>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}

          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Mini label="Total" value={summary.total} />
            <Mini label="Novos" value={summary.novos} />
            <Mini label="Em atendimento" value={summary.atendimento} />
            <Mini label="Aprovados" value={summary.aprovados} />
            <Mini label="Vendas" value={summary.vendidos} />
            <Mini label="Perdidos" value={summary.perdidos} />
          </div>

          <section className="premium-card mt-6 p-5">
            <div className="grid gap-3 xl:grid-cols-[1.4fr_0.75fr_0.75fr_0.75fr]">
              <label className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" placeholder="Buscar por nome, telefone, CPF, campanha, veículo ou loja" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>

              <select className="premium-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Todos os status</option>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>

              <select className="premium-input" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">Todas as origens</option>
                {sources.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>

              <select className="premium-input" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
                <option value="all">Todas as lojas</option>
                {assignedStores.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </section>

          <section className="mt-5 space-y-3">
            {filtered.map((lead) => {
              const storeName = assignedStoreName(lead);

              return (
                <div key={lead.id} className="premium-card p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black text-zinc-950">{lead.name}</h2>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{lead.status}</span>
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500">{lead.source}</span>
                        {storeName ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            Enviado para: {storeName}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                            Sem loja atribuída
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-5">
                        <span className="inline-flex items-center gap-2"><Phone size={15} /> {lead.phone}</span>
                        <span className="inline-flex items-center gap-2"><Mail size={15} /> {lead.email || '-'}</span>
                        <span className="inline-flex items-center gap-2"><UserCheck size={15} /> CPF: {maskCpf(lead.cpf)}</span>
                        <span className="inline-flex items-center gap-2"><Car size={15} /> {lead.vehicle_name || '-'}</span>
                        <span className="inline-flex items-center gap-2"><Building2 size={15} /> {storeName || 'Não enviado'}</span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <Info label="Campanha" value={lead.campaign_name || '-'} />
                        <Info label="Loja enviada" value={storeName || 'Não enviado'} />
                        <Info label="Valor veículo" value={money(lead.vehicle_price)} />
                        <Info label="Entrada" value={money(lead.down_payment)} />
                        <Info label="Parcela estimada" value={`${lead.installments || '-'}x de ${money(lead.estimated_installment)}`} />
                      </div>

                      {lead.assigned_at ? (
                        <p className="mt-3 text-xs font-bold text-zinc-400">
                          Distribuído automaticamente em {new Date(lead.assigned_at).toLocaleString('pt-BR')} via {lead.routing_strategy || 'round_robin'}.
                        </p>
                      ) : null}
                    </div>

                    <div className="min-w-60">
                      <label className="text-xs font-black uppercase tracking-wide text-zinc-400">Status do lead</label>
                      <select className="premium-input mt-1" value={lead.status} onChange={(e) => updateLeadStatus(lead.id, e.target.value)}>
                        {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <p className="mt-2 text-xs font-bold text-zinc-400">{new Date(lead.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filtered.length && !message ? (
              <div className="premium-card p-8 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado.</div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-4">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-1 block text-2xl font-black text-zinc-950">{value}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-1 block text-sm text-zinc-800">{value}</strong>
    </div>
  );
}
