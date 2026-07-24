'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  LogOut,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Send,
  Store,
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

  return (parts[0]?.[0] || 'C') + (parts[1]?.[0] || '');
}

function conversationName(conversation: any) {
  return conversation?.contact?.profile_name || conversation?.lead?.customer_name || conversation?.base_lead?.name || 'Cliente WhatsApp';
}

function conversationPhone(conversation: any) {
  return conversation?.contact?.phone || conversation?.lead?.customer_phone || conversation?.base_lead?.phone || '';
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

    return {
      total: conversations.length,
      unread,
      active
    };
  }, [conversations]);

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
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">WhatsApp CRM</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Receba conversas do WhatsApp Oficial, veja o lead vinculado e responda pelo AUTO CONTROLE.
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

          <section className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Conversas</p>
              <strong className="mt-3 block text-4xl font-black text-zinc-950">{stats.total}</strong>
            </div>
            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Não lidas</p>
              <strong className="mt-3 block text-4xl font-black text-red-600">{stats.unread}</strong>
            </div>
            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Em atendimento</p>
              <strong className="mt-3 block text-4xl font-black text-emerald-600">{stats.active}</strong>
            </div>
          </section>

          <section className="mt-7 grid min-h-[680px] gap-5 xl:grid-cols-[420px_1fr]">
            <aside className="premium-card overflow-hidden p-0">
              <div className="border-b border-zinc-100 p-5">
                <h2 className="text-2xl font-black text-zinc-950">Conversas recebidas</h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">Clique em uma conversa para abrir o histórico.</p>
              </div>

              <div className="max-h-[610px] overflow-auto">
                {conversations.map((conversation) => {
                  const isSelected = conversation.id === selectedId;
                  const name = conversationName(conversation);
                  const phone = conversationPhone(conversation);

                  return (
                    <button
                      key={conversation.id}
                      className={`block w-full border-b border-zinc-100 p-4 text-left transition hover:bg-zinc-50 ${isSelected ? 'bg-red-50' : 'bg-white'}`}
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-black ${isSelected ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                          {initials(name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="truncate text-sm font-black text-zinc-950">{name}</h3>
                            {conversation.unread_count ? (
                              <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">{conversation.unread_count}</span>
                            ) : null}
                          </div>

                          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-zinc-500"><Phone size={12} /> {formatPhone(phone)}</p>
                          <p className="mt-2 line-clamp-2 text-sm font-bold text-zinc-600">{conversation.last_message || 'Sem mensagem'}</p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase text-zinc-500">
                              {conversation.number?.label || 'WhatsApp'}
                            </span>
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">
                              {formatDateTime(conversation.last_message_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {!conversations.length ? (
                  <div className="p-6 text-sm font-bold text-zinc-500">
                    Nenhuma conversa ainda. Quando um cliente mandar mensagem para o número oficial vinculado à loja, ela aparecerá aqui.
                  </div>
                ) : null}
              </div>
            </aside>

            <section className="premium-card flex min-h-[680px] flex-col overflow-hidden p-0">
              {selectedConversation ? (
                <>
                  <div className="border-b border-zinc-100 bg-white p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-600 text-lg font-black text-white">
                          {initials(conversationName(selectedConversation))}
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-zinc-950">{conversationName(selectedConversation)}</h2>
                          <p className="mt-1 text-sm font-bold text-zinc-500">{formatPhone(conversationPhone(selectedConversation))}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase text-emerald-700"><CheckCircle2 size={14} /> Conversa aberta</span>
                        <span className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-black uppercase text-zinc-600">{selectedConversation.number?.label || 'WhatsApp Oficial'}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Lead no pipeline</p>
                        <p className="mt-1 truncate text-sm font-black text-zinc-800">{selectedConversation.lead?.customer_name || 'Lead automático'}</p>
                      </div>
                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Origem</p>
                        <p className="mt-1 truncate text-sm font-black text-zinc-800">{selectedConversation.lead?.origin || selectedConversation.base_lead?.source || 'WhatsApp Oficial'}</p>
                      </div>
                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Status</p>
                        <p className="mt-1 truncate text-sm font-black text-zinc-800">{selectedConversation.lead?.status || selectedConversation.base_lead?.status || 'Novo lead'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-auto bg-[#f6f7fb] p-5">
                    {messages.map((message) => {
                      const outbound = message.direction === 'outbound';

                      return (
                        <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[82%] rounded-[24px] px-5 py-4 shadow-sm ${outbound ? 'bg-red-600 text-white' : 'border border-zinc-100 bg-white text-zinc-900'}`}>
                            <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed">{message.body || '[Mensagem sem texto]'}</p>
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

                  <form onSubmit={sendMessage} className="border-t border-zinc-100 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <textarea
                        className="premium-input min-h-24 resize-none"
                        placeholder="Digite sua resposta para o cliente..."
                        value={messageText}
                        onChange={(event) => setMessageText(event.target.value)}
                        disabled={sending}
                      />

                      <button className="premium-button-primary justify-center md:w-44" type="submit" disabled={sending || !messageText.trim()}>
                        <Send size={18} /> {sending ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>

                    <p className="mt-3 text-xs font-bold text-zinc-400">
                      Atenção: pela API oficial, resposta livre depende da janela de atendimento ativa. Fora da janela, a Meta pode exigir template aprovado.
                    </p>
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
          </section>
        </div>
      </section>
    </main>
  );
}
