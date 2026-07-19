'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, Car, ClipboardList, Edit3, ExternalLink, Link as LinkIcon, LogOut, Package, Plus, Save, Store, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const statusLabel: Record<string, string> = {
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado'
};

const statusClass: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  reviewing: 'bg-sky-50 text-sky-700',
  imported: 'bg-indigo-50 text-indigo-700',
  published: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  duplicate: 'bg-zinc-100 text-zinc-600'
};

function money(value: any) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function vehicleImages(vehicle: any) {
  return [
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].filter(Boolean);
}

const emptyEditForm = {
  link_id: '',
  mode: 'link',
  vehicle_url: '',
  source_url: '',
  brand: '',
  model: '',
  version: '',
  year: '',
  mileage: '',
  color: '',
  transmission: '',
  fuel: '',
  price: '',
  status: 'disponivel',
  show_on_landing: true
};

export default function StoreStockPage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('Carregando estoque da loja...');
  const [saving, setSaving] = useState(false);
  const [newVehicleUrl, setNewVehicleUrl] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState<any>(emptyEditForm);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.access_token) {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return '';
    }

    return data.session.access_token;
  }

  async function apiRequest(payload?: any) {
    const token = await getAuthToken();

    if (!token) return null;

    if (!payload) {
      const response = await fetch(`/api/store-stock?slug=${encodeURIComponent(slug)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível carregar o estoque.');
      }

      return result;
    }

    const response = await fetch('/api/store-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ...payload, slug })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Não foi possível salvar.');
    }

    return result;
  }

  async function loadData() {
    try {
      const result = await apiRequest();

      if (!result) return;

      setStore(result.store);
      setItems(result.items || []);
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar estoque.');
    }
  }

  useEffect(() => {
    loadData();
  }, [slug]);

  const stats = useMemo(() => {
    const published = items.filter((item) => item.status === 'published' || item.vehicle).length;
    const pending = items.filter((item) => ['pending', 'reviewing', 'imported'].includes(item.status)).length;

    return {
      total: items.length,
      published,
      pending
    };
  }, [items]);

  async function addVehicleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Adicionando veículo ao estoque...');

    try {
      await apiRequest({
        action: 'add-link',
        vehicle_url: newVehicleUrl
      });

      setNewVehicleUrl('');
      setMessage('Link adicionado. O Master poderá conferir e publicar.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível adicionar o link.');
    }

    setSaving(false);
  }

  function startEdit(item: any) {
    const vehicle = item.vehicle;
    const image = vehicleImages(vehicle)[0];

    setEditingId(item.id);

    if (vehicle) {
      setEditForm({
        link_id: item.id,
        mode: 'vehicle',
        vehicle_url: item.vehicle_url || '',
        source_url: vehicle.source_url || item.vehicle_url || '',
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        version: vehicle.version || '',
        year: vehicle.year || '',
        mileage: vehicle.mileage || '',
        color: vehicle.color || '',
        transmission: vehicle.transmission || '',
        fuel: vehicle.fuel || '',
        price: String(vehicle.price || ''),
        status: vehicle.status || 'disponivel',
        show_on_landing: Boolean(vehicle.show_on_landing),
        image_url: image || ''
      });

      return;
    }

    setEditForm({
      ...emptyEditForm,
      link_id: item.id,
      mode: 'link',
      vehicle_url: item.vehicle_url || ''
    });
  }

  function cancelEdit() {
    setEditingId('');
    setEditForm(emptyEditForm);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Salvando alterações no estoque...');

    try {
      if (editForm.mode === 'vehicle') {
        await apiRequest({
          action: 'update-vehicle',
          ...editForm
        });

        setMessage('Anúncio atualizado com sucesso.');
      } else {
        await apiRequest({
          action: 'update-link',
          link_id: editForm.link_id,
          vehicle_url: editForm.vehicle_url
        });

        setMessage('Link atualizado com sucesso.');
      }

      cancelEdit();
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar.');
    }

    setSaving(false);
  }

  async function deleteItem(item: any) {
    const confirmDelete = window.confirm(
      item.vehicle
        ? 'Deseja excluir este anúncio da landing? Ele será ocultado do site.'
        : 'Deseja excluir este link enviado?'
    );

    if (!confirmDelete) return;

    setSaving(true);
    setMessage('Excluindo item do estoque...');

    try {
      await apiRequest({
        action: 'delete-item',
        link_id: item.id
      });

      setMessage('Item removido do estoque da loja.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível excluir.');
    }

    setSaving(false);
  }

  if (message && !store) {
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
            <p className="text-xs text-zinc-500">Área operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Início</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Loja Participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Estoque da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Links enviados, anúncios publicados na landing e controle de estoque exclusivo da loja {store?.store_name}.
              </p>
            </div>

            <Link href={`/loja/${slug}/pipeline`} className="premium-button-secondary">
              <BarChart3 size={18} /> Ver pipeline
            </Link>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
              {message}
            </div>
          ) : null}

          <section className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Total no estoque</p>
              <strong className="mt-3 block text-4xl font-black text-zinc-950">{stats.total}</strong>
            </div>

            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Publicados no site</p>
              <strong className="mt-3 block text-4xl font-black text-emerald-600">{stats.published}</strong>
            </div>

            <div className="premium-card p-5">
              <p className="text-sm font-bold text-zinc-500">Pendentes / conferência</p>
              <strong className="mt-3 block text-4xl font-black text-yellow-600">{stats.pending}</strong>
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Plus size={22} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black text-zinc-950">Adicionar veículo</h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">
                  Cole o link público do anúncio. O Master poderá conferir, editar e publicar na landing.
                </p>

                <form onSubmit={addVehicleLink} className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <input
                    className="premium-input"
                    placeholder="https://site-da-loja.com.br/veiculo..."
                    value={newVehicleUrl}
                    onChange={(event) => setNewVehicleUrl(event.target.value)}
                  />

                  <button className="premium-button-primary justify-center" type="submit" disabled={saving}>
                    <Plus size={18} /> Adicionar
                  </button>
                </form>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4">
            {items.map((item) => {
              const vehicle = item.vehicle;
              const image = vehicleImages(vehicle)[0];
              const isEditing = editingId === item.id;
              const sourceUrl = vehicle?.source_url || item.vehicle_url;

              return (
                <article key={item.id} className="premium-card p-5">
                  <div className="grid gap-5 xl:grid-cols-[180px_1fr_220px] xl:items-start">
                    <div className="overflow-hidden rounded-3xl bg-zinc-100">
                      {image ? (
                        <img src={image} alt={vehicle?.model || 'Veículo'} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-sm font-black text-zinc-400">
                          Sem foto
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass[item.status] || 'bg-zinc-100 text-zinc-600'}`}>
                          {statusLabel[item.status] || item.status}
                        </span>

                        {vehicle ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            Publicado na landing
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">
                            Aguardando publicação
                          </span>
                        )}
                      </div>

                      <h2 className="mt-3 break-words text-2xl font-black text-zinc-950">
                        {vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : 'Link enviado'}
                      </h2>

                      {vehicle ? (
                        <>
                          <p className="mt-1 break-words text-sm font-bold text-zinc-500">
                            {[vehicle.version, vehicle.year].filter(Boolean).join(' • ')}
                          </p>

                          <strong className="mt-3 block text-2xl font-black text-red-600">{money(vehicle.price)}</strong>

                          <div className="mt-4 grid gap-2 text-xs font-black text-zinc-600 md:grid-cols-2">
                            {vehicle.mileage ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">KM: {vehicle.mileage}</span> : null}
                            {vehicle.fuel ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Combustível: {vehicle.fuel}</span> : null}
                            {vehicle.transmission ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Câmbio: {vehicle.transmission}</span> : null}
                            {vehicle.color ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Cor: {vehicle.color}</span> : null}
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 break-words rounded-2xl bg-zinc-50 p-4 text-sm font-black text-zinc-700">
                          {item.vehicle_url}
                        </p>
                      )}

                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" className="mt-4 inline-flex max-w-full items-center gap-2 truncate text-xs font-black text-red-600">
                          <ExternalLink size={14} /> {sourceUrl}
                        </a>
                      ) : null}
                    </div>

                    <div className="grid gap-2">
                      <button className="premium-button-secondary justify-center text-xs" type="button" onClick={() => startEdit(item)}>
                        <Edit3 size={15} /> Editar
                      </button>

                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" className="premium-button-secondary justify-center text-xs">
                          <ExternalLink size={15} /> Abrir anúncio
                        </a>
                      ) : null}

                      <button className="premium-button-secondary justify-center border-red-200 text-xs text-red-600" type="button" onClick={() => deleteItem(item)} disabled={saving}>
                        <Trash2 size={15} /> Excluir
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <form onSubmit={saveEdit} className="mt-5 rounded-[28px] border border-red-100 bg-red-50/40 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-red-600">Editando estoque</p>
                          <h3 className="mt-1 text-xl font-black text-zinc-950">
                            {editForm.mode === 'vehicle' ? 'Editar anúncio publicado' : 'Editar link enviado'}
                          </h3>
                        </div>

                        <button className="premium-button-secondary justify-center text-xs" type="button" onClick={cancelEdit}>
                          <X size={15} /> Cancelar
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Link do anúncio</span>
                          <input
                            className="premium-input bg-white"
                            value={editForm.mode === 'vehicle' ? editForm.source_url : editForm.vehicle_url}
                            onChange={(event) => setEditForm({
                              ...editForm,
                              ...(editForm.mode === 'vehicle'
                                ? { source_url: event.target.value, vehicle_url: event.target.value }
                                : { vehicle_url: event.target.value })
                            })}
                          />
                        </label>

                        {editForm.mode === 'vehicle' ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <input className="premium-input bg-white" placeholder="Marca" value={editForm.brand} onChange={(event) => setEditForm({ ...editForm, brand: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Modelo" value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Versão" value={editForm.version} onChange={(event) => setEditForm({ ...editForm, version: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Ano" value={editForm.year} onChange={(event) => setEditForm({ ...editForm, year: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="KM" value={editForm.mileage} onChange={(event) => setEditForm({ ...editForm, mileage: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Cor" value={editForm.color} onChange={(event) => setEditForm({ ...editForm, color: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Câmbio" value={editForm.transmission} onChange={(event) => setEditForm({ ...editForm, transmission: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Combustível" value={editForm.fuel} onChange={(event) => setEditForm({ ...editForm, fuel: event.target.value })} />
                              <input className="premium-input bg-white" placeholder="Preço" value={editForm.price} onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} />

                              <select className="premium-input bg-white" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                                <option value="disponivel">Disponível</option>
                                <option value="vendido">Vendido</option>
                                <option value="oculto">Oculto</option>
                              </select>
                            </div>

                            <label className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm font-black text-zinc-700">
                              <input type="checkbox" checked={Boolean(editForm.show_on_landing)} onChange={(event) => setEditForm({ ...editForm, show_on_landing: event.target.checked })} />
                              Exibir na landing
                            </label>
                          </>
                        ) : null}

                        <button className="premium-button-primary justify-center" type="submit" disabled={saving}>
                          <Save size={17} /> Salvar alterações
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })}

            {!items.length ? (
              <div className="premium-card p-8 text-center">
                <Package className="mx-auto text-zinc-300" size={42} />
                <h2 className="mt-4 text-2xl font-black text-zinc-950">Nenhum veículo no estoque</h2>
                <p className="mt-2 text-sm font-bold text-zinc-500">
                  Adicione o primeiro link de anúncio para enviar ao Master.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
