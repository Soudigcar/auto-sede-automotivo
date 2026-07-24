'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Edit3,
  LogOut,
  MessageCircle,
  Package,
  Phone,
  Save,
  Store,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const columns = [
  {
    key: 'new_lead',
    title: 'Novo Lead Recebido',
    shortTitle: 'Novo Lead',
    barClass: 'bg-blue-500',
    headerClass: 'border-blue-100 bg-blue-50 text-blue-700',
    badgeClass: 'bg-blue-100 text-blue-700'
  },
  {
    key: 'in_service',
    title: 'Em Atendimento',
    shortTitle: 'Atendimento',
    barClass: 'bg-violet-500',
    headerClass: 'border-violet-100 bg-violet-50 text-violet-700',
    badgeClass: 'bg-violet-100 text-violet-700'
  },
  {
    key: 'scheduled',
    title: 'Agendado',
    shortTitle: 'Agendado',
    barClass: 'bg-amber-500',
    headerClass: 'border-amber-100 bg-amber-50 text-amber-700',
    badgeClass: 'bg-amber-100 text-amber-700'
  },
  {
    key: 'appointment_cancelled',
    title: 'Cancelou Agendamento',
    shortTitle: 'Cancelou',
    barClass: 'bg-orange-500',
    headerClass: 'border-orange-100 bg-orange-50 text-orange-700',
    badgeClass: 'bg-orange-100 text-orange-700'
  },
  {
    key: 'no_show',
    title: 'Nao Compareceu',
    shortTitle: 'Nao veio',
    barClass: 'bg-zinc-500',
    headerClass: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    badgeClass: 'bg-zinc-200 text-zinc-700'
  },
  {
    key: 'showed_up',
    title: 'Compareceu',
    shortTitle: 'Compareceu',
    barClass: 'bg-emerald-500',
    headerClass: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-700'
  }
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

const editableStatusOptions = [
  { value: 'new_lead', label: 'Novo lead' },
  { value: 'in_service', label: 'Em atendimento' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'appointment_cancelled', label: 'Cancelou agendamento' },
  { value: 'no_show', label: 'Nao compareceu' },
  { value: 'showed_up', label: 'Compareceu' },
  { value: 'sale_confirmed', label: 'Venda confirmada' },
  { value: 'lost', label: 'Perdido' }
];

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

function formatRelativeTime(value: any) {
  if (!value) return 'Sem data';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Sem data';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `Ha ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Ha ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 8) return `Ha ${diffDays}d`;

  return formatDateTime(value);
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

function buildSlotWindow(date: string, time: string) {
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function columnConfig(columnKey: string) {
  return columns.find((column) => column.key === columnKey) || columns[0];
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

  const [cancelLead, setCancelLead] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [lostLead, setLostLead] = useState<any>(null);
  const [lostReason, setLostReason] = useState('');

  const [saleLead, setSaleLead] = useState<any>(null);

  const [editingLead, setEditingLead] = useState<any>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editOrigin, setEditOrigin] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('new_lead');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editAppointmentNotes, setEditAppointmentNotes] = useState('');

  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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

  async function hasScheduleConflict(start: Date, end: Date, ignoredLeadId?: string) {
    if (!store?.id) return true;

    let leadQuery = supabase
      .from('leads')
      .select('id, customer_name, scheduled_at')
      .eq('assigned_store_id', store.id)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString())
      .limit(1);

    if (ignoredLeadId) {
      leadQuery = leadQuery.neq('id', ignoredLeadId);
    }

    const [leadConflict, taskConflict] = await Promise.all([
      leadQuery,
      supabase
        .from('store_calendar_tasks')
        .select('id, title, starts_at')
        .eq('store_id', store.id)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', end.toISOString())
        .limit(1)
    ]);

    if (leadConflict.error || taskConflict.error) return true;

    return Boolean((leadConflict.data || []).length || (taskConflict.data || []).length);
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

    const { start, end } = buildSlotWindow(scheduleDate, scheduleTime);

    if (Number.isNaN(start.getTime())) {
      setMessage('Data ou hora de agendamento invalida.');
      return;
    }

    if (start.getTime() < Date.now()) {
      setMessage('Nao e permitido agendar em horario passado. Use o horario de Brasilia como referencia.');
      return;
    }

    const occupied = await hasScheduleConflict(start, end, scheduleLead.id);

    if (occupied) {
      setMessage('Horario ocupado no calendario. Escolha outro horario.');
      return;
    }

    await updateLead(
      scheduleLead.id,
      {
        status: 'scheduled',
        scheduled_at: start.toISOString(),
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

  function openSaleModal(lead: any) {
    setSaleLead(lead);
  }

  function closeSaleModal() {
    setSaleLead(null);
  }

  async function saveSaleConfirmation() {
    if (!saleLead) return;

    await updateLead(saleLead.id, { status: 'sale_confirmed' }, 'Confirmando venda...');
    closeSaleModal();
  }

  function openLeadEditor(lead: any) {
    setEditingLead(lead);
    setEditCustomerName(lead.customer_name || '');
    setEditCustomerPhone(lead.customer_phone || '');
    setEditVehicle(lead.interested_vehicle || '');
    setEditOrigin(lead.origin || '');
    setEditNotes(lead.notes || '');
    setEditStatus(lead.status || 'new_lead');
    setEditDate(toInputDate(lead.scheduled_at));
    setEditTime(toInputTime(lead.scheduled_at));
    setEditAppointmentNotes(lead.appointment_notes || '');
  }

  function closeLeadEditor() {
    setEditingLead(null);
    setEditCustomerName('');
    setEditCustomerPhone('');
    setEditVehicle('');
    setEditOrigin('');
    setEditNotes('');
    setEditStatus('new_lead');
    setEditDate('');
    setEditTime('');
    setEditAppointmentNotes('');
  }

  async function saveLeadEditor() {
    if (!editingLead) return;

    const payload: Record<string, any> = {
      customer_name: editCustomerName.trim() || null,
      customer_phone: editCustomerPhone.trim() || null,
      interested_vehicle: editVehicle.trim() || null,
      origin: editOrigin.trim() || null,
      notes: editNotes.trim() || null,
      status: editStatus
    };

    if (editStatus === 'scheduled' || editDate || editTime) {
      if (!editDate || !editTime) {
        setMessage('Para agendar, informe data e hora.');
        return;
      }

      const { start, end } = buildSlotWindow(editDate, editTime);

      if (Number.isNaN(start.getTime())) {
        setMessage('Data ou hora invalida.');
        return;
      }

      if (start.getTime() < Date.now()) {
        setMessage('Nao e permitido agendar em horario passado.');
        return;
      }

      const occupied = await hasScheduleConflict(start, end, editingLead.id);

      if (occupied) {
        setMessage('Horario ocupado no calendario. Escolha outro horario.');
        return;
      }

      payload.scheduled_at = start.toISOString();
      payload.appointment_notes = editAppointmentNotes.trim() || null;
    } else {
      payload.scheduled_at = null;
      payload.appointment_notes = null;
    }

    await updateLead(editingLead.id, payload, 'Salvando informacoes do lead...');
    closeLeadEditor();
  }

  async function deleteEditingLead() {
    if (!editingLead || !store?.id) return;

    const confirmed = window.confirm('Tem certeza que deseja excluir este lead? Esta acao nao pode ser desfeita.');

    if (!confirmed) return;

    setMessage('Excluindo lead...');

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', editingLead.id)
      .eq('assigned_store_id', store.id);

    if (error) {
      setMessage('Erro ao excluir lead.');
      return;
    }

    closeLeadEditor();
    await loadData();
    setMessage('Lead excluido com sucesso.');
  }

  function startCardDrag(event: DragEvent<HTMLDivElement>, leadId: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  }

  function stopCardDrag() {
    setDraggedLeadId(null);
    setDragOverColumn(null);
  }

  function allowColumnDrop(event: DragEvent<HTMLDivElement>, columnKey: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnKey);
  }

  async function dropCardOnColumn(event: DragEvent<HTMLDivElement>, targetStatus: string) {
    event.preventDefault();

    const leadId = event.dataTransfer.getData('text/plain') || draggedLeadId;
    const lead = leads.find((item) => item.id === leadId);

    setDraggedLeadId(null);
    setDragOverColumn(null);

    if (!lead || lead.status === targetStatus) return;

    if (targetStatus === 'scheduled') {
      openScheduleModal(lead);
      setMessage('Informe data e hora para concluir o agendamento.');
      return;
    }

    if (targetStatus === 'appointment_cancelled') {
      openCancelModal(lead);
      return;
    }

    if (targetStatus === 'new_lead' || targetStatus === 'in_service') {
      await updateLead(
        lead.id,
        {
          status: targetStatus,
          scheduled_at: null,
          appointment_notes: null,
          appointment_cancelled_at: null,
          appointment_cancelled_reason: null
        },
        'Movendo lead...'
      );
      return;
    }

    await updateLead(lead.id, { status: targetStatus }, 'Movendo lead...');
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
      <style>{`
        .lead-editor-dark-fields input,
        .lead-editor-dark-fields textarea,
        .lead-editor-dark-fields select {
          background: rgba(39, 39, 42, 0.96) !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          border-color: #3f3f46 !important;
          caret-color: #ffffff !important;
          color-scheme: dark;
        }

        .lead-editor-dark-fields input::placeholder,
        .lead-editor-dark-fields textarea::placeholder {
          color: #d4d4d8 !important;
          -webkit-text-fill-color: #d4d4d8 !important;
        }

        .lead-editor-dark-fields option {
          color: #111827 !important;
          background: #ffffff !important;
        }

        .lead-editor-dark-fields input[type="date"]::-webkit-calendar-picker-indicator,
        .lead-editor-dark-fields input[type="time"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
        }
      `}</style>
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
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/whatsapp`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><MessageCircle size={18} /> WhatsApp CRM</Link>
            <Link href={`/loja/${slug}/calendario`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Calendario</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
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
                Cards compactos para atendimento diario. Clique para editar, arraste para mudar etapa e use os atalhos rapidos para acao comercial.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href={`/loja/${slug}/calendario`} className="premium-button-secondary"><CalendarDays size={18} /> Calendario</Link>
              <button className="premium-button-primary" type="button" onClick={loadData}>
                <BarChart3 size={18} /> Atualizar pipeline
              </button>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-5 grid gap-3 md:grid-cols-5">
            <Kpi label="Leads" value={leads.length} />
            <Kpi label="Agendados" value={scheduledCount} />
            <Kpi label="Cancelados" value={cancelCount} />
            <Kpi label="Vendas" value={soldCount} />
            <Kpi label="Perdas" value={lostCount} />
          </section>

          <div className="mt-5 overflow-x-auto pb-3">
            <div className="grid min-w-[1260px] grid-cols-6 gap-3">
              {grouped.map((column) => {
                const isDropTarget = dragOverColumn === column.key;

                return (
                  <div
                    key={column.key}
                    onDragOver={(event) => allowColumnDrop(event, column.key)}
                    onDragLeave={() => setDragOverColumn(null)}
                    onDrop={(event) => dropCardOnColumn(event, column.key)}
                    className={[
                      'overflow-hidden rounded-[24px] border shadow-sm transition',
                      isDropTarget ? 'border-red-300 bg-red-50/80 ring-2 ring-red-100' : 'border-zinc-200 bg-white'
                    ].join(' ')}
                  >
                    <div className={`h-1.5 ${column.barClass}`} />
                    <div className={`m-3 rounded-2xl border px-3 py-3 ${column.headerClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-black">{column.title}</h2>
                          <p className="mt-0.5 text-[11px] font-bold opacity-70">{column.leads.length} cards</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${column.badgeClass}`}>{column.leads.length}</span>
                      </div>
                    </div>

                    <div className="space-y-2 px-3 pb-3">
                      {column.leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          columnKey={column.key}
                          isDragging={draggedLeadId === lead.id}
                          onDragStart={(event) => startCardDrag(event, lead.id)}
                          onDragEnd={stopCardDrag}
                          onOpen={() => openLeadEditor(lead)}
                          onStart={() => startWhatsAppService(lead)}
                          onSchedule={() => openScheduleModal(lead)}
                          onShowedUp={() => changeStatus(lead.id, 'showed_up')}
                          onNoShow={() => changeStatus(lead.id, 'no_show')}
                          onCancel={() => openCancelModal(lead)}
                          onSale={() => openSaleModal(lead)}
                          onLost={() => openLostModal(lead)}
                        />
                      ))}

                      {column.leads.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs font-bold text-zinc-400">
                          Solte o card aqui
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
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

      {editingLead ? (
        <Modal title="Adicionar, alterar ou excluir informacoes do lead" onClose={closeLeadEditor} maxWidth="max-w-4xl">
          <div className="lead-editor-dark-fields grid gap-5">
            <div className="relative overflow-hidden rounded-[28px] border border-cyan-200/40 bg-[#071020] p-5 text-white shadow-2xl">
              <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 35% 25%, rgba(34,211,238,0.45), transparent 28%), radial-gradient(circle at 75% 70%, rgba(239,68,68,0.35), transparent 30%)' }} />
              <div className="relative grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200">Detalhes do Lead</p>
                  <h3 className="mt-2 text-3xl font-black">{editCustomerName || 'Cliente sem nome'}</h3>
                  <p className="mt-2 text-sm text-zinc-300">Origem/anuncio: {editOrigin || editingLead.origin || 'Nao informado'}</p>
                  <div className="mt-5 grid gap-2 text-sm text-zinc-200">
                    <p><strong className="text-cyan-200">Carro:</strong> {editVehicle || 'Nao informado'}</p>
                    <p><strong className="text-cyan-200">Telefone:</strong> {editCustomerPhone || 'Nao informado'}</p>
                    <p><strong className="text-cyan-200">Agendamento:</strong> {editDate && editTime ? `${editDate} as ${editTime}` : 'Sem agendamento'}</p>
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/10 p-5 text-center backdrop-blur">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-300/10 text-3xl font-black text-cyan-100">
                    {(store?.store_name || 'L').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wider text-zinc-300">Responsavel</p>
                  <p className="font-black">{store?.store_name || 'Loja'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do cliente" value={editCustomerName} onChange={setEditCustomerName} placeholder="Nome completo" />
              <Field label="Telefone / WhatsApp" value={editCustomerPhone} onChange={setEditCustomerPhone} placeholder="(61) 99999-9999" />
              <Field label="Carro de interesse" value={editVehicle} onChange={setEditVehicle} placeholder="Ex: Honda HR-V EXL CVT 2017" />
              <Field label="Origem / anuncio" value={editOrigin} onChange={setEditOrigin} placeholder="Ex: Facebook Lead Ads, campanha X" />

              <label className="text-sm font-bold text-zinc-700">
                Status do lead
                <select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                  {editableStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-bold text-zinc-700">
                  Data
                  <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                </label>
                <label className="text-sm font-bold text-zinc-700">
                  Hora
                  <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                </label>
              </div>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Observacao do lead
              <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Informacoes gerais do lead, financiamento, entrada, preferencia, historico..." />
            </label>

            <label className="text-sm font-bold text-zinc-700">
              Observacao do agendamento
              <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={editAppointmentNotes} onChange={(event) => setEditAppointmentNotes(event.target.value)} placeholder="Ex: vem visitar a loja, quer simular entrada, trazer usado na troca..." />
            </label>

            <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
              <button className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black uppercase tracking-wide text-red-700" type="button" onClick={deleteEditingLead}>
                <Trash2 size={18} /> Excluir lead
              </button>

              <div className="flex gap-3">
                <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeLeadEditor}>Cancelar</button>
                <button className="flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveLeadEditor}>
                  <Save size={18} /> Salvar alteracoes
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {saleLead ? (
        <Modal title="Confirmar venda" onClose={closeSaleModal}>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">Venda pronta para confirmar</p>
              <h3 className="mt-2 text-2xl font-black text-zinc-950">{saleLead.customer_name || 'Cliente sem nome'}</h3>
              <div className="mt-4 grid gap-2 text-sm font-bold text-zinc-700">
                <p>Carro de interesse: {saleLead.interested_vehicle || 'Nao informado'}</p>
                <p>Telefone: {saleLead.customer_phone || 'Sem telefone'}</p>
                <p>Origem: {saleLead.origin || 'Nao informado'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Nesta primeira rodada, a venda sera confirmada apenas como etapa do Pipeline. Na proxima rodada com banco de dados, entram carro vendido, banco, forma de pagamento, valor, entrada e parcelas.
            </div>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeSaleModal}>Voltar</button>
              <button className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveSaleConfirmation}>Confirmar venda</button>
            </div>
          </div>
        </Modal>
      ) : null}

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
                <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
              </label>

              <label className="text-sm font-bold text-zinc-700">
                Hora do agendamento
                <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
              </label>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Observacao do agendamento
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} placeholder="Ex: cliente vem ver o carro as 15h, quer simular entrada de 20 mil..." />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeScheduleModal}>Cancelar</button>
              <button className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveSchedule}>Salvar agendamento</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {cancelLead ? (
        <Modal title="Cliente cancelou o agendamento" onClose={closeCancelModal}>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-black text-zinc-950">{cancelLead.customer_name}</p>
              <p className="mt-1 text-xs text-zinc-500">Agendado para: {formatDateTime(cancelLead.scheduled_at) || 'data nao informada'}</p>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Motivo do cancelamento
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ex: cliente pediu para remarcar, desistiu, nao conseguiu vir..." />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeCancelModal}>Voltar</button>
              <button className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveCancelAppointment}>Registrar cancelamento</button>
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
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Ex: sem entrada, comprou em outra loja, nao respondeu, score baixo..." />
            </label>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeLostModal}>Voltar</button>
              <button className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveLostLead}>Registrar perda</button>
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
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
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
  isDragging: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
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
  const column = columnConfig(columnKey);
  const origin = String(lead.origin || 'Origem nao informada');

  function action(event: MouseEvent<HTMLButtonElement>, callback: () => void) {
    event.stopPropagation();
    callback();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        'group rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-3 shadow-sm transition active:cursor-grabbing',
        'cursor-pointer hover:-translate-y-0.5 hover:border-zinc-200 hover:bg-white hover:shadow-md',
        isDragging ? 'opacity-50 ring-2 ring-red-300' : ''
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-black leading-tight text-zinc-950">{lead.customer_name || 'Cliente sem nome'}</h3>
          <p className="mt-1 truncate text-xs font-bold text-zinc-600">{lead.interested_vehicle || 'Interesse nao informado'}</p>
        </div>

        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${column.badgeClass}`}>{column.shortTitle}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wide">
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-zinc-500"><Phone size={11} /> {lead.customer_phone || 'Sem telefone'}</span>
        <span className="rounded-full bg-white px-2 py-1 text-zinc-500">{origin}</span>
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-white">{formatRelativeTime(lead.created_at)}</span>
      </div>

      {scheduledAt ? (
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="flex items-center gap-2 font-black"><CalendarClock size={14} /> {scheduledAt}</p>
          {lead.appointment_notes ? <p className="mt-1 leading-relaxed">{lead.appointment_notes}</p> : null}
        </div>
      ) : null}

      {columnKey === 'appointment_cancelled' ? (
        <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          <p className="font-black">Cancelado {cancelledAt ? `em ${cancelledAt}` : ''}</p>
          <p className="mt-1 leading-relaxed">{lead.appointment_cancelled_reason || 'Cliente cancelou o agendamento.'}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <CompactAction label="Editar" onClick={(event) => action(event, onOpen)} icon={<Edit3 size={12} />} />

        {columnKey === 'new_lead' ? (
          <>
            <CompactAction label={lead.customer_phone ? 'WhatsApp' : 'Atender'} onClick={(event) => action(event, onStart)} icon={<MessageCircle size={12} />} tone="green" />
            <CompactAction label="Perda" onClick={(event) => action(event, onLost)} tone="danger" />
          </>
        ) : null}

        {columnKey === 'in_service' ? (
          <>
            <CompactAction label="Agendar" onClick={(event) => action(event, onSchedule)} tone="red" />
            <CompactAction label="Perda" onClick={(event) => action(event, onLost)} tone="danger" />
          </>
        ) : null}

        {columnKey === 'scheduled' ? (
          <>
            <CompactAction label="Chegou" onClick={(event) => action(event, onShowedUp)} tone="blue" />
            <CompactAction label="Reagendar" onClick={(event) => action(event, onSchedule)} />
            <CompactAction label="Cancelou" onClick={(event) => action(event, onCancel)} tone="orange" />
            <CompactAction label="Nao veio" onClick={(event) => action(event, onNoShow)} tone="dark" />
          </>
        ) : null}

        {columnKey === 'appointment_cancelled' || columnKey === 'no_show' ? (
          <>
            <CompactAction label="Reagendar" onClick={(event) => action(event, onSchedule)} tone="red" />
            <CompactAction label="Perda" onClick={(event) => action(event, onLost)} tone="danger" />
          </>
        ) : null}

        {columnKey === 'showed_up' ? (
          <>
            <CompactAction label="Venda" onClick={(event) => action(event, onSale)} tone="green" />
            <CompactAction label="Perda" onClick={(event) => action(event, onLost)} tone="danger" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function CompactAction({ label, onClick, icon, tone = 'default' }: { label: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void; icon?: ReactNode; tone?: 'default' | 'green' | 'red' | 'blue' | 'orange' | 'dark' | 'danger' }) {
  const tones = {
    default: 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50',
    green: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    red: 'border-red-600 bg-red-600 text-white hover:bg-red-700',
    blue: 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700',
    orange: 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600',
    dark: 'border-zinc-900 bg-zinc-900 text-white hover:bg-black',
    danger: 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
  } as const;

  return (
    <button className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase transition ${tones[tone]}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="text-sm font-bold text-zinc-700">
      {label}
      <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-4">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className="mt-1 block text-2xl font-black">{value}</strong>
    </div>
  );
}

function Status({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
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

function Modal({ title, children, onClose, maxWidth = 'max-w-2xl' }: { title: string; children: ReactNode; onClose: () => void; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl ${maxWidth}`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-zinc-950">{title}</h2>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
