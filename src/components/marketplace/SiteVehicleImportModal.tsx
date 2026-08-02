'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, ImagePlus, Loader2, Save, Send, UploadCloud, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export type SiteImportStore = { id: string; name?: string; store_name?: string };
export type SiteImportInitial = { submissionId?: string; storeId?: string; url?: string };

type Props = {
  open: boolean;
  eventId?: string;
  eventName?: string;
  stores: SiteImportStore[];
  initial?: SiteImportInitial | null;
  fixedStoreId?: string;
  onClose: () => void;
  onComplete?: (result: any) => void;
};

const emptyVehicle = {
  source_url: '', title: '', description: '', brand: '', model: '', version: '', year: '', mileage: '',
  color: '', transmission: '', fuel: '', price: '', image_url: '', image_urls: [] as string[],
  show_on_landing: true, is_featured: false
};

function storeLabel(store: SiteImportStore) {
  return store.name || store.store_name || 'Loja';
}

function moneyInput(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? String(Math.round(number)) : '';
}

function validWebsiteUrl(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (host === 'olx.com.br' || host.endsWith('.olx.com.br')) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function readableError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() && value !== '[object Object]') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readableError(record.message || record.error || record.detail, fallback);
  }
  return fallback;
}

export function SiteVehicleImportModal({
  open,
  eventId,
  eventName,
  stores,
  initial,
  fixedStoreId,
  onClose,
  onComplete
}: Props) {
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

  useEffect(() => {
    if (!open) return;
    autoImportRef.current = '';
    const initialUrl = initial?.url || '';
    setStoreId(fixedStoreId || initial?.storeId || stores[0]?.id || '');
    setSubmissionId(initial?.submissionId || '');
    setUrl(initialUrl);
    setVehicle({ ...emptyVehicle, source_url: initialUrl });
    setCanPublish(false);
    setMessage(initialUrl ? 'Lendo automaticamente o site da loja...' : 'Cole o link da página do veículo no site da loja.');
    setMissing([]);
  }, [open, initial?.submissionId, initial?.storeId, initial?.url, fixedStoreId, stores[0]?.id]);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function request(actionName: 'preview' | 'save_draft' | 'submit_approval' | 'publish') {
    const token = await accessToken();
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const sourceUrl = validWebsiteUrl(url || vehicle.source_url);
    if (!sourceUrl) throw new Error('Informe um link válido do site da loja. Para OLX, use a extensão do navegador.');
    if (sourceUrl !== url) setUrl(sourceUrl);

    const response = await fetch('/api/vehicle-link-import/site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: actionName,
        event_id: eventId || null,
        store_id: storeId,
        submission_id: submissionId,
        source_url: sourceUrl,
        vehicle: { ...vehicle, source_url: sourceUrl }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(result?.error || result, 'Não foi possível processar o site da loja.'));
    return result;
  }

  async function importData() {
    if (!storeId) return setMessage('Selecione a loja proprietária.');
    if (!validWebsiteUrl(url)) return setMessage('Cole um link válido do site da loja. Links da OLX usam a extensão.');
    setLoading(true);
    setMessage('Lendo informações e imagens do site da loja...');
    try {
      const result = await request('preview');
      const imported = result.imported || {};
      setSubmissionId(result.submission_id || submissionId);
      setCanPublish(Boolean(result.can_publish));
      setMissing(result.missing || []);
      setUrl(imported.source_url || url);
      setVehicle({
        ...emptyVehicle,
        ...imported,
        source_url: imported.source_url || url,
        price: moneyInput(imported.price),
        image_url: imported.image_url || imported.image_urls?.[0] || '',
        image_urls: Array.isArray(imported.image_urls) ? imported.image_urls : []
      });
      const descriptionGenerated = result.ai_review?.description_generated === true;
      const aiWarning = result.ai_review?.ok === false;
      setMessage(result.missing?.length
        ? `${descriptionGenerated ? 'Descrição gerada pela IA. ' : ''}Revise os campos pendentes: ${result.missing.join(', ')}.`
        : descriptionGenerated
          ? 'Leitura concluída e descrição gerada pela IA. Confira os dados e as fotos.'
          : aiWarning
            ? 'Dados lidos. A IA não conseguiu gerar uma nova descrição; revise o texto antes de publicar.'
            : 'Leitura concluída. Confira todos os dados e as fotos.');
    } catch (error: any) {
      setMessage(readableError(error?.message || error, 'Falha ao importar o site da loja.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !initial?.url || !storeId || loading) return;
    const sourceUrl = validWebsiteUrl(url);
    if (!sourceUrl) return;
    const key = `${initial.submissionId || ''}:${storeId}:${sourceUrl}`;
    if (autoImportRef.current === key) return;
    autoImportRef.current = key;
    const timer = window.setTimeout(() => void importData(), 100);
    return () => window.clearTimeout(timer);
  }, [open, initial?.url, initial?.submissionId, storeId, url]);

  async function finish(actionName: 'save_draft' | 'submit_approval' | 'publish') {
    if (!submissionId) return setMessage('Importe os dados antes de salvar.');
    setAction(actionName);
    setMessage(actionName === 'publish'
      ? 'Copiando as fotos e publicando...'
      : actionName === 'submit_approval'
        ? 'Copiando as fotos e enviando para aprovação...'
        : 'Copiando as fotos e salvando o rascunho...');
    try {
      const result = await request(actionName);
      if (result.imported) {
        setVehicle((current: any) => ({
          ...current,
          ...result.imported,
          price: moneyInput(result.imported.price)
        }));
      }
      setMissing(result.missing || []);
      setMessage(result.message || 'Ação concluída.');
      onComplete?.(result);
      if (actionName === 'publish' || actionName === 'submit_approval') {
        window.setTimeout(onClose, 800);
      }
    } catch (error: any) {
      setMessage(readableError(error?.message || error, 'Não foi possível concluir a ação.'));
    } finally {
      setAction('');
    }
  }

  function patch(key: string, value: any) {
    setVehicle((current: any) => ({ ...current, [key]: value }));
  }

  function setCover(image: string) {
    setVehicle((current: any) => ({
      ...current,
      image_url: image,
      image_urls: [image, ...current.image_urls.filter((item: string) => item !== image)]
    }));
  }

  function removeImage(image: string) {
    setVehicle((current: any) => {
      const images = current.image_urls.filter((item: string) => item !== image);
      return {
        ...current,
        image_urls: images,
        image_url: current.image_url === image ? images[0] || '' : current.image_url
      };
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6">
      <div className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-zinc-100 bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Importação por site</p>
            <h2 className="mt-1 text-2xl font-black text-zinc-950">Conferir dados e fotos do veículo</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              {eventName ? `Evento: ${eventName}. ` : ''}O veículo só é publicado depois desta revisão.
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
            <X size={19} />
          </button>
        </header>

        <div className="p-5 sm:p-7">
          {message ? <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

          <section className="grid gap-3 lg:grid-cols-[280px_1fr_auto]">
            <select className="premium-input" value={storeId} disabled={Boolean(fixedStoreId)} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">Selecione a loja</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
            </select>
            <input className="premium-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://sitedaloja.com.br/veiculo/..." />
            <button type="button" className="premium-button-primary justify-center" onClick={() => void importData()} disabled={loading || Boolean(action)}>
              {loading ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} />} Importar dados
            </button>
          </section>

          {submissionId ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_430px]">
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

                <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">
                  Descrição gerada pela IA
                  <textarea className="premium-input mt-2 min-h-36 py-3" value={vehicle.description || ''} onChange={(event) => patch('description', event.target.value)} />
                  <span className="mt-2 block normal-case tracking-normal text-zinc-400">
                    A IA redige o texto; cor, ano, câmbio e demais dados técnicos vêm do anúncio original.
                  </span>
                </label>

                <label className="text-xs font-black uppercase text-zinc-500 sm:col-span-2">
                  Link original
                  <div className="mt-2 flex gap-2">
                    <input className="premium-input" value={vehicle.source_url || url} readOnly />
                    <a className="premium-button-secondary shrink-0" href={vehicle.source_url || url} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black">
                  <input type="checkbox" checked={vehicle.show_on_landing !== false} onChange={(event) => patch('show_on_landing', event.target.checked)} /> Publicar no Portal Oficial
                </label>
                <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black">
                  <input type="checkbox" checked={vehicle.is_featured === true} onChange={(event) => patch('is_featured', event.target.checked)} /> Destacar veículo
                </label>

                {missing.length ? (
                  <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    Pendências: {missing.join(', ')}.
                  </div>
                ) : null}
              </section>

              <aside className="rounded-[26px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">Fotos importadas</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">Clique em uma foto para definir a capa.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-600">{vehicle.image_urls?.length || 0}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(vehicle.image_urls || []).map((image: string) => (
                    <div key={image} className={`relative overflow-hidden rounded-2xl border-2 bg-white ${vehicle.image_url === image ? 'border-blue-500' : 'border-transparent'}`}>
                      <button type="button" className="block aspect-[4/3] w-full" onClick={() => setCover(image)}>
                        <img src={image} alt="Foto importada" className="h-full w-full object-cover" />
                      </button>
                      <button type="button" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" onClick={() => removeImage(image)}>
                        <X size={13} />
                      </button>
                      {vehicle.image_url === image ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black text-white">
                          <Check size={11} /> CAPA
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {!vehicle.image_urls?.length ? (
                  <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-zinc-400">
                    <ImagePlus size={40} />
                    <p className="mt-3 text-sm font-bold">Nenhuma foto encontrada</p>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : null}
        </div>

        {submissionId ? (
          <footer className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-zinc-100 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <button type="button" className="premium-button-secondary justify-center" onClick={() => void finish('save_draft')} disabled={Boolean(action)}>
              <Save size={16} /> {action === 'save_draft' ? 'Salvando...' : 'Salvar rascunho'}
            </button>
            {canPublish ? (
              <button type="button" className="premium-button-primary justify-center" onClick={() => void finish('publish')} disabled={Boolean(action)}>
                <UploadCloud size={16} /> {action === 'publish' ? 'Publicando...' : 'Publicar veículo'}
              </button>
            ) : (
              <button type="button" className="premium-button-primary justify-center" onClick={() => void finish('submit_approval')} disabled={Boolean(action)}>
                <Send size={16} /> {action === 'submit_approval' ? 'Enviando...' : 'Enviar para aprovação'}
              </button>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  wide = false
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`text-xs font-black uppercase text-zinc-500 ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      <input className="premium-input mt-2" type={type} min={type === 'number' ? 0 : undefined} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
