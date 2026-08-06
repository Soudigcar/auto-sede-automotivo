'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ImagePlus, Loader2, Save, Send, UploadCloud, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';

export type OlxImportStore = { id: string; name?: string; store_name?: string };
export type OlxImportInitial = { submissionId?: string; storeId?: string; url?: string };
export type OlxBrowserImage = { url: string; data_url?: string; error?: string };
export type OlxBrowserImportPayload = {
  source_url: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: string;
  mileage?: string;
  color?: string;
  transmission?: string;
  fuel?: string;
  price?: number | string;
  image_url?: string;
  image_urls?: string[];
  images?: OlxBrowserImage[];
};

type Props = {
  open: boolean;
  stores: OlxImportStore[];
  initial?: OlxImportInitial | null;
  fixedStoreId?: string;
  browserPayload?: OlxBrowserImportPayload | null;
  onClose: () => void;
  onComplete?: (result: any) => void;
};

const MAX_PHOTOS = 10;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const emptyVehicle = {
  source_url: '', title: '', description: '', brand: '', model: '', version: '', year: '', mileage: '',
  color: '', transmission: '', fuel: '', price: '', image_url: '', image_urls: [] as string[],
  show_on_landing: true, is_featured: false
};

function storeLabel(store: OlxImportStore) {
  return store.name || store.store_name || 'Loja';
}

function moneyInput(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? String(Math.round(number)) : '';
}

function readableError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() && value !== '[object Object]') return value.trim();
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    return readableError(candidate.error || candidate.message || candidate.detail, fallback);
  }
  return fallback;
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler a foto ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function OlxVehicleImportModal({ open, stores, initial, fixedStoreId, browserPayload, onClose, onComplete }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [storeId, setStoreId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [url, setUrl] = useState('');
  const [vehicle, setVehicle] = useState<any>(emptyVehicle);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const sourceUrl = extractCanonicalOlxUrl(browserPayload?.source_url || initial?.url || '');
    const browserImages = browserPayload?.images?.map((item) => item.data_url || item.url).filter(Boolean) || browserPayload?.image_urls || [];
    setStoreId(fixedStoreId || initial?.storeId || stores[0]?.id || '');
    setSubmissionId(initial?.submissionId || '');
    setUrl(sourceUrl || initial?.url || '');
    setVehicle({
      ...emptyVehicle,
      ...(browserPayload || {}),
      source_url: sourceUrl || initial?.url || '',
      price: moneyInput(browserPayload?.price),
      image_url: browserImages[0] || '',
      image_urls: browserImages.slice(0, MAX_PHOTOS)
    });
    setCanPublish(false);
    setMissing([]);
    setMessage(sourceUrl
      ? 'Link público da OLX identificado. Preencha e confira os dados do veículo; o site não será acessado automaticamente.'
      : 'Este cadastro aceita somente links públicos do site da OLX.');
  }, [open, initial?.submissionId, initial?.storeId, initial?.url, fixedStoreId, stores, browserPayload]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function registerManualPreview() {
    const accessToken = await token();
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');
    const sourceUrl = extractCanonicalOlxUrl(url);
    if (!sourceUrl) throw new Error('Este cadastro aceita somente links públicos válidos do site da OLX.');
    const response = await fetch('/api/vehicle-link-import/browser-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        store_id: storeId,
        submission_id: submissionId,
        source_url: sourceUrl,
        vehicle: { ...vehicle, source_url: sourceUrl, image_url: '', image_urls: [] }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(result, 'Não foi possível iniciar o cadastro manual.'));
    return result;
  }

  async function standardRequest(actionName: 'save_draft' | 'submit_approval' | 'publish', vehicleOverride: any) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');
    const sourceUrl = extractCanonicalOlxUrl(url || vehicleOverride.source_url);
    if (!sourceUrl) throw new Error('Este cadastro aceita somente links públicos válidos do site da OLX.');
    const response = await fetch('/api/vehicle-link-import-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        action: actionName,
        store_id: storeId,
        submission_id: submissionId,
        source_url: sourceUrl,
        vehicle: { ...vehicleOverride, source_url: sourceUrl }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(result, 'Não foi possível salvar o veículo.'));
    return result;
  }

  async function continueManual() {
    if (!storeId) return setMessage('Selecione a loja proprietária.');
    const sourceUrl = extractCanonicalOlxUrl(url);
    if (!sourceUrl) return setMessage('Este cadastro aceita somente links públicos válidos do site da OLX.');
    setLoading(true);
    setMessage('Preparando o cadastro manual...');
    try {
      const result = await registerManualPreview();
      setSubmissionId(result.submission_id || submissionId);
      setCanPublish(Boolean(result.can_publish));
      setMissing(result.missing || []);
      setUrl(sourceUrl);
      setVehicle((current: any) => ({ ...current, source_url: sourceUrl }));
      setMessage('Cadastro iniciado. Preencha os dados e envie até 10 fotos do veículo.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível iniciar o cadastro manual.');
    } finally {
      setLoading(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const current = Array.isArray(vehicle.image_urls) ? vehicle.image_urls : [];
    const available = MAX_PHOTOS - current.length;
    if (available <= 0) return setMessage('O limite é de 10 fotos por veículo.');
    const selected = Array.from(files).slice(0, available);
    const invalidType = selected.find((file) => !ACCEPTED_TYPES.includes(file.type));
    if (invalidType) return setMessage('Envie somente fotos JPG, PNG ou WEBP.');
    const oversized = selected.find((file) => file.size > MAX_PHOTO_SIZE);
    if (oversized) return setMessage(`A foto ${oversized.name} ultrapassa o limite de 8 MB.`);
    try {
      const prepared = await Promise.all(selected.map(fileAsDataUrl));
      const images = [...current, ...prepared].slice(0, MAX_PHOTOS);
      setVehicle((value: any) => ({ ...value, image_urls: images, image_url: value.image_url || images[0] || '' }));
      setMessage(`${images.length} de ${MAX_PHOTOS} fotos adicionadas.`);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível preparar as fotos.');
    }
  }

  async function persistImages(activeVehicle: any) {
    const images = (Array.isArray(activeVehicle.image_urls) ? activeVehicle.image_urls : []).slice(0, MAX_PHOTOS);
    const accessToken = await token();
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');
    const uploaded: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = String(images[index] || '');
      if (!image.startsWith('data:image/')) {
        uploaded.push(image);
        continue;
      }
      setMessage(`Salvando foto ${index + 1} de ${images.length}...`);
      const response = await fetch('/api/vehicle-link-import/browser-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ store_id: storeId, source_url: activeVehicle.source_url || url, index: index + 1, data_url: image })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(result, `Não foi possível salvar a foto ${index + 1}.`));
      if (result.url) uploaded.push(result.url);
    }
    return { ...activeVehicle, image_url: uploaded[0] || '', image_urls: uploaded };
  }

  async function finish(actionName: 'save_draft' | 'submit_approval' | 'publish') {
    if (!submissionId) return setMessage('Clique em Continuar cadastro antes de salvar.');
    setAction(actionName);
    setMessage(actionName === 'publish' ? 'Salvando fotos e publicando...' : actionName === 'submit_approval' ? 'Salvando fotos e enviando para aprovação...' : 'Salvando rascunho...');
    try {
      const preparedVehicle = await persistImages(vehicle);
      setVehicle(preparedVehicle);
      const result = await standardRequest(actionName, preparedVehicle);
      setMissing(result.missing || []);
      setMessage(result.message || 'Ação concluída.');
      onComplete?.(result);
      if (actionName === 'publish' || actionName === 'submit_approval') window.setTimeout(onClose, 700);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível concluir a ação.');
    } finally {
      setAction('');
    }
  }

  function patch(key: string, value: any) {
    setVehicle((current: any) => ({ ...current, [key]: value }));
  }

  function setCover(image: string) {
    setVehicle((current: any) => ({ ...current, image_url: image, image_urls: [image, ...current.image_urls.filter((item: string) => item !== image)] }));
  }

  function removeImage(image: string) {
    setVehicle((current: any) => {
      const images = current.image_urls.filter((item: string) => item !== image);
      return { ...current, image_urls: images, image_url: current.image_url === image ? images[0] || '' : current.image_url };
    });
  }

  if (!open) return null;

  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6">
    <div className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-zinc-100 bg-white px-5 py-5 sm:px-7">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Cadastro por link OLX</p><h2 className="mt-1 text-2xl font-black text-zinc-950">Preencher dados e fotos do veículo</h2><p className="mt-1 text-sm font-semibold text-zinc-500">O link identifica a origem; os dados são preenchidos e conferidos manualmente.</p></div>
        <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600"><X size={19} /></button>
      </header>

      <div className="p-5 sm:p-7">
        {message ? <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
        <section className="grid gap-3 lg:grid-cols-[280px_1fr_auto]">
          <select className="premium-input" value={storeId} disabled={Boolean(fixedStoreId)} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">Selecione a loja</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
          </select>
          <input className="premium-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Cole somente o link público do site da OLX" aria-label="Link público do anúncio OLX" />
          <button type="button" className="premium-button-primary justify-center" onClick={() => void continueManual()} disabled={loading || Boolean(action)}>
            {loading ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} />} Continuar cadastro
          </button>
        </section>

        {submissionId ? <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_430px]">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Título do anúncio" value={vehicle.title} onChange={(value) => patch('title', value)} wide />
            <Field label="Marca *" value={vehicle.brand} onChange={(value) => patch('brand', value)} />
            <Field label="Modelo *" value={vehicle.model} onChange={(value) => patch('model', value)} />
            <Field label="Versão" value={vehicle.version} onChange={(value) => patch('version', value)} />
            <Field label="Ano *" value={vehicle.year} onChange={(value) => patch('year', value)} />
            <Field label="Quilometragem" value={vehicle.mileage} onChange={(value) => patch('mileage', value)} />
            <Field label="Cor" value={vehicle.color} onChange={(value) => patch('color', value)} />
            <Field label="Câmbio" value={vehicle.transmission} onChange={(value) => patch('transmission', value)} />
            <Field label="Combustível" value={vehicle.fuel} onChange={(value) => patch('fuel', value)} />
            <Field label="Preço *" type="number" value={vehicle.price} onChange={(value) => patch('price', value)} />
            <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Descrição<textarea className="premium-input mt-2 min-h-36 py-3" value={vehicle.description || ''} onChange={(event) => patch('description', event.target.value)} /></label>
            <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Link original<input className="premium-input mt-2" value={vehicle.source_url || url} readOnly /></label>
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={vehicle.show_on_landing !== false} onChange={(event) => patch('show_on_landing', event.target.checked)} /> Publicar no Portal Oficial</label>
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={vehicle.is_featured === true} onChange={(event) => patch('is_featured', event.target.checked)} /> Destacar veículo</label>
            {missing.length ? <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Pendências: {missing.join(', ')}.</div> : null}
          </section>

          <aside className="rounded-[26px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Fotos do veículo</p><p className="mt-1 text-xs font-semibold text-zinc-500">Até 10 fotos JPG, PNG ou WEBP. Clique para definir a capa.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-600">{vehicle.image_urls?.length || 0}/{MAX_PHOTOS}</span></div>
            <label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-4 text-center text-zinc-500 hover:border-red-300">
              <ImagePlus size={28} /><span className="mt-2 text-sm font-black">Adicionar fotos</span><span className="mt-1 text-xs font-semibold">Máximo de 8 MB por imagem</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => void addPhotos(event.target.files)} disabled={(vehicle.image_urls?.length || 0) >= MAX_PHOTOS} />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">{(vehicle.image_urls || []).map((image: string, index: number) => <div key={`${index}-${image.slice(0, 80)}`} className={`relative overflow-hidden rounded-2xl border-2 bg-white ${vehicle.image_url === image ? 'border-red-500' : 'border-transparent'}`}>
              <button type="button" className="block aspect-[4/3] w-full" onClick={() => setCover(image)}><img src={image} alt={`Foto ${index + 1} do veículo`} className="h-full w-full object-cover" /></button>
              <button type="button" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" onClick={() => removeImage(image)}><X size={13} /></button>
              {vehicle.image_url === image ? <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white"><Check size={11} /> CAPA</span> : null}
            </div>)}</div>
          </aside>
        </div> : null}
      </div>

      {submissionId ? <footer className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-zinc-100 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-7">
        <button type="button" className="premium-button-secondary justify-center" onClick={() => void finish('save_draft')} disabled={Boolean(action)}><Save size={16} /> {action === 'save_draft' ? 'Salvando...' : 'Salvar rascunho'}</button>
        {canPublish ? <button type="button" className="premium-button-primary justify-center" onClick={() => void finish('publish')} disabled={Boolean(action)}><UploadCloud size={16} /> {action === 'publish' ? 'Publicando...' : 'Publicar veículo'}</button>
          : <button type="button" className="premium-button-primary justify-center" onClick={() => void finish('submit_approval')} disabled={Boolean(action)}><Send size={16} /> {action === 'submit_approval' ? 'Enviando...' : 'Enviar para aprovação'}</button>}
      </footer> : null}
    </div>
  </div>;
}

function Field({ label, value, onChange, type = 'text', wide = false }: { label: string; value: any; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return <label className={`text-xs font-black uppercase text-zinc-500 ${wide ? 'sm:col-span-2' : ''}`}>{label}<input className="premium-input mt-2" type={type} min={type === 'number' ? 0 : undefined} value={value || ''} onChange={(event) => onChange(event.target.value)} /></label>;
}
