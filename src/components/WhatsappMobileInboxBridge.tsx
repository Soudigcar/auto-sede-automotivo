'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowDownUp, Bot, CheckCircle2, ExternalLink, FileText, Loader2, Paperclip, RefreshCw, Send, UserCircle2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { WhatsappMobileInboxV2 } from '@/components/WhatsappMobileInboxV2';
import WhatsappCommerceActions from '@/components/WhatsappCommerceActions';
import MasterWhatsappCommerceActions from '@/components/MasterWhatsappCommerceActions';

const STORE_PATH = /^\/loja\/([^/]+)\/whatsapp\/?$/;
const MASTER_PATH = '/master/whatsapp/inbox';
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

function formatTime(value: any) {
  if (!value) return '--:--';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
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

function nameOf(conversation: any) {
  return conversation?.contact?.profile_name || conversation?.lead?.customer_name || conversation?.base_lead?.name || 'Cliente WhatsApp';
}

function phoneOf(conversation: any) {
  return conversation?.contact?.phone || conversation?.lead?.customer_phone || conversation?.base_lead?.phone || '';
}

function avatarOf(conversation: any) {
  const contact = conversation?.contact || {};
  const metadata = contact?.metadata || {};
  const conversationMetadata = conversation?.metadata || {};
  return String(contact?.profile_picture_url || contact?.profile_picture || contact?.avatar_url || contact?.photo_url || metadata?.profile_picture_url || metadata?.profilePictureUrl || metadata?.avatar_url || metadata?.photo_url || conversationMetadata?.profile_picture_url || conversationMetadata?.profilePictureUrl || '').trim();
}

function priorityOf(conversation: any) {
  const metadata = conversation?.metadata || {};
  const value = String(metadata?.priority || metadata?.urgency || '').trim().toLowerCase();
  const tags = Array.isArray(metadata?.tags) ? metadata.tags.map((tag: any) => String(tag || '').trim().toLowerCase()) : [];
  if (['urgent', 'urgente', 'critical', 'critico', 'crítico'].includes(value) || tags.some((tag: string) => ['urgent', 'urgente', 'critical'].includes(tag))) return 'urgent';
  if (['priority', 'prioridade', 'high', 'alta'].includes(value) || tags.some((tag: string) => ['priority', 'prioridade', 'high'].includes(tag))) return 'priority';
  return '';
}

function pipelineLeadId(conversation: any) {
  return String(conversation?.lead?.id || conversation?.lead_id || conversation?.base_lead?.routed_lead_id || '').trim();
}

function baseLeadId(conversation: any) {
  return String(conversation?.base_lead?.id || conversation?.base_lead_id || '').trim();
}

function pipelineStageValue(conversation: any) {
  return String(conversation?.lead?.status || '').trim();
}

function isEvolution(conversation: any) {
  return conversation?.number?.provider === 'evolution';
}

function connected(conversation: any) {
  if (!conversation) return false;
  if (isEvolution(conversation)) return conversation?.number?.integration_status === 'connected';
  return conversation?.number?.is_active !== false;
}

function channelLabel(conversation: any) {
  if (!conversation) return 'WhatsApp';
  if (isEvolution(conversation)) return conversation?.number?.integration_status === 'connected' ? 'Evolution conectada' : 'Evolution desconectada';
  return conversation?.number?.label || 'WhatsApp';
}

export function WhatsappMobileInboxBridge() {
  const pathname = usePathname() || '';
  const storeMatch = pathname.match(STORE_PATH);
  const mode: 'store' | 'master' | null = storeMatch ? 'store' : pathname === MASTER_PATH ? 'master' : null;
  const slug = storeMatch ? decodeURIComponent(storeMatch[1]) : '';
  const supabase = useMemo(() => createClient(), []);
  const [mobile, setMobile] = useState(false);
  const [store, setStore] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stageUpdating, setStageUpdating] = useState(false);
  const [autocarRuntime, setAutocarRuntime] = useState<any>(null);
  const [autocarCanTakeOver, setAutocarCanTakeOver] = useState(false);
  const [autocarLoading, setAutocarLoading] = useState(false);
  const [autocarAction, setAutocarAction] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState('');
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [attachmentSending, setAttachmentSending] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!attachmentFile || !attachmentFile.type.toLowerCase().startsWith('image/')) {
      setAttachmentPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(attachmentFile);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachmentFile]);

  useEffect(() => {
    setAttachmentFile(null);
    setAttachmentCaption('');
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  }, [selectedId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadAutocar(conversationId: string) {
    if (mode !== 'store' || !conversationId) {
      setAutocarRuntime(null);
      setAutocarCanTakeOver(false);
      return;
    }
    setAutocarLoading(true);
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const query = new URLSearchParams({ slug, conversation_id: conversationId });
      const response = await fetch(`/api/store/portal/autocar/runtime?${query.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'AUTOCAR indisponível.');
      setAutocarRuntime(result.runtime || null);
      setAutocarCanTakeOver(result.can_take_over === true);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Não foi possível consultar a AUTOCAR.');
      setAutocarRuntime(null);
      setAutocarCanTakeOver(false);
    } finally {
      setAutocarLoading(false);
    }
  }

  async function fetchInbox(conversationId?: string) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.');
    if (mode === 'store') {
      const query = new URLSearchParams({ slug });
      if (conversationId) query.set('conversation_id', conversationId);
      const response = await fetch(`/api/store-whatsapp?${query.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar WhatsApp.');
      return result;
    }
    const query = new URLSearchParams();
    if (conversationId) query.set('conversation_id', conversationId);
    const response = await fetch(`/api/master/whatsapp/inbox?${query.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar Inbox WhatsApp.');
    return result;
  }

  async function loadData(preferredId?: string, quiet = false) {
    if (!mode || !mobile) return;
    if (!quiet) setLoading(true);
    try {
      const first = await fetchInbox(preferredId || selectedId);
      if (mode === 'store') setStore(first.store || null);
      setConversations(first.conversations || []);
      const nextId = preferredId || selectedId || first.conversations?.[0]?.id || '';
      setSelectedId(nextId);
      if (nextId && !first.selected_conversation_id) {
        const second = await fetchInbox(nextId);
        setConversations(second.conversations || first.conversations || []);
        setMessages(second.messages || []);
      } else {
        setMessages(first.messages || []);
      }
      if (!quiet) setStatusMessage(first.conversations?.length ? '' : 'Nenhuma conversa recebida ainda.');
      if (mode === 'store') void loadAutocar(nextId);
    } catch (error: any) {
      if (!quiet) setStatusMessage(error?.message || 'Erro ao carregar conversas.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    if (!mode || !mobile) return;
    const requested = String(new URLSearchParams(window.location.search).get('conversation_id') || '').trim();
    void loadData(requested || undefined);
  }, [mode, mobile, slug]);

  useEffect(() => {
    if (!mode || !mobile) return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (mode === 'store' && detail.slug && detail.slug !== slug) return;
      void loadData(selectedId, true);
    };
    window.addEventListener('auto-controle:whatsapp-refresh', handleRefresh);
    const fallback = mode === 'master' ? window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadData(selectedId, true);
    }, 30_000) : null;
    return () => {
      window.removeEventListener('auto-controle:whatsapp-refresh', handleRefresh);
      if (fallback) window.clearInterval(fallback);
    };
  }, [mode, mobile, slug, selectedId]);

  const selectedConversation = useMemo(() => conversations.find((item) => item.id === selectedId) || null, [conversations, selectedId]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const searchable = `${nameOf(conversation)} ${phoneOf(conversation)} ${conversation.last_message || ''}`.toLowerCase();
      if (term && !searchable.includes(term)) return false;
      if (filter === 'unread') return Number(conversation.unread_count || 0) > 0;
      if (filter === 'priority') return Boolean(priorityOf(conversation));
      if (filter === 'leads') return Boolean(pipelineLeadId(conversation) || baseLeadId(conversation));
      if (filter === 'urgent') return priorityOf(conversation) === 'urgent';
      return true;
    });
  }, [conversations, filter, searchTerm]);

  async function selectConversation(id: string) {
    setSelectedId(id);
    await loadData(id);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageText.trim();
    if (!selectedId || !body || !connected(selectedConversation)) return;
    setSending(true);
    setStatusMessage('Enviando mensagem...');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');
      const response = await fetch('/api/whatsapp/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ conversation_id: selectedId, body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar mensagem.');
      setMessageText('');
      setStatusMessage('Mensagem enviada.');
      await loadData(selectedId, true);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function markRead() {
    if (!selectedId) return;
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const endpoint = mode === 'store' ? '/api/store-whatsapp' : '/api/master/whatsapp/inbox';
      const payload = mode === 'store' ? { action: 'mark-read', slug, conversation_id: selectedId } : { action: 'mark-read', conversation_id: selectedId };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível marcar como lida.');
      setStatusMessage('Conversa marcada como lida.');
      await loadData(selectedId, true);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao marcar conversa como lida.');
    }
  }

  async function changeStage(target: string) {
    if (!selectedConversation || !target || target === pipelineStageValue(selectedConversation)) return;
    const targetStage = pipelineStages.find((stage) => stage.key === target);
    const leadId = pipelineLeadId(selectedConversation);
    const targetSlug = mode === 'store' ? slug : String(selectedConversation?.store?.slug || '');
    if (!targetStage || !leadId || !targetSlug) return;
    if (targetStage.secureFlow) {
      setStatusMessage(`A etapa “${targetStage.label}” exige o fluxo seguro da Pipeline.`);
      return;
    }
    setStageUpdating(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/portal/pipeline/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ command: 'change_stage', slug: targetSlug, lead_id: leadId, target_status: target }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a etapa.');
      setStatusMessage(result.message || `Lead movido para ${targetStage.label}.`);
      await loadData(selectedId, true);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao alterar etapa.');
    } finally {
      setStageUpdating(false);
    }
  }

  async function assumeHuman() {
    if (mode !== 'store' || !selectedId || !autocarCanTakeOver || autocarAction) return;
    setAutocarAction(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/portal/autocar/runtime', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ slug, conversation_id: selectedId, action: 'human-active' }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível assumir esta conversa.');
      setAutocarRuntime(result.runtime || null);
      setStatusMessage('Atendimento humano assumido.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Não foi possível assumir esta conversa.');
    } finally {
      setAutocarAction(false);
    }
  }

  function resetAttachment() {
    setAttachmentFile(null);
    setAttachmentCaption('');
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  }

  function chooseAttachment(file: File | null) {
    if (!file || !selectedId) return;
    if (file.size > 4 * 1024 * 1024) {
      setStatusMessage('O anexo excede o limite de 4 MB desta etapa.');
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      return;
    }
    setAttachmentFile(file);
    setAttachmentCaption('');
    setStatusMessage('');
  }

  async function sendAttachment() {
    if (!attachmentFile || !selectedId || attachmentSending) return;
    setAttachmentSending(true);
    setStatusMessage('Enviando anexo...');
    try {
      const accessToken = await token();
      const form = new FormData();
      form.set('conversation_id', selectedId);
      form.set('file', attachmentFile);
      if (attachmentCaption.trim()) form.set('caption', attachmentCaption.trim());
      const response = await fetch('/api/whatsapp/messages/send-attachment', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o anexo.');
      setStatusMessage('Anexo enviado com sucesso.');
      resetAttachment();
      await loadData(selectedId, true);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao enviar anexo.');
    } finally {
      setAttachmentSending(false);
    }
  }

  if (!mode || !mobile) return null;

  const unreadCount = conversations.filter((conversation) => Number(conversation.unread_count || 0) > 0).length;
  const priorityCount = conversations.filter((conversation) => Boolean(priorityOf(conversation))).length;
  const leadCount = conversations.filter((conversation) => Boolean(pipelineLeadId(conversation) || baseLeadId(conversation))).length;
  const urgentCount = conversations.filter((conversation) => priorityOf(conversation) === 'urgent').length;
  const selectedLeadId = pipelineLeadId(selectedConversation);
  const selectedBaseLeadId = baseLeadId(selectedConversation);
  const targetStoreSlug = mode === 'store' ? slug : String(selectedConversation?.store?.slug || '');
  const autocarHumanActive = autocarRuntime?.human_state === 'human_active' || autocarRuntime?.human_state === 'paused';

  const detailsContent = selectedConversation ? (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">Telefone</p><p className="mt-1 break-words font-black text-zinc-800">{formatPhone(phoneOf(selectedConversation))}</p></div>
      <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">Canal</p><p className="mt-1 break-words font-black text-zinc-800">{channelLabel(selectedConversation)}</p></div>
      <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">Origem</p><p className="mt-1 break-words font-black text-zinc-800">{selectedConversation?.lead?.origin || selectedConversation?.base_lead?.source || 'WhatsApp'}</p></div>
      <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[9px] font-black uppercase text-zinc-400">Etapa</p><p className="mt-1 break-words font-black text-zinc-800">{pipelineStageValue(selectedConversation) || selectedConversation?.base_lead?.status || 'Sem etapa'}</p></div>
    </div>
  ) : null;

  const actionContent = selectedConversation ? (
    <div className="space-y-3">
      <input ref={attachmentInputRef} type="file" className="hidden" onChange={(event) => chooseAttachment(event.target.files?.[0] || null)} disabled={attachmentSending} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={attachmentSending} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-xs font-black text-zinc-700 disabled:opacity-50"><Paperclip size={15} /> Anexar</button>
        <button type="button" onClick={() => void markRead()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-xs font-black text-zinc-700"><CheckCircle2 size={15} /> Marcar lida</button>
      </div>

      {selectedLeadId && targetStoreSlug ? (
        <label className="relative flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-3"><span className="mr-2 text-[9px] font-black uppercase text-zinc-400">Etapa</span><select value={pipelineStageValue(selectedConversation)} onChange={(event) => void changeStage(event.target.value)} disabled={stageUpdating} className="min-w-0 flex-1 bg-transparent text-xs font-black text-zinc-700 outline-none">{pipelineStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}{stage.secureFlow ? ' • fluxo seguro' : ''}</option>)}</select><ArrowDownUp size={13} className="text-zinc-400" /></label>
      ) : null}

      {mode === 'store' ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-[9px] font-black uppercase text-zinc-400">AUTOCAR</p><p className="mt-1 truncate text-xs font-black text-zinc-800">{autocarLoading ? 'Consultando...' : autocarHumanActive ? 'Atendimento humano' : autocarRuntime?.human_state === 'autocar_active' ? 'AUTOCAR atendendo' : 'AUTOCAR aguardando'}</p></div>{!autocarHumanActive && autocarCanTakeOver ? <button type="button" onClick={() => void assumeHuman()} disabled={autocarAction || autocarLoading} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-amber-100 px-3 text-[10px] font-black text-amber-800">{autocarAction ? <RefreshCw size={13} className="animate-spin" /> : <UserCircle2 size={13} />} Assumir</button> : <Bot size={18} className="text-zinc-400" />}</div>
        </div>
      ) : null}

      {mode === 'store' ? <WhatsappCommerceActions slug={slug} conversationId={selectedId} leadId={selectedLeadId} onRefresh={() => loadData(selectedId, true)} onStatus={setStatusMessage} /> : <MasterWhatsappCommerceActions conversationId={selectedId} leadId={selectedLeadId} baseLeadId={selectedBaseLeadId} onRefresh={() => loadData(selectedId, true)} onStatus={setStatusMessage} />}

      <div className="grid grid-cols-2 gap-2">
        {targetStoreSlug ? <Link href={`/loja/${targetStoreSlug}/pipeline`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 text-center text-xs font-black text-white">Pipeline <ExternalLink size={14} /></Link> : null}
        {targetStoreSlug ? <Link href={`/loja/${targetStoreSlug}/calendario`} className="flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-center text-xs font-black text-zinc-700">Calendário</Link> : null}
      </div>

      {attachmentFile ? (
        <div className="fixed inset-0 z-[620] flex items-end bg-black/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !attachmentSending) resetAttachment(); }}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-600">WhatsApp</p><h3 className="mt-1 text-base font-black text-zinc-950">Confirmar envio</h3></div>
              <button type="button" onClick={resetAttachment} disabled={attachmentSending} aria-label="Cancelar anexo" className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500"><X size={17} /></button>
            </div>
            <div className="p-4">
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                {attachmentPreviewUrl ? <img src={attachmentPreviewUrl} alt="Prévia da imagem selecionada" className="max-h-[52vh] w-full bg-zinc-100 object-contain" /> : <div className="flex min-h-32 items-center justify-center text-red-600"><FileText size={34} /></div>}
                <div className="p-3"><p className="truncate text-sm font-black text-zinc-900">{attachmentPreviewUrl ? 'Imagem pronta para enviar' : attachmentFile.name}</p><p className="mt-1 text-[10px] font-black uppercase text-zinc-400">{attachmentFile.type || 'arquivo'} · {Math.max(1, Math.ceil(attachmentFile.size / 1024))} KB</p></div>
              </div>
              {!attachmentFile.type.toLowerCase().startsWith('audio/') ? <label className="mt-3 block text-xs font-black text-zinc-600">Legenda opcional<textarea value={attachmentCaption} onChange={(event) => setAttachmentCaption(event.target.value)} maxLength={2000} placeholder="Digite uma legenda..." disabled={attachmentSending} className="mt-2 min-h-20 w-full resize-none rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-red-300" /></label> : null}
              <button type="button" onClick={() => void sendAttachment()} disabled={attachmentSending} aria-busy={attachmentSending} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase text-white disabled:opacity-50">{attachmentSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{attachmentSending ? 'Enviando para o WhatsApp...' : attachmentPreviewUrl ? 'Enviar imagem' : 'Enviar anexo'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <WhatsappMobileInboxV2
      title={mode === 'master' ? 'Inbox WhatsApp' : 'WhatsApp CRM'}
      subtitle={mode === 'master' ? 'Central Master' : (store?.store_name || 'Atendimento da loja')}
      conversations={filtered}
      messages={messages}
      selectedId={selectedId}
      selectedConversation={selectedConversation}
      loading={loading}
      sending={sending}
      statusMessage={statusMessage}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      filters={mode === 'master' ? [{ key: 'all', label: 'Todas', count: conversations.length }, { key: 'unread', label: 'Não lidas', count: unreadCount }, { key: 'priority', label: 'Prioridade', count: priorityCount }, { key: 'leads', label: 'Leads', count: leadCount }, { key: 'urgent', label: 'Urgentes', count: urgentCount }] : [{ key: 'all', label: 'Todas', count: conversations.length }, { key: 'unread', label: 'Não lidas', count: unreadCount }, { key: 'priority', label: 'Prioridade', count: priorityCount }, { key: 'leads', label: 'Leads', count: leadCount }]}
      activeFilter={filter}
      onFilterChange={setFilter}
      onSelectConversation={selectConversation}
      onRefresh={() => loadData(selectedId)}
      messageText={messageText}
      onMessageTextChange={setMessageText}
      onSubmit={sendMessage}
      canSend={connected(selectedConversation)}
      sendBlockedReason={!connected(selectedConversation) && selectedConversation ? `Envio temporariamente bloqueado: ${channelLabel(selectedConversation)}.` : ''}
      getName={nameOf}
      getPhone={(conversation) => formatPhone(phoneOf(conversation))}
      getAvatarUrl={avatarOf}
      getLastMessage={(conversation) => String(conversation?.last_message || '')}
      getTime={(item) => formatTime(item?.last_message_at || item?.sent_at || item?.created_at)}
      getUnread={(conversation) => Number(conversation?.unread_count || 0)}
      channelLabel={channelLabel(selectedConversation)}
      detailsContent={detailsContent}
      actionContent={actionContent}
    />
  );
}
