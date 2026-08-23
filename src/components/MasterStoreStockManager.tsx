'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import InventorySaleModal from '@/components/InventorySaleModal';
import {
  VEHICLE_COLORS,
  VEHICLE_FUELS,
  VEHICLE_TRANSMISSIONS,
  uniqueVehicleImages
} from '@/lib/vehicleCatalogOptions';
import { combineVehicleYears, normalizeVehicleYears } from '@/lib/vehicleYears';

type CatalogOption = { id: string; name: string };
type CatalogConfiguration = {
  id: string;
  manufacture_year: number | null;
  model_year: number | null;
  fuel_id: string | null;
  transmission_id: string | null;
  engine_name: string | null;
  engine_displacement: number | string | null;
};

type MissingField = { key: string; label: string };
type MessageTone = 'info' | 'success' | 'error';

const requiredFields = [
  ['source_url', 'Link original'],
  ['brand', 'Marca'],
  ['model', 'Modelo'],
  ['version', 'Versão'],
  ['manufacture_year', 'Ano de fabricação'],
  ['model_year', 'Ano do modelo'],
  ['mileage', 'KM'],
  ['fuel', 'Combustível'],
  ['transmission', 'Câmbio'],
  ['color', 'Cor'],
  ['price', 'Valor']
] as const;

const emptyEditForm = {
  link_id: '',
  mode: 'draft',
  vehicle_url: '',
  source_url: '',
  title: '',
  description: '',
  brand: '',
  model: '',
  version: '',
  manufacture_year: '',
  model_year: '',
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

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function parsePrice(value: unknown) {
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  return raw.includes(',') ? Number(raw.replace(/\./g, '').replace(',', '.')) || 0 : Number(raw) || 0;
}

function yearDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function exactOption(options: CatalogOption[], value: unknown) {
  const key = fold(value);
  if (!key) return null;
  return options.find((option) => fold(option.name) === key) || null;
}

function vehicleImages(vehicle: any) {
  return uniqueVehicleImages([
    ...(Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : []),
    vehicle?.image_url
  ]);
}

function displayYear(value: any) {
  return combineVehicleYears(value?.manufacture_year, value?.model_year, value?.year);
}

function missingFields(form: any): MissingField[] {
  const normalized = normalizeVehicleYears(form);
  const candidate = { ...form, ...normalized };
  const missing: MissingField[] = requiredFields
    .filter(([key]) => key === 'price' ? !parsePrice(candidate.price) : !cleanText(candidate[key]))
    .map(([key, label]) => ({ key, label }));

  if (!uniqueVehicleImages(candidate.image_urls || []).length) {
    missing.push({ key: 'photos', label: 'Pelo menos 1 foto' });
  }
  return missing;
}

function pendingKey(value: unknown) {
  const normalized = fold(value);
  const entries: Array<[string, string]> = [
    ['link original', 'source_url'],
    ['marca', 'brand'],
    ['modelo', 'model'],
    ['versao', 'version'],
    ['ano de fabricacao', 'manufacture_year'],
    ['ano do modelo', 'model_year'],
    ['km', 'mileage'],
    ['combustivel', 'fuel'],
    ['cambio', 'transmission'],
    ['cor', 'color'],
    ['valor', 'price'],
    ['foto', 'photos']
  ];
  return entries.find(([label]) => normalized.includes(label))?.[1] || '';
}

function itemState(item: any, importingId: string) {
  if (item?.vehicle?.status === 'vendido' || item?.metadata?.publication_status === 'vendido') {
    return ['Vendido', 'bg-emerald-100 text-emerald-800'];
  }
  if (importingId === item.id || item?.metadata?.publication_status === 'importando_automaticamente') {
    return ['Importando automaticamente', 'bg-blue-50 text-blue-700'];
  }
  if (item.status === 'error' || item?.metadata?.publication_status === 'falha_importacao') {
    return ['Falha na importação', 'bg-red-50 text-red-700'];
  }
  if (item.status === 'published' || item.vehicle) return ['Publicado', 'bg-emerald-50 text-emerald-700'];
  if (item?.metadata?.publication_status === 'pronto_para_conferencia') return ['Pronto para conferência', 'bg-emerald-50 text-emerald-700'];
  if (item?.metadata?.publication_status === 'aguardando_preenchimento') return ['Informações incompletas', 'bg-amber-50 text-amber-700'];
  if (item.status === 'reviewing') return ['Dados importados', 'bg-sky-50 text-sky-700'];
  return ['Aguardando importação', 'bg-zinc-100 text-zinc-600'];
}

export default function MasterStoreStockManager() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('Carregando estoque da loja...');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');
  const [saving, setSaving] = useState(false);
  const [importingId, setImportingId] = useState('');
  const [newVehicleUrl, setNewVehicleUrl] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState<any>(emptyEditForm);
  const [saleVehicleId, setSaleVehicleId] = useState('');

  const [brands, setBrands] = useState<CatalogOption[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [versions, setVersions] = useState<CatalogOption[]>([]);
  const [fuels, setFuels] = useState<CatalogOption[]>([]);
  const [transmissions, setTransmissions] = useState<CatalogOption[]>([]);
  const [configurations, setConfigurations] = useState<CatalogConfiguration[]>([]);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState('');
  const [catalogMessage, setCatalogMessage] = useState('');

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
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      setMessage('');
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

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('vehicle_catalog_brands').select('id,name').eq('is_active', true).order('name'),
      supabase.from('vehicle_catalog_fuels').select('id,name').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('vehicle_catalog_transmissions').select('id,name').eq('is_active', true).order('sort_order').order('name')
    ]).then(([brandResult, fuelResult, transmissionResult]) => {
      if (!active) return;
      if (brandResult.error) {
        setCatalogMessage('A base automotiva não pôde ser carregada. A digitação manual continua disponível.');
        return;
      }
      setBrands((brandResult.data || []) as CatalogOption[]);
      setFuels((fuelResult.data || []) as CatalogOption[]);
      setTransmissions((transmissionResult.data || []) as CatalogOption[]);
      setCatalogMessage('Base automotiva conectada. Você também pode digitar manualmente quando necessário.');
    }).catch(() => {
      if (active) setCatalogMessage('A base automotiva não pôde ser carregada. A digitação manual continua disponível.');
    });
    return () => { active = false; };
  }, [supabase]);

  const selectedBrand = useMemo(() => exactOption(brands, editForm.brand), [brands, editForm.brand]);
  useEffect(() => {
    let active = true;
    setModels([]);
    setVersions([]);
    setConfigurations([]);
    setSelectedConfigurationId('');
    if (!selectedBrand?.id) return () => { active = false; };
    void supabase
      .from('vehicle_catalog_models')
      .select('id,name')
      .eq('brand_id', selectedBrand.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (active) setModels((data || []) as CatalogOption[]); });
    return () => { active = false; };
  }, [selectedBrand?.id, supabase]);

  const selectedModel = useMemo(() => exactOption(models, editForm.model), [models, editForm.model]);
  useEffect(() => {
    let active = true;
    setVersions([]);
    setConfigurations([]);
    setSelectedConfigurationId('');
    if (!selectedModel?.id) return () => { active = false; };
    void supabase
      .from('vehicle_catalog_versions')
      .select('id,name')
      .eq('model_id', selectedModel.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (active) setVersions((data || []) as CatalogOption[]); });
    return () => { active = false; };
  }, [selectedModel?.id, supabase]);

  const selectedVersion = useMemo(() => exactOption(versions, editForm.version), [versions, editForm.version]);
  useEffect(() => {
    let active = true;
    setConfigurations([]);
    setSelectedConfigurationId('');
    if (!selectedVersion?.id) return () => { active = false; };
    void supabase
      .from('vehicle_catalog_configurations')
      .select('id,manufacture_year,model_year,fuel_id,transmission_id,engine_name,engine_displacement')
      .eq('version_id', selectedVersion.id)
      .eq('is_active', true)
      .order('model_year', { ascending: false })
      .order('manufacture_year', { ascending: false })
      .limit(150)
      .then(({ data }) => { if (active) setConfigurations((data || []) as CatalogConfiguration[]); });
    return () => { active = false; };
  }, [selectedVersion?.id, supabase]);

  const stats = useMemo(() => ({
    total: items.length,
    published: items.filter((item) => item?.vehicle?.status === 'disponivel' && item?.vehicle?.show_on_landing === true).length,
    ready: items.filter((item) => ['pronto_para_conferencia', 'aguardando_preenchimento'].includes(item?.metadata?.publication_status)).length,
    errors: items.filter((item) => item.status === 'error').length
  }), [items]);

  const currentMissing = useMemo(() => missingFields(editForm), [editForm]);
  const canPublish = currentMissing.length === 0;

  function buildFormFromItem(item: any, imported?: any) {
    const vehicle = item.vehicle;
    const preview = imported || item?.metadata?.imported_preview || item?.metadata?.final_preview || {};
    const source = vehicle || preview;
    const years = normalizeVehicleYears({
      manufacture_year: source?.manufacture_year,
      model_year: source?.model_year,
      year: source?.year
    });
    const images = uniqueVehicleImages(
      vehicle ? vehicleImages(vehicle) : Array.isArray(preview.image_urls) ? preview.image_urls : [preview.image_url]
    );
    return {
      link_id: item.id,
      mode: vehicle ? 'vehicle' : 'draft',
      vehicle_url: item.vehicle_url || '',
      source_url: vehicle?.source_url || preview.source_url || item.vehicle_url || '',
      title: preview.title || [vehicle?.brand, vehicle?.model, vehicle?.version].filter(Boolean).join(' ') || '',
      description: preview.description || item?.metadata?.final_description || item.notes || '',
      brand: vehicle?.brand || preview.brand || '',
      model: vehicle?.model || preview.model || '',
      version: vehicle?.version || preview.version || '',
      ...years,
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

  function startEdit(item: any, imported?: any) {
    setEditingId(item.id);
    setEditForm(buildFormFromItem(item, imported));
    setSelectedConfigurationId('');
  }

  function cancelEdit() {
    setEditingId('');
    setEditForm(emptyEditForm);
    setSelectedConfigurationId('');
  }

  function focusField(key: string) {
    const element = document.getElementById(`master-stock-field-${key}`) as HTMLElement | null;
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => element.focus(), 250);
  }

  function openPending(item: any, label: string) {
    const key = pendingKey(label);
    startEdit(item);
    if (key) window.setTimeout(() => focusField(key), 120);
  }

  function applyConfiguration(configurationId: string) {
    setSelectedConfigurationId(configurationId);
    const configuration = configurations.find((item) => item.id === configurationId);
    if (!configuration) return;
    const fuel = fuels.find((item) => item.id === configuration.fuel_id)?.name || '';
    const transmission = transmissions.find((item) => item.id === configuration.transmission_id)?.name || '';
    setEditForm((current: any) => ({
      ...current,
      manufacture_year: configuration.manufacture_year ? String(configuration.manufacture_year) : current.manufacture_year,
      model_year: configuration.model_year ? String(configuration.model_year) : current.model_year,
      fuel: fuel || current.fuel,
      transmission: transmission || current.transmission
    }));
  }

  function configurationLabel(configuration: CatalogConfiguration) {
    const years = combineVehicleYears(configuration.manufacture_year, configuration.model_year);
    const fuel = fuels.find((item) => item.id === configuration.fuel_id)?.name;
    const transmission = transmissions.find((item) => item.id === configuration.transmission_id)?.name;
    const engine = configuration.engine_name || (configuration.engine_displacement ? `${configuration.engine_displacement}L` : '');
    return [years, engine, fuel, transmission].filter(Boolean).join(' • ');
  }

  async function addVehicleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cleanText(newVehicleUrl)) return;
    setSaving(true);
    setMessageTone('info');
    setMessage('Adicionando e importando anúncio...');
    const url = newVehicleUrl;
    try {
      const created = await apiRequest({ action: 'add-link', vehicle_url: url });
      setNewVehicleUrl('');
      if (created?.link_id && created?.auto_import) {
        try {
          const imported = await apiRequest({ action: 'import-data', link_id: created.link_id, vehicle_url: url });
          const refreshed = await loadData();
          const item = refreshed?.items?.find((entry: any) => entry.id === created.link_id);
          if (item) startEdit(item, imported?.imported);
          setMessageTone('success');
          setMessage('Importação concluída. Confira os dados antes de publicar.');
        } catch (error: any) {
          await loadData();
          setMessageTone('error');
          setMessage(error?.message || 'O link foi adicionado, mas a importação precisa ser refeita.');
        }
      } else {
        await loadData();
      }
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível adicionar o link.');
    } finally {
      setSaving(false);
    }
  }

  async function importItem(item: any) {
    setImportingId(item.id);
    setMessageTone('info');
    setMessage('Reimportando fotos e dados com revisão por IA...');
    try {
      const result = await apiRequest({
        action: item.status === 'error' ? 'retry-import' : 'import-data',
        link_id: item.id,
        vehicle_url: item.vehicle_url
      });
      const refreshed = await loadData();
      const refreshedItem = refreshed?.items?.find((entry: any) => entry.id === item.id) || item;
      startEdit(refreshedItem, result?.imported);
      setMessageTone(result?.ai?.applied ? 'success' : 'info');
      setMessage(result?.ai?.applied ? 'Importação concluída e revisada por IA.' : 'Importação concluída. Confira os dados antes de publicar.');
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível reimportar o anúncio.');
    } finally {
      setImportingId('');
    }
  }

  async function saveManualDraft() {
    setSaving(true);
    try {
      await apiRequest({
        action: 'save-draft',
        ...editForm,
        image_urls: uniqueVehicleImages(editForm.image_urls || [])
      });
      setMessageTone('success');
      setMessage('Rascunho salvo.');
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
    try {
      await apiRequest({
        action: editForm.mode === 'vehicle' ? 'update-vehicle' : 'publish-vehicle',
        ...editForm,
        image_urls: uniqueVehicleImages(editForm.image_urls || [])
      });
      setMessageTone('success');
      setMessage(editForm.mode === 'vehicle' ? 'Veículo atualizado com sucesso.' : 'Veículo publicado com sucesso.');
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
    if (!window.confirm(item.vehicle ? 'Deseja retirar este veículo do portal?' : 'Deseja excluir este link?')) return;
    setSaving(true);
    try {
      await apiRequest({ action: 'delete-item', link_id: item.id });
      if (editingId === item.id) cancelEdit();
      await loadData();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível retirar o veículo.');
    } finally {
      setSaving(false);
    }
  }

  if (message && !store) {
    return <div className="flex min-h-[55vh] items-center justify-center p-6 text-white">{message}</div>;
  }

  const messageClass = messageTone === 'error'
    ? 'border-red-100 bg-red-50 text-red-700'
    : messageTone === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-blue-100 bg-blue-50 text-blue-700';

  return (
    <div className="min-w-0 bg-[#f4f5f9] px-4 py-5 text-zinc-950 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1500px]">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-red-600">Estoque administrado pelo Master</p>
          <h2 className="mt-1 text-3xl font-black">Estoque da loja {store?.store_name ? `— ${store.store_name}` : ''}</h2>
          <p className="mt-2 text-sm text-zinc-500">Importe o anúncio, confira os campos e publique somente depois da validação.</p>
        </div>

        {message ? <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${messageClass}`}>{message}</div> : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Total</p><strong className="mt-3 block text-4xl">{stats.total}</strong></div>
          <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Para conferência</p><strong className="mt-3 block text-4xl text-blue-600">{stats.ready}</strong></div>
          <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Publicados</p><strong className="mt-3 block text-4xl text-emerald-600">{stats.published}</strong></div>
          <div className="premium-card p-5"><p className="text-sm font-bold text-zinc-500">Falhas</p><strong className="mt-3 block text-4xl text-red-600">{stats.errors}</strong></div>
        </section>

        <section className="premium-card mt-6 p-5">
          <form onSubmit={addVehicleLink} className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <input className="premium-input min-w-0" placeholder="https://site-da-loja.com.br/veiculo..." value={newVehicleUrl} onChange={(event) => setNewVehicleUrl(event.target.value)} />
            <button className="premium-button-primary justify-center" disabled={saving}><Plus size={18} />Adicionar e importar</button>
          </form>
        </section>

        <section className="mt-6 grid min-w-0 gap-4">
          {items.map((item) => {
            const vehicle = item.vehicle;
            const preview = item?.metadata?.imported_preview || item?.metadata?.final_preview;
            const source = vehicle || preview;
            const image = vehicleImages(vehicle)[0] || uniqueVehicleImages(preview?.image_urls || [preview?.image_url])[0];
            const isEditing = editingId === item.id;
            const sourceUrl = vehicle?.source_url || preview?.source_url || item.vehicle_url;
            const itemMissing: string[] = Array.isArray(item?.metadata?.missing_fields) ? item.metadata.missing_fields : [];
            const [stateLabel, stateClass] = itemState(item, importingId);
            const aiReview = item?.metadata?.ai_review;
            const yearLabel = displayYear(source);
            const sold = vehicle?.status === 'vendido' || item?.metadata?.publication_status === 'vendido';

            return (
              <article key={item.id} className="premium-card min-w-0 overflow-hidden p-5">
                <div className="grid min-w-0 gap-5 xl:grid-cols-[180px_minmax(0,1fr)_220px] xl:items-start">
                  <div className="grid gap-2">
                    <div className="overflow-hidden rounded-3xl bg-zinc-100">
                      {image ? <img src={image} alt="Veículo" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-zinc-400">Sem foto</div>}
                    </div>
                    {vehicle && !sold ? (
                      <button type="button" onClick={() => setSaleVehicleId(vehicle.id)} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"><CheckCircle2 size={17} />VENDIDO</button>
                    ) : sold ? (
                      <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"><CheckCircle2 size={17} />VENDIDO</div>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${stateClass}`}>{stateLabel}</span>
                      {aiReview?.applied ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700"><Bot className="mr-1 inline" size={13} />Revisado por IA</span> : null}
                    </div>
                    <h3 className="mt-3 break-words text-2xl font-black">{vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : preview?.brand || preview?.model ? `${preview.brand || ''} ${preview.model || ''}`.trim() : preview?.title || 'Link recebido'}</h3>
                    {vehicle || preview ? <><p className="mt-1 text-sm font-bold text-zinc-500">{[vehicle?.version || preview?.version, yearLabel].filter(Boolean).join(' • ')}</p><strong className="mt-3 block text-2xl text-red-600">{money(vehicle?.price || preview?.price)}</strong></> : null}

                    {itemMissing.length ? (
                      <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                        <p className="text-xs font-black text-amber-800">Falta conferir:</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {itemMissing.map((label) => (
                            <button key={label} type="button" onClick={() => openPending(item, label)} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-800 hover:border-amber-400">{label}</button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-4 block max-w-full break-all text-xs font-black text-red-600"><ExternalLink className="mr-1 inline" size={14} />{sourceUrl}</a> : null}
                  </div>

                  <div className="grid gap-2">
                    {!sold ? <button className="premium-button-secondary justify-center text-xs" onClick={() => void importItem(item)} disabled={Boolean(importingId) || saving}>{importingId === item.id ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}Reimportar dados</button> : null}
                    {!sold ? <button className="premium-button-secondary justify-center text-xs" onClick={() => startEdit(item)}>Conferir e editar</button> : null}
                    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="premium-button-secondary justify-center text-xs"><ExternalLink size={15} />Abrir anúncio</a> : null}
                    {!sold ? <button className="premium-button-secondary justify-center border-red-200 text-xs text-red-600" onClick={() => void deleteItem(item)}><Trash2 size={15} />Excluir</button> : null}
                  </div>
                </div>

                {isEditing && !sold ? (
                  <form onSubmit={publishVehicle} className="mt-5 min-w-0 overflow-hidden rounded-[28px] border border-red-100 bg-red-50/40 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase text-red-600">Conferência obrigatória</p>
                        <h4 className="mt-1 text-xl font-black">Revise, salve e só depois publique</h4>
                      </div>
                      <button className="premium-button-secondary justify-center text-xs" type="button" onClick={cancelEdit}><X size={15} />Cancelar</button>
                    </div>

                    {currentMissing.length ? (
                      <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                        <p className="text-sm font-black text-yellow-900">Campos pendentes — clique para ir direto ao campo:</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {currentMissing.map((field) => <button key={field.key} type="button" onClick={() => focusField(field.key)} className="rounded-full border border-yellow-300 bg-white px-3 py-1.5 text-xs font-black text-yellow-900">{field.label}</button>)}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid min-w-0 gap-3">
                      <label className="grid min-w-0 gap-2">
                        <span className="text-xs font-black uppercase text-zinc-500">Link do anúncio</span>
                        <input id="master-stock-field-source_url" className="premium-input min-w-0 bg-white" value={editForm.source_url || editForm.vehicle_url} onChange={(event) => setEditForm({ ...editForm, source_url: event.target.value, vehicle_url: event.target.value })} />
                      </label>

                      <input className="premium-input min-w-0 bg-white" placeholder="Título" value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} />

                      <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div><p className="flex items-center gap-2 text-sm font-black text-blue-900"><Database size={16} />Base automotiva</p><p className="mt-1 text-xs font-bold text-blue-700">Marca → modelo → versão → configuração. A entrada manual continua liberada.</p></div>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-blue-700">{brands.length ? `${brands.length} marcas disponíveis` : 'Carregando base...'}</span>
                        </div>
                        {catalogMessage ? <p className="mt-3 text-xs font-bold text-blue-800">{catalogMessage}</p> : null}

                        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
                          <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Marca *</span><input id="master-stock-field-brand" list="master-stock-brands" className="premium-input min-w-0 bg-white" value={editForm.brand} onChange={(event) => setEditForm({ ...editForm, brand: event.target.value })} placeholder="Digite ou escolha a marca" /><datalist id="master-stock-brands">{brands.map((option) => <option key={option.id} value={option.name} />)}</datalist></label>
                          <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Modelo *</span><input id="master-stock-field-model" list="master-stock-models" className="premium-input min-w-0 bg-white" value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} placeholder="Digite ou escolha o modelo" /><datalist id="master-stock-models">{models.map((option) => <option key={option.id} value={option.name} />)}</datalist></label>
                          <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Versão *</span><input id="master-stock-field-version" list="master-stock-versions" className="premium-input min-w-0 bg-white" value={editForm.version} onChange={(event) => setEditForm({ ...editForm, version: event.target.value })} placeholder="Digite ou escolha a versão" /><datalist id="master-stock-versions">{versions.map((option) => <option key={option.id} value={option.name} />)}</datalist></label>
                        </div>

                        {selectedVersion && configurations.length ? (
                          <label className="mt-3 grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Configuração da base (opcional)</span><select className="premium-input min-w-0 bg-white" value={selectedConfigurationId} onChange={(event) => applyConfiguration(event.target.value)}><option value="">Escolha ano/configuração para preencher automaticamente</option>{configurations.map((configuration) => <option key={configuration.id} value={configuration.id}>{configurationLabel(configuration)}</option>)}</select></label>
                        ) : selectedVersion ? <p className="mt-3 text-xs font-bold text-zinc-500">Versão reconhecida, mas sem configuração específica cadastrada. Continue preenchendo manualmente.</p> : null}
                      </div>

                      <div className="grid min-w-0 gap-3 md:grid-cols-2">
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Ano de fabricação *</span><input id="master-stock-field-manufacture_year" className="premium-input min-w-0 bg-white" inputMode="numeric" maxLength={4} placeholder="Ex.: 2021" value={editForm.manufacture_year} onChange={(event) => setEditForm({ ...editForm, manufacture_year: yearDigits(event.target.value) })} /></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Ano do modelo *</span><input id="master-stock-field-model_year" className="premium-input min-w-0 bg-white" inputMode="numeric" maxLength={4} placeholder="Ex.: 2022" value={editForm.model_year} onChange={(event) => setEditForm({ ...editForm, model_year: yearDigits(event.target.value) })} /></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">KM *</span><input id="master-stock-field-mileage" className="premium-input min-w-0 bg-white" placeholder="Ex.: 82.000 km" value={editForm.mileage} onChange={(event) => setEditForm({ ...editForm, mileage: event.target.value })} /></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Valor *</span><input id="master-stock-field-price" className="premium-input min-w-0 bg-white" placeholder="Ex.: 116.900" value={editForm.price} onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} /></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Cor *</span><select id="master-stock-field-color" className="premium-input min-w-0 bg-white" value={editForm.color} onChange={(event) => setEditForm({ ...editForm, color: event.target.value })}><option value="">Selecione a cor</option>{VEHICLE_COLORS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Câmbio *</span><select id="master-stock-field-transmission" className="premium-input min-w-0 bg-white" value={editForm.transmission} onChange={(event) => setEditForm({ ...editForm, transmission: event.target.value })}><option value="">Selecione o câmbio</option>{VEHICLE_TRANSMISSIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label className="grid gap-1"><span className="text-[11px] font-black uppercase text-zinc-500">Combustível *</span><select id="master-stock-field-fuel" className="premium-input min-w-0 bg-white" value={editForm.fuel} onChange={(event) => setEditForm({ ...editForm, fuel: event.target.value })}><option value="">Selecione o combustível</option>{VEHICLE_FUELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                      </div>

                      <p className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-500">Exibição pública: <strong className="text-zinc-900">{displayYear(editForm) || 'aguardando os anos completos'}</strong></p>

                      <label className="grid min-w-0 gap-2"><span className="text-xs font-black uppercase text-zinc-500">Descrição do anúncio</span><textarea className="premium-input min-h-36 min-w-0 resize-y bg-white" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>

                      {editForm.ai_review?.warnings?.length || editForm.ai_review?.conflicts?.length ? (
                        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-800"><p className="font-black"><Bot className="mr-2 inline" size={16} />Auditoria da IA</p>{editForm.ai_review.conflicts?.map((conflict: any, index: number) => <p key={`conflict-${index}`} className="mt-2 font-bold">Conferir {conflict.field}: {conflict.message}</p>)}{editForm.ai_review.warnings?.map((warning: string, index: number) => <p key={`warning-${index}`} className="mt-2 font-bold">{warning}</p>)}</div>
                      ) : null}

                      <div id="master-stock-field-photos" tabIndex={-1} className="min-w-0 overflow-hidden rounded-[24px] bg-white p-4 outline-none focus:ring-2 focus:ring-red-300">
                        <div className="flex justify-between gap-3"><div><p className="text-sm font-black">Fotos importadas *</p><p className="text-xs text-zinc-500">Você pode remover imagens incorretas antes de publicar.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black">{uniqueVehicleImages(editForm.image_urls || []).length} foto(s)</span></div>
                        <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2">{uniqueVehicleImages(editForm.image_urls || []).map((url, index) => <div key={url} className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl border bg-zinc-100"><img src={url} alt="Foto do veículo" className="h-full w-full object-cover" /><button type="button" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600" onClick={() => { const next = uniqueVehicleImages(editForm.image_urls || []).filter((_, imageIndex) => imageIndex !== index); setEditForm({ ...editForm, image_urls: next, image_url: next[0] || '' }); }}><X size={14} /></button>{index === 0 ? <span className="absolute bottom-1 left-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">Capa</span> : null}</div>)}</div>
                      </div>

                      {currentMissing.length ? <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-black text-yellow-800">Para publicar, complete os campos destacados acima.</div> : <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700"><CheckCircle2 className="mr-2 inline" size={16} />Tudo preenchido e pronto para publicação.</div>}

                      <div className="grid gap-3 md:grid-cols-2"><button className="premium-button-secondary justify-center py-4" type="button" disabled={saving} onClick={() => void saveManualDraft()}><Save size={17} />Salvar rascunho</button><button className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-white ${canPublish ? 'bg-red-600' : 'cursor-not-allowed bg-zinc-300'}`} type="submit" disabled={saving || !canPublish}><CheckCircle2 size={17} />{editForm.mode === 'vehicle' ? 'Salvar alterações' : 'Publicar após conferência'}</button></div>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>

      {saleVehicleId ? <InventorySaleModal slug={slug} vehicleId={saleVehicleId} onClose={() => setSaleVehicleId('')} onCompleted={async () => { await loadData(); setMessageTone('success'); setMessage('Venda registrada. O veículo foi retirado do portal.'); }} /> : null}
    </div>
  );
}
