'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, Car, CheckCircle2, ClipboardList, Clock3, LogOut, Store, XCircle, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

const columns = [
  { key: 'new_lead', title: 'Novo Lead Recebido', action: { status: 'in_service', label: 'Iniciar atendimento' } },
  { key: 'in_service', title: 'Em Atendimento', action: { status: 'scheduled', label: 'Agendar' } },
  { key: 'scheduled', title: 'Agendado', action: { status: 'showed_up', label: 'Confirmar chegada' } },
  { key: 'showed_up', title: 'Compareceu', action: { status: 'sale_confirmed', label: 'Confirmar venda' } },
  { key: 'no_show', title: 'Nao Compareceu', action: { status: 'lost', label: 'Registrar perda' } }
];

export default function StoreSlugPipelinePage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [message, setMessage] = useState('Validando acesso da loja...');

  async function loadData() {
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuario nao tem permissao para acessar esta loja.');
      return;
    }

    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_store_id', context.store.id)
      .order('created_at', { ascending: false });

    setStore(context.store);
    setLeads(data || []);
    setMessage('');
  }

  async function changeStatus(leadId: string, status: string) {
    setMessage('Atualizando lead...');

    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('assigned_store_id', store.id);

    if (error) {
      setMessage('Erro ao atualizar lead.');
      return;
    }

    await loadData();
    setMessage('');
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Nao foi possivel carregar o pipeline.'));
  }, [slug]);

  const activeLeads = leads.filter((lead) => !['sale_confirmed', 'lost'].includes(lead.status));

  const grouped = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      leads: activeLeads.filter((lead) => lead.status === column.key)
    }));
  }, [activeLeads]);

  const soldCount = leads.filter((lead) => lead.status === 'sale_confirmed').length;
  const lostCount = leads.filter((lead) => lead.status === 'lost').length;

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Area operacional</p><p className="mt-1 font-bold">{store?.store_name}</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span></div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Inicio</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operacao</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Pipeline da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Leads recebidos exclusivamente por {store?.store_name}.</p>
            </div>
            <button className="premium-button-primary" type="button" onClick={loadData}><BarChart3 size={18} /> Atualizar pipeline</button>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-5 grid gap-3 md:grid-cols-3">
            <Kpi label="Leads" value={leads.length} />
            <Kpi label="Vendas" value={soldCount} />
            <Kpi label="Perdas" value={lostCount} />
          </section>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="grid min-w-[1100px] grid-cols-5 gap-4">
              {grouped.map((column) => (
                <div key={column.key} className="rounded-[26px] border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black">{column.title}</h2>
                      <p className="text-xs text-zinc-400">{column.leads.length} cards</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-500">{column.leads.length}</span>
                  </div>

                  <div className="space-y-3">
                    {column.leads.map((lead) => (
                      <div key={lead.id} className="rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-3 shadow-sm">
                        <h3 className="text-sm font-black">{lead.customer_name}</h3>
                        <p className="mt-1 text-xs text-zinc-500">{lead.interested_vehicle || 'Interesse nao informado'}</p>
                        <p className="mt-1 text-[11px] text-zinc-400">{lead.customer_phone || 'Sem telefone'}</p>
                        <button className="mt-3 w-full rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-black uppercase text-white" onClick={() => changeStatus(lead.id, column.action.status)}>{column.action.label}</button>
                      </div>
                    ))}

                    {column.leads.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-xs text-zinc-400">Sem leads nesta etapa</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="premium-card mt-5 p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Status label="Novos" value={leads.filter((lead) => lead.status === 'new_lead').length} icon={<Clock3 size={18} />} />
              <Status label="Confirmados" value={soldCount} icon={<CheckCircle2 size={18} />} />
              <Status label="Perdidos" value={lostCount} icon={<XCircle size={18} />} />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="premium-card p-5"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-2 block text-3xl font-black">{value}</strong></div>;
}

function Status({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between rounded-2xl bg-zinc-50 p-4"><div className="flex items-center gap-3 text-zinc-500">{icon}<span className="font-bold">{label}</span></div><strong>{value}</strong></div>;
}
