'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Check, ImagePlus, Loader2, MessageCircle, Save, Send, Sparkles, UploadCloud, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';
import { OlxBrowserImporterButton } from '@/components/marketplace/OlxBrowserImporterButton';

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

function browserDisplayImages(payload?: OlxBrowserImportPayload | null) {
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const prepared = images.map((item) => item.data_url || item.url).filter(Boolean);
  if (prepared.length) return Array.from(new Set(prepared));
  return Array.from(new Set(Array.isArray(payload?.image_urls) ? payload.image_urls : [])).filter(Boolean);
}

function browserRemoteImages(payload?: OlxBrowserImportPayload | null) {
  const fromObjects = (Array.isArray(payload?.images) ? payload.images : []).map((item) => item.url).filter(Boolean);
  return Array.from(new Set([...fromObjects, ...(Array.isArray(payload?.image_urls) ? payload.image_urls : [])])).filter(Boolean);
}

export function OlxVehicleImportModal({ open, stores, initial, fixedStoreId, browserPayload, onClose, onComplete }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const autoImportRef = useRef('');
  const [storeId, setStoreId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [url, setUrl] = useState('');
  const [vehicle, setVehicle] = useState<any>(emptyVehicle);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [aiAction, setAiAction] = useState('');
  const [aiReview, setAiReview] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    autoImportRef.current = '';
    const sourceUrl = extractCanonicalOlxUrl(browserPayload?.source_url || initial?.url || '');
    const images = browserDisplayImages(browserPayload);
    setStoreId(fixedStoreId || initial?.storeId || stores[0]?.id || '');
    setSubmissionId(initial?.submissionId || '');
    setUrl(sourceUrl || initial?.url || '');
    setVehicle(browserPayload ? {
      ...emptyVehicle,
      ...browserPayload,
      source_url: sourceUrl,
      price: moneyInput(browserPayload.price),
      image_url: images[0] || browserPayload.image_url || '',
      image_urls: images
    } : { ...emptyVehicle, source_url: initial?.url || '' });
    setCanPublish(false);
    setMessage(browserPayload
      ? 'Dados lidos pelo navegador. Registrando a prévia para revisão...'
      : initial?.url ? 'Importando automaticamente os dados do anúncio...' : 'Cole o link ou a mensagem compartilhada da OLX.');
    setMissing([]);
    setAiAction('');
    setAiReview(null);
  }, [open, initial?.submissionId, initial?.storeId, initial?.url, fixedStoreId, stores[0]?.id, browserPayload?.source_url]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function standardRequest(actionName: 'preview' | 'save_draft' | 'submit_approval' | 'publish', vehicleOverride?: any) {
    const accessToken = await token();
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');

    const activeVehicle = vehicleOverride || vehicle;
    const sourceUrl = extractCanonicalOlxUrl(url || activeVehicle.source_url);
    if (!sourceUrl) throw new Error('Não foi encontrado um link válido da OLX no texto informado.');
    if (sourceUrl !== url) setUrl(sourceUrl);

    const response = await fetch('/api/vehicle-link-import-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        action: actionName,
        store_id: storeId,
        submission_id: submissionId,
        source_url: sourceUrl,
        vehicle: { ...activeVehicle, source_url: sourceUrl }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(result, 'Não foi possível processar o anúncio.'));
    return result;
  }

  async function browserPreviewRequest() {
    if (!browserPayload) throw new Error('A extensão não enviou os dados do anúncio.');
    const accessToken = await token();
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');
    const sourceUrl = extractCanonicalOlxUrl(browserPayload.source_url || url);
    const remoteImages = browserRemoteImages(browserPayload);
    const payloadVehicle: Record<string, unknown> = {
      ...browserPayload,
      source_url: sourceUrl,
      image_url: remoteImages[0] || browserPayload.image_url || '',
      image_urls: remoteImages
    };
    delete payloadVehicle.images;

    const response = await fetch('/api/vehicle-link-import/browser-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        store_id: storeId,
        submission_id: submissionId,
        source_url: sourceUrl,
        vehicle: payloadVehicle
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(result, 'Não foi possível registrar os dados lidos pelo navegador.'));
    return result;
  }

  async function importData() {
    if (!storeId) return setMessage('Selecione a loja proprietária.');
    if (!extractCanonicalOlxUrl(browserPayload?.source_url || url)) return setMessage('Cole o link ou use a extensão no anúncio aberto da OLX.');
    setLoading(true);
    setMessage(browserPayload ? 'Registrando os dados lidos no navegador...' : 'Lendo os dados e as fotos do anúncio...');
    try {
      const result = browserPayload ? await browserPreviewRequest() : await standardRequest('preview');
      const imported = result.imported || {};
      const displayImages = browserPayload ? browserDisplayImages(browserPayload) : (Array.isArray(imported.image_urls) ? imported.image_urls : []);
      setSubmissionId(result.submission_id || submissionId);
      setCanPublish(Boolean(result.can_publish));
      setMissing(result.missing || []);
      setUrl(imported.source_url || extractCanonicalOlxUrl(browserPayload?.source_url || url) || url);
      setVehicle((current: any) => ({
        ...emptyVehicle,
        ...imported,
        ...(browserPayload || {}),
        source_url: imported.source_url || extractCanonicalOlxUrl(browserPayload?.source_url || url) || url,
        price: moneyInput(imported.price || browserPayload?.price),
        image_url: displayImages[0] || imported.image_url || '',
        image_urls: displayImages,
        show_on_landing: current.show_on_landing !== false,
        is_featured: current.is_featured === true
      }));
      setMessage(result.missing?.length
        ? `Importação concluída. Revise os campos pendentes: ${result.missing.join(', ')}.`
        : 'Importação concluída pelo navegador. Confira os dados e as fotos antes de continuar.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao importar o anúncio.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !storeId || loading) return;
    const source = browserPayload?.source_url || initial?.url;
    if (!source) return;
    const key = `${browserPayload ? 'browser' : 'server'}:${initial?.submissionId || ''}:${storeId}:${extractCanonicalOlxUrl(source) || source}`;
    if (autoImportRef.current === key) return;
    autoImportRef.current = key;
    const timer = window.setTimeout(() => void importData(), 100);
    return () => window.clearTimeout(timer);
  }, [open, browserPayload?.source_url, initial?.url, initial?.submissionId, storeId]);

  async function persistBrowserImages(activeVehicle: any) {
    const images = Array.isArray(activeVehicle.image_urls) ? activeVehicle.image_urls : [];
    if (!images.some((image: string) => image.startsWith('data:image/'))) return activeVehicle;
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
        body: JSON.stringify({
          store_id: storeId,
          source_url: activeVehicle.source_url || url,
          index: index + 1,
          data_url: image
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readableError(result, `Não foi possível salvar a foto ${index + 1}.`));
      if (result.url) uploaded.push(result.url);
    }

    if (!uploaded.length) throw new Error('Nenhuma foto pôde ser armazenada.');
    return { ...activeVehicle, image_url: uploaded[0], image_urls: uploaded };
  }

  async function finish(actionName: 'save_draft' | 'submit_approval' | 'publish') {
    if (!submissionId) return setMessage('Importe os dados antes de salvar.');
    setAction(actionName);
    setMessage(actionName === 'publish' ? 'Salvando fotos e publicando...' : actionName === 'submit_approval' ? 'Salvando fotos e enviando para aprovação...' : 'Salvando rascunho...');
    try {
      const preparedVehicle = await persistBrowserImages(vehicle);
      setVehicle(preparedVehicle);
      const result = await standardRequest(actionName, preparedVehicle);
      if (result.imported) {
        setVehicle((current: any) => ({ ...current, ...result.imported, price: moneyInput(result.imported.price) }));
      }
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

  async function runAi(actionName: 'normalize' | 'description' | 'marketing') {
    if (!submissionId) return setMessage('Importe os dados do anúncio antes de usar a IA.');
    const accessToken = await token();
    if (!accessToken) return setMessage('Sua sessão expirou. Entre novamente.');

    setAiAction(actionName);
    setMessage(actionName === 'marketing' ? 'Criando conteúdos comerciais com IA...' : 'Analisando os dados do veículo com IA...');
    try {
      const response = await fetch('/api/vehicle-link-import-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: actionName, store_id: storeId, vehicle })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível analisar o veículo com IA.');

      const review = payload.result || {};
      setAiReview(review);
      if (actionName !== 'marketing') {
        setVehicle((current: any) => ({
          ...current,
          ...(review.vehicle || {}),
          description: review.optimized_description || review.vehicle?.description || current.description,
          price: moneyInput(review.vehicle?.price || current.price),
          source_url: current.source_url,
          image_url: current.image_url,
          image_urls: current.image_urls,
          show_on_landing: current.show_on_landing,
          is_featured: current.is_featured
        }));
      }
      const conflictCount = review.conflicts?.length || 0;
      setMessage(conflictCount
        ? `Análise concluída. A IA identificou ${conflictCount} possível(is) divergência(s); confira antes de salvar.`
        : 'Análise concluída. Confira as sugestões antes de salvar.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao analisar o veículo com IA.');
    } finally {
      setAiAction('');
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
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Importação OLX</p><h2 className="mt-1 text-2xl font-black text-zinc-950">Conferir dados e fotos do veículo</h2><p className="mt-1 text-sm font-semibold text-zinc-500">Nenhum veículo é publicado sem esta revisão.</p></div>
        <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600"><X size={19} /></button>
      </header>

      <div className="p-5 sm:p-7">
        {message ? <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

        <section className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_auto_auto]">
          <select className="premium-input" value={storeId} disabled={Boolean(fixedStoreId)} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">Selecione a loja</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
          </select>
          <input className="premium-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Cole o link ou use a extensão no anúncio aberto" aria-label="Link do anúncio OLX" readOnly={Boolean(browserPayload)} />
          <button type="button" className="premium-button-primary justify-center whitespace-nowrap" onClick={() => void importData()} disabled={loading || Boolean(action)}>
            {loading ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} />} {browserPayload ? 'Carregar dados do navegador' : 'Importar dados'}
          </button>
          {!browserPayload ? <OlxBrowserImporterButton
            storeId={storeId}
            submissionId={submissionId}
            sourceUrl={url}
            disabled={loading || Boolean(action)}
            onError={setMessage}
          /> : null}
        </section>

        {!browserPayload ? <p className="mt-3 text-xs font-bold text-zinc-500">Se a OLX bloquear a leitura automática com erro 403, use <strong>Importador OLX</strong>. Ele abre o fluxo pelo Chrome e preserva esta loja e esta pendência.</p> : null}

        {submissionId ? <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_430px]">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-[24px] border border-violet-200 bg-violet-50 p-4">
              <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 text-violet-700" size={22} /><div><p className="text-sm font-black text-violet-950">Assistente de cadastro</p><p className="mt-1 text-xs font-semibold leading-relaxed text-violet-700">A IA sugere ajustes e aponta divergências. Nada é salvo ou publicado automaticamente.</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <AiButton loading={aiAction === 'normalize'} disabled={Boolean(aiAction) || Boolean(action)} icon={<BrainCircuit size={15} />} label="Organizar e auditar" onClick={() => void runAi('normalize')} />
                <AiButton loading={aiAction === 'description'} disabled={Boolean(aiAction) || Boolean(action)} icon={<Sparkles size={15} />} label="Melhorar descrição" onClick={() => void runAi('description')} />
                <AiButton loading={aiAction === 'marketing'} disabled={Boolean(aiAction) || Boolean(action)} icon={<MessageCircle size={15} />} label="Criar conteúdos" onClick={() => void runAi('marketing')} />
              </div>
            </div>
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
            <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Descrição importada<textarea className="premium-input mt-2 min-h-36 py-3" value={vehicle.description || ''} onChange={(event) => patch('description', event.target.value)} /></label>
            <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">Link original<input className="premium-input mt-2" value={vehicle.source_url || url} readOnly /></label>
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={vehicle.show_on_landing !== false} onChange={(event) => patch('show_on_landing', event.target.checked)} /> Publicar no Portal Oficial</label>
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={vehicle.is_featured === true} onChange={(event) => patch('is_featured', event.target.checked)} /> Destacar veículo</label>
            {missing.length ? <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Pendências: {missing.join(', ')}.</div> : null}
            {aiReview?.conflicts?.length ? <div className="sm:col-span-2 rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-black uppercase text-red-700">Divergências para conferir</p><ul className="mt-2 space-y-1 text-sm font-semibold text-red-800">{aiReview.conflicts.map((item: any, index: number) => <li key={`${item.field}-${index}`}>• {item.message}</li>)}</ul></div> : null}
            {aiReview?.warnings?.length ? <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase text-amber-700">Alertas da análise</p><ul className="mt-2 space-y-1 text-sm font-semibold text-amber-800">{aiReview.warnings.map((item: string, index: number) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></div> : null}
            {aiReview?.instagram_caption || aiReview?.whatsapp_message ? <div className="sm:col-span-2 grid gap-3 lg:grid-cols-2">
              {aiReview.instagram_caption ? <GeneratedContent label="Legenda para Instagram" value={aiReview.instagram_caption} /> : null}
              {aiReview.whatsapp_message ? <GeneratedContent label="Mensagem para WhatsApp" value={aiReview.whatsapp_message} /> : null}
            </div> : null}
          </section>

          <aside className="rounded-[26px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Fotos importadas</p><p className="mt-1 text-xs font-semibold text-zinc-500">Clique em uma foto para definir a capa.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-600">{vehicle.image_urls?.length || 0}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3">{(vehicle.image_urls || []).map((image: string, index: number) => <div key={`${index}-${image.slice(0, 80)}`} className={`relative overflow-hidden rounded-2xl border-2 bg-white ${vehicle.image_url === image ? 'border-red-500' : 'border-transparent'}`}>
              <button type="button" className="block aspect-[4/3] w-full" onClick={() => setCover(image)}><img src={image} alt="Foto importada" className="h-full w-full object-cover" /></button>
              <button type="button" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" onClick={() => removeImage(image)}><X size={13} /></button>
              {vehicle.image_url === image ? <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white"><Check size={11} /> CAPA</span> : null}
            </div>)}</div>
            {!vehicle.image_urls?.length ? <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-zinc-400"><ImagePlus size={40} /><p className="mt-3 text-sm font-bold">Nenhuma foto encontrada</p></div> : null}
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

function AiButton({ loading, disabled, icon, label, onClick }: { loading: boolean; disabled: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-violet-800 shadow-sm ring-1 ring-violet-200 disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={15} /> : icon}{label}</button>;
}

function GeneratedContent({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <article className="rounded-2xl border border-violet-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase text-violet-700">{label}</p><button type="button" onClick={() => void copy()} className="text-xs font-black text-zinc-500 hover:text-violet-700">{copied ? 'Copiado' : 'Copiar'}</button></div><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-700">{value}</p></article>;
}
