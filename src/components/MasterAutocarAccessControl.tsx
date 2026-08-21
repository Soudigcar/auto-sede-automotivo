'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Loader2, LockKeyhole, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Mode = 'off' | 'copilot' | 'autopilot';
type StoreRow = {
  id: string;
  store_name: string;
  slug: string | null;
  autocar: null | {
    mode: Mode;
    store_selected_mode: Mode;
    master_enabled: boolean;
    master_autopilot_allowed: boolean;
  };
};
type RuntimeStatus = {
  runtime_environment?: string;
  automatic_replies_enabled?: boolean;
  automatic_replies_reason?: string;
  vercel_environment?: string;
};

function environmentLabel(value: string | undefined) {
  return value === 'autocar-production' ? 'AUTOCAR Production' : 'AUTOCAR DEV';
}

async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

export function MasterAutocarAccessControl() {
  const supabase = useMemo(() => createClient(), []);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const access = await token();
      if (!access) throw new Error('Sessão Master expirada.');
      const body = await json(await fetch('/api/master/autocar', {
        headers: { Authorization: `Bearer ${access}` },
        cache: 'no-store'
      }));
      const rows = (body.stores || []) as StoreRow[];
      setStores(rows);
      setRuntime(body.runtime || null);
      setSelectedId((current) => current && rows.some((row) => row.id === current)
        ? current
        : rows[0]?.id || '');
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao carregar governança AUTOCAR.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const selected = stores.find((row) => row.id === selectedId) || null;
  const enabled = Boolean(selected?.autocar?.master_enabled);
  const autopilotAllowed = Boolean(selected?.autocar?.master_autopilot_allowed);
  const storeMode = selected?.autocar?.store_selected_mode || 'off';
  const effectiveMode = selected?.autocar?.mode || 'off';
  const currentEnvironment = environmentLabel(runtime?.runtime_environment);
  const executionMessage = runtime?.automatic_replies_reason
    || 'A execução externa permanece subordinada ao SAFE CORE e ao estado do ambiente.';

  async function save(nextEnabled: boolean, nextAutopilotAllowed: boolean) {
    if (!selected) return;
    setBusy(true);
    setMessage(`Atualizando governança de ${selected.store_name}...`);
    try {
      const access = await token();
      const body = await json(await fetch('/api/master/autocar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'set-store-access',
          store_id: selected.id,
          enabled: nextEnabled,
          autopilot_allowed: nextEnabled && nextAutopilotAllowed
        })
      }));
      await load();
      setMessage(`Governança salva em ${environmentLabel(body.environment)}.`);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível atualizar a governança.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fixed bottom-5 right-5 z-[470] w-[410px] max-w-[calc(100vw-2rem)] rounded-[24px] border border-zinc-200 bg-white p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-red-600"><ShieldCheck size={13} /> Governança dupla · {currentEnvironment}</p>
          <h3 className="mt-1 text-base font-black text-zinc-950">Master → Loja</h3>
          <p className="mt-1 text-[10px] font-bold leading-4 text-zinc-500">O Master libera a capacidade. A loja escolhe o modo dentro desse limite.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500" title="Atualizar"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
      </div>

      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy} className="mt-3 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-800 outline-none">
        {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
      </select>

      {selected ? <div className="mt-3 space-y-2">
        <button type="button" disabled={busy} onClick={() => void save(!enabled, enabled ? false : autopilotAllowed)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${enabled ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-zinc-50'}`}>
          <span><b className="block text-xs text-zinc-900">AUTOCAR liberada</b><span className="text-[9px] font-bold text-zinc-500">Permite que a loja use OFF ou COPILOT.</span></span>
          {enabled ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-zinc-400" />}
        </button>

        <button type="button" disabled={busy || !enabled} onClick={() => void save(true, !autopilotAllowed)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left disabled:opacity-50 ${autopilotAllowed ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-zinc-50'}`}>
          <span><b className="block text-xs text-zinc-900">AUTOPILOT permitido</b><span className="text-[9px] font-bold text-zinc-500">Só libera a opção; não ativa a loja automaticamente.</span></span>
          {autopilotAllowed ? <Bot size={18} className="text-red-600" /> : <LockKeyhole size={18} className="text-zinc-400" />}
        </button>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-[9px] font-black uppercase text-zinc-500">
          <div>Loja escolheu<br /><strong className="text-xs text-zinc-900">{storeMode.toUpperCase()}</strong></div>
          <div>Modo efetivo<br /><strong className="text-xs text-zinc-900">{effectiveMode.toUpperCase()}</strong></div>
        </div>
      </div> : null}

      <p className={`mt-3 rounded-xl px-3 py-2 text-[9px] font-black leading-4 ${runtime?.automatic_replies_enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{executionMessage}</p>
      {message ? <p className="mt-2 flex items-center gap-2 text-[10px] font-bold text-zinc-600">{busy ? <Loader2 size={12} className="animate-spin" /> : null}{message}</p> : null}
    </section>
  );
}
