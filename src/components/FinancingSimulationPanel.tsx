'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Landmark, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { financingStatusLabel, type FinancingSimulationCommand } from '@/lib/financingSimulationV1';

type Simulation = {
  id: string;
  status: string;
  outcome: string | null;
  vehicle_name_snapshot: string | null;
  requested_without_down_payment: boolean | null;
  requested_down_payment_value: number | string | null;
  requested_installment_count: number | null;
  requested_installment_value: number | string | null;
  requested_financed_amount: number | string | null;
  financing_bank: string | null;
  banks_consulted_count: number | null;
  preapproved_count: number | null;
  approval_indicator_percent: number | string | null;
  approval_indicator_source: string | null;
  result_source: string | null;
  sanitized_notes: string | null;
  version: number;
};

type Bundle = {
  lead: { interested_vehicle: string | null };
  current: Simulation | null;
  readiness: { ready: boolean; customerDataReady: boolean; requestReady: boolean; missing: string[] };
  permissions: { can_manage: boolean; can_record_result: boolean; can_expire: boolean };
  events: Array<{ id: string; event_type: string; from_status: string | null; to_status: string; created_at: string }>;
};

type Failure = Error & { code?: string };
type Props = { slug: string; leadId: string };

const missingLabels: Record<string, string> = {
  vehicle: 'Veículo', down_payment: 'Entrada', installments: 'Parcelas',
  driver_license: 'CNH', cpf: 'CPF', birth_date: 'Nascimento'
};

function valueOf(value: unknown) { return value === null || value === undefined ? '' : String(value); }
function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('Este navegador não oferece identificador seguro para a operação.');
}

export function FinancingSimulationPanel({ slug, leadId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [schemaPending, setSchemaPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const [entryMode, setEntryMode] = useState('');
  const [entryValue, setEntryValue] = useState('');
  const [installments, setInstallments] = useState('');
  const [desiredInstallment, setDesiredInstallment] = useState('');
  const [financedAmount, setFinancedAmount] = useState('');
  const [outcome, setOutcome] = useState('preapproved');
  const [resultSource, setResultSource] = useState('manual');
  const [bank, setBank] = useState('');
  const [banksConsulted, setBanksConsulted] = useState('');
  const [preapprovedCount, setPreapprovedCount] = useState('');
  const [indicator, setIndicator] = useState('');
  const [indicatorSource, setIndicatorSource] = useState('');
  const [notes, setNotes] = useState('');

  const sync = useCallback((simulation: Simulation | null) => {
    setEntryMode(simulation?.requested_without_down_payment === true ? 'none' : simulation?.requested_without_down_payment === false ? 'with' : '');
    setEntryValue(valueOf(simulation?.requested_down_payment_value));
    setInstallments(valueOf(simulation?.requested_installment_count));
    setDesiredInstallment(valueOf(simulation?.requested_installment_value));
    setFinancedAmount(valueOf(simulation?.requested_financed_amount));
    setOutcome(simulation?.outcome || 'preapproved');
    setResultSource(simulation?.result_source || 'manual');
    setBank(simulation?.financing_bank || '');
    setBanksConsulted(valueOf(simulation?.banks_consulted_count));
    setPreapprovedCount(valueOf(simulation?.preapproved_count));
    setIndicator(valueOf(simulation?.approval_indicator_percent));
    setIndicatorSource(simulation?.approval_indicator_source || '');
    setNotes(simulation?.sanitized_notes || '');
  }, []);

  const request = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(payload.error || 'Não foi possível concluir a operação.') as Failure;
      failure.code = payload.code;
      throw failure;
    }
    return payload;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await request(`/api/store/portal/pipeline/lead-financing?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(leadId)}`) as Bundle;
      setBundle(data); setSchemaPending(false); sync(data.current);
    } catch (caught) {
      const failure = caught as Failure;
      if (failure.code === 'FINANCING_SCHEMA_PENDING') { setSchemaPending(true); setBundle(null); }
      else setError(failure.message);
    } finally { setLoading(false); }
  }, [leadId, request, slug, sync]);

  useEffect(() => { void load(); }, [load]);

  async function command(name: FinancingSimulationCommand) {
    setBusy(true); setError(''); setFeedback('');
    try {
      const current = bundle?.current;
      const data = await request('/api/store/portal/pipeline/lead-financing', {
        method: 'POST',
        body: JSON.stringify({
          slug, lead_id: leadId, simulation_id: current?.id || null,
          expected_version: current?.version || null, command: name, request_id: newRequestId(),
          ...(name === 'start' || name === 'update_request' ? {
            requested_without_down_payment: entryMode === 'none' ? true : entryMode === 'with' ? false : null,
            requested_down_payment_value: entryMode === 'with' ? entryValue : null,
            requested_installment_count: installments,
            requested_installment_value: desiredInstallment,
            requested_financed_amount: financedAmount
          } : {}),
          ...(name === 'record_result' ? {
            outcome, result_source: resultSource, financing_bank: bank,
            banks_consulted_count: banksConsulted, preapproved_count: preapprovedCount,
            approval_indicator_percent: indicator, approval_indicator_source: indicatorSource,
            sanitized_notes: notes
          } : {})
        })
      }) as Bundle;
      setBundle(data); sync(data.current); setFeedback('Etapa atualizada com auditoria e idempotência.');
    } catch (caught) {
      const failure = caught as Failure;
      if (failure.code === 'FINANCING_PREVIEW_READ_ONLY') setFeedback('Preview somente leitura: a interface foi validada sem gravar dados.');
      else if (failure.code === 'FINANCING_SCHEMA_PENDING') setSchemaPending(true);
      else setError(failure.message);
    } finally { setBusy(false); }
  }

  const current = bundle?.current;
  const status = current?.status || 'not_started';
  const requestEditable = !current || ['collecting_data', 'ready_to_submit'].includes(status);
  const resultEditable = Boolean(current && bundle?.permissions.can_record_result && ['waiting_result', 'result_available'].includes(status));

  return (
    <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm" data-financing-simulation-v1>
      <header className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><Landmark size={22} /></span>
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Financiamento V1</p><h3 className="text-lg font-black">Ciclo da simulação</h3><p className="text-xs text-zinc-500">CRM oficial + projeção sanitizada para a AUTOCAR.</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700">{financingStatusLabel(status)}</span><button type="button" onClick={() => void load()} disabled={loading || busy} className="rounded-xl border p-2 text-zinc-600"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></div>
      </header>

      {loading ? <div className="mt-4 flex h-28 items-center justify-center rounded-xl bg-zinc-50"><Loader2 className="animate-spin text-blue-600" /></div> : null}
      {schemaPending ? <Notice icon={<AlertTriangle size={20} />} title="Preview seguro: migration não aplicada" text="A interface, API e validações estão prontas, mas nenhuma gravação está disponível. Nenhum banco ou dado real foi alterado." tone="amber" /> : null}

      {!loading && !schemaPending && bundle ? <>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Ready label="Dados do cliente" ok={bundle.readiness.customerDataReady} text="CNH, CPF e nascimento ficam somente no CRM." />
          <Ready label="Condição desejada" ok={bundle.readiness.requestReady} text="Veículo, entrada e parcelas." />
          <Ready label="Pronta para envio" ok={bundle.readiness.ready} text={bundle.readiness.ready ? 'Requisitos completos.' : 'Ainda existem pendências.'} />
        </div>
        {bundle.readiness.missing.length ? <div className="mt-3 flex flex-wrap gap-2">{bundle.readiness.missing.map((item) => <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-800">Falta: {missingLabels[item] || item}</span>)}</div> : null}

        <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
          <h4 className="font-black">Condição solicitada</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Entrada"><select value={entryMode} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEntryMode(e.target.value)} disabled={!requestEditable || !bundle.permissions.can_manage} className="control"><option value="">Selecione</option><option value="none">Sem entrada</option><option value="with">Com entrada</option></select></Field>
            <Input label="Valor da entrada" value={entryValue} setValue={setEntryValue} disabled={entryMode !== 'with' || !requestEditable} />
            <Input label="Quantidade de parcelas" value={installments} setValue={setInstallments} />
            <Input label="Parcela desejada" value={desiredInstallment} setValue={setDesiredInstallment} />
            <Input label="Valor a financiar" value={financedAmount} setValue={setFinancedAmount} />
            <Field label="Veículo"><input readOnly value={current?.vehicle_name_snapshot || bundle.lead.interested_vehicle || 'Vincule um veículo ao lead'} className="control" /></Field>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {!current || ['completed', 'cancelled', 'expired'].includes(status) ? <Button label="Iniciar simulação" onClick={() => void command('start')} disabled={busy || !bundle.permissions.can_manage} /> : null}
            {current && requestEditable ? <Button label="Salvar condição" onClick={() => void command('update_request')} secondary disabled={busy} /> : null}
            {status === 'collecting_data' ? <Button label="Marcar pronta" onClick={() => void command('mark_ready')} disabled={busy || !bundle.readiness.ready} /> : null}
            {status === 'ready_to_submit' ? <Button label="Registrar envio" onClick={() => void command('submit')} disabled={busy} /> : null}
          </div>
        </div>

        {resultEditable ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex gap-2"><ShieldCheck className="text-emerald-700" size={20} /><div><h4 className="font-black">Registrar retorno real</h4><p className="text-xs text-zinc-600">Somente fatos recebidos de fonte identificada.</p></div></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Resultado"><select value={outcome} onChange={(e: ChangeEvent<HTMLSelectElement>) => setOutcome(e.target.value)} className="control"><option value="preapproved">Pré-aprovada</option><option value="approved">Aprovada</option><option value="declined">Recusada</option><option value="needs_review">Requer revisão</option><option value="no_offer">Sem proposta</option></select></Field>
            <Field label="Origem"><select value={resultSource} onChange={(e: ChangeEvent<HTMLSelectElement>) => setResultSource(e.target.value)} className="control"><option value="manual">Registro manual</option><option value="external_portal">Portal externo</option><option value="bank_integration">Integração bancária</option><option value="import">Importação</option></select></Field>
            <Input label="Banco" value={bank} setValue={setBank} type="text" />
            <Input label="Bancos consultados" value={banksConsulted} setValue={setBanksConsulted} />
            <Input label="Pré-aprovações" value={preapprovedCount} setValue={setPreapprovedCount} />
            <Input label="Indicador (%)" value={indicator} setValue={setIndicator} />
            <Input label="Origem do indicador" value={indicatorSource} setValue={setIndicatorSource} type="text" />
            <Field label="Observação sanitizada"><textarea value={notes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} className="control min-h-20" placeholder="Não informe CPF, CNH, nascimento, e-mail ou documentos." /></Field>
          </div>
          <div className="mt-3 flex justify-end"><Button label={status === 'result_available' ? 'Atualizar resultado' : 'Registrar resultado'} onClick={() => void command('record_result')} disabled={busy} /></div>
        </div> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {status === 'result_available' ? <Button label="Marcar resultado comunicado" onClick={() => void command('mark_communicated')} disabled={busy} /> : null}
          {status === 'communicated' ? <Button label="Iniciar agendamento" onClick={() => void command('start_scheduling')} disabled={busy} /> : null}
          {['communicated', 'scheduling'].includes(status) ? <Button label="Concluir jornada" onClick={() => void command('complete')} disabled={busy} /> : null}
          {current && !['completed', 'cancelled', 'expired'].includes(status) ? <Button label="Cancelar" onClick={() => window.confirm('Cancelar esta simulação?') && void command('cancel')} danger disabled={busy} /> : null}
        </div>

        <Notice icon={<Sparkles size={20} />} title="Estratégia “duas notícias”: Draft não publicado" text="Ela não entra no runtime até passar por simulação, aprovação e publicação separadas. A AUTOCAR nunca recebe CPF, CNH ou data de nascimento." tone="violet" />
        {bundle.events.length ? <div className="mt-4"><p className="text-xs font-black uppercase text-zinc-500">Histórico auditável</p>{bundle.events.slice(0, 5).map((event) => <div key={event.id} className="mt-2 flex justify-between rounded-xl border px-3 py-2 text-xs"><strong>{event.event_type.replace(/_/g, ' ')}</strong><span>{financingStatusLabel(event.to_status)}</span></div>)}</div> : null}
      </> : null}

      {feedback ? <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800">{feedback}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      <style jsx>{`.control{margin-top:.5rem;width:100%;border:1px solid #e4e4e7;border-radius:.75rem;background:#fff;padding:.75rem;font-size:.875rem;font-weight:700;color:#18181b}.control:disabled{background:#f4f4f5;color:#71717a}`}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-black text-zinc-700">{label}{children}</label>; }
function Input({ label, value, setValue, disabled = false, type = 'number' }: { label: string; value: string; setValue: (value: string) => void; disabled?: boolean; type?: string }) { return <Field label={label}><input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} disabled={disabled} className="control" /></Field>; }
function Button({ label, onClick, disabled, secondary, danger }: { label: string; onClick: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean }) { const tone = danger ? 'bg-red-50 text-red-700 border-red-200' : secondary ? 'bg-white text-zinc-800 border-zinc-200' : 'bg-blue-600 text-white border-blue-600'; return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-xl border px-4 py-3 text-xs font-black disabled:opacity-50 ${tone}`}>{label}</button>; }
function Ready({ label, ok, text }: { label: string; ok: boolean; text: string }) { return <div className={`rounded-xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2">{ok ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}<strong className="text-xs">{label}</strong></div><p className="mt-1 text-[11px]">{text}</p></div>; }
function Notice({ icon, title, text, tone }: { icon: ReactNode; title: string; text: string; tone: 'amber' | 'violet' }) { const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-violet-200 bg-violet-50 text-violet-900'; return <div className={`mt-4 flex gap-3 rounded-2xl border p-4 ${cls}`}>{icon}<div><p className="font-black">{title}</p><p className="mt-1 text-sm">{text}</p></div></div>; }
