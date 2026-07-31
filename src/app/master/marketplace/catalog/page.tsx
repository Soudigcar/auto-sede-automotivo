'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Store,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { absolutePortalUrl, publicVehiclePath } from '@/lib/publicRoutes';
import { createClient } from '@/lib/supabase';

const emptyForm: any = {
  id: '',
  submission_id: '',
  store_id: '',
  brand: '',
  model: '',
  version: '',
  year: '',
  mileage: '',
  color: '',
  transmission: '',
  fuel: '',
  price: '',
  image_url: '',
  image_urls: [],
  source_url: '',
  status: 'disponivel',
  show_on_landing: true,
  is_featured: false
};

const statusLabels: Record<string, string> = {
  disponivel: 'Disponível',
  oculto: 'Oculto',
  vendido: 'Vendido',
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado',
  processed: 'Processado',
  error: 'Erro'
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  });
}

function dateTime(value: unknown) {
  if (!value) return 'Sem data';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? 'Sem data'
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function vehicleName(vehicle: any) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' ') || 'Veículo sem identificação';
}

function vehicleImages(vehicle: any) {
  return Array.from(new Set([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].filter(Boolean))) as string[];
}

function StatusBadge({ value }: { value: string }) {
  const status = String(value || '').toLowerCase();
  const className = status === 'disponivel' || status === 'published' || status === 'processed'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'vendido'
      ? 'bg-blue-50 text-blue-700'
      : status === 'error' || status === 'rejected'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700';

  return <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${className}`}>{statusLabels[status] || status}</span>;
}

export default function MarketplaceCatalogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [stockImports, setStockImports] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');

    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

      const response = await fetch('/api/master/marketplace/catalog', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o catálogo.');

      setVehicles(result.vehicles || []);
      setStores(result.stores || []);
      setSubmissions(result.submissions || []);
      setStockImports(result.stock_imports || []);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o catálogo.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const activeStores = useMemo(
    () => stores.filter((store) => store.status === 'active'),
    [stores]
  );

  const filteredVehicles = useMemo(() => {
    const term = query.toLowerCase().trim();
    return vehicles.filter((vehicle) => {
      if (storeFilter !== 'all' && vehicle.store_id !== storeFilter) return false;
      if (statusFilter !== 'all' && vehicle.status !== statusFilter) return false;
      if (!term) return true;
      return [
        vehicle.brand,
        vehicle.model,
        vehicle.version,
        vehicle.year,
        vehicle.store_name,
        vehicle.color,
        vehicle.fuel,
        vehicle.transmission
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [query, statusFilter, storeFilter, vehicles]);

  const pendingSubmissions = submissions.filter((item) => ['pending', 'reviewing', 'imported'].includes(item.status));
  const openImports = stockImports.filter((item) => ['pending', 'reviewing', 'error'].includes(item.status));
  const publishedCount = vehicles.filter((item) => item.status === 'disponivel' && item.show_on_landing).length;
  const featuredCount = vehicles.filter((item) => item.status === 'disponivel' && item.show_on_landing && item.is_featured).length;

  function startNew(submission?: any) {
    setForm({
      ...emptyForm,
      submission_id: submission?.id || '',
      store_id: submission?.store_id || '',
      source_url: submission?.vehicle_url || ''
    });
    setFormOpen(true);
    setMessage(submission ? 'Complete os dados importados antes de publicar no catálogo permanente.' : 'Novo veículo iniciado.');
  }

  function startEdit(vehicle: any) {
    setForm({
      ...emptyForm,
      ...vehicle,
      price: String(vehicle.price || ''),
      image_urls: vehicleImages(vehicle)
    });
    setFormOpen(true);
    setMessage('Editando veículo do catálogo permanente.');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('Salvando veículo...');

    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');

      const response = await fetch('/api/master/marketplace/catalog', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'save_vehicle', ...form })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o veículo.');

      setFormOpen(false);
      setForm(emptyForm);
      setMessage(result.message || 'Veículo salvo.');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o veículo.');
    } finally {
      setSaving(false);
    }
  }

  async function removeVehicle(vehicle: any) {
    const confirmation = window.prompt(`Remover “${vehicleName(vehicle)}” do catálogo? Digite EXCLUIR para confirmar.`);
    if (confirmation !== 'EXCLUIR') return;

    setBusyId(vehicle.id);
    try {
      const token = await getToken();
      const response = await fetch('/api/master/marketplace/catalog', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_vehicle', vehicle_id: vehicle.id })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover o veículo.');
      setMessage(result.message || 'Veículo removido.');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível remover o veículo.');
    } finally {
      setBusyId('');
    }
  }

  async function uploadImages(files?: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage('Enviando imagens...');

    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');

      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        const body = new FormData();
        body.append('file', file);
        body.append('vehicle_id', form.id || 'novo');
        const response = await fetch('/api/master/marketplace/catalog/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Erro ao enviar ${file.name}.`);
        uploaded.push(result.public_url);
      }

      setForm((current: any) => {
        const images = Array.from(new Set([...(current.image_urls || []), ...uploaded]));
        return { ...current, image_url: current.image_url || images[0] || '', image_urls: images };
      });
      setMessage(`${uploaded.length} imagem(ns) enviada(s).`);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível enviar as imagens.');
    } finally {
      setUploading(false);
    }
  }

  function setCover(url: string) {
    setForm((current: any) => ({ ...current, image_url: url }));
  }

  function removeImage(url: string) {
    setForm((current: any) => {
      const images = (current.image_urls || []).filter((item: string) => item !== url);
      return { ...current, image_urls: images, image_url: current.image_url === url ? images[0] || '' : current.image_url };
    });
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/marketplace" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="premium-eyebrow">Marketplace permanente</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Catálogo de veículos</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Cadastre e edite os veículos permanentes do Portal Auto Sede. Landings temporárias continuam exclusivamente em Campanhas e Landings.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link className="premium-button-secondary" href="/master/marketplace"><ArrowLeft size={18} /> Voltar ao Marketplace</Link>
              <a className="premium-button-secondary" href={absolutePortalUrl('/veiculos')} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Abrir catálogo público</a>
              <button className="premium-button-primary" type="button" onClick={() => startNew()}><Plus size={18} /> Novo veículo</button>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Veículos cadastrados" value={vehicles.length} icon={<Car size={20} />} />
            <Metric label="Publicados no portal" value={publishedCount} icon={<CheckCircle2 size={20} />} />
            <Metric label="Destaques" value={featuredCount} icon={<Star size={20} />} />
            <Metric label="Links pendentes" value={pendingSubmissions.length} icon={<Link2 size={20} />} />
            <Metric label="Arquivos pendentes" value={openImports.length} icon={<FileSpreadsheet size={20} />} />
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.7fr_auto]">
              <label className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input className="premium-input pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar veículo, ano, loja, cor ou combustível" />
              </label>
              <select className="premium-input" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                <option value="all">Todas as lojas</option>
                {activeStores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
              </select>
              <select className="premium-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos os status</option>
                <option value="disponivel">Disponíveis</option>
                <option value="oculto">Ocultos</option>
                <option value="vendido">Vendidos</option>
              </select>
              <button className="premium-button-secondary justify-center" type="button" onClick={() => void load()}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
            </div>
          </section>

          <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredVehicles.map((vehicle) => {
              const images = vehicleImages(vehicle);
              const publicUrl = vehicle.id ? absolutePortalUrl(publicVehiclePath(vehicle)) : '';
              return (
                <article key={vehicle.id} className="premium-card overflow-hidden">
                  <div className="relative aspect-[16/10] bg-zinc-100">
                    {vehicle.image_url ? <img src={vehicle.image_url} alt={vehicleName(vehicle)} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-300"><ImagePlus size={48} /></div>}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2"><StatusBadge value={vehicle.status} />{vehicle.is_featured ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700">DESTAQUE</span> : null}</div>
                    {images.length > 1 ? <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-black text-white">{images.length} fotos</span> : null}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">{vehicle.store_name || 'Loja não definida'}</p>
                    <h2 className="mt-2 text-xl font-black text-zinc-950">{vehicleName(vehicle)}</h2>
                    <strong className="mt-3 block text-2xl font-black text-zinc-950">{money(vehicle.price)}</strong>
                    <p className="mt-2 text-xs font-bold text-zinc-400">{vehicle.show_on_landing ? 'Visível no Portal Oficial' : 'Oculto do Portal Oficial'} · Atualizado {dateTime(vehicle.updated_at)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {vehicle.status !== 'vendido' ? <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(vehicle)}><Pencil size={14} /> Editar</button> : <span className="rounded-2xl bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-500">Edição bloqueada pela venda</span>}
                      {vehicle.status === 'disponivel' && vehicle.show_on_landing ? <a className="premium-button-secondary text-xs" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver no portal</a> : null}
                      {vehicle.status !== 'vendido' ? <button className="premium-button-secondary text-xs text-red-600" type="button" disabled={busyId === vehicle.id} onClick={() => void removeVehicle(vehicle)}><Trash2 size={14} /> Excluir</button> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {!loading && !filteredVehicles.length ? <div className="premium-card mt-5 p-10 text-center text-sm font-bold text-zinc-500">Nenhum veículo encontrado com estes filtros.</div> : null}
          {loading ? <div className="premium-card mt-5 flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-red-600" size={34} /></div> : null}

          <section className="mt-8 grid gap-5 xl:grid-cols-2">
            <QueueCard title="Links enviados pelas lojas" description="Itens ainda aguardando tratamento antes de entrar no catálogo permanente." icon={<Link2 size={21} />} count={pendingSubmissions.length}>
              {pendingSubmissions.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="block text-sm text-zinc-950">{item.store?.store_name || 'Loja não identificada'}</strong><p className="mt-1 truncate text-xs text-zinc-500">{item.vehicle_url}</p><p className="mt-1 text-[11px] font-bold text-zinc-400">{dateTime(item.created_at)} · {statusLabels[item.status] || item.status}</p></div><button type="button" className="premium-button-primary shrink-0 text-xs" onClick={() => startNew(item)}><Plus size={14} /> Cadastrar veículo</button></div></div>)}
              {!pendingSubmissions.length ? <p className="rounded-2xl bg-zinc-50 p-5 text-sm font-bold text-zinc-500">Nenhum link em aberto.</p> : null}
            </QueueCard>

            <QueueCard title="Arquivos XML/CSV" description="Histórico dos arquivos de estoque enviados pelas revendas." icon={<FileSpreadsheet size={21} />} count={openImports.length}>
              {stockImports.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><strong className="block truncate text-sm text-zinc-950">{item.file_name || 'Arquivo de estoque'}</strong><p className="mt-1 text-xs text-zinc-500">{item.store?.store_name || 'Loja não identificada'} · {dateTime(item.created_at)}</p></div><StatusBadge value={item.status} /></div></div>)}
              {!stockImports.length ? <p className="rounded-2xl bg-zinc-50 p-5 text-sm font-bold text-zinc-500">Nenhum arquivo enviado.</p> : null}
            </QueueCard>
          </section>
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
          <form onSubmit={save} className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Catálogo permanente</p><h2 className="mt-2 text-3xl font-black text-zinc-950">{form.id ? 'Editar veículo' : 'Cadastrar veículo'}</h2><p className="mt-2 text-sm font-semibold text-zinc-500">Nenhum campo desta tela altera campanhas ou landings de eventos.</p></div>
              <button type="button" onClick={() => setFormOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600"><X size={20} /></button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_390px]">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Loja proprietária *<select className="premium-input mt-2" value={form.store_id} onChange={(event) => setForm({ ...form, store_id: event.target.value })} required><option value="">Selecione a loja</option>{activeStores.map((store) => <option key={store.id} value={store.id}>{store.store_name}{store.portal_enabled ? '' : ' — oculta no portal'}</option>)}</select></label>
                <Field label="Marca *" value={form.brand} onChange={(value) => setForm({ ...form, brand: value })} required />
                <Field label="Modelo *" value={form.model} onChange={(value) => setForm({ ...form, model: value })} required />
                <Field label="Versão" value={form.version} onChange={(value) => setForm({ ...form, version: value })} />
                <Field label="Ano" value={form.year} onChange={(value) => setForm({ ...form, year: value })} />
                <Field label="Quilometragem" value={form.mileage} onChange={(value) => setForm({ ...form, mileage: value })} />
                <Field label="Cor" value={form.color} onChange={(value) => setForm({ ...form, color: value })} />
                <Field label="Câmbio" value={form.transmission} onChange={(value) => setForm({ ...form, transmission: value })} />
                <Field label="Combustível" value={form.fuel} onChange={(value) => setForm({ ...form, fuel: value })} />
                <Field label="Preço" value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" required />
                <label className="text-xs font-black uppercase text-zinc-500">Status<select className="premium-input mt-2" value={form.status} disabled={form.status === 'vendido'} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="disponivel">Disponível</option><option value="oculto">Oculto</option>{form.status === 'vendido' ? <option value="vendido">Vendido</option> : null}</select></label>
                <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Link de origem<input className="premium-input mt-2" value={form.source_url || ''} onChange={(event) => setForm({ ...form, source_url: event.target.value })} placeholder="https://..." /></label>
                <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={form.show_on_landing === true} disabled={form.status !== 'disponivel'} onChange={(event) => setForm({ ...form, show_on_landing: event.target.checked })} /> Publicar no Portal Oficial</label>
                <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={form.is_featured === true} disabled={form.status !== 'disponivel'} onChange={(event) => setForm({ ...form, is_featured: event.target.checked })} /> Destacar no Marketplace</label>
              </div>

              <aside className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Fotos do veículo</p><p className="mt-1 text-xs font-semibold text-zinc-500">A primeira foto marcada será a capa.</p></div><label className="premium-button-secondary cursor-pointer text-xs"><Upload size={15} /> {uploading ? 'Enviando...' : 'Adicionar fotos'}<input className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadImages(event.target.files)} /></label></div>
                <div className="mt-4 grid grid-cols-2 gap-3">{(form.image_urls || []).map((url: string) => <div key={url} className={`relative overflow-hidden rounded-2xl border-2 bg-white ${form.image_url === url ? 'border-red-500' : 'border-transparent'}`}><button type="button" onClick={() => setCover(url)} className="block aspect-[4/3] w-full"><img src={url} alt="Foto do veículo" className="h-full w-full object-cover" /></button><button type="button" onClick={() => removeImage(url)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"><X size={14} /></button>{form.image_url === url ? <span className="absolute bottom-2 left-2 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">CAPA</span> : null}</div>)}</div>
                {!form.image_urls?.length ? <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-zinc-400"><ImagePlus size={38} /><p className="mt-3 text-sm font-bold">Nenhuma foto enviada</p></div> : null}
              </aside>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:justify-end">
              <button type="button" className="premium-button-secondary justify-center" onClick={() => setFormOpen(false)}>Cancelar</button>
              <button type="submit" className="premium-button-primary justify-center" disabled={saving}><Save size={17} /> {saving ? 'Salvando...' : 'Salvar no catálogo'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <article className="premium-card p-5"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">{icon}</span><p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-zinc-400">{label}</p><strong className="mt-2 block text-3xl font-black text-zinc-950">{value.toLocaleString('pt-BR')}</strong></article>;
}

function QueueCard({ title, description, icon, count, children }: { title: string; description: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return <section className="premium-card p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">{icon}</span><div><h2 className="text-xl font-black text-zinc-950">{title}</h2><p className="mt-1 text-sm font-semibold text-zinc-500">{description}</p></div></div><span className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">{count}</span></div><div className="mt-5 space-y-3">{children}</div></section>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="text-xs font-black uppercase text-zinc-500">{label}<input className="premium-input mt-2" type={type} min={type === 'number' ? '0' : undefined} value={value || ''} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}
