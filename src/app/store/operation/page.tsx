import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

async function getData() {
  const supabase = getSupabase();
  const { data: stores } = await supabase.from('stores').select('*').eq('status', 'active');
  const { data: leads } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  const { data: inventory } = await supabase.from('inventory').select('*').eq('status', 'available');
  return { stores: stores || [], leads: leads || [], inventory: inventory || [] };
}

async function closeDeal(formData: FormData) {
  'use server';
  const supabase = getSupabase();
  const leadId = String(formData.get('lead_id') || '');
  const vehicleId = String(formData.get('vehicle_id') || '');
  const sellerName = String(formData.get('seller_name') || '');
  const financingBank = String(formData.get('financing_bank') || 'Bradesco');
  const paymentType = String(formData.get('payment_type') || 'financing');
  const saleValue = Number(formData.get('sale_value') || 0) || null;

  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
  const { data: vehicle } = await supabase.from('inventory').select('*').eq('id', vehicleId).single();
  if (!lead || !vehicle) return;

  const { data: saved } = await supabase.from('sales').insert({
    event_id: lead.event_id,
    lead_id: lead.id,
    store_id: lead.assigned_store_id,
    vehicle_id: vehicle.id,
    prospector_id: lead.prospector_id,
    seller_name: sellerName,
    customer_bank: lead.customer_bank,
    financing_bank: financingBank,
    payment_type: paymentType,
    sale_value: saleValue,
    vehicle_category: vehicle.vehicle_category
  }).select('*').single();

  await supabase.from('leads').update({ status: 'sale_confirmed', updated_at: new Date().toISOString() }).eq('id', lead.id);
  await supabase.from('inventory').update({ status: 'sold', updated_at: new Date().toISOString() }).eq('id', vehicle.id);
  await supabase.from('lead_activities').insert({ event_id: lead.event_id, lead_id: lead.id, activity_type: 'sale_confirmed', description: 'Fechamento registrado' });
  await supabase.from('audit_logs').insert({ event_id: lead.event_id, action_type: 'sale_confirmed', entity_type: 'sales', entity_id: saved?.id || null });
  revalidatePath('/store/operation');
}

async function registerReason(formData: FormData) {
  'use server';
  const supabase = getSupabase();
  const leadId = String(formData.get('lead_id') || '');
  const reason = String(formData.get('reason') || 'other');
  const description = String(formData.get('description') || '');
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return;

  const { data: saved } = await supabase.from('losses').insert({
    event_id: lead.event_id,
    lead_id: lead.id,
    store_id: lead.assigned_store_id,
    reason,
    description,
    lost_stage: lead.status
  }).select('*').single();

  await supabase.from('leads').update({ status: 'lost', updated_at: new Date().toISOString() }).eq('id', lead.id);
  await supabase.from('lead_activities').insert({ event_id: lead.event_id, lead_id: lead.id, activity_type: 'loss_registered', description: 'Motivo registrado' });
  await supabase.from('audit_logs').insert({ event_id: lead.event_id, action_type: 'loss_registered', entity_type: 'losses', entity_id: saved?.id || null });
  revalidatePath('/store/operation');
}

export default async function StoreOperationPage() {
  const data = await getData();

  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">Loja Participante</p>
        <h1 className="mt-2 text-4xl font-black">Operacao da loja</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card p-5"><p className="text-sm text-zinc-400">Lojas</p><strong className="text-3xl">{data.stores.length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Leads</p><strong className="text-3xl">{data.leads.length}</strong></div>
          <div className="card p-5"><p className="text-sm text-zinc-400">Estoque</p><strong className="text-3xl">{data.inventory.length}</strong></div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <form action={closeDeal} className="card p-6">
            <h2 className="text-2xl font-bold">Registrar fechamento</h2>
            <select name="lead_id" className="mt-4 w-full rounded-xl px-4 py-3" required><option value="">Lead</option>{data.leads.map((lead: any) => <option key={lead.id} value={lead.id}>{lead.customer_name}</option>)}</select>
            <select name="vehicle_id" className="mt-3 w-full rounded-xl px-4 py-3" required><option value="">Veiculo</option>{data.inventory.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model}</option>)}</select>
            <input name="seller_name" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Responsavel" required />
            <input name="financing_bank" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Banco" defaultValue="Bradesco" required />
            <input name="payment_type" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Pagamento" defaultValue="financing" required />
            <input name="sale_value" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Valor" />
            <button className="btn-primary mt-4" type="submit">Registrar fechamento</button>
          </form>

          <form action={registerReason} className="card p-6">
            <h2 className="text-2xl font-bold">Registrar motivo</h2>
            <select name="lead_id" className="mt-4 w-full rounded-xl px-4 py-3" required><option value="">Lead</option>{data.leads.map((lead: any) => <option key={lead.id} value={lead.id}>{lead.customer_name}</option>)}</select>
            <input name="reason" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Motivo" defaultValue="other" required />
            <textarea name="description" className="mt-3 w-full rounded-xl px-4 py-3" placeholder="Observacoes" />
            <button className="btn-secondary mt-4" type="submit">Registrar motivo</button>
          </form>
        </div>
      </section>
    </main>
  );
}
