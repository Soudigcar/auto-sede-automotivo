'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CheckCircle2, Loader2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

type LeadIndex = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  interested_vehicle: string | null;
  status: string | null;
};

type TaskLead = LeadIndex;

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

export function PipelineLeadCardEnhancer() {
  const pathname = usePathname();
  const active = /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname || '');
  const slug = active ? String(pathname || '').split('/')[2] || '' : '';
  const supabase = useMemo(() => createClient(), []);
  const leadsRef = useRef<LeadIndex[]>([]);
  const storeIdRef = useRef('');
  const revealedRef = useRef(new Set<string>());
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialSlot = defaultTaskSlot();
  const [taskLead, setTaskLead] = useState<TaskLead | null>(null);
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

    const byVehicle = sameName.find((lead) => normalized(lead.interested_vehicle) === vehicle);
    return byVehicle || sameName[0] || null;
  }

  function renderPhoneButton(button: HTMLButtonElement, lead: LeadIndex) {
    const revealed = revealedRef.current.has(lead.id);
    button.textContent = revealed
      ? formatPhone(lead.customer_phone)
      : lead.customer_phone
        ? 'Visualizar número'
        : 'Telefone não informado';
    button.dataset.revealed = revealed ? 'true' : 'false';
    button.disabled = !lead.customer_phone;
  }

  function enhanceCards() {
    if (!active) return;

    document.querySelectorAll<HTMLElement>('[role="button"][draggable="true"]').forEach((card) => {
      const lead = resolveLead(card);
      if (!lead) return;

      card.dataset.leadId = lead.id;
      card.dataset.enhancedLeadCard = 'true';
      card.title = 'Clique no card para abrir os detalhes do lead';

      const spans = Array.from(card.querySelectorAll<HTMLElement>('span'));
      const phoneChip = spans.find((span) => {
        const phone = digits(lead.customer_phone);
        return phone && digits(span.textContent).includes(phone);
      });

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

      const actionRow = Array.from(card.children)
        .reverse()
        .find((element) => element.querySelector('button')) as HTMLElement | undefined;

      if (!actionRow) return;
      actionRow.dataset.cardActionRow = 'true';

      Array.from(actionRow.querySelectorAll<HTMLButtonElement>('button')).forEach((button) => {
        const label = normalized(button.textContent);
        if (label === 'editar' || label === 'perda') {
          button.dataset.replacedCardAction = label;
          button.style.display = 'none';
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
  }

  async function loadLeads(storeId: string) {
    const { data } = await supabase
      .from('leads')
      .select('id, customer_name, customer_phone, interested_vehicle, status')
      .eq('assigned_store_id', storeId)
      .order('created_at', { ascending: false });

    leadsRef.current = data || [];
    window.setTimeout(enhanceCards, 0);
  }

  async function registerPhoneView(lead: LeadIndex, button: HTMLButtonElement) {
    if (!lead.customer_phone || revealedRef.current.has(lead.id)) return;

    button.disabled = true;
    button.textContent = 'Carregando número...';

    try {
      const token = await getToken();
      const response = await fetch('/api/store/lead-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lead_id: lead.id,
          activity_type: 'phone_viewed',
          metadata: {
            pathname,
            interaction_source: 'pipeline_phone_reveal'
          }
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível visualizar o telefone.');

      revealedRef.current.add(lead.id);
      renderPhoneButton(button, lead);
      setToast('Telefone visualizado e registrado no monitoramento.');
      window.setTimeout(() => setToast(''), 2600);
    } catch (error: any) {
      button.disabled = false;
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

  function closeTask() {
    if (savingTask) return;
    setTaskLead(null);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lead_id: taskLead.id,
          task_type: taskType,
          date: taskDate,
          time: taskTime,
          description: taskDescription
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a tarefa.');

      setTaskMessage('Tarefa agendada com sucesso.');
      setToast('Tarefa adicionada ao calendário da loja.');
      window.setTimeout(() => {
        setTaskLead(null);
        setTaskMessage('');
        setToast('');
      }, 1000);
    } catch (error: any) {
      setTaskMessage(error?.message || 'Não foi possível criar a tarefa.');
    } finally {
      setSavingTask(false);
    }
  }

  useEffect(() => {
    if (!active || !slug) return;

    let disposed = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function initialize() {
      const context = await getStorePortalContext(slug);
      if (disposed || context.status !== 'ok') return;

      storeIdRef.current = context.store.id;
      await loadLeads(context.store.id);

      realtimeChannel = supabase
        .channel(`pipeline-card-enhancer-${context.store.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leads',
            filter: `assigned_store_id=eq.${context.store.id}`
          },
          () => {
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = setTimeout(() => void loadLeads(context.store.id), 250);
          }
        )
        .subscribe();
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
        if (lead) void registerPhoneView(lead, phoneButton);
        return;
      }

      const taskButton = target.closest<HTMLButtonElement>('[data-schedule-task]');
      if (taskButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const lead = leadsRef.current.find((item) => item.id === taskButton.dataset.scheduleTask);
        if (lead) openTask(lead);
      }
    }

    const observer = new MutationObserver(() => enhanceCards());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleClick, true);
    document.body.classList.add('pipeline-card-redesign');
    void initialize();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
      document.body.classList.remove('pipeline-card-redesign');
      document.body.classList.remove('pipeline-task-open');
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);

      document.querySelectorAll<HTMLElement>('[data-phone-reveal-host="true"], [data-schedule-task]').forEach((element) => element.remove());
      document.querySelectorAll<HTMLElement>('[data-original-phone-chip="true"], [data-replaced-card-action]').forEach((element) => {
        element.style.display = '';
      });
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
      <style>{cardStyles}</style>

      {toast ? (
        <div className="pipeline-card-toast">
          <CheckCircle2 size={17} /> {toast}
        </div>
      ) : null}

      {taskLead && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-task-overlay" role="dialog" aria-modal="true" aria-label="Agendar tarefa">
          <section className="pipeline-task-modal">
            <header>
              <div>
                <p>Próxima ação</p>
                <h2>Agendar tarefa</h2>
                <span>{taskLead.customer_name || 'Cliente sem nome'}</span>
              </div>
              <button type="button" onClick={closeTask} aria-label="Fechar"><X size={20} /></button>
            </header>

            <div className="pipeline-task-content">
              <label>
                Tipo de tarefa
                <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
                  {taskOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <div className="pipeline-task-grid">
                <label>
                  Data
                  <input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} />
                </label>
                <label>
                  Horário
                  <input type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} />
                </label>
              </div>

              <label>
                Observação
                <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Ex.: retornar com nova simulação, solicitar entrada ou confirmar visita..." />
              </label>

              {taskMessage ? <p className={taskMessage.includes('sucesso') ? 'success' : ''}>{taskMessage}</p> : null}
            </div>

            <footer>
              <button type="button" className="secondary" onClick={closeTask} disabled={savingTask}>Cancelar</button>
              <button type="button" className="primary" onClick={saveTask} disabled={savingTask || !taskDate || !taskTime}>
                {savingTask ? <Loader2 size={18} className="animate-spin" /> : <CalendarClock size={18} />}
                {savingTask ? 'Salvando...' : 'Salvar tarefa'}
              </button>
            </footer>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}

const cardStyles = `
  .pipeline-card-redesign [data-enhanced-lead-card="true"] {
    padding: 17px !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 21px !important;
    background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%) !important;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

  .pipeline-card-redesign [data-enhanced-lead-card="true"]:hover {
    border-color: #cbd5e1 !important;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.09) !important;
  }

  .pipeline-card-redesign [data-enhanced-lead-card="true"] h3 {
    font-size: 17px !important;
    line-height: 1.22 !important;
    letter-spacing: -0.02em;
  }

  .pipeline-card-redesign [data-enhanced-lead-card="true"] h3 + p {
    margin-top: 7px !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    color: #64748b !important;
  }

  .pipeline-card-redesign [data-enhanced-lead-card="true"] [class*="rounded-full"] {
    font-size: 10px !important;
    line-height: 1.2 !important;
  }

  .pipeline-card-redesign [data-phone-reveal-host="true"] {
    margin-top: 12px;
  }

  .pipeline-card-redesign .pipeline-phone-reveal {
    display: flex;
    width: 100%;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid #d7dee8;
    border-radius: 13px;
    background: #f8fafc;
    padding: 9px 12px;
    color: #334155;
    font-size: 12px;
    font-weight: 850;
    transition: 160ms ease;
  }

  .pipeline-card-redesign .pipeline-phone-reveal:not(:disabled):hover {
    border-color: #94a3b8;
    background: #ffffff;
    color: #0f172a;
  }

  .pipeline-card-redesign .pipeline-phone-reveal[data-revealed="true"] {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #047857;
    letter-spacing: 0.01em;
  }

  .pipeline-card-redesign .pipeline-phone-reveal:disabled:not([data-revealed="true"]) {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .pipeline-card-redesign [data-card-action-row="true"] {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 9px !important;
    margin-top: 13px !important;
  }

  .pipeline-card-redesign [data-card-action-row="true"] [data-pipeline-action="whatsapp"] {
    grid-column: auto !important;
    min-height: 43px !important;
    border-radius: 13px !important;
  }

  .pipeline-card-redesign .pipeline-schedule-task {
    display: inline-flex !important;
    width: 100%;
    min-height: 43px !important;
    align-items: center;
    justify-content: center;
    border: 1px solid #cbd5e1 !important;
    border-radius: 13px !important;
    background: #ffffff !important;
    padding: 9px 10px !important;
    color: #0f172a !important;
    font-size: 11px !important;
    font-weight: 850 !important;
    line-height: 1.15 !important;
    text-transform: none !important;
  }

  .pipeline-card-redesign .pipeline-schedule-task:hover {
    border-color: #94a3b8 !important;
    background: #f8fafc !important;
  }

  .pipeline-card-toast {
    position: fixed;
    top: 18px;
    left: 50%;
    z-index: 90;
    display: flex;
    max-width: calc(100vw - 32px);
    transform: translateX(-50%);
    align-items: center;
    gap: 8px;
    border: 1px solid #bbf7d0;
    border-radius: 14px;
    background: rgba(240, 253, 244, 0.97);
    padding: 11px 15px;
    color: #047857;
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.15);
    backdrop-filter: blur(14px);
  }

  body.pipeline-task-open .pipeline-mobile-dock { display: none !important; }

  .pipeline-task-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 6, 23, 0.66);
    padding: 18px;
    backdrop-filter: blur(5px);
  }

  .pipeline-task-modal {
    width: min(100%, 560px);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 26px;
    background: #ffffff;
    box-shadow: 0 30px 80px rgba(2, 6, 23, 0.35);
  }

  .pipeline-task-modal > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    background: #0f172a;
    padding: 23px 24px;
    color: #ffffff;
  }

  .pipeline-task-modal > header p {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .pipeline-task-modal > header h2 {
    margin-top: 4px;
    font-size: 25px;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .pipeline-task-modal > header span {
    display: block;
    margin-top: 5px;
    font-size: 13px;
    font-weight: 650;
    color: #cbd5e1;
  }

  .pipeline-task-modal > header button {
    display: flex;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .pipeline-task-content {
    display: grid;
    gap: 16px;
    padding: 23px 24px;
  }

  .pipeline-task-content label {
    color: #334155;
    font-size: 12px;
    font-weight: 850;
  }

  .pipeline-task-content input,
  .pipeline-task-content select,
  .pipeline-task-content textarea {
    display: block;
    width: 100%;
    margin-top: 7px;
    border: 1px solid #d7dee8;
    border-radius: 13px;
    background: #ffffff;
    padding: 12px 13px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 650;
    outline: none;
  }

  .pipeline-task-content input:focus,
  .pipeline-task-content select:focus,
  .pipeline-task-content textarea:focus {
    border-color: #ef4444;
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.08);
  }

  .pipeline-task-content textarea {
    min-height: 105px;
    resize: vertical;
  }

  .pipeline-task-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 13px;
  }

  .pipeline-task-content > p {
    border-radius: 12px;
    background: #fff7ed;
    padding: 10px 12px;
    color: #c2410c;
    font-size: 12px;
    font-weight: 750;
  }

  .pipeline-task-content > p.success {
    background: #f0fdf4;
    color: #047857;
  }

  .pipeline-task-modal > footer {
    display: grid;
    grid-template-columns: 0.8fr 1.2fr;
    gap: 10px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    padding: 16px 24px 20px;
  }

  .pipeline-task-modal > footer button {
    display: inline-flex;
    min-height: 47px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 14px;
    padding: 11px 14px;
    font-size: 13px;
    font-weight: 850;
  }

  .pipeline-task-modal > footer button.secondary {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
  }

  .pipeline-task-modal > footer button.primary {
    background: #dc2626;
    color: #ffffff;
    box-shadow: 0 10px 25px rgba(220, 38, 38, 0.2);
  }

  .pipeline-task-modal > footer button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (max-width: 480px) {
    .pipeline-card-redesign [data-card-action-row="true"] {
      grid-template-columns: 1fr !important;
    }

    .pipeline-task-overlay {
      align-items: flex-end;
      padding: 0;
    }

    .pipeline-task-modal {
      max-height: 94dvh;
      overflow-y: auto;
      border-radius: 24px 24px 0 0;
    }

    .pipeline-task-grid,
    .pipeline-task-modal > footer {
      grid-template-columns: 1fr;
    }

    .pipeline-task-modal > footer {
      position: sticky;
      bottom: 0;
      padding-bottom: max(18px, env(safe-area-inset-bottom));
    }
  }
`;
