'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LogOut,
  MessageCircle,
  Package,
  PhoneCall,
  RefreshCcw,
  Store,
  UserCheck,
  X,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const columns = [
  { key: 'new_lead', title: 'Novo Lead Recebido' },
  { key: 'in_service', title: 'Em Atendimento' },
  { key: 'scheduled', title: 'Agendado' },
  { key: 'appointment_cancelled', title: 'Cancelou Agendamento' },
  { key: 'no_show', title: 'Nao Compareceu' },
  { key: 'showed_up', title: 'Compareceu' }
];

const statusLabels: Record<string, string> = {
  new_lead: 'Novo Lead',
  in_service: 'Em Atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Cancelou Agendamento',
  no_show: 'Nao Compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda Confirmada',
  lost: 'Perdido'
};

function onlyDigits(value: any) {
  return String(value || '').replace(/\D/g, '');
}

function firstName(value: any) {
  return String(value || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function formatDateTime(value: any) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toInputDate(value: any) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toInputTime(value: any) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${hour}:${minute}`;
}

export default function StoreSlugPipelinePage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('Validando acesso da loja...');

  const [scheduleLead, setScheduleLead] = useState<any>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const [cancelLead, setCancelLead] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [lostLead, setLostLead] = useState<any>(null);
  const [lostReason, setLostReason] = useState('');

  async function loadData() {
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuario nao tem permissao para acessar esta loja.');
      return;
    }

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_store_id', context.store.id)
      .order('created_at', { ascending: false });

    if (error) {
      setStore(context.store);
      setMessage('Erro ao carregar os leads da loja.');
      return;
    }

    setStore(context.store);
    setLeads(data || []);
    setMessage('');
  }

  async function updateLead(leadId: string, payload: Record<string, any>, loadingMessage = 'Atualizando lead...') {
    if (!store?.id) return;

    setMessage(loadingMessage);

    const { error } = await supabase
      .from('leads')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .eq('assigned_store_id', store.id);

    if (error) {
      setMessage('Erro ao atualizar lead.');
      return;
    }

    await loadData();
    setMessage('');
  }

  async function changeStatus(leadId: string, status: string) {
    await updateLead(leadId, { status });
  }

  function leadWhatsappUrl(lead: any) {
    let phone = onlyDigits(lead?.customer_phone);

    if (!phone) return '';

    if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
      phone = `55${phone}`;
    }

    const customer = firstName(lead?.customer_name);
    const vehicle = String(lead?.interested_vehicle || '').trim();

    const text = vehicle
      ? `Olá, ${customer}! Tudo bem? Recebemos sua simulação pelo site sobre o veículo ${vehicle} e estou entrando em contato para dar continuidade ao seu atendimento.`
      : `Olá, ${customer}! Tudo bem? Recebemos sua simulação pelo site e estou entrando em contato para dar continuidade ao seu atendimento.`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  async function startWhatsAppService(lead: any) {
    const url = leadWhatsappUrl(lead);

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    await updateLead(lead.id, { status: 'in_service' }, 'Iniciando atendimento...');
  }

  function openScheduleModal(lead: any) {
    setScheduleLead(lead);
    setScheduleDate(toInputDate(lead?.scheduled_at));
    setScheduleTime(toInputTime(lead?.scheduled_at));
    setScheduleNotes(lead?.appointment_notes || '');
  }

  function closeScheduleModal() {
    setScheduleLead(null);
    setScheduleDate('');
    setScheduleTime('');
    setScheduleNotes('');
  }

  async function saveSchedule() {
    if (!scheduleLead) return;

    if (!scheduleDate || !scheduleTime) {
      setMessage('Informe data e hora do agendamento.');
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);

    if (Number.isNaN(scheduledAt.getTime())) {
      setMessage('Data ou hora de agendamento invalida.');
      return;
    }

    await updateLead(
      scheduleLead.id,
      {
        status: 'scheduled',
        scheduled_at: scheduledAt.toISOString(),
        appointment_notes: scheduleNotes || null,
        appointment_cancelled_at: null,
        appointment_cancelled_reason: null
      },
      'Salvando agendamento...'
    );

    closeScheduleModal();
  }

  function openCancelModal(lead: any) {
    setCancelLead(lead);
    setCancelReason('');
  }

  function closeCancelModal() {
    setCancelLead(null);
    setCancelReason('');
  }

  async function saveCancelAppointment() {
    if (!cancelLead) return;

    await updateLead(
      cancelLead.id,
      {
        status: 'appointment_cancelled',
        appointment_cancelled_at: new Date().toISOString(),
        appointment_cancelled_reason: cancelReason || 'Cliente cancelou o agendamento.'
      },
      'Registrando cancelamento...'
    );

    closeCancelModal();
  }

  function openLostModal(lead: any) {
    setLostLead(lead);
    setLostReason('');
  }

  function closeLostModal() {
    setLostLead(null);
    setLostReason('');
  }

  async function saveLostLead() {
    if (!lostLead) return;

    await updateLead(
      lostLead.id,
      {
        status: 'lost',
        lost_reason: lostReason || 'Perda registrada pela loja.'
      },
      'Registrando perda...'
    );

    closeLostModal();
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Nao foi possivel carregar o pipeline.'));
  }, [slug]);

  const activeLeads = leads.filter((lead) => !['sale_confirmed', 'lost'].includes(lead.status));

  const grouped = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      leads: activeLeads.filter((lead) => lead.status === column.key)
    }));
  }, [activeLeads]);

  const soldCount = leads.filter((lead) => lead.status === 'sale_confirmed').length;
  const lostCount = leads.filter((lead) => lead.status === 'lost').length;
  const scheduledCount = leads.filter((lead) => lead.status === 'scheduled').length;
  const cancelCount = leads.filter((lead) => lead.status === 'appointment_cancelled').length;

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Area operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operacao</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Pipeline da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Controle o atendimento da loja com data, hora, reagendamento, cancelamento, nao comparecimento, venda e perda.
              </p>
            </div>

            <button className="premium-button-primary" type="button" onClick={loadData}>
              <BarChart3 size={18} /> Atualizar pipeline
            </button>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-5 grid gap-3 md:grid-cols-5">
            <Kpi label="Leads" value={leads.length} />
            <Kpi label="Agendados" value={scheduledCount} />
            <Kpi label="Cancelados" value={cancelCount} />
            <Kpi label="Vendas" value={soldCount} />
            <Kpi label="Perdas" value={lostCount} />
          </section>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="grid min-w-[1440px] grid-cols-6 gap-4">
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
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        columnKey={column.key}
                        onStart={() => startWhatsAppService(lead)}
                        onSchedule={() => openScheduleModal(lead)}
                        onShowedUp={() => changeStatus(lead.id, 'showed_up')}
                        onNoShow={() => changeStatus(lead.id, 'no_show')}
                        onCancel={() => openCancelModal(lead)}
                        onSale={() => changeStatus(lead.id, 'sale_confirmed')}
                        onLost={() => openLostModal(lead)}
                      />
                    ))}

                    {column.leads.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-xs text-zinc-400">
                        Sem leads nesta etapa
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="premium-card mt-5 p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Status label="Novos" value={leads.filter((lead) => lead.status === 'new_lead').length} icon={<Clock3 size={18} />} />
              <Status label="Agendados" value={scheduledCount} icon={<CalendarCheck size={18} />} />
              <Status label="Confirmados" value={soldCount} icon={<CheckCircle2 size={18} />} />
              <Status label="Perdidos" value={lostCount} icon={<XCircle size={18} />} />
            </div>
          </section>
        </div>
      </section>

      {scheduleLead ? (
        <Modal title={scheduleLead.status === 'scheduled' ? 'Reagendar atendimento' : 'Agendar atendimento'} onClose={closeScheduleModal}>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-black text-zinc-950">{scheduleLead.customer_name}</p>
              <p className="mt-1 text-xs text-zinc-500">{scheduleLead.interested_vehicle || 'Interesse nao informado'}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-bold text-zinc-700">
                Data do agendamento
                <input
                  className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500"
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                />
              </label>

              <label className="text-sm font-bold text-zinc-700">
                Hora do agendamento
                <input
                  className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500"
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                />
              </label>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Observacao do agendamento
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500"
                value={scheduleNotes}
                onChange={(event) => setScheduleNotes(event.target.value)}
                placeholder="Ex: cliente vem ver o carro as 15h, quer simular entrada de 20 mil..."
              />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeScheduleModal}>
                Cancelar
              </button>
              <button className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveSchedule}>
                Salvar agendamento
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {cancelLead ? (
        <Modal title="Cliente cancelou o agendamento" onClose={closeCancelModal}>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-black text-zinc-950">{cancelLead.customer_name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Agendado para: {formatDateTime(cancelLead.scheduled_at) || 'data nao informada'}
              </p>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Motivo do cancelamento
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Ex: cliente pediu para remarcar, desistiu, nao conseguiu vir..."
              />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeCancelModal}>
                Voltar
              </button>
              <button className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveCancelAppointment}>
                Registrar cancelamento
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {lostLead ? (
        <Modal title="Registrar perda do lead" onClose={closeLostModal}>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-black text-zinc-950">{lostLead.customer_name}</p>
              <p className="mt-1 text-xs text-zinc-500">{lostLead.interested_vehicle || 'Interesse nao informado'}</p>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Motivo da perda
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500"
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Ex: sem entrada, comprou em outra loja, nao respondeu, score baixo..."
              />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeLostModal}>
                Voltar
              </button>
              <button className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveLostLead}>
                Registrar perda
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function LeadCard({
  lead,
  columnKey,
  onStart,
  onSchedule,
  onShowedUp,
  onNoShow,
  onCancel,
  onSale,
  onLost
}: {
  lead: any;
  columnKey: string;
  onStart: () => void;
  onSchedule: () => void;
  onShowedUp: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  onSale: () => void;
  onLost: () => void;
}) {
  const scheduledAt = formatDateTime(lead.scheduled_at);
  const cancelledAt = formatDateTime(lead.appointment_cancelled_at);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">{lead.customer_name || 'Cliente sem nome'}</h3>
          <p className="mt-1 text-xs text-zinc-500">{lead.interested_vehicle || 'Interesse nao informado'}</p>
          <p className="mt-1 text-[11px] text-zinc-400">{lead.customer_phone || 'Sem telefone'}</p>
        </div>

        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-zinc-400">
          {statusLabels[lead.status] || lead.status}
        </span>
      </div>

      {scheduledAt ? (
        <div className="mt-3 rounded-xl bg-white p-3 text-xs text-zinc-600">
          <p className="flex items-center gap-2 font-black text-zinc-900">
            <CalendarClock size={14} /> {scheduledAt}
          </p>
          {lead.appointment_notes ? <p className="mt-2 leading-relaxed">{lead.appointment_notes}</p> : null}
        </div>
      ) : null}

      {columnKey === 'appointment_cancelled' ? (
        <div className="mt-3 rounded-xl bg-orange-50 p-3 text-xs text-orange-800">
          <p className="font-black">Cancelado {cancelledAt ? `em ${cancelledAt}` : ''}</p>
          <p className="mt-1 leading-relaxed">{lead.appointment_cancelled_reason || 'Cliente cancelou o agendamento.'}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {columnKey === 'new_lead' ? (
          <>
            <button className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onStart}>
              {lead.customer_phone ? 'Iniciar no WhatsApp' : 'Marcar em atendimento'}
            </button>
            <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-zinc-600" type="button" onClick={onLost}>
              Registrar perda
            </button>
          </>
        ) : null}

        {columnKey === 'in_service' ? (
          <>
            <button className="w-full rounded-xl bg-red-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onSchedule}>
              Agendar com data e hora
            </button>
            <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-zinc-600" type="button" onClick={onLost}>
              Registrar perda
            </button>
          </>
        ) : null}

        {columnKey === 'scheduled' ? (
          <>
            <button className="w-full rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onShowedUp}>
              Confirmar chegada
            </button>
            <button className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onSchedule}>
              Reagendar
            </button>
            <button className="w-full rounded-xl bg-orange-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onCancel}>
              Cliente cancelou
            </button>
            <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-zinc-600" type="button" onClick={onNoShow}>
              Nao compareceu
            </button>
          </>
        ) : null}

        {columnKey === 'appointment_cancelled' || columnKey === 'no_show' ? (
          <>
            <button className="w-full rounded-xl bg-red-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onSchedule}>
              Reagendar
            </button>
            <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-zinc-600" type="button" onClick={onLost}>
              Registrar perda
            </button>
          </>
        ) : null}

        {columnKey === 'showed_up' ? (
          <>
            <button className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase text-white" type="button" onClick={onSale}>
              Confirmar venda
            </button>
            <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-zinc-600" type="button" onClick={onLost}>
              Registrar perda
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-5">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className="mt-2 block text-3xl font-black">{value}</strong>
    </div>
  );
}

function Status({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-zinc-50 p-4">
      <div className="flex items-center gap-3 text-zinc-500">
        {icon}
        <span className="font-bold">{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-zinc-950">{title}</h2>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
