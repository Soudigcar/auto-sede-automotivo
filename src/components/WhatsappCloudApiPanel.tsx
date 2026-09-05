'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Braces, CheckCircle2, Flow, KeyRound, Layers3, Loader2, MessageSquareText, ShieldCheck, Workflow } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type CloudIntegration = {
  configured: boolean;
  provider: 'meta_cloud';
  status: 'draft' | 'testing' | 'ready' | 'disabled' | 'error';
  enabled: boolean;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  business_account_name: string | null;
  graph_api_version: string | null;
  has_access_token: boolean;
  has_app_secret: boolean;
  has_verify_token: boolean;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

type Props = { storeName: string; storeSlug: string };

type CapabilityCounts = { templates: number; flows: number; journeys: number; external_execution: boolean; synthetic_only: boolean };

export function WhatsappCloudApiPanel({ storeName, storeSlug }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [integration, setIntegration] = useState<CloudIntegration | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityCounts | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('Carregando estrutura da API própria...');
  const [form, setForm] = useState({
    business_account_name: '', waba_id: '', phone_number_id: '', display_phone_number: '', graph_api_version: '',
    access_token: '', app_secret: '', verify_token: ''
  });

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    return data.session.access_token;
  }, [supabase]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/store/integrations/whatsapp-cloud?${new URLSearchParams({ slug: storeSlug })}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a API própria.');
      setIntegration(result.integration);
      setCapabilities(result.capabilities);
      setForm((current) => ({
        ...current,
        business_account_name: result.integration?.business_account_name || '',
        waba_id: result.integration?.waba_id || '',
        phone_number_id: result.integration?.phone_number_id || '',
        display_phone_number: result.integration?.display_phone_number || '',
        graph_api_version: result.integration?.graph_api_version || ''
      }));
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar a API própria.');
    }
  }, [getToken, storeSlug]);

  useEffect(() => { void load(); }, [load]);

  async function post(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setMessage('Validando no ambiente isolado...');
    try {
      const token = await getToken();
      const response = await fetch('/api/store/integrations/whatsapp-cloud', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug: storeSlug, ...payload })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a ação.');
      setIntegration(result.integration);
      if (action === 'save-synthetic-secrets') {
        setForm((current) => ({ ...current, access_token: '', app_secret: '', verify_token: '' }));
      }
      setMessage(action === 'save-draft' ? 'Configuração sintética salva no ambiente isolado.' : 'Ação concluída no ambiente isolado.');
    } catch (error: any) {
      setMessage(error?.message || 'Erro na homologação da API própria.');
    } finally {
      setBusy('');
    }
  }

  const hasAllSecrets = Boolean(integration?.has_access_token && integration?.has_app_secret && integration?.has_verify_token);
  const fieldClass = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-blue-400';

  return (
    <section className="mt-8 space-y-6">
      <header className="premium-card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#071020] via-[#10213a] to-[#17345a] p-6 text-white md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-blue-300"><ShieldCheck size={16} /> Segunda conexão independente</div>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">WhatsApp via API própria da loja</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">Estrutura paralela ao Espelhamento/Evolution. Cada loja terá sua própria conta, número, WABA, Templates e WhatsApp Flows. Nenhum fallback entre lojas ou provedores.</p>
            </div>
            <span className="inline-flex self-start rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-amber-200">Homologação · execução externa OFF</span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="premium-card p-6 md:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Braces size={27} /></div>
            <div><h3 className="text-xl font-black text-zinc-950">Meta WhatsApp Cloud API</h3><p className="mt-1 text-sm text-zinc-500">{storeName} · conexão exclusiva desta loja</p></div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Nome da conta<input className={fieldClass} value={form.business_account_name} onChange={(e)=>setForm({...form,business_account_name:e.target.value})} placeholder="Conta sintética da loja" /></label>
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">WABA ID<input className={fieldClass} value={form.waba_id} onChange={(e)=>setForm({...form,waba_id:e.target.value})} placeholder="WABA_SYNTH_..." /></label>
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Phone Number ID<input className={fieldClass} value={form.phone_number_id} onChange={(e)=>setForm({...form,phone_number_id:e.target.value})} placeholder="PHONE_SYNTH_..." /></label>
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Número de exibição<input className={fieldClass} value={form.display_phone_number} onChange={(e)=>setForm({...form,display_phone_number:e.target.value})} placeholder="+55... sintético" /></label>
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500 sm:col-span-2">Versão Graph API <span className="normal-case font-semibold text-zinc-400">(não fixada até validação oficial)</span><input className={fieldClass} value={form.graph_api_version} onChange={(e)=>setForm({...form,graph_api_version:e.target.value})} placeholder="Deixar vazio na homologação" /></label>
          </div>
          <button disabled={Boolean(busy)} onClick={()=>post('save-draft', form)} className="mt-5 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy==='save-draft'?<Loader2 className="inline animate-spin" size={17}/>:null} Salvar configuração sintética</button>

          <div className="mt-8 border-t border-zinc-200 pt-6">
            <div className="flex items-center gap-2"><KeyRound size={19} className="text-blue-700"/><h4 className="font-black text-zinc-950">Credenciais no Vault</h4></div>
            <p className="mt-1 text-sm text-zinc-500">Somente valores sintéticos iniciados por <strong>synthetic-</strong>. O frontend nunca recebe o segredo já salvo.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <input type="password" className={fieldClass} value={form.access_token} onChange={(e)=>setForm({...form,access_token:e.target.value})} placeholder="synthetic-access-..." />
              <input type="password" className={fieldClass} value={form.app_secret} onChange={(e)=>setForm({...form,app_secret:e.target.value})} placeholder="synthetic-app-..." />
              <input type="password" className={fieldClass} value={form.verify_token} onChange={(e)=>setForm({...form,verify_token:e.target.value})} placeholder="synthetic-verify-..." />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button disabled={Boolean(busy)||!integration?.configured} onClick={()=>post('save-synthetic-secrets',form)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-800 disabled:opacity-50">Salvar no Vault</button>
              <button disabled={Boolean(busy)||!hasAllSecrets} onClick={()=>post('revoke-synthetic-secrets')} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-700 disabled:opacity-50">Revogar segredos sintéticos</button>
            </div>
          </div>
          {message ? <p className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-bold text-zinc-700">{message}</p> : null}
        </article>

        <aside className="space-y-4">
          <div className="premium-card p-5"><div className="flex items-center gap-2 font-black text-zinc-950"><CheckCircle2 size={19} className={hasAllSecrets?'text-emerald-600':'text-zinc-400'}/> Isolamento</div><p className="mt-2 text-sm leading-6 text-zinc-600">Integração habilitada: <strong>{integration?.enabled?'SIM':'NÃO'}</strong><br/>Vault completo: <strong>{hasAllSecrets?'SIM':'NÃO'}</strong><br/>Execução externa: <strong>NÃO</strong></p></div>
          <Capability icon={<MessageSquareText size={20}/>} title="Modelos de Mensagem" count={capabilities?.templates || 0} detail="Templates oficiais por WABA, ligados a um blueprint lógico do Master." />
          <Capability icon={<Flow size={20}/>} title="WhatsApp Flows" count={capabilities?.flows || 0} detail="Flows nativos da Meta por conta da loja, com versão e status próprios." />
          <Capability icon={<Workflow size={20}/>} title="Jornadas internas" count={capabilities?.journeys || 0} detail="Automação CRM/AUTOCAR separada de WhatsApp Flow e bloqueada pelo SAFE CORE." />
          <div className="premium-card p-5"><div className="flex items-center gap-2 font-black text-zinc-950"><Layers3 size={19}/> Regra de transporte</div><p className="mt-2 text-sm leading-6 text-zinc-600">Evolution continua independente. A Cloud API não utiliza número de outra loja, Master ou Evolution como fallback.</p></div>
        </aside>
      </div>
    </section>
  );
}

function Capability({ icon, title, count, detail }: { icon: React.ReactNode; title: string; count: number; detail: string }) {
  return <div className="premium-card p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-black text-zinc-950">{icon}{title}</div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-600">{count}</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p></div>;
}
