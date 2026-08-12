'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  ExternalLink,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCircle2,
  UsersRound,
  Wifi
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

function formatDateTime(value: any) {
  if (!value) return 'Sem horário';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return 'Sem horário';
  }
}

function formatFullDateTime(value: any) {
  if (!value) return 'Sem data';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return 'Sem data';
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
  const parts = String(value || 'Cliente')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  return ((parts[0]?.[0] || 'C') + (parts[1]?.[0] || '')).toUpperCase();
}

function conversationName(conversation: any) {
  return conversation?.contact?.profile_name || conversation?.lead?.customer_name || conversation?.base_lead?.name || 'Cliente WhatsApp';
}

function conversationPhone(conversation: any) {
  return conversation?.contact?.phone || conversation?.lead?.customer_phone || conversation?.base_lead?.phone || '';
}

function assignedStoreName(conversation: any) {
  return conversation?.store?.store_name || conversation?.base_lead?.assigned_store_name || 'Ainda não direcionado';
}

function pipelineHref(conversation: any) {
  const slug = conversation?.store?.slug;
  if (!slug) return '';
  return `/loja/${slug}/pipeline`;
}

function isEvolutionConversation(conversation: any) {
  return conversation?.number?.provider === 'evolution';
}

function channelStatus(conversation: any) {
  if (!isEvolutionConversation(conversation)) return 'Meta Cloud';
  return conversation?.number?.integration_status === 'connected' ? 'Evolution conectada' : 'Evolution desconectada';
}

function conversationOrigin(conversation: any) {
  return conversation?.lead?.origin || conversation?.base_lead?.source || (isEvolutionConversation(conversation) ? 'WhatsApp Evolution' : 'WhatsApp Oficial');
}

export default function MasterWhatsappInboxPage() {
  const supabase = createClient();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyLeads, setOnlyLeads] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Carregando Inbox WhatsApp...');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function fetchInbox(conversationId?: string) {
    const token = await getAuthToken();

    if (!token) {
      setStatusMessage('Sessão expirada. Faça login novamente.');
      return null;
    }

    const params = new URLSearchParams();
    if (conversationId) params.set('conversation_id', conversationId);

    const response = await fetch(`/api/master/whatsapp/inbox?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível carregar Inbox WhatsApp.');
    }

    return result;
  }

  async function loadData(preferredConversationId?: string) {
    setLoading(true);

    try {
      const firstResult = await fetchInbox(preferredConversationId || selectedId);
      if (!firstResult) return;

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

      setStatusMessage(firstResult.conversations?.length ? '' : 'Nenhuma mensagem recebida no WhatsApp central ainda.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao carregar Inbox WhatsApp.');
    }

    setLoading(false);
  }

  async function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    await loadData(conversationId);
  }

  async function markRead(conversationId = selectedId) {
    const token = await getAuthToken();
    if (!token || !conversationId) return;

    const response = await fetch('/api/master/whatsapp/inbox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'mark-read', conversation_id: conversationId })
    });

    const result = await response.json();

    if (!response.ok) {
      setStatusMessage(result.error || 'Não foi possível marcar como lida.');
      return;
    }

    await loadData(conversationId);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          conversation_id: selectedId,
          body
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível enviar mensagem.');
      }

      setMessageText('');
      setStatusMessage('Mensagem enviada.');
      await loadData(selectedId);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao enviar mensagem.');
    }

    setSending(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === selectedId) || null;
  }, [conversations, selectedId]);

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const name = conversationName(conversation).toLowerCase();
      const phone = conversationPhone(conversation).toLowerCase();
      const lastMessage = String(conversation.last_message || '').toLowerCase();
      const storeName = assignedStoreName(conversation).toLowerCase();
      const matchesTerm = !term || name.includes(term) || phone.includes(term) || lastMessage.includes(term) || storeName.includes(term);
      const matchesUnread = !onlyUnread || Number(conversation.unread_count || 0) > 0;
      const matchesLead = !onlyLeads || Boolean(conversation.lead?.id || conversation.base_lead?.id);

      return matchesTerm && matchesUnread && matchesLead;
    });
  }, [conversations, searchTerm, onlyUnread, onlyLeads]);

  const stats = useMemo(() => {
    const unread = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    const unreadConversations = conversations.filter((item) => Number(item.unread_count || 0) > 0).length;
    const withLead = conversations.filter((item) => item.lead?.id || item.base_lead?.id).length;
    const connectedChannels = new Set(
      conversations
        .filter((item) => !isEvolutionConversation(item) || item.number?.integration_status === 'connected')
        .map((item) => item.number?.id || item.number?.label || item.number?.phone_number || 'central')
    ).size;

    return {
      total: conversations.length,
      unread,
      unreadConversations,
      withLead,
      connectedChannels
    };
  }, [conversations]);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Inbox WhatsApp" />

        <div className="premium-canvas min-w-0 flex-1 p-3 md:p-5 xl:p-6">
          <header className="rounded-[26px] border border-zinc-200 bg-white px-4 py-4 shadow-sm md:px-5">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <MessageCircle size={23} />
                  </span>
                  <div className="min-w-0">
                    <p className="premium-eyebrow">Caixa de Entrada Central</p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 md:text-3xl">Inbox WhatsApp</h1>
                    <p className="mt-1 text-xs font-bold text-zinc-500">Atendimento central do Master com contexto de lead e distribuição.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-stretch gap-2">
                <InboxMetric label="Conversas" value={stats.total} helper="na caixa central" icon={<MessagesSquare size={16} />} />
                <InboxMetric label="Não lidas" value={stats.unread} helper={`${stats.unreadConversations} conversa${stats.unreadConversations === 1 ? '' : 's'}`} icon={<Inbox size={16} />} accent="red" />
                <InboxMetric label="Leads" value={stats.withLead} helper="vinculados" icon={<UsersRound size={16} />} accent="green" />
                <InboxMetric label="Canais ativos" value={stats.connectedChannels} helper="disponíveis" icon={<Wifi size={16} />} accent="blue" />

                <div className="flex gap-2 pl-0 2xl:pl-2">
                  <Link href="/master/integrations/whatsapp" className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-red-200 hover:text-red-600">
                    <MessageCircle size={17} /> Gerenciar WhatsApp
                  </Link>
                  <button className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-xs font-black text-white shadow-lg shadow-red-600/15 transition hover:bg-red-700 disabled:opacity-60" type="button" onClick={() => loadData(selectedId)} disabled={loading}>
                    <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar
                  </button>
                </div>
              </div>
            </div>
          </header>

          {statusMessage ? (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <CircleAlert size={17} className="shrink-0" />
                <span className="truncate sm:whitespace-normal">{statusMessage}</span>
              </div>
              <Link href="/master/integrations/whatsapp" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700">
                Ver configuração <ExternalLink size={13} />
              </Link>
            </div>
          ) : null}

          <section className="mt-3 overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm">
            <div className="grid min-h-[720px] xl:h-[calc(100vh-210px)] xl:min-h-[680px] xl:grid-cols-[360px_minmax(500px,1fr)_330px] 2xl:grid-cols-[390px_minmax(560px,1fr)_350px]">
              <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">Fila de atendimento</p>
                      <h2 className="mt-1 text-lg font-black text-zinc-950">Conversas</h2>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-black text-zinc-600">{filteredConversations.length}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 p-1 text-[11px] font-black">
                    <button
                      className={`rounded-xl px-2 py-2.5 transition ${!onlyUnread && !onlyLeads ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      type="button"
                      onClick={() => { setOnlyUnread(false); setOnlyLeads(false); }}
                    >
                      Todas <span className="ml-1 text-[10px]">{stats.total}</span>
                    </button>
                    <button
                      className={`rounded-xl px-2 py-2.5 transition ${onlyUnread ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      type="button"
                      onClick={() => setOnlyUnread((current) => !current)}
                    >
                      Não lidas <span className="ml-1 text-[10px]">{stats.unread}</span>
                    </button>
                    <button
                      className={`rounded-xl px-2 py-2.5 transition ${onlyLeads ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                      type="button"
                      onClick={() => setOnlyLeads((current) => !current)}
                    >
                      Leads <span className="ml-1 text-[10px]">{stats.withLead}</span>
                    </button>
                  </div>

                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 text-xs font-bold text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-red-300 focus:bg-white"
                      placeholder="Buscar conversa, telefone ou loja..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-black text-zinc-500">
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2">WhatsApp Central</span>
                    <span className="inline-flex items-center gap-1">Mais recentes <ChevronDown size={13} /></span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {filteredConversations.map((conversation) => {
                    const isSelected = conversation.id === selectedId;
                    const name = conversationName(conversation);
                    const phone = conversationPhone(conversation);
                    const unread = Number(conversation.unread_count || 0);
                    const hasLead = Boolean(conversation.lead?.id || conversation.base_lead?.id);

                    return (
                      <button
                        key={conversation.id}
                        className={`group block w-full border-b border-zinc-100 px-3 py-3 text-left transition ${isSelected ? 'bg-red-50/70' : 'bg-white hover:bg-zinc-50'}`}
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <div className={`rounded-2xl border p-3 transition ${isSelected ? 'border-red-200 bg-white shadow-sm' : 'border-transparent group-hover:border-zinc-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black ${isSelected ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                              {initials(name)}
                              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="truncate text-sm font-black text-zinc-950">{name}</h3>
                                  <p className="mt-0.5 truncate text-[11px] font-bold text-zinc-500">{formatPhone(phone)}</p>
                                </div>
                                <span className="shrink-0 text-[10px] font-bold text-zinc-400">{formatDateTime(conversation.last_message_at)}</span>
                              </div>

                              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-zinc-600">{conversation.last_message || 'Sem mensagem'}</p>

                              <div className="mt-2.5 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap gap-1.5">
                                  <span className="max-w-[145px] truncate rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">{conversation.number?.label || 'WhatsApp Central'}</span>
                                  {hasLead ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead</span> : null}
                                </div>
                                {unread ? <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white">{unread}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!filteredConversations.length ? (
                    <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
                      <Inbox size={34} className="text-zinc-300" />
                      <p className="mt-3 text-sm font-black text-zinc-700">Nenhuma conversa encontrada</p>
                      <p className="mt-1 text-xs font-bold text-zinc-400">Ajuste os filtros ou aguarde novas mensagens.</p>
                    </div>
                  ) : null}
                </div>
              </aside>

              <section className="flex min-h-0 flex-col bg-[#f5f6f8]">
                {selectedConversation ? (
                  <>
                    <div className="border-b border-zinc-200 bg-white px-4 py-3.5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-700">
                            {initials(conversationName(selectedConversation))}
                            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="truncate text-lg font-black text-zinc-950">{conversationName(selectedConversation)}</h2>
                              {selectedConversation.lead?.id || selectedConversation.base_lead?.id ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead</span> : null}
                            </div>
                            <p className="mt-0.5 text-xs font-bold text-zinc-500">{formatPhone(conversationPhone(selectedConversation))}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-zinc-400">
                              <span>{conversationOrigin(selectedConversation)}</span>
                              <span>•</span>
                              <span>{assignedStoreName(selectedConversation)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase text-zinc-600 transition hover:border-red-200 hover:text-red-600" type="button" onClick={() => markRead()}>
                            <CheckCircle2 size={14} /> Marcar como lida
                          </button>
                          <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase ${isEvolutionConversation(selectedConversation) && selectedConversation.number?.integration_status === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                            <ShieldCheck size={14} /> {channelStatus(selectedConversation)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-auto bg-[#f2f4f7] p-4 md:p-5">
                      <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 shadow-sm">
                        Histórico da conversa
                      </div>

                      {messages.map((message) => {
                        const outbound = message.direction === 'outbound';

                        return (
                          <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[72%] ${outbound ? 'rounded-br-md bg-red-600 text-white' : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900'}`}>
                              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed">{message.body || '[Mensagem sem texto]'}</p>
                              <div className={`mt-2 flex items-center justify-end gap-2 text-[9px] font-black uppercase ${outbound ? 'text-white/70' : 'text-zinc-400'}`}>
                                <span>{formatDateTime(message.sent_at || message.created_at)}</span>
                                <span>{message.status}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {!messages.length ? (
                        <div className="flex h-full min-h-80 items-center justify-center p-8 text-center">
                          <div>
                            <MessageCircle size={42} className="mx-auto text-zinc-300" />
                            <p className="mt-3 text-sm font-black text-zinc-700">Nenhuma mensagem carregada</p>
                            <p className="mt-1 text-xs font-bold text-zinc-400">O histórico desta conversa aparecerá aqui.</p>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <form onSubmit={sendMessage} className="border-t border-zinc-200 bg-white p-3.5">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2 transition focus-within:border-red-300 focus-within:bg-white">
                        <textarea
                          className="min-h-20 w-full resize-none bg-transparent px-2 py-2 text-sm font-semibold text-zinc-800 outline-none placeholder:text-zinc-400"
                          placeholder="Digite sua mensagem..."
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          disabled={sending}
                        />

                        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="px-2 text-[10px] font-bold leading-relaxed text-zinc-400">
                            {isEvolutionConversation(selectedConversation)
                              ? selectedConversation.number?.integration_status === 'connected'
                                ? 'Resposta pela Evolution API usando a conexão ativa da Master.'
                                : 'Evolution indisponível. Reconecte o número em Integrações.'
                              : 'Na Meta, respostas fora da janela podem exigir template aprovado.'}
                          </p>

                          <button
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            type="submit"
                            disabled={sending || !messageText.trim() || (isEvolutionConversation(selectedConversation) && selectedConversation.number?.integration_status !== 'connected')}
                          >
                            <Send size={16} /> {sending ? 'Enviando...' : 'Enviar'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <UserCircle2 size={56} className="text-zinc-300" />
                    <h2 className="mt-4 text-2xl font-black text-zinc-950">Selecione uma conversa</h2>
                    <p className="mt-2 max-w-md text-sm font-bold text-zinc-500">Quando o WhatsApp central receber mensagens, o histórico aparecerá aqui.</p>
                  </div>
                )}
              </section>

              <aside className="min-h-0 overflow-auto border-l border-zinc-200 bg-[#fafafa] p-3.5">
                {selectedConversation ? (
                  <div className="space-y-3">
                    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-black text-red-600">
                          {initials(conversationName(selectedConversation))}
                          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">Detalhes do contato</p>
                          <h3 className="mt-1 truncate text-base font-black text-zinc-950">{conversationName(selectedConversation)}</h3>
                          <p className="mt-1 text-xs font-bold text-zinc-500">{formatPhone(conversationPhone(selectedConversation))}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">WhatsApp</span>
                        {selectedConversation.lead?.id || selectedConversation.base_lead?.id ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase text-blue-700">Lead vinculado</span> : null}
                      </div>
                    </section>

                    <DetailCard title="Contato e canal">
                      <DetailRow label="Número central" value={selectedConversation.number?.label || 'WhatsApp Central'} />
                      <DetailRow label="Canal" value={channelStatus(selectedConversation)} />
                      <DetailRow label="Última mensagem" value={formatFullDateTime(selectedConversation.last_message_at)} />
                    </DetailCard>

                    <DetailCard title="Lead e distribuição">
                      <DetailRow label="Base Master" value={selectedConversation.base_lead?.id ? 'Registrado na Base' : 'Ainda não registrado'} />
                      <DetailRow label="Loja direcionada" value={assignedStoreName(selectedConversation)} />
                      <DetailRow label="Status" value={selectedConversation.lead?.status || selectedConversation.base_lead?.status || selectedConversation.status || 'Aberta'} />
                      <DetailRow label="Origem" value={conversationOrigin(selectedConversation)} />
                      <DetailRow label="Campanha" value={selectedConversation.base_lead?.campaign_name || selectedConversation.number?.label || 'WhatsApp Central'} />
                    </DetailCard>

                    <DetailCard title="Ações rápidas">
                      <div className="grid gap-2">
                        <Link href="/master/base" className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black text-zinc-700 transition hover:border-red-200 hover:text-red-600">
                          <Database size={15} /> Abrir Base Master
                        </Link>
                        {pipelineHref(selectedConversation) ? (
                          <Link href={pipelineHref(selectedConversation)} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700">
                            <ExternalLink size={15} /> Abrir Pipeline da loja
                          </Link>
                        ) : (
                          <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-[10px] font-bold leading-relaxed text-orange-700">
                            Este lead ainda não foi direcionado para uma loja. A distribuição permanece sob responsabilidade da Base Master.
                          </div>
                        )}
                      </div>
                    </DetailCard>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm font-bold text-zinc-500">
                    <UserCircle2 size={52} className="mb-4 text-zinc-300" />
                    Selecione uma conversa para ver contato, lead e loja direcionada.
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function InboxMetric({ label, value, helper, icon, accent = 'zinc' }: { label: string; value: number; helper: string; icon: React.ReactNode; accent?: 'zinc' | 'red' | 'green' | 'blue' }) {
  const tones = {
    zinc: 'bg-zinc-50 text-zinc-500',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600'
  };

  return (
    <div className="flex min-h-[58px] min-w-[118px] items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones[accent]}`}>{icon}</span>
      <div>
        <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <strong className="text-lg font-black leading-none text-zinc-950">{value}</strong>
          <span className="text-[9px] font-bold text-zinc-400">{helper}</span>
        </div>
      </div>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{title}</h4>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-xs font-black leading-relaxed text-zinc-900">{value || '-'}</p>
    </div>
  );
}
