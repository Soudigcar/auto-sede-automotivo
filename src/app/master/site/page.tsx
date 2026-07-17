'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, DownloadCloud, ExternalLink, Eye, FileSpreadsheet, Plus, Search, Trash2, Upload, XCircle } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

const emptyCampaign = {
  id: '',
  name: 'Festival Seu Carro Agora',
  slug: 'festival-seu-carro-agora',
  title: 'Simule seu financiamento e descubra suas chances de sair de carro hoje',
  description: 'Escolha um veículo disponível em nosso estoque, informe seus dados e receba uma simulação inicial com taxa referencial de 1,89%.',
  interest_rate: '1.89',
  whatsapp_number: '5561999999999',
  is_active: true
};

const emptyVehicle = {
  id: '',
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
  store_name: '',
  status: 'disponivel',
  show_on_landing: true,
  is_featured: false
};

const submissionStatus: Record<string, string> = {
  pending: 'Pendente',
  reviewing: 'Em conferência',
  imported: 'Importado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  duplicate: 'Duplicado'
};

const stockStatus: Record<string, string> = {
  pending: 'Pendente',
  reviewing: 'Em análise',
  processed: 'Processado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  error: 'Erro'
};

const emptyVehicleOptions: Record<string, string[]> = {
  brand: [],
  model: [],
  version: [],
  transmission: [],
  fuel: []
};

export default function MasterSitePage() {
  const supabase = createClient();

  const [campaign, setCampaign] = useState<any>(emptyCampaign);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleForm, setVehicleForm] = useState<any>(emptyVehicle);
  const [message, setMessage] = useState('Carregando área Site...');
  const [uploading, setUploading] = useState(false);

  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [selectedImportImages, setSelectedImportImages] = useState<string[]>([]);

  const [storeMap, setStoreMap] = useState<Record<string, any>>({});
  const [vehicleSubmissions, setVehicleSubmissions] = useState<any[]>([]);
  const [stockImports, setStockImports] = useState<any[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [vehicleOptions, setVehicleOptions] = useState<Record<string, string[]>>(emptyVehicleOptions);

  const publicLink = useMemo(() => {
    if (typeof window === 'undefined') return `/campanha/${campaign.slug}`;
    return `${window.location.origin}/campanha/${campaign.slug || 'festival-seu-carro-agora'}`;
  }, [campaign.slug]);

  const activeVehicleSubmissions = useMemo(() => {
    return vehicleSubmissions.filter((item) => !['published', 'rejected', 'duplicate'].includes(item.status));
  }, [vehicleSubmissions]);

  async function loadVehicleOptions() {
    const { data } = await supabase
      .from('vehicle_attribute_options')
      .select('option_type,option_value')
      .eq('is_active', true)
      .order('option_type', { ascending: true })
      .order('option_value', { ascending: true });

    const grouped: Record<string, string[]> = { ...emptyVehicleOptions };

    (data || []).forEach((item: any) => {
      if (!grouped[item.option_type]) grouped[item.option_type] = [];
      if (item.option_value && !grouped[item.option_type].includes(item.option_value)) {
        grouped[item.option_type].push(item.option_value);
      }
    });

    setVehicleOptions(grouped);
  }

  async function loadStoreQueue() {
    const [{ data: submissionRows }, { data: stockRows }, { data: storeRows }] = await Promise.all([
      supabase
        .from('store_vehicle_link_submissions')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('store_stock_imports')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('stores')
        .select('id,store_name,responsible_name,responsible_email,responsible_phone,website_url,slug')
        .neq('status', 'deleted')
    ]);

    const storesById = Object.fromEntries((storeRows || []).map((store: any) => [store.id, store]));

    setStoreMap(storesById);
    setVehicleSubmissions(submissionRows || []);
    setStockImports(stockRows || []);
  }

  async function loadData() {
    const { data: campaignData } = await supabase
      .from('site_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentCampaign = campaignData || emptyCampaign;

    setCampaign({
      ...currentCampaign,
      interest_rate: String(currentCampaign.interest_rate || '1.89')
    });

    if (currentCampaign?.id) {
      const { data: vehicleRows } = await supabase
        .from('site_vehicles')
        .select('*')
        .eq('campaign_id', currentCampaign.id)
        .neq('status', 'excluido')
        .order('created_at', { ascending: false });

      setVehicles(vehicleRows || []);
    }

    await loadStoreQueue();
    await loadVehicleOptions();
    setMessage('');
  }

  useEffect(() => {
    loadData().catch(() => setMessage('Não foi possível carregar. Confirme se o SQL do Site foi executado.'));
  }, []);

  async function saveCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      name: campaign.name,
      slug: slugify(campaign.slug || campaign.name),
      title: campaign.title,
      description: campaign.description,
      interest_rate: Number(campaign.interest_rate || 1.89),
      whatsapp_number: campaign.whatsapp_number,
      is_active: Boolean(campaign.is_active),
      updated_at: new Date().toISOString()
    };

    const request = campaign.id
      ? supabase.from('site_campaigns').update(payload).eq('id', campaign.id).select('*').single()
      : supabase.from('site_campaigns').insert(payload).select('*').single();

    const { data, error } = await request;

    if (error) {
      setMessage('Erro ao salvar campanha. Verifique o SQL e permissões.');
      return;
    }

    setCampaign({ ...data, interest_rate: String(data.interest_rate || '1.89') });
    setMessage('Campanha salva com sucesso.');
    await loadData();
  }

  async function uploadVehicleImage(file?: File) {
    if (!file) return;

    if (!campaign.id) {
      setMessage('Salve a campanha antes de subir imagem.');
      return;
    }

    setUploading(true);

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${campaign.slug}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from('vehicle-images').upload(fileName, file, { upsert: true });

    if (error) {
      setUploading(false);
      setMessage('Erro ao subir imagem. Confirme se o bucket vehicle-images foi criado.');
      return;
    }

    const { data } = supabase.storage.from('vehicle-images').getPublicUrl(fileName);
    setVehicleForm((current: any) => ({
      ...current,
      image_url: data.publicUrl,
      image_urls: Array.from(new Set([...(current.image_urls || []), data.publicUrl]))
    }));
    setUploading(false);
    setMessage('Imagem enviada com sucesso.');
  }

  async function saveAttributeOptions(payload: any) {
    const options = [
      { option_type: 'brand', option_value: payload.brand },
      { option_type: 'model', option_value: payload.model },
      { option_type: 'version', option_value: payload.version },
      { option_type: 'transmission', option_value: payload.transmission },
      { option_type: 'fuel', option_value: payload.fuel }
    ].map((item) => ({
      ...item,
      option_value: String(item.option_value || '').trim()
    })).filter((item) => item.option_value);

    for (const item of options) {
      const { data: existing } = await supabase
        .from('vehicle_attribute_options')
        .select('id,usage_count')
        .eq('option_type', item.option_type)
        .ilike('option_value', item.option_value)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('vehicle_attribute_options')
          .update({
            usage_count: Number(existing.usage_count || 1) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('vehicle_attribute_options')
          .insert({
            option_type: item.option_type,
            option_value: item.option_value,
            is_active: true
          });
      }
    }
  }

  async function saveVehiclePayload() {
    if (!campaign.id) {
      setMessage('Salve a campanha antes de cadastrar veículos.');
      return null;
    }

    const payload = {
      campaign_id: campaign.id,
      brand: vehicleForm.brand,
      model: vehicleForm.model,
      version: vehicleForm.version,
      year: vehicleForm.year,
      mileage: vehicleForm.mileage,
      color: vehicleForm.color,
      transmission: vehicleForm.transmission,
      fuel: vehicleForm.fuel,
      price: Number(vehicleForm.price || 0),
      image_url: vehicleForm.image_url,
      image_urls: Array.isArray(vehicleForm.image_urls) && vehicleForm.image_urls.length
        ? vehicleForm.image_urls
        : vehicleForm.image_url
          ? [vehicleForm.image_url]
          : [],
      store_name: vehicleForm.store_name,
      status: vehicleForm.status,
      show_on_landing: Boolean(vehicleForm.show_on_landing),
      is_featured: Boolean(vehicleForm.is_featured),
      updated_at: new Date().toISOString()
    };

    const request = vehicleForm.id
      ? supabase.from('site_vehicles').update(payload).eq('id', vehicleForm.id).select('*').single()
      : supabase.from('site_vehicles').insert(payload).select('*').single();

    const { data, error } = await request;

    if (error) {
      setMessage('Erro ao salvar veículo.');
      return null;
    }

    await saveAttributeOptions(payload);
    await loadVehicleOptions();

    if (selectedSubmissionId && data?.id) {
      await supabase
        .from('store_vehicle_link_submissions')
        .update({
          status: 'published',
          imported_vehicle_id: data.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSubmissionId);
    }

    setVehicleForm(emptyVehicle);
    setImportPreview(null);
    setSelectedImportImages([]);
    setSelectedSubmissionId('');

    setMessage('Veículo publicado na landing.');
    await loadData();

    return data;
  }

  async function saveVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveVehiclePayload();
  }

  async function publishSelectedSubmission(item: any) {
    if (selectedSubmissionId !== item.id) {
      setMessage('Clique primeiro em Conferir ou Editar dados neste veículo. Depois revise os dados e publique.');
      return;
    }

    if (!vehicleForm.brand || !vehicleForm.model || !vehicleForm.price) {
      setMessage('Antes de publicar, confira e complete marca, modelo e preço no formulário Estoque da Landing.');
      return;
    }

    await saveVehiclePayload();
  }

  async function editVehicle(item: any) {
    setVehicleForm({
      ...item,
      price: String(item.price || ''),
      image_urls: Array.isArray(item.image_urls) && item.image_urls.length
        ? item.image_urls
        : item.image_url
          ? [item.image_url]
          : []
    });

    setSelectedSubmissionId('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleVehicle(item: any, payload: any) {
    await supabase.from('site_vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', item.id);
    await loadData();
  }

  async function deleteVehicle(item: any) {
    const confirmation = window.prompt(`Excluir o anúncio ${item.brand} ${item.model}? Digite EXCLUIR para confirmar.`);

    if (confirmation !== 'EXCLUIR') return;

    const { error } = await supabase
      .from('site_vehicles')
      .update({
        status: 'excluido',
        show_on_landing: false,
        is_featured: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      setMessage('Erro ao excluir anúncio.');
      return;
    }

    setMessage('Anúncio excluído da landing.');
    await loadData();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicLink);
    setMessage('Link público copiado.');
  }

  async function runPreviewFromUrl(url: string, storeName?: string, submissionId?: string) {
    if (!url) {
      setMessage('Cole o link do anúncio para buscar as informações.');
      return;
    }

    setImportLoading(true);
    setMessage('Buscando informações do anúncio...');

    const response = await fetch('/api/site-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', url })
    });

    const result = await response.json();
    setImportLoading(false);

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível buscar informações do link.');
      return;
    }

    setImportPreview(result);
    setSelectedImportImages((result.images || []).slice(0, 5));
    setVehicleForm((current: any) => ({
      ...current,
      brand: result.vehicle?.brand || current.brand,
      model: result.vehicle?.model || current.model,
      version: result.vehicle?.version || current.version,
      year: result.vehicle?.year || current.year,
      price: result.price ? String(result.price) : current.price,
      image_url: result.images?.[0] || current.image_url,
      store_name: storeName || current.store_name
    }));

    if (submissionId) {
      setSelectedSubmissionId(submissionId);
      await supabase
        .from('store_vehicle_link_submissions')
        .update({ status: 'reviewing', updated_at: new Date().toISOString() })
        .eq('id', submissionId);

      await loadStoreQueue();
    }

    setMessage('Prévia encontrada. Confira as informações, importe as fotos e publique.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function previewVehicleImport() {
    await runPreviewFromUrl(importUrl);
  }

  async function reviewSubmission(item: any) {
    const store = storeMap[item.store_id];
    setImportUrl(item.vehicle_url);
    await runPreviewFromUrl(item.vehicle_url, store?.store_name || '', item.id);
  }

  async function rejectSubmission(item: any) {
    const confirmation = window.prompt('Rejeitar este link? Digite REJEITAR para confirmar.');
    if (confirmation !== 'REJEITAR') return;

    await supabase
      .from('store_vehicle_link_submissions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', item.id);

    setMessage('Link rejeitado.');
    await loadStoreQueue();
  }

  async function markStockImportStatus(item: any, status: string) {
    await supabase
      .from('store_stock_imports')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    setMessage('Status do arquivo atualizado.');
    await loadStoreQueue();
  }

  function toggleImportImage(url: string) {
    setSelectedImportImages((current) => {
      if (current.includes(url)) return current.filter((item) => item !== url);
      return [...current, url].slice(0, 8);
    });
  }

  async function importVehicleImages() {
    if (!importPreview) {
      setMessage('Busque uma prévia antes de importar.');
      return;
    }

    setImportLoading(true);
    setMessage('Baixando fotos e salvando no Storage...');

    const response = await fetch('/api/site-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', url: importUrl, images: selectedImportImages })
    });

    const result = await response.json();
    setImportLoading(false);

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível importar as fotos.');
      return;
    }

    setVehicleForm((current: any) => ({
      ...current,
      brand: result.vehicle?.brand || current.brand,
      model: result.vehicle?.model || current.model,
      version: result.vehicle?.version || current.version,
      year: result.vehicle?.year || current.year,
      price: result.price ? String(result.price) : current.price,
      image_url: result.vehicle?.image_url || current.image_url,
      image_urls: result.uploadedImages?.length
        ? result.uploadedImages
        : result.vehicle?.image_url
          ? Array.from(new Set([...(current.image_urls || []), result.vehicle.image_url]))
          : current.image_urls || []
    }));

    if (selectedSubmissionId) {
      await supabase
        .from('store_vehicle_link_submissions')
        .update({ status: 'imported', updated_at: new Date().toISOString() })
        .eq('id', selectedSubmissionId);

      await loadStoreQueue();
    }

    setMessage(result.uploadedImages?.length ? 'Fotos importadas. Agora confira e clique em Adicionar veículo na landing.' : 'Não foi possível salvar fotos, mas a prévia foi carregada.');
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Site" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Captação digital</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Site</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Configure a landing pública, revise veículos enviados pelas lojas e publique no simulador.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="premium-button-secondary" type="button" onClick={copyLink}><Copy size={18} /> Copiar link</button>
              <Link href={`/campanha/${campaign.slug || 'festival-seu-carro-agora'}`} target="_blank" className="premium-button-primary"><ExternalLink size={18} /> Abrir landing</Link>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{message}</div> : null}

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Veículos enviados pelas lojas</h2>
                <p className="mt-1 text-sm text-zinc-500">Fila de links enviados no cadastro da loja. Confira, edite e publique manualmente.</p>
              </div>
              <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-600">
                {activeVehicleSubmissions.filter((item) => item.status === 'pending').length} pendente(s)
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {activeVehicleSubmissions.map((item) => {
                const store = storeMap[item.store_id];
                const isSelected = selectedSubmissionId === item.id;

                return (
                  <div key={item.id} className={`rounded-3xl border p-4 ${isSelected ? 'border-red-300 bg-red-50/40' : 'border-zinc-100 bg-zinc-50'}`}>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Loja</p>
                        <h3 className="mt-1 text-lg font-black text-zinc-950">{store?.store_name || 'Loja não encontrada'}</h3>
                        <p className="mt-1 text-sm text-zinc-500">{store?.responsible_name || '-'} • {store?.responsible_email || '-'}</p>

                        {store?.website_url ? (
                          <a className="mt-2 inline-flex text-xs font-bold text-red-600" href={store.website_url} target="_blank">
                            Site da loja: {store.website_url}
                          </a>
                        ) : null}

                        <p className="mt-3 break-all rounded-2xl bg-white p-3 text-xs font-bold text-zinc-600">{item.vehicle_url}</p>
                      </div>

                      <div className="flex flex-col gap-2 xl:w-56">
                        <span className="rounded-full bg-white px-3 py-2 text-center text-xs font-black text-zinc-500">
                          {submissionStatus[item.status] || item.status}
                        </span>

                        <button className="premium-button-secondary text-xs" type="button" onClick={() => reviewSubmission(item)}>
                          <Search size={14} /> Conferir
                        </button>

                        <button className="premium-button-secondary text-xs" type="button" onClick={() => reviewSubmission(item)}>
                          <Eye size={14} /> Editar dados
                        </button>

                        <button className="premium-button-primary text-xs" type="button" onClick={() => publishSelectedSubmission(item)}>
                          <CheckCircle2 size={14} /> Publicar após edição
                        </button>

                        <button className="premium-button-secondary text-xs" type="button" onClick={() => rejectSubmission(item)}>
                          <XCircle size={14} /> Rejeitar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!activeVehicleSubmissions.length ? (
                <p className="text-sm font-bold text-zinc-500">Nenhum link de veículo enviado pelas lojas ainda.</p>
              ) : null}
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Arquivos XML/CSV enviados</h2>
                <p className="mt-1 text-sm text-zinc-500">Arquivos de estoque enviados pelas lojas no cadastro.</p>
              </div>
              <FileSpreadsheet className="text-red-600" />
            </div>

            <div className="mt-5 grid gap-3">
              {stockImports.map((item) => {
                const store = storeMap[item.store_id];

                return (
                  <div key={item.id} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h3 className="font-black text-zinc-950">{store?.store_name || 'Loja não encontrada'}</h3>
                        <p className="mt-1 text-sm text-zinc-500">{item.file_name}</p>
                        <p className="mt-1 text-xs font-bold text-zinc-400">
                          {stockStatus[item.status] || item.status} • {(Number(item.file_size_bytes || 0) / 1024).toFixed(1)} KB
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button className="premium-button-secondary text-xs" type="button" onClick={() => markStockImportStatus(item, 'reviewing')}>
                          Marcar em análise
                        </button>
                        <button className="premium-button-secondary text-xs" type="button" onClick={() => markStockImportStatus(item, 'processed')}>
                          Processado
                        </button>
                        <button className="premium-button-secondary text-xs" type="button" onClick={() => markStockImportStatus(item, 'rejected')}>
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!stockImports.length ? (
                <p className="text-sm font-bold text-zinc-500">Nenhum arquivo XML/CSV enviado ainda.</p>
              ) : null}
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Link público</h2>
                <p className="mt-1 text-sm text-zinc-500">Esse é o link limpo para divulgar. O cliente não vê o sistema.</p>
              </div>
              <code className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700">{publicLink}</code>
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Importar veículo por link</h2>
                <p className="mt-1 text-sm text-zinc-500">Cole o link público do anúncio para buscar fotos e informações automaticamente.</p>
              </div>
              <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-600">Prévia antes de salvar</span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
              <input
                className="premium-input"
                placeholder="Cole aqui o link do anúncio. Ex: https://brasiliaautomoveis.com.br/..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />

              <button className="premium-button-secondary" type="button" onClick={previewVehicleImport} disabled={importLoading}>
                <Search size={18} /> {importLoading ? 'Buscando...' : 'Buscar informações'}
              </button>

              <button className="premium-button-primary" type="button" onClick={importVehicleImages} disabled={importLoading || !importPreview}>
                <DownloadCloud size={18} /> Importar fotos
              </button>
            </div>

            {importPreview ? (
              <div className="mt-5 rounded-[28px] border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Prévia encontrada</p>
                    <h3 className="mt-1 text-xl font-black text-zinc-950">{importPreview.title || 'Anúncio encontrado'}</h3>
                    <p className="mt-1 text-sm font-bold text-zinc-500">Preço detectado: {money(importPreview.price || 0)}</p>
                  </div>
                  <p className="text-xs font-bold text-zinc-400">{selectedImportImages.length} foto(s) selecionada(s)</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {(importPreview.images || []).slice(0, 10).map((image: string) => {
                    const checked = selectedImportImages.includes(image);

                    return (
                      <button
                        key={image}
                        type="button"
                        onClick={() => toggleImportImage(image)}
                        className={`overflow-hidden rounded-2xl border text-left transition ${checked ? 'border-red-500 ring-4 ring-red-500/10' : 'border-zinc-200'}`}
                      >
                        <img src={image} alt="Foto importada" className="h-32 w-full object-cover" />
                        <span className="block bg-white px-3 py-2 text-xs font-black text-zinc-600">
                          {checked ? 'Selecionada' : 'Selecionar'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!(importPreview.images || []).length ? (
                  <p className="mt-3 text-sm font-bold text-red-600">Nenhuma foto foi encontrada automaticamente nesse link.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={saveCampaign} className="premium-card p-5">
              <h2 className="text-2xl font-black text-zinc-950">Configuração da Landing</h2>

              <div className="mt-5 grid gap-3">
                <input className="premium-input" placeholder="Nome da campanha" value={campaign.name || ''} onChange={(e) => setCampaign({ ...campaign, name: e.target.value, slug: slugify(e.target.value) })} />
                <input className="premium-input" placeholder="Slug do link público" value={campaign.slug || ''} onChange={(e) => setCampaign({ ...campaign, slug: slugify(e.target.value) })} />
                <input className="premium-input" placeholder="Título da landing" value={campaign.title || ''} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} />
                <textarea className="premium-input min-h-28" placeholder="Descrição" value={campaign.description || ''} onChange={(e) => setCampaign({ ...campaign, description: e.target.value })} />
                <input className="premium-input" placeholder="Taxa referencial. Ex: 1.89" value={campaign.interest_rate || ''} onChange={(e) => setCampaign({ ...campaign, interest_rate: e.target.value })} />
                <input className="premium-input" placeholder="WhatsApp com DDI. Ex: 5561999999999" value={campaign.whatsapp_number || ''} onChange={(e) => setCampaign({ ...campaign, whatsapp_number: e.target.value })} />

                <label className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm font-bold text-zinc-600">
                  <input type="checkbox" checked={Boolean(campaign.is_active)} onChange={(e) => setCampaign({ ...campaign, is_active: e.target.checked })} />
                  Landing ativa
                </label>

                <button className="premium-button-primary w-full" type="submit">Salvar campanha</button>
              </div>
            </form>

            <form onSubmit={saveVehicle} className="premium-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-zinc-950">Estoque da Landing</h2>
                  <p className="mt-1 text-sm text-zinc-500">Confira ou edite os carros antes de publicar no simulador.</p>
                </div>
                <button className="premium-button-secondary" type="button" onClick={() => {
                  setVehicleForm(emptyVehicle);
                  setSelectedSubmissionId('');
                  setImportPreview(null);
                  setSelectedImportImages([]);
                }}><Plus size={18} /> Novo</button>
              </div>

              {selectedSubmissionId ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
                  Você está editando um veículo enviado por uma loja. Ao salvar, ele será marcado como publicado.
                </div>
              ) : null}

              <datalist id="vehicle-brand-options">
                {vehicleOptions.brand.map((item) => <option key={item} value={item} />)}
              </datalist>
              <datalist id="vehicle-model-options">
                {vehicleOptions.model.map((item) => <option key={item} value={item} />)}
              </datalist>
              <datalist id="vehicle-version-options">
                {vehicleOptions.version.map((item) => <option key={item} value={item} />)}
              </datalist>
              <datalist id="vehicle-transmission-options">
                {vehicleOptions.transmission.map((item) => <option key={item} value={item} />)}
              </datalist>
              <datalist id="vehicle-fuel-options">
                {vehicleOptions.fuel.map((item) => <option key={item} value={item} />)}
              </datalist>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <input className="premium-input" list="vehicle-brand-options" placeholder="Marca" value={vehicleForm.brand} onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })} required />
                <input className="premium-input" list="vehicle-model-options" placeholder="Modelo" value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} required />
                <input className="premium-input" list="vehicle-version-options" placeholder="Versão" value={vehicleForm.version} onChange={(e) => setVehicleForm({ ...vehicleForm, version: e.target.value })} />
                <input className="premium-input" placeholder="Ano" value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
                <input className="premium-input" placeholder="KM" value={vehicleForm.mileage} onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value })} />
                <input className="premium-input" placeholder="Cor" value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} />
                <input className="premium-input" list="vehicle-transmission-options" placeholder="Câmbio" value={vehicleForm.transmission} onChange={(e) => setVehicleForm({ ...vehicleForm, transmission: e.target.value })} />
                <input className="premium-input" list="vehicle-fuel-options" placeholder="Combustível" value={vehicleForm.fuel} onChange={(e) => setVehicleForm({ ...vehicleForm, fuel: e.target.value })} />
                <input className="premium-input" type="number" placeholder="Preço" value={vehicleForm.price} onChange={(e) => setVehicleForm({ ...vehicleForm, price: e.target.value })} required />
                <input className="premium-input" placeholder="Loja responsável" value={vehicleForm.store_name} onChange={(e) => setVehicleForm({ ...vehicleForm, store_name: e.target.value })} />

                <select className="premium-input" value={vehicleForm.status} onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })}>
                  <option value="disponivel">Disponível</option>
                  <option value="vendido">Vendido</option>
                  <option value="oculto">Oculto</option>
                </select>

                <label className="premium-input flex cursor-pointer items-center gap-2">
                  <Upload size={18} />
                  {uploading ? 'Enviando imagem...' : 'Upload da foto'}
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => uploadVehicleImage(e.target.files?.[0])} />
                </label>
              </div>

              {vehicleForm.image_url ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-100">
                  <img src={vehicleForm.image_url} alt="Imagem do veículo" className="h-48 w-full object-cover" />
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm font-bold text-zinc-600">
                  <input type="checkbox" checked={Boolean(vehicleForm.show_on_landing)} onChange={(e) => setVehicleForm({ ...vehicleForm, show_on_landing: e.target.checked })} />
                  Exibir na landing
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm font-bold text-zinc-600">
                  <input type="checkbox" checked={Boolean(vehicleForm.is_featured)} onChange={(e) => setVehicleForm({ ...vehicleForm, is_featured: e.target.checked })} />
                  Destaque
                </label>
              </div>

              <button className="premium-button-primary mt-4 w-full" type="submit">
                {vehicleForm.id ? 'Salvar alterações do veículo' : selectedSubmissionId ? 'Publicar veículo enviado pela loja' : 'Adicionar veículo na landing'}
              </button>
            </form>
          </div>

          <section className="premium-card mt-6 p-5">
            <h2 className="text-2xl font-black text-zinc-950">Veículos cadastrados</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {vehicles.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-3xl border border-zinc-100 bg-zinc-50">
                  {item.image_url ? <img src={item.image_url} alt={item.model} className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center bg-zinc-200 text-sm font-bold text-zinc-500">Sem imagem</div>}

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-black text-zinc-950">{item.brand} {item.model}</h3>
                        <p className="text-sm font-bold text-zinc-500">{item.version} • {item.year}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-500">{item.status}</span>
                    </div>

                    <strong className="mt-3 block text-xl font-black text-red-600">{money(item.price)}</strong>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="premium-button-secondary text-xs" type="button" onClick={() => editVehicle(item)}>Editar</button>
                      <button className="premium-button-secondary text-xs" type="button" onClick={() => toggleVehicle(item, { show_on_landing: !item.show_on_landing })}>
                        <Eye size={14} /> {item.show_on_landing ? 'Ocultar' : 'Exibir'}
                      </button>
                      <button className="premium-button-secondary text-xs" type="button" onClick={() => toggleVehicle(item, { is_featured: !item.is_featured })}>
                        {item.is_featured ? 'Remover destaque' : 'Destacar'}
                      </button>
                      <button className="premium-button-secondary text-xs" type="button" onClick={() => deleteVehicle(item)}>
                        <Trash2 size={14} /> Excluir anúncio
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!vehicles.length ? <p className="text-sm font-bold text-zinc-500">Nenhum veículo cadastrado ainda.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
