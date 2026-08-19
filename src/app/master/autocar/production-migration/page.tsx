'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type StatusPayload = {
  success: boolean;
  environment: {
    vercel_environment: string;
    source_ref: string;
    expected_source_ref: string;
    destination_ref: string;
    source_key_stored: false;
    destination_key_stored: false;
  };
  confirmation_phrase: string;
};

type MigrationResult = {
  snapshot_at: string;
  live_enabled: false;
  copied: Record<string, number>;
};

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 400) }; }
}

export default function AutocarProductionMigrationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [sourceServiceRole, setSourceServiceRole] = useState('');
  const [destinationServiceRole, setDestinationServiceRole] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('Carregando validações...');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await accessToken();
        if (!token) throw new Error('Sessão Master expirada. Entre novamente no Master deste Preview.');
        const response = await fetch('/api/master/autocar-production-migration', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const body = await readJson(response);
        if (!response.ok) throw new Error(body.error || 'Não foi possível validar o ambiente.');
        if (!active) return;
        setStatus(body);
        setConfirmation(body.confirmation_phrase || '');
        setMessage('Preview validado. Nenhuma migração foi executada ainda.');
      } catch (error: any) {
        if (active) setMessage(error?.message || 'Falha ao validar o ambiente.');
      }
    })();
    return () => { active = false; };
  }, []);

  async function executeMigration() {
    if (!status || busy) return;
    if (!sourceServiceRole.trim()) {
      setMessage('Informe a service_role do autocar-dev. Ela será usada somente nesta requisição.');
      return;
    }
    if (!destinationServiceRole.trim()) {
      setMessage('Informe a service_role do AUTOCAR Production. Ela será usada somente nesta requisição.');
      return;
    }

    setBusy(true);
    setResult(null);
    setMessage('Migrando e validando dados. Não feche esta página até a conclusão...');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar-production-migration', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirmation,
          source_service_role_key: sourceServiceRole.trim(),
          destination_service_role_key: destinationServiceRole.trim()
        }),
        cache: 'no-store'
      });
      const body = await readJson(response);
      setSourceServiceRole('');
      setDestinationServiceRole('');
      if (!response.ok) throw new Error(body.error || 'A migração não foi concluída.');
      setResult(body.result);
      setMessage('Migração concluída e validada. As duas service_role foram removidas do formulário e não foram persistidas.');
    } catch (error: any) {
      setSourceServiceRole('');
      setDestinationServiceRole('');
      setMessage(error?.message || 'A migração não foi concluída.');
    } finally {
      setBusy(false);
    }
  }

  const env = status?.environment;
  const ready = Boolean(env?.vercel_environment === 'preview' && env?.source_ref === env?.expected_source_ref);

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
    <header><div className="flex items-center gap-2 text-red-600"><DatabaseZap size={20}/><span className="premium-eyebrow">Ferramenta temporária · Preview</span></div><h1 className="premium-title mt-2 text-4xl">Migração AUTOCAR Production</h1><p className="premium-muted mt-3 max-w-3xl text-sm leading-6">Transfere somente o núcleo AUTOCAR autorizado do autocar-dev para o novo AUTOCAR Production. A ferramenta não altera Vercel Production, WhatsApp, Evolution nem habilita o runtime LIVE.</p></header>

    <section className="premium-card mt-6 p-5">
      <div className="flex items-center gap-2"><ShieldCheck size={18} className={ready?'text-emerald-600':'text-amber-600'}/><h2 className="text-lg font-black">Travas de segurança</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-xs font-bold">
        <div className="rounded-xl border border-zinc-200 p-3">Vercel<br/><span className="font-black">{env?.vercel_environment || '—'}</span></div>
        <div className="rounded-xl border border-zinc-200 p-3">Origem fixa<br/><span className="font-black">{env?.source_ref || '—'}</span></div>
        <div className="rounded-xl border border-zinc-200 p-3">Destino fixo<br/><span className="font-black">{env?.destination_ref || '—'}</span></div>
        <div className="rounded-xl border border-zinc-200 p-3">Credenciais<br/><span className="font-black">não armazenadas</span></div>
      </div>
    </section>

    <section className="premium-card mt-5 p-5">
      <div className="flex items-center gap-2"><KeyRound size={18} className="text-red-600"/><h2 className="text-lg font-black">Execução única</h2></div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Cole as duas <strong>service_role</strong> diretamente nesta página. Não envie essas chaves no chat. Elas são usadas apenas nesta requisição HTTPS, não são gravadas por esta ferramenta e os campos são limpos ao concluir ou falhar.</p>
      <label className="mt-4 block text-xs font-black">Service role autocar-dev<input type="password" autoComplete="off" spellCheck={false} value={sourceServiceRole} onChange={(event)=>setSourceServiceRole(event.target.value)} className="premium-input mt-1.5" placeholder="cole a chave do autocar-dev somente aqui"/></label>
      <label className="mt-4 block text-xs font-black">Service role AUTOCAR Production<input type="password" autoComplete="off" spellCheck={false} value={destinationServiceRole} onChange={(event)=>setDestinationServiceRole(event.target.value)} className="premium-input mt-1.5" placeholder="cole a chave do AUTOCAR Production somente aqui"/></label>
      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Confirmação interna: <span className="font-black">{confirmation || 'aguardando validação'}</span></div>
      <button type="button" disabled={!ready || !sourceServiceRole.trim() || !destinationServiceRole.trim() || busy} onClick={()=>void executeMigration()} className="premium-button-primary mt-4 justify-center disabled:opacity-50">{busy?<Loader2 size={16} className="animate-spin"/>:<DatabaseZap size={16}/>} {busy?'Migrando e validando...':'Executar migração autorizada'}</button>
    </section>

    <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{message}</div>

    {result?<section className="premium-card mt-5 p-5"><h2 className="text-lg font-black text-emerald-700">Validação concluída</h2><p className="mt-2 text-xs text-zinc-500">Snapshot: {result.snapshot_at} · LIVE: {String(result.live_enabled)}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(result.copied).map(([label,value])=><div key={label} className="rounded-xl border border-zinc-200 p-3"><p className="text-[10px] font-black uppercase text-zinc-400">{label.replaceAll('_',' ')}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div></section>:null}
  </div></section></main>;
}
