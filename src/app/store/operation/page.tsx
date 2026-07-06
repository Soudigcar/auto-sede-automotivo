import { createClient } from '@supabase/supabase-js';

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const { data: stores } = await supabase.from('stores').select('*').eq('status', 'active');
  const { data: leads } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  const { data: inventory } = await supabase.from('inventory').select('*').eq('status', 'available');

  return {
    stores: stores || [],
    leads: leads || [],
    inventory: inventory || []
  };
}

export default async function StoreOperationPage() {
  const data = await getData();

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Loja Participante</p>
        <h1 className="mt-2 text-4xl font-black">Operacao da loja</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card p-5"><p className="text-sm text-zinc-400">Lojas</p><strong className="text-3xl">{data.stores.length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Leads</p><strong className="text-3xl">{data.leads.length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Estoque</p><strong className="text-3xl">{data.inventory.length}</strong></div>
        </div>
      </section>
    </main>
  );
}
