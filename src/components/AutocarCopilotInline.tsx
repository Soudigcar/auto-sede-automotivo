'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Camera, Car, ExternalLink, Eye, Loader2, MapPin, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Vehicle = {
  id: string; brand?: string | null; model?: string | null; version?: string | null; year?: string | null;
  mileage?: string | null; color?: string | null; transmission?: string | null; fuel?: string | null;
  price?: number | null; primary_photo?: string | null; portal_url?: string | null;
};

type Analysis = {
  summary: string; next_best_question: string; suggested_reply: string; score: number;
  temperature: 'FRIO' | 'MORNO' | 'QUENTE'; referenced_vehicles?: Vehicle[];
  intelligence?: { inventory_available_count?: number; inventory_matches?: number };
};

type ShadowAction = {
  capability: string;
  reason: string;
  simulation?: 'would_execute' | 'waiting_confirmation' | 'ready_to_schedule' | 'slot_unavailable' | 'deny' | 'approval' | 'handoff' | string;
  decision?: { effect?: string; source?: string; reason?: string };
};
type OperationalPreview = {
  plan?: { needs_hours?: boolean; needs_availability?: boolean; needs_location?: boolean; needs_photos?: boolean; requested_date?: string; requested_time?: string; photo_vehicle_id?: string };
  hours?: { configured?: boolean; closed?: boolean; intervals?: Array<{ open: string; close: string }>; source?: string } | null;
  availability?: { configured?: boolean; available?: boolean; reason?: string; starts_at?: string; ends_at?: string; conflicts?: Array<{ title?: string; starts_at?: string }> } | null;
  location?: { configured?: boolean; address?: string | null; city?: string | null; state?: string | null; maps_url?: string | null; waze_url?: string | null } | null;
  photos?: { configured?: boolean; vehicle?: string; photos?: string[] } | null;
};
type BookingGuard = {
  state?: 'WAITING_CONFIRMATION' | 'READY_TO_SCHEDULE' | 'SLOT_UNAVAILABLE' | 'NOT_APPLICABLE' | string;
  explicit_confirmation?: boolean;
  reason?: string;
  booking_type?: string;
  requested_date?: string;
  requested_time?: string;
  revalidated?: boolean;
};
type ShadowResult = {
  response?: string; summary?: string; next_best_action?: string; proposed_actions?: ShadowAction[];
  referenced_vehicles?: Vehicle[]; response_policy?: { effect?: string; source?: string; reason?: string };
  intelligence?: { inventory_available_count?: number; inventory_matches?: number; hard_policies_applied?: boolean };
  operational_preview?: OperationalPreview; booking_guard?: BookingGuard; no_external_execution?: boolean;
};

function money(value: unknown) {
  const number = Number(value || 0);
  if (!number) return 'Preço não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(number);
}

function formatDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function actionLabel(action: ShadowAction) {
  if (action.simulation === 'would_execute') return 'WOULD EXECUTE';
  if (action.simulation === 'waiting_confirmation') return 'WAITING CONFIRMATION';
  if (action.simulation === 'ready_to_schedule') return 'READY TO SCHEDULE';
  if (action.simulation === 'slot_unavailable') return 'SLOT UNAVAILABLE';
  return String(action.decision?.effect || action.simulation || 'deny').toUpperCase();
}

function actionBadgeClass(action: ShadowAction) {
  if (action.simulation === 'would_execute' || action.simulation === 'ready_to_schedule') return 'bg-emerald-100 text-emerald-700';
  if (action.simulation === 'waiting_confirmation') return 'bg-amber-100 text-amber-800';
  if (action.simulation === 'slot_unavailable') return 'bg-red-100 text-red-700';
  return 'bg-white text-zinc-600';
}

export default function AutocarCopilotInline({ slug, conversationId, conversationName, onUseReply }: {
  slug: string; conversationId: string; conversationName?: string; onUseReply: (text: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadow, setShadow] = useState<ShadowResult | null>(null);
  const [shadowMeta, setShadowMeta] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setAnalysis(null); setReply(''); setShadow(null); setShadowMeta(''); setError(''); setExpanded(false); }, [conversationId]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    const access = data.session?.access_token || '';
    if (!access) throw new Error('Sessão não encontrada.');
    return access;
  }

  async function analyze() {
    if (!conversationId || !slug) return;
    setLoading(true); setError('');
    try {
      const access = await token();
      const response = await fetch('/api/store/portal/autocar/copilot', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ slug, conversation_id: conversationId }), cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível analisar a conversa.');
      setAnalysis(result.analysis || null); setReply(String(result.analysis?.suggested_reply || '')); setExpanded(true);
    } catch (err: any) { setError(err?.message || 'Erro ao analisar conversa com a AUTOCAR.'); }
    finally { setLoading(false); }
  }

  async function testShadow() {
    if (!conversationId || !slug) return;
    setShadowLoading(true); setError(''); setShadow(null); setShadowMeta('');
    try {
      const access = await token();
      const response = await fetch('/api/store/portal/autocar/runtime', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ slug, conversation_id: conversationId, action: 'process-latest-inbound' }), cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível executar o Shadow Mode.');
      const claimResult = result?.result?.claim?.result || {};
      const generated = result?.result?.shadow || (claimResult?.shadow_mode_version ? claimResult : null);
      setShadow(generated || null);
      if (result?.result?.duplicate) setShadowMeta('Esta mensagem já havia sido processada. Resultado reutilizado por idempotência.');
      else if (!result?.result?.ready) setShadowMeta(result?.result?.claim?.result?.reason || `Shadow não executável no modo ${String(result?.result?.effectiveMode || 'off').toUpperCase()}.`);
      else setShadowMeta('Shadow concluído. Nenhuma mensagem, foto, localização ou agendamento foi executado.');
      setExpanded(true);
    } catch (err: any) { setError(err?.message || 'Erro ao executar Shadow Mode.'); }
    finally { setShadowLoading(false); }
  }

  function useReply() { const text = reply.trim(); if (text) onUseReply(text); }
  const op = shadow?.operational_preview;
  const booking = shadow?.booking_guard;

  return (
    <section className="border-t border-zinc-200 bg-white px-2.5 pt-2.5">
      <div className="rounded-2xl border border-red-100 bg-red-50/40 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-red-600"><Sparkles size={13} /> AUTOCAR</p><p className="mt-1 truncate text-[11px] font-bold text-zinc-600">Conversa ativa: <b className="text-zinc-900">{conversationName || 'Cliente WhatsApp'}</b></p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void testShadow()} disabled={shadowLoading || loading || !conversationId} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-[10px] font-black uppercase text-amber-800 disabled:opacity-50">{shadowLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} {shadowLoading ? 'Simulando...' : 'Testar Shadow'}</button>
            <button type="button" onClick={() => void analyze()} disabled={loading || shadowLoading || !conversationId} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#071020] px-4 text-[10px] font-black uppercase text-white disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />} {loading ? 'Analisando...' : 'Copilot'}</button>
          </div>
        </div>

        {error ? <div className="mt-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-[10px] font-bold text-red-700">{error}</div> : null}
        {shadowMeta ? <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-900">{shadowMeta}</div> : null}

        {shadow ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700"><ShieldCheck size={13} /> AUTOPILOT SHADOW MODE</p><span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black uppercase text-amber-800">não executa ações</span></div>
            <p className="mt-3 text-[9px] font-black uppercase text-zinc-400">Resposta que seria enviada</p>
            <div className="mt-1 rounded-xl bg-zinc-50 p-3 text-xs font-semibold leading-relaxed text-zinc-800">{shadow.response || 'Sem resposta gerada.'}</div>
            {shadow.next_best_action ? <p className="mt-2 text-[10px] font-bold text-zinc-600">Próxima ação: <b className="text-zinc-900">{shadow.next_best_action}</b></p> : null}

            {booking && booking.state !== 'NOT_APPLICABLE' ? (
              <div className={`mt-3 rounded-xl border p-3 ${booking.state === 'READY_TO_SCHEDULE' ? 'border-emerald-200 bg-emerald-50' : booking.state === 'SLOT_UNAVAILABLE' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-[9px] font-black uppercase text-zinc-700"><CalendarClock size={13} /> Booking Confirmation Guard</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase text-zinc-700">{booking.state?.replaceAll('_', ' ')}</span>
                </div>
                <p className="mt-1 text-[10px] font-bold text-zinc-700">{booking.reason}</p>
                {(booking.requested_date || booking.requested_time) ? <p className="mt-1 text-[9px] text-zinc-500">Slot: {[booking.requested_date, booking.requested_time].filter(Boolean).join(' · ')}{booking.revalidated ? ' · Calendário revalidado' : ''}</p> : null}
              </div>
            ) : null}

            {op && (op.availability || op.location || op.photos || op.hours) ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {op.availability ? <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-700"><CalendarClock size={13} /> Disponibilidade consultada</p><p className="mt-1 text-[10px] font-bold text-zinc-700">{op.availability.available ? 'HORÁRIO LIVRE' : 'NÃO DISPONÍVEL'}{op.plan?.requested_date && op.plan?.requested_time ? ` · ${op.plan.requested_date} ${op.plan.requested_time}` : ''}</p><p className="mt-1 text-[9px] text-zinc-500">{op.availability.reason || 'Consulta no calendário real'}</p>{op.availability.conflicts?.length ? <p className="mt-1 text-[9px] text-zinc-500">Conflito: {op.availability.conflicts[0]?.title} · {formatDateTime(op.availability.conflicts[0]?.starts_at)}</p> : null}</div> : null}
                {op.location ? <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-700"><MapPin size={13} /> Localização consultada</p><p className="mt-1 text-[10px] font-bold text-zinc-700">{op.location.configured ? (op.location.address || [op.location.city, op.location.state].filter(Boolean).join(' / ') || 'Configurada') : 'NÃO CONFIGURADA'}</p>{op.location.maps_url ? <p className="mt-1 truncate text-[9px] text-zinc-500">Maps configurado</p> : null}</div> : null}
                {op.photos ? <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2.5"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase text-violet-700"><Camera size={13} /> Fotos consultadas</p><p className="mt-1 text-[10px] font-bold text-zinc-700">{op.photos.vehicle || 'Veículo'} · {op.photos.photos?.length || 0} foto(s)</p><p className="mt-1 text-[9px] text-zinc-500">Somente leitura; nenhuma imagem enviada.</p></div> : null}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 md:grid-cols-2">{(shadow.proposed_actions || []).map((action, index) => <div key={`${action.capability}-${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5"><div className="flex items-center justify-between gap-2"><b className="text-[9px] uppercase text-zinc-800">{action.capability}</b><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${actionBadgeClass(action)}`}>{actionLabel(action)}</span></div><p className="mt-1 text-[9px] font-semibold leading-relaxed text-zinc-500">{action.decision?.reason || action.reason}</p></div>)}</div>
          </div>
        ) : null}

        {analysis && expanded ? (
          <div className="mt-2 grid gap-2">
            <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase text-zinc-400">Resposta sugerida · editável</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[8px] font-black text-zinc-600">{analysis.score} · {analysis.temperature}</span></div>
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold leading-relaxed text-zinc-800 outline-none focus:border-red-300 focus:bg-white" />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[9px] font-bold text-zinc-400">O Copilot não envia. Este botão apenas preenche o campo do Inbox.</p><button type="button" onClick={useReply} disabled={!reply.trim()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-[10px] font-black uppercase text-white disabled:opacity-50"><Sparkles size={13} /> Usar resposta</button></div>
              </div>
              <div className="min-w-[190px] rounded-xl border border-zinc-200 bg-white p-3 text-[10px] font-bold text-zinc-600"><p className="text-[9px] font-black uppercase text-zinc-400">Contexto real</p><p className="mt-2">Estoque disponível: <b className="text-zinc-900">{analysis.intelligence?.inventory_available_count ?? 0}</b></p><p className="mt-1">Pré-matches: <b className="text-zinc-900">{analysis.intelligence?.inventory_matches ?? 0}</b></p>{analysis.next_best_question ? <p className="mt-2 leading-relaxed text-zinc-500">Próxima pergunta: <b className="text-zinc-800">{analysis.next_best_question}</b></p> : null}</div>
            </div>
            {analysis.referenced_vehicles?.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{analysis.referenced_vehicles.map((vehicle) => <article key={vehicle.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">{vehicle.primary_photo ? <img src={vehicle.primary_photo} alt={`${vehicle.brand || ''} ${vehicle.model || ''}`} className="h-28 w-full object-cover" /> : <div className="flex h-20 items-center justify-center bg-zinc-100 text-zinc-400"><Car size={25} /></div>}<div className="p-3"><p className="text-[10px] font-black uppercase text-zinc-950">{vehicle.brand} {vehicle.model}</p><p className="mt-0.5 text-[9px] font-bold text-zinc-500">{vehicle.version || 'Versão não informada'} · {vehicle.year || 'Ano não informado'}</p><p className="mt-2 text-sm font-black text-red-600">{money(vehicle.price)}</p><p className="mt-1 text-[9px] font-bold text-zinc-500">{[vehicle.mileage, vehicle.transmission, vehicle.fuel].filter(Boolean).join(' · ')}</p>{vehicle.portal_url ? <a href={vehicle.portal_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase text-zinc-700 hover:text-red-600">Ver anúncio <ExternalLink size={11} /></a> : null}</div></article>)}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
