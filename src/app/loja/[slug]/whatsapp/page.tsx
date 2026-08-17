'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Filter,
  Inbox,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  Store,
  UserCircle2,
  UsersRound,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import WhatsappCommerceActions from '@/components/WhatsappCommerceActions';
import { WhatsappAttachmentButton } from '@/components/WhatsappAttachmentButton';
import { WhatsappMediaMessage } from '@/components/WhatsappMediaMessage';

const pipelineStages = [
  { key: 'new_lead', label: 'Novo Lead Recebido', secureFlow: false },
  { key: 'in_service', label: 'Em Atendimento', secureFlow: false },
  { key: 'scheduled', label: 'Agendado', secureFlow: true },
  { key: 'appointment_cancelled', label: 'Cancelou Agendamento', secureFlow: true },
  { key: 'no_show', label: 'Não Compareceu', secureFlow: false },
  { key: 'showed_up', label: 'Compareceu', secureFlow: false },
  { key: 'sale_confirmed', label: 'Venda Confirmada', secureFlow: true },
  { key: 'lost', label: 'Perdido', secureFlow: true }
] as const;

function formatDateTime(value: any) {
  if (!value) return 'Sem horário';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return 'Sem horário';
  }
}

function formatTime(value: any) {
  if (!value) return '--:--';
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '--:--';
  }
}

function formatPhone(value: any) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 'Sem telefone';
  if (digits.length >= 12) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, -4)}-${digits.slice(-4)}`;
  if (digits.length >= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}`;
  return digits;
}

function initials(value: any) {
  const parts = String(value || 'Cliente').split(' ').map((part) => part.trim()).filter(Boolean);
  return ((parts[0]?.[0] || 'C') + (parts[1]?.[0] || '')).toUpperCase();
}

function conversationName(conversation: any) {
  return conversation?.contact?.profile_name || conversation?.lead?.customer_name || conversation?.base_lead?.name || 'Cliente WhatsApp';
}

function conversationPhone(conversation: any) {
  return conversation?.contact?.phone || conversation?.lead?.customer_phone || conversation?.base_lead?.phone || '';
}

function conversationPicture(conversation: any) {
  const contact = conversation?.contact || {};
  const metadata = contact?.metadata || {};
  return String(
    contact?.profile_picture_url ||
    contact?.profile_picture ||
    contact?.avatar_url ||
    contact?.photo_url ||
    metadata?.profile_picture_url ||
    metadata?.profilePictureUrl ||
    metadata?.avatar_url ||
    metadata?.photo_url ||
    ''
  ).trim();
}

function leadStatusLabel(status: any) {
  const labels: Record<string, string> = {
    new_lead: 'Novo Lead',
    in_service: 'Em Atendimento',
    scheduled: 'Agendado',
    appointment_cancelled: 'Cancelou Agendamento',
    no_show: 'Não Compareceu',
    showed_up: 'Compareceu',
    sale_confirmed: 'Venda Confirmada',
    lost: 'Perdido'
  };
  return labels[String(status || '')] || String(status || 'Novo Lead');
}

function selectedLeadName(conversation: any) {
  return conversation?.lead?.customer_name || conversation?.base_lead?.name || conversationName(conversation);
}

function pipelineLeadId(conversation: any) {
  return String(conversation?.lead?.id || conversation?.lead_id || '').trim();
}

function pipelineStageValue(conversation: any) {
  return String(conversation?.lead?.status || '').trim();
}

function conversationPriority(conversation: any) {
  const metadata = conversation?.metadata || {};
  const value = String(metadata?.priority || metadata?.urgency || '').trim().toLowerCase();
  const tags = Array.isArray(metadata?.tags) ? metadata.tags.map((tag: any) => String(tag || '').trim().toLowerCase()) : [];
  if (['urgent', 'urgente', 'critical', 'critico', 'crítico'].includes(value) || tags.some((tag: string) => ['urgent', 'urgente', 'critical'].includes(tag))) return 'urgent';
  if (['priority', 'prioridade', 'high', 'alta'].includes(value) || tags.some((tag: string) => ['priority', 'prioridade', 'high'].includes(tag))) return 'priority';
  return '';
}

function isEvolutionConversation(conversation: any) {
  return conversation?.number?.provider === 'evolution';
}

function channelConnected(conversation: any) {
  if (isEvolutionConversation(conversation)) return conversation?.number?.integration_status === 'connected';
  return Boolean(conversation?.number?.is_active);
}

function channelStatus(conversation: any) {
  if (isEvolutionConversation(conversation)) {
    const status = String(conversation?.number?.integration_status || '').toLowerCase();
    if (status === 'connected') return 'Evolution conectada';
    if (status === 'qrcode') return 'Aguardando QR Code';
    if (status === 'connecting') return 'Evolution conectando';
    return 'Evolution desconectada';
  }
  return conversation?.number?.is_active ? 'WhatsApp ativo' : 'WhatsApp desconectado';
}

export default function StoreWhatsappPage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Carregando conversas WhatsApp...');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stageUpdating, setStageUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'leads' | 'priority'>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return '';
    }
    return data.session.access_token;
  }

  async function fetchInbox(conversationId?: string) {
    const token = await getAuthToken();
    if (!token) return null;
    const params = new URLSearchParams({ slug });
    if (conversationId) params.set('conversation_id', conversationId);
    const response = await fetch(`/api/store-whatsapp?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar WhatsApp.');
    return result;
  }

  async function loadData(preferredConversationId?: string) {
    setLoading(true);
    try {
      const firstResult = await fetchInbox(preferredConversationId || selectedId);
      if (!firstResult) return;
      setStore(firstResult.store);
      setConversations(firstResult.conversations || []);
      const nextSelectedId = preferredConversationId || selectedId || firstResult.conversations?.[0]?.id || '';
      setSelectedId(nextSelectedId);
      if (nextSelectedId && !firstResult.selected_conversation_id) {
        const secondResult = await fetchInbox(nextSelectedId);
        if (secondResult) {
          setConversations(secondResult.conversations || []);
          setMessages(secondResult.messages || []);
        }
      } else {
        setMessages(firstResult.messages || []);
      }
      setStatusMessage(firstResult.conversations?.length ? '' : 'Nenhuma conversa recebida ainda.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao carregar conversas.');
    }
    setLoading(false);
  }

  async function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    setDetailsOpen(false);
    await loadData(conversationId);
  }

  async function markSelectedAsRead() {
    if (!selectedId) return;
    const token = await getAuthToken();
    if (!token) return;
    setStatusMessage('Marcando conversa como lida...');
    try {
      const response = await fetch('/api/store-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark-read', slug, conversation_id: selectedId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível marcar como lida.');
      setStatusMessage('Conversa marcada como lida.');
      await loadData(selectedId);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao marcar conversa como lida.');
    }
  }

  async function changePipelineStage(targetStatus: string) {
    if (!selectedConversation || !targetStatus) return;
    const currentStatus = pipelineStageValue(selectedConversation);
    if (currentStatus === targetStatus) return;
    const targetStage = pipelineStages.find((item) => item.key === targetStatus);
    if (!targetStage) return;
    const leadId = pipelineLeadId(selectedConversation);
    if (!leadId) {
      setStatusMessage('Esta conversa ainda não possui lead vinculado à Pipeline.');
      return;
    }
    if (targetStage.secureFlow) {
      setStatusMessage(`A etapa “${targetStage.label}” exige o fluxo seguro da Pipeline. Abra a Pipeline para concluir essa movimentação.`);
      return;
    }
    setStageUpdating(true);
    setStatusMessage(`Movendo lead para ${targetStage.label}...`);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const response = await fetch('/api/store/portal/pipeline/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: 'change_stage', slug, lead_id: leadId, target_status: targetStatus })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a etapa da Pipeline.');
      setStatusMessage(result.message || `Lead movido para ${targetStage.label}.`);
      await loadData(selectedId);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao alterar a etapa da Pipeline.');
    } finally {
      setStageUpdating(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageText.trim();
    if (!selectedId || !body) return;
    setSending(true);
    setStatusMessage('Enviando mensagem...');
    try {
      const token = await getAuthToken();
      if (!token) return;
      const response = await fetch('/api/whatsapp/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: selectedId, body })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar mensagem.');
      setMessageText('');
      setStatusMessage('Mensagem enviada.');
      await loadData(selectedId);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao enviar mensagem.');
    }
    setSending(false);
  }

  useEffect(() => { loadData(); }, [slug]);

  const selectedConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) || null, [conversations, selectedId]);

  const stats = useMemo(() => {
    const unread = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    const active = conversations.filter((item) => item.status === 'open').length;
    const leads = conversations.filter((item) => item.lead_id || item.base_lead_id).length;
    return { total: conversations.length, unread, active, leads };
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const name = conversationName(conversation).toLowerCase();
      const phone = conversationPhone(conversation).toLowerCase();
      const lastMessage = String(conversation.last_message || '').toLowerCase();
      const matchesSearch = !term || name.includes(term) || phone.includes(term) || lastMessage.includes(term);
      if (!matchesSearch) return false;
      if (filter === 'unread') return Number(conversation.unread_count || 0) > 0;
      if (filter === 'leads') return Boolean(conversation.lead_id || conversation.base_lead_id);
      if (filter === 'priority') return Boolean(conversationPriority(conversation));
      return true;
    });
  }, [conversations, filter, searchTerm]);

  const selectedPhone = conversationPhone(selectedConversation);
  const selectedName = selectedLeadName(selectedConversation);

  if (statusMessage && !store && loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{statusMessage}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen lg:h-screen lg:overflow-hidden">
        <button
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          className="fixed top-8 z-[300] hidden h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow-2xl shadow-black/30 transition hover:scale-105 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 lg:flex"
          style={{ left: sidebarCollapsed ? 76 : 288 }}
          aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          data-sidebar-toggle="true"
        >
          {sidebarCollapsed ? <ChevronRight size={20} strokeWidth={3} /> : <ChevronLeft size={20} strokeWidth={3} />}
        </button>

        <aside className={`relative hidden shrink-0 bg-[#071020] py-7 text-white transition-all duration-200 lg:block lg:h-screen lg:overflow-y-auto ${sidebarCollapsed ? 'w-[76px] px-3' : 'w-72 px-6'}`}>
          <div className={`flex min-w-0 items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            {!sidebarCollapsed ? <div className="min-w-0 pr-12"><p className="truncate text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div> : null}
          </div>

          {!sidebarCollapsed ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Área operacional</p>
              <p className="mt-2 font-bold">{store?.store_name || 'Loja'}</p>
              <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
            </div>
          ) : null}

          <nav className={`${sidebarCollapsed ? 'mt-8' : 'mt-7'} space-y-2 text-sm`}>
            <Link href={`/loja/${slug}`} title="Início" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><Store size={18} />{!sidebarCollapsed ? <span>Início</span> : null}</Link>
            <Link href={`/loja/${slug}/minha-loja`} title="Minha Loja" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><Store size={18} />{!sidebarCollapsed ? <span>Minha Loja</span> : null}</Link>
            <Link href={`/loja/${slug}/pipeline`} title="Pipeline" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><BarChart3 size={18} />{!sidebarCollapsed ? <span>Pipeline</span> : null}</Link>
            <Link href={`/loja/${slug}/whatsapp`} title="WhatsApp CRM" className={`flex items-center rounded-2xl bg-red-600 py-3.5 font-bold shadow-lg shadow-red-600/20 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><MessageCircle size={18} />{!sidebarCollapsed ? <span>WhatsApp CRM</span> : null}</Link>
            <Link href={`/loja/${slug}/calendario`} title="Calendário" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><CalendarDays size={18} />{!sidebarCollapsed ? <span>Calendário</span> : null}</Link>
            <Link href={`/loja/${slug}/estoque`} title="Estoque" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><Package size={18} />{!sidebarCollapsed ? <span>Estoque</span> : null}</Link>
            <Link href={`/loja/${slug}/operacao`} title="Operação" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><ClipboardList size={18} />{!sidebarCollapsed ? <span>Operação</span> : null}</Link>
            <Link href="/logout" title="Sair" className={`flex items-center rounded-2xl py-3.5 text-zinc-400 hover:bg-white/5 hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}><LogOut size={18} />{!sidebarCollapsed ? <span>Sair</span> : null}</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-2.5 md:p-3 xl:p-3 lg:h-screen lg:overflow-hidden">
          <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Resumo do Inbox WhatsApp">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
              <InboxMetric label="Conversas" value={stats.total} helper="na fila" icon={<MessagesSquare size={15} />} />
              <InboxMetric label="Não lidas" value={stats.unread} helper="pendentes" icon={<Inbox size={15} />} accent="red" />
              <InboxMetric label="Em atendimento" value={stats.active} helper="abertas" icon={<UsersRound size={15} />} accent="green" />
              <InboxMetric label="Leads" value={stats.leads} helper="vinculados" icon={<UserCircle2 size={15} />} accent="blue" />
              <button className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700 disabled:opacity-60" type="button" onClick={() => loadData(selectedId)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
            </div>
          </div>

          {statusMessage ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700"><CircleAlert size={15} className="shrink-0" /><span>{statusMessage}</span></div> : null}

          <section className="relative mt-2 overflow-hidden rounded-[22px] border border-zinc-200 bg-white shadow-sm">
            <div className="grid min-h-[680px] xl:h-[calc(100dvh-82px)] xl:min-h-0 xl:grid-cols-[360px_minmax(620px,1fr)] 2xl:grid-cols-[390px_minmax(760px,1fr)]">
              <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">Fila de atendimento</p><h2 className="mt-1 text-lg font-black text-zinc-950">Conversas</h2></div><span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-black text-zinc-600">{filteredConversations.length}</span></div>
                  <div className="mt-4 flex min-w-0 gap-1 overflow-x-auto rounded-2xl bg-zinc-100 p-1 text-[10px] font-black">
                    <button className={`shrink-0 rounded-xl px-3 py-2.5 transition ${filter === 'all' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`} type="button" onClick={() => setFilter('all')}>Todas</button>
                    <button className={`shrink-0 rounded-xl px-3 py-2.5 transition ${filter === 'unread' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`} type="button" onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}>Não lidas</button>
                    <button className={`shrink-0 rounded-xl px-3 py-2.5 transition ${filter === 'priority' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`} type="button" onClick={() => setFilter(filter === 'priority' ? 'all' : 'priority')}>Prioridade</button>
                    <button className={`shrink-0 rounded-xl px-3 py-2.5 transition ${filter === 'leads' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500'}`} type="button" onClick={() => setFilter(filter === 'leads' ? 'all' : 'leads')}>Leads</button>
                  </div>
                  <div className="relative mt-3"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} /><input className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-11 text-xs font-bold text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-red-300 focus:bg-white" placeholder="Buscar conversa, telefone..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /><span className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-400"><Filter size={14} /></span></div>
                  <div className="mt-3 flex items-center gap-1 overflow-x-auto text-[9px] font-black text-zinc-500"><span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1.5 text-red-600">Todas as mensagens</span><span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1.5">Messenger</span><span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1.5">Instagram</span><span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1.5 text-emerald-700">WhatsApp</span></div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {filteredConversations.map((conversation) => {
                    const isSelected = conversation.id === selectedId;
                    const name = conversationName(conversation);
                    const phone = conversationPhone(conversation);
                    const unread = Number(conversation.unread_count || 0);
                    const hasLead = Boolean(conversation.lead_id || conversation.base_lead_id);
                    const pipelineStage = String(conversation.lead?.status || conversation.base_lead?.status || '').trim();
                    return (
                      <button key={conversation.id} className={`group block w-full border-b border-zinc-100 px-3 py-3 text-left transition ${isSelected ? 'bg-red-50/70' : 'bg-white hover:bg-zinc-50'}`} type="button" onClick={() => selectConversation(conversation.id)}>
                        <div className={`rounded-2xl border p-3 transition ${isSelected ? 'border-red-200 bg-white shadow-sm' : 'border-transparent group-hover:border-zinc-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black ${isSelected ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{initials(name)}<span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white"><MessageCircle size={8} /></span></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-zinc-950">{name}</h3><p className="mt-0.5 truncate text-[11px] font-bold text-zinc-500">{formatPhone(phone)}</p></div><span className="shrink-0 text-[10px] font-bold text-zinc-400">{formatTime(conversation.last_message_at)}</span></div>
                              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-zinc-600">{conversation.last_message || 'Sem mensagem'}</p>
                              {conversation.lead?.interested_vehicle ? <p className="mt-2 flex items-center gap-1.5 truncate text-[10px] font-black text-zinc-700"><Car size={12} className="shrink-0 text-red-500" /> {conversation.lead.interested_vehicle}</p> : null}
                              <div className="mt-2.5 flex items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1.5"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">WhatsApp</span>{hasLead ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead</span> : null}{hasLead && pipelineStage ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase text-amber-700">{leadStatusLabel(pipelineStage)}</span> : null}</div>{unread ? <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white">{unread}</span> : null}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {!filteredConversations.length ? <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center"><Inbox size={36} className="text-zinc-300" /><p className="mt-3 text-sm font-black text-zinc-700">Nenhuma conversa encontrada</p><p className="mt-1 max-w-56 text-xs font-bold leading-relaxed text-zinc-400">Ajuste os filtros ou aguarde uma nova mensagem do WhatsApp.</p></div> : null}
                </div>
              </aside>

              <section className="flex min-h-0 flex-col overflow-hidden bg-[#f5f6f8]">
                {selectedConversation ? (
                  <>
                    <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3">
                      <div className="flex flex-col gap-2.5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <button
                            type="button"
                            onClick={() => setDetailsOpen((current) => !current)}
                            className="group flex min-w-0 items-center gap-3 rounded-xl text-left outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-red-100"
                            aria-expanded={detailsOpen}
                            title={detailsOpen ? 'Fechar detalhes do lead' : 'Abrir detalhes do lead'}
                          >
                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-700 transition group-hover:bg-red-50 group-hover:text-red-600">{initials(conversationName(selectedConversation))}<span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" /></div>
                            <div className="min-w-0 pr-2">
                              <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black text-zinc-950 group-hover:text-red-600">{conversationName(selectedConversation)}</h2>{selectedConversation.lead_id || selectedConversation.base_lead_id ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead</span> : null}</div>
                              <p className="mt-0.5 text-xs font-bold text-zinc-500">{formatPhone(conversationPhone(selectedConversation))}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-zinc-400"><span>{selectedConversation.lead?.origin || selectedConversation.base_lead?.source || 'WhatsApp'}</span><span>•</span><span>{store?.store_name || 'Loja'}</span><span>•</span><span>{pipelineLeadId(selectedConversation) ? leadStatusLabel(pipelineStageValue(selectedConversation)) : 'Sem etapa na Pipeline'}</span></div>
                            </div>
                          </button>
                          <span className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase ${channelConnected(selectedConversation) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}><MessageCircle size={14} /> {channelStatus(selectedConversation)}</span>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto border-t border-zinc-100 pt-2.5">
                          <button className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[10px] font-black uppercase text-zinc-600 transition hover:border-red-200 hover:text-red-600" type="button" onClick={markSelectedAsRead} title="Marcar como lida"><CheckCircle2 size={13} /> Marcar como lida</button>

                          <label className="relative inline-flex h-9 w-[235px] shrink-0 items-center rounded-lg border border-zinc-200 bg-white">
                            <span className="pointer-events-none absolute left-3 text-[9px] font-black uppercase tracking-wide text-zinc-400">Etapa</span>
                            <select className="h-full w-full appearance-none rounded-lg bg-transparent pl-14 pr-8 text-[10px] font-black uppercase text-zinc-700 outline-none transition focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50" value={pipelineStageValue(selectedConversation)} onChange={(event) => void changePipelineStage(event.target.value)} disabled={stageUpdating || !pipelineLeadId(selectedConversation)} aria-label="Alterar etapa da Pipeline">
                              {!pipelineStageValue(selectedConversation) ? <option value="">Sem etapa</option> : null}
                              {pipelineStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}{stage.secureFlow ? ' • fluxo seguro' : ''}</option>)}
                            </select>
                            <ArrowDownUp className="pointer-events-none absolute right-3 text-zinc-400" size={13} />
                          </label>

                          <Link href={`/loja/${slug}/pipeline`} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[10px] font-black uppercase text-zinc-600 transition hover:border-red-200 hover:text-red-600"><ArrowUpRight size={13} /> Abrir Pipeline</Link>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f2f4f7] p-3 md:p-4">
                      <div className="mx-auto mb-3 w-fit rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 shadow-sm">Histórico da conversa</div>
                      {messages.map((message) => {
                        const outbound = message.direction === 'outbound';
                        const avatarUrl = outbound ? '' : conversationPicture(selectedConversation);
                        const avatarName = outbound ? String(store?.store_name || 'Loja') : conversationName(selectedConversation);
                        return (
                          <div key={message.id} className={`flex items-end gap-1.5 ${outbound ? 'justify-end' : 'justify-start'}`}>
                            {!outbound ? (
                              <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-zinc-200 text-[9px] font-black text-zinc-600 shadow-sm" title={avatarName}>
                                {avatarUrl ? <img src={avatarUrl} alt={avatarName} className="h-full w-full object-cover" /> : initials(avatarName)}
                              </span>
                            ) : null}
                            <div className={`w-fit min-w-0 max-w-[78%] rounded-[14px] px-3 py-2 shadow-sm md:max-w-[64%] ${outbound ? 'rounded-br-[4px] bg-red-600 text-white' : 'rounded-bl-[4px] border border-zinc-200 bg-white text-zinc-900'}`}>
                              <WhatsappMediaMessage message={message} outbound={outbound} compact />
                              <div className={`mt-1 flex items-center justify-end gap-1.5 text-[8px] font-black uppercase leading-none ${outbound ? 'text-white/65' : 'text-zinc-400'}`}>
                                <span>{formatDateTime(message.sent_at || message.created_at)}</span>
                                <span>{message.status}</span>
                              </div>
                            </div>
                            {outbound ? (
                              <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-[9px] font-black text-red-700 shadow-sm" title={avatarName}>
                                {initials(avatarName)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                      {!messages.length ? <div className="flex h-full min-h-40 items-center justify-center p-6 text-center"><div><MessageCircle size={36} className="mx-auto text-zinc-300" /><p className="mt-3 text-sm font-black text-zinc-700">Nenhuma mensagem carregada</p><p className="mt-1 text-xs font-bold text-zinc-400">O histórico da conversa aparecerá aqui.</p></div></div> : null}
                    </div>

                    <form onSubmit={sendMessage} className="shrink-0 border-t border-zinc-200 bg-white p-2.5">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2 transition focus-within:border-red-300 focus-within:bg-white">
                        <textarea className="min-h-16 w-full resize-none bg-transparent px-2 py-2 text-sm font-semibold text-zinc-800 outline-none placeholder:text-zinc-400" placeholder="Digite sua mensagem..." value={messageText} onChange={(event) => setMessageText(event.target.value)} disabled={sending} />
                        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
                            <p className="px-2 text-[10px] font-bold leading-relaxed text-zinc-400">Janela de 24h: fora dela, a Meta pode exigir template aprovado.</p>
                            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                              <WhatsappAttachmentButton conversationId={selectedId} onRefresh={() => loadData(selectedId)} onStatus={setStatusMessage} />
                              <WhatsappCommerceActions slug={slug} conversationId={selectedId} leadId={pipelineLeadId(selectedConversation)} onRefresh={() => loadData(selectedId)} onStatus={setStatusMessage} />
                            </div>
                          </div>
                          <button className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={sending || !messageText.trim() || !channelConnected(selectedConversation)}><Send size={16} /> {sending ? 'Enviando...' : 'Enviar'}</button>
                        </div>
                      </div>
                    </form>
                  </>
                ) : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><UserCircle2 size={54} className="text-zinc-300" /><h2 className="mt-4 text-2xl font-black text-zinc-950">Selecione uma conversa</h2><p className="mt-2 max-w-md text-sm font-bold text-zinc-500">Assim que uma mensagem chegar, a conversa e todo o contexto comercial aparecerão aqui.</p></div>}
              </section>
            </div>

            {detailsOpen && selectedConversation ? (
              <aside className="absolute inset-y-0 right-0 z-30 w-[360px] max-w-[calc(100%-1rem)] overflow-auto border-l border-zinc-200 bg-[#fafafa] p-3.5 shadow-2xl">
                <div className="space-y-3">
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-black text-red-600">{initials(selectedName)}<span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" /></div>
                      <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">Detalhes do contato</p><h3 className="mt-1 truncate text-base font-black text-zinc-950">{selectedName}</h3><p className="mt-1 text-xs font-bold text-zinc-500">{formatPhone(selectedPhone)}</p></div>
                      <button type="button" onClick={() => setDetailsOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700" aria-label="Fechar detalhes do lead" title="Fechar detalhes"><X size={15} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">WhatsApp</span>{selectedConversation.lead_id || selectedConversation.base_lead_id ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead vinculado</span> : null}</div>
                  </section>
                  <DetailCard title="Contato e canal"><DetailRow label="Telefone" value={formatPhone(selectedPhone)} icon={<Phone size={14} />} /><DetailRow label="Número central" value={selectedConversation.number?.phone_number || selectedConversation.number?.label || 'WhatsApp Oficial'} icon={<MessageCircle size={14} />} /><DetailRow label="Loja" value={store?.store_name || 'Loja vinculada'} icon={<Store size={14} />} /></DetailCard>
                  <DetailCard title="Lead e distribuição"><DetailRow label="Estágio atual" value={leadStatusLabel(selectedConversation.lead?.status || selectedConversation.base_lead?.status)} /><DetailRow label="Carro de interesse" value={selectedConversation.lead?.interested_vehicle || 'Não informado'} /><DetailRow label="Origem" value={selectedConversation.lead?.origin || selectedConversation.base_lead?.source || 'WhatsApp Oficial'} /><DetailRow label="Campanha" value={selectedConversation.base_lead?.campaign_name || selectedConversation.number?.label || 'WhatsApp Oficial'} /><DetailRow label="Última mensagem" value={formatDateTime(selectedConversation.last_message_at)} /></DetailCard>
                  <DetailCard title="Ações rápidas"><div className="grid gap-2"><Link href={`/loja/${slug}/pipeline`} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700">Abrir Pipeline <ArrowUpRight size={15} /></Link><Link href={`/loja/${slug}/calendario`} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black text-zinc-700 transition hover:border-red-200 hover:text-red-600">Ver calendário <CalendarDays size={15} /></Link></div></DetailCard>
                </div>
              </aside>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function InboxMetric({ label, value, helper, icon, accent = 'zinc' }: { label: string; value: number; helper: string; icon: React.ReactNode; accent?: 'zinc' | 'red' | 'green' | 'blue' }) {
  const tones = { zinc: 'bg-zinc-50 text-zinc-500', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600' };
  return <div className="flex h-[46px] min-w-0 items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[accent]}`}>{icon}</span><div className="min-w-0"><p className="truncate text-[8px] font-black uppercase tracking-wide text-zinc-400">{label}</p><div className="mt-0.5 flex min-w-0 items-baseline gap-1.5"><strong className="text-base font-black leading-none text-zinc-950">{value}</strong><span className="truncate text-[8px] font-bold text-zinc-400">{helper}</span></div></div></div>;
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{title}</h4><div className="mt-3 grid gap-3">{children}</div></section>;
}

function DetailRow({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  return <div><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-1 flex items-center gap-2 break-words text-xs font-black leading-relaxed text-zinc-900">{icon}{value || 'Não informado'}</p></div>;
}
