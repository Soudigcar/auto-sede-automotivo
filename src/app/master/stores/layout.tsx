import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

export default function MasterStoresLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Link
        href="/master/stores/stock"
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-red-950/30 transition hover:bg-red-700"
        aria-label="Gerenciar estoque das lojas"
      >
        <PackageSearch size={18} /> Gerenciar estoque
      </Link>
    </>
  );
}
