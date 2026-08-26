'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, MoreVertical, Plus, RefreshCw, Search, Send, X } from 'lucide-react';
import { WhatsappMobileMediaMessage } from '@/components/WhatsappMobileMediaMessage';

type FilterOption = { key: string; label: string; count?: number };

type Props = {
  title: string;
  subtitle?: string;
  conversations: any[];
  messages: any[];
  selectedId: string;
  selectedConversation: any | null;
  loading: boolean;
  sending: boolean;
  statusMessage: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  filters: FilterOption[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
  onSelectConversation: (id: string) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  messageText: string;
  onMessageTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canSend: boolean;
  sendBlockedReason?: string;
  getName: (conversation: any) => string;
  getPhone: (conversation: any) => string;
  getAvatarUrl?: (conversation: any) => string;
  getLastMessage: (conversation: any) => string;
  getTime: (conversation: any) => string;
  getUnread: (conversation: any) => number;
  channelLabel?: string;
  detailsContent?: ReactNode;
  actionContent?: ReactNode;
  audioRecorder?: ReactNode;
};

function initials(value: string) {
  const parts = String(value || 'Cliente').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function MobileAvatar({ name, src, compact = false, online = false }: { name: string; src?: string; compact?: boolean; online?: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const size = compact ? 'h-10 w-10 text-xs' : 'h-12 w-12 text-sm';
  return (
    <span className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 font-black text-zinc-600`}>
      {src && !failed ? <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials(name)}</span>}
      <span className="sr-only">{name}</span>
      {online ? <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" /> : null}
    </span>
  );
}

function statusTone(message: string) {
  const normalized = message.toLowerCase();
  if (!message) return 'hidden';
  if (normalized.includes('erro') || normalized.includes('não foi possível') || normalized.includes('expirada') || normalized.includes('indisponível')) return 'border-red-200 bg-red-50 text-red-700';
  if (normalized.includes('sucesso') || normalized.includes('enviada') || normalized.includes('criado') || normalized.includes('movido') || normalized.includes('assumido')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized.includes('carreg') || normalized.includes('enviando') || normalized.includes('consultando') || normalized.includes('marcando')) return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function outboundStatus(message: any) {
  const status = String(message?.status || '').trim().toLowerCase();
  if (['read', 'seen'].includes(status)) return '✓✓';
  if (status === 'delivered') return '✓✓';
  if (['sent', 'accepted'].includes(status)) return '✓';
  if (['failed', 'error'].includes(status)) return '!';
  if (['pending', 'queued', 'sending'].includes(status)) return '…';
  return '';
}

function exitInbox() {
  const pathname = window.location.pathname;
  const store = pathname.match(/^\/loja\/([^/]+)\/whatsapp\/?$/);
  window.location.assign(store ? `/loja/${store[1]}` : '/master/dashboard/live');
}

export function WhatsappMobileInboxV2(props: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef('');

  useEffect(() => {
    const requested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('conversation_id');
    if (requested && props.selectedId) setChatOpen(true);
  }, [props.selectedId]);

  useEffect(() => {
    document.body.dataset.whatsappMobileChat = chatOpen ? 'true' : 'false';
    return () => {
      delete document.body.dataset.whatsappMobileChat;
    };
  }, [chatOpen]);

  useEffect(() => {
    setSheetOpen(false);
  }, [props.selectedId]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history || !chatOpen) return;
    const selectionChanged = lastSelectedRef.current !== props.selectedId;
    lastSelectedRef.current = props.selectedId;
    if (selectionChanged || nearBottom) {
      requestAnimationFrame(() => {
        history.scrollTop = history.scrollHeight;
        setNearBottom(true);
      });
    }
  }, [props.messages.length, props.selectedId, chatOpen, nearBottom]);

  const selectedName = props.selectedConversation ? props.getName(props.selectedConversation) : '';
  const selectedPhone = props.selectedConversation ? props.getPhone(props.selectedConversation) : '';
  const selectedAvatar = props.selectedConversation && props.getAvatarUrl ? props.getAvatarUrl(props.selectedConversation) : '';
  const visibleStatus = props.statusMessage && !props.statusMessage.toLowerCase().includes('nenhuma conversa') ? props.statusMessage : '';
  const tone = statusTone(visibleStatus);
  const list = useMemo(() => props.conversations, [props.conversations]);

  async function openConversation(id: string) {
    await props.onSelectConversation(id);
    setChatOpen(true);
    setNearBottom(true);
  }

  function handleHistoryScroll() {
    const history = historyRef.current;
    if (!history) return;
    const distance = history.scrollHeight - history.scrollTop - history.clientHeight;
    setNearBottom(distance < 100);
  }

  function jumpToLatest() {
    const history = historyRef.current;
    if (!history) return;
    history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
    setNearBottom(true);
  }

  return (
    <div className="whatsapp-mobile-v2 fixed inset-0 z-[210] flex bg-[#f0f2f5] xl:hidden" style={{ height: '100dvh' }}>
      {!chatOpen ? (
        <section className="flex min-h-0 w-full flex-col bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <header className="shrink-0 border-b border-zinc-200 bg-white px-3 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={exitInbox} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100" aria-label="Voltar ao Auto Controle"><ArrowLeft size={21} /></button>
              <div className="min-w-0 flex-1"><p className="truncate text-xl font-black tracking-tight text-zinc-950">{props.title}</p>{props.subtitle ? <p className="mt-0.5 truncate text-[11px] font-bold text-zinc-500">{props.subtitle}</p> : null}</div>
              <button type="button" onClick={() => void props.onRefresh()} disabled={props.loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600" aria-label="Atualizar conversas"><RefreshCw size={17} className={props.loading ? 'animate-spin' : ''} /></button>
            </div>
            <div className="relative mt-3"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} /><input value={props.searchTerm} onChange={(event) => props.onSearchTermChange(event.target.value)} placeholder="Buscar conversa ou telefone" className="h-11 w-full rounded-xl bg-zinc-100 pl-10 pr-3 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-red-100" /></div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {props.filters.map((filter) => <button key={filter.key} type="button" onClick={() => props.onFilterChange(filter.key)} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black ${props.activeFilter === filter.key ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{filter.label}{typeof filter.count === 'number' ? ` ${filter.count}` : ''}</button>)}
            </div>
          </header>

          {visibleStatus ? <div className={`mx-3 mt-2 shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold ${tone}`}>{visibleStatus}</div> : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {list.map((conversation) => {
              const id = String(conversation?.id || '');
              const name = props.getName(conversation);
              const phone = props.getPhone(conversation);
              const avatar = props.getAvatarUrl ? props.getAvatarUrl(conversation) : '';
              const unread = props.getUnread(conversation);
              return (
                <button key={id} type="button" onClick={() => void openConversation(id)} className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left active:bg-zinc-50">
                  <MobileAvatar name={name} src={avatar} online />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3"><strong className="truncate text-[15px] font-black text-zinc-950">{name}</strong><span className={`shrink-0 text-[11px] font-bold ${unread ? 'text-red-600' : 'text-zinc-400'}`}>{props.getTime(conversation)}</span></span>
                    <span className="mt-1 flex items-center justify-between gap-3"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-zinc-500">{props.getLastMessage(conversation) || phone || 'Sem mensagem'}</span></span>{unread ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white">{unread > 99 ? '99+' : unread}</span> : null}</span>
                  </span>
                </button>
              );
            })}
            {!list.length ? <div className="flex min-h-64 items-center justify-center px-8 text-center text-sm font-bold text-zinc-400">Nenhuma conversa encontrada.</div> : null}
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 w-full flex-col bg-[#efeae2]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <header className="z-10 flex h-[58px] shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2 shadow-sm">
            <button type="button" onClick={() => { setChatOpen(false); setSheetOpen(false); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100" aria-label="Voltar para conversas"><ArrowLeft size={22} /></button>
            <button type="button" onClick={() => setSheetOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <MobileAvatar name={selectedName} src={selectedAvatar} compact />
              <span className="min-w-0"><strong className="block truncate text-[14px] font-black text-zinc-950">{selectedName || 'Conversa'}</strong><span className="block truncate text-[10px] font-bold text-zinc-500">{selectedPhone || 'WhatsApp'}</span></span>
            </button>
            <button type="button" onClick={() => setSheetOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-100" aria-label="Mais opções"><MoreVertical size={20} /></button>
          </header>

          {visibleStatus ? <div className={`mx-3 mt-2 shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold ${tone}`}>{visibleStatus}</div> : null}

          <div ref={historyRef} onScroll={handleHistoryScroll} className="relative min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="mx-auto mb-3 w-fit rounded-full bg-white/80 px-3 py-1 text-[10px] font-black text-zinc-500 shadow-sm backdrop-blur">Histórico da conversa</div>
            {props.messages.map((message) => {
              const outbound = message?.direction === 'outbound';
              const status = outbound ? outboundStatus(message) : '';
              return (
                <div key={message?.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`min-w-0 max-w-[86%] rounded-[14px] px-2.5 py-2 shadow-sm ${outbound ? 'rounded-br-[4px] bg-red-600 text-white' : 'rounded-bl-[4px] bg-white text-zinc-900'}`}>
                    <WhatsappMobileMediaMessage message={message} outbound={outbound} />
                    <div className={`mt-1 flex items-center justify-end gap-1 text-[9px] font-bold ${outbound ? 'text-white/65' : 'text-zinc-400'}`}><span>{props.getTime(message)}</span>{status ? <span aria-label={`Status ${String(message?.status || '')}`}>{status}</span> : null}</div>
                  </div>
                </div>
              );
            })}
            {!props.messages.length ? <div className="flex min-h-full items-center justify-center text-center text-sm font-bold text-zinc-400">O histórico desta conversa aparecerá aqui.</div> : null}
          </div>

          {!nearBottom ? <button type="button" onClick={jumpToLatest} className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-600 shadow-lg" aria-label="Ir para mensagens mais recentes"><ArrowDown size={18} /></button> : null}

          <form onSubmit={props.onSubmit} className="shrink-0 border-t border-zinc-200 bg-[#f7f7f7] px-2 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
            {props.sendBlockedReason ? <p className="mb-1.5 px-2 text-[9px] font-bold text-amber-700">{props.sendBlockedReason}</p> : null}
            <div className="flex items-end gap-1.5">
              <button type="button" onClick={() => setSheetOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm" aria-label="Abrir ações"><Plus size={21} /></button>
              <textarea value={props.messageText} onChange={(event) => props.onMessageTextChange(event.target.value)} rows={1} placeholder="Mensagem" disabled={props.sending} className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-[15px] font-medium leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-red-200" />
              {props.audioRecorder}
              <button type="submit" disabled={props.sending || !props.canSend || !props.messageText.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm disabled:bg-zinc-300" aria-label="Enviar mensagem"><Send size={17} /></button>
            </div>
          </form>

          {sheetOpen ? (
            <div className="fixed inset-0 z-[620] flex items-end bg-black/35" onMouseDown={(event) => { if (event.currentTarget === event.target) setSheetOpen(false); }}>
              <div className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-200" />
                <div className="mt-3 flex items-center justify-between"><div className="min-w-0"><p className="truncate text-base font-black text-zinc-950">{selectedName}</p><p className="mt-0.5 truncate text-xs font-bold text-zinc-500">{selectedPhone}</p></div><button type="button" onClick={() => setSheetOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600" aria-label="Fechar opções"><X size={17} /></button></div>
                {props.detailsContent ? <div className="mt-4">{props.detailsContent}</div> : null}
                {props.actionContent ? <div className="mt-4 border-t border-zinc-100 pt-4">{props.actionContent}</div> : null}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <style jsx global>{`
        @media (max-width: 1279px) {
          body[data-whatsapp-mobile-chat='true'] {
            overflow: hidden !important;
          }
        }
      `}</style>
    </div>
  );
}
