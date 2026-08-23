'use client';

import Link from 'next/link';
import Image, { type ImageLoaderProps } from 'next/image';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ListTodo,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserRoundCog,
  X,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

const columns = [
  { key: 'new_lead', title: 'Novo Lead Recebido', tone: 'blue' },
  { key: 'in_service', title: 'Em Atendimento', tone: 'violet' },
  { key: 'scheduled', title: 'Agendado', tone: 'amber' },
  { key: 'appointment_cancelled', title: 'Cancelou Agendamento', tone: 'orange' },
  { key: 'no_show', title: 'Não Compareceu', tone: 'zinc' },
  { key: 'showed_up', title: 'Compareceu', tone: 'emerald' },
  { key: 'sale_confirmed', title: 'Venda Confirmada', tone: 'green' },
  { key: 'lost', title: 'Perdido', tone: 'red' }
] as const;

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

const toneStyles: Record<string, { column: string; header: string; badge: string; dot: string }> = {
  blue: { column: 'border-blue-100 bg-blue-50/25', header: 'border-blue-100 bg-blue-50 text-blue-700', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  violet: { column: 'border-violet-100 bg-violet-50/25', header: 'border-violet-100 bg-violet-50 text-violet-700', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  amber: { column: 'border-amber-100 bg-amber-50/30', header: 'border-amber-100 bg-amber-50 text-amber-700', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  orange: { column: 'border-orange-100 bg-orange-50/30', header: 'border-orange-100 bg-orange-50 text-orange-700', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  zinc: { column: 'border-zinc-200 bg-zinc-50/50', header: 'border-zinc-200 bg-zinc-100 text-zinc-700', badge: 'bg-zinc-200 text-zinc-700', dot: 'bg-zinc-500' },
  emerald: { column: 'border-emerald-100 bg-emerald-50/25', header: 'border-emerald-100 bg-emerald-50 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  green: { column: 'border-green-100 bg-green-50/30', header: 'border-green-100 bg-green-50 text-green-700', badge: 'bg-green-100 text-green-700', dot: 'bg-green-600' },
  red: { column: 'border-red-100 bg-red-50/25', header: 'border-red-100 bg-red-50 text-red-700', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
};

type PipelineLead = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_phone_masked: string | null;
  has_phone: boolean;
  interested_vehicle: string | null;
  origin: string | null;
  status: string;
  scheduled_at: string | null;
  appointment_notes: string | null;
  appointment_cancelled_at: string | null;
  appointment_cancelled_reason: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  whatsapp_conversation_id: string | null;
  profile_picture_url: string | null;
  assigned_user_id?: string | null;
  seller_user_id?: string | null;
  pre_sales_user_id?: string | null;
  captured_by_user_id?: string | null;
  [key: string]: any;
};

type PipelinePayload = {
  store: { id: string; store_name: string; slug: string };
  profile: { id: string; full_name: string; role: string };
  scope_label: string;
  capabilities: { can_delete: boolean; can_transfer: boolean; can_confirm_sale: boolean };
  metrics: { total: number; scheduled: number; cancelled: number; sold: number; lost: number };
  leads: PipelineLead[];
  pagination: { offset: number; limit: number; total: number; has_more: boolean };
};

type LeadNote = { id: string; note_type: string; content: string; author_name: string | null; created_at: string };

type TransferPayload = {
  current_responsible_id: string | null;
  team: Array<{ id: string; full_name: string; role: string; role_label: string }>;
};

type PipelineViewMode = 'kanban' | 'list';

type PipelineStageOption = {
  id: string;
  systemKey: string | null;
  name: string;
  color: string;
  visible: boolean;
  system: boolean;
  order: number;
};

type PipelineCustomAssignment = {
  stageId: string;
  sourceStatus: string;
};

const defaultStageOptions: PipelineStageOption[] = [
  { id: 'new_lead', systemKey: 'new_lead', name: 'Novo Lead Recebido', color: '#3b82f6', visible: true, system: true, order: 0 },
  { id: 'in_service', systemKey: 'in_service', name: 'Em Atendimento', color: '#8b5cf6', visible: true, system: true, order: 1 },
  { id: 'scheduled', systemKey: 'scheduled', name: 'Agendado', color: '#f59e0b', visible: true, system: true, order: 2 },
  { id: 'appointment_cancelled', systemKey: 'appointment_cancelled', name: 'Cancelou Agendamento', color: '#f97316', visible: true, system: true, order: 3 },
  { id: 'no_show', systemKey: 'no_show', name: 'Não Compareceu', color: '#71717a', visible: true, system: true, order: 4 },
  { id: 'showed_up', systemKey: 'showed_up', name: 'Compareceu', color: '#10b981', visible: true, system: true, order: 5 },
  { id: 'sale_confirmed', systemKey: 'sale_confirmed', name: 'Venda Confirmada', color: '#22c55e', visible: true, system: true, order: 6 },
  { id: 'lost', systemKey: 'lost', name: 'Perdido', color: '#ef4444', visible: true, system: true, order: 7 }
];

function viewModeStorageKey(slug: string, profileId: string) {
  return `auto-controle-pipeline-view:${slug}:${profileId}`;
}

function leadResponsibleId(lead: PipelineLead) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.captured_by_user_id || '';
}

function formatDateTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toInputDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toInputTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function readableOrigin(value: unknown) {
  return String(value || 'Manual').replace(/_/g, ' ');
}

function leadInitials(value: unknown) {
  const parts = String(value || 'Lead').split(' ').map((part) => part.trim()).filter((part) => /[A-Za-zÀ-ÿ]/.test(part));
  return ((parts[0]?.[0] || 'L') + (parts[1]?.[0] || '')).toUpperCase();
}

function compactSchedule(value: unknown) {
  if (!value) return 'Horário não informado';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Horário não informado';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function passthroughImageLoader({ src }: ImageLoaderProps) {
  return src;
}

function defaultTaskSlot() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return { date: toInputDate(date), time: toInputTime(date) };
}

export default function StoreSlugPipelinePage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [payload, setPayload] = useState<PipelinePayload | null>(null);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [message, setMessage] = useState('Carregando Pipeline seguro...');
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadInFlight = useRef<Promise<PipelinePayload> | null>(null);
  const realtimeRefreshTimer = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PipelineViewMode>('kanban');
  const [stageOptions, setStageOptions] = useState<PipelineStageOption[]>(defaultStageOptions);
  const [customAssignments, setCustomAssignments] = useState<Record<string, PipelineCustomAssignment>>({});
  const [selectedResponsible, setSelectedResponsible] = useState('all');

  const [scheduleLead, setScheduleLead] = useState<PipelineLead | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const [cancelLead, setCancelLead] = useState<PipelineLead | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [lostLead, setLostLead] = useState<PipelineLead | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [saleLead, setSaleLead] = useState<PipelineLead | null>(null);

  const [editingLead, setEditingLead] = useState<PipelineLead | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editOrigin, setEditOrigin] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAppointmentNotes, setEditAppointmentNotes] = useState('');
  const [newObservation, setNewObservation] = useState('');
  const [history, setHistory] = useState<LeadNote[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const [taskLead, setTaskLead] = useState<PipelineLead | null>(null);
  const [taskType, setTaskType] = useState('call_back');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  const [transferLead, setTransferLead] = useState<PipelineLead | null>(null);
  const [transferPayload, setTransferPayload] = useState<TransferPayload | null>(null);
  const [targetUserId, setTargetUserId] = useState('');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function request(url: string, options: RequestInit = {}) {
    const accessToken = await token();
    if (!accessToken) {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      throw new Error('Sessão expirada.');
    }
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const data = await response.json();
    if (response.status === 401) router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
    return data;
  }

  async function loadData(silent = false) {
    if (loadInFlight.current) return loadInFlight.current;
    if (!silent) setMessage('Atualizando Pipeline seguro...');

    const pending = request(`/api/store/portal/pipeline?slug=${encodeURIComponent(slug)}&offset=0&limit=200`) as Promise<PipelinePayload>;
    loadInFlight.current = pending;

    try {
      const data = await pending;
      setPayload(data);
      setLeads(data.leads || []);
      window.dispatchEvent(new CustomEvent('pipeline-data-updated', { detail: data }));
      if (!silent) setMessage('');
      return data;
    } finally {
      loadInFlight.current = null;
    }
  }

  async function loadMore() {
    if (!payload?.pagination.has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const offset = leads.length;
      const data = await request(`/api/store/portal/pipeline?slug=${encodeURIComponent(slug)}&offset=${offset}&limit=200`) as PipelinePayload;
      setLeads((current) => {
        const known = new Set(current.map((lead) => lead.id));
        return [...current, ...data.leads.filter((lead) => !known.has(lead.id))];
      });
      setPayload((current) => current ? {
        ...current,
        pagination: {
          ...data.pagination,
          offset: 0,
          total: data.pagination.total,
          has_more: offset + data.leads.length < data.pagination.total
        }
      } : data);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar mais leads.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function runCommand(command: string, lead: PipelineLead, extra: Record<string, any> = {}, loadingMessage = 'Atualizando lead...') {
    setBusy(true);
    setMessage(loadingMessage);
    try {
      const result = await request('/api/store/portal/pipeline/actions', {
        method: 'POST',
        body: JSON.stringify({ command, slug, lead_id: lead.id, ...extra })
      });
      await loadData(true);
      setMessage(result.message || 'Ação concluída.');
      return result;
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível concluir a ação.');
      throw error;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadData().catch((error) => setMessage(error?.message || 'Não foi possível carregar o Pipeline.'));
  }, [slug]);

  useEffect(() => {
    const storeId = payload?.store.id;
    if (!storeId) return;

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = window.setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void loadData(true).catch(() => undefined);
      }, 750);
    };

    const channel = supabase
      .channel(`pipeline-leads-${storeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: `assigned_store_id=eq.${storeId}`
      }, scheduleRefresh)
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (wasHiddenFor >= 60_000) scheduleRefresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [payload?.store.id, slug, supabase]);

  useEffect(() => {
    const profileId = payload?.profile.id;
    if (!profileId) return;
    const saved = window.localStorage.getItem(viewModeStorageKey(slug, profileId));
    setViewMode(saved === 'list' ? 'list' : 'kanban');
  }, [payload?.profile.id, slug]);

  useEffect(() => {
    const onViewModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: PipelineViewMode }>).detail?.mode;
      if (mode === 'kanban' || mode === 'list') setViewMode(mode);
    };
    window.addEventListener('pipeline-view-mode-change', onViewModeChange as EventListener);
    return () => window.removeEventListener('pipeline-view-mode-change', onViewModeChange as EventListener);
  }, []);

  useEffect(() => {
    const onResponsibleChange = (event: Event) => {
      setSelectedResponsible((event as CustomEvent<{ value?: string }>).detail?.value || 'all');
    };
    window.addEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
    return () => window.removeEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
  }, []);

  useEffect(() => {
    const profileId = payload?.profile.id;
    if (!profileId) return;
    window.localStorage.setItem(viewModeStorageKey(slug, profileId), viewMode);
    window.dispatchEvent(new CustomEvent('pipeline-view-mode-updated', { detail: { mode: viewMode } }));
  }, [payload?.profile.id, slug, viewMode]);

  useEffect(() => {
    const onStageOptions = (event: Event) => {
      const detail = (event as CustomEvent<{
        stages?: PipelineStageOption[];
        assignments?: Record<string, PipelineCustomAssignment>;
      }>).detail;
      if (Array.isArray(detail?.stages) && detail.stages.length) setStageOptions(detail.stages);
      setCustomAssignments(detail?.assignments && typeof detail.assignments === 'object' ? detail.assignments : {});
    };
    window.addEventListener('pipeline-stage-options-updated', onStageOptions as EventListener);
    window.dispatchEvent(new CustomEvent('pipeline-stage-options-requested'));
    return () => window.removeEventListener('pipeline-stage-options-updated', onStageOptions as EventListener);
  }, []);

  const scopedLeads = useMemo(() => selectedResponsible === 'all'
    ? leads
    : leads.filter((lead) => leadResponsibleId(lead) === selectedResponsible), [leads, selectedResponsible]);

  const grouped = useMemo(() => columns.map((column) => ({
    ...column,
    leads: scopedLeads.filter((lead) => lead.status === column.key)
  })), [scopedLeads]);

  async function revealPhone(lead: PipelineLead) {
    try {
      const result = await request('/api/store/portal/pipeline/actions', {
        method: 'POST',
        body: JSON.stringify({ command: 'reveal_phone', slug, lead_id: lead.id })
      });
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, customer_phone: result.phone, customer_phone_masked: result.phone } : item));
      if (editingLead?.id === lead.id) setEditPhone(result.phone || '');
      setMessage('Telefone liberado e visualização registrada.');
      return String(result.phone || '');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível visualizar o telefone.');
      return '';
    }
  }

  async function openWhatsapp(lead: PipelineLead) {
    if (!lead.has_phone) {
      setMessage('Este lead não possui telefone cadastrado.');
      return;
    }
    try {
      setMessage('Abrindo conversa no WhatsApp CRM...');
      const result = lead.whatsapp_conversation_id
        ? { conversation_id: lead.whatsapp_conversation_id }
        : await request('/api/store/portal/pipeline/whatsapp', {
            method: 'POST',
            body: JSON.stringify({ slug, lead_id: lead.id })
          });
      const conversationId = String(result.conversation_id || '');
      if (!conversationId) throw new Error('Não foi possível identificar a conversa deste lead.');
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, whatsapp_conversation_id: conversationId } : item));
      router.push(`/loja/${encodeURIComponent(slug)}/whatsapp?conversation_id=${encodeURIComponent(conversationId)}`);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível abrir a conversa no WhatsApp CRM.');
    }
  }

  function openSchedule(lead: PipelineLead) {
    setScheduleLead(lead);
    setScheduleDate(toInputDate(lead.scheduled_at));
    setScheduleTime(toInputTime(lead.scheduled_at));
    setScheduleNotes(lead.appointment_notes || '');
  }

  async function saveSchedule() {
    if (!scheduleLead) return;
    try {
      await runCommand('schedule', scheduleLead, { date: scheduleDate, time: scheduleTime, notes: scheduleNotes }, 'Salvando agendamento...');
      setScheduleLead(null);
    } catch {}
  }

  async function saveCancel() {
    if (!cancelLead) return;
    try {
      await runCommand('cancel_schedule', cancelLead, { reason: cancelReason }, 'Registrando cancelamento...');
      setCancelLead(null);
      setCancelReason('');
    } catch {}
  }

  async function saveLoss() {
    if (!lostLead) return;
    try {
      await runCommand('register_loss', lostLead, { reason: lostReason }, 'Registrando perda...');
      setLostLead(null);
      setLostReason('');
    } catch {}
  }

  async function openEditor(lead: PipelineLead) {
    setEditingLead(lead);
    setEditName(lead.customer_name || '');
    setEditPhone(lead.customer_phone || lead.customer_phone_masked || '');
    setEditVehicle(lead.interested_vehicle || '');
    setEditOrigin(lead.origin || '');
    setEditNotes(lead.notes || '');
    setEditAppointmentNotes(lead.appointment_notes || '');
    setNewObservation('');
    setDeleteConfirmation('');
    setHistory([]);
    setMessage('Carregando detalhes do lead...');
    try {
      const [details, phone] = await Promise.all([
        request(`/api/store/portal/pipeline/lead?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(lead.id)}`),
        lead.has_phone ? request('/api/store/portal/pipeline/actions', {
          method: 'POST',
          body: JSON.stringify({ command: 'reveal_phone', slug, lead_id: lead.id })
        }) : Promise.resolve({ phone: '' })
      ]);
      setHistory(details.notes || []);
      setEditPhone(phone.phone || '');
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os detalhes.');
    }
  }

  async function saveEditor() {
    if (!editingLead) return;
    try {
      await runCommand('edit_lead', editingLead, {
        customer_name: editName,
        customer_phone: editPhone,
        interested_vehicle: editVehicle,
        origin: editOrigin,
        notes: editNotes,
        appointment_notes: editAppointmentNotes,
        new_observation: newObservation
      }, 'Salvando informações do lead...');
      setEditingLead(null);
    } catch {}
  }

  async function deleteLead() {
    if (!editingLead) return;
    try {
      await runCommand('delete_lead', editingLead, { confirmation: deleteConfirmation }, 'Excluindo lead do Pipeline...');
      setEditingLead(null);
    } catch {}
  }

  function openTask(lead: PipelineLead) {
    const slot = defaultTaskSlot();
    setTaskLead(lead);
    setTaskType('call_back');
    setTaskDate(slot.date);
    setTaskTime(slot.time);
    setTaskDescription('');
  }

  async function saveTask() {
    if (!taskLead) return;
    setBusy(true);
    setMessage('Salvando tarefa...');
    try {
      const result = await request('/api/store/lead-task', {
        method: 'POST',
        body: JSON.stringify({ lead_id: taskLead.id, task_type: taskType, date: taskDate, time: taskTime, description: taskDescription })
      });
      setTaskLead(null);
      setMessage(result.message || 'Tarefa adicionada ao calendário.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível criar a tarefa.');
    } finally {
      setBusy(false);
    }
  }

  async function openTransfer(lead: PipelineLead) {
    setTransferLead(lead);
    setTransferPayload(null);
    setTargetUserId('');
    setMessage('Carregando responsáveis...');
    try {
      const result = await request(`/api/store/lead-transfer?lead_id=${encodeURIComponent(lead.id)}`) as TransferPayload;
      setTransferPayload(result);
      setTargetUserId(result.current_responsible_id || '');
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar os responsáveis.');
    }
  }

  async function saveTransfer() {
    if (!transferLead) return;
    setBusy(true);
    setMessage('Transferindo lead...');
    try {
      const result = await request('/api/store/lead-transfer', {
        method: 'POST',
        body: JSON.stringify({ lead_id: transferLead.id, target_user_id: targetUserId || null })
      });
      setTransferLead(null);
      await loadData(true);
      setMessage(result.message || 'Lead transferido.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível transferir o lead.');
    } finally {
      setBusy(false);
    }
  }

  async function reopenLead(lead: PipelineLead) {
    if (lead.status === 'sale_confirmed') {
      const confirmed = window.confirm('Cancelar esta venda e devolver o lead para Compareceu?');
      if (!confirmed) return;
      const reason = window.prompt('Informe o motivo do cancelamento da venda:')?.trim();
      if (!reason) return setMessage('Informe o motivo do cancelamento da venda.');
      setBusy(true);
      setMessage('Cancelando venda...');
      try {
        const result = await request('/api/store/sale-confirmation', {
          method: 'DELETE',
          body: JSON.stringify({ lead_id: lead.id, reason })
        });
        await loadData(true);
        setMessage(result.message || 'Venda cancelada.');
      } catch (error: any) {
        setMessage(error?.message || 'Não foi possível cancelar a venda.');
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      await runCommand('reopen_lead', lead, {}, 'Reabrindo lead...');
    } catch {}
  }

  async function moveLead(lead: PipelineLead, target: string) {
    if (lead.status === target) return;
    if (target === 'scheduled') return openSchedule(lead);
    if (target === 'appointment_cancelled') {
      setCancelLead(lead);
      setCancelReason('');
      return;
    }
    if (target === 'lost') {
      setLostLead(lead);
      setLostReason(lead.lost_reason || '');
      return;
    }
    if (target === 'sale_confirmed') {
      setSaleLead(lead);
      return;
    }
    if (lead.status === 'lost' && target === 'in_service') return reopenLead(lead);
    const command = target === 'no_show' ? 'mark_no_show' : target === 'showed_up' ? 'mark_showed_up' : 'change_stage';
    try {
      await runCommand(command, lead, command === 'change_stage' ? { target_status: target } : {}, 'Movendo lead...');
    } catch {}
  }

  function dropCard(event: DragEvent<HTMLDivElement>, target: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggedLeadId;
    const lead = leads.find((item) => item.id === id);
    setDraggedLeadId(null);
    setDragOverColumn(null);
    if (lead) void moveLead(lead, target);
  }

  function changeListStage(lead: PipelineLead, stageId: string) {
    const stage = stageOptions.find((item) => item.id === stageId);
    if (!stage) return;
    if (!stage.system) {
      window.dispatchEvent(new CustomEvent('pipeline-assign-custom-stage', { detail: { leadId: lead.id, stageId } }));
      return;
    }
    window.dispatchEvent(new CustomEvent('pipeline-clear-custom-assignment', { detail: { leadId: lead.id } }));
    if (stage.systemKey) void moveLead(lead, stage.systemKey);
  }

  if (!payload) {
    return <main className="flex min-h-[70vh] items-center justify-center p-6 text-center"><div><Loader2 className="mx-auto animate-spin text-red-600" size={32} /><p className="mt-4 font-bold text-zinc-600">{message}</p></div></main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell min-h-screen">
        <div className="premium-canvas min-w-0 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Pipeline seguro · {payload.profile.full_name}</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Pipeline da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">{payload.scope_label}. As mudanças são validadas e auditadas no servidor.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/loja/${slug}/calendario`} className="premium-button-secondary"><CalendarDays size={18} /> Calendário</Link>
              <button className="premium-button-primary" type="button" onClick={() => void loadData()} disabled={busy}><BarChart3 size={18} /> Atualizar pipeline</button>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          {viewMode === 'kanban' ? (
            <div className="mt-5 overflow-x-auto pb-3">
              <div className="grid min-w-[1760px] grid-cols-8 gap-3">
                {grouped.map((column) => {
                  const styles = toneStyles[column.tone];
                  return (
                    <div
                      key={column.key}
                      onDragOver={(event) => { event.preventDefault(); setDragOverColumn(column.key); }}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(event) => dropCard(event, column.key)}
                      className={`min-h-[520px] rounded-[24px] border p-3 shadow-sm transition ${styles.column} ${dragOverColumn === column.key ? 'ring-2 ring-red-200' : ''}`}
                    >
                      <div className={`mb-3 rounded-2xl border px-3 py-3 ${styles.header}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} /><h2 className="text-sm font-black leading-tight">{column.title}</h2></div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${styles.badge}`}>{column.leads.length}</span>
                        </div>
                      </div>
                      <div data-pipeline-stage-cards="true" className="space-y-1">
                        {column.leads.map((lead) => (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            columnKey={column.key}
                            tone={column.tone}
                            dragging={draggedLeadId === lead.id}
                            onDragStart={(event) => { event.dataTransfer.setData('text/plain', lead.id); setDraggedLeadId(lead.id); }}
                            onDragEnd={() => { setDraggedLeadId(null); setDragOverColumn(null); }}
                            onOpen={() => void openEditor(lead)}
                            onReveal={() => void revealPhone(lead)}
                            onWhatsapp={() => void openWhatsapp(lead)}
                            onSchedule={() => openSchedule(lead)}
                            onMove={(target) => void moveLead(lead, target)}
                            onCancel={() => { setCancelLead(lead); setCancelReason(''); }}
                            onSale={() => setSaleLead(lead)}
                            onLost={() => { setLostLead(lead); setLostReason(lead.lost_reason || ''); }}
                            onReopen={() => void reopenLead(lead)}
                            onTask={() => openTask(lead)}
                            onTransfer={() => void openTransfer(lead)}
                          />
                        ))}
                        {column.leads.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-5 text-center text-xs font-bold text-zinc-400">Solte o card aqui</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <PipelineLeadList
              leads={scopedLeads}
              stages={stageOptions}
              assignments={customAssignments}
              busy={busy}
              onOpen={(lead) => void openEditor(lead)}
              onReveal={(lead) => void revealPhone(lead)}
              onWhatsapp={(lead) => void openWhatsapp(lead)}
              onSchedule={openSchedule}
              onStageChange={changeListStage}
              onCancel={(lead) => { setCancelLead(lead); setCancelReason(''); }}
              onSale={setSaleLead}
              onLost={(lead) => { setLostLead(lead); setLostReason(lead.lost_reason || ''); }}
              onReopen={(lead) => void reopenLead(lead)}
              onTask={openTask}
              onTransfer={(lead) => void openTransfer(lead)}
            />
          )}

          {payload.pagination.has_more ? (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-black text-zinc-700 shadow-sm disabled:opacity-50">
                {loadingMore ? 'Carregando...' : `Carregar mais leads (${leads.length} de ${payload.pagination.total})`}
              </button>
            </div>
          ) : null}

          <section className="premium-card mt-5 p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Status label="Novos" value={leads.filter((lead) => lead.status === 'new_lead').length} icon={<Clock3 size={18} />} />
              <Status label="Agendados" value={payload.metrics.scheduled} icon={<CalendarCheck size={18} />} />
              <Status label="Confirmados" value={payload.metrics.sold} icon={<CheckCircle2 size={18} />} />
              <Status label="Perdidos" value={payload.metrics.lost} icon={<XCircle size={18} />} />
            </div>
          </section>
        </div>
      </section>

      {editingLead ? (
        <Modal title="Detalhes e edição segura do lead" onClose={() => setEditingLead(null)} maxWidth="max-w-4xl">
          <div className="grid gap-5">
            <div className="rounded-[26px] bg-[#071020] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Carteira autorizada</p>
              <h3 className="mt-2 text-3xl font-black">{editName || 'Cliente sem nome'}</h3>
              <p className="mt-2 text-sm text-zinc-300">{statusLabels[editingLead.status] || editingLead.status} · {editVehicle || 'Interesse não informado'}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do cliente" value={editName} onChange={setEditName} placeholder="Nome completo" />
              <Field label="Telefone / WhatsApp" value={editPhone} onChange={setEditPhone} placeholder="Telefone cadastrado" />
              <Field label="Carro de interesse" value={editVehicle} onChange={setEditVehicle} placeholder="Veículo de interesse" />
              <Field label="Origem / anúncio" value={editOrigin} onChange={setEditOrigin} placeholder="Origem do lead" />
            </div>
            <Area label="Observação geral" value={editNotes} onChange={setEditNotes} placeholder="Informações gerais do lead" />
            <Area label="Observação do agendamento" value={editAppointmentNotes} onChange={setEditAppointmentNotes} placeholder="Informações da visita" />
            <Area label="Nova observação no histórico" value={newObservation} onChange={setNewObservation} placeholder="Registre a nova interação" />

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h4 className="font-black text-zinc-950">Histórico de observações</h4>
              <div className="mt-3 grid gap-2">
                {history.map((note) => <div key={note.id} className="rounded-xl bg-white p-3 text-sm"><p className="font-bold text-zinc-800">{note.content}</p><p className="mt-1 text-xs text-zinc-400">{note.author_name || 'Usuário'} · {formatDateTime(note.created_at)}</p></div>)}
                {history.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma observação registrada.</p> : null}
              </div>
            </section>

            {payload.capabilities.can_delete ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="font-black text-red-800">Excluir do Pipeline</p>
                <p className="mt-1 text-xs text-red-700">A exclusão é lógica e preserva auditoria. Leads com venda são bloqueados.</p>
                <input className="mt-3 w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="Digite EXCLUIR" />
              </section>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {payload.capabilities.can_delete ? <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700" type="button" onClick={() => void deleteLead()} disabled={busy}><Trash2 size={18} /> Excluir lead</button> : <span />}
              <div className="flex justify-end gap-3"><button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={() => setEditingLead(null)}>Cancelar</button><button className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white" type="button" onClick={() => void saveEditor()} disabled={busy}><Save size={18} /> Salvar alterações</button></div>
            </div>
          </div>
        </Modal>
      ) : null}

      {scheduleLead ? <Modal title={scheduleLead.status === 'scheduled' ? 'Reagendar atendimento' : 'Agendar atendimento'} onClose={() => setScheduleLead(null)}><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Data" type="date" value={scheduleDate} onChange={setScheduleDate} placeholder="" /><Field label="Hora" type="time" value={scheduleTime} onChange={setScheduleTime} placeholder="" /></div><Area label="Observação" value={scheduleNotes} onChange={setScheduleNotes} placeholder="Detalhes da visita" /><ModalActions onCancel={() => setScheduleLead(null)} onConfirm={() => void saveSchedule()} confirmLabel="Salvar agendamento" busy={busy} /></div></Modal> : null}

      {cancelLead ? <Modal title="Cancelar agendamento" onClose={() => setCancelLead(null)}><div className="grid gap-4"><Area label="Motivo obrigatório" value={cancelReason} onChange={setCancelReason} placeholder="Informe por que o cliente cancelou" /><ModalActions onCancel={() => setCancelLead(null)} onConfirm={() => void saveCancel()} confirmLabel="Registrar cancelamento" busy={busy} /></div></Modal> : null}

      {lostLead ? <Modal title="Registrar perda" onClose={() => setLostLead(null)}><div className="grid gap-4"><Area label="Motivo obrigatório" value={lostReason} onChange={setLostReason} placeholder="Ex.: comprou em outra loja, sem entrada, não respondeu" /><ModalActions onCancel={() => setLostLead(null)} onConfirm={() => void saveLoss()} confirmLabel="Registrar perda" busy={busy} /></div></Modal> : null}

      {saleLead ? <Modal title="Confirmar venda" onClose={() => setSaleLead(null)}><div className="grid gap-4"><div className="rounded-2xl bg-emerald-50 p-4"><p className="font-black text-emerald-900">{saleLead.customer_name || 'Cliente sem nome'}</p><p className="mt-1 text-sm font-bold text-emerald-700">{saleLead.interested_vehicle || 'Veículo não informado'}</p></div><p className="text-sm font-bold text-zinc-600">O formulário completo e transacional de venda será aberto para selecionar veículo, vendedor e condições comerciais.</p><div className="flex justify-end"><button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={() => setSaleLead(null)}>Voltar</button></div></div></Modal> : null}

      {taskLead ? <Modal title="Agendar tarefa" onClose={() => setTaskLead(null)}><div className="grid gap-4"><label className="text-sm font-bold text-zinc-700">Tipo de tarefa<select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3" value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="call_back">Ligar novamente</option><option value="send_simulation">Enviar simulação</option><option value="request_documents">Solicitar documentos</option><option value="confirm_visit">Confirmar visita</option><option value="whatsapp_followup">Retornar pelo WhatsApp</option><option value="other">Outra tarefa</option></select></label><div className="grid gap-3 sm:grid-cols-2"><Field label="Data" type="date" value={taskDate} onChange={setTaskDate} placeholder="" /><Field label="Hora" type="time" value={taskTime} onChange={setTaskTime} placeholder="" /></div><Area label="Descrição" value={taskDescription} onChange={setTaskDescription} placeholder="O que precisa ser feito" /><ModalActions onCancel={() => setTaskLead(null)} onConfirm={() => void saveTask()} confirmLabel="Agendar tarefa" busy={busy} /></div></Modal> : null}

      {transferLead ? <Modal title="Transferir Lead" onClose={() => setTransferLead(null)}><div className="grid gap-4">{transferPayload ? <label className="text-sm font-bold text-zinc-700">Novo responsável<select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}><option value="">Carteira geral da loja</option>{transferPayload.team.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.role_label}</option>)}</select></label> : <div className="flex items-center gap-2 text-sm font-bold text-zinc-600"><Loader2 className="animate-spin" size={16} /> Carregando equipe...</div>}<ModalActions onCancel={() => setTransferLead(null)} onConfirm={() => void saveTransfer()} confirmLabel="Transferir lead" busy={busy || !transferPayload} /></div></Modal> : null}
    </main>
  );
}

function PipelineLeadList({ leads, stages, assignments, busy, onOpen, onReveal, onWhatsapp, onSchedule, onStageChange, onCancel, onSale, onLost, onReopen, onTask, onTransfer }: {
  leads: PipelineLead[];
  stages: PipelineStageOption[];
  assignments: Record<string, PipelineCustomAssignment>;
  busy: boolean;
  onOpen: (lead: PipelineLead) => void;
  onReveal: (lead: PipelineLead) => void;
  onWhatsapp: (lead: PipelineLead) => void;
  onSchedule: (lead: PipelineLead) => void;
  onStageChange: (lead: PipelineLead, stageId: string) => void;
  onCancel: (lead: PipelineLead) => void;
  onSale: (lead: PipelineLead) => void;
  onLost: (lead: PipelineLead) => void;
  onReopen: (lead: PipelineLead) => void;
  onTask: (lead: PipelineLead) => void;
  onTransfer: (lead: PipelineLead) => void;
}) {
  const orderedStages = [...stages].sort((left, right) => left.order - right.order);
  const visibleStages = orderedStages.filter((stage) => stage.visible);
  const visibleLeads = leads.flatMap((lead) => {
    const assignment = assignments[lead.id];
    const assignedStage = assignment && assignment.sourceStatus === lead.status && orderedStages.some((stage) => stage.id === assignment.stageId)
      ? assignment.stageId
      : lead.status;
    const stage = orderedStages.find((item) => item.id === assignedStage || item.systemKey === assignedStage);
    return stage?.visible ? [{ lead, stageId: stage.id }] : [];
  });

  return (
    <section data-pipeline-list-view="true" className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[minmax(230px,1.35fr)_130px_minmax(180px,1fr)_190px_145px_170px] gap-3 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-300">
            <span>Lead</span><span>Origem</span><span>Interesse</span><span>Etapa</span><span>Agendamento</span><span className="text-center">Ações</span>
          </div>
          <div className="max-h-[calc(100dvh-176px)] min-h-[420px] overflow-y-auto overscroll-contain">
            {visibleLeads.map(({ lead, stageId }) => {
              return (
                <LeadListRow
                  key={lead.id}
                  lead={lead}
                  stages={visibleStages}
                  stageId={stageId}
                  busy={busy}
                  onOpen={() => onOpen(lead)}
                  onReveal={() => onReveal(lead)}
                  onWhatsapp={() => onWhatsapp(lead)}
                  onSchedule={() => onSchedule(lead)}
                  onStageChange={(stageId) => onStageChange(lead, stageId)}
                  onCancel={() => onCancel(lead)}
                  onSale={() => onSale(lead)}
                  onLost={() => onLost(lead)}
                  onReopen={() => onReopen(lead)}
                  onTask={() => onTask(lead)}
                  onTransfer={() => onTransfer(lead)}
                />
              );
            })}
            {visibleLeads.length === 0 ? <div className="p-10 text-center text-sm font-bold text-zinc-400">Nenhum lead disponível nesta carteira.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadListRow({ lead, stages, stageId, busy, onOpen, onReveal, onWhatsapp, onSchedule, onStageChange, onCancel, onSale, onLost, onReopen, onTask, onTransfer }: {
  lead: PipelineLead;
  stages: PipelineStageOption[];
  stageId: string;
  busy: boolean;
  onOpen: () => void;
  onReveal: () => void;
  onWhatsapp: () => void;
  onSchedule: () => void;
  onStageChange: (stageId: string) => void;
  onCancel: () => void;
  onSale: () => void;
  onLost: () => void;
  onReopen: () => void;
  onTask: () => void;
  onTransfer: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const name = lead.customer_name || 'Cliente sem nome';
  const phone = lead.customer_phone || lead.customer_phone_masked || 'Sem telefone';
  const stage = stages.find((item) => item.id === stageId) || stages.find((item) => item.systemKey === lead.status);
  const canSchedule = ['in_service', 'scheduled', 'appointment_cancelled', 'no_show'].includes(lead.status);
  const scheduled = lead.scheduled_at ? compactSchedule(lead.scheduled_at) : '—';

  return (
    <article data-pipeline-list-row="true" className="border-b border-zinc-100 px-4 py-2.5 last:border-b-0 hover:bg-zinc-50/80">
      <div className="grid grid-cols-[minmax(230px,1.35fr)_130px_minmax(180px,1fr)_190px_145px_170px] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={onOpen} className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-[10px] font-black text-zinc-600" aria-label={`Abrir ${name}`}>
            {lead.profile_picture_url ? <Image loader={passthroughImageLoader} unoptimized src={lead.profile_picture_url} alt={`Foto de ${name}`} fill sizes="36px" className="object-cover" /> : leadInitials(name)}
          </button>
          <div className="min-w-0">
            <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[11px] font-black text-zinc-950 hover:text-red-600">{name}</button>
            <button type="button" onClick={onReveal} className="mt-0.5 block max-w-full truncate text-left text-[9px] font-bold text-zinc-500 hover:text-red-600" title="Visualizar telefone completo">{phone}</button>
          </div>
        </div>
        <span className="truncate text-[9px] font-black uppercase text-zinc-500" title={readableOrigin(lead.origin)}>{readableOrigin(lead.origin)}</span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black text-zinc-800" title={lead.interested_vehicle || 'Interesse não informado'}>{lead.interested_vehicle || 'Interesse não informado'}</p>
          <p className="mt-0.5 text-[8px] font-bold text-zinc-400">Entrada {formatDateTime(lead.created_at) || 'não informada'}</p>
        </div>
        <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-2" style={{ borderLeftColor: stage?.color || '#71717a', borderLeftWidth: 4 }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage?.color || '#71717a' }} />
          <select className="min-w-0 flex-1 bg-transparent text-[9px] font-black text-zinc-700 outline-none" value={stageId} onChange={(event) => onStageChange(event.target.value)} disabled={busy} aria-label={`Alterar etapa de ${name}`}>
            {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black text-zinc-700">{scheduled}</p>
          <p className="mt-0.5 truncate text-[8px] font-bold text-zinc-400">{lead.appointment_notes || (lead.status === 'scheduled' ? 'Visita agendada' : 'Sem agendamento')}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <CompactIconAction label="WhatsApp" tone="green" icon={<WhatsappMark size={13} />} disabled={!lead.has_phone} disabledTitle="Lead sem telefone cadastrado" onClick={onWhatsapp} />
          <CompactIconAction label="Tarefa" icon={<ListTodo size={12} />} onClick={onTask} />
          <CompactIconAction label={lead.status === 'scheduled' ? 'Reagendar' : 'Agendar'} tone="amber" icon={<CalendarDays size={12} />} disabled={!canSchedule} disabledTitle="Disponível após iniciar o atendimento" onClick={onSchedule} />
          <CompactIconAction label={moreOpen ? 'Fechar ações' : 'Mais ações'} icon={<Plus size={13} className={moreOpen ? 'rotate-45 transition' : 'transition'} />} expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)} />
        </div>
      </div>
      {moreOpen ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5 rounded-xl bg-zinc-50 p-2">
          <CompactMenuAction label="Editar" icon={<Edit3 size={11} />} onClick={onOpen} />
          <CompactMenuAction label="Transferir" icon={<ArrowRightLeft size={11} />} onClick={onTransfer} />
          {lead.status === 'new_lead' || lead.status === 'in_service' || lead.status === 'appointment_cancelled' || lead.status === 'no_show' ? <CompactMenuAction label="Perda" tone="red" onClick={onLost} /> : null}
          {lead.status === 'scheduled' ? <CompactMenuAction label="Cancelou" tone="orange" onClick={onCancel} /> : null}
          {lead.status === 'showed_up' ? <><CompactMenuAction label="Venda" tone="green" onClick={onSale} /><CompactMenuAction label="Perda" tone="red" onClick={onLost} /></> : null}
          {lead.status === 'sale_confirmed' ? <CompactMenuAction label="Cancelar venda" tone="orange" icon={<RotateCcw size={11} />} onClick={onReopen} /> : null}
          {lead.status === 'lost' ? <CompactMenuAction label="Reabrir" tone="blue" icon={<RotateCcw size={11} />} onClick={onReopen} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function LeadCard({ lead, columnKey, tone, dragging, onDragStart, onDragEnd, onOpen, onReveal, onWhatsapp, onSchedule, onMove, onCancel, onSale, onLost, onReopen, onTask, onTransfer }: {
  lead: PipelineLead;
  columnKey: string;
  tone: string;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onReveal: () => void;
  onWhatsapp: () => void;
  onSchedule: () => void;
  onMove: (target: string) => void;
  onCancel: () => void;
  onSale: () => void;
  onLost: () => void;
  onReopen: () => void;
  onTask: () => void;
  onTransfer: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const styles = toneStyles[tone];
  const phone = lead.customer_phone || lead.customer_phone_masked || 'Sem telefone';
  const name = lead.customer_name || 'Cliente sem nome';
  const schedule = compactSchedule(lead.scheduled_at);
  const canSchedule = ['in_service', 'scheduled', 'appointment_cancelled', 'no_show'].includes(columnKey);
  const stop = (event: any, action: () => void) => { event.stopPropagation(); action(); };
  const runMoreAction = (event: any, action: () => void) => stop(event, () => {
    setMoreOpen(false);
    action();
  });

  return (
    <div
      data-lead-id={lead.id}
      data-pipeline-card-v2="true"
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') onOpen();
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-pointer rounded-xl border border-zinc-100 bg-white p-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${dragging ? 'opacity-50 ring-2 ring-red-300' : ''}`}
    >
      <div className="flex min-h-9 items-start gap-1.5">
        <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[9px] font-black ${styles.badge}`}>
          {lead.profile_picture_url ? (
            <Image
              loader={passthroughImageLoader}
              unoptimized
              src={lead.profile_picture_url}
              alt={`Foto de ${name}`}
              fill
              sizes="28px"
              className="object-cover"
            />
          ) : leadInitials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[10px] font-black leading-3 text-zinc-950">{name}</h3>
          <button
            type="button"
            onClick={(event) => stop(event, onReveal)}
            className="mt-0.5 block max-w-full truncate text-left text-[9px] font-bold leading-3 text-zinc-500 hover:text-red-600"
            title="Visualizar telefone completo"
          >
            {phone}
          </button>
          {columnKey === 'scheduled' ? (
            <p className="flex min-w-0 items-center gap-1 text-[8px] font-black uppercase leading-3 text-zinc-400" title={`${lead.interested_vehicle || 'Veículo não informado'} · ${schedule}`}>
              <span className="min-w-0 flex-1 truncate">{lead.interested_vehicle || 'Veículo não informado'}</span>
              <span className="shrink-0 text-amber-700">{schedule}</span>
            </p>
          ) : (
            <p className="truncate text-[8px] font-black uppercase leading-3 text-zinc-400">{readableOrigin(lead.origin)}</p>
          )}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-4 gap-1">
        <CompactIconAction
          label="WhatsApp"
          tone="green"
          icon={<WhatsappMark size={13} />}
          disabled={!lead.has_phone}
          disabledTitle="Lead sem telefone cadastrado"
          onClick={(event) => stop(event, onWhatsapp)}
        />
        <CompactIconAction
          label="Tarefa"
          icon={<ListTodo size={12} />}
          onClick={(event) => stop(event, onTask)}
        />
        <CompactIconAction
          label={columnKey === 'scheduled' ? 'Reagendar' : 'Agendar'}
          tone="amber"
          icon={<CalendarDays size={12} />}
          disabled={!canSchedule}
          disabledTitle="Disponível após iniciar o atendimento"
          onClick={(event) => stop(event, onSchedule)}
        />
        <CompactIconAction
          label={moreOpen ? 'Fechar ações' : 'Mais ações'}
          icon={<Plus size={13} className={moreOpen ? 'rotate-45 transition' : 'transition'} />}
          expanded={moreOpen}
          onClick={(event) => stop(event, () => setMoreOpen((current) => !current))}
        />
      </div>

      {moreOpen ? (
        <div
          className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-zinc-100 bg-zinc-50 p-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <CompactMenuAction label="Editar" icon={<Edit3 size={11} />} onClick={(event) => runMoreAction(event, onOpen)} />
          <CompactMenuAction label="Transferir" icon={<ArrowRightLeft size={11} />} onClick={(event) => runMoreAction(event, onTransfer)} />
          {columnKey === 'new_lead' && !lead.has_phone ? <CompactMenuAction label="Atender" tone="green" onClick={(event) => runMoreAction(event, onWhatsapp)} /> : null}
          {columnKey === 'new_lead' ? <CompactMenuAction label="Perda" tone="red" onClick={(event) => runMoreAction(event, onLost)} /> : null}
          {columnKey === 'in_service' ? <CompactMenuAction label="Perda" tone="red" onClick={(event) => runMoreAction(event, onLost)} /> : null}
          {columnKey === 'scheduled' ? <>
            <CompactMenuAction label="Chegou" tone="blue" onClick={(event) => runMoreAction(event, () => onMove('showed_up'))} />
            <CompactMenuAction label="Cancelou" tone="orange" onClick={(event) => runMoreAction(event, onCancel)} />
            <CompactMenuAction label="Faltou" onClick={(event) => runMoreAction(event, () => onMove('no_show'))} />
          </> : null}
          {columnKey === 'appointment_cancelled' || columnKey === 'no_show' ? <CompactMenuAction label="Perda" tone="red" onClick={(event) => runMoreAction(event, onLost)} /> : null}
          {columnKey === 'showed_up' ? <>
            <CompactMenuAction label="Venda" tone="green" onClick={(event) => runMoreAction(event, onSale)} />
            <CompactMenuAction label="Perda" tone="red" onClick={(event) => runMoreAction(event, onLost)} />
          </> : null}
          {columnKey === 'sale_confirmed' ? <CompactMenuAction label="Cancelar venda" tone="orange" icon={<RotateCcw size={11} />} onClick={(event) => runMoreAction(event, onReopen)} /> : null}
          {columnKey === 'lost' ? <CompactMenuAction label="Reabrir" tone="blue" icon={<RotateCcw size={11} />} onClick={(event) => runMoreAction(event, onReopen)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function WhatsappMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M16.05 3.2A12.7 12.7 0 0 0 5.03 22.18L3.2 28.8l6.78-1.78A12.7 12.7 0 1 0 16.05 3.2Zm0 22.98a10.53 10.53 0 0 1-5.36-1.46l-.38-.23-4.02 1.05 1.07-3.91-.25-.4a10.54 10.54 0 1 1 8.94 4.95Zm5.78-7.88c-.32-.16-1.87-.92-2.16-1.03-.29-.11-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.58a9.55 9.55 0 0 1-1.77-2.2c-.19-.32-.02-.49.14-.65.14-.14.32-.37.47-.55.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55h-.61c-.21 0-.55.08-.84.4-.29.32-1.11 1.08-1.11 2.64s1.14 3.07 1.29 3.28c.16.21 2.23 3.41 5.41 4.78.75.33 1.34.52 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.87-.77 2.14-1.5.26-.74.26-1.37.18-1.5-.08-.14-.29-.21-.61-.37Z" />
    </svg>
  );
}

function CompactIconAction({ label, onClick, icon, tone = 'default', disabled = false, disabledTitle, expanded }: {
  label: string;
  onClick: (event: any) => void;
  icon: ReactNode;
  tone?: 'default' | 'green' | 'amber';
  disabled?: boolean;
  disabledTitle?: string;
  expanded?: boolean;
}) {
  const className = {
    default: 'border-zinc-200 bg-white text-zinc-600 hover:border-red-200 hover:text-red-600',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
  }[tone];

  return (
    <button
      className={`flex h-[23px] min-w-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle || label : label}
      aria-label={disabled ? disabledTitle || label : label}
      aria-expanded={expanded}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function CompactMenuAction({ label, onClick, icon, tone = 'default' }: {
  label: string;
  onClick: (event: any) => void;
  icon?: ReactNode;
  tone?: 'default' | 'green' | 'red' | 'orange' | 'blue';
}) {
  const className = {
    default: 'border-zinc-200 bg-white text-zinc-600',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700'
  }[tone];

  return (
    <button
      className={`inline-flex min-h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[8px] font-black uppercase leading-none transition hover:brightness-95 ${className}`}
      type="button"
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="text-sm font-bold text-zinc-700">{label}<input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-sm font-bold text-zinc-700">{label}<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function ModalActions({ onCancel, onConfirm, confirmLabel, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy: boolean }) {
  return <div className="flex justify-end gap-3"><button className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-600" type="button" onClick={onCancel}>Voltar</button><button className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Salvando...' : confirmLabel}</button></div>;
}

function Status({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="flex items-center justify-between rounded-2xl bg-zinc-50 p-4"><div className="flex items-center gap-3 text-zinc-500">{icon}<span className="font-bold">{label}</span></div><strong>{value}</strong></div>;
}

function Modal({ title, children, onClose, maxWidth = 'max-w-2xl' }: { title: string; children: ReactNode; onClose: () => void; maxWidth?: string }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className={`max-h-[92vh] w-full overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl ${maxWidth}`}><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-black text-zinc-950">{title}</h2><button className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</div></div>;
}
