'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  MessageCircle,
  PhoneCall,
  PhoneOff,
  Radio,
  RefreshCw,
  Search,
  Store,
  UserCheck,
  X
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const statusLabels: Record<string, string> = {
  new_lead: 'Novo lead',
  in_service: 'Em atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Cancelou agendamento',
  no_show: 'Não compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda confirmada',
  lost: 'Perdido'
};

const statusOptions = Object.entries(statusLabels);

function formatDateTime(value: unknown) {
  if (!value) return 'Ainda não ocorreu';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Data inválida';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function elapsed(value: unknown) {
  if (!value) return 'Sem registro';
  const startedAt = new Date(String(value)).getTime();
  if (Number.isNaN(startedAt)) return 'Sem registro';

  const difference = Math.max(0, Date.now() - startedAt);
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function ageMinutes(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function needsAttention(lead: any) {
  if (!lead.first_phone_viewed_at && ageMinutes(lead.created_at) >= 10) return true;
  if (lead.status === 'new_lead' && lead.first_phone_viewed_at && ageMinutes(lead.first_phone_viewed_at) >= 15) return true;
  if (lead.status === 'in_service' && ageMinutes(lead.stage_entered_at) >= 30) return true;
  return false;
}

function attentionMessage(lead: any) {
  if (!lead.first_phone_viewed_at && ageMinutes(lead.created_at) >= 10) {
    return `Enviado há ${elapsed(lead.created_at)} e o telefone ainda não foi visualizado`;
  }

  if (lead.status === 'new_lead' && lead.first_phone_viewed_at && ageMinutes(lead.first_phone_viewed_at) >= 15) {
    return `Telefone visualizado há ${elapsed(lead.first_phone_viewed_at)}, mas o atendimento não começou`;
  }

  if (lead.status === 'in_service' && ageMinutes(lead.stage_entered_at) >= 30) {
    return `Parado em atendimento há ${elapsed(lead.stage_entered_at)}`;
  }

  return '';
}

function statusClass(status: string) {
  if (status === 'sale_confirmed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'lost') return 'bg-red-50 text-red-700';
  if (status === 'scheduled') return 'bg-amber-50 text-amber-700';
  if (status === 'in_service') return 'bg-violet-50 text-violet-700';
  if (status === 'showed_up') return 'bg-cyan-50 text-cyan-700';
  return 'bg-blue-50 text-blue-700';
}

export default function LeadMonitoringPage() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [attentionFilter, setAttentionFilter] = useState('all');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [message, setMessage] = useState('Carregando monitoramento...');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/master/lead-monitoring', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao carregar monitoramento.');

      setLeads(result.leads || []);
      setActivities(result.activities || []);
      setStores(result.stores || []);
      setLastUpdatedAt(result.generated_at || new Date().toISOString());
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar monitoramento.');
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadData(), 250);
    };

    const channel = supabase
      .channel('master-lead-monitoring')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_activity_logs' }, scheduleReload)
      .subscribe((status) => setRealtimeStatus(status));

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const activitiesByLead = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of activities) {
      if (!item.lead_id) continue;
      const current = map.get(item.lead_id) || [];
      current.push(item);
      map.set(item.lead_id, current);
    }
    return map;
  }, [activities]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return leads.filter((lead) => {
      if (storeFilter !== 'all' && lead.assigned_store_id !== storeFilter) return false;
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (attentionFilter === 'attention' && !needsAttention(lead)) return false;
      if (attentionFilter === 'unopened' && lead.first_viewed_at) return false;
      if (attentionFilter === 'phone_unseen' && lead.first_phone_viewed_at) return false;
      if (attentionFilter === 'phone_seen' && !lead.first_phone_viewed_at) return false;
      if (attentionFilter === 'whatsapp' && !lead.first_whatsapp_clicked_at) return false;

      if (!term) return true;
      return [
        lead.customer_name,
        lead.customer_phone,
        lead.interested_vehicle,
        lead.origin,
        lead.assigned_store_name,
        lead.first_viewed_by_name,
        lead.first_phone_viewed_by_name,
        lead.last_activity_by_name
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [attentionFilter, leads, query, statusFilter, storeFilter]);

  const summary = useMemo(() => ({
    total: leads.length,
    unopened: leads.filter((lead) => !lead.first_viewed_at).length,
    phoneUnseen: leads.filter((lead) => !lead.first_phone_viewed_at).length,
    attention: leads.filter(needsAttention).length,
    service: leads.filter((lead) => lead.status === 'in_service').length,
    scheduled: leads.filter((lead) => lead.status === 'scheduled').length,
    sold: leads.filter((lead) => lead.status === 'sale_confirmed').length
  }), [leads]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;
  const selectedActivities = selectedLead ? activitiesByLead.get(selectedLead.id) || [] : [];
  const live = realtimeStatus === 'SUBSCRIBED';

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/lead-monitoring" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Central de acompanhamento</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Monitoramento de Leads</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Diferencie abertura do lead, visualização do telefone, WhatsApp, mudança de etapa e tempo de resposta.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wide ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                <Radio className={live ? 'animate-pulse' : ''} size={16} />
                {live ? 'Tempo real conectado' : 'Conectando tempo real'}
              </span>
              <button className="premium-button-secondary" type="button" onClick={() => void loadData()}>
                <RefreshCw size={17} /> Atualizar
              </button>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{message}</div> : null}

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Kpi label="Leads monitorados" value={summary.total} icon={<Activity size={18} />} />
            <Kpi label="Não abertos" value={summary.unopened} icon={<EyeOff size={18} />} />
            <Kpi label="Telefone não visto" value={summary.phoneUnseen} icon={<PhoneOff size={18} />} />
            <Kpi label="Precisam atenção" value={summary.attention} icon={<AlertTriangle size={18} />} />
            <Kpi label="Em atendimento" value={summary.service} icon={<UserCheck size={18} />} />
            <Kpi label="Agendados" value={summary.scheduled} icon={<Clock3 size={18} />} />
            <Kpi label="Vendas" value={summary.sold} icon={<CheckCircle2 size={18} />} />
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr]">
              <label className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" placeholder="Buscar cliente, telefone, veículo, loja ou responsável" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>

              <select className="premium-input" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="all">Todas as lojas</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
              </select>

              <select className="premium-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todas as etapas</option>
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>

              <select className="premium-input" value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value)}>
                <option value="all">Todos os acompanhamentos</option>
                <option value="attention">Precisam de atenção</option>
                <option value="unopened">Lead ainda não aberto</option>
                <option value="phone_unseen">Telefone não visualizado</option>
                <option value="phone_seen">Telefone visualizado</option>
                <option value="whatsapp">WhatsApp acessado</option>
              </select>
            </div>
          </section>

          <section className="mt-5 space-y-4">
            {filtered.map((lead) => {
              const warning = attentionMessage(lead);
              const history = activitiesByLead.get(lead.id) || [];

              return (
                <article key={lead.id} className="premium-card overflow-hidden p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-lg font-black text-zinc-950">{lead.customer_name || 'Cliente sem nome'}</h2>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(lead.status)}`}>{statusLabels[lead.status] || lead.status}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${lead.first_viewed_at ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                          {lead.first_viewed_at ? <Eye size={13} /> : <EyeOff size={13} />} {lead.first_viewed_at ? 'Lead aberto' : 'Não aberto'}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${lead.first_phone_viewed_at ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                          {lead.first_phone_viewed_at ? <PhoneCall size={13} /> : <PhoneOff size={13} />} {lead.first_phone_viewed_at ? 'Telefone visto' : 'Telefone não visto'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-zinc-600">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-50 px-3 py-2"><Store size={14} /> {lead.assigned_store_name}</span>
                        <span className="rounded-xl bg-zinc-50 px-3 py-2">{lead.customer_phone || 'Sem telefone'}</span>
                        <span className="rounded-xl bg-zinc-50 px-3 py-2">{lead.interested_vehicle || 'Veículo não informado'}</span>
                        <span className="rounded-xl bg-zinc-50 px-3 py-2">Origem: {lead.origin || 'Não informada'}</span>
                      </div>

                      {warning ? <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertTriangle className="mt-0.5 shrink-0" size={17} /> {warning}</div> : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                        <Info label="Distribuído / criado" value={formatDateTime(lead.created_at)} />
                        <Info label="Primeira abertura" value={lead.first_viewed_at ? `${formatDateTime(lead.first_viewed_at)} por ${lead.first_viewed_by_name || 'usuário da loja'}` : 'Ainda não abriu'} />
                        <Info label="Telefone visualizado" value={lead.first_phone_viewed_at ? `${formatDateTime(lead.first_phone_viewed_at)} por ${lead.first_phone_viewed_by_name || 'usuário da loja'}` : 'Ainda não visualizou'} />
                        <Info label="Clique no WhatsApp" value={lead.first_whatsapp_clicked_at ? formatDateTime(lead.first_whatsapp_clicked_at) : 'Ainda não clicou'} />
                        <Info label="Tempo na etapa" value={elapsed(lead.stage_entered_at || lead.updated_at || lead.created_at)} />
                      </div>

                      <p className="mt-4 text-xs font-bold text-zinc-400">
                        Última atividade: {lead.last_activity_label || 'Lead criado'}{lead.last_activity_by_name ? ` por ${lead.last_activity_by_name}` : ''}{lead.last_activity_at ? ` em ${formatDateTime(lead.last_activity_at)}` : ''}.
                      </p>
                    </div>

                    <div className="w-full shrink-0 rounded-3xl border border-zinc-100 bg-zinc-50 p-4 xl:w-64">
                      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Histórico</p>
                      <strong className="mt-1 block text-3xl font-black text-zinc-950">{history.length}</strong>
                      <p className="mt-1 text-xs font-bold text-zinc-500">ações registradas</p>
                      <button className="mt-4 w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-black text-white" type="button" onClick={() => setSelectedLeadId(lead.id)}>Ver linha do tempo</button>
                    </div>
                  </div>
                </article>
              );
            })}

            {!filtered.length && !message ? <div className="premium-card p-10 text-center text-sm font-bold text-zinc-500">Nenhum lead encontrado com estes filtros.</div> : null}
          </section>

          <p className="mt-5 text-right text-xs font-bold text-zinc-400">Última sincronização: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'carregando'}</p>
        </div>
      </section>

      {selectedLead ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setSelectedLeadId('')}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-600">Linha do tempo</p>
                <h2 className="mt-2 text-2xl font-black text-zinc-950">{selectedLead.customer_name || 'Cliente sem nome'}</h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">{selectedLead.assigned_store_name}</p>
              </div>
              <button className="rounded-2xl bg-zinc-100 p-3 text-zinc-600" type="button" onClick={() => setSelectedLeadId('')}><X size={18} /></button>
            </div>

            <div className="mt-6 space-y-3">
              {selectedActivities.map((item) => (
                <div key={item.id} className="relative rounded-2xl border border-zinc-100 bg-zinc-50 p-4 pl-12">
                  <span className="absolute left-4 top-5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"><Activity size={11} /></span>
                  <p className="font-black text-zinc-950">{item.activity_label}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-500">{formatDateTime(item.created_at)} · {item.user_name || 'Sistema'}</p>
                  {item.from_status && item.to_status && item.from_status !== item.to_status ? <p className="mt-2 text-sm font-bold text-zinc-700">{statusLabels[item.from_status] || item.from_status} → {statusLabels[item.to_status] || item.to_status}</p> : null}
                  {item.notes ? <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.notes}</p> : null}
                </div>
              ))}

              {!selectedActivities.length ? <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm font-bold text-zinc-500">Ainda não existem ações registradas para este lead.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="premium-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
          <strong className="mt-1 block text-2xl font-black text-zinc-950">{value}</strong>
        </div>
        <span className="rounded-2xl bg-red-50 p-3 text-red-600">{icon}</span>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <strong className="mt-1 block break-words text-sm text-zinc-800">{value}</strong>
    </div>
  );
}
