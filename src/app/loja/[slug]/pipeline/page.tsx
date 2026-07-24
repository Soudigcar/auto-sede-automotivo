'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Edit3,
  LogOut,
  MessageCircle,
  Package,
  RotateCcw,
  Save,
  Store,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const columns = [
  { key: 'new_lead', title: 'Novo Lead Recebido', shortTitle: 'Novo Lead', tone: 'blue' },
  { key: 'in_service', title: 'Em Atendimento', shortTitle: 'Atendimento', tone: 'violet' },
  { key: 'scheduled', title: 'Agendado', shortTitle: 'Agendado', tone: 'amber' },
  { key: 'appointment_cancelled', title: 'Cancelou Agendamento', shortTitle: 'Cancelou', tone: 'orange' },
  { key: 'no_show', title: 'Não Compareceu', shortTitle: 'Não Compareceu', tone: 'zinc' },
  { key: 'showed_up', title: 'Compareceu', shortTitle: 'Compareceu', tone: 'emerald' },
  { key: 'sale_confirmed', title: 'Venda Confirmada', shortTitle: 'Vendas', tone: 'green' },
  { key: 'lost', title: 'Perdido', shortTitle: 'Perdas', tone: 'red' }
];

const statusLabels: Record<string, string> = {
  new_lead: 'Novo Lead',
  in_service: 'Em Atendimento',
  scheduled: 'Agendado',
  appointment_cancelled: 'Cancelou Agendamento',
  no_show: 'Não Compareceu',
  showed_up: 'Compareceu',
  sale_confirmed: 'Venda Confirmada',
  lost: 'Perdido'
};

const editableStatusOptions = [
  { value: 'new_lead', label: 'Novo lead' },
  { value: 'in_service', label: 'Em atendimento' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'appointment_cancelled', label: 'Cancelou agendamento' },
  { value: 'no_show', label: 'Não compareceu' },
  { value: 'showed_up', label: 'Compareceu' },
  { value: 'sale_confirmed', label: 'Venda confirmada' },
  { value: 'lost', label: 'Perdido' }
];

const toneStyles: Record<string, { column: string; header: string; title: string; badge: string; dot: string }> = {
  blue: {
    column: 'border-blue-100 bg-blue-50/25',
    header: 'border-blue-100 bg-blue-50 text-blue-700',
    title: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500'
  },
  violet: {
    column: 'border-violet-100 bg-violet-50/25',
    header: 'border-violet-100 bg-violet-50 text-violet-700',
    title: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-700',
    dot: 'bg-violet-500'
  },
  amber: {
    column: 'border-amber-100 bg-amber-50/30',
    header: 'border-amber-100 bg-amber-50 text-amber-700',
    title: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500'
  },
  orange: {
    column: 'border-orange-100 bg-orange-50/30',
    header: 'border-orange-100 bg-orange-50 text-orange-700',
    title: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
    dot: 'bg-orange-500'
  },
  zinc: {
    column: 'border-zinc-200 bg-zinc-50/50',
    header: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    title: 'text-zinc-700',
    badge: 'bg-zinc-200 text-zinc-700',
    dot: 'bg-zinc-500'
  },
  emerald: {
    column: 'border-emerald-100 bg-emerald-50/25',
    header: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    title: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500'
  },
  green: {
    column: 'border-green-100 bg-green-50/30',
    header: 'border-green-100 bg-green-50 text-green-700',
    title: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-600'
  },
  red: {
    column: 'border-red-100 bg-red-50/25',
    header: 'border-red-100 bg-red-50 text-red-700',
    title: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500'
  }
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

function formatLeadAge(value: any) {
  if (!value) return 'sem data';

  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return 'sem data';

  const diff = Date.now() - createdAt;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'agora';
  if (diff < hour) return `há ${Math.max(1, Math.floor(diff / minute))} min`;
  if (diff < day) return `há ${Math.floor(diff / hour)}h`;
  return `há ${Math.floor(diff / day)}d`;
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

function readableOrigin(value: any) {
  const origin = String(value || '').trim();
  if (!origin) return 'Manual';
  return origin.replace(/_/g, ' ');
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      setMessage('Acesso bloqueado. Este usuário não tem permissão para acessar esta loja.');
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
      setMessage('Data ou hora de agendamento inválida.');
      return;
    }

    if (start.getTime() < Date.now()) {
      setMessage('Não é permitido agendar em horário passado. Use o horário de Brasília como referência.');
      return;
    }

    const occupied = await hasScheduleConflict(start, end, scheduleLead.id);

    if (occupied) {
      setMessage('Horário ocupado no calendário. Escolha outro horário.');
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
    setLostReason(lead?.lost_reason || '');
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

  async function confirmSale() {
    if (!saleLead) return;

    await updateLead(saleLead.id, { status: 'sale_confirmed' }, 'Confirmando venda...');
    closeSaleModal();
  }

  async function reopenLead(lead: any, targetStatus = 'in_service') {
    await updateLead(
      lead.id,
      {
        status: targetStatus,
        lost_reason: null
      },
      'Reabrindo lead...'
    );
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
        setMessage('Data ou hora inválida.');
        return;
      }

      if (start.getTime() < Date.now()) {
        setMessage('Não é permitido agendar em horário passado.');
        return;
      }

      const occupied = await hasScheduleConflict(start, end, editingLead.id);

      if (occupied) {
        setMessage('Horário ocupado no calendário. Escolha outro horário.');
        return;
      }

      payload.scheduled_at = start.toISOString();
      payload.appointment_notes = editAppointmentNotes.trim() || null;
    } else {
      payload.scheduled_at = null;
      payload.appointment_notes = null;
    }

    await updateLead(editingLead.id, payload, 'Salvando informações do lead...');
    closeLeadEditor();
  }

  async function deleteEditingLead() {
    if (!editingLead || !store?.id) return;

    const confirmed = window.confirm('Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.');

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
    setMessage('Lead excluído com sucesso.');
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

    if (targetStatus === 'sale_confirmed') {
      openSaleModal(lead);
      return;
    }

    if (targetStatus === 'lost') {
      openLostModal(lead);
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
          appointment_cancelled_reason: null,
          lost_reason: null
        },
        'Movendo lead...'
      );
      return;
    }

    await updateLead(lead.id, { status: targetStatus }, 'Movendo lead...');
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Não foi possível carregar o pipeline.'));
  }, [slug]);

  const grouped = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      leads: leads.filter((lead) => lead.status === column.key)
    }));
  }, [leads]);

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
        <aside
          className={[
            'hidden shrink-0 bg-[#071020] py-7 text-white transition-all duration-300 lg:block',
            sidebarCollapsed ? 'w-0 overflow-hidden px-0 opacity-0' : 'w-72 px-6 opacity-100'
          ].join(' ')}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Área operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/whatsapp`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><MessageCircle size={18} /> WhatsApp CRM</Link>
            <Link href={`/loja/${slug}/calendario`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Calendário</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <button
          className="fixed left-2 top-1/2 z-40 hidden h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-2xl bg-red-600 text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700 lg:flex"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}
        >
          {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Pipeline da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Cards compactos para atendimento diário. Recolha o menu lateral para ampliar a área da pipeline.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href={`/loja/${slug}/calendario`} className="premium-button-secondary"><CalendarDays size={18} /> Calendário</Link>
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
            <div className="grid min-w-[1760px] grid-cols-8 gap-3">
              {grouped.map((column) => {
                const isDropTarget = dragOverColumn === column.key;
                const styles = toneStyles[column.tone] || toneStyles.zinc;

                return (
                  <div
                    key={column.key}
                    onDragOver={(event) => allowColumnDrop(event, column.key)}
                    onDragLeave={() => setDragOverColumn(null)}
                    onDrop={(event) => dropCardOnColumn(event, column.key)}
                    className={[
                      'min-h-[520px] rounded-[24px] border p-3 shadow-sm transition',
                      styles.column,
                      isDropTarget ? 'ring-2 ring-red-200' : ''
                    ].join(' ')}
                  >
                    <div className={`mb-3 rounded-2xl border px-3 py-3 ${styles.header}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                            <h2 className="text-sm font-black leading-tight">{column.title}</h2>
                          </div>
                          <p className="mt-1 text-xs font-black opacity-70">{column.leads.length} cards</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${styles.badge}`}>{column.leads.length}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {column.leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          columnKey={column.key}
                          tone={column.tone}
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
                          onReopen={() => reopenLead(lead, column.key === 'sale_confirmed' ? 'showed_up' : 'in_service')}
                        />
                      ))}

                      {column.leads.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-5 text-center text-xs font-bold text-zinc-400">
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
        <Modal title="Adicionar, alterar ou excluir informações do lead" onClose={closeLeadEditor} maxWidth="max-w-4xl">
          <div className="lead-editor-dark-fields grid gap-5">
            <div className="relative overflow-hidden rounded-[28px] border border-cyan-200/40 bg-[#071020] p-5 text-white shadow-2xl">
              <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 35% 25%, rgba(34,211,238,0.45), transparent 28%), radial-gradient(circle at 75% 70%, rgba(239,68,68,0.35), transparent 30%)' }} />
              <div className="relative grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200">Detalhes do Lead</p>
                  <h3 className="mt-2 text-3xl font-black">{editCustomerName || 'Cliente sem nome'}</h3>
                  <p className="mt-2 text-sm text-zinc-300">Origem/anúncio: {editOrigin || editingLead.origin || 'Não informado'}</p>
                  <div className="mt-5 grid gap-2 text-sm text-zinc-200">
                    <p><strong className="text-cyan-200">Carro:</strong> {editVehicle || 'Não informado'}</p>
                    <p><strong className="text-cyan-200">Telefone:</strong> {editCustomerPhone || 'Não informado'}</p>
                    <p><strong className="text-cyan-200">Status:</strong> {statusLabels[editStatus] || editStatus}</p>
                    <p><strong className="text-cyan-200">Agendamento:</strong> {editDate && editTime ? `${editDate} às ${editTime}` : 'Sem agendamento'}</p>
                    {editingLead.status === 'sale_confirmed' ? <p><strong className="text-green-300">Venda:</strong> Confirmada</p> : null}
                    {editingLead.status === 'lost' ? <p><strong className="text-red-300">Perda:</strong> {editingLead.lost_reason || 'Perda registrada'}</p> : null}
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/10 p-5 text-center backdrop-blur">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-300/10 text-3xl font-black text-cyan-100">
                    {(store?.store_name || 'L').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wider text-zinc-300">Responsável</p>
                  <p className="font-black">{store?.store_name || 'Loja'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do cliente" value={editCustomerName} onChange={setEditCustomerName} placeholder="Nome completo" />
              <Field label="Telefone / WhatsApp" value={editCustomerPhone} onChange={setEditCustomerPhone} placeholder="(61) 99999-9999" />
              <Field label="Carro de interesse" value={editVehicle} onChange={setEditVehicle} placeholder="Ex: Honda HR-V EXL CVT 2017" />
              <Field label="Origem / anúncio" value={editOrigin} onChange={setEditOrigin} placeholder="Ex: Facebook Lead Ads, campanha X" />

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
              Observação do lead
              <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Informações gerais do lead, financiamento, entrada, preferência, histórico..." />
            </label>

            <label className="text-sm font-bold text-zinc-700">
              Observação do agendamento
              <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={editAppointmentNotes} onChange={(event) => setEditAppointmentNotes(event.target.value)} placeholder="Ex: vem visitar a loja, quer simular entrada, trazer usado na troca..." />
            </label>

            <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
              <button className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black uppercase tracking-wide text-red-700" type="button" onClick={deleteEditingLead}>
                <Trash2 size={18} /> Excluir lead
              </button>

              <div className="flex gap-3">
                <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeLeadEditor}>Cancelar</button>
                <button className="flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={saveLeadEditor}>
                  <Save size={18} /> Salvar alterações
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {saleLead ? (
        <Modal title="Confirmar venda" onClose={closeSaleModal}>
          <div className="grid gap-4">
            <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">
              <p className="font-black">{saleLead.customer_name || 'Cliente sem nome'}</p>
              <p className="mt-1 font-bold">{saleLead.interested_vehicle || 'Carro não informado'}</p>
            </div>

            <p className="text-sm font-bold leading-relaxed text-zinc-600">
              Confirme apenas se a venda realmente foi fechada. Na próxima etapa vamos adicionar carro vendido, banco, forma de pagamento, valor, entrada e vendedor responsável.
            </p>

            <div className="flex justify-end gap-3">
              <button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={closeSaleModal}>Voltar</button>
              <button className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={confirmSale}>Confirmar venda</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {scheduleLead ? (
        <Modal title={scheduleLead.status === 'scheduled' ? 'Reagendar atendimento' : 'Agendar atendimento'} onClose={closeScheduleModal}>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-black text-zinc-950">{scheduleLead.customer_name}</p>
              <p className="mt-1 text-xs text-zinc-500">{scheduleLead.interested_vehicle || 'Interesse não informado'}</p>
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
              Observação do agendamento
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} placeholder="Ex: cliente vem ver o carro às 15h, quer simular entrada de 20 mil..." />
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
              <p className="mt-1 text-xs text-zinc-500">Agendado para: {formatDateTime(cancelLead.scheduled_at) || 'data não informada'}</p>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Motivo do cancelamento
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ex: cliente pediu para remarcar, desistiu, não conseguiu vir..." />
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
              <p className="mt-1 text-xs text-zinc-500">{lostLead.interested_vehicle || 'Interesse não informado'}</p>
            </div>

            <label className="text-sm font-bold text-zinc-700">
              Motivo da perda
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Ex: sem entrada, comprou em outra loja, não respondeu, score baixo..." />
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
  tone,
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
  onLost,
  onReopen
}: {
  lead: any;
  columnKey: string;
  tone: string;
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
  onReopen: () => void;
}) {
  const scheduledAt = formatDateTime(lead.scheduled_at);
  const cancelledAt = formatDateTime(lead.appointment_cancelled_at);
  const styles = toneStyles[tone] || toneStyles.zinc;

  function action(event: React.MouseEvent<HTMLButtonElement>, callback: () => void) {
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
        'rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm transition active:cursor-grabbing',
        'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        isDragging ? 'opacity-50 ring-2 ring-red-300' : ''
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black leading-snug text-zinc-950 break-words">
            {lead.customer_name || 'Cliente sem nome'}
          </h3>
          <p className="mt-1 text-[11px] font-bold leading-snug text-zinc-500 break-words">
            {lead.interested_vehicle || 'Interesse não informado'}
          </p>
        </div>

        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${styles.badge}`}>
          {columnKey === 'sale_confirmed' ? 'Venda' : columnKey === 'lost' ? 'Perda' : statusLabels[lead.status] || lead.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-zinc-50 px-2 py-1 text-[10px] font-black text-zinc-500">☎ {lead.customer_phone || 'Sem telefone'}</span>
        <span className="rounded-full bg-zinc-50 px-2 py-1 text-[10px] font-black uppercase text-zinc-500">{readableOrigin(lead.origin)}</span>
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-black uppercase text-white">{formatLeadAge(lead.created_at)}</span>
      </div>

      {scheduledAt ? (
        <div className="mt-2 rounded-xl bg-zinc-50 p-2 text-[11px] text-zinc-600">
          <p className="flex items-center gap-1.5 font-black text-zinc-900"><CalendarClock size={13} /> {scheduledAt}</p>
          {lead.appointment_notes ? <p className="mt-1 leading-relaxed break-words">{lead.appointment_notes}</p> : null}
        </div>
      ) : null}

      {columnKey === 'appointment_cancelled' ? (
        <div className="mt-2 rounded-xl bg-orange-50 p-2 text-[11px] text-orange-800">
          <p className="font-black">Cancelado {cancelledAt ? `em ${cancelledAt}` : ''}</p>
          <p className="mt-1 leading-relaxed break-words">{lead.appointment_cancelled_reason || 'Cliente cancelou o agendamento.'}</p>
        </div>
      ) : null}

      {columnKey === 'lost' && lead.lost_reason ? (
        <div className="mt-2 rounded-xl bg-red-50 p-2 text-[11px] text-red-700">
          <p className="font-black">Motivo da perda</p>
          <p className="mt-1 leading-relaxed break-words">{lead.lost_reason}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <SmallAction label="Editar" icon={<Edit3 size={12} />} onClick={(event) => action(event, onOpen)} />

        {columnKey === 'new_lead' ? (
          <>
            <SmallAction label={lead.customer_phone ? 'WhatsApp' : 'Atender'} tone="green" icon={<MessageCircle size={12} />} onClick={(event) => action(event, onStart)} />
            <SmallAction label="Perda" tone="red" onClick={(event) => action(event, onLost)} />
          </>
        ) : null}

        {columnKey === 'in_service' ? (
          <>
            <SmallAction label="Agendar" tone="red" icon={<CalendarDays size={12} />} onClick={(event) => action(event, onSchedule)} />
            <SmallAction label="Perda" tone="red" onClick={(event) => action(event, onLost)} />
          </>
        ) : null}

        {columnKey === 'scheduled' ? (
          <>
            <SmallAction label="Chegou" tone="blue" onClick={(event) => action(event, onShowedUp)} />
            <SmallAction label="Reagendar" onClick={(event) => action(event, onSchedule)} />
            <SmallAction label="Cancelou" tone="orange" onClick={(event) => action(event, onCancel)} />
            <SmallAction label="Faltou" onClick={(event) => action(event, onNoShow)} />
          </>
        ) : null}

        {columnKey === 'appointment_cancelled' || columnKey === 'no_show' ? (
          <>
            <SmallAction label="Reagendar" tone="red" onClick={(event) => action(event, onSchedule)} />
            <SmallAction label="Perda" tone="red" onClick={(event) => action(event, onLost)} />
          </>
        ) : null}

        {columnKey === 'showed_up' ? (
          <>
            <SmallAction label="Venda" tone="green" onClick={(event) => action(event, onSale)} />
            <SmallAction label="Perda" tone="red" onClick={(event) => action(event, onLost)} />
          </>
        ) : null}

        {columnKey === 'sale_confirmed' ? (
          <SmallAction label="Cancelar venda" tone="orange" icon={<RotateCcw size={12} />} onClick={(event) => action(event, onReopen)} />
        ) : null}

        {columnKey === 'lost' ? (
          <SmallAction label="Reabrir" tone="blue" icon={<RotateCcw size={12} />} onClick={(event) => action(event, onReopen)} />
        ) : null}
      </div>
    </div>
  );
}

function SmallAction({ label, onClick, icon, tone = 'default' }: { label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; icon?: ReactNode; tone?: 'default' | 'green' | 'red' | 'orange' | 'blue' }) {
  const className = {
    default: 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50',
    green: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    red: 'border-red-600 bg-red-600 text-white hover:bg-red-700',
    orange: 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600',
    blue: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
  }[tone];

  return (
    <button className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase transition ${className}`} type="button" onClick={onClick}>
      {icon} {label}
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
