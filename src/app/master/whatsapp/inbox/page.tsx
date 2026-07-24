'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Inbox,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserCircle2
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
    const withLead = conversations.filter((item) => item.lead?.id || item.base_lead?.id).length;

    return {
      total: conversations.length,
      unread,
      withLead
    };
  }, [conversations]);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Inbox WhatsApp" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Caixa de Entrada Central</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Inbox WhatsApp</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Caixa de entrada do WhatsApp central do Master. As lojas atendem os próprios leads no Inbox da loja.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/master/integrations/whatsapp" className="premium-button-secondary">
                <MessageCircle size={18} /> Gerenciar WhatsApp
              </Link>
              <button className="premium-button-secondary" type="button" onClick={() => loadData(selectedId)} disabled={loading}>
                <RefreshCw size={18} /> Atualizar
              </button>
            </div>
          </header>

          {statusMessage ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
              {statusMessage}
            </div>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-500">
              <button
                className={`rounded-2xl px-4 py-3 ${!onlyUnread && !onlyLeads ? 'bg-blue-50 text-blue-700' : 'bg-zinc-50 text-zinc-600'}`}
                type="button"
                onClick={() => { setOnlyUnread(false); setOnlyLeads(false); }}
              >
                Todas as mensagens <span className="ml-2 rounded-full bg-white px-2 py-1 text-xs">{stats.total}</span>
              </button>
              <button
                className={`rounded-2xl px-4 py-3 ${onlyUnread ? 'bg-red-600 text-white' : 'bg-zinc-50 text-zinc-600'}`}
                type="button"
                onClick={() => setOnlyUnread((current) => !current)}
              >
                Não lidas <span className="ml-2 rounded-full bg-white/80 px-2 py-1 text-xs text-red-600">{stats.unread}</span>
              </button>
              <button
                className={`rounded-2xl px-4 py-3 ${onlyLeads ? 'bg-emerald-600 text-white' : 'bg-zinc-50 text-zinc-600'}`}
                type="button"
                onClick={() => setOnlyLeads((current) => !current)}
              >
                Leads <span className="ml-2 rounded-full bg-white/80 px-2 py-1 text-xs text-emerald-700">{stats.withLead}</span>
              </button>
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs uppercase text-emerald-700">WhatsApp Central</span>
            </div>

            <div className="grid min-h-[760px] xl:grid-cols-[410px_1fr_360px]">
              <aside className="border-r border-zinc-200 bg-white">
                <div className="space-y-3 border-b border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-black text-zinc-950">Mensagens</h2>
                    <Link href="/master/integrations/whatsapp" className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-700 hover:border-red-200 hover:text-red-600">
                      Gerenciar
                    </Link>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-red-500"
                      placeholder="Pesquisar"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs font-black">
                    <button className={`rounded-xl px-3 py-2 ${onlyUnread ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`} type="button" onClick={() => setOnlyUnread((current) => !current)}>Não lidas</button>
                    <button className="rounded-xl bg-zinc-100 px-3 py-2 text-zinc-600" type="button">Prioridade</button>
                    <button className={`rounded-xl px-3 py-2 ${onlyLeads ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600'}`} type="button" onClick={() => setOnlyLeads((current) => !current)}>Leads</button>
                  </div>
                </div>

                <div className="max-h-[655px] overflow-auto">
                  {filteredConversations.map((conversation) => {
                    const isSelected = conversation.id === selectedId;
                    const name = conversationName(conversation);
                    const phone = conversationPhone(conversation);
                    const unread = Number(conversation.unread_count || 0);

                    return (
                      <button
                        key={conversation.id}
                        className={`block w-full border-b border-zinc-100 p-4 text-left transition hover:bg-zinc-50 ${isSelected ? 'border-r-4 border-r-red-600 bg-red-50' : 'bg-white'}`}
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-black ${isSelected ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                            {initials(name)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="truncate text-sm font-black text-zinc-950">{name}</h3>
                              <span className="text-[11px] font-bold text-zinc-400">{formatDateTime(conversation.last_message_at)}</span>
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-zinc-500"><Phone size={12} /> {formatPhone(phone)}</p>
                            <p className="mt-2 line-clamp-2 text-sm font-bold text-zinc-600">{conversation.last_message || 'Sem mensagem'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{conversation.number?.label || 'WhatsApp Central'}</span>
                              {unread ? <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">{unread}</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!filteredConversations.length ? (
                    <div className="p-6 text-center text-sm font-bold text-zinc-500">
                      Nenhuma conversa encontrada no WhatsApp central.
                    </div>
                  ) : null}
                </div>
              </aside>

              <section className="flex min-h-[760px] flex-col bg-white">
                {selectedConversation ? (
                  <>
                    <div className="border-b border-zinc-200 bg-white p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-lg font-black text-zinc-700">
                            {initials(conversationName(selectedConversation))}
                          </div>
                          <div>
                            <h2 className="text-2xl font-black text-zinc-950">{conversationName(selectedConversation)}</h2>
                            <p className="mt-1 text-sm font-bold text-zinc-500">{formatPhone(conversationPhone(selectedConversation))}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-black uppercase text-zinc-600" type="button" onClick={() => markRead()}>
                            Marcar como lida
                          </button>
                          <span className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black uppercase text-emerald-700">{selectedConversation.number?.label || 'WhatsApp Central'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-auto bg-[#f3f5f8] p-5">
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

                    <form onSubmit={sendMessage} className="border-t border-zinc-200 bg-white p-4">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <textarea
                          className="premium-input min-h-24 resize-none"
                          placeholder="Responda no WhatsApp..."
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          disabled={sending}
                        />

                        <button className="premium-button-primary justify-center md:w-44" type="submit" disabled={sending || !messageText.trim()}>
                          <Send size={18} /> {sending ? 'Enviando...' : 'Enviar'}
                        </button>
                      </div>

                      <p className="mt-3 text-xs font-bold text-zinc-400">
                        Resposta livre depende da janela de atendimento da Meta. Fora da janela, pode exigir template aprovado.
                      </p>
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

              <aside className="border-l border-zinc-200 bg-white p-5">
                {selectedConversation ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-lg font-black text-zinc-700">
                          {initials(conversationName(selectedConversation))}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-zinc-950">{conversationName(selectedConversation)}</h3>
                          <p className="text-sm font-bold text-blue-600">Contato WhatsApp</p>
                        </div>
                      </div>
                    </div>

                    <DetailCard title="Detalhes de contato">
                      <DetailRow label="Telefone" value={formatPhone(conversationPhone(selectedConversation))} />
                      <DetailRow label="Número central" value={selectedConversation.number?.label || 'WhatsApp Central'} />
                      <DetailRow label="Última mensagem" value={formatFullDateTime(selectedConversation.last_message_at)} />
                    </DetailCard>

                    <DetailCard title="Lead e distribuição">
                      <DetailRow label="Base Master" value={selectedConversation.base_lead?.id ? 'Registrado na Base' : 'Ainda não registrado'} />
                      <DetailRow label="Loja direcionada" value={assignedStoreName(selectedConversation)} />
                      <DetailRow label="Status" value={selectedConversation.lead?.status || selectedConversation.base_lead?.status || selectedConversation.status || 'Aberta'} />
                      <DetailRow label="Origem" value={selectedConversation.lead?.origin || selectedConversation.base_lead?.source || 'WhatsApp Oficial'} />
                      <DetailRow label="Campanha" value={selectedConversation.base_lead?.campaign_name || selectedConversation.number?.label || 'WhatsApp Central'} />
                    </DetailCard>

                    <DetailCard title="Ações rápidas">
                      <div className="grid gap-2">
                        <Link href="/master/base" className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-700 hover:border-red-200 hover:text-red-600">
                          <Database size={16} /> Abrir Base Master
                        </Link>
                        {pipelineHref(selectedConversation) ? (
                          <Link href={pipelineHref(selectedConversation)} className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20">
                            <ExternalLink size={16} /> Abrir Pipeline da loja
                          </Link>
                        ) : (
                          <div className="rounded-2xl bg-orange-50 p-4 text-xs font-bold text-orange-700">
                            Este lead ainda não foi direcionado para uma loja. Ele deve ser tratado pela automação da Base Master.
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

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
      <h4 className="text-sm font-black uppercase tracking-wide text-zinc-500">{title}</h4>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-zinc-900">{value || '-'}</p>
    </div>
  );
}
