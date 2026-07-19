'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Car, CheckCircle2, ClipboardList, LogOut, Store, Package } from 'lucide-react';
import { getStorePortalContext } from '@/lib/storePortalClient';

const steps = [
  'Lead recebido',
  'Atendimento iniciado',
  'Agendamento',
  'Comparecimento',
  'Venda ou perda registrada'
];

export default function StoreSlugHomePage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [message, setMessage] = useState('Validando acesso da loja...');

  async function loadAccess() {
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuario nao tem permissao para acessar esta loja.');
      return;
    }

    setStore(context.store);
    setMessage('');
  }

  useEffect(() => {
    loadAccess().catch(() => setMessage('Nao foi possivel validar o acesso.'));
  }, [slug]);

  if (message) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Area operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Store size={18} /> Inicio</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operacao</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Central da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Portal exclusivo da loja {store?.store_name}. Aqui a loja acompanha apenas os próprios leads, estoque, vendas e perdas.
              </p>
            </div>

            <Link href={`/loja/${slug}/pipeline`} className="premium-button-primary"><BarChart3 size={18} /> Abrir pipeline</Link>
          </header>

          <section className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="premium-card premium-card-hover p-5">
              <p className="text-sm font-bold text-zinc-500">Loja vinculada</p>
              <strong className="mt-3 block text-3xl font-black text-zinc-950">{store?.store_name}</strong>
              <p className="mt-2 text-xs text-zinc-400">Acesso isolado por store_id.</p>
            </div>

            <div className="premium-card premium-card-hover p-5">
              <p className="text-sm font-bold text-zinc-500">Operacao comercial</p>
              <strong className="mt-3 block text-4xl font-black text-sky-600">Kanban</strong>
              <p className="mt-2 text-xs text-zinc-400">Atendimento, agendamento, comparecimento e venda.</p>
            </div>

            <div className="premium-card premium-card-hover p-5">
              <p className="text-sm font-bold text-zinc-500">Seguranca</p>
              <strong className="mt-3 block text-4xl font-black text-emerald-600">Isolado</strong>
              <p className="mt-2 text-xs text-zinc-400">Nenhuma loja visualiza dados de outra.</p>
            </div>
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-[1fr_380px]">
            <div className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Fluxo operacional da loja</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-5">
                {steps.map((step, index) => (
                  <div key={step} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-sm font-black text-white">{index + 1}</span>
                    <p className="mt-4 text-sm font-black text-zinc-900">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Acoes rapidas</h2>
              <div className="mt-5 grid gap-3">
                <Action href={`/loja/${slug}/pipeline`} icon={BarChart3} title="Pipeline da Loja" description="Acompanhe apenas os leads direcionados para esta loja." action="Abrir pipeline" />
                <Action href={`/loja/${slug}/operacao`} icon={ClipboardList} title="Operacao da Loja" description="Registre venda, perda, banco financiador e veiculo vendido." action="Abrir operacao" />
              </div>
            </div>
          </section>

          <section className="premium-card mt-5 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-emerald-600" />
              <p className="text-sm font-bold text-zinc-600">Portal exclusivo ativo para: {store?.store_name}.</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Action({ href, icon: Icon, title, description, action }: { href: string; icon: any; title: string; description: string; action: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-zinc-950">{title}</h3>
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
          <span className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-600">{action}<ArrowRight size={14} /></span>
        </div>
      </div>
    </Link>
  );
}
