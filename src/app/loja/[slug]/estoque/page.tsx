'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, Camera, Car, CheckCircle2, ClipboardList, Edit3, ExternalLink, LogOut, Package, Plus, Save, Store, Trash2, UploadCloud, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const statusLabel: Record<string, string> = {
  pending: 'Link enviado',
  reviewing: 'Dados importados',
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

const requiredFields = [
  { key: 'source_url', label: 'Link original' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'version', label: 'Versão' },
  { key: 'year', label: 'Ano' },
  { key: 'mileage', label: 'KM' },
  { key: 'fuel', label: 'Combustível' },
  { key: 'transmission', label: 'Câmbio' },
  { key: 'color', label: 'Cor' },
  { key: 'price', label: 'Valor' }
];

function money(value: any) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function cleanText(value: any) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parsePrice(value: any) {
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw) || 0;
}

function vehicleImages(vehicle: any) {
  return [
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].filter(Boolean);
}

function missingFields(form: any) {
  const missing = requiredFields
    .filter((field) => {
      if (field.key === 'price') return !parsePrice(form.price);
      return !cleanText(form[field.key]);
    })
    .map((field) => field.label);

  if (!Array.isArray(form.image_urls) || form.image_urls.filter(Boolean).length < 1) {
    missing.push('Pelo menos 1 foto');
  }

  return missing;
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
  show_on_landing: true,
  image_url: '',
  image_urls: [] as string[],
  is_featured: false
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
  const [importingId, setImportingId] = useState('');
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

  const currentMissing = useMemo(() => missingFields(editForm), [editForm]);
  const canPublish = currentMissing.length === 0;

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
      setMessage('Link adicionado. Agora clique em “Importar fotos e dados”.');
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível adicionar o link.');
    }

    setSaving(false);
  }

  function buildFormFromItem(item: any, imported?: any) {
    const vehicle = item.vehicle;
    const preview = imported || item?.metadata?.imported_preview || {};
    const images = vehicle
      ? vehicleImages(vehicle)
      : Array.isArray(preview.image_urls)
        ? preview.image_urls
        : [];

    return {
      link_id: item.id,
      mode: vehicle ? 'vehicle' : 'draft',
      vehicle_url: item.vehicle_url || '',
      source_url: vehicle?.source_url || preview.source_url || item.vehicle_url || '',
      brand: vehicle?.brand || preview.brand || '',
      model: vehicle?.model || preview.model || '',
      version: vehicle?.version || preview.version || '',
      year: vehicle?.year || preview.year || '',
      mileage: vehicle?.mileage || preview.mileage || '',
      color: vehicle?.color || preview.color || '',
      transmission: vehicle?.transmission || preview.transmission || '',
      fuel: vehicle?.fuel || preview.fuel || '',
      price: String(vehicle?.price || preview.price || ''),
      status: vehicle?.status || 'disponivel',
      show_on_landing: vehicle ? Boolean(vehicle.show_on_landing) : true,
      image_url: images[0] || '',
      image_urls: images,
      is_featured: Boolean(vehicle?.is_featured)
    };
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditForm(buildFormFromItem(item));
  }

  function cancelEdit() {
    setEditingId('');
    setEditForm(emptyEditForm);
  }

  async function importItem(item: any) {
    setImportingId(item.id);
    setMessage('Importando fotos e dados do anúncio. Aguarde...');

    try {
      const result = await apiRequest({
        action: 'import-data',
        link_id: item.id,
        vehicle_url: item.vehicle_url
      });

      if (!result) return;

      const form = buildFormFromItem(item, result.imported);
      setEditingId(item.id);
      setEditForm(form);

      if (result.missing?.length) {
        setMessage(`Importação concluída. Preencha antes de publicar: ${result.missing.join(', ')}.`);
      } else {
        setMessage('Importação concluída. Confira os dados e publique na landing.');
      }

      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível importar fotos e dados.');
    }

    setImportingId('');
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Salvando alterações...');

    try {
      if (editForm.mode === 'link') {
        await apiRequest({
          action: 'update-link',
          link_id: editForm.link_id,
          vehicle_url: editForm.vehicle_url
        });

        setMessage('Link atualizado com sucesso.');
        cancelEdit();
        await loadData();
        setSaving(false);
        return;
      }

      await apiRequest({
        action: 'publish-vehicle',
        ...editForm
      });

      setMessage('Veículo publicado na landing com sucesso.');
      cancelEdit();
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar/publicar.');
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
                A loja pode importar fotos e dados, mas só publica na landing quando todos os campos obrigatórios estiverem preenchidos.
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
                  Cole o link público do anúncio. Depois clique em importar para puxar fotos e dados.
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
              const preview = item?.metadata?.imported_preview;
              const image = vehicleImages(vehicle)[0] || preview?.image_url || preview?.image_urls?.[0];
              const isEditing = editingId === item.id;
              const sourceUrl = vehicle?.source_url || preview?.source_url || item.vehicle_url;
              const publicationStatus = item?.metadata?.publication_status;
              const itemMissing = item?.metadata?.missing_fields || [];

              return (
                <article key={item.id} className="premium-card p-5">
                  <div className="grid gap-5 xl:grid-cols-[180px_1fr_240px] xl:items-start">
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
                        ) : publicationStatus === 'pronto_para_publicar' ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            Pronto para publicar
                          </span>
                        ) : itemMissing.length ? (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                            Aguardando preenchimento
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">
                            Aguardando importação
                          </span>
                        )}
                      </div>

                      <h2 className="mt-3 break-words text-2xl font-black text-zinc-950">
                        {vehicle
                          ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim()
                          : preview?.brand || preview?.model
                            ? `${preview.brand || ''} ${preview.model || ''}`.trim()
                            : 'Link enviado'}
                      </h2>

                      {vehicle || preview ? (
                        <>
                          <p className="mt-1 break-words text-sm font-bold text-zinc-500">
                            {[vehicle?.version || preview?.version, vehicle?.year || preview?.year].filter(Boolean).join(' • ')}
                          </p>

                          <strong className="mt-3 block text-2xl font-black text-red-600">{money(vehicle?.price || preview?.price)}</strong>

                          <div className="mt-4 grid gap-2 text-xs font-black text-zinc-600 md:grid-cols-2">
                            {(vehicle?.mileage || preview?.mileage) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">KM: {vehicle?.mileage || preview?.mileage}</span> : null}
                            {(vehicle?.fuel || preview?.fuel) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Combustível: {vehicle?.fuel || preview?.fuel}</span> : null}
                            {(vehicle?.transmission || preview?.transmission) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Câmbio: {vehicle?.transmission || preview?.transmission}</span> : null}
                            {(vehicle?.color || preview?.color) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Cor: {vehicle?.color || preview?.color}</span> : null}
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 break-words rounded-2xl bg-zinc-50 p-4 text-sm font-black text-zinc-700">
                          {item.vehicle_url}
                        </p>
                      )}

                      {itemMissing.length ? (
                        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-black text-red-700">
                          Falta preencher: {itemMissing.join(', ')}
                        </div>
                      ) : null}

                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" className="mt-4 inline-flex max-w-full items-center gap-2 truncate text-xs font-black text-red-600">
                          <ExternalLink size={14} /> {sourceUrl}
                        </a>
                      ) : null}
                    </div>

                    <div className="grid gap-2">
                      <button className="premium-button-secondary justify-center text-xs" type="button" onClick={() => importItem(item)} disabled={Boolean(importingId) || saving}>
                        <UploadCloud size={15} /> {importingId === item.id ? 'Importando...' : vehicle ? 'Atualizar fotos/dados' : 'Importar fotos e dados'}
                      </button>

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
                    <form onSubmit={saveDraft} className="mt-5 rounded-[28px] border border-red-100 bg-red-50/40 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-red-600">Conferência obrigatória</p>
                          <h3 className="mt-1 text-xl font-black text-zinc-950">
                            Preencha todos os campos antes de publicar
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
                            value={editForm.source_url || editForm.vehicle_url}
                            onChange={(event) => setEditForm({
                              ...editForm,
                              source_url: event.target.value,
                              vehicle_url: event.target.value
                            })}
                          />
                        </label>

                        <div className="grid gap-3 md:grid-cols-2">
                          <input className="premium-input bg-white" placeholder="Marca *" value={editForm.brand} onChange={(event) => setEditForm({ ...editForm, brand: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Modelo *" value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Versão *" value={editForm.version} onChange={(event) => setEditForm({ ...editForm, version: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Ano *" value={editForm.year} onChange={(event) => setEditForm({ ...editForm, year: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="KM *" value={editForm.mileage} onChange={(event) => setEditForm({ ...editForm, mileage: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Cor *" value={editForm.color} onChange={(event) => setEditForm({ ...editForm, color: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Câmbio *" value={editForm.transmission} onChange={(event) => setEditForm({ ...editForm, transmission: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Combustível *" value={editForm.fuel} onChange={(event) => setEditForm({ ...editForm, fuel: event.target.value })} />
                          <input className="premium-input bg-white" placeholder="Valor *" value={editForm.price} onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} />

                          <select className="premium-input bg-white" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                            <option value="disponivel">Disponível</option>
                            <option value="vendido">Vendido</option>
                            <option value="oculto">Oculto</option>
                          </select>
                        </div>

                        <div className="rounded-[24px] bg-white p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-black text-zinc-950">Fotos importadas *</p>
                              <p className="text-xs font-bold text-zinc-500">É obrigatório ter pelo menos 1 foto para publicar.</p>
                            </div>

                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">
                              {editForm.image_urls?.length || 0} foto(s)
                            </span>
                          </div>

                          {editForm.image_urls?.length ? (
                            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                              {editForm.image_urls.map((image: string, index: number) => (
                                <div key={`${image}-${index}`} className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                                  <img src={image} alt="Foto importada" className="h-full w-full object-cover" />
                                  <button
                                    type="button"
                                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600 shadow"
                                    onClick={() => {
                                      const nextImages = editForm.image_urls.filter((_: string, imageIndex: number) => imageIndex !== index);
                                      setEditForm({
                                        ...editForm,
                                        image_urls: nextImages,
                                        image_url: nextImages[0] || ''
                                      });
                                    }}
                                  >
                                    <X size={14} />
                                  </button>

                                  {index === 0 ? (
                                    <span className="absolute bottom-1 left-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">
                                      Capa
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-dashed border-red-200 bg-red-50 p-4 text-sm font-black text-red-600">
                              Nenhuma foto importada. Clique em “Importar fotos e dados”.
                            </div>
                          )}
                        </div>

                        {currentMissing.length ? (
                          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-black text-yellow-800">
                            Para publicar, falta preencher: {currentMissing.join(', ')}.
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                            <CheckCircle2 className="mr-2 inline" size={16} />
                            Tudo preenchido. O veículo já pode ser publicado na landing.
                          </div>
                        )}

                        <button
                          className={`justify-center rounded-2xl px-5 py-4 text-sm font-black text-white transition ${canPublish ? 'bg-red-600 shadow-xl shadow-red-600/20 hover:bg-red-700' : 'cursor-not-allowed bg-zinc-300'}`}
                          type="submit"
                          disabled={saving || !canPublish}
                        >
                          <Save size={17} /> {editForm.mode === 'vehicle' ? 'Salvar e manter publicado' : 'Publicar na landing'}
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
                  Adicione o primeiro link de anúncio para importar fotos, preencher os dados e publicar.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
