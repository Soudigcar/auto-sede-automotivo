'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, ChevronUp, Loader2, LockKeyhole, PauseCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Mode = 'off' | 'copilot' | 'autopilot';
type Status = {
  execution_mode: Mode;
  store_selected_mode: Mode;
  master_enabled: boolean;
  master_autopilot_allowed: boolean;
  autopilot_preview_only: boolean;
  automatic_replies_enabled: boolean;
  permissions: { manage: boolean };
};

const modes: Array<{ id: Mode; label: string; helper: string }> = [
  { id: 'off', label: 'OFF', helper: 'Pausa o atendimento normal da AUTOCAR na loja.' },
  { id: 'copilot', label: 'COPILOT', helper: 'Atendimento normal: analisa e sugere para o humano.' },
  { id: 'autopilot', label: 'AUTOPILOT', helper: 'Atendimento normal em modo autônomo; Preview sem envio real.' }
];

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

export function StoreAutocarModeControl() {
  const params = useParams();
  const pathname = usePathname();
  const slug = String(params?.slug || '');
  const isFollowUpPage = pathname?.includes('/autocar/follow-up') === true;
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(!isFollowUpPage);

  useEffect(() => {
    setExpanded(!isFollowUpPage);
  }, [isFollowUpPage]);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    if (!slug) return;
    setBusy(true);
    try {
      const access = await token();
      if (!access) throw new Error('Sessão da loja expirada.');
      const body = await responseJson(await fetch(`/api/store/portal/autocar/foundation-status?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${access}` }, cache: 'no-store'
      }));
      setStatus(body);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o modo AUTOCAR.');
    } finally {
      setBusy(false);
    }
  }, [slug, token]);

  useEffect(() => { void load(); }, [load]);

  async function selectMode(mode: Mode) {
    if (!status?.permissions.manage || busy) return;
    setBusy(true);
    setMessage(`Alterando atendimento geral para ${mode.toUpperCase()}...`);
    try {
      const access = await token();
      const body = await responseJson(await fetch('/api/store/portal/autocar/foundation-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, mode })
      }));
      setStatus(body);
      setMessage(body.message || 'Modo geral salvo no Preview.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível alterar o modo geral da AUTOCAR.');
    } finally {
      setBusy(false);
    }
  }

  const masterEnabled = Boolean(status?.master_enabled);
  const autopilotAllowed = Boolean(status?.master_autopilot_allowed);
  const effective = status?.execution_mode || 'off';

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-5 right-5 z-[470] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-xl shadow-black/15"
        title="Abrir modo geral da AUTOCAR"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Bot size={17} /></span>
        <span className="min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Modo geral da AUTOCAR</span>
          <span className="block text-xs font-black text-zinc-950">Atendimento normal · {effective.toUpperCase()}</span>
        </span>
        <ChevronUp size={16} className="shrink-0 text-zinc-400" />
      </button>
    );
  }

  return (
    <section className="fixed bottom-5 right-5 z-[470] w-[390px] max-w-[calc(100vw-2rem)] rounded-[24px] border border-zinc-200 bg-white p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-red-600"><Sparkles size={13} /> Controle da sua AUTOCAR</p>
          <h3 className="mt-1 text-base font-black text-zinc-950">Modo geral da AUTOCAR</h3>
          <p className="mt-1 text-[10px] font-bold leading-4 text-zinc-500">Controla o atendimento normal da AUTOCAR. Não altera o modo do Smart Follow-up.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500" title="Atualizar modo geral"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={() => setExpanded(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500" title="Recolher painel"><ChevronDown size={15} /></button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-black uppercase">
        <div className={`rounded-xl px-3 py-2 ${masterEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{masterEnabled ? <CheckCircle2 size={12} className="mr-1 inline" /> : <LockKeyhole size={12} className="mr-1 inline" />}AUTOCAR {masterEnabled ? 'liberada' : 'bloqueada'}</div>
        <div className={`rounded-xl px-3 py-2 ${autopilotAllowed ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-500'}`}>{autopilotAllowed ? <Bot size={12} className="mr-1 inline" /> : <LockKeyhole size={12} className="mr-1 inline" />}AUTOPILOT GERAL {autopilotAllowed ? 'permitido' : 'bloqueado'}</div>
      </div>

      <div className="mt-3 space-y-2">
        {modes.map((mode) => {
          const locked = !masterEnabled || (mode.id === 'autopilot' && !autopilotAllowed);
          const active = effective === mode.id;
          return <button key={mode.id} type="button" disabled={busy || locked || !status?.permissions.manage} onClick={() => void selectMode(mode.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-white'}`}>
            <span><b className="block text-xs text-zinc-900">{mode.label}</b><span className="text-[9px] font-bold text-zinc-500">{mode.helper}</span></span>
            {locked ? <LockKeyhole size={17} className="text-zinc-400" /> : active ? <CheckCircle2 size={17} className="text-red-600" /> : mode.id === 'off' ? <PauseCircle size={17} className="text-zinc-500" /> : <Bot size={17} className="text-zinc-500" />}
          </button>;
        })}
      </div>

      {!status?.permissions.manage && status ? <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-[9px] font-black text-zinc-600">Somente o gestor da loja pode alterar este modo.</p> : null}
      <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-[9px] font-black leading-4 text-sky-800"><strong>Importante:</strong> este painel controla somente o modo geral do atendimento AUTOCAR. O Smart Follow-up possui status e modo próprios na página de Follow-up.</p>
      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[9px] font-black leading-4 text-amber-800">Preview seguro: selecionar AUTOPILOT geral não habilita Follow-up automático, webhook autônomo ou ações externas desta nova funcionalidade.</p>
      {message ? <p className="mt-2 flex items-center gap-2 text-[10px] font-bold text-zinc-600">{busy ? <Loader2 size={12} className="animate-spin" /> : null}{message}</p> : null}
    </section>
  );
}
