'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Columns3, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

type LeadIndex = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  interested_vehicle: string | null;
  status: string | null;
  assigned_store_id?: string | null;
};

const stages = ['Novos', 'Atendimento', 'Agendados', 'Cancelados', 'Não compareceu', 'Compareceu', 'Vendas', 'Perdas'];

const taskOptions = [
  { value: 'call_back', label: 'Ligar novamente' },
  { value: 'send_simulation', label: 'Enviar simulação' },
  { value: 'request_documents', label: 'Solicitar documentos' },
  { value: 'confirm_visit', label: 'Confirmar visita' },
  { value: 'whatsapp_followup', label: 'Retornar pelo WhatsApp' },
  { value: 'other', label: 'Outra tarefa' }
];

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalized(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function formatPhone(value: unknown) {
  const phone = digits(value);
  if (phone.length === 13 && phone.startsWith('55')) return `+55 (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
  if (phone.length === 12 && phone.startsWith('55')) return `+55 (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`;
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return String(value || 'Telefone não informado');
}

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function defaultTaskSlot() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return { date: localDateInput(date), time: localTimeInput(date) };
}

function actionKind(label: string) {
  const value = normalized(label);
  if (value.includes('whatsapp') || value === 'atender') return 'whatsapp';
  if (['agendar', 'chegou', 'venda'].includes(value)) return 'primary';
  if (value.includes('cancelar venda')) return 'warning';
  if (value === 'cancelou') return 'warning';
  return 'secondary';
}

function shouldReloadForRealtime(payload: any) {
  if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') return true;
  const previous = payload.old || {};
  const current = payload.new || {};
  const visibleFields = [
    'customer_name', 'customer_phone', 'interested_vehicle', 'origin', 'status', 'scheduled_at',
    'appointment_notes', 'appointment_cancelled_at', 'appointment_cancelled_reason', 'lost_reason',
    'assigned_store_id', 'seller_user_id', 'pre_sales_user_id', 'assigned_user_id'
  ];
  return visibleFields.some((field) => previous[field] !== current[field]);
}

export function PipelineOptimizedRuntime() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const slug = active ? String(pathname || '').split('/')[2] || '' : '';
  const supabase = useMemo(() => createClient(), []);
  const leadsRef = useRef<LeadIndex[]>([]);
  const revealedRef = useRef(new Set<string>());
  const openedRef = useRef(new Set<string>());
  const boardRef = useRef<HTMLElement | null>(null);
  const boardObserverRef = useRef<MutationObserver | null>(null);
  const currentScrollerRef = useRef<HTMLElement | null>(null);
  const scrollCleanupRef = useRef<() => void>(() => {});
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enhanceFrameRef = useRef<number | null>(null);

  const initialSlot = defaultTaskSlot();
  const [activeStage, setActiveStage] = useState(0);
  const [taskLead, setTaskLead] = useState<LeadIndex | null>(null);
  const [taskType, setTaskType] = useState('call_back');
  const [taskDate, setTaskDate] = useState(initialSlot.date);
  const [taskTime, setTaskTime] = useState(initialSlot.time);
  const [taskDescription, setTaskDescription] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');
  const [toast, setToast] = useState('');

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function resolveLead(card: HTMLElement) {
    const knownId = card.dataset.leadId;
    if (knownId) {
      const known = leadsRef.current.find((lead) => lead.id === knownId);
      if (known) return known;
    }

    const name = normalized(card.querySelector('h3')?.textContent);
    const cardText = String(card.textContent || '');
    const vehicle = normalized(Array.from(card.querySelectorAll('p')).find((item) => normalized(item.textContent))?.textContent);
    const sameName = leadsRef.current.filter((lead) => normalized(lead.customer_name) === name);
    const byPhone = sameName.find((lead) => {
      const phone = digits(lead.customer_phone);
      return phone && digits(cardText).includes(phone);
    });
    if (byPhone) return byPhone;
    return sameName.find((lead) => normalized(lead.interested_vehicle) === vehicle) || sameName[0] || null;
  }

  function renderPhoneButton(button: HTMLButtonElement, lead: LeadIndex) {
    const revealed = revealedRef.current.has(lead.id);
    button.textContent = revealed ? formatPhone(lead.customer_phone) : lead.customer_phone ? 'Visualizar número' : 'Telefone não informado';
    button.dataset.revealed = revealed ? 'true' : 'false';
    button.disabled = !lead.customer_phone;
  }

  function bindScroller(scroller: HTMLElement, board: HTMLElement) {
    if (currentScrollerRef.current === scroller) return;
    scrollCleanupRef.current();
    currentScrollerRef.current = scroller;

    let frame: number | null = null;
    const handleScroll = () => {
      if (window.innerWidth >= 1024 || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const columns = Array.from(board.children) as HTMLElement[];
        const target = scroller.scrollLeft + scroller.clientWidth * 0.35;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        columns.forEach((column, index) => {
          const distance = Math.abs(column.offsetLeft - target);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        setActiveStage(nearestIndex);
      });
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    scrollCleanupRef.current = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', handleScroll);
    };
  }

  function enhanceBoard() {
    const board = boardRef.current;
    if (!board) return;
    board.dataset.pipelineBoard = 'true';
    const scroller = board.parentElement as HTMLElement | null;
    if (scroller) {
      scroller.dataset.pipelineScroller = 'true';
      bindScroller(scroller, board);
    }

    Array.from(board.children).forEach((column, columnIndex) => {
      const element = column as HTMLElement;
      element.dataset.pipelineColumn = String(columnIndex);
      const header = element.firstElementChild as HTMLElement | null;
      if (header) header.dataset.pipelineColumnHeader = 'true';

      element.querySelectorAll<HTMLElement>('[role="button"][draggable="true"]').forEach((card) => {
        const lead = resolveLead(card);
        if (!lead) return;
        card.dataset.leadId = lead.id;
        card.dataset.pipelineCard = 'true';
        card.title = 'Clique no card para abrir os detalhes do lead';

        const phone = digits(lead.customer_phone);
        const phoneChip = Array.from(card.querySelectorAll<HTMLElement>('span')).find((span) => phone && digits(span.textContent).includes(phone));
        if (phoneChip) {
          phoneChip.dataset.originalPhoneChip = 'true';
          phoneChip.style.display = 'none';
        }

        let phoneHost = card.querySelector<HTMLElement>('[data-phone-reveal-host="true"]');
        if (!phoneHost) {
          phoneHost = document.createElement('div');
          phoneHost.dataset.phoneRevealHost = 'true';
          const metadataRow = phoneChip?.parentElement;
          if (metadataRow?.parentElement === card) metadataRow.insertAdjacentElement('afterend', phoneHost);
          else card.firstElementChild?.insertAdjacentElement('afterend', phoneHost);
        }

        let phoneButton = phoneHost.querySelector<HTMLButtonElement>('button');
        if (!phoneButton) {
          phoneButton = document.createElement('button');
          phoneButton.type = 'button';
          phoneButton.dataset.phoneReveal = lead.id;
          phoneButton.className = 'pipeline-phone-reveal';
          phoneHost.appendChild(phoneButton);
        }
        renderPhoneButton(phoneButton, lead);

        const actionRow = Array.from(card.children).reverse().find((child) => child.querySelector('button')) as HTMLElement | undefined;
        if (!actionRow) return;
        actionRow.dataset.cardActionRow = 'true';
        actionRow.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
          const label = normalized(button.textContent);
          if (label === 'editar' || label === 'perda') {
            button.dataset.replacedCardAction = label;
            button.style.display = 'none';
          } else {
            button.dataset.pipelineAction = actionKind(label);
          }
        });

        let taskButton = actionRow.querySelector<HTMLButtonElement>('[data-schedule-task]');
        if (!taskButton) {
          taskButton = document.createElement('button');
          taskButton.type = 'button';
          taskButton.dataset.scheduleTask = lead.id;
          taskButton.dataset.pipelineAction = 'secondary';
          taskButton.className = 'pipeline-schedule-task';
          taskButton.textContent = 'Agendar tarefa';
          actionRow.appendChild(taskButton);
        }
      });
    });
  }

  function scheduleEnhance() {
    if (enhanceFrameRef.current !== null) return;
    enhanceFrameRef.current = window.requestAnimationFrame(() => {
      enhanceFrameRef.current = null;
      enhanceBoard();
    });
  }

  async function registerActivity(lead: LeadIndex, activityType: 'lead_viewed' | 'whatsapp_clicked' | 'phone_viewed') {
    if (!lead.id) return;
    if (activityType === 'lead_viewed' && openedRef.current.has(lead.id)) return;
    if (activityType === 'lead_viewed') openedRef.current.add(lead.id);

    try {
      const token = await getToken();
      const response = await fetch('/api/store/lead-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lead_id: lead.id,
          activity_type: activityType,
          metadata: { pathname, interaction_source: activityType === 'phone_viewed' ? 'pipeline_phone_reveal' : 'pipeline_card' }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar a atividade.');
    } catch (error) {
      if (activityType === 'lead_viewed') openedRef.current.delete(lead.id);
      throw error;
    }
  }

  async function revealPhone(lead: LeadIndex, button: HTMLButtonElement) {
    if (!lead.customer_phone || revealedRef.current.has(lead.id)) return;
    button.disabled = true;
    button.textContent = 'Carregando número...';
    try {
      await registerActivity(lead, 'phone_viewed');
      revealedRef.current.add(lead.id);
      renderPhoneButton(button, lead);
      setToast('Telefone visualizado e registrado no monitoramento.');
      window.setTimeout(() => setToast(''), 2600);
    } catch (error: any) {
      renderPhoneButton(button, lead);
      setToast(error?.message || 'Não foi possível visualizar o telefone.');
      window.setTimeout(() => setToast(''), 3200);
    }
  }

  function openTask(lead: LeadIndex) {
    const slot = defaultTaskSlot();
    setTaskLead(lead);
    setTaskType('call_back');
    setTaskDate(slot.date);
    setTaskTime(slot.time);
    setTaskDescription('');
    setTaskMessage('');
  }

  async function saveTask() {
    if (!taskLead) return;
    setSavingTask(true);
    setTaskMessage('Salvando tarefa...');
    try {
      const token = await getToken();
      const response = await fetch('/api/store/lead-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lead_id: taskLead.id, task_type: taskType, date: taskDate, time: taskTime, description: taskDescription })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a tarefa.');
      setTaskMessage('Tarefa agendada com sucesso.');
      setToast('Tarefa adicionada ao calendário da loja.');
      window.setTimeout(() => {
        setTaskLead(null);
        setTaskMessage('');
        setToast('');
      }, 900);
    } catch (error: any) {
      setTaskMessage(error?.message || 'Não foi possível criar a tarefa.');
    } finally {
      setSavingTask(false);
    }
  }

  function goToStage(index: number) {
    const safeIndex = Math.max(0, Math.min(stages.length - 1, index));
    const board = boardRef.current;
    const scroller = currentScrollerRef.current;
    const column = board?.children.item(safeIndex) as HTMLElement | null;
    if (board && scroller && column) {
      scroller.scrollTo({ left: Math.max(0, column.offsetLeft - board.offsetLeft), behavior: 'smooth' });
    }
    setActiveStage(safeIndex);
  }

  useEffect(() => {
    if (!active || !slug) return;
    let disposed = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let boardSearchTimer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;

    async function initialize() {
      const context = await getStorePortalContext(slug);
      if (disposed || context.status !== 'ok') return;

      const { data } = await supabase
        .from('leads')
        .select('id, customer_name, customer_phone, interested_vehicle, status, assigned_store_id')
        .eq('assigned_store_id', context.store.id)
        .order('created_at', { ascending: false });
      if (disposed) return;
      leadsRef.current = data || [];
      scheduleEnhance();

      realtimeChannel = supabase
        .channel(`pipeline-runtime-${context.store.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'leads', filter: `assigned_store_id=eq.${context.store.id}`
        }, (payload: any) => {
          if (payload.new?.id) {
            const next = payload.new as LeadIndex;
            const index = leadsRef.current.findIndex((lead) => lead.id === next.id);
            if (index >= 0) leadsRef.current[index] = { ...leadsRef.current[index], ...next };
            else leadsRef.current.unshift(next);
          }
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            leadsRef.current = leadsRef.current.filter((lead) => lead.id !== payload.old.id);
          }
          if (!shouldReloadForRealtime(payload)) return;
          if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = setTimeout(() => {
            const updateButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => normalized(button.textContent).includes('atualizar pipeline'));
            updateButton?.click();
          }, 350);
        })
        .subscribe();
    }

    function connectBoard() {
      attempts += 1;
      const page = document.querySelector('main.premium-page');
      const board = page ? Array.from(page.querySelectorAll<HTMLElement>('div')).find((element) => {
        const classes = String(element.className || '');
        return classes.includes('min-w-[1760px]') && classes.includes('grid-cols-8');
      }) || null : null;
      if (!board) {
        if (attempts >= 50 && boardSearchTimer) {
          clearInterval(boardSearchTimer);
          boardSearchTimer = null;
        }
        return;
      }

      boardRef.current = board;
      boardObserverRef.current?.disconnect();
      boardObserverRef.current = new MutationObserver(scheduleEnhance);
      boardObserverRef.current.observe(board, { childList: true, subtree: true });
      scheduleEnhance();
      if (boardSearchTimer) {
        clearInterval(boardSearchTimer);
        boardSearchTimer = null;
      }
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const phoneButton = target.closest<HTMLButtonElement>('[data-phone-reveal]');
      if (phoneButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const lead = leadsRef.current.find((item) => item.id === phoneButton.dataset.phoneReveal);
        if (lead) void revealPhone(lead, phoneButton);
        return;
      }

      const taskButton = target.closest<HTMLButtonElement>('[data-schedule-task]');
      if (taskButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const lead = leadsRef.current.find((item) => item.id === taskButton.dataset.scheduleTask);
        if (lead) openTask(lead);
        return;
      }

      const card = target.closest<HTMLElement>('[data-pipeline-card="true"], [role="button"][draggable="true"]');
      if (!card) return;
      const lead = resolveLead(card);
      if (!lead) return;
      const clickedButton = target.closest<HTMLButtonElement>('button');
      if (clickedButton) {
        const label = normalized(clickedButton.textContent);
        if (label.includes('whatsapp') || label === 'atender') void registerActivity(lead, 'whatsapp_clicked').catch(() => undefined);
        return;
      }
      void registerActivity(lead, 'lead_viewed').catch(() => undefined);
    }

    document.body.classList.add('pipeline-optimized-runtime');
    document.addEventListener('click', handleClick, true);
    boardSearchTimer = setInterval(connectBoard, 100);
    connectBoard();
    void initialize();

    return () => {
      disposed = true;
      document.body.classList.remove('pipeline-optimized-runtime', 'pipeline-task-open');
      document.removeEventListener('click', handleClick, true);
      if (boardSearchTimer) clearInterval(boardSearchTimer);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (enhanceFrameRef.current !== null) window.cancelAnimationFrame(enhanceFrameRef.current);
      boardObserverRef.current?.disconnect();
      scrollCleanupRef.current();
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
      boardRef.current = null;
      currentScrollerRef.current = null;
    };
  }, [active, pathname, slug, supabase]);

  useEffect(() => {
    if (taskLead) document.body.classList.add('pipeline-task-open');
    else document.body.classList.remove('pipeline-task-open');
    return () => document.body.classList.remove('pipeline-task-open');
  }, [taskLead]);

  if (!active) return null;

  return (
    <>
      <style>{runtimeStyles}</style>
      <div className="pipeline-mobile-dock" aria-label="Navegação das etapas do pipeline">
        <button type="button" onClick={() => goToStage(activeStage - 1)} disabled={activeStage === 0} aria-label="Etapa anterior"><ChevronLeft size={20} /></button>
        <button type="button" className="pipeline-mobile-stage" onClick={() => goToStage((activeStage + 1) % stages.length)}>
          <Columns3 size={17} /><span><small>Etapa {activeStage + 1} de {stages.length}</small><strong>{stages[activeStage]}</strong></span>
        </button>
        <button type="button" onClick={() => goToStage(activeStage + 1)} disabled={activeStage === stages.length - 1} aria-label="Próxima etapa"><ChevronRight size={20} /></button>
      </div>

      {toast ? <div className="pipeline-card-toast"><CheckCircle2 size={17} /> {toast}</div> : null}

      {taskLead && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-task-overlay" role="dialog" aria-modal="true" aria-label="Agendar tarefa" onMouseDown={() => !savingTask && setTaskLead(null)}>
          <section className="pipeline-task-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><p>Próxima ação</p><h2>Agendar tarefa</h2><span>{taskLead.customer_name || 'Cliente sem nome'}</span></div>
              <button type="button" onClick={() => !savingTask && setTaskLead(null)} aria-label="Fechar"><X size={20} /></button>
            </header>
            <div className="pipeline-task-content">
              <label>Tipo de tarefa<select value={taskType} onChange={(event) => setTaskType(event.target.value)}>{taskOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <div className="pipeline-task-grid">
                <label>Data<input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} /></label>
                <label>Horário<input type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} /></label>
              </div>
              <label>Observação<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Descreva o que precisa ser feito." /></label>
              {taskMessage ? <p className="pipeline-task-message">{taskMessage}</p> : null}
            </div>
            <footer>
              <button type="button" className="pipeline-task-cancel" onClick={() => !savingTask && setTaskLead(null)}>Cancelar</button>
              <button type="button" className="pipeline-task-save" onClick={() => void saveTask()} disabled={savingTask || !taskDate || !taskTime}>
                <CalendarClock size={17} /> {savingTask ? 'Salvando...' : 'Agendar tarefa'}
              </button>
            </footer>
          </section>
        </div>, document.body
      ) : null}
    </>
  );
}

const runtimeStyles = `
  .pipeline-optimized-runtime main.premium-page { background: #f3f5f9; }
  .pipeline-optimized-runtime [data-pipeline-scroller="true"] { overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
  .pipeline-optimized-runtime [data-pipeline-board="true"] { display: grid !important; grid-template-columns: repeat(8, minmax(292px, 310px)) !important; min-width: max-content !important; gap: 16px !important; padding: 4px 4px 22px; }
  .pipeline-optimized-runtime [data-pipeline-column] { min-width: 292px !important; min-height: 560px !important; padding: 10px !important; border: 1px solid #e5e9f0 !important; border-radius: 24px !important; background: #f8fafc !important; box-shadow: none !important; }
  .pipeline-optimized-runtime [data-pipeline-column-header="true"] { position: sticky; top: 0; z-index: 5; margin-bottom: 12px !important; padding: 13px 14px !important; border-radius: 17px !important; box-shadow: 0 5px 15px rgba(15,23,42,.05); backdrop-filter: blur(12px); }
  .pipeline-optimized-runtime [data-pipeline-card="true"] { min-width: 0; overflow: hidden; padding: 14px !important; border: 1px solid #e5e9f0 !important; border-radius: 18px !important; background: #fff !important; box-shadow: 0 3px 9px rgba(15,23,42,.04),0 12px 28px rgba(15,23,42,.035) !important; transform: none !important; }
  .pipeline-optimized-runtime [data-pipeline-card="true"] h3 { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: normal !important; overflow-wrap: anywhere; }
  .pipeline-optimized-runtime [data-card-action-row="true"] { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px !important; }
  .pipeline-optimized-runtime [data-card-action-row="true"] button { min-height: 38px; width: 100%; justify-content: center; border-radius: 12px !important; padding: 8px 10px !important; font-size: 10px !important; line-height: 1.1 !important; }
  .pipeline-optimized-runtime [data-pipeline-action="whatsapp"] { border-color: #16a34a !important; background: #16a34a !important; color: #fff !important; }
  .pipeline-optimized-runtime [data-pipeline-action="primary"] { border-color: #dc2626 !important; background: #dc2626 !important; color: #fff !important; }
  .pipeline-optimized-runtime [data-pipeline-action="warning"] { border-color: #f97316 !important; background: #f97316 !important; color: #fff !important; }
  .pipeline-phone-reveal { display: flex; min-height: 40px; width: 100%; align-items: center; justify-content: center; margin-top: 10px; border: 1px solid #dbe2ea; border-radius: 13px; background: #f8fafc; padding: 9px 12px; color: #334155; font-size: 11px; font-weight: 900; cursor: pointer; }
  .pipeline-phone-reveal[data-revealed="true"] { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; letter-spacing: .02em; }
  .pipeline-phone-reveal:disabled { cursor: not-allowed; opacity: .65; }
  .pipeline-schedule-task { border: 1px solid #cbd5e1 !important; background: #fff !important; color: #334155 !important; }
  .pipeline-card-toast { position: fixed; right: 20px; bottom: 20px; z-index: 90; display: flex; align-items: center; gap: 9px; max-width: min(390px,calc(100vw - 28px)); border-radius: 16px; background: #0f172a; padding: 13px 16px; color: #fff; font-size: 12px; font-weight: 800; box-shadow: 0 18px 50px rgba(15,23,42,.3); }
  .pipeline-task-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(2,6,23,.68); padding: 18px; backdrop-filter: blur(5px); }
  .pipeline-task-modal { width: min(560px,100%); max-height: min(90vh,760px); overflow-y: auto; border-radius: 26px; background: #fff; box-shadow: 0 30px 90px rgba(2,6,23,.35); }
  .pipeline-task-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 22px 18px; border-bottom: 1px solid #e5e7eb; }
  .pipeline-task-modal header p { margin: 0 0 5px; color: #dc2626; font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
  .pipeline-task-modal header h2 { margin: 0; color: #0f172a; font-size: 24px; font-weight: 950; }
  .pipeline-task-modal header span { display: block; margin-top: 5px; color: #64748b; font-size: 13px; font-weight: 700; }
  .pipeline-task-modal header button { display: grid; width: 40px; height: 40px; place-items: center; flex: 0 0 auto; border: 0; border-radius: 13px; background: #f1f5f9; color: #475569; }
  .pipeline-task-content { display: grid; gap: 16px; padding: 20px 22px; }
  .pipeline-task-content label { display: grid; gap: 7px; color: #334155; font-size: 12px; font-weight: 850; }
  .pipeline-task-content input,.pipeline-task-content select,.pipeline-task-content textarea { width: 100%; border: 1px solid #dbe2ea; border-radius: 14px; background: #fff; padding: 12px 13px; color: #0f172a; font: inherit; outline: none; }
  .pipeline-task-content textarea { min-height: 105px; resize: vertical; }
  .pipeline-task-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pipeline-task-message { margin: 0; border-radius: 13px; background: #f8fafc; padding: 11px 13px; color: #475569; font-size: 12px; font-weight: 800; }
  .pipeline-task-modal footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px 22px; border-top: 1px solid #e5e7eb; }
  .pipeline-task-modal footer button { display: inline-flex; min-height: 43px; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; padding: 11px 16px; font-size: 12px; font-weight: 900; }
  .pipeline-task-cancel { border: 1px solid #dbe2ea; background: #fff; color: #475569; }
  .pipeline-task-save { border: 1px solid #dc2626; background: #dc2626; color: #fff; }
  .pipeline-task-save:disabled { opacity: .55; }
  .pipeline-mobile-dock { display: none; }
  @media (max-width:1023px) {
    .pipeline-optimized-runtime [data-pipeline-board="true"] { grid-template-columns: repeat(8,minmax(calc(100vw - 34px),calc(100vw - 34px))) !important; gap: 12px !important; scroll-snap-type: x mandatory; }
    .pipeline-optimized-runtime [data-pipeline-column] { min-width: calc(100vw - 34px) !important; scroll-snap-align: start; padding-bottom: 84px !important; }
    .pipeline-mobile-dock { position: fixed; left: 12px; right: 12px; bottom: max(12px,env(safe-area-inset-bottom)); z-index: 45; display: grid; grid-template-columns: 48px minmax(0,1fr) 48px; gap: 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; background: rgba(7,16,32,.96); padding: 8px; color: #fff; box-shadow: 0 20px 60px rgba(2,6,23,.35); backdrop-filter: blur(12px); }
    .pipeline-mobile-dock>button { display: flex; min-height: 48px; align-items: center; justify-content: center; border: 0; border-radius: 14px; background: rgba(255,255,255,.08); color: #fff; }
    .pipeline-mobile-dock>button:disabled { opacity: .35; }
    .pipeline-mobile-stage { gap: 9px; }
    .pipeline-mobile-stage span { display: grid; min-width: 0; text-align: left; }
    .pipeline-mobile-stage small { color: #94a3b8; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .pipeline-mobile-stage strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .pipeline-card-toast { left: 14px; right: 14px; bottom: 86px; max-width: none; }
    .pipeline-task-overlay { align-items: flex-end; padding: 10px; }
    .pipeline-task-modal { max-height: 92vh; border-radius: 24px 24px 18px 18px; }
    .pipeline-task-grid { grid-template-columns: 1fr; }
    .pipeline-task-modal footer { position: sticky; bottom: 0; background: #fff; }
    .pipeline-task-modal footer button { flex: 1; }
  }
  .pipeline-task-open .pipeline-mobile-dock { display: none !important; }
`;
