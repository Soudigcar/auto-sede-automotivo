'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  Inbox,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  Star,
  Store,
  Tag,
  UserCircle2
} from 'lucide-react';
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

function formatTime(value: any) {
  if (!value) return '--:--';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
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

function leadStatusLabel(status: any) {
  const labels: Record<string, string> = {
    new_lead: 'Novo lead',
    in_service: 'Em atendimento',
    scheduled: 'Agendado',
    appointment_cancelled: 'Cancelou agendamento',
    no_show: 'Não compareceu',
    showed_up: 'Compareceu',
    sale_confirmed: 'Venda confirmada',
    lost: 'Perdido'
  };

  return labels[String(status || '')] || String(status || 'Novo lead');
}

function selectedLeadName(conversation: any) {
  return conversation?.lead?.customer_name || conversation?.base_lead?.name || conversationName(conversation);
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'leads' | 'priority'>('all');

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

    const response = await fetch(`/api/store-whatsapp?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível carregar WhatsApp.');
    }

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'mark-read',
          slug,
          conversation_id: selectedId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível marcar como lida.');
      }

      setStatusMessage('Conversa marcada como lida.');
      await loadData(selectedId);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao marcar conversa como lida.');
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
  }, [slug]);

  const selectedConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === selectedId) || null;
  }, [conversations, selectedId]);

  const stats = useMemo(() => {
    const unread = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    const active = conversations.filter((item) => item.status === 'open').length;
    const leads = conversations.filter((item) => item.lead_id || item.base_lead_id).length;

    return {
      total: conversations.length,
      unread,
      active,
      leads
    };
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
      if (filter === 'priority') return Number(conversation.unread_count || 0) > 0 || conversation.status === 'open';

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
            <p className="text-xs text-zinc-500">Área operacional</p>
            <p className="mt-1 font-bold">{store?.store_name || 'Loja'}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Início</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/whatsapp`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><MessageCircle size={18} /> WhatsApp CRM</Link>
            <Link href={`/loja/${slug}/calendario`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Calendário</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Atendimento da Loja</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Inbox WhatsApp</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Caixa de entrada em formato CRM: conversas, atendimento e dados do lead em uma única tela.
              </p>
            </div>

            <button className="premium-button-secondary" type="button" onClick={() => loadData(selectedId)} disabled={loading}>
              <RefreshCw size={18} /> Atualizar
            </button>
          </header>

          {statusMessage ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
              {statusMessage}
            </div>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-600">
              <button className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-blue-700" type="button" onClick={() => setFilter('all')}>
                Todas as mensagens
                {stats.unread ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{stats.unread}</span> : null}
              </button>
              <button className="shrink-0 rounded-xl px-4 py-3 hover:bg-zinc-50" type="button">Messenger</button>
              <button className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 hover:bg-zinc-50" type="button">
                Instagram
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">0</span>
              </button>
              <button className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-zinc-950 hover:bg-zinc-50" type="button" onClick={() => setFilter('all')}>
                WhatsApp
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Novo</span>
              </button>
              <button className="shrink-0 rounded-xl px-4 py-3 hover:bg-zinc-50" type="button">Comentários do Facebook</button>
              <button className="shrink-0 rounded-xl px-4 py-3 hover:bg-zinc-50" type="button">Comentários do Instagram</button>
            </div>

            <div className="grid min-h-[720px] xl:grid-cols-[390px_minmax(0,1fr)_360px]">
              <aside className="border-r border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 p-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={19} />
                    <input
                      className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-12 pr-4 text-sm font-bold text-zinc-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      placeholder="Pesquisar"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button className={`rounded-xl px-3 py-2 text-xs font-black ${filter === 'unread' ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`} type="button" onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}>Não lidas</button>
                    <button className={`rounded-xl px-3 py-2 text-xs font-black ${filter === 'priority' ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`} type="button" onClick={() => setFilter(filter === 'priority' ? 'all' : 'priority')}>Prioridade</button>
                    <button className={`rounded-xl px-3 py-2 text-xs font-black ${filter === 'leads' ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`} type="button" onClick={() => setFilter(filter === 'leads' ? 'all' : 'leads')}>Leads</button>
                    <button className="ml-auto rounded-xl border border-zinc-200 p-2 text-zinc-500" type="button" title="Filtros"><Filter size={18} /></button>
                  </div>
                </div>

                <div className="max-h-[640px] overflow-auto">
                  {filteredConversations.map((conversation) => {
                    const isSelected = conversation.id === selectedId;
                    const name = conversationName(conversation);
                    const phone = conversationPhone(conversation);
                    const unread = Number(conversation.unread_count || 0);

                    return (
                      <button
                        key={conversation.id}
                        className={`block w-full border-b border-zinc-100 p-4 text-left transition hover:bg-zinc-50 ${isSelected ? 'border-r-4 border-r-red-600 bg-zinc-50' : 'bg-white'}`}
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-black text-white">
                            {initials(name)}
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                              <MessageCircle size={11} />
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-black text-zinc-950">{name}</h3>
                                <p className="mt-1 truncate text-xs font-bold text-zinc-500">{conversation.last_message || 'Sem mensagem'}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-2">
                                <span className="text-[10px] font-bold text-zinc-400">{formatTime(conversation.last_message_at)}</span>
                                {unread ? <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">{unread}</span> : null}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-500">WhatsApp</span>
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">{formatPhone(phone)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!filteredConversations.length ? (
                    <div className="p-8 text-center text-sm font-bold text-zinc-500">
                      <Inbox className="mx-auto mb-3 text-zinc-300" size={42} />
                      Nenhuma conversa encontrada para este filtro.
                    </div>
                  ) : null}
                </div>
              </aside>

              <section className="flex min-h-[720px] flex-col bg-white">
                {selectedConversation ? (
                  <>
                    <div className="border-b border-zinc-200 bg-white px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-black text-white">
                            {initials(conversationName(selectedConversation))}
                          </div>
                          <div className="min-w-0">
                            <h2 className="truncate text-xl font-black text-zinc-950">{conversationName(selectedConversation)}</h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-500">
                              <span>Atribuir esta conversa</span>
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{selectedConversation.number?.label || 'WhatsApp Oficial'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="rounded-xl border border-zinc-200 p-3 text-zinc-500 hover:bg-zinc-50" type="button" onClick={markSelectedAsRead} title="Marcar como lida">
                            <CheckCircle2 size={18} />
                          </button>
                          <button className="rounded-xl border border-zinc-200 p-3 text-zinc-500 hover:bg-zinc-50" type="button" title="Mais opções">
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-auto bg-[#f6f7fb] p-5">
                      {messages.map((message) => {
                        const outbound = message.direction === 'outbound';

                        return (
                          <div key={message.id} className={`flex items-end gap-3 ${outbound ? 'justify-end' : 'justify-start'}`}>
                            {!outbound ? (
                              <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-black text-white">
                                {initials(conversationName(selectedConversation))}
                              </div>
                            ) : null}

                            <div className={`max-w-[78%] rounded-[22px] px-5 py-3 shadow-sm ${outbound ? 'bg-red-600 text-white' : 'border border-zinc-100 bg-white text-zinc-900'}`}>
                              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed">{message.body || '[Mensagem sem texto]'}</p>
                              <div className={`mt-2 flex items-center justify-end gap-2 text-[10px] font-black uppercase ${outbound ? 'text-white/70' : 'text-zinc-400'}`}>
                                <span>{formatDateTime(message.sent_at || message.created_at)}</span>
                                <span>{message.status}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {!messages.length ? (
                        <div className="flex h-full items-center justify-center p-8 text-center text-sm font-bold text-zinc-500">
                          Nenhuma mensagem carregada nesta conversa.
                        </div>
                      ) : null}
                    </div>

                    <form onSubmit={sendMessage} className="border-t border-zinc-200 bg-white p-4">
                      <div className="rounded-2xl border border-zinc-300 bg-white p-3 shadow-sm">
                        <textarea
                          className="min-h-20 w-full resize-none border-none bg-transparent px-2 py-2 text-sm font-bold text-zinc-800 outline-none placeholder:text-zinc-400"
                          placeholder="Responda no WhatsApp..."
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          disabled={sending}
                        />

                        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                          <p className="text-xs font-bold text-zinc-400">Janela de 24h: fora dela, a Meta pode exigir template aprovado.</p>
                          <button className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 disabled:opacity-50" type="submit" disabled={sending || !messageText.trim()}>
                            <Send size={18} /> {sending ? 'Enviando...' : 'Enviar'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <UserCircle2 size={56} className="text-zinc-300" />
                    <h2 className="mt-4 text-2xl font-black text-zinc-950">Selecione uma conversa</h2>
                    <p className="mt-2 max-w-md text-sm font-bold text-zinc-500">
                      Assim que uma mensagem chegar pelo webhook oficial do WhatsApp, a conversa ficará disponível aqui.
                    </p>
                  </div>
                )}
              </section>

              <aside className="border-l border-zinc-200 bg-white">
                {selectedConversation ? (
                  <div className="max-h-[720px] overflow-auto">
                    <div className="border-b border-zinc-200 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-base font-black text-white">
                            {initials(selectedName)}
                          </div>
                          <div>
                            <h2 className="text-lg font-black leading-tight text-zinc-950">{selectedName}</h2>
                            <p className="mt-1 text-sm font-bold text-blue-600">Ver perfil</p>
                          </div>
                        </div>
                        <MoreHorizontal className="text-zinc-500" size={20} />
                      </div>
                    </div>

                    <div className="border-b border-zinc-200 p-5">
                      <h3 className="text-lg font-black text-zinc-950">Detalhes de contato</h3>
                      <div className="mt-4 space-y-3 text-sm font-bold text-zinc-600">
                        <p className="flex items-center gap-2"><Phone size={16} /> {formatPhone(selectedPhone)}</p>
                        <p className="flex items-center gap-2"><MessageCircle size={16} /> {selectedConversation.number?.phone_number || selectedConversation.number?.label || 'WhatsApp Oficial'}</p>
                        <p className="flex items-center gap-2"><Store size={16} /> {store?.store_name || 'Loja vinculada'}</p>
                      </div>
                    </div>

                    <div className="border-b border-zinc-200 p-5">
                      <h3 className="text-lg font-black text-zinc-950">Perfil do lead</h3>
                      <div className="mt-4 grid gap-3">
                        <InfoRow label="Nome" value={selectedName} />
                        <InfoRow label="Carro de interesse" value={selectedConversation.lead?.interested_vehicle || 'Não informado'} />
                        <InfoRow label="Origem" value={selectedConversation.lead?.origin || selectedConversation.base_lead?.source || 'WhatsApp Oficial'} />
                        <InfoRow label="Campanha" value={selectedConversation.base_lead?.campaign_name || selectedConversation.number?.label || 'WhatsApp Oficial'} />
                      </div>
                    </div>

                    <div className="border-b border-zinc-200 p-5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-zinc-950">Atividade</h3>
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black uppercase text-zinc-600">Recomendado</span>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl bg-zinc-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Estágio do lead</p>
                          <p className="mt-1 text-sm font-black text-zinc-950">{leadStatusLabel(selectedConversation.lead?.status || selectedConversation.base_lead?.status)}</p>
                        </div>

                        <div className="rounded-2xl bg-zinc-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Última mensagem</p>
                          <p className="mt-1 text-sm font-black text-zinc-950">{formatDateTime(selectedConversation.last_message_at)}</p>
                        </div>

                        <div className="rounded-2xl bg-zinc-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Agendamento</p>
                          <p className="mt-1 text-sm font-black text-zinc-950">{selectedConversation.lead?.scheduled_at ? formatDateTime(selectedConversation.lead.scheduled_at) : 'Sem agendamento'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="grid gap-3">
                        <Link href={`/loja/${slug}/pipeline`} className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-red-600/20">
                          Abrir Pipeline <ArrowUpRight size={16} />
                        </Link>

                        <Link href={`/loja/${slug}/calendario`} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-4 text-sm font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-50">
                          Ver calendário <CalendarDays size={16} />
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm font-bold text-zinc-500">
                    <UserCircle2 size={48} className="mb-3 text-zinc-300" />
                    Selecione uma conversa para ver os detalhes do contato e do lead.
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

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-zinc-800">{value || 'Não informado'}</p>
    </div>
  );
}
