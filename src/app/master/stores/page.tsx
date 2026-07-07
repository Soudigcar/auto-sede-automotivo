'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarDays, Car, FileText, KeyRound, Pencil, Store, Trash2, Upload, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getActiveEvent, getActiveStores } from '@/lib/database';
import { inventoryKey, parseInventoryText } from '@/lib/inventory-import';

function getStorePortalPath(storeId: string) {
  return `/login?redirectedFrom=${encodeURIComponent(`/store/operation?store_id=${storeId}`)}`;
}

function getStorePortalUrl(storeId: string) {
  const path = getStorePortalPath(storeId);
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configuredUrl) return `${configuredUrl}${path}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function generateTemporaryPassword() {
  const partA = Math.random().toString(36).slice(2, 7).toUpperCase();
  const partB = Math.floor(1000 + Math.random() * 9000);
  return `Loja@${partA}${partB}`;
}

export default function MasterStoresPage() {
  const supabase = createClient();
  const [eventId, setEventId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [inventoryByStore, setInventoryByStore] = useState<Record<string, number>>({});
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [access, setAccess] = useState<{ storeName: string; email: string; password: string; link: string } | null>(null);
  const [form, setForm] = useState({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });

  async function loadData() {
    try {
      const activeEvent = await getActiveEvent();
      setEventId(activeEvent.id);
      const activeStores = await getActiveStores(activeEvent.id);
      setStores(activeStores);
      if (!selectedStoreId && activeStores[0]?.id) setSelectedStoreId(activeStores[0].id);

      const { data: inventory } = await supabase.from('inventory').select('id,store_id').eq('event_id', activeEvent.id);
      const counts: Record<string, number> = {};
      (inventory || []).forEach((item: any) => {
        counts[item.store_id] = (counts[item.store_id] || 0) + 1;
      });
      setInventoryByStore(counts);
    } catch {
      setMessage('Cadastre ou rode o seed do evento MVP no Supabase.');
    }
  }

  useEffect(() => { loadData(); }, []);

  async function prepareStoreUser(store: any, password: string) {
    if (!store.responsible_email) return;
    await supabase.from('users').upsert({
      full_name: store.responsible_name,
      email: String(store.responsible_email).toLowerCase(),
      phone: store.responsible_phone || null,
      role: 'store',
      status: 'active',
      must_change_password: true
    }, { onConflict: 'email' });

    await fetch('/api/master/create-store-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: store.responsible_email, password, fullName: store.responsible_name, phone: store.responsible_phone || '' })
    }).catch(() => null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(editingId ? 'Atualizando loja...' : 'Salvando loja...');

    if (editingId) {
      const { error } = await supabase.from('stores').update({
        store_name: form.storeName,
        responsible_name: form.responsibleName,
        responsible_phone: form.responsiblePhone,
        responsible_email: form.responsibleEmail,
        updated_at: new Date().toISOString()
      }).eq('id', editingId);
      if (error) {
        setMessage('Erro ao atualizar loja.');
        return;
      }
      await supabase.from('users').upsert({ full_name: form.responsibleName, email: form.responsibleEmail, phone: form.responsiblePhone || null, role: 'store', status: 'active', must_change_password: true }, { onConflict: 'email' });
      setEditingId('');
      setMessage('Loja atualizada com sucesso.');
    } else {
      const { data: savedStore, error } = await supabase.from('stores').insert({
        event_id: eventId,
        store_name: form.storeName,
        responsible_name: form.responsibleName,
        responsible_phone: form.responsiblePhone,
        responsible_email: form.responsibleEmail,
        status: 'active'
      }).select('*').single();
      if (error || !savedStore) {
        setMessage('Erro ao cadastrar loja. Verifique as politicas do Supabase.');
        return;
      }
      const password = generateTemporaryPassword();
      await prepareStoreUser(savedStore, password);
      setAccess({ storeName: savedStore.store_name, email: savedStore.responsible_email, password, link: getStorePortalUrl(savedStore.id) });
      setSelectedStoreId(savedStore.id);
      setMessage('Loja cadastrada e acesso provisório gerado.');
    }

    setForm({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });
    await loadData();
  }

  async function handleInventoryUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!selectedStoreId) {
      setMessage('Selecione uma loja antes de anexar o estoque.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'txt', 'pdf'].includes(extension || '')) {
      setMessage('Formato nao aceito. Envie TXT, CSV ou PDF.');
      event.target.value = '';
      return;
    }

    if (extension === 'pdf') {
      setMessage('PDF recebido. A leitura automatica sem duplicidade deste MVP funciona com CSV ou TXT; para importar os carros, envie o estoque em CSV/TXT.');
      event.target.value = '';
      return;
    }

    const text = await file.text();
    const parsedRows = parseInventoryText(text, eventId, selectedStoreId);
    if (parsedRows.length === 0) {
      setMessage('Nenhum veiculo valido encontrado. Use colunas: marca, modelo, versao, ano_fabricacao, ano_modelo, categoria, placa, cor, preco.');
      event.target.value = '';
      return;
    }

    const { data: existingRows } = await supabase.from('inventory').select('*').eq('store_id', selectedStoreId);
    const existingKeys = new Set((existingRows || []).map(inventoryKey));
    const fileKeys = new Set<string>();
    const uniqueRows = parsedRows.filter((item) => {
      const key = inventoryKey(item);
      if (existingKeys.has(key) || fileKeys.has(key)) return false;
      fileKeys.add(key);
      return true;
    });

    if (uniqueRows.length === 0) {
      setMessage('Nenhum carro novo importado. O arquivo parece duplicado com o estoque ja cadastrado.');
      event.target.value = '';
      return;
    }

    const { error } = await supabase.from('inventory').insert(uniqueRows);
    if (error) {
      setMessage('Erro ao importar estoque. Confira as colunas do arquivo e as politicas do Supabase.');
      event.target.value = '';
      return;
    }

    setMessage(`${uniqueRows.length} veiculo(s) importado(s). ${parsedRows.length - uniqueRows.length} duplicidade(s) ignorada(s).`);
    event.target.value = '';
    await loadData();
  }

  function startEdit(store: any) {
    setEditingId(store.id);
    setForm({ storeName: store.store_name || '', responsibleName: store.responsible_name || '', responsiblePhone: store.responsible_phone || '', responsibleEmail: store.responsible_email || '' });
    setMessage(`Editando ${store.store_name}.`);
  }

  async function removeStore(store: any) {
    const confirmed = window.confirm(`Remover a loja ${store.store_name}? Ela sera desativada para preservar historico.`);
    if (!confirmed) return;
    const { error } = await supabase.from('stores').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', store.id);
    if (error) {
      setMessage('Erro ao remover loja.');
      return;
    }
    setMessage('Loja removida da operação ativa.');
    await loadData();
  }

  async function generateAccess(store: any) {
    const password = generateTemporaryPassword();
    await prepareStoreUser(store, password);
    setAccess({ storeName: store.store_name, email: store.responsible_email, password, link: getStorePortalUrl(store.id) });
    setMessage('Novo acesso provisório gerado.');
  }

  async function copyAccess() {
    if (!access) return;
    await navigator.clipboard.writeText(`Loja: ${access.storeName}\nLogin: ${access.email}\nSenha provisória: ${access.password}\nLink: ${access.link}`);
    setMessage('Acesso copiado.');
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div><div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div></div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Gestao Master</p><p className="mt-1 font-bold">Lojas & Estoque</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span></div>
          <nav className="mt-8 space-y-3 text-sm"><Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link><Link href="/master/events" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><CalendarDays size={18} /> Eventos</Link><Link href="/master/stores" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Store size={18} /> Lojas & Estoque</Link><Link href="/master/users" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><UserCog size={18} /> Equipe</Link><Link href="/master/reports" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><FileText size={18} /> Relatorios</Link></nav>
        </aside>
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="premium-eyebrow">Gestao Master</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Lojas Participantes</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Cadastre lojas, gere senha provisória, anexe estoque, edite ou remova lojas ativas.</p></div><Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link></header>
          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}
          {access ? <div className="premium-card mt-5 p-5"><h2 className="text-xl font-black text-zinc-950">Acesso provisório da loja</h2><div className="mt-4 grid gap-3 md:grid-cols-4"><Info label="Loja" value={access.storeName} /><Info label="Login" value={access.email} /><Info label="Senha provisória" value={access.password} /><Info label="Link" value={access.link} /></div><button onClick={copyAccess} className="premium-button-primary mt-4" type="button">Copiar acesso</button></div> : null}
          <section className="mt-7 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-5"><form onSubmit={handleSubmit} className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">{editingId ? 'Editar loja' : 'Cadastrar loja'}</h2><div className="mt-5 grid gap-3"><input className="premium-input" placeholder="Nome da loja" value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} required /><input className="premium-input" placeholder="Nome do responsavel" value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} required /><input className="premium-input" placeholder="Telefone do responsavel" value={form.responsiblePhone} onChange={(event) => setForm({ ...form, responsiblePhone: event.target.value })} /><input className="premium-input" placeholder="E-mail do responsavel" value={form.responsibleEmail} onChange={(event) => setForm({ ...form, responsibleEmail: event.target.value })} required /><button className="premium-button-primary" type="submit">{editingId ? 'Salvar alterações' : 'Cadastrar e gerar senha'}</button>{editingId ? <button className="premium-button-secondary" type="button" onClick={() => { setEditingId(''); setForm({ storeName: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' }); }}>Cancelar edição</button> : null}</div></form><div className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Anexar estoque</h2><p className="mt-2 text-sm text-zinc-500">CSV/TXT importam automaticamente com leitura contra duplicidade. PDF é aceito, mas a importação estruturada automática entra em etapa posterior.</p><div className="mt-5 grid gap-3"><select className="premium-input" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}><option value="">Selecione a loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select><label className="premium-button-secondary cursor-pointer"><Upload size={16} /> Upload TXT, CSV ou PDF<input className="hidden" type="file" accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf" onChange={handleInventoryUpload} /></label><p className="text-xs text-zinc-400">Modelo: marca, modelo, versao, ano_fabricacao, ano_modelo, categoria, placa, cor, preco</p></div></div></div>
            <div className="premium-card p-6"><h2 className="text-2xl font-black text-zinc-950">Lojas cadastradas</h2><p className="mt-1 text-sm text-zinc-500">Total: {stores.length}</p><div className="mt-5 grid gap-3">{stores.map((store) => <div key={store.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"><h3 className="font-black text-zinc-950">{store.store_name}</h3><p className="mt-1 text-sm text-zinc-500">Responsavel: {store.responsible_name}</p><p className="mt-1 text-xs text-zinc-400">{store.responsible_phone || 'Telefone nao informado'} | {store.responsible_email || 'E-mail nao informado'}</p><p className="mt-2 text-xs font-black uppercase tracking-wide text-sky-600">Estoque cadastrado: {inventoryByStore[store.id] || 0}</p><p className="mt-3 break-all text-xs text-zinc-400">Link login: {getStorePortalUrl(store.id)}</p><div className="mt-4 flex flex-wrap gap-2"><a href={getStorePortalUrl(store.id)} className="premium-button-primary text-xs">Acessar</a><button className="premium-button-secondary text-xs" type="button" onClick={() => generateAccess(store)}><KeyRound size={14} /> Gerar acesso</button><button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(store)}><Pencil size={14} /> Editar</button><button className="premium-button-secondary text-xs" type="button" onClick={() => removeStore(store)}><Trash2 size={14} /> Remover</button></div></div>)}{stores.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma loja cadastrada.</p> : null}</div></div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="mt-1 block break-all text-sm text-zinc-950">{value}</strong></div>;
}
