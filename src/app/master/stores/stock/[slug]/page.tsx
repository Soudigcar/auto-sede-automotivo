'use client';

import Link from 'next/link';
import { ArrowLeft, PackageSearch, ShieldCheck } from 'lucide-react';
import StoreStockPage from '@/app/loja/[slug]/estoque/page';

export default function MasterStoreStockDetailPage() {
  return (
    <div data-master-stock-shell className="min-h-screen bg-[#071020]">
      <div className="border-b border-white/10 bg-[#071020] px-4 py-4 text-white md:px-7">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><PackageSearch size={21} /></div>
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-red-400"><ShieldCheck size={14} /> Gestão Master</div>
              <p className="mt-1 text-lg font-black">Gerenciamento de estoque da loja</p>
              <p className="text-xs text-zinc-400">Você continua no acesso Master. A loja selecionada é fixada e validada no servidor.</p>
            </div>
          </div>
          <Link href="/master/stores/stock" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/5">
            <ArrowLeft size={17} /> Trocar loja
          </Link>
        </div>
      </div>

      <StoreStockPage />

      <style jsx global>{`
        [data-master-stock-shell] > main > section > aside {
          display: none !important;
        }
        [data-master-stock-shell] > main > section > div {
          width: 100% !important;
        }
        [data-master-stock-shell] > main header a[href*="/pipeline"] {
          display: none !important;
        }
        [data-master-stock-shell] > main header .premium-eyebrow {
          font-size: 0 !important;
        }
        [data-master-stock-shell] > main header .premium-eyebrow::after {
          content: 'Estoque administrado pelo Master';
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}
