'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, Loader2, Puzzle, RefreshCw, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';
import { OlxVehicleImportModal, type OlxBrowserImportPayload } from '@/components/marketplace/OlxVehicleImportModal';

const HANDOFF_KEY = 'autoControleOlxImportContext';

type Handoff = {
  storeId: string;
  submissionId?: string;
  sourceUrl: string;
  createdAt?: string;
};

function readHandoff(): Handoff | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const stored = JSON.parse(window.localStorage.getItem(HANDOFF_KEY) || 'null') as Handoff | null;
    const sourceUrl = extractCanonicalOlxUrl(params.get('url') || stored?.sourceUrl || '');
    const storeId = params.get('store_id') || stored?.storeId || '';
    const submissionId = params.get('submission_id') || stored?.submissionId || '';
    if (!sourceUrl || !storeId) return null;
    return { storeId, submissionId, sourceUrl, createdAt: stored?.createdAt };
  } catch {
    return null;
  }
}

export default function BrowserOlxImportPage() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [context, setContext] = useState<any>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [payload, setPayload] = useState<OlxBrowserImportPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Aguardando os dados enviados pela extensão do Chrome...');

  useEffect(() => {
    setHandoff(readHandoff());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }
      const response = await fetch('/api/olx-browser-import/context', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setMessage(result.error || 'Não foi possível validar seu acesso.');
        setLoading(false);
        return;
      }
      setContext(result);
      setLoading(false);
    }
    void loadContext();
    return () => { cancelled = true; };
  }, [pathname, router, supabase]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.source !== 'auto-controle-olx-extension') return;
      if (event.data?.type !== 'AUTO_CONTROLE_OLX_IMPORT_PAYLOAD') return;
      const next = event.data.payload as OlxBrowserImportPayload;
      if (!next?.source_url) return;
      setPayload(next);
      setOpen(true);
      setMessage(`Anúncio recebido com ${next.images?.filter((item) => item.data_url).length || next.image_urls?.length || 0} fotos preparadas pelo navegador.`);
      window.localStorage.removeItem(HANDOFF_KEY);
      window.postMessage({ source: 'auto-controle-app', type: 'AUTO_CONTROLE_OLX_IMPORT_ACK' }, '*');
    }
    window.addEventListener('message', receive);
    window.postMessage({ source: 'auto-controle-app', type: 'AUTO_CONTROLE_OLX_PAGE_READY' }, '*');
    const timer = window.setTimeout(() => window.postMessage({ source: 'auto-controle-app', type: 'AUTO_CONTROLE_OLX_PAGE_READY' }, '*'), 900);
    return () => {
      window.removeEventListener('message', receive);
      window.clearTimeout(timer);
    };
  }, []);

  function requestPayload() {
    setMessage('Solicitando novamente os dados pendentes da extensão...');
    window.postMessage({ source: 'auto-controle-app', type: 'AUTO_CONTROLE_OLX_PAGE_READY' }, '*');
  }

  function openOlxAd() {
    if (!handoff?.sourceUrl) return;
    window.open(handoff.sourceUrl, '_blank', 'noopener,noreferrer');
    setMessage('Anúncio aberto. Na página da OLX, clique em “Importar para Auto Controle”. Depois volte a esta aba.');
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#071020] text-white"><div className="text-center"><Loader2 className="mx-auto animate-spin text-red-500" size={38} /><p className="mt-4 font-black">Validando seu acesso...</p></div></main>;

  const selectedStore = context?.stores?.find((store: any) => store.id === handoff?.storeId);
  const initialStoreId = handoff?.storeId || (context?.profile?.role === 'master' ? context?.stores?.[0]?.id : context?.profile?.store_id);

  return <main className="min-h-screen bg-zinc-100 p-4 sm:p-8">
    <div className="mx-auto max-w-6xl">
      <header className="rounded-[34px] bg-[#071020] p-7 text-white shadow-xl sm:p-10">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Leitura pelo navegador</p>
            <h1 className="mt-2 text-4xl font-black sm:text-5xl">Importar anúncio da OLX</h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-relaxed text-zinc-300">A extensão lê o anúncio na sua sessão do Chrome, transfere os dados e prepara as fotos sem depender do servidor da Vercel acessar a OLX.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {handoff?.sourceUrl ? <button type="button" onClick={openOlxAd} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-zinc-950"><ExternalLink size={18} /> Abrir anúncio na OLX</button> : null}
            <button type="button" onClick={requestPayload} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black shadow-lg shadow-red-600/25"><RefreshCw size={18} /> Receber novamente</button>
          </div>
        </div>
      </header>

      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">{message}</div>

      {handoff ? <section className="mt-5 rounded-3xl border border-violet-200 bg-violet-50 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Contexto preservado</p>
        <p className="mt-2 text-sm font-bold text-violet-950">Loja: {selectedStore?.name || selectedStore?.store_name || handoff.storeId}</p>
        <p className="mt-1 break-all text-xs font-semibold text-violet-700">{handoff.sourceUrl}</p>
        {handoff.submissionId ? <p className="mt-1 text-xs font-semibold text-violet-700">Pendência: {handoff.submissionId}</p> : null}
      </section> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-zinc-200 bg-white p-6"><Puzzle className="text-red-600" /><h2 className="mt-4 text-lg font-black">1. Abra o anúncio</h2><p className="mt-2 text-sm font-semibold text-zinc-500">Use o botão acima e, na OLX, clique em “Importar para Auto Controle”.</p></article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-6"><CheckCircle2 className="text-red-600" /><h2 className="mt-4 text-lg font-black">2. Revise tudo</h2><p className="mt-2 text-sm font-semibold text-zinc-500">Os dados retornam para esta página já vinculados à loja e à pendência selecionadas.</p></article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-6"><ShieldCheck className="text-red-600" /><h2 className="mt-4 text-lg font-black">3. Permissões</h2><p className="mt-2 text-sm font-semibold text-zinc-500">{context?.can_publish ? 'Seu perfil pode publicar diretamente.' : 'Seu perfil envia o veículo para aprovação.'}</p></article>
      </section>

      {context ? <section className="mt-6 rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Sessão validada</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><strong className="text-xl font-black text-zinc-950">{context.profile.role_label}</strong><span className={`rounded-full px-3 py-1 text-xs font-black ${context.can_publish ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{context.can_publish ? 'PODE PUBLICAR' : 'ENVIA PARA APROVAÇÃO'}</span></div>
      </section> : null}
    </div>

    {context ? <OlxVehicleImportModal
      open={open}
      stores={context.stores || []}
      fixedStoreId={context.profile.role === 'master' ? undefined : context.profile.store_id}
      initial={payload ? {
        url: payload.source_url,
        storeId: initialStoreId,
        submissionId: handoff?.submissionId || ''
      } : handoff ? {
        url: handoff.sourceUrl,
        storeId: handoff.storeId,
        submissionId: handoff.submissionId || ''
      } : null}
      browserPayload={payload}
      onClose={() => setOpen(false)}
      onComplete={(result) => setMessage(result.message || 'Importação atualizada.')}
    /> : null}
  </main>;
}
