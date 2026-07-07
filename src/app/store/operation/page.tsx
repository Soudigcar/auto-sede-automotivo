import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { BarChart3, Car, CheckCircle2, ClipboardList, Store, XCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { banks, lossReasons, paymentTypes } from '@/lib/constants';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
}

function formatMoney(value: number | null) {
  if (!value) return 'Valor nao informado';
  return `R$ ${Number(value).toLocaleString('pt-BR')}`;
}

async function getData(storeId?: string) {
  const supabase = getSupabase();
  const { data: stores } = await supabase.from('stores').select('*').eq('status', 'active').order('store_name');
  let leadQuery = supabase.from('leads').select('*').order('created_at', { ascending: false });
  let stockQuery = supabase.from('inventory').select('*').eq('status', 'available').order('created_at', { ascending: false });
  if (storeId) {
    leadQuery = leadQuery.eq('assigned_store_id', storeId);
    stockQuery = stockQuery.eq('store_id', storeId);
  }
  const { data: leads } = await leadQuery;
  const { data: inventory } = await stockQuery;
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
  const { data: saved } = await supabase.from('sales').insert({ event_id: lead.event_id, lead_id: lead.id, store_id: lead.assigned_store_id, vehicle_id: vehicle.id, prospector_id: lead.prospector_id, seller_name: sellerName, customer_bank: lead.customer_bank, financing_bank: financingBank, payment_type: paymentType, sale_value: saleValue, vehicle_category: vehicle.vehicle_category }).select('*').single();
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
  const { data: saved } = await supabase.from('losses').insert({ event_id: lead.event_id, lead_id: lead.id, store_id: lead.assigned_store_id, reason, description, lost_stage: lead.status }).select('*').single();
  await supabase.from('leads').update({ status: 'lost', updated_at: new Date().toISOString() }).eq('id', lead.id);
  await supabase.from('lead_activities').insert({ event_id: lead.event_id, lead_id: lead.id, activity_type: 'loss_registered', description: 'Motivo registrado' });
  await supabase.from('audit_logs').insert({ event_id: lead.event_id, action_type: 'loss_registered', entity_type: 'losses', entity_id: saved?.id || null });
  revalidatePath('/store/operation');
}

export default async function StoreOperationPage({ searchParams }: { searchParams?: { store_id?: string } }) {
  const storeId = searchParams?.store_id || '';
  const data = await getData(storeId);
  const activeLeads = data.leads.filter((lead: any) => !['sale_confirmed', 'lost'].includes(lead.status));
  const selectedStore = data.stores.find((store: any) => store.id === storeId);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Area operacional</p><p className="mt-1 font-bold">Loja Participante</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span></div>
          <nav className="mt-8 space-y-3 text-sm"><Link href="/store" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Inicio</Link><Link href="/store/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link><Link href="/store/operation" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><ClipboardList size={18} /> Operacao</Link></nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><p className="premium-eyebrow">Loja Participante</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Operacao da Loja</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Fechamento, perda, estoque e controle comercial no mesmo padrao visual do sistema.</p></div>
            <Link href="/store/live" className="premium-button-secondary"><BarChart3 size={18} /> Ver pipeline</Link>
          </header>

          <form className="premium-card mt-6 flex flex-col gap-3 p-5 md:flex-row md:items-end" method="get">
            <label className="flex-1 text-sm font-bold text-zinc-500">Filtrar por loja<select name="store_id" className="premium-input mt-2" defaultValue={storeId}><option value="">Todas</option>{data.stores.map((store: any) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select></label>
            <button className="premium-button-primary" type="submit">Aplicar filtro</button>
          </form>

          <section className="mt-5 grid gap-4 md:grid-cols-4">
            <MiniKpi label="Loja" value={selectedStore?.store_name || 'Todas'} tone="text-zinc-950" />
            <MiniKpi label="Lojas" value={String(data.stores.length)} tone="text-sky-600" />
            <MiniKpi label="Leads ativos" value={String(activeLeads.length)} tone="text-emerald-600" />
            <MiniKpi label="Estoque" value={String(data.inventory.length)} tone="text-red-600" />
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-2">
            <form action={closeDeal} className="premium-card p-6">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></div><div><h2 className="text-2xl font-black text-zinc-950">Registrar fechamento</h2><p className="premium-muted text-sm">Venda confirmada e veiculo baixado do estoque.</p></div></div>
              <div className="mt-5 grid gap-3"><select name="lead_id" className="premium-input" required><option value="">Lead</option>{activeLeads.map((lead: any) => <option key={lead.id} value={lead.id}>{lead.customer_name} - {lead.customer_phone || 'sem telefone'} - {lead.status}</option>)}</select><select name="vehicle_id" className="premium-input" required><option value="">Veiculo</option>{data.inventory.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} {vehicle.version || ''} {vehicle.model_year || ''}</option>)}</select><input name="seller_name" className="premium-input" placeholder="Responsavel" required /><select name="financing_bank" className="premium-input" defaultValue="Bradesco" required>{banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select><select name="payment_type" className="premium-input" defaultValue="financing" required>{paymentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input name="sale_value" className="premium-input" placeholder="Valor" /></div>
              <button className="premium-button-primary mt-5 w-full" type="submit">Registrar fechamento</button>
            </form>

            <form action={registerReason} className="premium-card p-6">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><XCircle size={22} /></div><div><h2 className="text-2xl font-black text-zinc-950">Registrar perda</h2><p className="premium-muted text-sm">Motivo comercial e etapa em que o lead foi perdido.</p></div></div>
              <div className="mt-5 grid gap-3"><select name="lead_id" className="premium-input" required><option value="">Lead</option>{activeLeads.map((lead: any) => <option key={lead.id} value={lead.id}>{lead.customer_name} - {lead.status}</option>)}</select><select name="reason" className="premium-input" defaultValue="other" required>{lossReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select><textarea name="description" className="premium-input min-h-32" placeholder="Observacoes" /></div>
              <button className="premium-button-secondary mt-5 w-full" type="submit">Registrar perda</button>
            </form>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-2">
            <ListCard title="Leads ativos" empty="Nenhum lead ativo encontrado.">{activeLeads.map((lead: any) => <div key={lead.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm"><strong className="text-zinc-950">{lead.customer_name}</strong><p className="mt-1 text-zinc-500">{lead.customer_phone || 'Sem telefone'} - {lead.customer_bank || 'Banco nao informado'}</p><p className="mt-1 text-xs text-zinc-400">Interesse: {lead.interested_vehicle || 'Nao informado'} | Status: {lead.status}</p></div>)}</ListCard>
            <ListCard title="Veiculos disponiveis" empty="Nenhum veiculo disponivel.">{data.inventory.map((vehicle: any) => <div key={vehicle.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm"><strong className="text-zinc-950">{vehicle.brand} {vehicle.model}</strong><p className="mt-1 text-zinc-500">{vehicle.version || 'Versao nao informada'} - {vehicle.model_year || 'Ano nao informado'} - {formatMoney(vehicle.price)}</p><p className="mt-1 text-xs text-zinc-400">Categoria: {vehicle.vehicle_category || 'Nao informada'}</p></div>)}</ListCard>
          </section>
        </div>
      </section>
    </main>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">{label}</p><strong className={`mt-3 block truncate text-3xl font-black ${tone}`}>{value}</strong></div>;
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="premium-card p-6"><h2 className="text-xl font-black text-zinc-950">{title}</h2><div className="mt-4 space-y-3">{hasChildren ? children : <p className="text-sm text-zinc-500">{empty}</p>}</div></div>;
}
