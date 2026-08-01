'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Link2, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { OlxVehicleImportModal } from '@/components/marketplace/OlxVehicleImportModal';

export default function StoreOlxImportPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }
      const response = await fetch(`/api/store/portal/context?slug=${encodeURIComponent(slug)}`, {
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
      if (!result.permissions?.includes('submit_stock_import')) {
        setMessage('Seu perfil não possui permissão para importar anúncios.');
        setLoading(false);
        return;
      }
      setContext(result);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [pathname, router, slug, supabase]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#071020] text-white"><div className="text-center"><Loader2 className="mx-auto animate-spin text-red-500" size={36} /><p className="mt-4 font-black">Validando acesso...</p></div></main>;
  if (!context) return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center font-bold text-white">{message || 'Acesso indisponível.'}</main>;

  const canPublish = context.profile.role === 'master' || context.profile.role === 'store';
  const store = context.store;

  return <main className="min-h-screen bg-zinc-100 p-4 sm:p-7">
    <div className="mx-auto max-w-6xl">
      <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-9">
        <Link href={`/loja/${slug}`} className="inline-flex items-center gap-2 text-sm font-black text-zinc-300 hover:text-white"><ArrowLeft size={17} /> Voltar ao portal</Link>
        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Importação autorizada</p><h1 className="mt-2 text-4xl font-black sm:text-5xl">Importar anúncio da OLX</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-zinc-300">Cole o link, revise todos os dados e confira as fotos antes de enviar o veículo para o catálogo da {store.store_name}.</p></div>
          <button type="button" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black shadow-lg shadow-red-600/25" onClick={() => setOpen(true)}><Link2 size={19} /> Importar anúncio</button>
        </div>
      </header>

      {message ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-zinc-200 bg-white p-5"><Link2 className="text-red-600" /><h2 className="mt-4 text-lg font-black">1. Cole o link</h2><p className="mt-2 text-sm font-semibold text-zinc-500">São aceitos anúncios de veículos hospedados na OLX.</p></article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-5"><CheckCircle2 className="text-red-600" /><h2 className="mt-4 text-lg font-black">2. Revise tudo</h2><p className="mt-2 text-sm font-semibold text-zinc-500">Marca, modelo, preço, descrição, características e galeria de fotos.</p></article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-5"><ShieldCheck className="text-red-600" /><h2 className="mt-4 text-lg font-black">3. Aprovação</h2><p className="mt-2 text-sm font-semibold text-zinc-500">{canPublish ? 'Seu perfil pode publicar diretamente para esta loja.' : 'Seu perfil envia o veículo para aprovação do gestor ou do master.'}</p></article>
      </section>

      <section className="mt-6 rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Permissão atual</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><strong className="text-xl font-black text-zinc-950">{context.profile.role_label}</strong><span className={`rounded-full px-3 py-1 text-xs font-black ${canPublish ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{canPublish ? 'PODE PUBLICAR' : 'ENVIA PARA APROVAÇÃO'}</span></div>
        <p className="mt-2 text-sm font-semibold text-zinc-500">Loja vinculada: {store.store_name}</p>
      </section>
    </div>

    <OlxVehicleImportModal
      open={open}
      stores={[{ id: store.id, store_name: store.store_name }]}
      fixedStoreId={store.id}
      onClose={() => setOpen(false)}
      onComplete={(result) => setMessage(result.message || 'Importação atualizada.')}
    />
  </main>;
}
