'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Loader2, LockKeyhole, PauseCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Mode = 'off' | 'copilot' | 'autopilot';
type Status = {
  execution_mode: Mode;
  store_selected_mode: Mode;
  master_enabled: boolean;
  master_autopilot_allowed: boolean;
  autopilot_preview_only: boolean;
  automatic_replies_enabled: boolean;
  environment: 'autocar-dev' | 'autocar-production';
  vercel_environment: string;
  mode_governance?: {
    allowed: boolean;
    scope: 'preview_dev' | 'development_dev' | 'production_live' | 'blocked';
    writes_to: 'autocar-dev' | 'autocar-production' | 'none';
    live_configuration: boolean;
    reason: string;
  };
  permissions: { manage: boolean };
};

const modes: Array<{ id: Mode; label: string; helper: string }> = [
  { id: 'off', label: 'OFF', helper: 'Pausa a AUTOCAR na loja.' },
  { id: 'copilot', label: 'COPILOT', helper: 'Analisa e sugere para o humano.' },
  { id: 'autopilot', label: 'AUTOPILOT', helper: 'Atendimento autônomo dentro dos gates Master e SAFE CORE.' }
];

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

export function StoreAutocarModeControl() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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
    if (!status?.permissions.manage || busy || status?.mode_governance?.allowed === false) return;
    setBusy(true);
    setMessage(`Alterando para ${mode.toUpperCase()}...`);
    try {
      const access = await token();
      const body = await responseJson(await fetch('/api/store/portal/autocar/foundation-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, mode })
      }));
      setStatus(body);
      setMessage(body.message || 'Modo atualizado.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível alterar o modo.');
    } finally {
      setBusy(false);
    }
  }

  const masterEnabled = Boolean(status?.master_enabled);
  const autopilotAllowed = Boolean(status?.master_autopilot_allowed);
  const effective = status?.execution_mode || 'off';
  const governanceBlocked = status?.mode_governance?.allowed === false;
  const liveConfiguration = status?.mode_governance?.live_configuration === true;
  const environmentLabel = liveConfiguration ? 'LIVE · AUTOCAR PRODUCTION' : 'PREVIEW/DEV · AUTOCAR DEV';

  return (
    <section className="fixed bottom-5 right-5 z-[470] w-[390px] max-w-[calc(100vw-2rem)] rounded-[24px] border border-zinc-200 bg-white p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-red-600"><Sparkles size={13} /> Controle real da sua AUTOCAR</p>
          <h3 className="mt-1 text-base font-black text-zinc-950">Modo operacional</h3>
          <p className="mt-1 text-[10px] font-bold text-zinc-500">A loja escolhe o modo dentro do que foi liberado pelo Master.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
      </div>

      <div className={`mt-3 rounded-xl px-3 py-2 text-[9px] font-black uppercase ${liveConfiguration ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
        {environmentLabel}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-black uppercase">
        <div className={`rounded-xl px-3 py-2 ${masterEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{masterEnabled ? <CheckCircle2 size={12} className="mr-1 inline" /> : <LockKeyhole size={12} className="mr-1 inline" />}MASTER · AUTOCAR {masterEnabled ? 'liberada' : 'bloqueada'}</div>
        <div className={`rounded-xl px-3 py-2 ${autopilotAllowed ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-500'}`}>{autopilotAllowed ? <Bot size={12} className="mr-1 inline" /> : <LockKeyhole size={12} className="mr-1 inline" />}MASTER · AUTOPILOT {autopilotAllowed ? 'permitido' : 'bloqueado'}</div>
      </div>

      <div className="mt-3 space-y-2">
        {modes.map((mode) => {
          const locked = governanceBlocked || !masterEnabled || (mode.id === 'autopilot' && !autopilotAllowed);
          const active = effective === mode.id;
          return <button key={mode.id} type="button" disabled={busy || locked || !status?.permissions.manage} onClick={() => void selectMode(mode.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-white'}`}>
            <span><b className="block text-xs text-zinc-900">LOJA · {mode.label}</b><span className="text-[9px] font-bold text-zinc-500">{mode.helper}</span></span>
            {locked ? <LockKeyhole size={17} className="text-zinc-400" /> : active ? <CheckCircle2 size={17} className="text-red-600" /> : mode.id === 'off' ? <PauseCircle size={17} className="text-zinc-500" /> : <Bot size={17} className="text-zinc-500" />}
          </button>;
        })}
      </div>

      {!status?.permissions.manage && status ? <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-[9px] font-black text-zinc-600">Somente o gestor da loja pode alterar este modo.</p> : null}
      {status?.mode_governance ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-[9px] font-black leading-4 ${liveConfiguration ? 'bg-red-50 text-red-800' : governanceBlocked ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
          {liveConfiguration
            ? 'ATENÇÃO: este é o controle LIVE. Alterar o modo grava em AUTOCAR Production e pode afetar atendimentos reais, sempre limitado pelo Master e pelo SAFE CORE.'
            : status.mode_governance.reason}
        </p>
      ) : null}
      {message ? <p className="mt-2 flex items-center gap-2 text-[10px] font-bold text-zinc-600">{busy ? <Loader2 size={12} className="animate-spin" /> : null}{message}</p> : null}
    </section>
  );
}
