'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, UsersRound, X } from 'lucide-react';
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

const legacyAppointmentSuccess = 'Agendamento criado: tarefa adicionada ao calendário.';

export default function WhatsappCommerceActions(props: WhatsappCommerceActionsProps) {
  const supabase = createClient();
  const requestRef = useRef(0);
  const [responsibleName, setResponsibleName] = useState('');
  const [responsibleState, setResponsibleState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitSaving, setVisitSaving] = useState(false);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadResponsible() {
    const requestId = ++requestRef.current;

    if (!props.leadId) {
      setResponsibleName('');
      setResponsibleState('idle');
      return;
    }

    setResponsibleName('');
    setResponsibleState('loading');

    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão não encontrada.');

      const query = new URLSearchParams({
        slug: props.slug,
        lead_id: props.leadId
      });
      const response = await fetch(`/api/store/lead-responsible?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o responsável.');
      if (requestId !== requestRef.current) return;

      setResponsibleName(String(result.responsible?.full_name || '').trim());
      setResponsibleState('loaded');
    } catch {
      if (requestId !== requestRef.current) return;
      setResponsibleName('');
      setResponsibleState('error');
    }
  }

  async function refreshWithResponsible() {
    await props.onRefresh();
    await loadResponsible();
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
      await refreshWithResponsible();
    } catch (error: any) {
      props.onStatus(error?.message || 'Erro ao agendar visita.');
    } finally {
      setVisitSaving(false);
    }
  }

  useEffect(() => {
    void loadResponsible();
    return () => {
      requestRef.current += 1;
    };
  }, [props.leadId, props.slug]);

  useEffect(() => {
    setVisitOpen(false);
    setVisitSaving(false);
  }, [props.conversationId]);

  const responsibleLabel = responsibleState === 'error'
    ? 'Responsável: indisponível'
    : responsibleState === 'loaded'
      ? `Responsável: ${responsibleName || 'Carteira geral da loja'}`
      : 'Responsável: carregando...';

  return (
    <>
      {props.leadId ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 font-black text-zinc-600 ${props.compact ? 'h-11 max-w-[210px] text-[10px]' : 'h-9 max-w-[230px] text-[9px]'}`}
          aria-label={responsibleLabel}
          title={responsibleLabel}
        >
          <UsersRound size={14} className="shrink-0 text-red-500" />
          <span className="truncate">{responsibleLabel}</span>
        </span>
      ) : null}

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
        onRefresh={refreshWithResponsible}
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
    </>
  );
}
