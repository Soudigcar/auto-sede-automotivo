'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, MapPin, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type ScheduleForm = {
  leadId: string;
  type: 'appointment' | 'visit';
  date: string;
  time: string;
  notes: string;
};

const stageByTitle: Record<string, string> = {
  'Novo Lead Recebido': 'new_lead',
  'Em Atendimento': 'in_service',
  'Agendado': 'scheduled',
  'Não Compareceu': 'no_show',
  'Compareceu': 'showed_up',
  'Cancelou Agendamento': 'appointment_cancelled',
  'Venda Confirmada': 'sale_confirmed',
  'Perdido': 'lost'
};

const directDropStages = new Set(['new_lead', 'in_service', 'no_show', 'showed_up']);

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function isPipelineCardV2(card: HTMLElement | null | undefined) {
  return card?.dataset.pipelineCardV2 === 'true';
}

function slugFromPath(pathname: string) {
  return pathname.split('/').filter(Boolean)[1] || '';
}

function localInputParts(value?: string | null) {
  if (!value) {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
    return {
      date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`,
      time: `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localInputParts(null);
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  };
}

export function StorePipelineScheduleUxBridge() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const slug = slugFromPath(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function request(url: string, options: RequestInit = {}) {
    const token = await accessToken();
    if (!token) throw new Error('Sessão expirada. Entre novamente.');
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
    return data;
  }

  async function openSchedule(leadId: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await request(`/api/store/portal/pipeline/ux-actions?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(leadId)}`);
      const parts = localInputParts(result.lead?.scheduled_at);
      setForm({
        leadId,
        type: result.lead?.appointment_type === 'visit' ? 'visit' : 'appointment',
        date: parts.date,
        time: parts.time,
        notes: result.lead?.appointment_notes || ''
      });
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível abrir o agendamento.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!form) return;
    setBusy(true);
    setMessage('Salvando...');
    try {
      const result = await request('/api/store/portal/pipeline/ux-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'schedule',
          slug,
          lead_id: form.leadId,
          appointment_type: form.type,
          date: form.date,
          time: form.time,
          notes: form.notes
        })
      });
      setMessage(result.message || 'Agendamento salvo.');
      setForm(null);
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function moveLead(leadId: string, targetStatus: string) {
    setBusy(true);
    setMessage('Movendo lead...');
    try {
      const result = await request('/api/store/portal/pipeline/ux-actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'move', slug, lead_id: leadId, target_status: targetStatus })
      });
      setMessage(result.message || 'Lead movido.');
      window.setTimeout(() => window.location.reload(), 180);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível mover o lead.');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const normalize = () => {
      document.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
        if (isPipelineCardV2(card)) return;
        const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
        const actionButtons = buttons.filter((button) => {
          const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return ['editar', 'tarefa', 'transferir', 'whatsapp', 'atender', 'perda', 'agendar', 'reagendar', 'chegou', 'cancelou', 'faltou', 'venda', 'cancelar venda', 'reabrir'].includes(text);
        });
        if (actionButtons.length) {
          const host = actionButtons[0].parentElement;
          if (host) host.classList.add('pipeline-card-actions-uniform');
          actionButtons.forEach((button) => button.classList.add('pipeline-card-action-uniform'));
        }
      });

      document.querySelectorAll<HTMLElement>('h2').forEach((heading) => {
        const text = String(heading.textContent || '').trim();
        const stage = stageByTitle[text];
        if (!stage) return;
        const column = heading.closest<HTMLElement>('.min-h-\[520px\]');
        if (column) column.dataset.pipelineStage = stage;
      });

      document.querySelectorAll<HTMLOptionElement>('option[value="confirm_visit"]').forEach((option) => option.remove());
    };

    normalize();
    window.addEventListener('pipeline-dom-sync', normalize);

    const clickCapture = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
      if (!button) return;
      const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text !== 'agendar' && text !== 'reagendar') return;
      const card = button.closest<HTMLElement>('[data-lead-id]');
      if (isPipelineCardV2(card)) return;
      const leadId = card?.dataset.leadId;
      if (!leadId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openSchedule(leadId);
    };

    const dropCapture = (event: DragEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-pipeline-stage]');
      const stage = target?.dataset.pipelineStage || '';
      if (!stage) return;
      const leadId = event.dataTransfer?.getData('text/plain') || '';
      if (!leadId) return;

      if (stage === 'scheduled') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void openSchedule(leadId);
        return;
      }

      if (directDropStages.has(stage)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void moveLead(leadId, stage);
      }
    };

    document.addEventListener('click', clickCapture, true);
    document.addEventListener('drop', dropCapture, true);

    return () => {
      window.removeEventListener('pipeline-dom-sync', normalize);
      document.removeEventListener('click', clickCapture, true);
      document.removeEventListener('drop', dropCapture, true);
    };
  }, [active, slug]);

  if (!active) return null;

  return (
    <>
      <style>{styles}</style>
      {message ? <div className="pipeline-ux-toast">{message}</div> : null}
      {form && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-schedule-backdrop" role="dialog" aria-modal="true">
          <div className="pipeline-schedule-modal">
            <div className="pipeline-schedule-head">
              <div>
                <p className="pipeline-schedule-kicker">Pipeline</p>
                <h2>{form.type === 'visit' ? 'Agendar visita' : 'Agendar atendimento'}</h2>
              </div>
              <button type="button" className="pipeline-schedule-close" onClick={() => setForm(null)} aria-label="Fechar"><X size={20} /></button>
            </div>

            <div className="pipeline-schedule-types" aria-label="Tipo do agendamento">
              <button type="button" className={form.type === 'appointment' ? 'is-active' : ''} onClick={() => setForm((current) => current ? { ...current, type: 'appointment' } : current)}>
                <CalendarDays size={20} /><span><strong>Agendamento</strong><small>Contato ou compromisso agendado</small></span>
              </button>
              <button type="button" className={form.type === 'visit' ? 'is-active' : ''} onClick={() => setForm((current) => current ? { ...current, type: 'visit' } : current)}>
                <MapPin size={20} /><span><strong>Visita</strong><small>Cliente irá até a loja</small></span>
              </button>
            </div>

            <div className="pipeline-schedule-grid">
              <label>Data<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label>Hora<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
            </div>

            <label className="pipeline-schedule-notes">Observação<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={form.type === 'visit' ? 'Ex.: visita para conhecer o veículo e fazer test-drive' : 'Detalhes do agendamento'} /></label>

            <div className="pipeline-schedule-actions">
              <button type="button" className="secondary" onClick={() => setForm(null)}>Voltar</button>
              <button type="button" className="primary" disabled={busy || !form.date || !form.time} onClick={() => void saveSchedule()}>{busy ? 'Salvando...' : form.type === 'visit' ? 'Agendar visita' : 'Salvar agendamento'}</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

const styles = `
  .pipeline-card-actions-uniform {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px !important;
  }
  .pipeline-card-action-uniform {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 34px !important;
    justify-content: center !important;
    padding: 6px 7px !important;
    border-radius: 10px !important;
    font-size: 9px !important;
    line-height: 1.05 !important;
    text-align: center !important;
  }
  .pipeline-ux-toast {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 245;
    max-width: 360px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 14px;
    background: #10151e;
    padding: 12px 14px;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 18px 50px rgba(0,0,0,.28);
  }
  .pipeline-schedule-backdrop {
    position: fixed;
    inset: 0;
    z-index: 260;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.68);
    padding: 18px;
  }
  .pipeline-schedule-modal {
    width: min(620px, 100%);
    max-height: 92vh;
    overflow: auto;
    border-radius: 26px;
    background: #fff;
    padding: 24px;
    color: #111827;
    box-shadow: 0 30px 90px rgba(0,0,0,.38);
  }
  .pipeline-schedule-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
  .pipeline-schedule-head h2 { margin:4px 0 0; font-size:26px; font-weight:950; }
  .pipeline-schedule-kicker { margin:0; color:#ef2d34; font-size:10px; font-weight:950; letter-spacing:.18em; text-transform:uppercase; }
  .pipeline-schedule-close { display:flex; width:40px; height:40px; align-items:center; justify-content:center; border:0; border-radius:999px; background:#f3f4f6; color:#6b7280; }
  .pipeline-schedule-types { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:22px; }
  .pipeline-schedule-types button { display:flex; min-height:78px; align-items:center; gap:12px; border:1px solid #e5e7eb; border-radius:16px; background:#fff; padding:14px; text-align:left; color:#374151; }
  .pipeline-schedule-types button.is-active { border-color:#ef2d34; background:#fff5f5; color:#b91c1c; box-shadow:0 0 0 2px rgba(239,45,52,.08); }
  .pipeline-schedule-types span { display:flex; flex-direction:column; gap:3px; }
  .pipeline-schedule-types strong { font-size:13px; font-weight:950; }
  .pipeline-schedule-types small { font-size:10px; font-weight:700; color:#6b7280; }
  .pipeline-schedule-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:18px; }
  .pipeline-schedule-grid label, .pipeline-schedule-notes { display:flex; flex-direction:column; gap:7px; font-size:12px; font-weight:900; color:#374151; }
  .pipeline-schedule-grid input, .pipeline-schedule-notes textarea { width:100%; border:1px solid #e5e7eb; border-radius:14px; background:#fff; padding:12px 13px; font:inherit; outline:none; }
  .pipeline-schedule-grid input:focus, .pipeline-schedule-notes textarea:focus { border-color:#ef2d34; box-shadow:0 0 0 3px rgba(239,45,52,.08); }
  .pipeline-schedule-notes { margin-top:14px; }
  .pipeline-schedule-notes textarea { min-height:100px; resize:vertical; }
  .pipeline-schedule-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
  .pipeline-schedule-actions button { min-height:44px; border-radius:14px; padding:0 18px; font-size:12px; font-weight:950; }
  .pipeline-schedule-actions .secondary { border:1px solid #e5e7eb; background:#fff; color:#4b5563; }
  .pipeline-schedule-actions .primary { border:1px solid #ef2d34; background:#ef2d34; color:#fff; }
  .pipeline-schedule-actions .primary:disabled { opacity:.5; cursor:not-allowed; }
  @media (max-width: 640px) {
    .pipeline-schedule-types, .pipeline-schedule-grid { grid-template-columns:1fr; }
    .pipeline-card-actions-uniform { grid-template-columns:1fr 1fr; }
  }
`;