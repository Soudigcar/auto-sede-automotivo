'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import WhatsappCommerceActionsBase from '@/components/WhatsappCommerceActionsBase';

type WhatsappCommerceActionsProps = {
  slug: string;
  conversationId: string;
  leadId: string;
  onRefresh: () => Promise<void> | void;
  onStatus: (message: string) => void;
  compact?: boolean;
};

type ResponsibleEntry = {
  conversationId: string;
  leadId: string;
  normalizedName: string;
  phoneDigits: string;
  label: string;
};

type ResponsibleContext = {
  selectedLabel: string;
  entries: ResponsibleEntry[];
};

const legacyAppointmentSuccess = 'Agendamento criado: tarefa adicionada ao calendário.';
const loadingResponsibleContext: ResponsibleContext = {
  selectedLabel: 'carregando...',
  entries: []
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizedText(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function phoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function conversationName(conversation: any) {
  return cleanText(
    conversation?.contact?.profile_name ||
    conversation?.lead?.customer_name ||
    conversation?.base_lead?.name ||
    ''
  );
}

function conversationPhone(conversation: any) {
  return cleanText(
    conversation?.contact?.phone ||
    conversation?.lead?.customer_phone ||
    conversation?.base_lead?.phone ||
    ''
  );
}

function conversationLeadId(conversation: any) {
  return cleanText(conversation?.lead?.id || conversation?.lead_id || '');
}

function responsibleName(responsibles: Record<string, any>, leadId: string) {
  if (!leadId) return '';
  if (!Object.prototype.hasOwnProperty.call(responsibles, leadId)) {
    return 'indisponível';
  }

  const responsible = responsibles[leadId];
  if (!responsible) return 'Carteira geral da loja';
  if (responsible.unavailable) return 'indisponível';
  return cleanText(responsible.full_name) || 'indisponível';
}

function directSpanTexts(element: Element) {
  return Array.from(element.children)
    .filter((child) => child.tagName === 'SPAN')
    .map((child) => cleanText(child.textContent));
}

function upsertDecoration(target: Element, kind: string, label: string, className: string) {
  const selector = `[data-lead-responsible-decoration="${kind}"]`;
  let decoration = target.querySelector<HTMLElement>(selector);
  const text = kind === 'header' ? `• Responsável: ${label}` : `Responsável: ${label}`;

  if (!decoration) {
    decoration = document.createElement('span');
    decoration.dataset.leadResponsibleDecoration = kind;
    decoration.className = className;
    target.appendChild(decoration);
  }

  if (decoration.textContent !== text) decoration.textContent = text;
  decoration.title = text.replace(/^•\s*/, '');
}

function findConversationQueue(root: HTMLElement) {
  return Array.from(root.querySelectorAll('aside')).find((item) =>
    cleanText(item.textContent).includes('Fila de atendimento')
  ) as HTMLElement | undefined;
}

function decorateHeader(actionBar: HTMLElement, label: string) {
  const form = actionBar.closest('form');
  const conversationPanel = form?.parentElement;
  const conversationHeader = conversationPanel?.firstElementChild;
  const headerButton = conversationHeader?.querySelector('button[aria-expanded]');
  if (!headerButton) return;

  if (!label) {
    headerButton.querySelector<HTMLElement>('[data-lead-responsible-decoration="header"]')?.remove();
    return;
  }

  const metadataRow = Array.from(headerButton.querySelectorAll('div')).find((item) => {
    const texts = directSpanTexts(item);
    return texts.filter((text) => text === '•').length >= 2;
  });
  if (!metadataRow) return;

  upsertDecoration(
    metadataRow,
    'header',
    label,
    'inline-flex items-center gap-1 font-black text-violet-700'
  );
}

function matchesConversationCard(button: HTMLButtonElement, entry: ResponsibleEntry) {
  const title = normalizedText(button.querySelector('h3')?.textContent);
  if (!title || title !== entry.normalizedName) return false;
  if (!entry.phoneDigits) return true;
  return phoneDigits(button.textContent).includes(entry.phoneDigits);
}

function decorateConversationCards(root: HTMLElement, entries: ResponsibleEntry[]) {
  const queue = findConversationQueue(root);
  const list = queue?.children.item(1);
  if (!list) return;

  const buttons = Array.from(list.children).filter(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement
  );

  for (const button of buttons) {
    const entry = entries.find((candidate) => matchesConversationCard(button, candidate));
    if (!entry) {
      button.querySelector<HTMLElement>('[data-lead-responsible-decoration="card"]')?.remove();
      continue;
    }

    const badgeRow = Array.from(button.querySelectorAll('div')).find((item) => {
      const texts = directSpanTexts(item).map((text) => text.toLowerCase());
      return texts.includes('whatsapp') && texts.includes('lead');
    });
    if (!badgeRow) continue;

    upsertDecoration(
      badgeRow,
      'card',
      entry.label,
      'inline-flex max-w-full items-center rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-black text-violet-700'
    );
  }
}

function removeResponsibleDecorations(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-lead-responsible-decoration]').forEach((item) => item.remove());
}

function decorateResponsibleContext(actionBar: HTMLElement, context: ResponsibleContext) {
  const root = actionBar.closest('main') as HTMLElement | null;
  if (!root) return;
  decorateHeader(actionBar, context.selectedLabel);
  decorateConversationCards(root, context.entries);
}

export default function WhatsappCommerceActions(props: WhatsappCommerceActionsProps) {
  const supabase = createClient();
  const actionBarRef = useRef<HTMLDivElement>(null);
  const responsibleRequestRef = useRef(0);
  const [responsibleContext, setResponsibleContext] = useState<ResponsibleContext>(loadingResponsibleContext);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitSaving, setVisitSaving] = useState(false);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadResponsibleContext() {
    const requestId = ++responsibleRequestRef.current;
    setResponsibleContext(loadingResponsibleContext);

    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão não encontrada.');

      const listQuery = new URLSearchParams({ slug: props.slug });
      const listResponse = await fetch(`/api/store-whatsapp?${listQuery.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const listResult = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) throw new Error(listResult.error || 'Não foi possível carregar as conversas.');

      const conversations = Array.isArray(listResult.conversations) ? listResult.conversations : [];
      const leadIds = Array.from(new Set([
        props.leadId,
        ...conversations.map(conversationLeadId)
      ].filter(Boolean)));

      if (!leadIds.length) {
        if (requestId === responsibleRequestRef.current) {
          setResponsibleContext({ selectedLabel: '', entries: [] });
        }
        return;
      }

      const responsibleQuery = new URLSearchParams({
        slug: props.slug,
        lead_ids: leadIds.join(',')
      });
      const responsibleResponse = await fetch(`/api/store/lead-responsible?${responsibleQuery.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const responsibleResult = await responsibleResponse.json().catch(() => ({}));
      if (!responsibleResponse.ok) {
        throw new Error(responsibleResult.error || 'Não foi possível carregar os responsáveis.');
      }
      if (requestId !== responsibleRequestRef.current) return;

      const responsibles = responsibleResult.responsibles || {};
      setResponsibleContext({
        selectedLabel: props.leadId ? responsibleName(responsibles, props.leadId) : '',
        entries: conversations
          .map((conversation: any) => {
            const leadId = conversationLeadId(conversation);
            return {
              conversationId: cleanText(conversation.id),
              leadId,
              normalizedName: normalizedText(conversationName(conversation)),
              phoneDigits: phoneDigits(conversationPhone(conversation)),
              label: responsibleName(responsibles, leadId)
            };
          })
          .filter((entry: ResponsibleEntry) => Boolean(entry.leadId && entry.normalizedName))
      });
    } catch {
      if (requestId !== responsibleRequestRef.current) return;
      setResponsibleContext({
        selectedLabel: props.leadId ? 'indisponível' : '',
        entries: []
      });
    }
  }

  async function refreshWithResponsibleContext() {
    await props.onRefresh();
    await loadResponsibleContext();
  }

  function handleStatus(message: string) {
    props.onStatus(
      message === legacyAppointmentSuccess
        ? 'Agendamento salvo. Lead movido para Agendado.'
        : message
    );
  }

  function openVisit() {
    setVisitDate('');
    setVisitTime('');
    setVisitNotes('');
    setVisitOpen(true);
  }

  async function scheduleVisit() {
    if (!props.leadId || !visitDate || !visitTime || visitSaving) return;
    setVisitSaving(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão não encontrada. Entre novamente para agendar a visita.');
      const response = await fetch('/api/store/lead-task', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lead_id: props.leadId,
          task_type: 'confirm_visit',
          date: visitDate,
          time: visitTime,
          description: visitNotes
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível agendar a visita.');
      setVisitOpen(false);
      props.onStatus('Agendamento salvo. Lead movido para Agendado.');
      await refreshWithResponsibleContext();
    } catch (error: any) {
      props.onStatus(error?.message || 'Erro ao agendar visita.');
    } finally {
      setVisitSaving(false);
    }
  }

  useEffect(() => {
    void loadResponsibleContext();
    return () => {
      responsibleRequestRef.current += 1;
    };
  }, [props.conversationId, props.leadId, props.slug]);

  useEffect(() => {
    const actionBar = actionBarRef.current;
    const root = actionBar?.closest('main') as HTMLElement | null;
    if (!actionBar || !root) return;

    let frame = 0;
    const apply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        decorateResponsibleContext(actionBar, responsibleContext);
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      removeResponsibleDecorations(root);
    };
  }, [props.conversationId, responsibleContext]);

  useEffect(() => {
    setVisitOpen(false);
    setVisitSaving(false);
  }, [props.conversationId]);

  return (
    <div ref={actionBarRef} className="contents">
      {props.leadId ? (
        <button
          type="button"
          onClick={openVisit}
          className={`inline-flex shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100 ${props.compact ? 'h-11 w-11' : 'h-9 w-9'}`}
          aria-label="Agendar visita à loja"
          title="Agendar visita à loja"
        >
          <CalendarDays size={16} />
        </button>
      ) : null}

      <WhatsappCommerceActionsBase
        {...props}
        onRefresh={refreshWithResponsibleContext}
        onStatus={handleStatus}
      />

      {visitOpen ? (
        <div
          className="fixed inset-0 z-[720] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !visitSaving) setVisitOpen(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-600">Agendamento comercial</p>
                <h3 className="mt-1 text-lg font-black text-zinc-950">Visita à loja</h3>
              </div>
              <button
                type="button"
                disabled={visitSaving}
                onClick={() => setVisitOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
                aria-label="Fechar agendamento de visita"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5">
              <p className="rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-violet-700">
                Ao confirmar, o lead será movido para Agendado e a visita aparecerá uma única vez no calendário.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-zinc-600">
                  Data
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(event) => setVisitDate(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-violet-300"
                  />
                </label>
                <label className="text-xs font-black text-zinc-600">
                  Horário
                  <input
                    type="time"
                    value={visitTime}
                    onChange={(event) => setVisitTime(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-violet-300"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-black text-zinc-600">
                Observação
                <textarea
                  value={visitNotes}
                  onChange={(event) => setVisitNotes(event.target.value)}
                  placeholder="Observação opcional..."
                  className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-violet-300"
                />
              </label>
              <button
                type="button"
                onClick={() => void scheduleVisit()}
                disabled={visitSaving || !visitDate || !visitTime}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-xs font-black uppercase text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {visitSaving ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />}
                Confirmar visita
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
