'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Package, Search, Settings2, Store } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function MasterStoreStockSelectorPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stores, setStores] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('Carregando lojas...');

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id,store_name,slug,status,responsible_name,responsible_email')
        .eq('status', 'active')
        .order('store_name', { ascending: true });
      if (error) {
        setMessage('Não foi possível carregar as lojas.');
        return;
      }
      setStores(data || []);
      setMessage('');
    })();
  }, [supabase]);

  const filtered = stores.filter((store) => {
    const haystack = `${store.store_name || ''} ${store.slug || ''} ${store.responsible_name || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <main className="premium-page min-h-screen bg-[#f4f6fa]">
      <section className="min-h-screen p-4 md:p-7">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 rounded-3xl bg-[#071020] p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3 text-red-400"><Package size={20} /><span className="text-xs font-black uppercase tracking-[0.25em]">Gestão Master</span></div>
              <h1 className="mt-3 text-3xl font-black md:text-4xl">Lojas & Estoque</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">Escolha a loja que deseja administrar. O estoque abre dentro da área Master, com o contexto da loja fixado e validado no servidor.</p>
            </div>
            <Link href="/master/stores" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/5">
              <Settings2 size={17} /> Administrar lojas
            </Link>
          </div>

          <div className="mt-6 rounded-3xl bg-white p-5 shadow-xl shadow-zinc-200/50">
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <Search size={18} className="text-zinc-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar loja" className="w-full bg-transparent text-sm text-zinc-900 outline-none" />
            </label>

            {message ? <p className="mt-5 text-sm text-zinc-500">{message}</p> : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((store) => (
                <article key={store.id} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Store size={20} /></div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">Ativa</span>
                  </div>
                  <h2 className="mt-4 text-lg font-black text-zinc-950">{store.store_name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{store.responsible_name || 'Responsável não informado'}</p>
                  <p className="mt-1 break-all text-xs text-zinc-400">{store.responsible_email || store.slug}</p>
                  <Link href={`/master/stores/stock/${encodeURIComponent(store.slug)}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700">
                    Gerenciar estoque <ArrowRight size={15} />
                  </Link>
                </article>
              ))}
              {!message && filtered.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja encontrada.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
