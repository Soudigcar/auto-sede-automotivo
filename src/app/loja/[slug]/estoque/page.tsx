'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Car,
  CheckCircle2,
  ClipboardList,
  Edit3,
  ExternalLink,
  Loader2,
  LogOut,
  Package,
  Plus,
  RotateCcw,
  Save,
  Store,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

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
  return Array.from(new Set([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ].filter(Boolean)));
}

function isOlxItem(item: any) {
  const source = cleanText(item?.metadata?.source || item?.metadata?.provider).toLowerCase();
  if (source.includes('olx')) return true;
  try {
    const hostname = new URL(item?.vehicle_url || '').hostname.toLowerCase();
    return hostname === 'olx.com.br' || hostname.endsWith('.olx.com.br');
  } catch {
    return false;
  }
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

function itemState(item: any, importingId: string) {
  if (importingId === item.id || item?.metadata?.publication_status === 'importando_automaticamente') {
    return { label: 'Importando automaticamente', className: 'bg-blue-50 text-blue-700' };
  }
  if (item.status === 'error' || item?.metadata?.publication_status === 'falha_importacao') {
    return { label: 'Falha na importação', className: 'bg-red-50 text-red-700' };
  }
  if (item.status === 'published' || item.vehicle) {
    return { label: 'Publicado', className: 'bg-emerald-50 text-emerald-700' };
  }
  if (item?.metadata?.publication_status === 'pronto_para_conferencia') {
    return { label: 'Pronto para conferência', className: 'bg-emerald-50 text-emerald-700' };
  }
  if (item?.metadata?.publication_status === 'aguardando_preenchimento') {
    return { label: 'Informações incompletas', className: 'bg-amber-50 text-amber-700' };
  }
  if (item.status === 'reviewing') {
    return { label: 'Dados importados', className: 'bg-sky-50 text-sky-700' };
  }
  return { label: 'Aguardando importação', className: 'bg-zinc-100 text-zinc-600' };
}

const emptyEditForm = {
  link_id: '',
  mode: 'link',
  vehicle_url: '',
  source_url: '',
  title: '',
  description: '',
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
  is_featured: false,
  ai_review: null as any
};

type MessageTone = 'info' | 'success' | 'error';

export default function StoreStockPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const queueRunningRef = useRef(false);
  const [store, setStore] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('Carregando estoque da loja...');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');
  const [saving, setSaving] = useState(false);
  const [importingId, setImportingId] = useState('');
  const [newVehicleUrl, setNewVehicleUrl] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState<any>(emptyEditForm);
  const [queueProgress, setQueueProgress] = useState({ active: false, total: 0, completed: 0, failed: 0 });

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

    const response = payload
      ? await fetch('/api/store-stock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ ...payload, slug })
        })
      : await fetch(`/api/store-stock?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }

  async function loadData() {
    try {
      const result = await apiRequest();
      if (!result) return null;
      setStore(result.store);
      setItems(result.items || []);
      if (!queueRunningRef.current) setMessage('');
      return result;
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Erro ao carregar estoque.');
      return null;
    }
  }

  useEffect(() => {
    void loadData();
  }, [slug]);

  const pendingAutomaticItems = useMemo(
    () => items.filter((item) => item.auto_import_eligible === true && !isOlxItem(item)),
    [items]
  );
  const pendingSignature = pendingAutomaticItems.map((item) => item.id).join('|');

  useEffect(() => {
    if (!store || !pendingAutomaticItems.length || queueRunningRef.current) return;

    queueRunningRef.current = true;
    const queue = [...pendingAutomaticItems];

    void (async () => {
      let failed = 0;
      setQueueProgress({ active: true, total: queue.length, completed: 0, failed: 0 });
      setMessageTone('info');

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        setImportingId(item.id);
        setMessage(`Importando automaticamente ${index + 1} de ${queue.length}: ${item.vehicle_url}`);

        try {
          await apiRequest({
            action: 'import-data',
            link_id: item.id,
            vehicle_url: item.vehicle_url,
            automatic: true
          });
        } catch {
          failed += 1;
        }

        setQueueProgress({
          active: true,
          total: queue.length,
          completed: index + 1,
          failed
        });
      }

      setImportingId('');
      await loadData();
      setQueueProgress({ active: false, total: queue.length, completed: queue.length, failed });
      setMessageTone(failed ? 'info' : 'success');
      setMessage(
        failed
          ? `Importação automática concluída: ${queue.length - failed} pronto(s) para conferência e ${failed} com falha. Use “Tentar novamente” nos itens com erro.`
          : `Importação automática concluída. ${queue.length} veículo(s) aguardam sua conferência antes da publicação.`
      );
      queueRunningRef.current = false;
    })();
  }, [store?.id, pendingSignature]);

  const stats = useMemo(() => {
    const published = items.filter((item) => item.status === 'published' || item.vehicle).length;
    const ready = items.filter((item) => ['pronto_para_conferencia', 'aguardando_preenchimento'].includes(item?.metadata?.publication_status)).length;
    const errors = items.filter((item) => item.status === 'error').length;
    return { total: items.length, published, ready, errors };
  }, [items]);

  const currentMissing = useMemo(() => missingFields(editForm), [editForm]);
  const canPublish = editForm.mode !== 'link' && currentMissing.length === 0;

  async function addVehicleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessageTone('info');
    setMessage('Adicionando link e preparando a importação automática...');

    try {
      await apiRequest({ action: 'add-link', vehicle_url: newVehicleUrl });
      setNewVehicleUrl('');
      setMessage('Link adicionado. A importação automática será iniciada em seguida.');
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível adicionar o link.');
    } finally {
      setSaving(false);
    }
  }

  function buildFormFromItem(item: any, imported?: any) {
    const vehicle = item.vehicle;
    const preview = imported || item?.metadata?.imported_preview || item?.metadata?.final_preview || {};
    const images = vehicle ? vehicleImages(vehicle) : Array.isArray(preview.image_urls) ? preview.image_urls : [];
    const hasDraft = Boolean(vehicle || Object.keys(preview).length);

    return {
      link_id: item.id,
      mode: vehicle ? 'vehicle' : hasDraft ? 'draft' : 'link',
      vehicle_url: item.vehicle_url || '',
      source_url: vehicle?.source_url || preview.source_url || item.vehicle_url || '',
      title: preview.title || [vehicle?.brand, vehicle?.model, vehicle?.version].filter(Boolean).join(' ') || '',
      description: preview.description || item?.metadata?.final_description || item.notes || '',
      brand: vehicle?.brand || preview.brand || '',
      model: vehicle?.model || preview.model || '',
      version: vehicle?.version || preview.version || '',
      year: vehicle?.year || preview.year || '',
      mileage: vehicle?.mileage || preview.mileage || '',
      color: vehicle?.color || preview.color || '',
      transmission: vehicle?.transmission || preview.transmission || '',
      fuel: vehicle?.fuel || preview.fuel || '',
      price: String(vehicle?.price || preview.price || ''),
      status: vehicle?.status || preview.status || 'disponivel',
      show_on_landing: vehicle ? Boolean(vehicle.show_on_landing) : preview.show_on_landing !== false,
      image_url: images[0] || '',
      image_urls: images,
      is_featured: Boolean(vehicle?.is_featured || preview.is_featured),
      ai_review: item?.metadata?.ai_review || null
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
    setMessageTone('info');
    setMessage(item.status === 'error' ? 'Tentando importar novamente...' : 'Importando novamente fotos e dados...');

    try {
      const result = await apiRequest({
        action: item.status === 'error' ? 'retry-import' : 'import-data',
        link_id: item.id,
        vehicle_url: item.vehicle_url
      });
      if (!result) return;

      setEditingId(item.id);
      setEditForm(buildFormFromItem(item, result.imported));
      setMessageTone(result.missing?.length ? 'info' : 'success');
      setMessage(
        result.missing?.length
          ? `Importação concluída. Confira e complete: ${result.missing.join(', ')}.`
          : 'Importação concluída. Confira os dados antes de publicar.'
      );
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível importar fotos e dados.');
      await loadData();
    } finally {
      setImportingId('');
    }
  }

  async function saveManualDraft() {
    setSaving(true);
    setMessageTone('info');
    setMessage(editForm.mode === 'link' ? 'Salvando o link para reimportação...' : 'Salvando rascunho...');

    try {
      if (editForm.mode === 'link') {
        await apiRequest({
          action: 'update-link',
          link_id: editForm.link_id,
          vehicle_url: editForm.source_url || editForm.vehicle_url
        });
        setMessage('Link salvo. A importação automática será iniciada novamente.');
        cancelEdit();
        await loadData();
        return;
      }

      const result = await apiRequest({ action: 'save-draft', ...editForm });
      setMessageTone('success');
      setMessage(
        result.missing?.length
          ? `Rascunho salvo. Ainda falta preencher: ${result.missing.join(', ')}.`
          : 'Rascunho salvo e pronto para conferência final.'
      );
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  }

  async function publishVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublish) return;

    setSaving(true);
    setMessageTone('info');
    setMessage('Publicando o veículo após sua conferência...');

    try {
      await apiRequest({ action: 'publish-vehicle', ...editForm });
      setMessageTone('success');
      setMessage('Veículo publicado com sucesso após conferência da loja.');
      cancelEdit();
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível publicar o veículo.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: any) {
    const confirmed = window.confirm(
      item.vehicle
        ? 'Deseja retirar este veículo do portal? Ele ficará oculto.'
        : 'Deseja excluir este link e o rascunho relacionado?'
    );
    if (!confirmed) return;

    setSaving(true);
    setMessageTone('info');
    setMessage('Removendo item do estoque...');

    try {
      await apiRequest({ action: 'delete-item', link_id: item.id });
      setMessageTone('success');
      setMessage('Item removido do estoque da loja.');
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível excluir.');
    } finally {
      setSaving(false);
    }
  }

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  const messageClass = messageTone === 'error'
    ? 'border-red-100 bg-red-50 text-red-700'
    : messageTone === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-blue-100 bg-blue-50 text-blue-700';

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
              <p className="premium-eyebrow">Loja participante</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Estoque da Loja</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Links de sites são importados automaticamente como rascunho. Nenhum veículo é publicado sem a conferência da loja.
              </p>
            </div>
            <Link href={`/loja/${slug}/pipeline`} className="premium-button-secondary"><BarChart3 size={18} /> Ver pipeline</Link>
          </header>

          {message ? <div className={`mt-5 rounded-2xl border p-4 text-sm font-black ${messageClass}`}>{message}</div> : null}

          {queueProgress.active ? (
            <section className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-5 text-blue-800">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin" size={22} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">Importação automática em andamento</p>
                  <p className="mt-1 text-sm font-bold">{queueProgress.completed} de {queueProgress.total} processado(s). Falhas: {queueProgress.failed}.</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                    <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${queueProgress.total ? (queueProgress.completed / queueProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Total no estoque</p><strong className="mt-3 block text-4xl font-black text-zinc-950">{stats.total}</strong></div>
            <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Prontos para conferência</p><strong className="mt-3 block text-4xl font-black text-blue-600">{stats.ready}</strong></div>
            <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Publicados no portal</p><strong className="mt-3 block text-4xl font-black text-emerald-600">{stats.published}</strong></div>
            <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Falhas de importação</p><strong className="mt-3 block text-4xl font-black text-red-600">{stats.errors}</strong></div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Plus size={22} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black text-zinc-950">Adicionar veículo por site</h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">Cole um link público do site da loja. Os dados e as fotos serão importados automaticamente como rascunho.</p>
                <form onSubmit={addVehicleLink} className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <input className="premium-input" placeholder="https://site-da-loja.com.br/veiculo..." value={newVehicleUrl} onChange={(event) => setNewVehicleUrl(event.target.value)} />
                  <button className="premium-button-primary justify-center" type="submit" disabled={saving || queueProgress.active}><Plus size={18} /> Adicionar e importar</button>
                </form>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4">
            {items.map((item) => {
              const vehicle = item.vehicle;
              const preview = item?.metadata?.imported_preview || item?.metadata?.final_preview;
              const image = vehicleImages(vehicle)[0] || preview?.image_url || preview?.image_urls?.[0];
              const isEditing = editingId === item.id;
              const sourceUrl = vehicle?.source_url || preview?.source_url || item.vehicle_url;
              const itemMissing = item?.metadata?.missing_fields || [];
              const state = itemState(item, importingId);
              const importError = item?.metadata?.import_error;
              const aiReview = item?.metadata?.ai_review;

              return (
                <article key={item.id} className="premium-card p-5">
                  <div className="grid gap-5 xl:grid-cols-[180px_1fr_240px] xl:items-start">
                    <div className="overflow-hidden rounded-3xl bg-zinc-100">
                      {image ? <img src={image} alt={vehicle?.model || preview?.model || 'Veículo'} className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-sm font-black text-zinc-400">Sem foto</div>}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${state.className}`}>{state.label}</span>
                        {aiReview?.applied ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700"><Bot size={13} /> Revisado por IA</span> : null}
                        {isOlxItem(item) ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">OLX pelo navegador</span> : <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">Site da loja</span>}
                      </div>

                      <h2 className="mt-3 break-words text-2xl font-black text-zinc-950">
                        {vehicle
                          ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim()
                          : preview?.brand || preview?.model
                            ? `${preview.brand || ''} ${preview.model || ''}`.trim()
                            : preview?.title || 'Link recebido'}
                      </h2>

                      {vehicle || preview ? (
                        <>
                          <p className="mt-1 break-words text-sm font-bold text-zinc-500">{[vehicle?.version || preview?.version, vehicle?.year || preview?.year].filter(Boolean).join(' • ')}</p>
                          <strong className="mt-3 block text-2xl font-black text-red-600">{money(vehicle?.price || preview?.price)}</strong>
                          <div className="mt-4 grid gap-2 text-xs font-black text-zinc-600 md:grid-cols-2">
                            {(vehicle?.mileage || preview?.mileage) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">KM: {vehicle?.mileage || preview?.mileage}</span> : null}
                            {(vehicle?.fuel || preview?.fuel) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Combustível: {vehicle?.fuel || preview?.fuel}</span> : null}
                            {(vehicle?.transmission || preview?.transmission) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Câmbio: {vehicle?.transmission || preview?.transmission}</span> : null}
                            {(vehicle?.color || preview?.color) ? <span className="rounded-2xl bg-zinc-50 px-3 py-2">Cor: {vehicle?.color || preview?.color}</span> : null}
                          </div>
                        </>
                      ) : <p className="mt-3 break-words rounded-2xl bg-zinc-50 p-4 text-sm font-black text-zinc-700">{item.vehicle_url}</p>}

                      {itemMissing.length ? <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-black text-amber-800">Falta conferir ou preencher: {itemMissing.join(', ')}</div> : null}
                      {importError ? <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-black text-red-700"><AlertTriangle className="mr-2 inline" size={15} />{importError}</div> : null}
                      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex max-w-full items-center gap-2 truncate text-xs font-black text-red-600"><ExternalLink size={14} /> {sourceUrl}</a> : null}
                    </div>

                    <div className="grid gap-2">
                      {!isOlxItem(item) ? (
                        <button className="premium-button-secondary justify-center text-xs" type="button" onClick={() => void importItem(item)} disabled={Boolean(importingId) || saving || queueProgress.active}>
                          {importingId === item.id ? <Loader2 className="animate-spin" size={15} /> : item.status === 'error' ? <RotateCcw size={15} /> : <UploadCloud size={15} />}
                          {importingId === item.id ? 'Importando...' : item.status === 'error' ? 'Tentar novamente' : vehicle || preview ? 'Reimportar dados' : 'Importar agora'}
                        </button>
                      ) : null}
                      <button className="premium-button-secondary justify-center text-xs" type="button" onClick={() => startEdit(item)} disabled={importingId === item.id}><Edit3 size={15} /> Conferir e editar</button>
                      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="premium-button-secondary justify-center text-xs"><ExternalLink size={15} /> Abrir anúncio</a> : null}
                      <button className="premium-button-secondary justify-center border-red-200 text-xs text-red-600" type="button" onClick={() => void deleteItem(item)} disabled={saving || importingId === item.id}><Trash2 size={15} /> Excluir</button>
                    </div>
                  </div>

                  {isEditing ? (
                    <form onSubmit={publishVehicle} className="mt-5 rounded-[28px] border border-red-100 bg-red-50/40 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-red-600">Conferência obrigatória</p>
                          <h3 className="mt-1 text-xl font-black text-zinc-950">Revise, salve o rascunho e só depois publique</h3>
                        </div>
                        <button className="premium-button-secondary justify-center text-xs" type="button" onClick={cancelEdit}><X size={15} /> Cancelar</button>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Link do anúncio</span>
                          <input className="premium-input bg-white" value={editForm.source_url || editForm.vehicle_url} onChange={(event) => setEditForm({ ...editForm, source_url: event.target.value, vehicle_url: event.target.value })} />
                        </label>

                        <input className="premium-input bg-white" placeholder="Título do anúncio" value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} />

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
                            <option value="disponivel">Disponível</option><option value="vendido">Vendido</option><option value="oculto">Oculto</option>
                          </select>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Descrição do anúncio</span>
                          <textarea className="premium-input min-h-36 resize-y bg-white" placeholder="Descrição revisada do veículo" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} />
                        </label>

                        {editForm.ai_review?.warnings?.length || editForm.ai_review?.conflicts?.length ? (
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-800">
                            <p className="flex items-center gap-2 font-black"><Bot size={16} /> Auditoria da IA</p>
                            {editForm.ai_review.conflicts?.map((item: any, index: number) => <p key={`conflict-${index}`} className="mt-2 font-bold">Conferir {item.field}: {item.message}</p>)}
                            {editForm.ai_review.warnings?.map((warning: string, index: number) => <p key={`warning-${index}`} className="mt-2 font-bold">{warning}</p>)}
                          </div>
                        ) : null}

                        <div className="rounded-[24px] bg-white p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div><p className="text-sm font-black text-zinc-950">Fotos importadas *</p><p className="text-xs font-bold text-zinc-500">A primeira imagem será usada como capa.</p></div>
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">{editForm.image_urls?.length || 0} foto(s)</span>
                          </div>

                          {editForm.image_urls?.length ? (
                            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                              {editForm.image_urls.map((imageUrl: string, index: number) => (
                                <div key={`${imageUrl}-${index}`} className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                                  <img src={imageUrl} alt="Foto importada" className="h-full w-full object-cover" />
                                  <button type="button" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600 shadow" onClick={() => {
                                    const nextImages = editForm.image_urls.filter((_: string, imageIndex: number) => imageIndex !== index);
                                    setEditForm({ ...editForm, image_urls: nextImages, image_url: nextImages[0] || '' });
                                  }}><X size={14} /></button>
                                  {index === 0 ? <span className="absolute bottom-1 left-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">Capa</span> : null}
                                </div>
                              ))}
                            </div>
                          ) : <div className="mt-4 rounded-2xl border border-dashed border-red-200 bg-red-50 p-4 text-sm font-black text-red-600">Nenhuma foto encontrada. Reimporte ou adicione as informações antes de publicar.</div>}
                        </div>

                        {editForm.mode !== 'link' ? (
                          currentMissing.length ? <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-black text-yellow-800">Para publicar, falta preencher: {currentMissing.join(', ')}.</div> : <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700"><CheckCircle2 className="mr-2 inline" size={16} />Tudo preenchido. A publicação depende apenas da sua confirmação.</div>
                        ) : <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700">Salve o link corrigido para iniciar uma nova importação automática.</div>}

                        <div className="grid gap-3 md:grid-cols-2">
                          <button className="premium-button-secondary justify-center py-4" type="button" disabled={saving} onClick={() => void saveManualDraft()}><Save size={17} /> {editForm.mode === 'link' ? 'Salvar link e reimportar' : 'Salvar rascunho'}</button>
                          {editForm.mode !== 'link' ? <button className={`justify-center rounded-2xl px-5 py-4 text-sm font-black text-white transition ${canPublish ? 'bg-red-600 shadow-xl shadow-red-600/20 hover:bg-red-700' : 'cursor-not-allowed bg-zinc-300'}`} type="submit" disabled={saving || !canPublish}><UploadCloud size={17} /> {editForm.mode === 'vehicle' ? 'Salvar e manter publicado' : 'Publicar após conferência'}</button> : null}
                        </div>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })}

            {!items.length ? <div className="premium-card p-8 text-center"><Package className="mx-auto text-zinc-300" size={42} /><h2 className="mt-4 text-2xl font-black text-zinc-950">Nenhum veículo no estoque</h2><p className="mt-2 text-sm font-bold text-zinc-500">Adicione um link de site para iniciar a importação automática e revisar antes de publicar.</p></div> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
