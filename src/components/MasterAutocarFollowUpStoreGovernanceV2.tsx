'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { clampStoreFollowUpSettings, defaultFollowUpConfigV2, type FollowUpMode, type FollowUpSettings } from '@/lib/server/autocar/smartFollowUpV2';

type StoreRow = { id: string; store_name: string };
type Payload = { stores?: StoreRow[] };

function storeDraft(master: FollowUpSettings): FollowUpSettings {
  return {
    ...master,
    enabled: false,
    mode: 'off',
    allowedStart: master.allowedStart < '09:00' ? '09:00' : master.allowedStart,
    allowedEnd: master.allowedEnd > '19:00' ? '19:00' : master.allowedEnd,
    maxPerLeadPerDay: Math.min(master.maxPerLeadPerDay, 1),
    maxPerSequence: Math.min(master.maxPerSequence, 3),
    maxSequenceDays: Math.min(master.maxSequenceDays, 7),
    minIntervalMinutes: Math.max(master.minIntervalMinutes, 60),
    cancelOnCustomerReply: true,
    cancelOnSale: true,
    cancelOnHumanTakeover: true,
    cancelOnClosedConversation: true
  };
}

function modeLabel(value: FollowUpMode) {
  return value === 'autopilot' ? 'AUTOPILOT' : value === 'copilot' ? 'COPILOT' : 'OFF';
}

function SettingCard({ title, master, requested, effective }: { title: string; master: string | number; requested: string | number; effective: string | number }) {
  const constrained = String(requested) !== String(effective);
  return <div className={`rounded-xl border p-3 ${constrained ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-white'}`}>
    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{title}</p>
    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-bold">
      <div><span className="text-zinc-400">Master</span><p className="mt-1 text-zinc-700">{master}</p></div>
      <div><span className="text-zinc-400">Loja pediu</span><p className="mt-1 text-zinc-700">{requested}</p></div>
      <div><span className="text-zinc-400">Efetivo</span><p className={`mt-1 font-black ${constrained ? 'text-amber-800' : 'text-emerald-700'}`}>{effective}</p></div>
    </div>
    {constrained ? <p className="mt-2 text-[9px] font-black uppercase text-amber-800">Limitado pelo Master</p> : null}
  </div>;
}

export function MasterAutocarFollowUpStoreGovernanceV2() {
  const supabase = useMemo(() => createClient(), []);
  const master = defaultFollowUpConfigV2.global;
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, FollowUpSettings>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadStores = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as lojas.');
      const rows = (body.stores || []).map((row) => ({ id: row.id, store_name: row.store_name }));
      setStores(rows);
      setStoreId((current) => current || rows[0]?.id || '');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as lojas.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void loadStores(); }, [loadStores]);

  const selectedStore = stores.find((row) => row.id === storeId);
  const requested = storeId ? (drafts[storeId] || storeDraft(master)) : storeDraft(master);
  const effective = clampStoreFollowUpSettings(master, requested);

  function change<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    if (!storeId) return;
    setDrafts((current) => ({ ...current, [storeId]: { ...(current[storeId] || storeDraft(master)), [key]: value } }));
  }

  function resetStore() {
    if (!storeId) return;
    setDrafts((current) => ({ ...current, [storeId]: storeDraft(master) }));
  }

  return <section className="premium-card p-5 md:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Building2 size={19}/></span><div><h2 className="text-xl font-black">Configuração por Loja</h2><p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-500">Simulador de herança Master → Loja → Configuração efetiva. Nada desta seção é salvo nesta etapa.</p></div></div>
      <button type="button" onClick={() => void loadStores()} disabled={loading} className="premium-button-secondary"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Atualizar lojas</button>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">{message}</div> : null}

    <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <label className="text-xs font-black">Loja<select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="premium-input mt-2"><option value="">Selecione uma loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label>
        <div className="mt-4 flex items-center gap-2 text-red-600"><SlidersHorizontal size={16}/><h3 className="text-sm font-black text-zinc-950">O que a loja está pedindo</h3></div>
        {!selectedStore ? <p className="mt-3 text-xs font-bold text-zinc-500">Selecione uma loja para testar a governança.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black">Status<select value={requested.enabled ? 'on' : 'off'} onChange={(event) => change('enabled', event.target.value === 'on')} className="premium-input mt-1.5"><option value="off">DESATIVADO</option><option value="on">ATIVADO</option></select></label>
          <label className="text-xs font-black">Modo<select value={requested.mode} onChange={(event) => change('mode', event.target.value as FollowUpMode)} className="premium-input mt-1.5"><option value="off">OFF</option><option value="copilot">COPILOT</option><option value="autopilot">AUTOPILOT</option></select></label>
          <label className="text-xs font-black">Início<input type="time" value={requested.allowedStart} onChange={(event) => change('allowedStart', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Fim<input type="time" value={requested.allowedEnd} onChange={(event) => change('allowedEnd', event.target.value)} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por lead/dia<input type="number" min={1} max={5} value={requested.maxPerLeadPerDay} onChange={(event) => change('maxPerLeadPerDay', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Máx. por sequência<input type="number" min={1} max={10} value={requested.maxPerSequence} onChange={(event) => change('maxPerSequence', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Duração máx. (dias)<input type="number" min={1} max={30} value={requested.maxSequenceDays} onChange={(event) => change('maxSequenceDays', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <label className="text-xs font-black">Intervalo mínimo (min)<input type="number" min={15} value={requested.minIntervalMinutes} onChange={(event) => change('minIntervalMinutes', Number(event.target.value))} className="premium-input mt-1.5"/></label>
          <button type="button" onClick={resetStore} className="premium-button-secondary sm:col-span-2">Restaurar rascunho seguro</button>
        </div>}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600"/><h3 className="text-sm font-black">Configuração efetiva</h3></div>
        <p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500">A coluna “Efetivo” é a regra que venceria depois de aplicar o teto do Master. Se a loja pedir mais permissão, o valor é reduzido automaticamente.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <SettingCard title="Status" master={master.enabled ? 'ATIVO' : 'DESATIVADO'} requested={requested.enabled ? 'ATIVO' : 'DESATIVADO'} effective={effective.enabled ? 'ATIVO' : 'DESATIVADO'}/>
          <SettingCard title="Modo" master={modeLabel(master.mode)} requested={modeLabel(requested.mode)} effective={modeLabel(effective.mode)}/>
          <SettingCard title="Horário inicial" master={master.allowedStart} requested={requested.allowedStart} effective={effective.allowedStart}/>
          <SettingCard title="Horário final" master={master.allowedEnd} requested={requested.allowedEnd} effective={effective.allowedEnd}/>
          <SettingCard title="Máx. lead/dia" master={master.maxPerLeadPerDay} requested={requested.maxPerLeadPerDay} effective={effective.maxPerLeadPerDay}/>
          <SettingCard title="Máx. sequência" master={master.maxPerSequence} requested={requested.maxPerSequence} effective={effective.maxPerSequence}/>
          <SettingCard title="Duração (dias)" master={master.maxSequenceDays} requested={requested.maxSequenceDays} effective={effective.maxSequenceDays}/>
          <SettingCard title="Intervalo mínimo" master={`${master.minIntervalMinutes} min`} requested={`${requested.minIntervalMinutes} min`} effective={`${effective.minIntervalMinutes} min`}/>
        </div>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold leading-5 text-emerald-800"><ShieldCheck size={13} className="mr-2 inline"/>Resposta do cliente, venda, takeover humano e conversa fechada continuam obrigatoriamente cancelando a sequência — a loja não pode relaxar essas proteções.</div>
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-5 text-sky-800"><strong>Preview:</strong> este comparador usa o baseline seguro V2 como teto Master. Quando a persistência for autorizada, ele passará a consumir o teto Master realmente salvo e versionado.</div>
      </div>
    </div>
  </section>;
}
