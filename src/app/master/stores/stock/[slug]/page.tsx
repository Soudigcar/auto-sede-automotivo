'use client';

import Link from 'next/link';
import { ArrowLeft, PackageSearch, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import MasterStoreStockManager from '@/components/MasterStoreStockManager';

export default function MasterStoreStockDetailPage() {
  return (
    <main className="premium-page" data-master-stock-page>
      <section className="premium-shell flex min-h-screen min-w-0 overflow-x-hidden">
        <MasterSidebar active="Lojas & Estoque" />

        <div className="min-w-0 flex-1 overflow-x-hidden bg-[#071020]">
          <div className="border-b border-white/10 px-4 py-4 text-white md:px-7">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><PackageSearch size={21} /></div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-red-400"><ShieldCheck size={14} /> Gestão Master</div>
                  <h1 className="mt-1 text-xl font-black">Gerenciamento de estoque da loja</h1>
                  <p className="text-xs text-zinc-400">Seu acesso continua Master. A loja selecionada é validada no servidor e nenhuma sessão da loja é assumida.</p>
                </div>
              </div>

              <Link href="/master/stores/events" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/5">
                <ArrowLeft size={17} /> Voltar para Lojas & Estoque
              </Link>
            </div>
          </div>

          <MasterStoreStockManager />
        </div>
      </section>
    </main>
  );
}
